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
import { formatPivotValueWithRules } from './numberFormatRules';

test('uses column format before row format', () => {
  const formatted = formatPivotValueWithRules({
    value: 0.425,
    rowAttrs: ['Metric'],
    rowKey: ['profit'],
    colAttrs: ['period'],
    colKey: ['rate'],
    rules: [
      { axis: 'row', field: 'Metric', value: 'profit', format: '$,.2f' },
      { axis: 'column', field: 'period', value: 'rate', format: '.1%' },
    ],
    defaultFormatter: value => String(value),
  });

  expect(formatted).toBe('42.5%');
});

test('uses row format when no column rule matches', () => {
  const formatted = formatPivotValueWithRules({
    value: 1250,
    rowAttrs: ['Metric'],
    rowKey: ['profit'],
    colAttrs: ['period'],
    colKey: ['gross'],
    rules: [{ axis: 'row', field: 'Metric', value: 'profit', format: '$,.0f' }],
    defaultFormatter: value => String(value),
  });

  expect(formatted).toBe('$1,250');
});

test('matches formatted temporal display values', () => {
  const formatted = formatPivotValueWithRules({
    value: 10,
    rowAttrs: ['Metric'],
    rowKey: ['orders'],
    colAttrs: ['earliest_ship_date'],
    colKey: ['2026-04-01T00:00:00'],
    rules: [
      {
        axis: 'column',
        field: 'earliest_ship_date',
        value: '2026年Q2',
        format: ',.1f',
      },
    ],
    dateFormatters: {
      earliest_ship_date: () => '2026年Q2',
    },
    defaultFormatter: value => String(value),
  });

  expect(formatted).toBe('10.0');
});

test('falls back to the default formatter when no rules match', () => {
  const formatted = formatPivotValueWithRules({
    value: 7,
    rowAttrs: ['Metric'],
    rowKey: ['orders'],
    colAttrs: ['period'],
    colKey: ['gross'],
    rules: [{ axis: 'column', field: 'period', value: 'rate', format: '.1%' }],
    defaultFormatter: value => `default ${value}`,
  });

  expect(formatted).toBe('default 7');
});
