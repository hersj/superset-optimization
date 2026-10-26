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
import buildQueryContext from '../../src/query/buildQueryContext';
import { VizType } from '../../src/chart/types/VizType';
jest.mock('@superset-ui/core', () => ({
  DTTM_ALIAS: '__timestamp',
  getColumnLabel: jest.requireActual('../../src/query/getColumnLabel').default,
  isQueryFormColumn: jest.requireActual('../../src/query/types/Column')
    .isQueryFormColumn,
}));
import { getPersonalSortOptions } from '../../src/query/personalSort';
import * as queryModule from '../../src/query/normalizeTimeColumn';

describe('buildQueryContext', () => {
  test('should build datasource for table sources and apply defaults', () => {
    const queryContext = buildQueryContext({
      datasource: '5__table',
      granularity_sqla: 'ds',
      viz_type: VizType.Table,
    });
    expect(queryContext.datasource.id).toBe(5);
    expect(queryContext.datasource.type).toBe('table');
    expect(queryContext.force).toBe(false);
    expect(queryContext.result_format).toBe('json');
    expect(queryContext.result_type).toBe('full');
  });
  test('should build datasource for table sources with columns', () => {
    const queryContext = buildQueryContext(
      {
        datasource: '5__table',
        granularity_sqla: 'ds',
        viz_type: VizType.Table,
        source: 'source_column',
        source_category: 'source_category_column',
        target: 'target_column',
        target_category: 'target_category_column',
      },
      {
        queryFields: {
          source: 'columns',
          source_category: 'columns',
          target: 'columns',
          target_category: 'columns',
        },
      },
    );
    expect(queryContext.datasource.id).toBe(5);
    expect(queryContext.datasource.type).toBe('table');
    expect(queryContext.force).toBe(false);
    expect(queryContext.result_format).toBe('json');
    expect(queryContext.result_type).toBe('full');
    expect(queryContext.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: [
            'source_column',
            'source_category_column',
            'target_column',
            'target_category_column',
          ],
        }),
      ]),
    );
  });
  test('should build datasource for table sources and process with custom function', () => {
    const queryContext = buildQueryContext(
      {
        datasource: '5__table',
        granularity_sqla: 'ds',
        viz_type: VizType.Table,
        source: 'source_column',
        source_category: 'source_category_column',
        target: 'target_column',
        target_category: 'target_category_column',
      },
      function addExtraColumn(queryObject) {
        return [{ ...queryObject, columns: ['dummy_column'] }];
      },
    );
    expect(queryContext.datasource.id).toBe(5);
    expect(queryContext.datasource.type).toBe('table');
    expect(queryContext.force).toBe(false);
    expect(queryContext.result_format).toBe('json');
    expect(queryContext.result_type).toBe('full');
    expect(queryContext.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ['dummy_column'],
        }),
      ]),
    );
  });
  // todo(Yongjie): move these test case into buildQueryObject.test.ts
  test('should remove undefined value in post_processing', () => {
    const queryContext = buildQueryContext(
      {
        datasource: '5__table',
        viz_type: VizType.Table,
      },
      () => [
        {
          post_processing: [
            undefined,
            undefined,
            {
              operation: 'flatten',
            },
            undefined,
          ],
        },
      ],
    );
    expect(queryContext.queries[0].post_processing).toEqual([
      {
        operation: 'flatten',
      },
    ]);
  });
  test('should call normalizeTimeColumn if has x_axis', () => {
    const spyNormalizeTimeColumn = jest.spyOn(
      queryModule,
      'normalizeTimeColumn',
    );

    buildQueryContext(
      {
        datasource: '5__table',
        viz_type: VizType.Table,
        x_axis: 'axis',
      },
      () => [{}],
    );
    expect(spyNormalizeTimeColumn).toHaveBeenCalled();
    spyNormalizeTimeColumn.mockRestore();
  });
});

test('carries validated personal ordering after plugin query construction', () => {
  const personal_sort = { mode: 'metric', field: 'sales', direction: 'asc' };
  const result = buildQueryContext({
    datasource: '5__table',
    viz_type: VizType.Table,
    metrics: ['sales'],
    groupby: ['sku'],
    personal_sort,
  });
  expect(result.queries[0].personal_sort).toEqual(personal_sort);
});

test('personal sorting keeps pivot row order and removes conflicting old sort', () => {
  const result = buildQueryContext(
    {
      datasource: '5__table',
      viz_type: VizType.Table,
      metrics: ['sales'],
      groupby: ['sku'],
      personal_sort: { mode: 'metric', field: 'sales', direction: 'desc' },
    },
    () => [
      {
        post_processing: [
          { operation: 'sort', options: { columns: { sales: false } } },
          {
            operation: 'pivot',
            options: {
              index: ['sku'],
              columns: [],
              aggregates: { sales: { operator: 'sum' } },
            },
          },
        ],
      },
    ],
  );
  expect(result.queries[0].post_processing).toEqual([
    {
      operation: 'pivot',
      options: {
        index: ['sku'],
        columns: [],
        aggregates: { sales: { operator: 'sum' } },
        preserve_row_order: true,
      },
    },
  ]);
});
test('invalid sorting is not forwarded and original ordering remains untouched', () => {
  const result = buildQueryContext(
    {
      datasource: '5__table',
      viz_type: VizType.Table,
      metrics: ['sales'],
      personal_sort: { mode: 'metric', field: 'sql', direction: 'desc' },
    },
    () => [{ orderby: [['sales', true]] }],
  );
  expect(result.queries[0]).toEqual({ orderby: [['sales', true]] });
});

test('Mixed offers only shared categories and never ranks an ungrouped date axis', () => {
  const form = {
    datasource: '5__table',
    viz_type: 'mixed_timeseries',
    x_axis: 'day',
    temporal_columns_lookup: { day: true },
    groupby: ['sku'],
    groupby_b: [],
    metrics: ['sales'],
    metrics_b: ['sales'],
  };
  expect(getPersonalSortOptions(form)).toEqual([]);
  expect(
    getPersonalSortOptions({ ...form, groupby_b: ['sku'] }).map(
      option => option.value,
    ),
  ).toEqual(['A:sales', 'B:sales', 'sku']);
  expect(
    getPersonalSortOptions({ ...form, x_axis: 'department' }).map(
      option => option.value,
    ),
  ).toEqual(['A:sales', 'B:sales', 'department']);
  expect(getPersonalSortOptions({ ...form, groupby_b: null })).toEqual([]);
});

test('bubble uses existing x y size aggregate metrics', () => {
  expect(
    getPersonalSortOptions({
      datasource: '5__table',
      viz_type: 'bubble_v2',
      x: 'sales',
      y: 'margin',
      size: 'orders',
      entity: 'sku',
    }).map(option => option.value),
  ).toEqual(['sales', 'margin', 'orders', 'sku']);
});
