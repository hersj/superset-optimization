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

import { TimeGranularity } from '@superset-ui/core';
import buildQuery from '../../src/plugin/buildQuery';
import { PivotTableQueryFormData } from '../../src/types';

const formData: PivotTableQueryFormData = {
  groupbyRows: ['row1', 'row2'],
  groupbyColumns: ['col1', 'col2'],
  metrics: ['metric1', 'metric2'],
  tableRenderer: 'Table With Subtotal',
  colOrder: 'key_a_to_z',
  rowOrder: 'key_a_to_z',
  aggregateFunction: 'Sum',
  transposePivot: true,
  rowSubtotalPosition: true,
  colSubtotalPosition: true,
  colTotals: true,
  colSubTotals: true,
  rowTotals: true,
  rowSubTotals: true,
  valueFormat: 'SMART_NUMBER',
  datasource: '5__table',
  viz_type: 'my_chart',
  width: 800,
  height: 600,
  combineMetric: false,
  verboseMap: {},
  columnFormats: {},
  currencyFormats: {},
  metricColorFormatters: [],
  dateFormatters: {},
  setDataMask: () => {},
  legacy_order_by: 'count',
  order_desc: true,
  margin: 0,
  time_grain_sqla: TimeGranularity.MONTH,
  temporal_columns_lookup: { col1: true },
  currencyFormat: { symbol: 'USD', symbolPosition: 'prefix' },
};

test('should build groupby with series in form data', () => {
  const queryContext = buildQuery(formData);
  const [query] = queryContext.queries;
  expect(query.columns).toEqual([
    {
      columnType: 'BASE_AXIS',
      expressionType: 'SQL',
      label: 'col1',
      sqlExpression: 'col1',
      timeGrain: 'P1M',
    },
    'col2',
    'row1',
    'row2',
  ]);
});

test('should work with old charts', () => {
  const modifiedFormData = {
    ...formData,
    time_grain_sqla: TimeGranularity.MONTH,
    granularity_sqla: 'col1',
  };
  const queryContext = buildQuery(modifiedFormData);
  const [query] = queryContext.queries;
  expect(query.columns).toEqual([
    {
      timeGrain: 'P1M',
      columnType: 'BASE_AXIS',
      sqlExpression: 'col1',
      label: 'col1',
      expressionType: 'SQL',
    },
    'col2',
    'row1',
    'row2',
  ]);
});

test('should prefer extra_form_data.time_grain_sqla over formData.time_grain_sqla', () => {
  const modifiedFormData = {
    ...formData,
    extra_form_data: { time_grain_sqla: TimeGranularity.QUARTER },
  };
  const queryContext = buildQuery(modifiedFormData);
  const [query] = queryContext.queries;
  expect(query.columns?.[0]).toEqual({
    timeGrain: TimeGranularity.QUARTER,
    columnType: 'BASE_AXIS',
    sqlExpression: 'col1',
    label: 'col1',
    expressionType: 'SQL',
  });
});

test('should fallback to formData.time_grain_sqla if extra_form_data.time_grain_sqla is not set', () => {
  const queryContext = buildQuery(formData);
  const [query] = queryContext.queries;
  expect(query.columns?.[0]).toEqual({
    timeGrain: formData.time_grain_sqla,
    columnType: 'BASE_AXIS',
    sqlExpression: 'col1',
    label: 'col1',
    expressionType: 'SQL',
  });
});

test('should not omit extras.time_grain_sqla from queryContext so dashboards apply them', () => {
  const modifiedFormData = {
    ...formData,
    extra_form_data: { time_grain_sqla: TimeGranularity.QUARTER },
  };
  const queryContext = buildQuery(modifiedFormData);
  const [query] = queryContext.queries;
  expect(query.extras?.time_grain_sqla).toEqual(TimeGranularity.QUARTER);
});

test('adds hidden numerator and denominator metrics for ratio-of-sums totals', () => {
  const queryContext = buildQuery({
    ...formData,
    column_config: {
      metric1: {
        pivotRatioNumerator: 'SUM(gross_profit)',
        pivotRatioDenominator: 'SUM(shipped_sales)',
      },
      metric2: {
        pivotRatioNumerator: 'SUM(shipping_fee)',
        pivotRatioDenominator: 'SUM(shipped_sales)',
      },
    },
  } as PivotTableQueryFormData);
  const [query] = queryContext.queries;

  expect(query.metrics).toEqual([
    'metric1',
    'metric2',
    {
      expressionType: 'SQL',
      hasCustomLabel: true,
      label: '__pivot_ratio_num_0',
      sqlExpression: 'SUM(gross_profit)',
    },
    {
      expressionType: 'SQL',
      hasCustomLabel: true,
      label: '__pivot_ratio_den_0',
      sqlExpression: 'SUM(shipped_sales)',
    },
    {
      expressionType: 'SQL',
      hasCustomLabel: true,
      label: '__pivot_ratio_num_1',
      sqlExpression: 'SUM(shipping_fee)',
    },
  ]);
  expect(query.orderby).toEqual([['metric1', false]]);
});

test('ignores stale ratio configuration for a metric no longer in the chart', () => {
  const queryContext = buildQuery({
    ...formData,
    column_config: {
      removed_metric: {
        pivotRatioNumerator: 'SUM(gross_profit)',
        pivotRatioDenominator: 'SUM(shipped_sales)',
      },
    },
  } as PivotTableQueryFormData);
  const [query] = queryContext.queries;

  expect(query.metrics).toEqual(['metric1', 'metric2']);
});

test('does not expose internal ratio helpers in raw result downloads', () => {
  const queryContext = buildQuery({
    ...formData,
    result_format: 'csv',
    result_type: 'results',
    column_config: {
      metric1: {
        pivotRatioNumerator: 'SUM(gross_profit)',
        pivotRatioDenominator: 'SUM(shipped_sales)',
      },
    },
  } as PivotTableQueryFormData);
  const [query] = queryContext.queries;

  expect(query.metrics).toEqual(['metric1', 'metric2']);
});

test('does not expose internal ratio helpers in post-processed JSON downloads', () => {
  const queryContext = buildQuery({
    ...formData,
    result_format: 'json',
    result_type: 'post_processed',
    column_config: {
      metric1: {
        pivotRatioNumerator: 'SUM(gross_profit)',
        pivotRatioDenominator: 'SUM(shipped_sales)',
      },
    },
  } as PivotTableQueryFormData);
  const [query] = queryContext.queries;

  expect(query.metrics).toEqual(['metric1', 'metric2']);
});
