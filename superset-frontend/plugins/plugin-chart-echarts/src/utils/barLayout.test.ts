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
import { layoutCategoryBars } from './barLayout';
import type { BarSeriesOption } from 'echarts';

test('automatic ranking fits readable single-line rows without manual geometry', () => {
  const before = {
    yAxis: { data: ['A', 'B'] },
    series: [
      {
        name: 'sales',
        type: 'bar' as const,
        data: [
          [10, 'A'],
          [20, 'B'],
        ],
      },
    ],
  };
  const layout = layoutCategoryBars(before, 900, { A: 'A', B: 'B' });
  expect(layout.minCategoryHeight).toBe(32);
  expect(layout.echartOptions.dataZoom ?? []).toEqual([]);
  expect(layout.echartOptions.series).toEqual([
    expect.objectContaining({ barWidth: 22 }),
  ]);
});

test('nineteen stacked fees do not reserve nineteen separate lanes per period', () => {
  const series: BarSeriesOption[] = Array.from({ length: 19 }, (_, i) => ({
    name: `fee-${i}`,
    type: 'bar',
    stack: 'current',
    data: [[10, 'A']],
  }));
  const layout = layoutCategoryBars({ yAxis: { data: ['A'] }, series }, 900, {
    A: 'SKU A',
  });
  expect(layout.minCategoryHeight).toBeLessThanOrEqual(56);
  expect(layout.echartOptions.series).toHaveLength(19);
});

test('narrow cards retain room for bars and stable identity with long labels', () => {
  const value = 'TL-长名称-实际差异规格-唯一编码';
  const layout = layoutCategoryBars(
    {
      yAxis: { data: [value] },
      series: [{ name: 'sales', type: 'bar', data: [[10, value]] }],
    },
    360,
    { [value]: value },
  );
  expect(layout.echartOptions.grid).toMatchObject({ containLabel: false });
  const grid = layout.echartOptions.grid as { left: number; right: number };
  expect(360 - grid.left - grid.right).toBeGreaterThanOrEqual(130);
  expect(layout.echartOptions.yAxis).toMatchObject({ data: [value] });
});

test('disjoint color-by-category series share a centered lane', () => {
  const names = ['A', 'B', 'C'];
  const layout = layoutCategoryBars(
    {
      yAxis: { data: names },
      series: names.map((name, index) => ({
        type: 'bar' as const,
        name,
        data: names.map((category, row) => [
          index === row ? 10 : null,
          category,
        ]),
      })),
    },
    900,
    Object.fromEntries(names.map(name => [name, name])),
  );
  expect(layout.minCategoryHeight).toBe(32);
  expect(layout.echartOptions.series).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ barGap: '-100%', barWidth: 22 }),
    ]),
  );
});
