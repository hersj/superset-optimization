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
  init,
  setPlatformAPI,
  type BarSeriesOption,
  type LineSeriesOption,
} from 'echarts';
import { applyComparisonStyles } from './comparisonStyles';
import { buildLegendGroupMetadata } from './series';

const metadata = buildLegendGroupMetadata(
  [
    { name: 'current', currentLabel: 'sales' },
    { name: 'history', currentLabel: 'sales', timeOffset: '1 month ago' },
  ],
  true,
);

test.each([false, true])(
  'real historical bars render a full dashed outline with signed/NULL values, horizontal=%s',
  horizontal => {
    setPlatformAPI({
      measureText: text => ({ width: String(text).length * 7 }),
    });
    const values = [100, -40, null];
    const series: BarSeriesOption[] = ['current', 'history'].map(
      (name, index) => ({
        name,
        id: name,
        type: 'bar',
        itemStyle: { color: index ? '#f00' : '#168ca8', opacity: 0.7 },
        data: values.map(value =>
          value == null ? null : value * (index ? 0.6 : 1),
        ),
      }),
    );
    const options = {
      animation: false,
      xAxis: {
        type: horizontal ? ('value' as const) : ('category' as const),
        ...(horizontal ? {} : { data: ['A', 'B', 'C'] }),
      },
      yAxis: {
        type: horizontal ? ('category' as const) : ('value' as const),
        ...(horizontal ? { data: ['A', 'B', 'C'] } : {}),
      },
      series,
    };
    const result = applyComparisonStyles(options, metadata);
    const output = result.series as BarSeriesOption[];
    expect(output.map(entry => entry.type)).toEqual(['bar', 'bar']);
    expect(output.map(entry => entry.data)).toEqual(
      series.map(entry => entry.data),
    );
    expect(output[1].itemStyle).toMatchObject({
      color: 'transparent',
      borderColor: '#0b4857',
      borderType: 'dashed',
      borderWidth: 2,
      opacity: 0.7,
    });
    const chart = init(null, undefined, {
      renderer: 'svg',
      ssr: true,
      width: 800,
      height: 400,
    });
    try {
      chart.setOption(result);
      const svg = chart.renderToSVGString();
      expect(svg).toContain('stroke-dasharray');
      expect(svg).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  },
);

test('chart and theme style overrides cannot change current/history appearance or generated identities', () => {
  const source = {
    series: [
      {
        id: 'a',
        name: 'current',
        type: 'line' as const,
        data: [[1, 100]],
        itemStyle: { color: '#168ca8' },
        lineStyle: { type: 'dashed' as const },
      },
      {
        id: 'b',
        name: 'history',
        type: 'line' as const,
        data: [[1, 60]],
        itemStyle: { color: '#f00' },
        lineStyle: { type: 'solid' as const },
        areaStyle: { opacity: 0.9 },
      },
    ],
  };
  const overridden = {
    yAxis: { axisLabel: { formatter: '{value}%' } },
    series: [
      {
        name: 'wrong-a',
        type: 'bar' as const,
        data: [[0, 900]],
        lineStyle: { type: 'dashed' as const, color: '#168ca8' },
      },
      {
        name: 'wrong-b',
        type: 'scatter' as const,
        data: [[0, 999]],
        lineStyle: { type: 'solid' as const },
      },
    ],
  };
  const output = applyComparisonStyles(overridden, metadata, source);
  const series = output.series as LineSeriesOption[];
  expect(
    series.map(entry => [entry.id, entry.name, entry.type, entry.data]),
  ).toEqual(
    source.series.map(entry => [entry.id, entry.name, entry.type, entry.data]),
  );
  expect(series[0].lineStyle?.type).toBe('solid');
  expect(series[1].lineStyle).toMatchObject({
    type: 'dashed',
    color: '#168ca8',
  });
  expect(series[1].areaStyle?.opacity).toBe(0);
  expect(output.yAxis).toEqual(overridden.yAxis);
});

test('per-category historical bar outlines retain their paired category colors and no extra data', () => {
  const data = [
    { value: [100, 'A'], itemStyle: { color: '#168ca8' } },
    { value: [-10, 'B'], itemStyle: { color: '#a81632' } },
  ];
  const output = applyComparisonStyles(
    {
      series: [
        { name: 'current', type: 'bar', data },
        {
          name: 'history',
          type: 'bar',
          data: data.map(entry => ({
            ...entry,
            value: [Number(entry.value[0]) * 0.5, entry.value[1]],
            itemStyle: { color: '#f00' },
          })),
        },
      ],
    },
    metadata,
  );
  const historical = (output.series as BarSeriesOption[])[1].data as {
    value: unknown;
    itemStyle: { borderColor: string };
  }[];
  expect(historical.map(entry => entry.itemStyle.borderColor)).toHaveLength(2);
  expect(historical[0].itemStyle.borderColor).not.toBe(
    historical[1].itemStyle.borderColor,
  );
  expect(historical.map(entry => entry.value)).toEqual([
    [50, 'A'],
    [-5, 'B'],
  ]);
});

test('charts with no identified historical series preserve their original options', () => {
  const options = {
    series: [{ name: 'slice', type: 'pie' as const, data: [1, 2] }],
  };
  expect(applyComparisonStyles(options)).toBe(options);
});

test.each(['#fff', '#141414'])(
  'short historical bars remain visible over current fill on surface %s',
  surface => {
    const output = applyComparisonStyles(
      {
        series: [
          {
            name: 'current',
            type: 'bar',
            data: [100],
            itemStyle: { color: '#168ca8' },
          },
          {
            name: 'history',
            type: 'bar',
            data: [60],
            itemStyle: { color: '#168ca8' },
          },
        ],
      },
      metadata,
      undefined,
      surface,
    );
    const bars = output.series as BarSeriesOption[];
    expect(bars[1].itemStyle?.borderColor).not.toBe(bars[0].itemStyle?.color);
    expect(bars[1].itemStyle?.color).toBe('transparent');
    expect(bars[1].itemStyle?.borderType).toBe('dashed');
    expect(bars[1].data).toEqual([60]);
  },
);

test('dense fee history styling adds neither series nor data points', () => {
  const rows = 500,
    metrics = 43;
  const entries = Array.from({ length: metrics }, (_, metric) => [
    {
      name: `fee-${metric}`,
      type: 'bar' as const,
      data: Array.from({ length: rows }, (_, row) => [row + 1, `SKU-${row}`]),
      itemStyle: { color: '#168ca8' },
    },
    {
      name: `fee-${metric}__period`,
      type: 'bar' as const,
      data: Array.from({ length: rows }, (_, row) => [row / 2, `SKU-${row}`]),
      itemStyle: { color: '#168ca8' },
    },
  ]).flat();
  const groups = buildLegendGroupMetadata(
    entries.map(entry => ({
      name: entry.name,
      currentLabel: entry.name.replace('__period', ''),
      ...(entry.name.endsWith('__period') ? { timeOffset: 'period' } : {}),
    })),
    true,
  );
  const started = performance.now();
  const output = applyComparisonStyles({ series: entries }, groups);
  console.info(
    'HISTORY_STYLE_PERF',
    JSON.stringify({
      rows,
      metrics,
      series: entries.length,
      points: rows * entries.length,
      elapsedMs: performance.now() - started,
    }),
  );
  expect(output.series as BarSeriesOption[]).toHaveLength(entries.length);
  expect(
    (output.series as BarSeriesOption[]).map(entry => entry.data?.length),
  ).toEqual(entries.map(entry => entry.data.length));
  expect((output.series as BarSeriesOption[])[1].data).toEqual(entries[1].data);
});
