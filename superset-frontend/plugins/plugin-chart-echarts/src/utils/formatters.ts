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
  CurrencyFormatter,
  ensureIsArray,
  getSellerfoxSundayWeekLabel,
  getNumberFormatter,
  getTimeFormatter,
  isSavedMetric,
  NumberFormats,
  QueryFormMetric,
  SMART_DATE_DETAILED_ID,
  SMART_DATE_ID,
  SMART_DATE_VERBOSE_ID,
  TimeFormatter,
  TimeGranularity,
  ValueFormatter,
} from '@superset-ui/core';

export function isWeekGrain(timeGrain?: string): boolean {
  return (
    timeGrain === TimeGranularity.WEEK ||
    timeGrain === TimeGranularity.WEEK_STARTING_SUNDAY ||
    timeGrain === TimeGranularity.WEEK_STARTING_MONDAY ||
    timeGrain === TimeGranularity.WEEK_ENDING_SATURDAY ||
    timeGrain === TimeGranularity.WEEK_ENDING_SUNDAY ||
    timeGrain === 'P1W_SUN'
  );
}

function isQuarterGrain(timeGrain: string): boolean {
  return timeGrain === TimeGranularity.QUARTER || timeGrain === 'P3M_FISCAL';
}

function isDayGrain(timeGrain: string): boolean {
  return (
    timeGrain === TimeGranularity.DAY || timeGrain === TimeGranularity.DATE
  );
}

function isSubHourGrain(timeGrain: string): boolean {
  return (
    timeGrain === TimeGranularity.HOUR ||
    timeGrain === TimeGranularity.THIRTY_MINUTES ||
    timeGrain === TimeGranularity.FIFTEEN_MINUTES ||
    timeGrain === TimeGranularity.TEN_MINUTES ||
    timeGrain === TimeGranularity.FIVE_MINUTES ||
    timeGrain === TimeGranularity.MINUTE ||
    timeGrain === TimeGranularity.SECOND
  );
}

function getSundayWeekNum(date: Date): number {
  const year = date.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const firstSunday = new Date(jan1.getTime());
  firstSunday.setDate(jan1.getDate() + (jan1Day === 0 ? 0 : 7 - jan1Day));
  if (date < firstSunday) return 0;
  return (
    Math.floor((date.getTime() - firstSunday.getTime()) / (7 * 86400000)) + 1
  );
}

function getFiscalQuarter(month: number): string {
  if (month >= 3 && month <= 5) return 'Q1';
  if (month >= 6 && month <= 8) return 'Q2';
  if (month >= 9 && month <= 11) return 'Q3';
  return 'Q4';
}

function formatByGrain(date: Date, timeGrain: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  if (timeGrain === TimeGranularity.YEAR) {
    return `${y}年`;
  }
  if (timeGrain === TimeGranularity.FISCAL_YEAR || timeGrain === 'P1Y_FISCAL') {
    // 与核心财年口径共用 UTC+8，避免浏览器时区把 4 月 1 日移到 3 月。
    return getTimeFormatter(undefined, TimeGranularity.FISCAL_YEAR)(date);
  }
  if (isQuarterGrain(timeGrain)) {
    const q = getFiscalQuarter(date.getMonth());
    return `${y}年${q}`;
  }
  if (timeGrain === TimeGranularity.MONTH) {
    return `${y}年${m}月`;
  }
  if (isWeekGrain(timeGrain)) {
    if (timeGrain === 'P1W_SUN') return getSellerfoxSundayWeekLabel(date);
    return `${y}年第${getSundayWeekNum(date)}周`;
  }
  if (isDayGrain(timeGrain)) {
    return `${y}-${m}-${d}`;
  }
  if (isSubHourGrain(timeGrain)) {
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
  }
  return `${y}-${m}-${d}`;
}

export const getSmartDateDetailedFormatter = () =>
  getTimeFormatter(SMART_DATE_DETAILED_ID);

export const getSmartDateFormatter = (timeGrain?: string) => {
  const baseFormatter = getTimeFormatter(SMART_DATE_ID);

  if (!timeGrain) {
    return baseFormatter;
  }

  return new TimeFormatter({
    id: SMART_DATE_ID,
    label: 'Grain-aware smart date',
    useLocalTime: true,
    formatFunc: (date: Date) => formatByGrain(date, timeGrain),
  });
};

export const getSmartDateVerboseFormatter = (timeGrain?: string) => {
  const baseFormatter = getTimeFormatter(SMART_DATE_VERBOSE_ID);

  if (!timeGrain) {
    return baseFormatter;
  }

  return new TimeFormatter({
    id: SMART_DATE_VERBOSE_ID,
    label: 'Grain-aware verbose date',
    useLocalTime: true,
    formatFunc: (date: Date) => formatByGrain(date, timeGrain),
  });
};

export const getPercentFormatter = (format?: string) =>
  getNumberFormatter(
    !format || format === NumberFormats.SMART_NUMBER
      ? NumberFormats.PERCENT
      : format,
  );

export const getYAxisFormatter = (
  metrics: QueryFormMetric[],
  forcePercentFormatter: boolean,
  customFormatters: Record<string, ValueFormatter>,
  defaultFormatter: ValueFormatter,
  format?: string,
) => {
  if (forcePercentFormatter) {
    return getPercentFormatter(format);
  }
  const metricsArray = ensureIsArray(metrics);
  if (
    metricsArray.every(isSavedMetric) &&
    metricsArray
      .map(metric => customFormatters[metric])
      .every(
        (formatter, _, formatters) =>
          formatter instanceof CurrencyFormatter &&
          (formatter as CurrencyFormatter)?.currency?.symbol ===
            (formatters[0] as CurrencyFormatter)?.currency?.symbol,
      )
  ) {
    return customFormatters[metricsArray[0]];
  }
  return defaultFormatter ?? getNumberFormatter();
};

export function getTooltipTimeFormatter(
  format?: string,
  timeGrain?: string,
): TimeFormatter | StringConstructor {
  if (timeGrain) {
    return getSmartDateVerboseFormatter(timeGrain);
  }
  if (format === SMART_DATE_ID || !format) {
    return getSmartDateVerboseFormatter(timeGrain);
  }
  return getTimeFormatter(format);
}

export function getXAxisFormatter(
  format?: string,
  timeGrain?: string,
): TimeFormatter | StringConstructor | undefined {
  if (format === SMART_DATE_ID || !format) {
    return getSmartDateFormatter(timeGrain);
  }
  if (format) {
    return getTimeFormatter(format);
  }
  return String;
}
