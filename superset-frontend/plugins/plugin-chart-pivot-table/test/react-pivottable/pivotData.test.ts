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
