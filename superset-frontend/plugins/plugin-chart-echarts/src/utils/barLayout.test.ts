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
import { init, setPlatformAPI, type BarSeriesOption } from 'echarts';

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

test('native scrollbar gutter leaves full numeric labels inside the rendered SVG', () => {
  setPlatformAPI({ measureText: text => ({ width: String(text).length * 7 }) });
  const layout = layoutCategoryBars(
    {
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: ['A'] },
      series: [
        {
          name: 'sales',
          type: 'bar',
          data: [[100, 'A']],
          label: { show: true, formatter: '253,697', position: 'right' },
        },
      ],
    },
    900,
    { A: 'A' },
  );
  const chart = init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 884,
    height: 64,
  });
  try {
    chart.setOption(layout.echartOptions);
    const text = chart
      .getZr()
      .storage.getDisplayList(true)
      .find(mark => 'text' in mark.style && mark.style.text === '253,697')!;
    const bounds = text.getBoundingRect().clone();
    const transform = text.getComputedTransform();
    if (transform) bounds.applyTransform(transform);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(882);
  } finally {
    chart.dispose();
  }
});

test('real ranking keeps historical bars as dashed outlines without adding a row lane', () => {
  setPlatformAPI({ measureText: text => ({ width: String(text).length * 7 }) });
  const series: BarSeriesOption[] = [
    { name: 'sales', id: 'current', type: 'bar', data: [[100, 'SKU']], itemStyle: { color: '#168ca8' } },
    { name: '1 month ago', id: 'history', type: 'bar', data: [[60, 'SKU']], itemStyle: { color: '#168ca8' } },
  ];
  const metadata = {
    groups: { sales: ['sales'], '1 month ago': ['1 month ago'] },
    labels: { sales: 'sales', '1 month ago': 'sales' },
    kinds: { sales: 'current' as const, '1 month ago': 'comparison' as const },
    parents: { '1 month ago': 'sales' },
    stateKeys: { sales: 'current:sales', '1 month ago': 'comparison:1 month ago' },
  };
  const result = layoutCategoryBars({
    xAxis: { type: 'value' }, yAxis: { type: 'category', data: ['SKU'] },
    legend: { selected: { sales: true, '1 month ago': true } }, series,
  }, 900, { SKU: 'SKU' }, metadata, ['1 month ago']);
  const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 900, height: 120 });
  try {
    chart.setOption({ ...result.echartOptions, animation: false });
    expect(chart.renderToSVGString()).toContain('stroke-dasharray');
    expect((result.echartOptions.series as BarSeriesOption[]).map(entry => entry.type)).toEqual(['bar', 'bar']);
    expect((result.echartOptions.series as BarSeriesOption[]).map(entry => entry.id)).toEqual(['current', 'history']);
    expect(result.minCategoryHeight).toBeLessThanOrEqual(36);
  } finally { chart.dispose(); }
});
