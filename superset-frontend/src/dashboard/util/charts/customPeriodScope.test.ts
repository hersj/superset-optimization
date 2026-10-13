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
import getFormDataWithExtraFilters from './getFormDataWithExtraFilters';
import { getCustomPeriodComparison } from '@superset-ui/core';
const period = {
  currentTimeRange: '2026-10-01 : 2026-10-14',
  comparisonTimeRange: '2026-08-05 : 2026-08-18',
  timeColumn: 'biz_date',
};
function form(id: number, extraControls = {}) {
  const args = {
    chart: {
      id,
      form_data: {
        datasource: '1__table',
        viz_type: 'table',
        time_compare: ['1 month ago'],
      },
    },
    filters: {},
    nativeFilters: {},
    chartConfiguration: {},
    sliceId: id,
    dataMask: {
      f: {
        extraFormData: {
          time_range: period.currentTimeRange,
          custom_form_data: { custom_period_comparison: period },
        },
      },
    },
    extraControls,
    labelsColor: {},
    labelsColorMap: {},
    sharedLabelsColors: [],
    allSliceIds: [99001, 99002],
    activeFilters: { f: { scope: [99001] } },
  };
  return getFormDataWithExtraFilters(
    args as Parameters<typeof getFormDataWithExtraFilters>[0],
  );
}
test('custom period metadata travels through native filter scope only to selected charts', () => {
  const selected = form(99001);
  const excluded = form(99002);
  expect(getCustomPeriodComparison(selected)).toEqual(period);
  expect(getCustomPeriodComparison(excluded)).toBeUndefined();
  expect(excluded.time_compare).toEqual(['1 month ago']);
  expect(excluded.extra_form_data?.time_range).toBeUndefined();
});
test('explicit dashboard comparison OFF remains higher priority than custom period filter', () => {
  const selected = form(99001, { time_compare: [] });
  expect(selected.time_compare).toEqual([]);
  expect(getCustomPeriodComparison(selected)).toBeUndefined();
  expect(selected.extra_form_data?.time_range).toBe(period.currentTimeRange);
});
