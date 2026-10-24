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
/** Regression coverage for the real period-stack and paint-order pipelines. */
import {
  init,
  setPlatformAPI,
  type BarSeriesOption,
  type EChartsOption,
} from 'echarts';
import { GenericDataType } from '@apache-superset/core/common';
import { ComparisonType, ensureIsArray } from '@superset-ui/core';
import timeseries from '../src/Timeseries/transformProps';
import mixed from '../src/MixedTimeseries/transformProps';
import { DEFAULT_FORM_DATA as TIMESERIES_DEFAULTS } from '../src/Timeseries/constants';
import { DEFAULT_FORM_DATA as MIXED_DEFAULTS } from '../src/MixedTimeseries/types';
import { StackControlsValue } from '../src/constants';
import { applyComparisonStyles } from '../src/utils/comparisonStyles';
import { buildLegendGroupMetadata } from '../src/utils/series';
import { createEchartsTimeseriesTestChartProps } from './helpers';

const absolute = '2026-10-09 : 2026-10-16';
const periods = ['1 day ago', '1 week ago'];
const query = (data: Record<string, unknown>[]) => ({
  annotation_data: null,
  data,
  colnames: ['sku'],
  coltypes: [GenericDataType.String],
  label_map: Object.fromEntries(
    Object.keys(data[0]).map(name => [name, [name]]),
  ),
  status: 'success',
});
function rows(offsets: string[], prefix = '') {
  return [
    {
      sku: 'positive',
      [`${prefix}sales`]: 40,
      [`${prefix}profit`]: 60,
      ...Object.fromEntries(
        offsets.flatMap((offset, index) => [
          [`${prefix}sales, ${offset}`, 10 + index * 10],
          [`${prefix}profit, ${offset}`, 20 + index * 10],
        ]),
      ),
    },
    {
      sku: 'negative',
      [`${prefix}sales`]: -4,
      [`${prefix}profit`]: -6,
      ...Object.fromEntries(
        offsets.flatMap((offset, index) => [
          [`${prefix}sales, ${offset}`, -1 - index],
          [`${prefix}profit, ${offset}`, -2 - index],
        ]),
      ),
    },
    {
      sku: 'missing',
      [`${prefix}sales`]: null,
      [`${prefix}profit`]: 0,
      ...Object.fromEntries(
        offsets.flatMap(offset => [
          [`${prefix}sales, ${offset}`, null],
          [`${prefix}profit, ${offset}`, 0],
        ]),
      ),
    },
  ];
}
function props(
  kind: 'ordinary' | 'mixed',
  offsets: string[],
  expand = false,
  onlyTotal = false,
) {
  const extra = offsets.includes(absolute)
    ? {
        time_compare: offsets,
        custom_form_data: {
          custom_period_comparison: {
            currentTimeRange: '2026-10-16 : 2026-10-23',
            comparisonTimeRange: absolute,
            timeColumn: 'event_date',
          },
        },
      }
    : { time_compare: offsets };
  const result = createEchartsTimeseriesTestChartProps({
    defaultFormData: kind === 'ordinary' ? TIMESERIES_DEFAULTS : MIXED_DEFAULTS,
    defaultVizType:
      kind === 'ordinary' ? 'echarts_timeseries_bar' : 'mixed_timeseries',
    formData: {
      x_axis: 'sku',
      metrics: ['sales', 'profit'],
      metricsB: ['other-sales', 'other-profit'],
      groupby: [],
      groupbyB: [],
      orientation: 'horizontal',
      seriesType: 'bar',
      seriesTypeB: 'bar',
      stack: expand ? StackControlsValue.Expand : StackControlsValue.Stack,
      stackB: true,
      time_compare: offsets,
      time_compare_b: offsets,
      extra_form_data: extra,
      comparison_type: ComparisonType.Values,
      comparison_type_b: ComparisonType.Values,
      showQueryIdentifiers: true,
      showValue: true,
      showValueB: true,
      onlyTotal,
      onlyTotalB: onlyTotal,
      percentageThreshold: 0,
      yAxisFormat: ',.0f',
      yAxisFormatSecondary: ',.0f',
    },
    queriesData:
      kind === 'ordinary'
        ? [query(rows(offsets))]
        : [query(rows(offsets)), query(rows(offsets, 'other-'))],
  });
  return result;
}
function render(
  options: EChartsOption,
  verify: (chart: ReturnType<typeof init>) => void,
) {
  setPlatformAPI({ measureText: text => ({ width: String(text).length * 7 }) });
  const chart = init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 900,
    height: 280,
  });
  const series = ensureIsArray(options.series) as BarSeriesOption[];
  try {
    chart.setOption({
      ...options,
      animation: false,
      legend: {
        selected: Object.fromEntries(
          series.map(entry => [String(entry.name), true]),
        ),
      },
    });
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    verify(chart);
  } finally {
    chart.dispose();
  }
}

test.each(['ordinary', 'mixed'] as const)(
  '%s multi-metric histories occupy independent real stacks with signed segments',
  kind => {
    const input = props(kind, periods);
    const before = JSON.stringify(input.queriesData);
    const output = (kind === 'ordinary' ? timeseries : mixed)(input as never);
    const series = output.echartOptions.series as BarSeriesOption[];
    expect(new Set(series.map(entry => entry.stack)).size).toBe(
      kind === 'ordinary' ? 3 : 6,
    );
    render(output.echartOptions as EChartsOption, chart => {
      const totals = new Map<string, number[]>();
      series.forEach((entry, index) => {
        const data = chart.getModel().getSeriesByIndex(index).getData();
        const dim = data.getCalculationInfo('stackResultDimension');
        const values = [Number(data.get(dim, 0)), Number(data.get(dim, 1))];
        const current = totals.get(String(entry.stack)) ?? [0, 0];
        totals.set(String(entry.stack), [
          Math.max(current[0], values[0]),
          Math.min(current[1], values[1]),
        ]);
      });
      expect([...totals.values()].sort((a, b) => a[0] - b[0])).toEqual(
        kind === 'ordinary'
          ? [
              [30, -3],
              [50, -5],
              [100, -10],
            ]
          : [
              [30, -3],
              [30, -3],
              [50, -5],
              [50, -5],
              [100, -10],
              [100, -10],
            ],
      );
    });
    expect(JSON.stringify(input.queriesData)).toBe(before);
  },
);

test.each(['ordinary', 'mixed'] as const)(
  '%s custom absolute history keeps each metric in its own period stack',
  kind => {
    const input = props(kind, [absolute]);
    const output = (kind === 'ordinary' ? timeseries : mixed)(input as never);
    const series = output.echartOptions.series as BarSeriesOption[];
    expect(new Set(series.map(entry => entry.stack)).size).toBe(
      kind === 'ordinary' ? 2 : 4,
    );
    expect(
      series
        .filter(entry => String(entry.name).includes(absolute))
        .every(
          entry =>
            entry.itemStyle?.color === 'transparent' &&
            entry.itemStyle?.borderType === 'dashed',
        ),
    ).toBe(true);
  },
);

test('percent stacked current and each history normalize independently, retaining missing values', () => {
  const output = timeseries(props('ordinary', periods, true) as never);
  const series = output.echartOptions.series as BarSeriesOption[];
  const byPeriod = new Map<string, number>();
  series.forEach(entry => {
    const value = (entry.data?.[0] as unknown[])[0];
    const period =
      periods.find(offset => String(entry.name).includes(offset)) ?? 'current';
    byPeriod.set(period, (byPeriod.get(period) ?? 0) + Number(value));
    const missing = entry.data?.[2] as unknown[];
    expect(missing[0] == null || Number.isFinite(Number(missing[0]))).toBe(
      true,
    );
  });
  expect([...byPeriod.values()]).toEqual([1, 1, 1]);
});

test.each(['ordinary', 'mixed'] as const)(
  '%s total labels never add current and historical amounts together',
  kind => {
    const output = (kind === 'ordinary' ? timeseries : mixed)(
      props(kind, periods, false, true) as never,
    );
    const series = output.echartOptions.series as BarSeriesOption[];
    const labels = series.flatMap((entry, seriesIndex) => {
      const formatter = entry.label?.formatter;
      if (typeof formatter !== 'function') return [];
      const label = formatter({
        value: entry.data?.[0],
        dataIndex: 0,
        seriesIndex,
        seriesName: entry.name,
      } as never);
      return label === '' ? [] : [Number(label)];
    });
    expect(labels.sort((a, b) => a - b)).toEqual(
      kind === 'ordinary' ? [30, 50, 100] : [30, 30, 50, 50, 100, 100],
    );
  },
);

test('a shorter historical overlay paints after the current fill regardless of input order and repeated styling', () => {
  const source = {
    animation: false,
    xAxis: { type: 'value' as const },
    yAxis: { type: 'category' as const, data: ['SKU'] },
    series: [
      {
        name: 'history',
        type: 'bar' as const,
        barGap: '-100%',
        data: [[60, 'SKU']],
        itemStyle: { color: '#1FA8C9' },
      },
      {
        name: 'current',
        type: 'bar' as const,
        barGap: '-100%',
        data: [[100, 'SKU']],
        itemStyle: { color: '#1FA8C9' },
      },
    ],
  };
  const metadata = buildLegendGroupMetadata(
    [
      { name: 'current', currentLabel: 'sales' },
      { name: 'history', currentLabel: 'sales', timeOffset: 'B' },
    ],
    true,
  );
  const once = applyComparisonStyles(source, metadata);
  const twice = applyComparisonStyles(once, metadata, once);
  expect(
    (twice.series as BarSeriesOption[]).map(entry => [entry.name, entry.data]),
  ).toEqual(source.series.map(entry => [entry.name, entry.data]));
  render(twice as EChartsOption, chart => {
    const history = chart
      .getModel()
      .getSeriesByIndex(0)
      .getData()
      .getItemGraphicEl(0);
    const current = chart
      .getModel()
      .getSeriesByIndex(1)
      .getData()
      .getItemGraphicEl(0);
    const marks = chart.getZr().storage.getDisplayList(true);
    expect(marks.indexOf(history)).toBeGreaterThan(marks.indexOf(current));
    expect(history.z).toBeGreaterThan(current.z);
  });
});
