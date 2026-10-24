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
import { ensureIsArray } from '@superset-ui/core';
import type { EChartsCoreOption } from 'echarts/core';
import type {
  SeriesOption,
  YAXisComponentOption,
  BarSeriesOption,
} from 'echarts';
import type { LegendGroupMetadata } from './series';

/** Lay out categorical horizontal bars once, using visible stack groups as lanes. */
export function layoutCategoryBars(
  options: EChartsCoreOption,
  width: number,
  labels: Record<string, string>,
  groups?: LegendGroupMetadata,
  offsets: string[] = [],
) {
  const [axis] = ensureIsArray(options.yAxis as YAXisComponentOption[]);
  const series = ensureIsArray(options.series as SeriesOption[]);
  const selected = ensureIsArray(options.legend)[0]?.selected ?? {};
  const visible = (name: string) => {
    const group = Object.keys(groups?.groups ?? {}).find(key =>
      groups?.groups[key].includes(name),
    );
    return (
      selected[name] !== false &&
      (!group || selected[groups?.stateKeys[group] ?? group] !== false)
    );
  };
  const isComparison = (name: string) => {
    const group = Object.keys(groups?.groups ?? {}).find(key =>
      groups?.groups[key].includes(name),
    );
    return (
      offsets.includes(name) || (group && groups?.kinds[group] === 'comparison')
    );
  };
  const bars = series.filter(
    (entry): entry is BarSeriesOption => entry.type === 'bar',
  );
  const current = bars.filter(entry => !isComparison(String(entry.name)));
  const countLanes = (entries: BarSeriesOption[]) => {
    const slots = new Map<string, Set<string>>();
    entries.forEach((entry, index) => {
      if (!visible(String(entry.name))) return;
      (entry.data ?? []).forEach((datum, row) => {
        const value =
          datum &&
          typeof datum === 'object' &&
          !Array.isArray(datum) &&
          'value' in datum
            ? datum.value
            : datum;
        const amount = Array.isArray(value) ? value[0] : value;
        if (amount == null || !Number.isFinite(Number(amount))) return;
        const category = String(
          Array.isArray(value) ? value[1] : (axis?.data?.[row] ?? row),
        );
        const lane = entry.stack ? `stack:${entry.stack}` : `series:${index}`;
        if (!slots.has(category)) slots.set(category, new Set());
        slots.get(category)!.add(lane);
      });
    });
    return Math.max(1, ...Array.from(slots.values(), slots => slots.size));
  };
  // Disjoint color-by-category series share a lane; comparisons overlay only one current lane.
  const ticks = new Set(
    countLanes(current) === 1 && current.every(entry => !entry.stack)
      ? bars
          .filter(entry => isComparison(String(entry.name)))
          .map(entry => entry.name)
      : [],
  );
  const laneCount = countLanes(bars.filter(entry => !ticks.has(entry.name)));
  const thickness = laneCount === 1 ? 22 : laneCount <= 3 ? 16 : 12;
  const textWidth = (text: string) =>
    Array.from(text).reduce(
      (n, c) => n + (c.codePointAt(0)! > 255 ? 13 : 7),
      0,
    );
  const labelWidth = Math.max(
    60,
    Math.min(
      width * 0.32,
      260,
      Math.max(
        100,
        ...Object.values(labels).flatMap(label =>
          label.split('\n').map(textWidth),
        ),
      ),
    ),
  );
  const right = Math.min(92, Math.max(48, width * 0.16));
  const left = Math.min(labelWidth + 28, Math.max(70, width - right - 130));
  const lines = Math.max(
    1,
    ...Object.values(labels).map(label => label.split('\n').length),
  );
  const minCategoryHeight = Math.max(
    32,
    Math.min(lines, 3) * 13 + 6,
    laneCount * (thickness + 4) + 6,
  );
  const categories = (axis?.data ?? []).map(String);
  const ranks = new Map(
    categories.map((value, index) => [
      value,
      axis?.inverse ? index + 1 : categories.length - index,
    ]),
  );
  const single = laneCount === 1;
  return {
    minCategoryHeight,
    echartOptions: {
      ...options,
      grid: {
        ...ensureIsArray(options.grid)[0],
        left,
        right,
        top: 8,
        bottom: 24,
        containLabel: false,
      },
      dataZoom: [],
      legend: { ...ensureIsArray(options.legend)[0], show: false },
      yAxis: {
        ...axis,
        axisLabel: {
          ...axis?.axisLabel,
          formatter: (value: string) =>
            `${ranks.get(value) ?? ''}  ${labels[value] ?? value}`,
          width: Math.max(40, left - 12),
          margin: left - 4,
          align: 'left',
          verticalAlign: 'middle',
          inside: false,
          padding: 0,
          lineHeight: 13,
          fontSize: 12,
          overflow: 'truncate',
          interval: 0,
          hideOverlap: false,
        },
      },
      series: series.map(entry => {
        if (entry.type !== 'bar') return entry;
        if (ticks.has(entry.name))
          return {
            ...entry,
            type: 'scatter',
            symbol: 'rect',
            symbolSize: [3, thickness + 4],
            itemStyle: { ...entry.itemStyle, opacity: 0.7 },
            label: { ...entry.label, show: false },
            z: 5,
          };
        return {
          ...entry,
          barWidth: thickness,
          barMaxWidth: thickness,
          barGap: single ? '-100%' : '20%',
          barCategoryGap: '25%',
          labelLayout: single
            ? () => ({
                x: width - 24,
                align: 'right' as const,
                verticalAlign: 'middle' as const,
                hideOverlap: true,
              })
            : { hideOverlap: true },
        };
      }),
    } as EChartsCoreOption,
  };
}
