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
  formatBigNumberPeriodComparison,
  getBigNumberPeriodLabel,
} from './customComparison';

const period = {
  currentTimeRange: '2026-10-01 : 2026-10-14',
  comparisonTimeRange: '2026-08-05 : 2026-08-18',
};

test('equal periods use a short day-count footer', () => {
  expect(getBigNumberPeriodLabel(period)).toBe('两期均 13 天');
});

test('unequal periods retain both day counts without normalizing totals', () => {
  expect(
    getBigNumberPeriodLabel({
      ...period,
      comparisonTimeRange: '2026-08-05 : 2026-09-05',
    }),
  ).toBe('当前 13 天 · 对比 31 天（期间长度不同）');
});

test.each([
  { a: 13000, b: 31000, expected: '对比值 31000\n差额 -18000 · 变化率 -58.1%' },
  { a: -50, b: -100, expected: '对比值 -100\n差额 +50 · 变化率 +50.0%' },
  { a: 50, b: 0, expected: '对比值 0\n差额 +50 · 变化率 —' },
])(
  'two-line summary preserves complete-period arithmetic for $a / $b',
  ({ a, b, expected }) => {
    expect(formatBigNumberPeriodComparison(a, b, String)).toBe(expected);
  },
);
