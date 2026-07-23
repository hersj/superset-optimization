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
import { makeSingleton } from '../utils';
import TimeFormatterRegistry from './TimeFormatterRegistry';
import TimeFormatter from './TimeFormatter';
import TimeFormatsForGranularity from './TimeFormatsForGranularity';
import { LOCAL_PREFIX } from './TimeFormats';
import { TimeGranularity } from './types';
import createTimeRangeFromGranularity from './utils/createTimeRangeFromGranularity';
import TimeRangeFormatter from './TimeRangeFormatter';

const getInstance = makeSingleton(TimeFormatterRegistry);

export default getInstance;

const BUSINESS_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad2(value: number) {
  return `${value}`.padStart(2, '0');
}

function getBusinessDate(date: Date) {
  return new Date(date.getTime() + BUSINESS_TIMEZONE_OFFSET_MS);
}

function getBusinessDateParts(date: Date) {
  const businessDate = getBusinessDate(date);

  return {
    year: businessDate.getUTCFullYear(),
    month: businessDate.getUTCMonth(),
    dayOfMonth: businessDate.getUTCDate(),
    dayOfWeek: businessDate.getUTCDay(),
  };
}

function formatBusinessDay(date: Date) {
  const { year, month, dayOfMonth } = getBusinessDateParts(date);

  return `${year}-${pad2(month + 1)}-${pad2(dayOfMonth)}`;
}

/**
 * 功能审计（可重写规格）：Sellerfox 周日开始的业务周编号
 * - 功能目的与触发方式：为日期筛选器、透视表和 ECharts 在 time_grain_sqla=P1W_SUN 时提供唯一且一致的周标签。
 * - 输入契约：输入任意有效 Date；按 Asia/Taipei（UTC+8）解释其业务日期，周区间固定为周日 00:00 至次周六 23:59:59。
 * - 输出契约：返回该周归属的业务年份和从 1 开始的周序号；格式化调用方据此显示“YYYY年第N周”。
 * - 处理流程：先取得业务日期和该日期所在周的周日，再以该周周六所在年份作为归属年，最后以归属年 1 月 1 日所在周的周日为第 1 周起点计算差值。
 * - 业务规则：包含某年 1 月 1 日的周日到周六必须是该年的第 1 周；例如 2025-12-28 至 2026-01-03 为 2026 年第 1 周，2026-06-21 至 2026-06-27 为第 26 周。
 * - 状态与副作用：纯函数，不读写数据库、缓存或浏览器状态。
 * - 外部依赖：仅依赖固定 UTC+8 业务时区；不得使用 ISO 周或“当年第一个周日”为第 1 周的规则。
 * - 异常与边界：Date 的有效性由既有 TimeFormatter 调用链保证；跨年周以周六所属年份归属，避免第 1 周显示为上一年。
 * - 不变量与约束：必须与后端 P1W_SUN 的周日起始分组保持一致；所有前端周标签调用此函数，禁止再次复制编号算法。
 * - 验证方式：TimeFormatterRegistrySingleton、Pivot Table formatter 和 ECharts 日期标签的边界日期单测覆盖。
 */
export function getSellerfoxSundayWeek(date: Date) {
  const { year, month, dayOfMonth } = getBusinessDateParts(date);
  const businessDate = new Date(Date.UTC(year, month, dayOfMonth));
  const weekStart = new Date(businessDate.getTime());
  weekStart.setUTCDate(businessDate.getUTCDate() - businessDate.getUTCDay());
  const weekEnd = new Date(weekStart.getTime());
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const weekYear = weekEnd.getUTCFullYear();
  const jan1 = new Date(Date.UTC(weekYear, 0, 1));
  const jan1Day = jan1.getUTCDay();
  const firstWeekStart = new Date(jan1.getTime());
  firstWeekStart.setUTCDate(jan1.getUTCDate() - jan1Day);

  return {
    year: weekYear,
    week:
      Math.floor(
        (weekStart.getTime() - firstWeekStart.getTime()) / (7 * 86400000),
      ) + 1,
  };
}

export function getSellerfoxSundayWeekLabel(date: Date) {
  const { year, week } = getSellerfoxSundayWeek(date);
  return `${year}年第${week}周`;
}

function getCalendarQuarterLabel(date: Date) {
  const { year, month } = getBusinessDateParts(date);
  const quarter = Math.floor(month / 3) + 1;

  return `${year}年Q${quarter}`;
}

function getFiscalQuarterLabel(date: Date) {
  const { year, month } = getBusinessDateParts(date);
  const fiscalYear = month < 3 ? year - 1 : year;
  const fiscalQuarter = month < 3 ? 4 : Math.floor((month - 3) / 3) + 1;

  return `${fiscalYear}年Q${fiscalQuarter}`;
}

function getBusinessTimeGrainFormatter(granularity: TimeGranularity) {
  let formatFunc: ((date: Date) => string) | undefined;

  switch (granularity) {
    case TimeGranularity.DATE:
    case TimeGranularity.DAY:
      formatFunc = formatBusinessDay;
      break;
    case TimeGranularity.MONTH:
      formatFunc = date => {
        const { year, month } = getBusinessDateParts(date);
        return `${year}年${month + 1}月`;
      };
      break;
    case TimeGranularity.QUARTER:
      formatFunc = getCalendarQuarterLabel;
      break;
    case TimeGranularity.FISCAL_QUARTER:
      formatFunc = getFiscalQuarterLabel;
      break;
    case TimeGranularity.YEAR:
      formatFunc = date => `${getBusinessDateParts(date).year}年`;
      break;
    case TimeGranularity.WEEK_STARTING_SUNDAY_SELLERFOX:
      formatFunc = getSellerfoxSundayWeekLabel;
      break;
    default:
      return undefined;
  }

  return new TimeFormatter({
    id: granularity,
    label: 'Business date grain',
    formatFunc: formatFunc as (date: Date) => string,
  });
}

export function getTimeRangeFormatter(formatId?: string) {
  return new TimeRangeFormatter({
    id: formatId || 'undefined',
    formatFunc: (range: (Date | number | null | undefined)[]) => {
      const format = getInstance().get(formatId);
      const [start, end] = range.map(value => format(value));
      return start === end ? start : [start, end].join(' — ');
    },
    useLocalTime: formatId?.startsWith(LOCAL_PREFIX),
  });
}

export function formatTimeRange(
  formatId: string | undefined,
  range: (Date | null | undefined)[],
) {
  return getTimeRangeFormatter(formatId)(range);
}

export function getTimeFormatter(
  formatId?: string,
  granularity?: TimeGranularity,
) {
  if (granularity) {
    if (!formatId) {
      const businessFormatter = getBusinessTimeGrainFormatter(granularity);
      if (businessFormatter) {
        return businessFormatter;
      }
    }

    const formatString = formatId || TimeFormatsForGranularity[granularity];
    const timeRangeFormatter = getTimeRangeFormatter(formatString);

    return new TimeFormatter({
      id: [formatString, granularity].join('/'),
      formatFunc: (value: Date) =>
        timeRangeFormatter.format(
          createTimeRangeFromGranularity(
            value,
            granularity,
            timeRangeFormatter.useLocalTime,
          ),
        ),
      useLocalTime: timeRangeFormatter.useLocalTime,
    });
  }

  return getInstance().get(formatId);
}

/**
 * Syntactic sugar for backward compatibility
 * TODO: will be deprecated in a future version
 * @param granularity
 */
export function getTimeFormatterForGranularity(granularity?: TimeGranularity) {
  return getTimeFormatter(undefined, granularity);
}

export function formatTime(
  formatId: string | undefined,
  value: Date | number | null | undefined,
  granularity?: TimeGranularity,
) {
  return getTimeFormatter(formatId, granularity)(value);
}
