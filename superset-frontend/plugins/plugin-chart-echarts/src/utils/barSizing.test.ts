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
import type { BarSeriesOption, SeriesOption } from 'echarts';
import { applyAutomaticBarSizing } from './barSizing';

const bars = (count: number, stack?: string): BarSeriesOption[] =>
  Array.from({ length: count }, (_, index) => ({
    type: 'bar',
    name: `metric-${index}`,
    stack,
    data: [[10, -index], [20, null]],
    label: { show: true, formatter: '{c}' },
  }));

test('automatic sizing counts shared stacks once and respects hidden series', () => {
  const grouped = applyAutomaticBarSizing({ series: bars(10) }, 180);
  const stacked = applyAutomaticBarSizing({ series: bars(10, 'total') }, 180);
  const hidden = applyAutomaticBarSizing(
    {
      series: bars(10),
      legend: { selected: Object.fromEntries(bars(9).map(entry => [entry.name, false])) },
    },
    180,
  );
  expect((grouped.series as BarSeriesOption[])[0].barMaxWidth).toBe(4);
  expect((stacked.series as BarSeriesOption[])[0].barMaxWidth).toBe(28);
  expect((hidden.series as BarSeriesOption[])[0].barMaxWidth).toBe(28);
});

test('automatic sizing preserves time spacing, values, axes and formatter references', () => {
  const series = bars(2);
  const xAxis = { type: 'time' as const };
  const yAxis = [{ type: 'value' as const }, { type: 'value' as const, axisLabel: { formatter: '{value}%' } }];
  const tooltip = { show: true };
  const options = { series, xAxis, yAxis, tooltip };
  const original = JSON.stringify(options);
  const result = applyAutomaticBarSizing(options, 600);
  expect(result.xAxis).toBe(xAxis);
  expect(result.yAxis).toBe(yAxis);
  expect(result.tooltip).toBe(tooltip);
  (result.series as BarSeriesOption[]).forEach((entry, index) => {
    expect(entry.data).toBe(series[index].data);
    expect(entry.label).toBe(series[index].label);
    expect(entry.name).toBe(series[index].name);
    expect(entry.barMaxWidth).toBe(28);
    expect(entry.labelLayout).toMatchObject({ hideOverlap: true });
  });
  expect(JSON.stringify(options)).toBe(original);
});

test('fixed width is retired while label positioning and non-bar series remain intact', () => {
  const line = { type: 'line' as const, name: 'margin', data: [[10, 0.2]] };
  const labelLayout = jest.fn(() => ({ x: 17, align: 'right' as const }));
  const result = applyAutomaticBarSizing(
    { series: [{ ...bars(1)[0], barWidth: 120, barMinWidth: 90, labelLayout }, line] },
    300,
  );
  const [bar, unchangedLine] = result.series as SeriesOption[];
  expect(bar).not.toHaveProperty('barWidth');
  expect(bar).not.toHaveProperty('barMinWidth');
  expect(unchangedLine).toBe(line);
  expect(typeof bar.labelLayout).toBe('function');
  if (typeof bar.labelLayout === 'function') {
    expect(bar.labelLayout({} as Parameters<typeof bar.labelLayout>[0])).toMatchObject({ x: 17, align: 'right', hideOverlap: true });
  }
  expect(labelLayout).toHaveBeenCalledTimes(1);
});

test.each([0, 1, 200, Number.NaN])('automatic sizing is finite for a %s-pixel container', width => {
  const result = applyAutomaticBarSizing({ series: bars(43) }, width);
  expect((result.series as BarSeriesOption[])[0].barMaxWidth).toBeGreaterThan(0);
  expect((result.series as BarSeriesOption[])[0].barMaxWidth).toBeLessThanOrEqual(28);
});

test('non-bar charts do not acquire bar layout settings', () => {
  const options = { series: [{ type: 'line' as const, data: [1, 2] }] };
  expect(applyAutomaticBarSizing(options, 600)).toBe(options);
});
