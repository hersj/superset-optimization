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
import {
  ChartDataResponseResult,
  ChartProps,
  ComparisonType,
  DataRecord,
} from '@superset-ui/core';
import { supersetTheme } from '@apache-superset/core/theme';
import type { SeriesOption } from 'echarts';
import transformProps from '../../src/Timeseries/transformProps';
import { DEFAULT_FORM_DATA } from '../../src/Timeseries/constants';
import {
  EchartsTimeseriesSeriesType,
  OrientationType,
} from '../../src/Timeseries/types';

const data: DataRecord[] = [
  {
    shop_name: 'POT-IT',
    sales: 0,
    '1 day ago': 295.338956,
    '7 days ago': null,
  },
  { shop_name: 'all-zero', sales: 0, '1 day ago': 0, '7 days ago': null },
  { shop_name: 'negative', sales: -4, '1 day ago': 0, '7 days ago': null },
  { shop_name: 'all-null', sales: null, '1 day ago': null, '7 days ago': null },
  {
    shop_name: 'valid-zero-percent',
    sales: 0,
    '1 day ago': null,
    '7 days ago': null,
  },
  {
    shop_name: 'previous-only',
    sales: null,
    '1 day ago': 0.12,
    '7 days ago': null,
  },
  {
    shop_name: 'previous-negative',
    sales: 0,
    '1 day ago': -5,
    '7 days ago': null,
  },
  { shop_name: 'older-only', sales: null, '1 day ago': null, '7 days ago': 8 },
  { shop_name: 203100, sales: 0, '1 day ago': 0, '7 days ago': null },
  { shop_name: 'all-undefined' },
];
const nonzeroShops = [
  'POT-IT',
  'negative',
  'previous-only',
  'previous-negative',
  'older-only',
];
const nonnullShops = [
  ...nonzeroShops,
  'all-zero',
  'valid-zero-percent',
  203100,
];

const cases = [
  {
    hide_zero_rows: true,
    expected: nonzeroShops,
    seriesType: EchartsTimeseriesSeriesType.Bar,
  },
  {
    hide_null_rows: true,
    expected: nonnullShops,
    seriesType: EchartsTimeseriesSeriesType.Bar,
  },
  {
    hide_zero_rows: false,
    hide_null_rows: false,
    expected: data.map(row => row.shop_name),
    seriesType: EchartsTimeseriesSeriesType.Bar,
  },
  {
    expected: data.map(row => row.shop_name),
    seriesType: EchartsTimeseriesSeriesType.Bar,
  },
  {
    hide_zero_rows: true,
    expected: data.map(row => row.shop_name),
    seriesType: EchartsTimeseriesSeriesType.Line,
  },
  {
    hide_null_rows: true,
    expected: data.map(row => row.shop_name),
    seriesType: EchartsTimeseriesSeriesType.Line,
  },
];

test.each(
  cases.flatMap(config =>
    Object.values(OrientationType).map(orientation => ({
      ...config,
      orientation,
    })),
  ),
)('filters merged comparison rows: %j', ({ expected, ...config }) => {
  const chartProps = new ChartProps({
    formData: {
      ...DEFAULT_FORM_DATA,
      ...config,
      viz_type: 'echarts_timeseries_bar',
      datasource: '1__table',
      x_axis: 'shop_name',
      groupby: [],
      metrics: ['sales'],
      time_compare: ['1 day ago', '7 days ago'],
      comparison_type: ComparisonType.Values,
    },
    queriesData: [
      {
        data,
        colnames: ['shop_name', 'sales', '1 day ago', '7 days ago'],
        coltypes: [1, 0, 0, 0],
      },
    ],
    theme: supersetTheme,
  });
  const transformed = transformProps({
    ...chartProps,
    formData: { ...DEFAULT_FORM_DATA, ...chartProps.formData },
    queriesData: chartProps.queriesData as ChartDataResponseResult[],
  });
  const series = transformed.echartOptions.series as SeriesOption[];
  const expectedRows = data.filter(row => expected.includes(row.shop_name));
  for (const name of ['sales', '1 day ago', '7 days ago']) {
    const actual = series.find(entry => entry.name === name)!;
    type Datum = [unknown, unknown] | { value: [unknown, unknown] };
    expect(
      (actual.data as Datum[]).map(datum =>
        Array.isArray(datum) ? datum : datum.value,
      ),
    ).toEqual(
      expectedRows.map(row =>
        config.orientation === OrientationType.Horizontal
          ? [row[name], row.shop_name]
          : [row.shop_name, row[name]],
      ),
    );
  }
  expect(chartProps.queriesData[0].data).toEqual(data);
});

test.each(['sales__1 day ago', 'sales, 1 day ago'])(
  'recognizes comparison field %s and ignores numeric dimensions',
  comparisonKey => {
    const chartProps = new ChartProps({
      formData: {
        ...DEFAULT_FORM_DATA,
        viz_type: 'echarts_timeseries_bar',
        datasource: '1__table',
        seriesType: EchartsTimeseriesSeriesType.Bar,
        x_axis: 'shop_name',
        metrics: ['sales'],
        groupby: [],
        hide_zero_rows: true,
        time_compare: ['1 day ago'],
        comparison_type: ComparisonType.Values,
      },
      queriesData: [
        {
          data: [
            {
              shop_name: 'previous-only',
              sales: 0,
              [comparisonKey]: 9,
              shop_code: 1,
            },
            { shop_name: 'empty', sales: 0, [comparisonKey]: 0, shop_code: 2 },
          ],
        },
      ],
      datasource: { verboseMap: { sales: 'Sales' } },
      theme: supersetTheme,
    });
    const { echartOptions } = transformProps({
      ...chartProps,
      formData: { ...DEFAULT_FORM_DATA, ...chartProps.formData },
      queriesData: chartProps.queriesData as ChartDataResponseResult[],
    });
    expect(echartOptions.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Sales',
          data: [['previous-only', 0]],
        }),
        expect.objectContaining({
          name: comparisonKey,
          data: [['previous-only', 9]],
        }),
      ]),
    );
  },
);

test.each([{ hide_zero_rows: true }, { hide_null_rows: true }])(
  'handles an entirely empty display after filtering: %j',
  flags => {
    const chartProps = new ChartProps({
      formData: {
        ...DEFAULT_FORM_DATA,
        ...flags,
        viz_type: 'echarts_timeseries_bar',
        datasource: '1__table',
        seriesType: EchartsTimeseriesSeriesType.Bar,
        x_axis: 'shop_name',
        metrics: ['sales'],
        groupby: [],
      },
      queriesData: [{ data: [{ shop_name: 'empty', sales: null }] }],
      theme: supersetTheme,
    });
    expect(
      transformProps({
        ...chartProps,
        formData: { ...DEFAULT_FORM_DATA, ...chartProps.formData },
        queriesData: chartProps.queriesData as ChartDataResponseResult[],
      }).echartOptions.series,
    ).toEqual([]);
  },
);

test.each([
  { flags: { hide_zero_rows: true }, expected: ['previous-only'] },
  {
    flags: { hide_null_rows: true },
    expected: ['valid-zero', 'previous-only'],
  },
])(
  'keeps personal category order without restoring hidden rows: %j',
  ({ flags, expected }) => {
    const chartProps = new ChartProps({
      formData: {
        ...DEFAULT_FORM_DATA,
        ...flags,
        viz_type: 'echarts_timeseries_bar',
        datasource: '1__table',
        seriesType: EchartsTimeseriesSeriesType.Bar,
        orientation: OrientationType.Horizontal,
        x_axis: 'shop_name',
        metrics: ['sales'],
        groupby: [],
        time_compare: ['1 day ago'],
        comparison_type: ComparisonType.Values,
        personal_sort: { mode: 'metric', field: 'sales', direction: 'desc' },
      },
      queriesData: [
        {
          data: [
            { shop_name: 'previous-only', sales: 0, '1 day ago': 9 },
            { shop_name: 'valid-zero', sales: 0, '1 day ago': null },
            { shop_name: 'all-null', sales: null, '1 day ago': null },
          ],
          colnames: ['shop_name', 'sales', '1 day ago'],
          coltypes: [1, 0, 0],
          personal_sort_order: {
            columns: ['shop_name'],
            values: [['all-null'], ['valid-zero'], ['previous-only']],
          },
        },
      ],
      theme: supersetTheme,
    });
    const { echartOptions } = transformProps({
      ...chartProps,
      formData: { ...DEFAULT_FORM_DATA, ...chartProps.formData },
      queriesData: chartProps.queriesData as ChartDataResponseResult[],
    });
    expect(echartOptions.yAxis).toEqual(
      expect.objectContaining({ data: expected, inverse: true }),
    );
    for (const series of echartOptions.series as SeriesOption[]) {
      expect(series.data).toHaveLength(expected.length);
    }
  },
);
