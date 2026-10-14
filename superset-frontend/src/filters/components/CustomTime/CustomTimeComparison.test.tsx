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
import {
  render,
  screen,
  fireEvent,
  within,
} from 'spec/helpers/testing-library';
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
  if (!enabled) fireEvent.click(screen.getByText(/展开/));
  setDataMask.mockClear();
  return { ...result, props, setDataMask };
}
function chooseCustom() {
  const details = screen
    .getByRole('group', { name: '对比期间' })
    .querySelector('details')!;
  if (!details.open) fireEvent.click(within(details).getByText('对比期间'));
  fireEvent.change(screen.getByLabelText('对比方式'), {
    target: { value: 'custom' },
  });
}
function startDate(start: string) {
  const picker = within(screen.getByRole('group', { name: '对比开始日期' }));
  fireEvent.change(picker.getByLabelText('快速跳转月份'), {
    target: { value: `${start.substring(0, 7)}-01` },
  });
  fireEvent.click(picker.getByRole('button', { name: start }));
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
  const current = within(screen.getByRole('group', { name: '当前期间' }));
  fireEvent.click(current.getByRole('button', { name: '最近7天' }));
  expect(current.getByRole('button', { name: '最近7天' })).toBeVisible();
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

test('invalid restored start blocks Apply without an editable date input', () => {
  const setDataMask = jest.fn();
  render(
    <CustomTimeFilterPlugin
      formData={{ groupby: ['biz_date'], enableCustomComparison: true }}
      filterState={{
        value: range,
        grain: 'day',
        customComparisonMode: 'custom',
        comparisonStartDate: '2026-02-30',
      }}
      setDataMask={setDataMask}
      width={215}
    />,
  );
  const mask = lastMask(setDataMask);
  expect(mask.filterState.validateStatus).toBe('error');
  expect(
    mask.extraFormData.custom_form_data.custom_period_comparison,
  ).toBeNull();
  expect(
    checkIsApplyDisabled({ f: mask }, { f: { extraFormData: {} } }, []),
  ).toBe(true);
  expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();
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
  expect(
    within(screen.getByRole('group', { name: '对比开始日期' })).getByRole(
      'button',
      { name: '2026-08-05' },
    ),
  ).toHaveAttribute('aria-pressed', 'true');
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

test('current period is expanded and comparison is collapsed by default', () => {
  mount();
  const current = screen.getByRole('group', { name: '当前期间' });
  const comparison = screen.getByRole('group', { name: '对比期间' });
  expect(current.querySelector('details')).toHaveAttribute('open');
  expect(comparison.querySelector('details')).not.toHaveAttribute('open');
  expect(
    within(current).getByRole('button', { name: '最近7天' }),
  ).toBeVisible();
});

test('comparison reuses all calendar grains without changing current range or query grain', () => {
  const { setDataMask } = mount(true, '2026-09-01 : 2026-09-08');
  chooseCustom();
  startDate('2026-08-05');
  const before = lastMask(setDataMask);
  const picker = within(screen.getByRole('group', { name: '对比开始日期' }));
  for (const grain of ['按周', '按月', '按季', '按年', '按财年', '按天']) {
    fireEvent.click(picker.getByRole('button', { name: grain }));
    expect(lastMask(setDataMask)).toEqual(before);
  }
  startDate('2026-08-28');
  const mask = lastMask(setDataMask);
  expect(mask.filterState.value).toBe('2026-09-01 : 2026-09-08');
  expect(mask.filterState.grain).toBe('day');
  expect(mask.extraFormData.time_grain_sqla).toBe('P1D');
  expect(
    mask.extraFormData.custom_form_data.custom_period_comparison,
  ).toMatchObject({ comparisonTimeRange: '2026-08-28 : 2026-09-04' });
  expect(picker.queryByText('点选区间')).not.toBeInTheDocument();
  expect(picker.queryByText('当前期间')).not.toBeInTheDocument();
  expect(picker.queryByText('对比方式')).not.toBeInTheDocument();
});

test.each([
  ['按周', '2026-08-05', '2026-08-02', '2026-08-09'],
  ['按月', '2026-08', '2026-08-01', '2026-08-08'],
  ['按季', '2026 Q1 (4-6月)', '2026-04-01', '2026-04-08'],
  ['按年', '2026年', '2026-01-01', '2026-01-08'],
  ['按财年', '2026财年', '2026-04-01', '2026-04-08'],
])(
  'comparison %s grid sets only the clicked unit start',
  (grain, cell, start, end) => {
    const { setDataMask } = mount(true, '2026-09-01 : 2026-09-08');
    chooseCustom();
    startDate('2026-08-05');
    const picker = within(screen.getByRole('group', { name: '对比开始日期' }));
    fireEvent.click(picker.getByRole('button', { name: grain }));
    fireEvent.click(picker.getByRole('button', { name: cell }));
    expect(
      lastMask(setDataMask).extraFormData.custom_form_data
        .custom_period_comparison,
    ).toMatchObject({
      currentTimeRange: '2026-09-01 : 2026-09-08',
      comparisonTimeRange: `${start} : ${end}`,
    });
    expect(lastMask(setDataMask).filterState.grain).toBe('day');
    expect(picker.getByRole('button', { name: cell })).toBeInTheDocument();
  },
);

test('comparison shortcuts preserve current period and derive its duration', () => {
  const { setDataMask } = mount(true, '2026-09-01 : 2026-09-10');
  chooseCustom();
  const picker = within(screen.getByRole('group', { name: '对比开始日期' }));
  for (const preset of ['最近7天', '最近30天', '最近90天', '本月', '本年']) {
    fireEvent.click(picker.getByRole('button', { name: preset }));
    const mask = lastMask(setDataMask);
    const period = mask.extraFormData.custom_form_data.custom_period_comparison;
    expect(mask.filterState.value).toBe('2026-09-01 : 2026-09-10');
    expect(mask.filterState.grain).toBe('day');
    const [start, end] = period.comparisonTimeRange.split(' : ');
    expect((Date.parse(end) - Date.parse(start)) / 86400000).toBe(9);
  }
});
