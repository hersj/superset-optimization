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
  ComparisonType,
  CustomPeriodComparison,
  CurrencyFormatter,
  DataRecord,
  getCustomComparisonBucketDate,
  getNumberFormatter,
  getPeriodDayCount,
  getTimeFormatter,
  LegendState,
  NumberFormatter,
  NumberFormats,
  sanitizeHtml as sanitizeTooltipHtml,
  TimeGranularity,
  TimeFormatter,
  ValueFormatter,
} from '@superset-ui/core';
import { getOriginalSeries, getTimeOffset } from '@superset-ui/chart-controls';
import { format } from 'echarts/core';
import { sanitizeHtml } from './series';

interface TooltipPoint {
  seriesId?: unknown;
  seriesName?: unknown;
  value?: unknown;
  marker?: unknown;
}

interface TooltipSeries {
  id?: unknown;
  name?: unknown;
  data?: unknown;
  itemStyle?: { color?: unknown };
}

export const CUSTOM_TIME_TEXT_COLOR = '#1f2937';
export const CUSTOM_PERIOD_TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  borderColor: '#d1d5db',
  borderWidth: 1,
  textStyle: { color: CUSTOM_TIME_TEXT_COLOR },
};

const comparisonLabels: Record<string, string> = {
  [ComparisonType.Values]: '对比',
  [ComparisonType.Difference]: '差额',
  [ComparisonType.Percentage]: '变化率',
  [ComparisonType.Ratio]: '比值',
};

/** Keep resampling/rolling values inside their actual selected period bounds. */
export function maskCustomPeriodCurrentData(
  data: DataRecord[],
  xAxis: string,
  period: CustomPeriodComparison | undefined,
  timeGrain = 'P1D',
  comparisonType: string = ComparisonType.Values,
): DataRecord[] {
  if (!period) return data;
  const current = { ...period, comparisonTimeRange: period.currentTimeRange };
  return data.map(row => {
    const hasCurrent =
      row[xAxis] != null &&
      Boolean(getCustomComparisonBucketDate(row[xAxis], current, timeGrain));
    const hasComparison =
      row[xAxis] != null &&
      Boolean(getCustomComparisonBucketDate(row[xAxis], period, timeGrain));
    if (hasCurrent && hasComparison) return row;
    const result = { ...row };
    Object.keys(result).forEach(key => {
      const historicalValue =
        key === period.comparisonTimeRange ||
        Boolean(getTimeOffset({ name: key }, [period.comparisonTimeRange]));
      const selected = historicalValue
        ? hasComparison &&
          (hasCurrent || comparisonType === ComparisonType.Values)
        : hasCurrent;
      if (key !== xAxis && typeof result[key] === 'number' && !selected)
        result[key] = null;
    });
    return result;
  });
}

/** Shared calendar labels use business dates, independent of browser timezone. */
export function getCustomTimeUnitFormatter(timeGrain: string): TimeFormatter {
  if (!timeGrain.startsWith('P3M')) {
    return getTimeFormatter(undefined, timeGrain as TimeGranularity);
  }
  return new TimeFormatter({
    id: `custom_time_${timeGrain}`,
    formatFunc: date => {
      const businessDate = getTimeFormatter(
        undefined,
        TimeGranularity.DAY,
      )(date);
      const [year, month] = businessDate.split('-');
      const end = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      end.setUTCMonth(end.getUTCMonth() + 2);
      const endYear = end.getUTCFullYear();
      const endMonth = end.getUTCMonth() + 1;
      return Number(year) === endYear
        ? `${year}年${Number(month)}–${endMonth}月`
        : `${year}年${Number(month)}月–${endYear}年${endMonth}月`;
    },
  });
}

/** Only CustomTime emits both native grain and comparison keys, including OFF []. */
export function getCustomTimeControlledFormatter(extraFormData?: {
  time_grain_sqla?: unknown;
  time_compare?: unknown;
}): TimeFormatter | undefined {
  if (
    typeof extraFormData?.time_grain_sqla !== 'string' ||
    !Object.prototype.hasOwnProperty.call(extraFormData, 'time_compare')
  )
    return undefined;
  return getCustomTimeUnitFormatter(extraFormData.time_grain_sqla);
}

/** Display an inclusive compact interval while keeping the real legend key intact. */
export function formatCustomPeriodLegendLabel(
  period: CustomPeriodComparison,
  metric?: string,
): string {
  if (metric) return `${metric} · 对比`;
  const [start, end] = period.comparisonTimeRange.split(/\s+:\s+/);
  const last = new Date(Date.parse(end) - 86400000).toISOString().slice(0, 10);
  if (last === start) return `对比 ${start}`;
  const compactEnd =
    start.slice(0, 4) === last.slice(0, 4) ? last.slice(5) : last;
  return `对比 ${start} ～ ${compactEnd}`;
}

/** Pairs visible A/B series at one aligned bucket without changing chart data. */
export function formatCustomPeriodTooltip({
  params,
  series,
  period,
  timeGrain = 'P1D',
  temporalAxis = true,
  xIndex = 0,
  yIndex = 1,
  itemTooltip = false,
  legendState,
  focusedSeries,
  selectedSeries,
  formatterForSeries,
  comparisonTypeForSeries = () => ComparisonType.Values,
  originalSeriesForKey,
  isComparisonForSeries,
}: {
  params: TooltipPoint[];
  series: TooltipSeries[];
  period: CustomPeriodComparison;
  timeGrain?: string;
  temporalAxis?: boolean;
  xIndex?: number;
  yIndex?: number;
  itemTooltip?: boolean;
  legendState?: LegendState;
  focusedSeries?: string | null;
  selectedSeries?: string | null;
  formatterForSeries: (key: string) => ValueFormatter;
  comparisonTypeForSeries?: (key: string) => string;
  originalSeriesForKey?: (key: string) => string;
  isComparisonForSeries?: (key: string) => boolean;
}): string {
  const offset = period.comparisonTimeRange;
  const original =
    originalSeriesForKey ?? ((key: string) => getOriginalSeries(key, [offset]));
  const isComparison =
    isComparisonForSeries ??
    ((key: string) =>
      key === offset || Boolean(getTimeOffset({ name: key }, [offset])));
  const keyOf = (point: TooltipPoint) =>
    String(point.seriesId ?? point.seriesName ?? '');
  const points = params.filter(
    point => legendState?.[String(point.seriesName ?? keyOf(point))] !== false,
  );
  const xValue = Array.isArray(params[0]?.value)
    ? params[0].value[xIndex]
    : undefined;
  const sameBucket = (value: unknown) => {
    if (String(value) === String(xValue)) return true;
    if (!temporalAxis) return false;
    if (
      !(value instanceof Date) &&
      typeof value !== 'string' &&
      typeof value !== 'number'
    )
      return false;
    if (
      !(xValue instanceof Date) &&
      typeof xValue !== 'string' &&
      typeof xValue !== 'number'
    )
      return false;
    return (
      (value instanceof Date ? value.getTime() : new Date(value).getTime()) ===
      (xValue instanceof Date ? xValue.getTime() : new Date(xValue).getTime())
    );
  };

  // Item tooltips contain one point; recover only its visible paired series.
  if (itemTooltip && points[0]) {
    const hovered = original(keyOf(points[0]));
    series.forEach(entry => {
      const key = String(entry.id ?? entry.name ?? '');
      if (
        original(key) !== hovered ||
        legendState?.[String(entry.name ?? key)] === false ||
        points.some(point => keyOf(point) === key) ||
        !Array.isArray(entry.data)
      )
        return;
      const datum = entry.data.find(point => {
        const value = Array.isArray(point) ? point : point?.value;
        return Array.isArray(value) && sameBucket(value[xIndex]);
      });
      if (datum === undefined) return;
      const value = Array.isArray(datum) ? datum : datum?.value;
      const color = entry.itemStyle?.color;
      points.push({
        seriesId: key,
        seriesName: entry.name,
        value,
        marker: typeof color === 'string' ? format.getTooltipMarker(color) : '',
      });
    });
  }

  const paired = new Map<
    string,
    { current?: TooltipPoint; comparison?: TooltipPoint }
  >();
  points.forEach(point => {
    const key = keyOf(point);
    const name = original(key);
    if (!name || (selectedSeries && name !== original(selectedSeries))) return;
    const row = paired.get(name) ?? {};
    if (isComparison(key)) row.comparison = point;
    else row.current = point;
    paired.set(name, row);
  });
  const labelForRow = (row: {
    current?: TooltipPoint;
    comparison?: TooltipPoint;
  }) =>
    comparisonLabels[
      comparisonTypeForSeries(keyOf(row.comparison ?? row.current ?? {}))
    ] ?? '对比';
  const labels = new Set([...paired.values()].map(labelForRow));
  const comparisonLabel =
    labels.size <= 1 ? ([...labels][0] ?? '对比') : '对比结果';
  const dateLabel = (comparisonTimeRange: string) => {
    if (!temporalAxis) return '整期';
    if (comparisonTimeRange === period.currentTimeRange) {
      const currentDate =
        xValue instanceof Date
          ? xValue
          : typeof xValue === 'number' || typeof xValue === 'string'
            ? new Date(xValue)
            : undefined;
      return currentDate && Number.isFinite(currentDate.getTime())
        ? getCustomTimeUnitFormatter(timeGrain)(currentDate)
        : '—';
    }
    const date = getCustomComparisonBucketDate(
      xValue,
      { ...period, comparisonTimeRange },
      timeGrain,
    );
    if (!date) return '—';
    return getCustomTimeUnitFormatter(timeGrain)(
      new Date(`${date}T00:00:00+08:00`),
    );
  };
  const header = (label: string, date: string) =>
    `${label}<div style="font-size:12px;font-weight:400;opacity:0.75;margin-top:2px;">${sanitizeHtml(date)}</div>`;
  const cellValue = (point?: TooltipPoint) => {
    const value = Array.isArray(point?.value) ? point.value[yIndex] : undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const key = keyOf(point ?? {});
    let formatter = formatterForSeries(key);
    if (isComparison(key)) {
      const type = comparisonTypeForSeries(key);
      const isNumericPercent =
        formatter instanceof NumberFormatter &&
        !(formatter instanceof CurrencyFormatter) &&
        formatter.id.includes('%');
      if (type === ComparisonType.Percentage && !isNumericPercent) {
        formatter = getNumberFormatter(NumberFormats.PERCENT_2_POINT);
      } else if (
        type === ComparisonType.Ratio &&
        (formatter instanceof CurrencyFormatter || isNumericPercent)
      ) {
        formatter = getNumberFormatter(NumberFormats.SMART_NUMBER);
      }
    }
    return sanitizeHtml(String(formatter(value)));
  };
  const rows = [...paired].map(([name, row]) => {
    const marker = row.current?.marker ?? row.comparison?.marker;
    const emphasis =
      focusedSeries && name === original(focusedSeries)
        ? 'font-weight:700;'
        : 'opacity:0.85;';
    const label =
      labels.size > 1 && labelForRow(row) !== '对比'
        ? `${labelForRow(row)} `
        : '';
    return `<tr style="${emphasis}"><td>${typeof marker === 'string' ? marker : ''}${sanitizeHtml(name)}</td><td style="text-align:right;padding-left:16px;">${cellValue(row.current)}</td><td style="text-align:right;padding-left:16px;">${label}${cellValue(row.comparison)}</td></tr>`;
  });
  const category =
    !temporalAxis && xValue !== undefined
      ? `<div style="font-weight:700;margin-bottom:6px;">${sanitizeHtml(String(xValue))}</div>`
      : '';
  const currentDays = getPeriodDayCount(period.currentTimeRange);
  const comparisonDays = getPeriodDayCount(period.comparisonTimeRange);
  const periodLine = (label: string, range: string, days: number) => {
    const [start, end] = range.split(/\s+:\s+/);
    const last = new Date(Date.parse(end) - 86400000)
      .toISOString()
      .slice(0, 10);
    return `<div style="white-space:nowrap;">${sanitizeHtml(`${label}：${start} ～ ${last}（${days} 天）`)}</div>`;
  };
  return sanitizeTooltipHtml(`<div style="background-color:#fff;color:#1f2937;">${category}<table style="border-collapse:collapse;">
    <thead><tr><th style="text-align:left;">指标</th><th style="text-align:right;padding-left:16px;">${header('当前', dateLabel(period.currentTimeRange))}</th><th style="text-align:right;padding-left:16px;">${header(comparisonLabel, dateLabel(offset))}</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>
    <div style="max-width:360px;white-space:normal;font-size:11px;line-height:1.5;opacity:0.7;margin-top:8px;">${periodLine('当前', period.currentTimeRange, currentDays)}${periodLine('对比', offset, comparisonDays)}<div>完整期间总量${currentDays !== comparisonDays ? ' · 期间长度不同' : ''}${temporalAxis ? ' · 历史参考' : ''}</div></div></div>`);
}
