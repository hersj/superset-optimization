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
import { SqlaFormData, VizType } from '@superset-ui/core';
import buildQuery from '../../src/Timeseries/buildQuery';

test.each(
  ['kk_sku', 'lt', 'operator_engineer_name'].flatMap(xAxis =>
    [true, false].flatMap(orderDesc =>
      ['horizontal', 'vertical'].map(orientation => ({
        xAxis,
        orderDesc,
        orientation,
      })),
    ),
  ),
)(
  'categorical bars preserve selected query sorting ($xAxis, $orientation, descending=$orderDesc) without mutating saved form data',
  ({ xAxis, orderDesc, orientation }) => {
    const formData = {
      datasource: '5__table',
      viz_type: VizType.Bar,
      orientation,
      x_axis: xAxis,
      metrics: ['profit'],
      timeseries_limit_metric: 'sales',
      order_desc: orderDesc,
      row_limit: 15,
      groupby: [],
    };
    const before = JSON.stringify(formData);
    const [query] = buildQuery(formData).queries;
    expect(query.orderby).toEqual([['sales', !orderDesc]]);
    expect(
      query.post_processing?.find(op => op?.operation === 'pivot'),
    ).toMatchObject({
      options: { preserve_row_order: true },
    });
    expect(query.metrics).toEqual(['profit']);
    expect(query.row_limit).toBe(15);
    expect(JSON.stringify(formData)).toBe(before);
  },
);

test('category ordering keeps explicit axis sorting and leaves other chart types unchanged', () => {
  const formData = {
    datasource: '5__table',
    viz_type: VizType.Bar,
    x_axis: 'lt',
    metrics: ['profit'],
    timeseries_limit_metric: 'profit',
    x_axis_sort: 'profit',
    x_axis_sort_asc: true,
    groupby: [],
  };
  expect(buildQuery(formData).queries[0].post_processing).toContainEqual({
    operation: 'sort',
    options: { by: 'profit', ascending: true },
  });
  const [lineQuery] = buildQuery({
    ...formData,
    viz_type: VizType.Line,
  }).queries;
  expect(
    lineQuery.post_processing?.find(op => op?.operation === 'pivot')?.options,
  ).not.toHaveProperty('preserve_row_order');
});

test('bar time comparisons preserve current-query order without sorting by a comparison metric', () => {
  const [query] = buildQuery({
    datasource: '5__table',
    viz_type: VizType.Bar,
    x_axis: 'lt',
    metrics: ['profit'],
    timeseries_limit_metric: 'profit',
    order_desc: false,
    groupby: [],
    time_compare: ['1 month ago'],
    comparison_type: 'values',
  }).queries;
  expect(query.orderby).toEqual([['profit', true]]);
  expect(
    query.post_processing?.find(op => op?.operation === 'pivot'),
  ).toMatchObject({
    options: {
      preserve_row_order: true,
      aggregates: {
        profit: { operator: 'mean' },
        'profit__1 month ago': { operator: 'mean' },
      },
    },
  });
});

describe('Timeseries buildQuery', () => {
  const formData = {
    datasource: '5__table',
    granularity_sqla: 'ds',
    metrics: ['bar', 'baz'],
    viz_type: 'my_chart',
  };

  test('should build groupby with series in form data', () => {
    const queryContext = buildQuery(formData);
    const [query] = queryContext.queries;
    expect(query.metrics).toEqual(['bar', 'baz']);
  });

  test('should order by timeseries limit if orderby unspecified', () => {
    const queryContext = buildQuery({
      ...formData,
      timeseries_limit_metric: 'bar',
      order_desc: true,
    });
    const [query] = queryContext.queries;
    expect(query.metrics).toEqual(['bar', 'baz']);
    expect(query.series_limit_metric).toEqual('bar');
    expect(query.order_desc).toEqual(true);
    expect(query.orderby).toEqual([['bar', false]]);
  });

  test('should not order by timeseries limit if orderby provided', () => {
    const queryContext = buildQuery({
      ...formData,
      timeseries_limit_metric: 'bar',
      order_desc: true,
      orderby: [['foo', true]],
    });
    const [query] = queryContext.queries;
    expect(query.metrics).toEqual(['bar', 'baz']);
    expect(query.series_limit_metric).toEqual('bar');
    expect(query.order_desc).toEqual(true);
    expect(query.orderby).toEqual([['foo', true]]);
  });
});

describe('queryObject conversion', () => {
  const formData: SqlaFormData = {
    datasource: '5__table',
    viz_type: VizType.Table,
    granularity_sqla: 'time_column',
    time_grain_sqla: 'P1Y',
    time_range: '1 year ago : 2013',
    groupby: ['col1'],
    metrics: ['count(*)'],
  };

  test("shouldn't convert queryObject", () => {
    const { queries } = buildQuery(formData);
    expect(queries[0]).toEqual(
      expect.objectContaining({
        granularity: 'time_column',
        time_range: '1 year ago : 2013',
        extras: { time_grain_sqla: 'P1Y', having: '', where: '' },
        columns: ['col1'],
        series_columns: ['col1'],
        metrics: ['count(*)'],
        is_timeseries: true,
        post_processing: [
          {
            operation: 'pivot',
            options: {
              aggregates: { 'count(*)': { operator: 'mean' } },
              columns: ['col1'],
              drop_missing_columns: true,
              index: ['__timestamp'],
            },
          },
          { operation: 'flatten' },
        ],
      }),
    );
  });

  test('should convert queryObject', () => {
    const { queries } = buildQuery({ ...formData, x_axis: 'time_column' });
    expect(queries[0]).toMatchObject({
      granularity: 'time_column',
      time_range: '1 year ago : 2013',
      extras: { having: '', where: '', time_grain_sqla: 'P1Y' },
      columns: [
        {
          columnType: 'BASE_AXIS',
          expressionType: 'SQL',
          label: 'time_column',
          sqlExpression: 'time_column',
          timeGrain: 'P1Y',
          isColumnReference: true,
        },
        'col1',
      ],
      series_columns: ['col1'],
      metrics: ['count(*)'],
      post_processing: [
        {
          operation: 'pivot',
          options: {
            aggregates: { 'count(*)': { operator: 'mean' } },
            columns: ['col1'],
            drop_missing_columns: true,
            index: ['time_column'],
          },
        },
        { operation: 'flatten' },
      ],
    });
  });
});
