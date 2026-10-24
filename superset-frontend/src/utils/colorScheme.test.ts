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
  CategoricalColorNamespace,
  CategoricalScheme,
  ChartDataResponseResult,
  DataRecord,
  FeatureFlag,
  getCategoricalSchemeRegistry,
  getLabelsColorMap,
  LabelsColorMapSource,
} from '@superset-ui/core';
import type { BarSeriesOption, LineSeriesOption } from 'echarts';
import { EchartsTimeseriesSeriesType } from '../../plugins/plugin-chart-echarts/src';
import transformMixed from '../../plugins/plugin-chart-echarts/src/MixedTimeseries/transformProps';
import {
  DEFAULT_FORM_DATA,
  EchartsMixedTimeseriesFormData,
  EchartsMixedTimeseriesProps,
} from '../../plugins/plugin-chart-echarts/src/MixedTimeseries/types';
import { createEchartsTimeseriesTestChartProps } from '../../plugins/plugin-chart-echarts/test/helpers';
import { applyColors, resetColors } from './colorScheme';

const palette = ['#1FA8C9', '#454E7C', '#5AC189'];
const scheme = 'sharedColorRegression';
const metadata = {
  color_scheme: scheme,
  label_colors: {},
  map_label_colors: {},
};

function query(data: DataRecord[]): ChartDataResponseResult {
  return {
    annotation_data: null,
    cache_key: null,
    cache_timeout: null,
    cached_dttm: null,
    queried_dttm: null,
    data,
    colnames: [],
    coltypes: [],
    error: null,
    is_cached: false,
    query: '',
    rowcount: data.length,
    sql_rowcount: data.length,
    stacktrace: null,
    status: 'success',
    from_dttm: null,
    to_dttm: null,
    label_map: Object.fromEntries(
      Object.keys(data[0]).map(key => [key, [key]]),
    ),
  };
}

function mixedColors() {
  const props = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    defaultFormData: DEFAULT_FORM_DATA,
    defaultVizType: 'mixed_timeseries',
    formData: {
      sliceId: 796,
      colorScheme: scheme,
      x_axis: 'ds',
      metrics: ['商品销售额', '毛利润'],
      metricsB: ['毛利率'],
      groupby: [],
      groupbyB: [],
      seriesType: EchartsTimeseriesSeriesType.Bar,
      seriesTypeB: EchartsTimeseriesSeriesType.Line,
    },
    queriesData: [
      query([{ ds: 599616000000, 商品销售额: 100, 毛利润: 25 }]),
      query([{ ds: 599616000000, 毛利率: 0.25 }]),
    ],
  });
  return Object.fromEntries(
    (
      transformMixed(props).echartOptions.series as (
        | BarSeriesOption
        | LineSeriesOption
      )[]
    ).map(item => [String(item.name), item.itemStyle?.color]),
  );
}

beforeEach(() => {
  window.featureFlags = { [FeatureFlag.AvoidColorsCollision]: true };
  resetColors();
  getLabelsColorMap().source = LabelsColorMapSource.Dashboard;
  getCategoricalSchemeRegistry().registerValue(
    scheme,
    new CategoricalScheme({ id: scheme, colors: palette }),
  );
});

afterEach(() => {
  resetColors();
  getLabelsColorMap().source = LabelsColorMapSource.Dashboard;
  getCategoricalSchemeRegistry().remove(scheme);
  window.featureFlags = {};
});

test.each([
  { source: LabelsColorMapSource.Dashboard, reverse: false },
  { source: LabelsColorMapSource.Dashboard, reverse: true },
  { source: LabelsColorMapSource.Explore, reverse: false },
  { source: LabelsColorMapSource.Explore, reverse: true },
])(
  'shared merge keeps current indicators distinct in $source, reverse=$reverse',
  ({ source, reverse }) => {
    getLabelsColorMap().source = source;
    const labels = reverse
      ? ['毛利润', '商品销售额']
      : ['商品销售额', '毛利润'];
    labels.forEach((label, index) => {
      const scale = CategoricalColorNamespace.getScale(scheme);
      expect(scale.getColor(label, 800 + index)).toBe(palette[0]);
    });

    applyColors(metadata, false, true);
    const first = mixedColors();
    expect(new Set(Object.values(first)).size).toBe(3);

    applyColors(metadata, false, true);
    expect(mixedColors()).toEqual(first);
  },
);

test('stored automatic colors can be repaired without changing explicit colors', () => {
  applyColors({
    ...metadata,
    map_label_colors: { 商品销售额: palette[0], 毛利润: palette[0] },
    label_colors: { 毛利润: palette[0] },
  });
  const colors = mixedColors();
  expect(colors.毛利润).toBe(palette[0]);
  expect(new Set(Object.values(colors)).size).toBe(3);
});

test('deliberate same-color overrides retain priority over automatic colors', () => {
  applyColors({
    ...metadata,
    label_colors: { 商品销售额: palette[0], 毛利润: palette[0] },
  });
  const colors = mixedColors();
  expect(colors.商品销售额).toBe(palette[0]);
  expect(colors.毛利润).toBe(palette[0]);
  expect(colors.毛利率).not.toBe(palette[0]);
});
