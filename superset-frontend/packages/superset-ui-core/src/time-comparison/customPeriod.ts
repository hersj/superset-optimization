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
import { QueryFormData, QueryObject } from '../query';
import { DataRecord } from '../types';

export const CUSTOM_PERIOD_SUFFIX = 'custom_period';
const DAY = 86400000;
export interface CustomPeriodComparison {
  currentTimeRange: string;
  comparisonTimeRange: string;
  timeColumn?: string;
}

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Periods require ISO calendar dates');
  const result = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(result) ||
    new Date(result).toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Invalid calendar date');
  }
  return result;
}

function bounds(range: string): [number, number] {
  const parts = range.split(' : ');
  if (parts.length !== 2)
    throw new Error('Select a finite current and comparison period');
  const start = dateValue(parts[0]);
  const end = dateValue(parts[1]);
  if (start >= end) throw new Error('Period end must follow its start');
  return [start, end];
}

export function getPeriodDayCount(range: string): number {
  const [start, end] = bounds(range);
  return (end - start) / DAY;
}

export function createCustomPeriodComparison(
  currentTimeRange: string,
  start: string,
  end: string,
  timeColumn?: string,
): CustomPeriodComparison {
  bounds(currentTimeRange);
  const first = dateValue(start);
  const last = dateValue(end);
  if (first > last) throw new Error('Comparison end precedes its start');
  const comparisonTimeRange = `${start} : ${new Date(last + DAY).toISOString().slice(0, 10)}`;
  bounds(comparisonTimeRange);
  return {
    currentTimeRange,
    comparisonTimeRange,
    ...(timeColumn ? { timeColumn } : {}),
  };
}

export function getCustomPeriodComparison(
  formData: QueryFormData,
): CustomPeriodComparison | undefined {
  const value =
    formData.extra_form_data?.custom_form_data?.custom_period_comparison;
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid custom comparison');
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.currentTimeRange !== 'string' ||
    typeof candidate.comparisonTimeRange !== 'string' ||
    (candidate.timeColumn != null && typeof candidate.timeColumn !== 'string')
  ) {
    throw new Error('Invalid custom comparison');
  }
  bounds(candidate.currentTimeRange);
  bounds(candidate.comparisonTimeRange);
  return candidate as unknown as CustomPeriodComparison;
}

export function formatCustomPeriodComparisonLabel(
  period: CustomPeriodComparison,
): string {
  const format = (range: string) => {
    const [start, end] = bounds(range);
    return `${new Date(start).toISOString().slice(0, 10)} ～ ${new Date(end - DAY).toISOString().slice(0, 10)}，${(end - start) / DAY} 天`;
  };
  const unequal =
    getPeriodDayCount(period.currentTimeRange) !==
    getPeriodDayCount(period.comparisonTimeRange);
  return `当前：${format(period.currentTimeRange)}；对比：${format(period.comparisonTimeRange)}；按完整期间总量比较${unequal ? '（期间长度不同，总量变化受天数影响）' : ''}`;
}

export function buildCustomPeriodComparisonQuery(
  query: QueryObject,
  period: CustomPeriodComparison,
): QueryObject {
  bounds(period.currentTimeRange);
  bounds(period.comparisonTimeRange);
  const timeColumn = period.timeColumn || query.granularity;
  const extras = { ...query.extras };
  // Nested extras reject time_compare; each custom period has its own bounds.
  delete extras.time_compare;
  delete extras.instant_time_comparison_range;
  return {
    ...query,
    time_range: period.comparisonTimeRange,
    since: undefined,
    until: undefined,
    time_shift: undefined,
    time_offsets: [],
    time_compare: [],
    extras,
    filters: query.filters?.map(filter =>
      filter.op === 'TEMPORAL_RANGE' && filter.col === timeColumn
        ? { ...filter, val: period.comparisonTimeRange }
        : filter,
    ),
  };
}

export function calculatePeriodDifference(
  a: unknown,
  b: unknown,
): {
  valueDifference: number | null;
  percentDifferenceNum: number | null;
} {
  if (
    typeof a !== 'number' ||
    typeof b !== 'number' ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  ) {
    return { valueDifference: null, percentDifferenceNum: null };
  }
  const valueDifference = a - b;
  return {
    valueDifference,
    percentDifferenceNum: b === 0 ? null : valueDifference / Math.abs(b),
  };
}

function bucket(value: unknown, start: number, grain: string): number {
  const text =
    typeof value === 'number'
      ? new Date(value).toISOString().slice(0, 10)
      : value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
  const date = new Date(dateValue(text));
  const origin = new Date(start);
  const months =
    (date.getUTCFullYear() - origin.getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    origin.getUTCMonth();
  if (grain === 'P1M') return months;
  if (grain.startsWith('P3M')) {
    const fiscalShift = grain === 'P3M_FISCAL' ? 3 : 0;
    return (
      Math.floor(
        (date.getUTCFullYear() * 12 + date.getUTCMonth() - fiscalShift) / 3,
      ) -
      Math.floor(
        (origin.getUTCFullYear() * 12 + origin.getUTCMonth() - fiscalShift) / 3,
      )
    );
  }
  if (grain.startsWith('P1Y')) {
    const fiscalShift = grain === 'P1Y_FISCAL' ? 3 : 0;
    return (
      Math.floor(
        (date.getUTCFullYear() * 12 + date.getUTCMonth() - fiscalShift) / 12,
      ) -
      Math.floor(
        (origin.getUTCFullYear() * 12 + origin.getUTCMonth() - fiscalShift) /
          12,
      )
    );
  }
  if (grain.startsWith('P1W')) {
    const weekStart = grain === 'P1W_SUN' ? 0 : 1;
    const floorWeek = (d: Date) =>
      d.getTime() / DAY - ((d.getUTCDay() - weekStart + 7) % 7);
    return (floorWeek(date) - floorWeek(origin)) / 7;
  }
  if (grain !== 'P1D')
    throw new Error(`Unsupported comparison time grain: ${grain}`);
  return (date.getTime() - start) / DAY;
}

/** Both periods are independently aggregated; missing rows never become zero. */
export function mergeCustomPeriodComparisonRows(
  current: DataRecord[],
  comparison: DataRecord[],
  dimensions: string[],
  metrics: string[],
  period: CustomPeriodComparison,
  timeGrain = 'P1D',
  temporalDimensions: string[] = [],
): DataRecord[] {
  const starts = [
    bounds(period.currentTimeRange)[0],
    bounds(period.comparisonTimeRange)[0],
  ];
  const timeDimensions = new Set(temporalDimensions);
  const entries = new Map<
    string,
    {
      row: DataRecord;
      keys: unknown[];
      dates: Record<string, [unknown, unknown]>;
    }
  >();
  [current, comparison].forEach((rows, side) => {
    const seen = new Set<string>();
    rows.forEach(row => {
      const keys = dimensions.map(dim =>
        timeDimensions.has(dim)
          ? bucket(row[dim], starts[side], timeGrain)
          : row[dim],
      );
      const key = JSON.stringify(keys);
      if (seen.has(key))
        throw new Error('Duplicate dimension key in period query');
      seen.add(key);
      let entry = entries.get(key);
      if (!entry) {
        entry = { row: {}, keys, dates: {} };
        dimensions.forEach(dim => {
          entry!.row[dim] = row[dim];
        });
        metrics.forEach(metric => {
          entry!.row[metric] = null;
          entry!.row[`${metric}__${CUSTOM_PERIOD_SUFFIX}`] = null;
        });
        entries.set(key, entry);
      }
      metrics.forEach(metric => {
        entry!.row[side === 0 ? metric : `${metric}__${CUSTOM_PERIOD_SUFFIX}`] =
          row[metric] ?? null;
      });
      temporalDimensions.forEach(dim => {
        const dates = entry!.dates[dim] || [null, null];
        dates[side] = row[dim];
        entry!.dates[dim] = dates;
      });
    });
  });
  const result = [...entries.values()];
  result.sort((a, b) => {
    for (const dim of temporalDimensions) {
      const index = dimensions.indexOf(dim);
      const diff = Number(a.keys[index]) - Number(b.keys[index]);
      if (diff) return diff;
    }
    return 0;
  });
  const unit = timeGrain.startsWith('P1W')
    ? '周'
    : timeGrain.startsWith('P1M')
      ? '月'
      : timeGrain.startsWith('P3M')
        ? '季度'
        : timeGrain.startsWith('P1Y')
          ? '年'
          : '天';
  return result.map(entry => {
    temporalDimensions.forEach(dim => {
      const [a, b] = entry.dates[dim] || [];
      const format = (value: unknown) =>
        value == null
          ? '—'
          : typeof value === 'number' || value instanceof Date
            ? (value instanceof Date ? value : new Date(value))
                .toISOString()
                .slice(0, 10)
            : String(value).slice(0, 10);
      entry.row[dim] =
        `第${Number(entry.keys[dimensions.indexOf(dim)]) + 1}${unit} · 当前 ${format(a)} / 对比 ${format(b)}`;
    });
    return entry.row;
  });
}
