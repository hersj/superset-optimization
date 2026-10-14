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
  getCustomComparisonBucketDate,
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
  expect(getCustomPeriodComparison({})).toBeUndefined();
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
  ['current', period.currentTimeRange],
  ['comparison', period.comparisonTimeRange],
])(
  '%s query serializes only backend-supported extras and clears legacy comparison',
  (_, range) => {
    const query = {
      metrics: ['sales'],
      time_range: period.currentTimeRange,
      granularity: 'biz_date',
      extras: {
        where: "shop = 'A'",
        having: 'SUM(sales) > 0',
        time_grain_sqla: 'P1D',
        relative_start: 'today',
        relative_end: 'now',
        column_order: ['biz_date', 'sales'],
        transpile_to_dialect: true,
        time_compare: ['1 month ago'],
        instant_time_comparison_range: '1 month ago',
      },
      filters: [
        { col: 'biz_date', op: 'TEMPORAL_RANGE', val: period.currentTimeRange },
      ],
    } as QueryObject;
    const result = buildCustomPeriodComparisonQuery(query, {
      ...period,
      comparisonTimeRange: range,
    });
    // ChartDataExtrasSchema rejects unknown fields, unlike the top-level schema.
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized.extras).toEqual({
      where: "shop = 'A'",
      having: 'SUM(sales) > 0',
      time_grain_sqla: 'P1D',
      relative_start: 'today',
      relative_end: 'now',
      column_order: ['biz_date', 'sales'],
      transpile_to_dialect: true,
    });
    expect(result.extras).not.toHaveProperty('time_compare');
    expect(result.extras).not.toHaveProperty('instant_time_comparison_range');
    expect(result.time_range).toBe(range);
    expect(result.filters?.[0].val).toBe(range);
    expect(query.extras).toHaveProperty('time_compare', ['1 month ago']);
    expect(query.extras).toHaveProperty(
      'instant_time_comparison_range',
      '1 month ago',
    );
  },
);

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

test.each([
  ['epoch', 1785859200000, Date.parse('2026-08-11T16:00:00Z')],
  ['Date', new Date('2026-08-04T16:00:00Z'), new Date('2026-08-11T16:00:00Z')],
  ['ISO UTC', '2026-08-04T16:00:00Z', '2026-08-11T16:00:00Z'],
  ['ISO offset', '2026-08-05T00:00:00+08:00', '2026-08-12T00:00:00+08:00'],
  ['calendar date', '2026-08-05', '2026-08-12'],
  ['naive SQL datetime', '2026-08-05 00:00:00', '2026-08-12 00:00:00'],
])(
  'backend %s uses the existing business day for both alignment and labels',
  (_, a, b) => {
    const rows = mergeCustomPeriodComparisonRows(
      [{ biz_date: a, sales: 10 }],
      [{ biz_date: b, sales: 5 }],
      ['biz_date'],
      ['sales'],
      {
        currentTimeRange: '2026-08-05 : 2026-08-08',
        comparisonTimeRange: '2026-08-12 : 2026-08-15',
        timeColumn: 'biz_date',
      },
      'P1D',
      ['biz_date'],
    );
    expect(rows).toEqual([
      {
        biz_date: '第1天 · 当前 2026-08-05 / 对比 2026-08-12',
        sales: 10,
        sales__custom_period: 5,
      },
    ]);
  },
);

test.each([
  [
    'P1W_SUN',
    '2026-08-09',
    '2026-08-16',
    '2026-08-08T16:00:00Z',
    '2026-08-15T16:00:00Z',
    '周',
  ],
  [
    'P1M',
    '2026-08-01',
    '2026-09-01',
    '2026-07-31T16:00:00Z',
    '2026-08-31T16:00:00Z',
    '月',
  ],
])(
  'backend %s boundary timestamps stay in the first business bucket',
  (grain, a, b, aTimestamp, bTimestamp, unit) => {
    const rows = mergeCustomPeriodComparisonRows(
      [{ biz_date: Date.parse(aTimestamp), sales: 10 }],
      [{ biz_date: new Date(bTimestamp), sales: 5 }],
      ['biz_date'],
      ['sales'],
      {
        currentTimeRange: `${a} : 2026-08-20`,
        comparisonTimeRange: `${b} : 2026-09-20`,
        timeColumn: 'biz_date',
      },
      grain,
      ['biz_date'],
    );
    expect(rows).toEqual([
      {
        biz_date: `第1${unit} · 当前 ${a} / 对比 ${b}`,
        sales: 10,
        sales__custom_period: 5,
      },
    ]);
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

test.each([
  [
    'P1D',
    '2026-08-05 : 2026-08-08',
    '2026-08-12 : 2026-08-16',
    1785859200000,
    '2026-08-12',
  ],
  [
    'P1D',
    '2026-08-05 : 2026-08-08',
    '2026-08-12 : 2026-08-16',
    '2026-08-08',
    '2026-08-15',
  ],
  [
    'P1D',
    '2026-08-05 : 2026-08-08',
    '2026-08-12 : 2026-08-16',
    '2026-08-09',
    null,
  ],
  [
    'P1D',
    '2026-08-05 : 2026-08-08',
    '2026-08-12 : 2026-08-16',
    '2026-08-04',
    null,
  ],
  [
    'P1W_SUN',
    '2026-08-05 : 2026-08-20',
    '2026-07-08 : 2026-07-20',
    '2026-08-02',
    '2026-07-05',
  ],
  [
    'P1W_SUN',
    '2026-08-05 : 2026-08-20',
    '2026-07-08 : 2026-07-20',
    '2026-08-09',
    '2026-07-12',
  ],
  [
    'P1W',
    '2026-08-05 : 2026-08-20',
    '2026-07-08 : 2026-07-20',
    '2026-08-03',
    '2026-07-06',
  ],
  [
    'P1M',
    '2026-10-15 : 2026-12-01',
    '2026-08-05 : 2026-09-18',
    '2026-10-01',
    '2026-08-01',
  ],
  [
    'P1M',
    '2026-10-15 : 2026-12-01',
    '2026-08-05 : 2026-09-18',
    '2026-11-01',
    '2026-09-01',
  ],
  [
    'P1M',
    '2026-10-15 : 2026-12-01',
    '2026-08-05 : 2026-09-18',
    '2026-12-01',
    null,
  ],
  [
    'P3M',
    '2026-10-15 : 2027-01-01',
    '2026-08-05 : 2026-09-18',
    '2026-10-01',
    '2026-07-01',
  ],
  [
    'P3M_FISCAL',
    '2026-10-15 : 2027-01-01',
    '2026-08-05 : 2026-09-18',
    '2026-10-01',
    '2026-07-01',
  ],
  [
    'P1Y',
    '2026-07-01 : 2027-01-01',
    '2024-11-01 : 2025-01-01',
    '2026-01-01',
    '2024-01-01',
  ],
  [
    'P1Y_FISCAL',
    '2026-07-01 : 2027-04-01',
    '2024-02-05 : 2024-04-01',
    '2026-04-01',
    '2023-04-01',
  ],
  [
    'P1D',
    '2024-02-27 : 2024-03-02',
    '2025-02-27 : 2025-03-02',
    '2024-02-29',
    '2025-03-01',
  ],
])(
  'custom tooltip bucket %s maps from actual selected starts, retaining partial buckets',
  (grain, currentTimeRange, comparisonTimeRange, value, expected) => {
    expect(
      getCustomComparisonBucketDate(
        value,
        { currentTimeRange, comparisonTimeRange },
        grain,
      ),
    ).toBe(expected);
  },
);
