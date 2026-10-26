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

import { ChartProps, QueryFormData, SMART_DATE_ID } from '@superset-ui/core';
import { supersetTheme } from '@apache-superset/core/theme';
import setupFormatters from 'src/setup/setupFormatters';
import transformProps from '../../src/plugin/transformProps';
import { buildMetricDescriptors } from '../../src/metricLayout';
import { MetricsLayoutEnum } from '../../src/types';

const setDataMask = jest.fn();
const formData = {
  groupbyRows: ['row1', 'row2'],
  groupbyColumns: ['col1', 'col2'],
  metrics: ['metric1', 'metric2'],
  tableRenderer: 'Table With Subtotal',
  colOrder: 'key_a_to_z',
  rowOrder: 'key_a_to_z',
  aggregateFunction: 'Sum',
  transposePivot: true,
  combineMetric: true,
  rowSubtotalPosition: true,
  colSubtotalPosition: true,
  colTotals: true,
  rowTotals: true,
  valueFormat: 'SMART_NUMBER',
  metricsLayout: MetricsLayoutEnum.COLUMNS,
  viz_type: '',
  datasource: '',
  conditionalFormatting: [],
  dateFormat: '',
  legacy_order_by: 'count',
  order_desc: true,
  currencyFormat: { symbol: 'USD', symbolPosition: 'prefix' },
};
const chartProps = new ChartProps<QueryFormData>({
  formData,
  width: 800,
  height: 600,
  queriesData: [
    {
      data: [{ name: 'Hulk', sum__num: 1, __timestamp: 599616000000 }],
      colnames: ['name', 'sum__num', '__timestamp'],
      coltypes: [1, 0, 2],
    },
  ],
  hooks: { setDataMask },
  filterState: { selectedFilters: {} },
  datasource: { verboseMap: {}, columnFormats: {} },
  theme: supersetTheme,
});

test('should transform chart props for viz', () => {
  expect(transformProps(chartProps)).toEqual({
    ownState: {},
    personalSort: null,
    personalSortEnabled: false,
    personalSortOrder: undefined,
    width: 800,
    height: 600,
    frozenColumnCount: 0,
    frozenColumnKey: undefined,
    freezeMetricIds: { metric1: 'metric1', metric2: 'metric2' },
    groupbyRows: ['row1', 'row2'],
    groupbyColumns: ['col1', 'col2'],
    metrics: ['metric1', 'metric2'],
    tableRenderer: 'Table With Subtotal',
    colOrder: 'key_a_to_z',
    rowOrder: 'key_a_to_z',
    aggregateFunction: 'Sum',
    transposePivot: true,
    combineMetric: true,
    rowSubtotalPosition: true,
    colSubtotalPosition: true,
    colTotals: true,
    colSubTotals: undefined,
    rowTotals: true,
    rowSubTotals: undefined,
    valueFormat: 'SMART_NUMBER',
    data: [{ name: 'Hulk', sum__num: 1, __timestamp: 599616000000 }],
    setDataMask,
    selectedFilters: {},
    verboseMap: {},
    metricsLayout: MetricsLayoutEnum.COLUMNS,
    metricColorFormatters: [],
    metricLayoutState: {
      ordered_metric_ids: ['metric1', 'metric2'],
      hidden_metric_ids: [],
    },
    dateFormatters: {},
    emitCrossFilters: false,
    allowRenderHtml: undefined,
    onContextMenu: undefined,
    timeGrainSqla: undefined,
    pivotNumberFormatRules: [],
    dimensionLabelOverrides: {},
    columnFormats: {},
    currencyFormats: {},
    metricAggregateFunctions: {},
    metricRatioComponents: {},
    currencyFormat: { symbol: 'USD', symbolPosition: 'prefix' },
    currencyCodeColumn: undefined,
    detectedCurrency: undefined,
  });
});

test('should pass pivot number format rules through for chart-level formatting', () => {
  const rules = [
    {
      axis: 'column',
      field: 'Metric',
      value: 'profit_rate',
      format: '.1%',
    },
  ];
  const ruleChartProps = new ChartProps<QueryFormData>({
    formData: {
      ...formData,
      pivotNumberFormatRules: rules,
    },
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [{ name: 'Hulk', sum__num: 1, __timestamp: 599616000000 }],
        colnames: ['name', 'sum__num', '__timestamp'],
        coltypes: [1, 0, 2],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: { verboseMap: {}, columnFormats: {} },
    theme: supersetTheme,
  });

  expect(transformProps(ruleChartProps).pivotNumberFormatRules).toEqual(rules);
});

test('should merge table column config number formats into metric formats', () => {
  const configuredChartProps = new ChartProps<QueryFormData>({
    formData: {
      ...formData,
      columnConfig: {
        metric1: {
          d3NumberFormat: '.2f',
          currencyFormat: { symbol: 'EUR', symbolPosition: 'suffix' },
        },
        metric2: {
          d3NumberFormat: '.1%',
        },
      },
    },
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [{ row1: 'A', metric1: 1234.5, metric2: 0.1234 }],
        colnames: ['row1', 'metric1', 'metric2'],
        coltypes: [1, 0, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: {},
      columnFormats: { metric2: '.3s' },
      currencyFormats: {
        metric2: { symbol: 'USD', symbolPosition: 'prefix' },
      },
    },
    theme: supersetTheme,
  });

  const result = transformProps(configuredChartProps);

  expect(result.columnFormats).toEqual({
    metric2: '.1%',
    metric1: '.2f',
  });
  expect(result.currencyFormats).toEqual({
    metric2: { symbol: 'USD', symbolPosition: 'prefix' },
    metric1: { symbol: 'EUR', symbolPosition: 'suffix' },
  });
});

test('should merge table column config aggregate functions into metric aggregate functions', () => {
  const configuredChartProps = new ChartProps<QueryFormData>({
    formData: {
      ...formData,
      columnConfig: {
        metric1: {
          pivotAggregateFunction: 'Sum',
        },
        metric2: {
          pivotAggregateFunction: 'Average',
        },
      },
    },
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [{ row1: 'A', metric1: 100, metric2: 0.1 }],
        colnames: ['row1', 'metric1', 'metric2'],
        coltypes: [1, 0, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: {},
      columnFormats: {},
      currencyFormats: {},
    },
    theme: supersetTheme,
  });

  const result = transformProps(configuredChartProps);

  expect(result.metricAggregateFunctions).toEqual({
    metric1: 'Sum',
    metric2: 'Average',
  });
});

test('uses ratio-of-sums aggregation when a metric declares component SQL', () => {
  const configuredChartProps = new ChartProps<QueryFormData>({
    formData: {
      ...formData,
      columnConfig: {
        metric1: {
          pivotAggregateFunction: 'Average',
          pivotRatioNumerator: 'SUM(gross_profit)',
          pivotRatioDenominator: 'SUM(shipped_sales)',
        },
      },
    },
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [
          {
            row1: 'A',
            metric1: 0.1,
            __pivot_ratio_num_0: 10,
            __pivot_ratio_den_0: 100,
          },
        ],
        colnames: [
          'row1',
          'metric1',
          '__pivot_ratio_num_0',
          '__pivot_ratio_den_0',
        ],
        coltypes: [1, 0, 0, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: { verboseMap: {}, columnFormats: {} },
    theme: supersetTheme,
  });

  const result = transformProps(configuredChartProps);

  expect(result.metricAggregateFunctions).toEqual({
    metric1: 'Ratio of sums',
  });
  expect(result.metricRatioComponents).toEqual({
    metric1: {
      numeratorLabel: '__pivot_ratio_num_0',
      denominatorLabel: '__pivot_ratio_den_0',
    },
  });
});

test('applies numerator ABS only after summing signed ratio components', () => {
  const configuredChartProps = new ChartProps<QueryFormData>({
    formData: {
      ...formData,
      columnConfig: {
        metric1: {
          pivotRatioNumerator: 'SUM(shipping_fee)',
          pivotRatioDenominator: 'SUM(shipped_sales)',
          pivotRatioUseAbsoluteNumerator: true,
        },
      },
    },
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [{ metric1: 0.2 }],
        colnames: ['metric1'],
        coltypes: [0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: { verboseMap: {}, columnFormats: {} },
    theme: supersetTheme,
  });

  expect(transformProps(configuredChartProps).metricAggregateFunctions).toEqual(
    {
      metric1: 'Absolute ratio of sums',
    },
  );
});

test('should pass AUTO mode through for per-cell detection (single currency data)', () => {
  const autoFormData = {
    ...formData,
    currencyFormat: { symbol: 'AUTO', symbolPosition: 'prefix' },
  };
  const autoChartProps = new ChartProps<QueryFormData>({
    formData: autoFormData,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [
          { country: 'USA', currency: 'USD', revenue: 100 },
          { country: 'Canada', currency: 'USD', revenue: 200 },
          { country: 'Mexico', currency: 'usd', revenue: 150 },
        ],
        colnames: ['country', 'currency', 'revenue'],
        coltypes: [1, 1, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: {},
      columnFormats: {},
      currencyCodeColumn: 'currency',
    },
    theme: supersetTheme,
  });

  const result = transformProps(autoChartProps);
  // AUTO mode should be preserved for per-cell detection in PivotTableChart
  expect(result.currencyFormat).toEqual({
    symbol: 'AUTO',
    symbolPosition: 'prefix',
  });
  // currencyCodeColumn should be passed through for per-cell detection
  expect(result.currencyCodeColumn).toBe('currency');
});

test('should pass AUTO mode through for per-cell detection (mixed currency data)', () => {
  const autoFormData = {
    ...formData,
    currencyFormat: { symbol: 'AUTO', symbolPosition: 'prefix' },
  };
  const autoChartProps = new ChartProps<QueryFormData>({
    formData: autoFormData,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [
          { country: 'USA', currency: 'USD', revenue: 100 },
          { country: 'UK', currency: 'GBP', revenue: 200 },
          { country: 'France', currency: 'EUR', revenue: 150 },
        ],
        colnames: ['country', 'currency', 'revenue'],
        coltypes: [1, 1, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: {},
      columnFormats: {},
      currencyCodeColumn: 'currency',
    },
    theme: supersetTheme,
  });

  const result = transformProps(autoChartProps);
  // AUTO mode should be preserved - per-cell detection happens in PivotTableChart
  expect(result.currencyFormat).toEqual({
    symbol: 'AUTO',
    symbolPosition: 'prefix',
  });
  expect(result.currencyCodeColumn).toBe('currency');
});

test('should pass AUTO mode through when no currency column is defined', () => {
  const autoFormData = {
    ...formData,
    currencyFormat: { symbol: 'AUTO', symbolPosition: 'prefix' },
  };
  const autoChartProps = new ChartProps<QueryFormData>({
    formData: autoFormData,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [
          { country: 'USA', revenue: 100 },
          { country: 'UK', revenue: 200 },
        ],
        colnames: ['country', 'revenue'],
        coltypes: [1, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: {},
      columnFormats: {},
      // No currencyCodeColumn defined
    },
    theme: supersetTheme,
  });

  const result = transformProps(autoChartProps);
  expect(result.currencyFormat).toEqual({
    symbol: 'AUTO',
    symbolPosition: 'prefix',
  });
  // currencyCodeColumn should be undefined when not configured
  expect(result.currencyCodeColumn).toBeUndefined();
});

test('should handle empty data gracefully in AUTO mode', () => {
  const autoFormData = {
    ...formData,
    currencyFormat: { symbol: 'AUTO', symbolPosition: 'prefix' },
  };
  const autoChartProps = new ChartProps<QueryFormData>({
    formData: autoFormData,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [],
        colnames: ['country', 'currency', 'revenue'],
        coltypes: [1, 1, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: {},
      columnFormats: {},
      currencyCodeColumn: 'currency',
    },
    theme: supersetTheme,
  });

  const result = transformProps(autoChartProps);
  expect(result.currencyFormat).toEqual({
    symbol: 'AUTO',
    symbolPosition: 'prefix',
  });
  expect(result.currencyCodeColumn).toBe('currency');
});

test('should preserve static currency format when not using AUTO mode', () => {
  const staticFormData = {
    ...formData,
    currencyFormat: { symbol: 'EUR', symbolPosition: 'suffix' },
  };
  const staticChartProps = new ChartProps<QueryFormData>({
    formData: staticFormData,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [
          { country: 'USA', currency: 'USD', revenue: 100 },
          { country: 'UK', currency: 'GBP', revenue: 200 },
        ],
        colnames: ['country', 'currency', 'revenue'],
        coltypes: [1, 1, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: {},
      columnFormats: {},
      currencyCodeColumn: 'currency',
    },
    theme: supersetTheme,
  });

  const result = transformProps(staticChartProps);
  expect(result.currencyFormat).toEqual({
    symbol: 'EUR',
    symbolPosition: 'suffix',
  });
});

test('should map conditional formatting rules to metricColorFormatters with correct colors', () => {
  const formattingFormData = {
    ...formData,
    conditionalFormatting: [
      {
        colorScheme: '#ACE1C4',
        column: 'country',
        operator: '=',
        targetValue: 'country',
      },
      {
        colorScheme: '#5ac189',
        column: 'revenue',
        operator: '=',
        targetValue: 'revenue',
      },
    ],
  };
  const formattingChartProps = new ChartProps<QueryFormData>({
    formData: formattingFormData,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [
          { country: 'USA', currency: 'USD', revenue: 100 },
          { country: 'UK', currency: 'GBP', revenue: 200 },
        ],
        colnames: ['country', 'currency', 'revenue'],
        coltypes: [1, 1, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: {},
      columnFormats: {},
      currencyCodeColumn: 'currency',
    },
    theme: supersetTheme,
  });

  const result = transformProps(formattingChartProps);
  const column1Formatting = result.metricColorFormatters[0].column;
  const column2Formatting = result.metricColorFormatters[1].column;
  expect(
    result.metricColorFormatters[0].getColorFromValue(column1Formatting),
  ).toEqual('#ACE1C4');
  expect(
    result.metricColorFormatters[1].getColorFromValue(column2Formatting),
  ).toEqual('#5ac189');
});

test('should format numeric-string temporal values the same as epoch numbers', () => {
  const dateFormData = {
    ...formData,
    dateFormat: '%Y-%m-%d %H:%M:%S',
  };
  const dateChartProps = new ChartProps<QueryFormData>({
    formData: dateFormData,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [{ earliest_ship_date: 1764604800000 }],
        colnames: ['earliest_ship_date'],
        coltypes: [2],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: { verboseMap: {}, columnFormats: {} },
    theme: supersetTheme,
  });

  const result = transformProps(dateChartProps);
  const formatter = result.dateFormatters.earliest_ship_date;

  expect(formatter).toBeDefined();
  expect(formatter?.('1764604800000' as any)).toBe(
    formatter?.(1764604800000 as any),
  );
  expect(formatter?.('1764604800000' as any)).not.toContain('NaN');
});

test.each([
  ['P1D', new Date(Date.UTC(2026, 1, 1, 8)), '2026-02-01'],
  ['P1D', new Date(Date.UTC(2026, 1, 8, 8)), '2026-02-08'],
  ['P1D', new Date(Date.UTC(2026, 6, 1, 8)), '2026-07-01'],
  ['P1W_SUN', new Date(Date.UTC(2026, 1, 8, 8)), '2026年第7周'],
  ['P1W_SUN', new Date('2025-12-28T00:00:00+08:00'), '2026年第1周'],
  ['P1W_SUN', new Date('2026-06-21T00:00:00+08:00'), '2026年第26周'],
  ['P1M', new Date(Date.UTC(2026, 3, 1, 8)), '2026年4月'],
  ['P1M', new Date(Date.UTC(2026, 6, 1, 8)), '2026年7月'],
  ['P3M_FISCAL', new Date(Date.UTC(2026, 3, 1, 8)), '2026年Q1'],
  ['P3M_FISCAL', new Date(Date.UTC(2026, 6, 1, 8)), '2026年Q2'],
  ['P1Y', new Date(Date.UTC(2026, 0, 1, 8)), '2026年'],
  ['P1D', new Date('2026-01-01T00:00:00+08:00'), '2026-01-01'],
  ['P1M', new Date('2026-04-01T00:00:00+08:00'), '2026年4月'],
  ['P3M_FISCAL', new Date('2026-07-01T00:00:00+08:00'), '2026年Q2'],
  ['P1Y', new Date('2026-01-01T00:00:00+08:00'), '2026年'],
])(
  'should format smart date values using the custom time grain display for %s',
  (timeGrainSqla, value, expectedLabel) => {
    setupFormatters({}, {});

    const dateChartProps = new ChartProps<QueryFormData>({
      formData: {
        ...formData,
        date_format: SMART_DATE_ID,
        time_grain_sqla: timeGrainSqla,
      } as any,
      width: 800,
      height: 600,
      queriesData: [
        {
          data: [{ earliest_ship_date: value }],
          colnames: ['earliest_ship_date'],
          coltypes: [2],
        },
      ],
      hooks: { setDataMask },
      filterState: { selectedFilters: {} },
      datasource: { verboseMap: {}, columnFormats: {} },
      theme: supersetTheme,
    });

    const result = transformProps(dateChartProps);
    const formatter = result.dateFormatters.earliest_ship_date;

    expect(formatter).toBeDefined();
    expect(formatter?.(value as any)).toBe(expectedLabel);
  },
);

test('passes chart-level dimension label overrides to the Pivot Table', () => {
  const labelChartProps = new ChartProps<QueryFormData>({
    formData: {
      ...formData,
      dimensionLabelConfig: {
        earliest_ship_date: { customColumnName: '发货日期' },
        lt: { customColumnName: '' },
      },
    } as any,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [{ earliest_ship_date: 1764604800000, lt: 'L1' }],
        colnames: ['earliest_ship_date', 'lt'],
        coltypes: [2, 1],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: {
      verboseMap: { earliest_ship_date: '原始日期', lt: '生命周期' },
      columnFormats: {},
    },
    theme: supersetTheme,
  });

  expect(
    (transformProps(labelChartProps) as any).dimensionLabelOverrides,
  ).toEqual({
    earliest_ship_date: '发货日期',
  });
});

test('applies personal metric layout from ownState', () => {
  const descriptors = buildMetricDescriptors(formData.metrics ?? []);
  const chartPropsWithLayout = new ChartProps<QueryFormData>({
    formData,
    width: 800,
    height: 600,
    queriesData: [
      {
        data: [{ metric1: 10, metric2: 20 }],
        colnames: ['metric1', 'metric2'],
        coltypes: [0, 0],
      },
    ],
    hooks: { setDataMask },
    filterState: { selectedFilters: {} },
    datasource: { verboseMap: {}, columnFormats: {} },
    ownState: {
      pivot_table_metric_layout: {
        ordered_metric_ids: [descriptors[1].id, descriptors[0].id],
        hidden_metric_ids: [descriptors[0].id],
        version: 1,
      },
    },
    theme: supersetTheme,
  });

  const result = transformProps(chartPropsWithLayout) as any;

  expect(result.metrics).toEqual(['metric2']);
  expect(result.metricLayoutState).toEqual({
    ordered_metric_ids: [descriptors[1].id, descriptors[0].id],
    hidden_metric_ids: [descriptors[0].id],
  });
});

test('custom period merges both result sets and preserves metric layout identity', () => {
  const props = new ChartProps<QueryFormData>({
    formData: {
      ...formData,
      groupbyRows: ['shop'],
      row_limit: 1000,
      groupbyColumns: ['day'],
      metrics: ['sales'],
      extra_form_data: {
        time_grain_sqla: 'P1D',
        custom_form_data: {
          custom_period_comparison: {
            currentTimeRange: '2026-10-01 : 2026-10-03',
            comparisonTimeRange: '2026-08-05 : 2026-08-07',
            timeColumn: 'day',
          },
        },
      },
    },
    width: 800,
    height: 600,
    filterState: { selectedFilters: {} },
    theme: supersetTheme,
    queriesData: [
      {
        data: [{ shop: 'A', day: Date.UTC(2026, 9, 1), sales: 12 }],
        colnames: ['shop', 'day', 'sales'],
        coltypes: [1, 2, 0],
      },
      {
        data: [
          { shop: 'A', day: Date.UTC(2026, 7, 5), sales: 10 },
          { shop: 'B', day: Date.UTC(2026, 7, 5), sales: 20 },
        ],
        colnames: ['shop', 'day', 'sales'],
        coltypes: [1, 2, 0],
      },
    ],
    datasource: {
      verboseMap: {},
      columnFormats: {},
      metrics: [{ metric_name: 'sales', expression: 'SUM(sales)' }],
    },
  });
  const transformed = transformProps(props);
  expect(transformed.customPeriodComparison).toBe(true);
  expect(transformed.customPeriodComparisonLabel).toContain('2026-10-01');
  expect(transformed.customPeriodComparisonLabel).toContain('2026-08-05');
  expect(transformed.metrics).toEqual(['sales']);
  expect(transformed.data).toHaveLength(2);
  expect(transformed.data[0].sales__custom_period).toBe(10);
  expect(transformed.data[1].sales).toBeNull();
  expect(String(transformed.data[0].day)).toContain('2026-10-01');
  expect(String(transformed.data[0].day)).toContain('2026-08-05');
  expect(transformed.dateFormatters.day?.(transformed.data[0].day)).toBe(
    transformed.data[0].day,
  );
});

function limitedCustomPeriodProps(
  currentCount: number,
  comparisonCount: number,
) {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ shop: `shop${i}`, sales: 10 }));
  return new ChartProps<QueryFormData>({
    formData: {
      ...formData,
      metrics: ['sales'],
      groupbyRows: ['shop'],
      groupbyColumns: [],
      row_limit: 2,
      extra_form_data: {
        custom_form_data: {
          custom_period_comparison: {
            currentTimeRange: '2026-10-01 : 2026-10-14',
            comparisonTimeRange: '2026-08-05 : 2026-08-18',
          },
        },
      },
    },
    datasource: {
      verboseMap: {},
      columnFormats: {},
      metrics: [{ metric_name: 'sales', expression: 'SUM(sales)' }],
    },
    queriesData: [
      {
        data: rows(currentCount),
        colnames: ['shop', 'sales'],
        coltypes: [1, 0],
      },
      {
        data: rows(comparisonCount),
        colnames: ['shop', 'sales'],
        coltypes: [1, 0],
      },
    ],
    filterState: { selectedFilters: {} },
    theme: supersetTheme,
  });
}

test.each([
  [3, 1],
  [1, 3],
])(
  'refuses a truncated period before constructing totals: %s/%s',
  (currentCount, comparisonCount) => {
    expect(() =>
      transformProps(limitedCustomPeriodProps(currentCount, comparisonCount)),
    ).toThrow(/行数/);
  },
);

test('accepts a complete result exactly at its original row limit', () => {
  expect(transformProps(limitedCustomPeriodProps(2, 2)).data).toHaveLength(2);
});
