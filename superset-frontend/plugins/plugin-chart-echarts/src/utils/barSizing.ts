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
import type { BarSeriesOption, SeriesOption } from 'echarts';
import type { EChartsCoreOption } from 'echarts/core';

/** Let ECharts allocate category/time bands and stack slots; bound only their thickness. */
export function applyAutomaticBarSizing(
  options: EChartsCoreOption,
  width: number,
): EChartsCoreOption {
  const series = ensureIsArray(options.series as SeriesOption[]);
  const bars = series.filter(
    (entry): entry is BarSeriesOption => entry.type === 'bar',
  );
  if (!bars.length) return options;
  const selected = Object.assign(
    {},
    ...ensureIsArray(options.legend).map(legend => legend.selected),
  ) as Record<string, boolean>;
  const visible = bars.filter(entry => selected[String(entry.name)] !== false);
  const slots = new Set(
    visible.map((entry, index) =>
      JSON.stringify([
        entry.xAxisIndex ?? 0,
        entry.yAxisIndex ?? 0,
        entry.stack || index,
      ]),
    ),
  ).size;
  const [grid] = ensureIsArray(options.grid);
  const pixels = (value: unknown, fallback: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.endsWith('%')) {
      const percent = Number.parseFloat(value);
      if (Number.isFinite(percent)) return (width * percent) / 100;
    }
    return fallback;
  };
  const plotWidth = Math.max(
    1,
    (Number.isFinite(width) ? width : 0) -
      pixels(grid?.left, 60) -
      pixels(grid?.right, 30),
  );
  const barMaxWidth = Math.max(
    2,
    Math.min(28, Math.floor(plotWidth / (Math.max(slots, 1) * 2))),
  );
  return {
    ...options,
    series: series.map(entry => {
      if (entry.type !== 'bar') return entry;
      const sized = { ...entry };
      // Saved fixed widths must not override the available category band.
      delete sized.barWidth;
      delete sized.barMinWidth;
      const layout = entry.labelLayout;
      const labelLayout: BarSeriesOption['labelLayout'] =
        typeof layout === 'function'
          ? params => ({ ...layout(params), hideOverlap: true })
          : { ...layout, hideOverlap: true };
      return {
        ...sized,
        barMaxWidth,
        barCategoryGap: '32%',
        barGap: '20%',
        labelLayout,
      };
    }),
  };
}
