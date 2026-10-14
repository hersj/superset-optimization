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
function mount(enabled = true) {
  const setDataMask = jest.fn();
  const props = {
    formData: {
      groupby: ['biz_date'],
      defaultGrain: 'day',
      enableCustomComparison: enabled,
    },
    filterState: { value: range, grain: 'day' },
    ownState: {},
    setDataMask,
    width: 320,
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
function dates(start: string, end: string) {
  fireEvent.change(screen.getByLabelText('对比开始日期'), {
    target: { value: start },
  });
  fireEvent.change(screen.getByLabelText('对比结束日期'), {
    target: { value: end },
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

test('editing the current period keeps its controls open and preserves comparison dates', () => {
  const { setDataMask } = mount();
  chooseCustom();
  dates('2026-08-05', '2026-08-17');
  fireEvent.click(screen.getByText('修改当前期间'));
  fireEvent.click(screen.getByRole('button', { name: '最近7天' }));
  expect(screen.getByRole('button', { name: '最近7天' })).toBeVisible();
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison,
  ).toMatchObject({ comparisonTimeRange: '2026-08-05 : 2026-08-18' });
});

test('custom comparison publishes one scoped draft with inclusive dates and day counts', () => {
  const { setDataMask } = mount();
  chooseCustom();
  expect(lastMask(setDataMask).filterState.validateStatus).toBe('error');
  dates('2026-08-05', '2026-08-17');
  const mask = lastMask(setDataMask);
  expect(mask.extraFormData.custom_form_data.custom_period_comparison).toEqual({
    currentTimeRange: range,
    comparisonTimeRange: '2026-08-05 : 2026-08-18',
    timeColumn: 'biz_date',
  });
  expect(mask.filterState.validateStatus).not.toBe('error');
  expect(screen.getByText(/当前：2026-10-01.*13 天/)).toBeInTheDocument();
  expect(screen.getByText(/按完整期间总量比较/)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '应用对比' }),
  ).not.toBeInTheDocument();
});

test('unequal length is a warning and does not block the draft', () => {
  const { setDataMask } = mount();
  chooseCustom();
  dates('2026-08-01', '2026-08-31');
  expect(lastMask(setDataMask).filterState.validateStatus).not.toBe('error');
  expect(screen.getByText(/期间长度不同/)).toBeInTheDocument();
  expect(screen.getByText(/31 天/)).toBeInTheDocument();
});

test('invalid dates block the native sidebar Apply rather than leaking the previous comparison', () => {
  const { setDataMask } = mount();
  chooseCustom();
  dates('2026-08-17', '2026-08-05');
  const mask = lastMask(setDataMask);
  expect(mask.filterState.validateStatus).toBe('error');
  expect(
    mask.extraFormData.custom_form_data.custom_period_comparison,
  ).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(/起止日期/);
  expect(
    checkIsApplyDisabled({ f: mask }, { f: { extraFormData: {} } }, []),
  ).toBe(true);
});

test('returning to original comparison clears custom metadata and remembers draft dates', () => {
  const { setDataMask } = mount();
  chooseCustom();
  dates('2026-08-05', '2026-08-17');
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
  expect(screen.getByLabelText('对比结束日期')).toHaveValue('2026-08-17');
});

test('saved filter state restores both periods and changing current range keeps custom dates', () => {
  const setDataMask = jest.fn();
  const formData = { groupby: ['biz_date'], enableCustomComparison: true };
  const custom = {
    customComparisonMode: 'custom',
    comparisonStartDate: '2026-08-05',
    comparisonEndDate: '2026-08-17',
  };
  const { rerender } = render(
    <CustomTimeFilterPlugin
      formData={formData}
      filterState={{ value: range, grain: 'month', ...custom }}
      ownState={{}}
      setDataMask={setDataMask}
      width={320}
    />,
  );
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison.comparisonTimeRange,
  ).toBe('2026-08-05 : 2026-08-18');
  rerender(
    <CustomTimeFilterPlugin
      formData={formData}
      filterState={{
        value: '2026-09-01 : 2026-10-01',
        grain: 'month',
        ...custom,
      }}
      ownState={{}}
      setDataMask={setDataMask}
      width={320}
    />,
  );
  expect(
    lastMask(setDataMask).extraFormData.custom_form_data
      .custom_period_comparison,
  ).toMatchObject({
    currentTimeRange: '2026-09-01 : 2026-10-01',
    comparisonTimeRange: '2026-08-05 : 2026-08-18',
  });
});

test('No filter is rejected while custom comparison is active', () => {
  const setDataMask = jest.fn();
  render(
    <CustomTimeFilterPlugin
      formData={{ enableCustomComparison: true }}
      filterState={{
        value: null,
        customComparisonMode: 'custom',
        comparisonStartDate: '2026-08-05',
        comparisonEndDate: '2026-08-17',
      }}
      ownState={{}}
      setDataMask={setDataMask}
      width={320}
    />,
  );
  expect(lastMask(setDataMask).filterState.validateStatus).toBe('error');
});
