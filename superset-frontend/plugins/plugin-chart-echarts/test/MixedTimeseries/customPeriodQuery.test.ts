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
  ComparisonType,
  getMetricLabel,
  QueryFormData,
} from '@superset-ui/core';
import mixedBuildQuery from '../../src/MixedTimeseries/buildQuery';
import timeseriesBuildQuery from '../../src/Timeseries/buildQuery';

const chart598 = {
  time_compare: ['1 week ago'],
  time_compare_b: [],
  comparison_type: 'values',
  comparison_type_b: 'values',
  x_axis: 'earliest_ship_date',
  time_grain_sqla: 'P1W_SUN',
  datasource: '98__table',
  viz_type: 'mixed_timeseries',
  row_limit: 500,
  groupby: [],
  groupby_b: [],
  metrics: [
    {
      expressionType: 'SIMPLE',
      label: '配送销售额',
      hasCustomLabel: true,
      aggregate: 'SUM',
      column: {
        column_name: 'shipped_sales',
        id: 1308,
        type: 'NUMERIC(18, 6)',
        type_generic: 0,
        is_dttm: false,
      },
    },
    {
      expressionType: 'SIMPLE',
      label: '毛利润',
      hasCustomLabel: true,
      aggregate: 'SUM',
      column: {
        column_name: 'gross_profit',
        id: 1321,
        type: 'NUMERIC(18, 6)',
        type_generic: 0,
        is_dttm: false,
      },
    },
  ],
  metrics_b: [
    {
      expressionType: 'SQL',
      label: '毛利率',
      hasCustomLabel: true,
      sqlExpression:
        'CASE \r\n    WHEN SUM("shipped_sales") != 0 \r\n    THEN ROUND(SUM("gross_profit") / SUM("shipped_sales"), 4) \r\n    ELSE 0 \r\nEND',
    },
  ],
} as QueryFormData;
const period = {
  currentTimeRange: '2026-08-05 : 2026-08-08',
  comparisonTimeRange: '2026-08-12 : 2026-08-16',
  timeColumn: 'earliest_ship_date',
};
function customForm(
  grain: string,
  style = ComparisonType.Values,
): QueryFormData {
  return {
    ...chart598,
    comparison_type: style,
    comparison_type_b: style,
    time_compare: ['1 month ago'],
    time_compare_b: ['1 year ago'],
    extra_form_data: {
      time_range: period.currentTimeRange,
      time_grain_sqla: grain,
      time_compare: [period.comparisonTimeRange],
      custom_form_data: { custom_period_comparison: period },
    },
  };
}

test.each([
  'P1D',
  'P1W',
  'P1W_SUN',
  'P1M',
  'P3M',
  'P3M_FISCAL',
  'P1Y',
  'P1Y_FISCAL',
])(
  '598 mixed amount bars and SQL-rate lines retain the complete date offset at %s',
  grain => {
    const input = customForm(grain);
    const result = mixedBuildQuery(input);
    expect(result.queries).toHaveLength(2);
    expect(result.queries[0].metrics).toEqual(chart598.metrics);
    expect(result.queries[1].metrics).toEqual(chart598.metrics_b);
    result.queries.forEach(query => {
      expect(query.time_offsets).toEqual([period.comparisonTimeRange]);
      expect(query.time_range).toBe(period.currentTimeRange);
      expect(query.extras?.time_grain_sqla).toBe(grain);
      expect(query.extras).not.toHaveProperty('time_compare');
      expect(query.extras).not.toHaveProperty('instant_time_comparison_range');
      const pivot = query.post_processing?.find(
        step => step?.operation === 'pivot',
      );
      const metric = query.metrics?.[0];
      if (!metric) throw new Error('Missing query metric');
      expect(pivot).toMatchObject({
        operation: 'pivot',
        options: {
          aggregates: {
            [`${getMetricLabel(metric)}__${period.comparisonTimeRange}`]: {
              operator: 'mean',
            },
          },
        },
      });
    });
    expect(input.time_compare).toEqual(['1 month ago']);
  },
);

test.each(Object.values(ComparisonType))(
  'custom range uses existing %s post-processing in both query builders',
  style => {
    const form = customForm('P1D', style);
    const contexts = [mixedBuildQuery(form), timeseriesBuildQuery(form)];
    contexts.forEach(context =>
      context.queries.forEach(query => {
        expect(query.time_offsets).toEqual([period.comparisonTimeRange]);
        const compare = query.post_processing?.find(
          step => step?.operation === 'compare',
        );
        const expected =
          style === ComparisonType.Values
            ? undefined
            : {
                operation: 'compare',
                options: {
                  compare_type: style,
                  source_columns: query.metrics?.map(getMetricLabel),
                  compare_columns: query.metrics?.map(
                    metric =>
                      `${getMetricLabel(metric)}__${period.comparisonTimeRange}`,
                  ),
                  drop_original_columns: true,
                },
              };
        expect(compare).toEqual(expected);
      }),
    );
  },
);

test.each([
  ['mixed', mixedBuildQuery],
  ['timeseries', timeseriesBuildQuery],
] as const)(
  '%s custom metadata rejects invalid calendar bounds before sending a query',
  (_, build) => {
    const form = customForm('P1D');
    form.extra_form_data = {
      ...form.extra_form_data,
      custom_form_data: {
        custom_period_comparison: {
          ...period,
          comparisonTimeRange: '2026-02-30 : 2026-03-04',
        },
      },
    };
    expect(() => build(form)).toThrow('Invalid calendar date');
  },
);

test.each([
  ['mixed', mixedBuildQuery],
  ['timeseries', timeseriesBuildQuery],
] as const)(
  '%s dashboard comparison OFF clears offsets while preserving current-period date filters',
  (_, build) => {
    const form = customForm('P1D');
    form.time_compare = [];
    form.time_compare_b = [];
    form.extra_form_data = {
      ...form.extra_form_data,
      time_compare: [],
      custom_form_data: { custom_period_comparison: null },
    };
    build(form).queries.forEach(query => {
      expect(query.time_offsets).toEqual([]);
      expect(query.time_range).toBe(period.currentTimeRange);
      expect(
        query.post_processing?.some(step => step?.operation === 'compare'),
      ).toBe(false);
    });
  },
);

test('mixed saved relative comparisons preserve the previous quarter-grain compatibility guard', () => {
  const result = mixedBuildQuery({
    ...chart598,
    time_grain_sqla: 'P3M',
    time_compare: ['1 month ago'],
    time_compare_b: ['1 month ago'],
  });
  result.queries.forEach(query => expect(query.time_offsets).toEqual([]));
});
