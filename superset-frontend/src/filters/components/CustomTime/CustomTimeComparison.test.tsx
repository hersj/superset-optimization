/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { render, screen, fireEvent } from 'spec/helpers/testing-library';
import CustomTimeFilterPlugin from './CustomTimeFilterPlugin';
import { checkIsApplyDisabled } from 'src/dashboard/components/nativeFilters/FilterBar/utils';

const range = '2026-10-01 : 2026-10-14';
function mount(enabled = true, currentRange = range) {
  const setDataMask = jest.fn();
  const props = {
    formData: {
      groupby: ['biz_date'],
      defaultGrain: 'day',
      enableCustomComparison: enabled,
    },
    filterState: { value: currentRange, grain: 'day' },
    ownState: {},
    setDataMask,
    width: 215,
  };
  const result = render(<CustomTimeFilterPlugin {...props} />);
  fireEvent.click(screen.getByText(/展开/));
  setDataMask.mockClear();
  return { ...result, props, setDataMask };
}
function chooseCustom() {
  fireEvent.change(screen.getByLabelText('对比方式'), {
    target: { value: 'custom' },
  });
}
function startDate(start: string) {
  fireEvent.change(screen.getByLabelText('对比开始日期'), {
    target: { value: start },
  });
}
function lastMask(mock: jest.Mock) {
  return mock.mock.calls[mock.mock.calls.length - 1][0];
}

test('existing CustomTime hides the opt-in comparison controls by default', () => {
  mount(false);
  expect(screen.queryByLabelText('对比方式')).not.toBeInTheDocument();
});

test('current period selection precedes comparison and explains the existing chart switch', () => {
  mount();
  const current = screen.getByRole('group', { name: '当前期间' });
  const comparison = screen.getByRole('group', { name: '对比期间' });
  expect(current.compareDocumentPosition(comparison) & 4).toBeTruthy();
  expect(current).toHaveTextContent('2026-10-01 ～ 2026-10-13');
  expect(comparison).toHaveTextContent('右上角');
  expect(comparison).toHaveTextContent('图表原有');
  expect(comparison).toHaveTextContent('大数字');
});

test('custom comparison needs only a start and has no editable end field', () => {
  const { setDataMask } = mount();
  chooseCustom();
  expect(lastMask(setDataMask).filterState.validateStatus).toBe('error');
  expect(screen.queryByLabelText('对比结束日期')).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: '对比期间' })).toHaveTextContent(
    '天数随当前期间',
  );
  startDate('2026-08-05');
  const mask = lastMask(setDataMask);
  expect(mask.extraFormData.custom_form_data.custom_period_comparison).toEqual({
    currentTimeRange: range,
    comparisonTimeRange: '2026-08-05 : 2026-08-18',
    timeColumn: 'biz_date',
  });
  expect(mask.filterState.comparisonEndDate).toBe('2026-08-17');
  expect(mask.filterState.validateStatus).not.toBe('error');
  expect(screen.getByRole('status')).toHaveTextContent(
    '对比：2026-08-05 ～ 2026-08-17（13天）',
  );
  expect(screen.queryByText(/期间长度不同/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '应用对比' }),
  ).not.toBeInTheDocument();
});

test.each([
  ['2026-09-01 : 2026-09-08', '2026-08-05', '2026-08-12', '2026-08-11', 7],
  ['2026-01-01 : 2026-02-01', '2025-12-20', '2026-01-20', '2026-01-19', 31],
  ['2024-02-01 : 2024-03-01', '2025-01-31', '2025-03-01', '2025-02-28', 29],
  ['2026-01-01 : 2027-01-01', '2024-02-20', '2025-02-19', '2025-02-18', 365],
  ['2024-01-01 : 2025-01-01', '2025-01-01', '2026-01-02', '2026-01-01', 366],
] as const)(
  'current %s derives an equal-day comparison across month/year/leap boundaries',
  (currentRange, start, endExclusive, endInclusive, days) => {
    const { setDataMask } = mount(true, currentRange);
    chooseCustom();
    startDate(start);
    const mask = lastMask(setDataMask);
    expect(
      mask.extraFormData.custom_form_data.custom_period_comparison,
    ).toEqual({
      currentTimeRange: currentRange,
      comparisonTimeRange: `${start} : ${endExclusive}`,
      timeColumn: 'biz_date',
    });
    expect(mask.filterState.comparisonEndDate).toBe(endInclusive);
    expect(mask.ownState.comparisonEndDate).toBe(endInclusive);
    expect(screen.getByRole('status')).toHaveTextContent(`（${days}天）`);
  },
);

test('editing current period keeps controls open and automatically recomputes comparison end', () => {
  const { setDataMask } = mount();
  chooseCustom();
  startDate('2026-08-05');
  fireEvent.click(screen.getByText('修改当前期间'));
  fireEvent.click(screen.getByRole('button', { name: '最近7天' }));
  expect(screen.getByRole('button', { name: '最近7天' })).toBeVisible();
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison,
  ).toMatchObject({ comparisonTimeRange: '2026-08-05 : 2026-08-12' });
  expect(lastMask(setDataMask).filterState.comparisonEndDate).toBe(
    '2026-08-11',
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    '对比：2026-08-05 ～ 2026-08-11（7天）',
  );
});

test.each(['2026-08-15', 'not-a-date'])(
  'legacy %s end is ignored and current changes recompute the end',
  legacyEnd => {
    const setDataMask = jest.fn();
    const formData = { groupby: ['biz_date'], enableCustomComparison: true };
    const custom = {
      customComparisonMode: 'custom',
      comparisonStartDate: '2026-08-05',
      comparisonEndDate: legacyEnd,
    };
    const { rerender } = render(
      <CustomTimeFilterPlugin
        formData={formData}
        filterState={{
          value: '2026-09-01 : 2026-09-08',
          grain: 'day',
          ...custom,
        }}
        ownState={{}}
        setDataMask={setDataMask}
        width={215}
      />,
    );
    fireEvent.click(screen.getByText(/展开/));
    expect(
      lastMask(setDataMask).extraFormData.custom_form_data
        .custom_period_comparison,
    ).toMatchObject({ comparisonTimeRange: '2026-08-05 : 2026-08-12' });
    rerender(
      <CustomTimeFilterPlugin
        formData={formData}
        filterState={{
          value: '2026-09-01 : 2026-09-10',
          grain: 'day',
          ...custom,
          comparisonEndDate: '2026-08-31',
        }}
        ownState={{}}
        setDataMask={setDataMask}
        width={215}
      />,
    );
    expect(
      lastMask(setDataMask).extraFormData.custom_form_data
        .custom_period_comparison,
    ).toMatchObject({
      currentTimeRange: '2026-09-01 : 2026-09-10',
      comparisonTimeRange: '2026-08-05 : 2026-08-14',
    });
    expect(lastMask(setDataMask).filterState.comparisonEndDate).toBe(
      '2026-08-13',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '对比：2026-08-05 ～ 2026-08-13（9天）',
    );
  },
);

test('invalid or cleared start blocks Apply and does not leak the previous comparison', () => {
  const { setDataMask } = mount();
  chooseCustom();
  startDate('2026-08-05');
  startDate('2026-02-30');
  const mask = lastMask(setDataMask);
  expect(mask.filterState.validateStatus).toBe('error');
  expect(
    mask.extraFormData.custom_form_data.custom_period_comparison,
  ).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(/开始日期/);
  expect(
    checkIsApplyDisabled({ f: mask }, { f: { extraFormData: {} } }, []),
  ).toBe(true);
});

test('returning to original clears metadata and remembers only the comparison start', () => {
  const { setDataMask } = mount();
  chooseCustom();
  startDate('2026-08-05');
  fireEvent.change(screen.getByLabelText('对比方式'), {
    target: { value: 'original' },
  });
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison,
  ).toBeNull();
  expect(lastMask(setDataMask).extraFormData.time_compare).toBe('1 day ago');
  chooseCustom();
  expect(screen.getByLabelText('对比开始日期')).toHaveValue('2026-08-05');
  expect(screen.getByRole('status')).toHaveTextContent(
    '对比：2026-08-05 ～ 2026-08-17（13天）',
  );
});

test.each([
  { value: null },
  {
    value: '2026-09-01 : 2026-09-08',
    selectionMode: 'points',
    selectedRanges: ['2026-09-01 : 2026-09-02', '2026-09-05 : 2026-09-06'],
  },
])(
  'unbounded or irregular point selection rejects automatic custom comparison: %j',
  selection => {
    const setDataMask = jest.fn();
    render(
      <CustomTimeFilterPlugin
        formData={{ groupby: ['biz_date'], enableCustomComparison: true }}
        filterState={{
          ...selection,
          customComparisonMode: 'custom',
          comparisonStartDate: '2026-08-05',
          comparisonEndDate: '2026-08-17',
        }}
        ownState={{}}
        setDataMask={setDataMask}
        width={215}
      />,
    );
    expect(lastMask(setDataMask).filterState.validateStatus).toBe('error');
    expect(
      lastMask(setDataMask).extraFormData.custom_form_data
        .custom_period_comparison,
    ).toBeNull();
  },
);
