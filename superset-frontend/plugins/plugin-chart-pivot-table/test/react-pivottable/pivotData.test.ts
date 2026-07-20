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
  aggregatorTemplates,
  PivotData,
} from '../../src/react-pivottable/utilities';

const formatter = (value: number) => String(value);
const aggregatorsFactory = (valueFormatter = formatter) => ({
  Sum: aggregatorTemplates.sum(valueFormatter),
  Average: aggregatorTemplates.average(valueFormatter),
  'Ratio of sums': aggregatorTemplates.sumOverSum(valueFormatter),
  'Absolute ratio of sums': aggregatorTemplates.sumOverSum(
    valueFormatter,
    true,
  ),
});

test('ratio-of-sums total is invariant when the same data changes time grain', () => {
  const createPivot = (data: Record<string, unknown>[]) =>
    new PivotData({
      data,
      rows: ['period'],
      cols: [],
      vals: ['numerator', 'denominator'],
      aggregatorName: 'Ratio of sums',
      aggregatorsFactory,
      defaultFormatter: formatter,
    });

  const monthly = createPivot([
    { period: '2026-01', numerator: 10, denominator: 100 },
    { period: '2026-02', numerator: 270, denominator: 900 },
  ]);
  const quarterly = createPivot([
    { period: '2026-Q1', numerator: 280, denominator: 1000 },
  ]);

  expect(monthly.getAggregator([], []).value()).toBeCloseTo(0.28);
  expect(quarterly.getAggregator([], []).value()).toBeCloseTo(0.28);
});

test('ratio-of-sums returns null when the aggregated denominator is zero', () => {
  const pivotData = new PivotData({
    data: [{ period: '2026-01', numerator: 10, denominator: 0 }],
    rows: ['period'],
    cols: [],
    vals: ['numerator', 'denominator'],
    aggregatorName: 'Ratio of sums',
    aggregatorsFactory,
    defaultFormatter: formatter,
  });

  expect(pivotData.getAggregator([], []).value()).toBeNull();
});

test('absolute ratio-of-sums applies ABS after summing signed numerators', () => {
  const pivotData = new PivotData({
    data: [
      { period: '2026-01', numerator: -30, denominator: 50 },
      { period: '2026-02', numerator: 10, denominator: 50 },
    ],
    rows: ['period'],
    cols: [],
    vals: ['numerator', 'denominator'],
    aggregatorName: 'Absolute ratio of sums',
    aggregatorsFactory,
    defaultFormatter: formatter,
  });

  expect(pivotData.getAggregator([], []).value()).toBeCloseTo(0.2);
});

test('ratio-of-sums ignores null components like SQL SUM', () => {
  const pivotData = new PivotData({
    data: [
      { period: '2026-01', numerator: null, denominator: null },
      { period: '2026-02', numerator: 20, denominator: 100 },
    ],
    rows: ['period'],
    cols: [],
    vals: ['numerator', 'denominator'],
    aggregatorName: 'Ratio of sums',
    aggregatorsFactory,
    defaultFormatter: formatter,
  });

  expect(pivotData.getAggregator([], []).value()).toBeCloseTo(0.2);
});

test('uses metric-specific aggregation when a metric overrides the chart default', () => {
  const pivotData = new PivotData({
    data: [
      { row: 'A', Metric: 'sales', value: 100 },
      { row: 'A', Metric: 'sales', value: 200 },
      { row: 'A', Metric: 'rate', value: 0.1 },
      { row: 'A', Metric: 'rate', value: 0.2 },
    ],
    rows: ['row'],
    cols: ['Metric'],
    vals: ['value'],
    aggregatorName: 'Sum',
    aggregatorsFactory,
    defaultFormatter: formatter,
    customAggregatorNames: {
      Metric: {
        rate: 'Average',
      },
    },
  });

  expect(pivotData.getAggregator(['A'], ['sales']).value()).toBe(300);
  expect(pivotData.getAggregator(['A'], ['rate']).value()).toBeCloseTo(0.15);
  expect(pivotData.getAggregator([], ['rate']).value()).toBeCloseTo(0.15);
});
