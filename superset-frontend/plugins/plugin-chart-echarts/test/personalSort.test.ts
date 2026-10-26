/**
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
/** Personal ranking must survive renderer defaults without changing series identity. */
import type { EChartsCoreOption } from 'echarts/core';
import type { SeriesOption } from 'echarts';
import { ChartProps, ChartDataResponseResult, DataRecord, GenericDataType } from '@superset-ui/core';
import { supersetTheme } from '@apache-superset/core/theme';
import timeseries from '../src/Timeseries/transformProps';
import { getPersonalSeriesOrder } from '../src/utils/personalSort';
import mixed from '../src/MixedTimeseries/transformProps';
import funnel from '../src/Funnel/transformProps';
import pie from '../src/Pie/transformProps';
import { DEFAULT_FORM_DATA } from '../src/Timeseries/constants';
import { DEFAULT_FORM_DATA as MIXED_DEFAULTS } from '../src/MixedTimeseries/types';
import { createEchartsTimeseriesTestChartProps } from './helpers';
import type { EchartsTimeseriesChartProps, EchartsTimeseriesFormData } from '../src/Timeseries/types';
import type { EchartsMixedTimeseriesProps, EchartsMixedTimeseriesFormData } from '../src/MixedTimeseries/types';
import type { EchartsFunnelChartProps } from '../src/Funnel/types';
import type { EchartsPieChartProps } from '../src/Pie/types';

function query(data: DataRecord[], temporal = false): ChartDataResponseResult {
  const names = Object.keys(data[0] ?? {});
  return {
    data, colnames: names,
    coltypes: names.map(name => name === 'category'
      ? temporal ? GenericDataType.Temporal : GenericDataType.String
      : GenericDataType.Numeric),
    label_map: Object.fromEntries(names.map(name => [name, [name]])),
    annotation_data: null, cache_key: null, cache_timeout: null, cached_dttm: null,
    queried_dttm: null, error: null, is_cached: false, query: '', rowcount: data.length,
    sql_rowcount: data.length, stacktrace: null, status: 'success', from_dttm: null, to_dttm: null,
  } as ChartDataResponseResult;
}

const personalSort = { mode: 'metric', field: 'sales', direction: 'desc' };
function standard(form: Record<string, unknown> = {}, data: DataRecord[] = [
  { category: 'B', sales: 100, profit: 1, 'sales, 1 day ago': 1 },
  { category: 'A', sales: 20, profit: 10, 'sales, 1 day ago': 1000 },
], temporal = false) {
  return createEchartsTimeseriesTestChartProps<EchartsTimeseriesFormData, EchartsTimeseriesChartProps>({
    defaultFormData: DEFAULT_FORM_DATA, defaultVizType: 'echarts_timeseries_bar',
    formData: { x_axis: 'category', metrics: ['sales', 'profit'], seriesType: 'bar',
      orientation: 'vertical', stack: false, personal_sort: personalSort,
      xAxisSort: 'sum', xAxisSortAsc: false, time_compare: ['1 day ago'], ...form },
    queriesData: [query(data, temporal)],
  });
}
function seriesData(options: EChartsCoreOption, name: string) {
  return (options.series as SeriesOption[]).find(entry => entry.name === name)?.data;
}

test('personal category ranking survives legacy sum of history, other metrics and hidden legend state', () => {
  const input = standard();
  const before = JSON.stringify(input.queriesData);
  const result = timeseries(input);
  expect(seriesData(result.echartOptions, 'sales')).toEqual([['B', 100], ['A', 20]]);
  expect(seriesData(result.echartOptions, 'sales, 1 day ago')).toEqual([['B', 1], ['A', 1000]]);
  expect(result.echartOptions.xAxis).toEqual(expect.objectContaining({ data: ['B', 'A'] }));
  expect(JSON.stringify(input.queriesData)).toBe(before);
});

test('without personal sorting legacy sort remains compatible', () => {
  const result = timeseries(standard({ personal_sort: undefined }));
  expect(seriesData(result.echartOptions, 'sales')).toEqual([['A', 20], ['B', 100]]);
});

test('personal sort never makes a temporal line travel backwards in time', () => {
  const result = timeseries(standard({ seriesType: 'line', viz_type: 'echarts_timeseries_line', time_compare: [] }, [
    { category: 1609545600000, sales: 100, profit: 1 },
    { category: 1609459200000, sales: 20, profit: 10 },
  ], true));
  expect(seriesData(result.echartOptions, 'sales')).toEqual([[1609459200000, 20], [1609545600000, 100]]);
});

test('Mixed query B owns one shared categorical order for both queries and histories', () => {
  const input = createEchartsTimeseriesTestChartProps<EchartsMixedTimeseriesFormData, EchartsMixedTimeseriesProps>({
    defaultFormData: MIXED_DEFAULTS, defaultVizType: 'mixed_timeseries',
    formData: { x_axis: 'category', metrics: ['sales'], metricsB: ['profit'], metrics_b: ['profit'],
      seriesType: 'bar', seriesTypeB: 'line', groupby: [], groupbyB: [],
      personal_sort: { ...personalSort, field: 'B:profit' } },
    queriesData: [query([{ category: 'A', sales: 100 }, { category: 'B', sales: 20 }]),
      query([{ category: 'B', profit: 30 }, { category: 'A', profit: 5 }])],
  });
  const output = mixed(input);
  expect(output.echartOptions.xAxis).toEqual(expect.objectContaining({ data: ['B', 'A'] }));
  expect(seriesData(output.echartOptions, 'sales')).toEqual([['B', 20], ['A', 100]]);
  expect(seriesData(output.echartOptions, 'profit')).toEqual([['B', 30], ['A', 5]]);
});

test('personal funnel sorting disables renderer and legend reordering', () => {
  const input = new ChartProps({ width: 600, height: 300, theme: supersetTheme,
    formData: { datasource: '3__table', groupby: ['category'], metric: 'sales',
      sort: 'descending', legendSort: 'asc',
      personal_sort: { mode: 'custom', field: 'category', direction: 'asc', customOrder: ['B', 'A'] } },
    queriesData: [query([{ category: 'B', sales: 10 }, { category: 'A', sales: 100 }])],
  });
  const output = funnel(input as EchartsFunnelChartProps).echartOptions;
  expect((output.series as { sort: string }[])[0].sort).toBe('none');
  expect(output.legend).toEqual(expect.objectContaining({ data: ['B', 'A'] }));
});

test('personal pie ranking and its legend follow the same query order', () => {
  const input = new ChartProps({ width: 600, height: 300, theme: supersetTheme,
    formData: { datasource: '3__table', groupby: ['category'], metric: 'sales',
      legendSort: 'asc', personal_sort: personalSort },
    queriesData: [query([{ category: 'B', sales: 100 }, { category: 'A', sales: 20 }])],
  });
  const output = pie(input as EchartsPieChartProps).echartOptions;
  expect(output.legend).toEqual(expect.objectContaining({ data: ['B', 'A'] }));
});


test('authoritative current-period metadata wins over row order and unrelated metrics', () => {
  const input = standard({}, [
    { category: 'B', sales: 100, profit: 1 },
    { category: 'A', sales: 20, profit: 10 },
  ]);
  input.queriesData[0].personal_sort_order = { columns: ['category'], values: [['A'], ['B']] };
  const output = timeseries(input).echartOptions;
  expect(seriesData(output, 'sales')).toEqual([['A', 20], ['B', 100]]);
  expect(output.xAxis).toEqual(expect.objectContaining({ data: ['A', 'B'] }));
});


test('full original dimension tuples keep distinct SKU groups and current/history share their rank', () => {
  const response = query([]);
  response.personal_sort_order = { columns: ['shop', 'sku'], values: [['B', 'SKU'], ['A', 'SKU']] };
  const order = getPersonalSeriesOrder([response], {
    currentA: ['sales', 'A', 'SKU'], historyA: ['1 day ago', 'sales', 'A', 'SKU'],
    currentB: ['sales', 'B', 'SKU'], historyB: ['1 day ago', 'sales', 'B', 'SKU'],
  }, ['shop', 'sku']);
  expect(order?.('currentB')).toBe(0);
  expect(order?.('historyB')).toBe(0);
  expect(order?.('currentA')).toBe(1);
  expect(order?.('historyA')).toBe(1);
});
