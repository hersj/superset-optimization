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
import {
  buildCustomPeriodComparisonQuery,
  calculatePeriodDifference,
  createCustomPeriodComparison,
  getCustomPeriodComparison,
  getPeriodDayCount,
  mergeCustomPeriodComparisonRows,
} from '../../src/time-comparison/customPeriod';
import { QueryObject } from '../../src/query';
const period = {
  currentTimeRange: '2026-10-01 : 2026-10-14',
  comparisonTimeRange: '2026-08-05 : 2026-08-18',
  timeColumn: 'biz_date',
};

test('inclusive user dates become exclusive query bounds and count calendar days', () => {
  expect(
    createCustomPeriodComparison(
      period.currentTimeRange,
      '2026-08-05',
      '2026-08-17',
      'biz_date',
    ),
  ).toEqual(period);
  expect(getPeriodDayCount(period.currentTimeRange)).toBe(13);
  expect(getPeriodDayCount('2026-02-01 : 2026-03-01')).toBe(28);
  expect(() =>
    createCustomPeriodComparison(
      period.currentTimeRange,
      '2026-02-30',
      '2026-03-05',
    ),
  ).toThrow('Invalid calendar date');
  expect(() =>
    createCustomPeriodComparison('No filter', '2026-08-05', '2026-08-17'),
  ).toThrow('Select a finite current and comparison period');
  expect(() =>
    createCustomPeriodComparison(
      period.currentTimeRange,
      '2026-08-17',
      '2026-08-05',
    ),
  ).toThrow('Comparison end precedes its start');
});

test('custom metadata uses the existing native filter custom_form_data channel', () => {
  const formData = {
    datasource: '1__table',
    viz_type: 'table',
    extra_form_data: { custom_form_data: { custom_period_comparison: period } },
  };
  expect(getCustomPeriodComparison(formData)).toEqual(period);
  expect(
    getCustomPeriodComparison({ datasource: '1__table', viz_type: 'table' }),
  ).toBeUndefined();
});

test('comparison replaces the selected temporal range while retaining other filters', () => {
  const query = {
    time_range: period.currentTimeRange,
    granularity: 'biz_date',
    time_offsets: ['1 month ago'],
    time_compare: ['1 month ago'],
    time_shift: '1 month ago',
    since: '2026-10-01',
    until: '2026-10-14',
    filters: [
      { col: 'biz_date', op: 'TEMPORAL_RANGE', val: period.currentTimeRange },
      { col: 'shop', op: 'IN', val: ['A'] },
      {
        col: 'created_at',
        op: 'TEMPORAL_RANGE',
        val: '2026-01-01 : 2027-01-01',
      },
    ],
    extras: {},
    metrics: ['sales'],
  } as QueryObject;
  const result = buildCustomPeriodComparisonQuery(query, period);
  expect(result.time_range).toBe(period.comparisonTimeRange);
  expect(result.time_offsets).toEqual([]);
  expect(result.time_compare).toEqual([]);
  expect(result.time_shift).toBeUndefined();
  expect(result.since).toBeUndefined();
  expect(result.until).toBeUndefined();
  expect(result.filters).toEqual([
    { col: 'biz_date', op: 'TEMPORAL_RANGE', val: period.comparisonTimeRange },
    { col: 'shop', op: 'IN', val: ['A'] },
    { col: 'created_at', op: 'TEMPORAL_RANGE', val: '2026-01-01 : 2027-01-01' },
  ]);
  expect(query.time_range).toBe(period.currentTimeRange);
});

test.each([
  [13000, 10000, 3000, 0.3],
  [-50, -100, 50, 0.5],
  [0, 100, -100, -1],
  [1.25, 1.1, 0.15, 0.15 / 1.1],
])(
  'difference A=%s B=%s preserves decimal and negative semantics',
  (a, b, delta, rate) => {
    const result = calculatePeriodDifference(a, b);
    expect(result.valueDifference).toBeCloseTo(delta);
    expect(result.percentDifferenceNum).toBeCloseTo(rate);
  },
);

test.each([
  [100, 0, 100],
  [0, 0, 0],
])('zero baseline A=%s B=%s retains delta and has no rate', (a, b, delta) => {
  expect(calculatePeriodDifference(a, b)).toEqual({
    valueDifference: delta,
    percentDifferenceNum: null,
  });
});

test.each([
  [null, 5],
  [5, null],
  ['5', 2],
  [NaN, 2],
])('invalid or missing value A=%s B=%s never becomes zero', (a, b) => {
  expect(calculatePeriodDifference(a, b)).toEqual({
    valueDifference: null,
    percentDifferenceNum: null,
  });
});

test('dimension union retains comparison-only rows and NULL rather than zero', () => {
  expect(
    mergeCustomPeriodComparisonRows(
      [
        { shop: 'A', sales: 1.25 },
        { shop: 'C', sales: null },
      ],
      [
        { shop: 'A', sales: 1.1 },
        { shop: 'B', sales: 3 },
      ],
      ['shop'],
      ['sales'],
      period,
    ),
  ).toEqual([
    { shop: 'A', sales: 1.25, sales__custom_period: 1.1 },
    { shop: 'C', sales: null, sales__custom_period: null },
    { shop: 'B', sales: null, sales__custom_period: 3 },
  ]);
});

test('daily alignment preserves period positions, missing days and longer comparison', () => {
  const rows = mergeCustomPeriodComparisonRows(
    [
      { biz_date: '2026-10-01', sales: 10 },
      { biz_date: '2026-10-03', sales: 30 },
    ],
    [
      { biz_date: '2026-08-05', sales: 5 },
      { biz_date: '2026-08-06', sales: 6 },
      { biz_date: '2026-08-18', sales: 18 },
    ],
    ['biz_date'],
    ['sales'],
    { ...period, comparisonTimeRange: '2026-08-05 : 2026-08-19' },
    'P1D',
    ['biz_date'],
  );
  const first = rows.find(row => String(row.biz_date).startsWith('第1天'));
  expect(first).toMatchObject({ sales: 10, sales__custom_period: 5 });
  expect(first?.biz_date).toContain('2026-10-01');
  expect(first?.biz_date).toContain('2026-08-05');
  expect(
    rows.find(row => String(row.biz_date).startsWith('第2天')),
  ).toMatchObject({ sales: null, sales__custom_period: 6 });
  expect(
    rows.find(row => String(row.biz_date).startsWith('第14天')),
  ).toMatchObject({ sales: null, sales__custom_period: 18 });
});

test.each([
  ['P1M', '2026-10-01', '2026-08-01', '第1月'],
  ['P1W_SUN', '2026-09-27', '2026-08-02', '第1周'],
  ['P1W', '2026-09-28', '2026-08-03', '第1周'],
])(
  'aligns calendar bucket %s rather than elapsed day offsets',
  (grain, a, b, label) => {
    const rows = mergeCustomPeriodComparisonRows(
      [{ biz_date: a, sales: 10 }],
      [{ biz_date: b, sales: 5 }],
      ['biz_date'],
      ['sales'],
      period,
      grain,
      ['biz_date'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].biz_date).toContain(label);
    expect(rows[0]).toMatchObject({ sales: 10, sales__custom_period: 5 });
  },
);

test('duplicate returned grain keys are rejected rather than silently overwritten', () => {
  expect(() =>
    mergeCustomPeriodComparisonRows(
      [
        { shop: 'A', sales: 1 },
        { shop: 'A', sales: 2 },
      ],
      [],
      ['shop'],
      ['sales'],
      period,
    ),
  ).toThrow(/duplicate/i);
});

test('an inclusive end which overflows the supported calendar is rejected before rendering', () => {
  expect(() =>
    createCustomPeriodComparison(
      period.currentTimeRange,
      '9999-12-31',
      '9999-12-31',
    ),
  ).toThrow('Periods require ISO calendar dates');
});
