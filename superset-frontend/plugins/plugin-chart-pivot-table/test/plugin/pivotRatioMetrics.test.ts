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
  getPivotRatioConfiguration,
  PIVOT_RATIO_DENOMINATOR_FIELD,
  PIVOT_RATIO_NUMERATOR_FIELD,
  unpivotPivotTableData,
} from '../../src/plugin/pivotRatioMetrics';

test('reuses one helper when the same SQL appears in numerator and denominator roles', () => {
  const configuration = getPivotRatioConfiguration({
    rate1: {
      pivotRatioNumerator: 'SUM(shared_value)',
      pivotRatioDenominator: 'SUM(sales)',
    },
    rate2: {
      pivotRatioNumerator: 'SUM(cost)',
      pivotRatioDenominator: 'SUM(shared_value)',
    },
  });

  expect(
    configuration.helperMetrics.filter(
      metric => metric.sqlExpression === 'SUM(shared_value)',
    ),
  ).toHaveLength(1);
  expect(configuration.metricRatioComponents.rate2.denominatorLabel).toBe(
    configuration.metricRatioComponents.rate1.numeratorLabel,
  );
});

test('keeps a ratio row when its displayed value is null so components reach totals', () => {
  const result = unpivotPivotTableData(
    [
      {
        period: '2026-01',
        rate: null,
        sales: 10,
        shipped: 0,
        ordinary: null,
      },
      {
        period: '2026-02',
        rate: 0.2,
        sales: 20,
        shipped: 100,
        ordinary: 5,
      },
    ],
    ['rate', 'ordinary'],
    {
      rate: {
        numeratorLabel: 'sales',
        denominatorLabel: 'shipped',
      },
    },
    'Metric',
  );

  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        period: '2026-01',
        Metric: 'rate',
        value: null,
        [PIVOT_RATIO_NUMERATOR_FIELD]: 10,
        [PIVOT_RATIO_DENOMINATOR_FIELD]: 0,
      }),
    ]),
  );
  expect(result).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        period: '2026-01',
        Metric: 'ordinary',
      }),
    ]),
  );
});
