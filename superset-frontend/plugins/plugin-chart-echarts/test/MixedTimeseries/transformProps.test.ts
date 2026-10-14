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
  AnnotationStyle,
  AnnotationType,
  ComparisonType,
  DataRecord,
  FormulaAnnotationLayer,
  VizType,
  ChartDataResponseResult,
  CategoricalColorScale,
  CategoricalColorNamespace,
  CategoricalScheme,
  FeatureFlag,
  getCategoricalSchemeRegistry,
  getLabelsColorMap,
  LabelsColorMapSource,
} from '@superset-ui/core';
import {
  LegendOrientation,
  LegendType,
  EchartsTimeseriesSeriesType,
} from '../../src';
import transformProps from '../../src/MixedTimeseries/transformProps';
import {
  EchartsMixedTimeseriesFormData,
  EchartsMixedTimeseriesProps,
} from '../../src/MixedTimeseries/types';
import { DEFAULT_FORM_DATA } from '../../src/MixedTimeseries/types';
import { createEchartsTimeseriesTestChartProps } from '../helpers';
import type { BarSeriesOption, SeriesOption } from 'echarts';
import { GenericDataType } from '@apache-superset/core/common';

/**
 * Creates a partial ChartDataResponseResult for testing.
 * Only includes the fields needed for tests, with sensible defaults for required fields.
 */
function createTestQueryData(
  data: unknown[],
  overrides?: Partial<ChartDataResponseResult> & {
    label_map?: Record<string, string[]>;
  },
): ChartDataResponseResult {
  return {
    annotation_data: null,
    cache_key: null,
    cache_timeout: null,
    cached_dttm: null,
    queried_dttm: null,
    data: data as DataRecord[],
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
    label_map: {},
    ...overrides,
  } as ChartDataResponseResult & { label_map?: Record<string, string[]> };
}

/** Defaults for createEchartsTimeseriesTestChartProps in Mixed Timeseries tests. */
const MIXED_TIMESERIES_CHART_PROPS_DEFAULTS = {
  defaultFormData: DEFAULT_FORM_DATA,
  defaultVizType: 'mixed_timeseries' as const,
};

const formData: EchartsMixedTimeseriesFormData = {
  annotationLayers: [],
  area: false,
  areaB: false,
  legendMargin: null,
  logAxis: false,
  logAxisSecondary: false,
  markerEnabled: false,
  markerEnabledB: false,
  markerSize: 0,
  markerSizeB: 0,
  minorSplitLine: false,
  minorTicks: false,
  opacity: 0,
  opacityB: 0,
  orderDesc: false,
  orderDescB: false,
  richTooltip: false,
  rowLimit: 0,
  rowLimitB: 0,
  legendOrientation: LegendOrientation.Top,
  legendType: LegendType.Scroll,
  showLegend: false,
  showValue: false,
  showValueB: false,
  stack: true,
  stackB: true,
  truncateYAxis: false,
  truncateYAxisSecondary: false,
  xAxisLabelRotation: 0,
  xAxisTitle: '',
  xAxisTitleMargin: 0,
  yAxisBounds: [undefined, undefined],
  yAxisBoundsSecondary: [undefined, undefined],
  yAxisTitle: '',
  yAxisTitleMargin: 15,
  yAxisTitlePosition: '',
  yAxisTitleSecondary: '',
  zoomable: false,
  colorScheme: 'bnbColors',
  datasource: '3__table',
  x_axis: 'ds',
  metrics: ['sum__num'],
  metricsB: ['sum__num'],
  groupby: ['gender'],
  groupbyB: ['gender'],
  seriesType: EchartsTimeseriesSeriesType.Line,
  seriesTypeB: EchartsTimeseriesSeriesType.Bar,
  viz_type: VizType.MixedTimeseries,
  forecastEnabled: false,
  forecastPeriods: [],
  forecastInterval: 0,
  forecastSeasonalityDaily: 0,
  legendSort: null,
};

const defaultQueryRows = [
  { boy: 1, girl: 2, ds: 599616000000 },
  { boy: 3, girl: 4, ds: 599916000000 },
];
const defaultLabelMap = { ds: ['ds'], boy: ['boy'], girl: ['girl'] };

const queriesData: ChartDataResponseResult[] = [
  createTestQueryData(defaultQueryRows, { label_map: defaultLabelMap }),
  createTestQueryData(defaultQueryRows, { label_map: defaultLabelMap }),
];

test('dashboard weekly grain aligns mixed bars and lines without changing temporal drill values', () => {
  const dates = Array.from(
    { length: 13 },
    (_, i) => Date.UTC(2026, 5, 7) + i * 604800000,
  );
  const rows = dates.map((ds, i) => ({ ds, boy: i + 1, girl: i + 2 }));
  const query = createTestQueryData(rows, {
    colnames: ['ds', 'boy', 'girl'],
    coltypes: [
      GenericDataType.Temporal,
      GenericDataType.Numeric,
      GenericDataType.Numeric,
    ],
    label_map: defaultLabelMap,
  });
  const props = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      seriesType: EchartsTimeseriesSeriesType.Bar,
      seriesTypeB: EchartsTimeseriesSeriesType.Smooth,
      stack: true,
      stackB: false,
      showValue: true,
      showValueB: true,
      time_grain_sqla: 'P1D',
      extra_form_data: { time_grain_sqla: 'P1W_SUN' },
    },
    queriesData: [query, query],
  });
  const output = transformProps(props);
  expect(output.xAxis.type).toBe('time');
  expect(output.echartOptions.xAxis.type).toBe('category');
  expect(output.echartOptions.xAxis.data).toEqual(dates.map(String));
  for (const series of output.echartOptions.series) {
    expect(series.data.map(row => row[0])).toEqual(dates);
    expect(series.encode).toEqual({ x: 2, y: 1 });
    expect(
      series.label.formatter({
        value: series.data[0],
        dataIndex: 0,
        seriesIndex: 0,
        seriesName: series.name,
      }),
    ).not.toContain('1780');
  }
});

test('dashboard fiscal grain aligns actual April buckets and preserves temporal drill values', () => {
  const dates = [2024, 2025, 2026].map(year => Date.UTC(year, 3, 1));
  const rows = dates.map((ds, i) => ({ ds, boy: i + 1, girl: i + 2 }));
  const query = createTestQueryData(rows, {
    colnames: ['ds', 'boy', 'girl'],
    coltypes: [
      GenericDataType.Temporal,
      GenericDataType.Numeric,
      GenericDataType.Numeric,
    ],
    label_map: defaultLabelMap,
  });
  const props = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      seriesType: EchartsTimeseriesSeriesType.Bar,
      seriesTypeB: EchartsTimeseriesSeriesType.Smooth,
      stack: true,
      stackB: false,
      showValue: true,
      showValueB: true,
      time_grain_sqla: 'P1D',
      extra_form_data: { time_grain_sqla: 'P1Y_FISCAL' },
    },
    queriesData: [query, query],
  });
  const output = transformProps(props);
  expect(output.xAxis.type).toBe('time');
  expect(output.echartOptions.xAxis.type).toBe('category');
  expect(output.echartOptions.xAxis.data).toEqual(dates.map(String));
  expect(
    output.echartOptions.xAxis.axisLabel.formatter(String(dates[0]), 0),
  ).toBe('2024财年');
  for (const series of output.echartOptions.series) {
    expect(series.data.map(row => row[0])).toEqual(dates);
    expect(series.encode).toEqual({ x: 2, y: 1 });
    expect(
      series.label.formatter({
        value: series.data[0],
        dataIndex: 0,
        seriesIndex: 0,
        seriesName: series.name,
      }),
    ).not.toContain('1780');
  }
});

test('keeps grouped LT counts as counts and preserves the BSR dimension in the tooltip', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      x_axis: 'ds',
      metrics: [
        {
          expressionType: 'SQL',
          label: 'LT数',
          sqlExpression:
            'COUNT(DISTINCT asin) filter(where is_internal_asin is true )',
        },
      ],
      metricsB: [
        {
          expressionType: 'SQL',
          label: '销售额占比',
          sqlExpression:
            'sum(revenue_30d)filter (where is_internal_asin is true) / sum(revenue_30d)',
        },
      ],
      groupby: [
        {
          expressionType: 'SQL',
          label: 'BSR分组',
          sqlExpression: 'case ... end',
        },
      ],
      groupbyB: [],
      yAxisFormat: '~g',
      yAxisFormatSecondary: '.2%',
      richTooltip: true,
      seriesType: EchartsTimeseriesSeriesType.Bar,
      seriesTypeB: EchartsTimeseriesSeriesType.Line,
      yAxisIndex: 0,
      yAxisIndexB: 1,
      showLegend: true,
    } as EchartsMixedTimeseriesFormData,
    queriesData: [
      createTestQueryData(
        [{ '101-200': 13, '201-300': 11, TOP100: 43, ds: 1720000000000 }],
        {
          label_map: {
            ds: ['ds'],
            '101-200': ['101-200'],
            '201-300': ['201-300'],
            TOP100: ['TOP100'],
            LT数: [
              'COUNT(DISTINCT asin) filter(where is_internal_asin is true )',
            ],
          },
        },
      ),
      createTestQueryData([{ 销售额占比: 0.1623, ds: 1720000000000 }], {
        label_map: {
          ds: ['ds'],
          销售额占比: [
            'sum(revenue_30d)filter (where is_internal_asin is true) / sum(revenue_30d)',
          ],
        },
      }),
    ],
  });

  const transformed = transformProps(chartProps);
  const series = transformed.echartOptions.series as any[];
  expect(series.map(item => item.id)).toEqual(
    expect.arrayContaining(['LT数, TOP100', 'LT数, 101-200', 'LT数, 201-300']),
  );
  expect(series.map(item => item.id)).not.toContain('LT数');
  expect(series.map(item => item.id)).not.toContain('LT数 (1)');

  const tooltip = (transformed.echartOptions.tooltip as any).formatter([
    { seriesId: 'LT数, TOP100', marker: '', value: [1720000000000, 43] },
    { seriesId: 'LT数, 101-200', marker: '', value: [1720000000000, 13] },
    { seriesId: 'LT数, 201-300', marker: '', value: [1720000000000, 11] },
    { seriesId: '销售额占比', marker: '', value: [1720000000000, 0.1623] },
  ]);
  expect(tooltip).toContain('LT数, TOP100');
  expect(tooltip).toContain('43');
  expect(tooltip).not.toContain('4,300.00%');
  expect(tooltip).toContain('16.23%');
});

test('keeps duplicate primary series on the primary formatter', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      metrics: [
        { expressionType: 'SQL', label: 'LT数', sqlExpression: 'COUNT(*)' },
      ],
      metricsB: [
        { expressionType: 'SQL', label: 'LT数', sqlExpression: 'COUNT(*)' },
      ],
      groupby: [],
      groupbyB: [],
      yAxisFormat: '~g',
      yAxisFormatSecondary: '.2%',
      yAxisIndex: 0,
      yAxisIndexB: 0,
      richTooltip: true,
    } as EchartsMixedTimeseriesFormData,
    queriesData: [
      createTestQueryData([{ LT数: 43, ds: 1720000000000 }]),
      createTestQueryData([{ LT数: 11, ds: 1720000000000 }]),
    ],
  });

  const transformed = transformProps(chartProps);
  const series = transformed.echartOptions.series as any[];
  expect(series.map(item => item.id)).toEqual(['LT数', 'LT数 (1)']);

  const tooltip = (transformed.echartOptions.tooltip as any).formatter([
    { seriesId: 'LT数', marker: '', value: [1720000000000, 43] },
    { seriesId: 'LT数 (1)', marker: '', value: [1720000000000, 11] },
  ]);
  expect(tooltip).toContain('43');
  expect(tooltip).toContain('>11</td>');
  expect(tooltip).not.toContain('1100.00%');
  expect(tooltip).not.toContain('1,100.00%');
});

test('shows only metric names in grouped legend labels', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      metrics: [
        {
          expressionType: 'SQL',
          label: '产品成本',
          sqlExpression: 'SUM(cost)',
        },
      ],
      metricsB: [
        {
          expressionType: 'SQL',
          label: '运费成本',
          sqlExpression: 'SUM(freight)',
        },
      ],
      groupby: [
        { expressionType: 'SQL', label: '产品', sqlExpression: 'product' },
      ],
      groupbyB: [
        { expressionType: 'SQL', label: '产品', sqlExpression: 'product' },
      ],
      showLegend: true,
    } as EchartsMixedTimeseriesFormData,
    queriesData: [
      createTestQueryData([{ 水晶框1: 10, 'LED5-EU': 20, ds: 1720000000000 }], {
        label_map: { ds: ['ds'], 水晶框1: ['水晶框1'], 'LED5-EU': ['LED5-EU'] },
      }),
      createTestQueryData([{ 水晶框1: 3, 'LED5-EU': 4, ds: 1720000000000 }], {
        label_map: { ds: ['ds'], 水晶框1: ['水晶框1'], 'LED5-EU': ['LED5-EU'] },
      }),
    ],
  });

  const transformed = transformProps(chartProps);
  const legend = transformed.echartOptions.legend as any;

  expect(legend.data).toEqual([
    '产品成本, 水晶框1',
    '产品成本, LED5-EU',
    '运费成本, 水晶框1',
    '运费成本, LED5-EU',
  ]);
  expect(legend.formatter('产品成本, 水晶框1')).toBe('产品成本');
  expect(legend.formatter('产品成本, LED5-EU')).toBe('产品成本');
  expect(legend.formatter('运费成本, 水晶框1')).toBe('运费成本');
  expect(legend.formatter('运费成本, LED5-EU')).toBe('运费成本');
});

test('should transform chart props for viz with showQueryIdentifiers=false', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    defaultQueriesData: queriesData,
    formData: { ...formData, showQueryIdentifiers: false },
    queriesData,
  });
  const transformed = transformProps(chartProps);

  // Check that series IDs don't include query identifiers
  const seriesIds = (transformed.echartOptions.series as any[]).map(
    (s: any) => s.id,
  );
  expect(seriesIds).toContain('sum__num, girl');
  expect(seriesIds).toContain('sum__num, boy');
  expect(seriesIds).not.toContain('sum__num (Query A), girl');
  expect(seriesIds).not.toContain('sum__num (Query A), boy');
  expect(seriesIds).not.toContain('sum__num (Query B), girl');
  expect(seriesIds).not.toContain('sum__num (Query B), boy');

  // Check that series name include query identifiers
  const seriesName = (transformed.echartOptions.series as any[]).map(
    (s: any) => s.name,
  );
  expect(seriesName).toContain('sum__num, girl');
  expect(seriesName).toContain('sum__num, boy');
  expect(seriesName).not.toContain('sum__num (Query A), girl');
  expect(seriesName).not.toContain('sum__num (Query A), boy');
  expect(seriesName).not.toContain('sum__num (Query B), girl');
  expect(seriesName).not.toContain('sum__num (Query B), boy');

  expect((transformed.echartOptions.legend as any).data).toEqual([
    'sum__num, girl',
    'sum__num, boy',
    'sum__num, girl',
    'sum__num, boy',
  ]);
});

test('should transform chart props for viz with showQueryIdentifiers=true', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    defaultQueriesData: queriesData,
    formData: { ...formData, showQueryIdentifiers: true },
    queriesData,
  });
  const transformed = transformProps(chartProps);

  // Check that series IDs include query identifiers
  const seriesIds = (transformed.echartOptions.series as any[]).map(
    (s: any) => s.id,
  );
  expect(seriesIds).toContain('sum__num (Query A), girl');
  expect(seriesIds).toContain('sum__num (Query A), boy');
  expect(seriesIds).toContain('sum__num (Query B), girl');
  expect(seriesIds).toContain('sum__num (Query B), boy');
  expect(seriesIds).not.toContain('sum__num, girl');
  expect(seriesIds).not.toContain('sum__num, boy');

  // Check that series name include query identifiers
  const seriesName = (transformed.echartOptions.series as any[]).map(
    (s: any) => s.name,
  );
  expect(seriesName).toContain('sum__num (Query A), girl');
  expect(seriesName).toContain('sum__num (Query A), boy');
  expect(seriesName).toContain('sum__num (Query B), girl');
  expect(seriesName).toContain('sum__num (Query B), boy');
  expect(seriesName).not.toContain('sum__num, girl');
  expect(seriesName).not.toContain('sum__num, boy');

  expect((transformed.echartOptions.legend as any).data).toEqual([
    'sum__num (Query A), girl',
    'sum__num (Query A), boy',
    'sum__num (Query B), girl',
    'sum__num (Query B), boy',
  ]);
});

test('keeps the legend visible and hides only the offset series by default', () => {
  const comparisonRows = [
    {
      LED5: 100,
      '1 month ago, LED5': 80,
      ds: 599616000000,
    },
    {
      LED5: 150,
      '1 month ago, LED5': 120,
      ds: 599916000000,
    },
  ];
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      time_compare: ['1 month ago'],
      groupbyB: [],
    } as EchartsMixedTimeseriesFormData,
    queriesData: [
      createTestQueryData(comparisonRows, { label_map: defaultLabelMap }),
      createTestQueryData([], { label_map: defaultLabelMap }),
    ],
  });

  const transformed = transformProps(chartProps);
  const legend = transformed.echartOptions.legend as any;

  expect(legend.data).toEqual([
    'sum__num, LED5',
    'sum__num, 1 month ago, LED5',
  ]);
  expect(legend.show).toBe(true);
  expect(legend.selected).toMatchObject({
    'sum__num, 1 month ago, LED5': false,
  });
});

test('expands a hidden current logical legend when time comparison closes', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      metrics: ['毛利润'],
      metricsB: ['毛利润'],
      groupby: [
        { expressionType: 'SQL', label: '店铺', sqlExpression: 'shop' },
      ],
      groupbyB: [],
      time_compare: [],
      showLegend: true,
    } as EchartsMixedTimeseriesFormData,
    queriesData: [
      createTestQueryData([{ 乔熹6: 100, 乔熹4: 50, ds: 1720000000000 }]),
      createTestQueryData([]),
    ],
  });
  (chartProps as any).legendState = { 'current:毛利润': false };

  const transformed = transformProps(chartProps);
  const selected = (transformed.echartOptions.legend as any).selected;
  const currentSeriesNames = (transformed.echartOptions.series as any[]).map(
    series => series.name,
  );

  expect(currentSeriesNames).toHaveLength(2);
  currentSeriesNames.forEach(name => {
    expect(selected[name]).toBe(false);
  });
  const memberStateProps = {
    ...chartProps,
    legendState: {
      [currentSeriesNames[0]]: false,
      [currentSeriesNames[1]]: true,
    },
  } as any;
  const memberSelected = (
    transformProps(memberStateProps).echartOptions.legend as any
  ).selected;
  expect(memberSelected[currentSeriesNames[0]]).toBe(false);
});

test('stable current state overrides stale dimension members when comparison closes', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      metrics: ['毛利润'],
      metricsB: ['毛利润'],
      groupby: [
        { expressionType: 'SQL', label: '店铺', sqlExpression: 'shop' },
      ],
      groupbyB: [],
      time_compare: [],
      showLegend: true,
    } as EchartsMixedTimeseriesFormData,
    queriesData: [
      createTestQueryData([{ 乔熹6: 100, 乔熹4: 50, ds: 1720000000000 }]),
      createTestQueryData([]),
    ],
  });
  const currentSeriesNames = (
    transformProps(chartProps).echartOptions.series as any[]
  ).map(series => series.name);

  const transformed = transformProps({
    ...chartProps,
    legendState: {
      'current:毛利润': false,
      [currentSeriesNames[0]]: true,
      [currentSeriesNames[1]]: true,
    },
  } as any);
  const selected = (transformed.echartOptions.legend as any).selected;

  currentSeriesNames.forEach(name => {
    expect(selected[name]).toBe(false);
  });
});

describe('legend sorting', () => {
  const getChartProps = (overrides = {}) =>
    createEchartsTimeseriesTestChartProps<
      EchartsMixedTimeseriesFormData,
      EchartsMixedTimeseriesProps
    >({
      ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
      defaultQueriesData: queriesData,
      formData: {
        ...formData,
        ...overrides,
        showQueryIdentifiers: true,
      },
      queriesData,
    });

  test('sort legend by data', () => {
    const chartProps = getChartProps({
      legendSort: null,
    });
    const transformed = transformProps(chartProps);

    expect((transformed.echartOptions.legend as any).data).toEqual([
      'sum__num (Query A), girl',
      'sum__num (Query A), boy',
      'sum__num (Query B), girl',
      'sum__num (Query B), boy',
    ]);
  });

  test('sort legend by label ascending', () => {
    const chartProps = getChartProps({
      legendSort: 'asc',
    });
    const transformed = transformProps(chartProps);

    expect((transformed.echartOptions.legend as any).data).toEqual([
      'sum__num (Query A), boy',
      'sum__num (Query A), girl',
      'sum__num (Query B), boy',
      'sum__num (Query B), girl',
    ]);
  });

  test('sort legend by label descending', () => {
    const chartProps = getChartProps({
      legendSort: 'desc',
    });
    const transformed = transformProps(chartProps);

    expect((transformed.echartOptions.legend as any).data).toEqual([
      'sum__num (Query B), girl',
      'sum__num (Query B), boy',
      'sum__num (Query A), girl',
      'sum__num (Query A), boy',
    ]);
  });
});

test('legend margin: top orientation sets grid.top correctly', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    defaultQueriesData: queriesData,
    formData: {
      ...formData,
      legendMargin: 250,
      showLegend: true,
    },
    queriesData,
  });
  const transformed = transformProps(chartProps);

  expect((transformed.echartOptions.grid as any).top).toEqual(270);
});

test('legend margin: bottom orientation sets grid.bottom correctly', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    defaultQueriesData: queriesData,
    formData: {
      ...formData,
      legendMargin: 250,
      showLegend: true,
      legendOrientation: LegendOrientation.Bottom,
    },
    queriesData,
  });
  const transformed = transformProps(chartProps);

  expect((transformed.echartOptions.grid as any).bottom).toEqual(270);
});

test('legend margin: left orientation sets grid.left correctly', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    defaultQueriesData: queriesData,
    formData: {
      ...formData,
      legendMargin: 250,
      showLegend: true,
      legendOrientation: LegendOrientation.Left,
    },
    queriesData,
  });
  const transformed = transformProps(chartProps);

  expect((transformed.echartOptions.grid as any).left).toEqual(270);
});

test('legend margin: right orientation sets grid.right correctly', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    defaultQueriesData: queriesData,
    formData: {
      ...formData,
      legendMargin: 270,
      showLegend: true,
      legendOrientation: LegendOrientation.Right,
    },
    queriesData,
  });
  const transformed = transformProps(chartProps);

  expect((transformed.echartOptions.grid as any).right).toEqual(270);
});

test('should add a formula annotation when X-axis column has dataset-level label', () => {
  const formula: FormulaAnnotationLayer = {
    name: 'My Formula',
    annotationType: AnnotationType.Formula,
    value: 'x*2',
    style: AnnotationStyle.Solid,
    show: true,
    showLabel: true,
  };
  const timeColumnName = 'ds';
  const timeColumnLabel = 'Time Label';
  const testData = [
    {
      [timeColumnLabel]: 599616000000,
      boy: 1,
      girl: 2,
    },
    {
      [timeColumnLabel]: 599916000000,
      boy: 3,
      girl: 4,
    },
  ];
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    defaultQueriesData: [],
    formData: {
      ...formData,
      x_axis: timeColumnName,
      annotationLayers: [formula],
    },
    queriesData: [
      createTestQueryData(testData, {
        label_map: {
          [timeColumnName]: [timeColumnLabel],
          boy: ['boy'],
          girl: ['girl'],
        },
      }),
      createTestQueryData(testData, {
        label_map: {
          [timeColumnName]: [timeColumnLabel],
          boy: ['boy'],
          girl: ['girl'],
        },
      }),
    ],
    datasource: {
      verboseMap: {
        [timeColumnName]: timeColumnLabel,
      },
      columnFormats: {},
      currencyFormats: {},
    },
  });
  const result = transformProps(chartProps);
  const formulaSeries = (
    result.echartOptions.series as SeriesOption[] | undefined
  )?.find((s: SeriesOption) => s.name === 'My Formula');
  expect(formulaSeries).toBeDefined();
  expect(formulaSeries?.data).toBeDefined();
  expect(Array.isArray(formulaSeries?.data)).toBe(true);
  expect((formulaSeries!.data as unknown[]).length).toBeGreaterThan(0);
});

test('automatically bounds only the secondary y-axis when enabled', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      truncateYAxis: false,
      truncateYAxisSecondary: true,
      yAxisBoundsSecondary: [0, 0.3],
      yAxisIndex: 0,
      yAxisIndexB: 1,
      groupby: [],
      groupbyB: [],
    },
    queriesData,
  });

  const transformed = transformProps(chartProps);
  const [primaryAxis, secondaryAxis] = transformed.echartOptions.yAxis as any[];

  expect(primaryAxis.scale).toBe(false);
  expect(secondaryAxis.scale).toBe(true);
  expect(secondaryAxis.min).toBeUndefined();
  expect(secondaryAxis.max).toBeUndefined();
});

test('keeps manual secondary y-axis bounds when automatic mode is disabled', () => {
  const chartProps = createEchartsTimeseriesTestChartProps<
    EchartsMixedTimeseriesFormData,
    EchartsMixedTimeseriesProps
  >({
    ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
    formData: {
      ...formData,
      truncateYAxis: false,
      truncateYAxisSecondary: false,
      yAxisBoundsSecondary: [0, 0.3],
      yAxisIndex: 0,
      yAxisIndexB: 1,
      groupby: [],
      groupbyB: [],
    },
    queriesData,
  });

  const [, secondaryAxis] = transformProps(chartProps).echartOptions
    .yAxis as any[];

  expect(secondaryAxis.scale).toBe(false);
  expect(secondaryAxis.min).toBe(0);
  expect(secondaryAxis.max).toBe(0.3);
});

test.each([
  [757, 761],
  [761, 757],
])(
  'mixed legend series keep distinct colors after singleton charts %s then %s',
  (first, second) => {
    window.featureFlags = { [FeatureFlag.AvoidColorsCollision]: true };
    const shared = getLabelsColorMap();
    const registry = getCategoricalSchemeRegistry();
    const palette = ['#1FA8C9', '#454E7C', '#5AC189'];
    const schemeId = 'legendCollisionRegression';
    registry.registerValue(
      schemeId,
      new CategoricalScheme({ id: schemeId, colors: palette }),
    );
    shared.reset();
    shared.source = LabelsColorMapSource.Dashboard;
    CategoricalColorNamespace.getNamespace().resetColors();
    try {
      [first, second].forEach(sliceId => {
        const scale = new CategoricalColorScale(palette);
        scale.getColor(sliceId === 757 ? '配送销售额' : '毛利润', sliceId);
      });
      const chartProps = createEchartsTimeseriesTestChartProps<
        EchartsMixedTimeseriesFormData,
        EchartsMixedTimeseriesProps
      >({
        ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
        formData: {
          ...formData,
          sliceId: 598,
          colorScheme: schemeId,
          metrics: ['配送销售额', '毛利润'],
          metricsB: ['毛利率'],
          groupby: [],
          groupbyB: [],
          seriesType: EchartsTimeseriesSeriesType.Bar,
          seriesTypeB: EchartsTimeseriesSeriesType.Smooth,
          showLegend: true,
        },
        queriesData: [
          createTestQueryData(
            [{ ds: 599616000000, 配送销售额: 100, 毛利润: 25 }],
            {
              label_map: {
                ds: ['ds'],
                配送销售额: ['配送销售额'],
                毛利润: ['毛利润'],
              },
            },
          ),
          createTestQueryData([{ ds: 599616000000, 毛利率: 0.25 }], {
            label_map: { ds: ['ds'], 毛利率: ['毛利率'] },
          }),
        ],
      });
      const series = transformProps(chartProps).echartOptions
        .series as BarSeriesOption[];
      const colors = series.map(item => item.itemStyle?.color);
      expect(series.map(item => item.name).sort()).toEqual(
        ['配送销售额', '毛利润', '毛利率'].sort(),
      );
      expect(colors.every(color => palette.includes(color as string))).toBe(
        true,
      );
      expect(new Set(colors).size).toBe(3);
    } finally {
      shared.reset();
      CategoricalColorNamespace.getNamespace().resetColors();
      registry.remove(schemeId);
      window.featureFlags = {};
    }
  },
);

test.each([
  [
    'P1D',
    '2026-08-05 : 2026-08-08',
    '2026-08-12 : 2026-08-16',
    1785859200000,
    '2026-08-05',
    '2026-08-12',
    3,
    4,
  ],
  [
    'P1M',
    '2026-10-15 : 2026-11-18',
    '2026-08-05 : 2026-09-18',
    Date.parse('2026-09-30T16:00:00Z'),
    '2026-10-01',
    '2026-08-01',
    34,
    44,
  ],
])(
  'custom %s legend preserves its key and native grain overrides saved day grain in tooltip',
  (
    grain,
    currentTimeRange,
    offset,
    timestamp,
    currentDate,
    comparisonDate,
    currentDays,
    comparisonDays,
  ) => {
    const period = {
      currentTimeRange,
      comparisonTimeRange: offset,
      timeColumn: 'ds',
    };
    const chartProps = createEchartsTimeseriesTestChartProps<
      EchartsMixedTimeseriesFormData,
      EchartsMixedTimeseriesProps
    >({
      ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
      formData: {
        ...formData,
        metrics: ['配送销售额'],
        metricsB: ['毛利率'],
        groupby: [],
        groupbyB: [],
        richTooltip: true,
        showLegend: true,
        time_grain_sqla: 'P1D',
        timeGrainSqla: 'P1D',
        time_range: 'Last 30 days',
        time_compare: [offset],
        time_compare_b: [offset],
        extra_form_data: {
          time_grain_sqla: grain,
          time_compare: [offset],
          custom_form_data: { custom_period_comparison: period },
        },
      } as EchartsMixedTimeseriesFormData,
      queriesData: [
        createTestQueryData([
          { 配送销售额: 100, [`配送销售额__${offset}`]: 80, ds: timestamp },
        ]),
        createTestQueryData([
          { 毛利率: 0.2, [`毛利率__${offset}`]: 0.1, ds: timestamp },
        ]),
      ],
    });
    chartProps.queriesData.forEach(query => {
      query.colnames = ['ds'];
      query.coltypes = [GenericDataType.Temporal];
    });
    const transformed = transformProps(chartProps);
    const legend = transformed.echartOptions.legend as {
      data: string[];
      formatter: (name: string) => string;
    };
    const comparisonKey = legend.data.find(name => name.includes(offset));
    expect(comparisonKey).toBeDefined();
    if (!comparisonKey) throw new Error('Missing comparison legend');
    expect(legend.formatter(comparisonKey)).toBe('对比期间');
    const selected = transformed.echartOptions.legend as {
      selected: Record<string, boolean>;
    };
    expect(selected.selected[comparisonKey]).toBe(true);
    const hidden = transformProps({
      ...chartProps,
      legendState: { [`comparison:${offset}`]: false },
    });
    expect(
      (hidden.echartOptions.legend as { selected: Record<string, boolean> })
        .selected[comparisonKey],
    ).toBe(false);
    const legacyHidden = transformProps({
      ...chartProps,
      legendState: { [comparisonKey]: false },
    });
    expect(
      (
        legacyHidden.echartOptions.legend as {
          selected: Record<string, boolean>;
        }
      ).selected[comparisonKey],
    ).toBe(false);
    const metadata = transformed.legendGroups;
    expect(metadata?.stateKeys[comparisonKey]).toBe(`comparison:${offset}`);
    const tooltip = transformed.echartOptions.tooltip as {
      formatter: (params: unknown) => string;
    };
    const html = tooltip.formatter([
      { seriesId: '配送销售额', marker: '', value: [timestamp, 100] },
      {
        seriesId: `配送销售额__${offset}`,
        marker: '',
        value: [timestamp, 80],
      },
    ]);
    expect(html).toContain(currentDate);
    expect(html).toContain(comparisonDate);
    expect(html).toContain(`${currentDays} 天`);
    expect(html).toContain(`${comparisonDays} 天`);
    expect(html).toContain('期间长度不同');
  },
);

test.each([
  ComparisonType.Difference,
  ComparisonType.Percentage,
  ComparisonType.Ratio,
])(
  'custom %s renders backend-derived series without synthesizing current series',
  style => {
    const offset = '2026-08-12 : 2026-08-16';
    const period = {
      currentTimeRange: '2026-08-05 : 2026-08-08',
      comparisonTimeRange: offset,
      timeColumn: 'ds',
    };
    const chartProps = createEchartsTimeseriesTestChartProps<
      EchartsMixedTimeseriesFormData,
      EchartsMixedTimeseriesProps
    >({
      ...MIXED_TIMESERIES_CHART_PROPS_DEFAULTS,
      formData: {
        ...formData,
        metrics: ['配送销售额'],
        metricsB: ['毛利率'],
        groupby: [],
        groupbyB: [],
        richTooltip: true,
        showLegend: true,
        comparison_type: style,
        comparison_type_b: style,
        time_compare: [offset],
        time_compare_b: [offset],
        extra_form_data: {
          time_grain_sqla: 'P1D',
          time_compare: [offset],
          custom_form_data: { custom_period_comparison: period },
        },
      } as EchartsMixedTimeseriesFormData,
      queriesData: [
        createTestQueryData([
          { [`配送销售额__${offset}`]: 20, ds: 1785859200000 },
        ]),
        createTestQueryData([
          { [`毛利率__${offset}`]: 0.1, ds: 1785859200000 },
        ]),
      ],
    });
    const result = transformProps(chartProps);
    const series = result.echartOptions.series as SeriesOption[];
    expect(series).toHaveLength(2);
    expect(series.every(item => String(item.name).includes(offset))).toBe(true);
    const legend = result.echartOptions.legend as {
      data: string[];
      selected: Record<string, boolean>;
    };
    expect(legend.data).toHaveLength(1);
    const [comparisonKey] = legend.data;
    expect(legend.selected[comparisonKey]).toBe(true);
  },
);
