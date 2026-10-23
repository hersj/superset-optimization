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
  ensureIsArray,
  type LegendState,
  type DataRecord,
} from '@superset-ui/core';
import type { EChartsCoreOption } from 'echarts/core';
import type {
  SeriesOption,
  YAXisComponentOption,
} from 'echarts/types/dist/shared';

export type SkuSelection = {
  names: string[];
  labels: Record<string, string>;
  values: Record<string, string>;
  selected: LegendState;
  axisValues?: Record<string, string>;
};

// Legacy SQL aliases may collide, while their series retain complete SKU keys.
export function expandSkuAliases(
  data: DataRecord[],
  field: string,
  seriesValues: Record<string, string>,
) {
  const axisValues: Record<string, string> = {};
  const entries = Object.entries(seriesValues).filter(
    ([key]) => key !== field && data.some(row => Object.hasOwn(row, key)),
  );
  const expanded = data.flatMap(row => {
    const values = [
      ...new Set(
        entries
          .filter(
            ([key]) =>
              row[key] != null &&
              (typeof row[key] !== 'number' || Number.isFinite(row[key])),
          )
          .map(([, value]) => value),
      ),
    ];
    return values.map(value => {
      axisValues[value] = String(row[field] ?? '');
      return {
        ...row,
        [field]: value,
        ...Object.fromEntries(
          entries
            .filter(([, sku]) => sku !== value)
            .map(([key]) => [key, null]),
        ),
      };
    });
  });
  return { data: expanded, axisValues };
}

// Display aliases never become data, filter, color or persistence keys.
export function buildSkuSelection(
  field: string,
  values: string[],
  state: LegendState = {},
): SkuSelection {
  const unique = [...new Set(values)].sort();
  const aliases = new Map<string, string[]>();
  unique.forEach(value => {
    const chars = Array.from(value);
    const parts = value.split('-');
    let headLength = Math.min(3, parts.length);
    while (/^\d+$/.test(parts[headLength] ?? '')) headLength += 1;
    const short =
      chars.reduce(
        (length, char) => length + (char.codePointAt(0)! > 255 ? 2 : 1),
        0,
      ) > 28 && parts.length > headLength + 3
        ? `${parts.slice(0, headLength).join('-')}\n${parts.slice(-3).join('-')}`
        : value;
    aliases.set(short, [...(aliases.get(short) ?? []), value]);
  });
  const labels: Record<string, string> = {};
  const fullValues: Record<string, string> = {};
  const selected: LegendState = {};
  const scopePrefix = `sku:${JSON.stringify([field]).slice(0, -1)},`;
  const hasSavedSelection = Object.keys(state).some(key =>
    key.startsWith(scopePrefix),
  );
  aliases.forEach((members, alias) => {
    const parts = members.map(value => value.split('-'));
    const differentPositions = Array.from(
      { length: Math.max(...parts.map(tokens => tokens.length)) },
      (_, index) => index,
    ).filter(index => new Set(parts.map(tokens => tokens[index])).size > 1);
    // Prefer the shortest real differing fields; add more only until all variants differ.
    const distinguishing: number[] = [];
    differentPositions.sort(
      (a, b) =>
        Math.max(...parts.map(tokens => (tokens[a] ?? '').length)) -
        Math.max(...parts.map(tokens => (tokens[b] ?? '').length)),
    );
    for (const position of differentPositions) {
      distinguishing.push(position);
      if (
        new Set(
          parts.map(tokens =>
            JSON.stringify(distinguishing.map(index => tokens[index])),
          ),
        ).size === members.length
      )
        break;
    }
    members.forEach(value => {
      const key = `sku:${JSON.stringify([field, value])}`;
      let label = alias;
      if (members.length > 1) {
        // Real differing tokens distinguish variants without changing their full-name keys.
        const tokens = value.split('-');
        label = `${alias} · ${distinguishing.map(index => tokens[index] ?? '∅').join(' · ')}`;
      }
      labels[key] = label;
      fullValues[key] = value;
      selected[key] = state[key] ?? !hasSavedSelection;
    });
  });
  const counts = new Map<string, number>();
  Object.values(labels).forEach(label =>
    counts.set(label, (counts.get(label) ?? 0) + 1),
  );
  Object.keys(labels).forEach(key => {
    const label = labels[key];
    if (counts.get(label)! > 1) {
      labels[key] = fullValues[key];
    }
  });
  return { names: Object.keys(labels), labels, values: fullValues, selected };
}

export type SkuRankingView = {
  comfortable: boolean;
  nameWidth: number;
  autoNameWidth?: boolean;
  range: boolean;
};
export const DEFAULT_SKU_RANKING_VIEW: SkuRankingView = {
  comfortable: false,
  nameWidth: 40,
  autoNameWidth: true,
  range: false,
};

export function restoreSkuRankingView(key?: string): SkuRankingView {
  try {
    const saved = JSON.parse(
      key ? (localStorage.getItem(key) ?? 'null') : 'null',
    );
    return {
      comfortable: saved?.comfortable === true,
      range: saved?.range === true,
      // Older preferences saved 40 even when only density or range changed.
      autoNameWidth:
        typeof saved?.autoNameWidth === 'boolean'
          ? saved.autoNameWidth
          : saved?.nameWidth == null || saved.nameWidth === 40,
      nameWidth:
        typeof saved?.nameWidth === 'number' && Number.isFinite(saved.nameWidth)
          ? Math.max(10, Math.min(55, saved.nameWidth))
          : 40,
    };
  } catch {
    return DEFAULT_SKU_RANKING_VIEW;
  }
}

// Preserve full identity in axis data; only the displayed alias and geometry change.
export function layoutSkuRanking(
  options: EChartsCoreOption,
  width: number,
  labels: Record<string, string>,
  barsPerRow: number,
  view: SkuRankingView = DEFAULT_SKU_RANKING_VIEW,
) {
  const textWidth = (line: string) =>
    Array.from(line).reduce(
      (pixels, char) => pixels + (char.codePointAt(0)! > 255 ? 13 : 7),
      0,
    );
  const automaticWidth = Math.min(
    280,
    Math.max(
      200,
      ...Object.values(labels).flatMap(label =>
        label.split('\n').map(textWidth),
      ),
    ),
  );
  const labelWidth = Math.max(
    100,
    Math.min(
      width - 180,
      view.autoNameWidth
        ? automaticWidth
        : Math.floor((width * view.nameWidth) / 100) - 32,
    ),
  );
  const lines = Math.max(
    1,
    ...Object.values(labels).map(label =>
      label
        .split('\n')
        .reduce(
          (count, line) =>
            count + Math.max(1, Math.ceil(textWidth(line) / labelWidth)),
          0,
        ),
    ),
  );
  const minCategoryHeight = Math.max(
    view.comfortable ? 52 : 36,
    lines * 14 + 8,
    28 + barsPerRow * 8,
  );
  const [axis] = ensureIsArray(options.yAxis as YAXisComponentOption[]);
  const categories = (axis?.data ?? []).map(String);
  const rank = new Map(
    categories.map((value, index) => [
      value,
      axis?.inverse ? index + 1 : categories.length - index,
    ]),
  );
  return {
    minCategoryHeight,
    echartOptions: {
      ...options,
      grid: {
        ...ensureIsArray(options.grid)[0],
        left: labelWidth + 48,
        right: 100,
        top: ensureIsArray(options.legend)[0]?.show === false ? 12 : 36,
        bottom: 28,
        containLabel: false,
      },
      yAxis: {
        ...axis,
        axisLabel: {
          ...axis?.axisLabel,
          formatter: (value: string) =>
            `${rank.get(value) ?? ''}  ${labels[value] ?? value}`,
          width: labelWidth + 24,
          inside: false,
          align: 'left',
          verticalAlign: 'middle',
          padding: 0,
          margin: labelWidth + 40,
          lineHeight: 14,
          fontSize: 13,
          overflow: 'break',
          interval: 0,
          hideOverlap: false,
        },
      },
      dataZoom: ensureIsArray(options.dataZoom).map(zoom => ({
        ...zoom,
        show: view.range,
        top: ensureIsArray(options.legend)[0]?.show === false ? 12 : 36,
        bottom: 28,
      })),
      series: ensureIsArray(options.series as SeriesOption[]).map(entry =>
        entry.type === 'bar'
          ? {
              ...entry,
              barMaxWidth: 10,
              labelLayout: () => ({ x: width - 48, align: 'right' as const }),
            }
          : entry,
      ),
    } as EChartsCoreOption,
  };
}
