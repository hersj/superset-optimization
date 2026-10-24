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
import type { BarSeriesOption, LineSeriesOption, SeriesOption } from 'echarts';
import type { LegendGroupMetadata } from './series';
import tinycolor from 'tinycolor2';

/** Period appearance never changes metric identity, values, ordering or filtering. */
export function styleComparisonSeries(
  series: SeriesOption[],
  metadata: LegendGroupMetadata,
  backgroundColor = '#fff',
): void {
  const outlineColor = (
    color: NonNullable<BarSeriesOption['itemStyle']>['borderColor'],
  ) =>
    typeof color === 'string'
      ? (tinycolor(backgroundColor).isDark()
          ? tinycolor(color).brighten(18)
          : tinycolor(color).darken(18)
        ).toHexString()
      : color;
  const byName = new Map(series.map(entry => [String(entry.name), entry]));
  const kinds = new Map<string, 'current' | 'comparison'>();
  Object.entries(metadata.groups).forEach(([group, members]) =>
    members.forEach(name => kinds.set(name, metadata.kinds[group])),
  );
  const currentBars = series.filter(
    entry =>
      entry.type === 'bar' && kinds.get(String(entry.name)) === 'current',
  );
  const currentBarZ = Math.max(2, ...currentBars.map(entry => entry.z ?? 2));
  const currentBarZLevel = Math.max(
    0,
    ...currentBars.map(entry => entry.zlevel ?? 0),
  );
  series.forEach(entry => {
    const name = String(entry.name);
    const kind = kinds.get(name);
    if (!kind) return;
    const historical = kind === 'comparison';
    const parent = byName.get(metadata.parents[name]);
    const sourceColor =
      (parent as LineSeriesOption | undefined)?.itemStyle?.color ??
      (entry as LineSeriesOption).itemStyle?.color;
    const color = typeof sourceColor === 'function' ? undefined : sourceColor;
    if (entry.type === 'line') {
      const line = entry as LineSeriesOption;
      line.lineStyle = {
        ...line.lineStyle,
        ...(historical && color !== undefined ? { color } : {}),
        type: historical ? 'dashed' : 'solid',
      };
      if (historical) {
        line.itemStyle = {
          ...line.itemStyle,
          ...(color !== undefined ? { color } : {}),
        };
        if (line.areaStyle) line.areaStyle = { ...line.areaStyle, opacity: 0 };
        for (const state of ['emphasis', 'blur', 'select'] as const) {
          line[state] = {
            ...line[state],
            lineStyle: {
              ...line[state]?.lineStyle,
              type: 'dashed',
              ...(color !== undefined ? { color } : {}),
            },
          };
        }
      }
    } else if (entry.type === 'bar') {
      const bar = entry as BarSeriesOption;
      if (historical) {
        // A transparent outline must paint after the current fill, even when sorted first.
        bar.z = Math.max(bar.z ?? 2, currentBarZ + 1);
        bar.zlevel = Math.max(bar.zlevel ?? 0, currentBarZLevel);
      }
      const style = (
        itemStyle: BarSeriesOption['itemStyle'],
        pairedColor = color,
      ) => ({
        ...itemStyle,
        decal: undefined,
        ...(historical
          ? {
              color: 'transparent',
              ...(pairedColor !== undefined
                ? { borderColor: outlineColor(pairedColor) }
                : {}),
              borderType: 'dashed' as const,
              borderWidth: 2,
            }
          : { borderWidth: 0, borderType: 'solid' as const }),
      });
      bar.itemStyle = style(bar.itemStyle);
      if (historical)
        for (const state of ['emphasis', 'blur', 'select'] as const) {
          bar[state] = {
            ...bar[state],
            itemStyle: style(bar[state]?.itemStyle),
          };
        }
      const parentData = parent?.type === 'bar' ? parent.data : undefined;
      if (
        bar.data?.some(
          datum =>
            datum &&
            typeof datum === 'object' &&
            !Array.isArray(datum) &&
            'itemStyle' in datum,
        )
      ) {
        bar.data = bar.data.map((datum, index) => {
          if (
            !datum ||
            typeof datum !== 'object' ||
            Array.isArray(datum) ||
            !('itemStyle' in datum)
          )
            return datum;
          const paired = parentData?.[index];
          const pairedColor =
            paired &&
            typeof paired === 'object' &&
            !Array.isArray(paired) &&
            'itemStyle' in paired
              ? paired.itemStyle?.color
              : undefined;
          const datumColor = pairedColor ?? datum.itemStyle?.color ?? color;
          return {
            ...datum,
            itemStyle: style(
              datum.itemStyle,
              typeof datumColor === 'function' ? color : datumColor,
            ),
          };
        });
      }
    } else if (entry.type === 'scatter' && historical) {
      entry.itemStyle = {
        ...entry.itemStyle,
        color: 'transparent',
        borderColor: outlineColor(color),
        borderType: 'dashed',
        borderWidth: 2,
      };
    } else if (entry.type === 'custom' && historical && color !== undefined) {
      // Matrix renderItem owns the dashed rectangle; its visual color stays metric-based.
      entry.itemStyle = { ...entry.itemStyle, color: outlineColor(color) };
    }
  });
}

/** Apply after chart/skin overrides; retain the generated series' data contract. */
export function applyComparisonStyles(
  options: EChartsCoreOption,
  metadata?: LegendGroupMetadata,
  reference: EChartsCoreOption = options,
  backgroundColor = '#fff',
): EChartsCoreOption {
  if (!metadata || !Object.values(metadata.kinds).includes('comparison'))
    return options;
  const overridden = ensureIsArray(options.series as SeriesOption[]);
  const historicalNames = new Set(
    Object.entries(metadata.groups)
      .filter(([group]) => metadata.kinds[group] === 'comparison')
      .flatMap(([, members]) => members),
  );
  const series = ensureIsArray(reference.series as SeriesOption[]).map(
    (entry, index) =>
      ({
        ...entry,
        ...overridden[index],
        name: entry.name,
        id: entry.id,
        type: entry.type,
        data: entry.data,
        itemStyle: {
          ...(entry as LineSeriesOption).itemStyle,
          ...(overridden[index] as LineSeriesOption)?.itemStyle,
        },
        ...(entry.type === 'line'
          ? {
              lineStyle: {
                ...entry.lineStyle,
                ...(overridden[index] as LineSeriesOption)?.lineStyle,
              },
            }
          : {}),
        ...(historicalNames.has(String(entry.name)) &&
        (entry.type === 'line' ||
          entry.type === 'bar' ||
          entry.type === 'scatter')
          ? {
              itemStyle: {
                ...entry.itemStyle,
                ...(overridden[index] as LineSeriesOption)?.itemStyle,
                opacity: entry.itemStyle?.opacity ?? 1,
              },
              ...(entry.type === 'line'
                ? {
                    lineStyle: {
                      ...entry.lineStyle,
                      ...(overridden[index] as LineSeriesOption)?.lineStyle,
                      opacity: entry.lineStyle?.opacity ?? 1,
                    },
                  }
                : {}),
            }
          : {}),
        ...(entry.type === 'custom'
          ? { renderItem: entry.renderItem, encode: entry.encode }
          : {}),
      }) as SeriesOption,
  );
  styleComparisonSeries(series, metadata, backgroundColor);
  return { ...options, series };
}
