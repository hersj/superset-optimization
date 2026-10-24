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
function mount(enabled = true, currentRange = range, grain = 'day') {
  const setDataMask = jest.fn();
  const props = {
    formData: {
      groupby: ['biz_date'],
      defaultGrain: grain,
      enableCustomComparison: enabled,
    },
    filterState: { value: currentRange, grain },
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
function endDate(end: string) {
  fireEvent.click(screen.getByRole('button', { name: '修改对比结束日期' }));
  const picker = within(screen.getByRole('group', { name: '对比结束日期' }));
  fireEvent.change(picker.getByLabelText('快速跳转月份'), {
    target: { value: `${end.substring(0, 7)}-01` },
  });
  fireEvent.click(picker.getByRole('button', { name: end }));
}
function lastMask(mock: jest.Mock) {
  return mock.mock.calls[mock.mock.calls.length - 1][0];
}

test('existing CustomTime hides the opt-in comparison controls by default', () => {
  mount(false);
  expect(screen.queryByLabelText('对比方式')).not.toBeInTheDocument();
});

test('current period precedes comparison with concise controls', () => {
  mount();
  const current = screen.getByRole('group', { name: '当前期间' });
  const comparison = screen.getByRole('group', { name: '对比期间' });
  expect(current.compareDocumentPosition(comparison) & 4).toBeTruthy();
  expect(current).toHaveTextContent('2026-10-01 ～ 2026-10-13');
  expect(within(comparison).getByLabelText('对比方式')).toHaveValue('original');
  expect(comparison).not.toHaveTextContent('请打开看板');
});

test('custom comparison derives an end until the user edits it', () => {
  const { setDataMask } = mount();
  chooseCustom();
  expect(lastMask(setDataMask).filterState.validateStatus).toBe('error');
  expect(lastMask(setDataMask).extraFormData.time_compare).toEqual([]);
  expect(screen.queryByLabelText('对比结束日期')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: '修改对比结束日期' }),
  ).toHaveTextContent('自动');
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

test('a longer manual comparison keeps its real bounds without extending the current query', () => {
  const { setDataMask } = mount(true, '2026-09-01 : 2026-09-08');
  chooseCustom();
  startDate('2025-09-01');
  endDate('2025-09-30');
  const mask = lastMask(setDataMask);
  expect(mask.extraFormData.time_range).toBe('2026-09-01 : 2026-09-08');
  expect(mask.extraFormData.custom_form_data.custom_period_comparison).toEqual({
    currentTimeRange: '2026-09-01 : 2026-09-08',
    comparisonTimeRange: '2025-09-01 : 2025-10-01',
    timeColumn: 'biz_date',
    comparisonEndMode: 'manual',
  });
  expect(mask.filterState).toMatchObject({
    comparisonEndMode: 'manual',
    comparisonEndDate: '2025-09-30',
  });
  expect(mask.ownState.comparisonEndMode).toBe('manual');
  expect(screen.getByRole('status')).toHaveTextContent('（30天） · 当前7天');
});

test('choosing the same calculated end still makes the manual intent applicable', () => {
  const { setDataMask } = mount(true, '2026-09-01 : 2026-09-08');
  chooseCustom();
  startDate('2025-09-01');
  const automatic = lastMask(setDataMask);
  endDate('2025-09-07');
  const manual = lastMask(setDataMask);
  expect(
    manual.extraFormData.custom_form_data.custom_period_comparison
      .comparisonTimeRange,
  ).toBe(
    automatic.extraFormData.custom_form_data.custom_period_comparison
      .comparisonTimeRange,
  );
  expect(checkIsApplyDisabled({ f: manual }, { f: automatic }, [])).toBe(false);
});

test('manual comparison survives current-period edits and can resume automatic following', () => {
  const { setDataMask } = mount();
  chooseCustom();
  startDate('2025-09-01');
  endDate('2025-09-30');
  const current = within(screen.getByRole('group', { name: '当前期间' }));
  fireEvent.click(current.getByRole('button', { name: '最近7天' }));
  expect(lastMask(setDataMask).filterState).toMatchObject({
    comparisonEndMode: 'manual',
    comparisonStartDate: '2025-09-01',
    comparisonEndDate: '2025-09-30',
  });
  fireEvent.click(screen.getByRole('button', { name: '恢复跟随当前期间' }));
  expect(lastMask(setDataMask).filterState).toMatchObject({
    comparisonEndMode: 'auto',
    comparisonEndDate: '2025-09-07',
  });
});

test('a restored manual end is retained when current dates are restored externally', () => {
  const setDataMask = jest.fn();
  const filterState = {
    value: '2026-09-01 : 2026-09-08',
    grain: 'day',
    customComparisonMode: 'custom',
    comparisonStartDate: '2025-09-01',
    comparisonEndDate: '2025-09-30',
    comparisonEndMode: 'manual',
  };
  const props = {
    formData: { groupby: ['biz_date'], enableCustomComparison: true },
    ownState: {},
    setDataMask,
    width: 215,
  };
  const { rerender } = render(
    <CustomTimeFilterPlugin {...props} filterState={filterState} />,
  );
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison,
  ).toMatchObject({ comparisonTimeRange: '2025-09-01 : 2025-10-01' });
  rerender(
    <CustomTimeFilterPlugin
      {...props}
      filterState={{ ...filterState, value: '2026-09-01 : 2026-09-16' }}
    />,
  );
  expect(lastMask(setDataMask).filterState.comparisonEndDate).toBe(
    '2025-09-30',
  );
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison,
  ).toMatchObject({
    currentTimeRange: '2026-09-01 : 2026-09-16',
    comparisonTimeRange: '2025-09-01 : 2025-10-01',
  });
});

test('a manual end before the start blocks applying rather than silently rewriting the range', () => {
  const { setDataMask } = mount();
  chooseCustom();
  startDate('2025-09-05');
  endDate('2025-09-01');
  expect(lastMask(setDataMask).filterState.validateStatus).toBe('error');
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison,
  ).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(
    '对比结束日期不能早于开始日期',
  );
});

test('month buttons choose the actual last day for a manual comparison end', () => {
  const { setDataMask } = mount(true, '2026-07-01 : 2026-10-01', 'month');
  chooseCustom();
  startDate('2025-04-01');
  fireEvent.click(screen.getByRole('button', { name: '修改对比结束日期' }));
  const picker = within(screen.getByRole('group', { name: '对比结束日期' }));
  fireEvent.click(picker.getByRole('button', { name: '按月' }));
  fireEvent.click(picker.getByRole('button', { name: '< 2025年' }));
  fireEvent.click(picker.getByRole('button', { name: '2025-08' }));
  expect(lastMask(setDataMask).filterState.comparisonEndDate).toBe(
    '2025-08-31',
  );
  expect(lastMask(setDataMask).filterState.grain).toBe('month');
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
    expect(picker.queryByText(/继续单击第二个/)).not.toBeInTheDocument();
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

test('fiscal comparison explains start-only selection while current retains range selection', () => {
  mount();
  chooseCustom();
  const picker = within(screen.getByRole('group', { name: '对比开始日期' }));
  fireEvent.click(picker.getByRole('button', { name: '按财年' }));
  expect(picker.getByText('选择开始财年。')).toBeInTheDocument();
  const current = within(screen.getByRole('group', { name: '当前期间' }));
  fireEvent.click(current.getByRole('button', { name: '按财年' }));
  expect(
    current.getByText(/继续单击第二个财年选择连续区间/),
  ).toBeInTheDocument();
});

test.each([
  ['month', '2026-07-01 : 2026-10-01', '2026-04-01', '2026-07-01'],
  ['quarter', '2026-07-01 : 2026-10-01', '2026-04-01', '2026-07-01'],
  ['month', '2025-11-01 : 2026-02-01', '2024-12-01', '2025-03-01'],
  ['year', '2026-01-01 : 2027-01-01', '2024-01-01', '2025-01-01'],
  ['year', '2024-01-01 : 2025-01-01', '2025-01-01', '2026-01-01'],
  ['fiscal_year', '2026-04-01 : 2027-03-31', '2023-04-01', '2024-03-31'],
  ['fiscal_year', '2024-04-01 : 2026-03-31', '2022-04-01', '2024-03-31'],
  ['fiscal_year', '2026-04-01 : 2027-03-31', '2023-05-15', '2024-05-14'],
  ['month', '2026-01-31 : 2026-02-28', '2024-01-31', '2024-02-29'],
  ['month', '2024-01-31 : 2024-02-29', '2025-01-31', '2025-02-28'],
  ['month', '2026-01-01 : 2026-01-13', '2025-02-20', '2025-03-04'],
  ['month', '2026-01-01 : 2026-01-31', '2025-02-01', '2025-03-01'],
  ['year', '2026-01-01 : 2026-01-31', '2024-02-01', '2024-03-01'],
  ['year', '2026-01-01 : 2026-01-31', '2025-02-01', '2025-03-01'],
  ['year', '2024-01-01 : 2024-02-29', '2025-01-01', '2025-03-01'],
  ['year', '2025-01-01 : 2025-02-28', '2024-01-01', '2024-02-28'],
  ['year', '2026-01-01 : 2026-10-13', '2024-01-01', '2024-10-13'],
  ['quarter', '2026-07-01 : 2026-09-13', '2024-04-01', '2024-06-13'],
  ['fiscal_year', '2026-04-01 : 2026-10-13', '2024-04-01', '2024-10-13'],
  ['day', '2026-07-01 : 2026-10-01', '2026-04-01', '2026-07-02'],
  ['week', '2026-08-02 : 2026-08-16', '2026-07-05', '2026-07-19'],
])(
  'A %s %s derives calendar end from B %s',
  (grain, currentRange, start, end) => {
    const { setDataMask } = mount(true, currentRange, grain);
    chooseCustom();
    startDate(start);
    const mask = lastMask(setDataMask);
    expect(
      mask.extraFormData.custom_form_data.custom_period_comparison,
    ).toEqual({
      currentTimeRange: currentRange,
      comparisonTimeRange: `${start} : ${end}`,
      timeColumn: 'biz_date',
    });
    expect(mask.filterState.value).toBe(currentRange);
    expect(mask.filterState.grain).toBe(grain);
    const [aStart, aEnd] = currentRange.split(' : ');
    const aDays = (Date.parse(aEnd) - Date.parse(aStart)) / 86400000;
    const bDays = (Date.parse(end) - Date.parse(start)) / 86400000;
    expect(screen.getByRole('status')).toHaveTextContent(`（${bDays}天）`);
    expect(screen.getByRole('status')).toHaveTextContent(`当前${aDays}天`);
  },
);

test('A month calendar rule ignores B navigation grain and uses newly applied A grain', () => {
  const { setDataMask } = mount(true, '2026-07-01 : 2026-10-01', 'month');
  chooseCustom();
  startDate('2026-04-01');
  const picker = within(screen.getByRole('group', { name: '对比开始日期' }));
  fireEvent.click(picker.getByRole('button', { name: '按财年' }));
  fireEvent.click(picker.getByRole('button', { name: '2026财年' }));
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison.comparisonTimeRange,
  ).toBe('2026-04-01 : 2026-07-01');
  expect(lastMask(setDataMask).filterState.grain).toBe('month');
  expect(
    screen.getByRole('button', { name: '修改对比结束日期' }),
  ).toHaveTextContent('2026-06-30 · 自动');
  const current = within(screen.getByRole('group', { name: '当前期间' }));
  fireEvent.click(current.getByRole('button', { name: '按天' }));
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison.comparisonTimeRange,
  ).toBe('2026-04-01 : 2026-07-02');
  expect(
    screen.getByRole('button', { name: '修改对比结束日期' }),
  ).toHaveTextContent('自动');
});

test('calendar restore ignores an old equal-days end and tracks external A period changes', () => {
  const setDataMask = jest.fn();
  const formData = { groupby: ['biz_date'], enableCustomComparison: true };
  const custom = {
    customComparisonMode: 'custom',
    comparisonStartDate: '2026-04-01',
    comparisonEndDate: '2026-07-01',
  };
  const { rerender } = render(
    <CustomTimeFilterPlugin
      formData={formData}
      filterState={{
        value: '2026-07-01 : 2026-10-01',
        grain: 'quarter',
        ...custom,
      }}
      setDataMask={setDataMask}
      width={215}
    />,
  );
  expect(lastMask(setDataMask).filterState.comparisonEndDate).toBe(
    '2026-06-30',
  );
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison.comparisonTimeRange,
  ).toBe('2026-04-01 : 2026-07-01');
  rerender(
    <CustomTimeFilterPlugin
      formData={formData}
      filterState={{
        value: '2026-07-01 : 2027-01-01',
        grain: 'month',
        ...custom,
      }}
      setDataMask={setDataMask}
      width={215}
    />,
  );
  expect(lastMask(setDataMask).filterState.comparisonEndDate).toBe(
    '2026-09-30',
  );
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison.comparisonTimeRange,
  ).toBe('2026-04-01 : 2026-10-01');
  expect(screen.getByRole('status')).toHaveTextContent(
    '2026-04-01 ～ 2026-09-30',
  );
});

test('restored calendar grain wins over stale ownState and matches the published range', () => {
  const setDataMask = jest.fn();
  render(
    <CustomTimeFilterPlugin
      formData={{ groupby: ['biz_date'], enableCustomComparison: true }}
      filterState={{
        value: '2026-07-01 : 2026-10-01',
        grain: 'month',
        customComparisonMode: 'custom',
        comparisonStartDate: '2026-04-01',
      }}
      ownState={{ activeGrain: 'day' }}
      setDataMask={setDataMask}
      width={215}
    />,
  );
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison.comparisonTimeRange,
  ).toBe('2026-04-01 : 2026-07-01');
  expect(screen.getByRole('status')).toHaveTextContent(
    '2026-04-01 ～ 2026-06-30（91天）',
  );
});
