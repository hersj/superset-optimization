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

function getSundayWeekNum(date: Date) {
  const { year, month, dayOfMonth } = getBusinessDateParts(date);
  const businessDate = new Date(Date.UTC(year, month, dayOfMonth));
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const jan1Day = jan1.getUTCDay();
  const firstSunday = new Date(jan1.getTime());
  firstSunday.setUTCDate(jan1.getUTCDate() + (jan1Day === 0 ? 0 : 7 - jan1Day));

  if (businessDate < firstSunday) {
    const prevJan1 = new Date(Date.UTC(year - 1, 0, 1));
    const prevJan1Day = prevJan1.getUTCDay();
    const prevFirstSunday = new Date(prevJan1.getTime());
    prevFirstSunday.setUTCDate(
      prevJan1.getUTCDate() + (prevJan1Day === 0 ? 0 : 7 - prevJan1Day),
    );
    return (
      Math.floor(
        (businessDate.getTime() - prevFirstSunday.getTime()) / (7 * 86400000),
      ) + 1
    );
  }

  return (
    Math.floor(
      (businessDate.getTime() - firstSunday.getTime()) / (7 * 86400000),
    ) + 1
  );
}

function getCalendarQuarterLabel(date: Date) {
  const { year, month } = getBusinessDateParts(date);
  const quarter = Math.floor(month / 3) + 1;

  return `${year}年Q${quarter}`;
}

function getFiscalQuarterLabel(date: Date) {
  const { year, month } = getBusinessDateParts(date);
  const fiscalYear =
    month < 3 ? year - 1 : year;
  const fiscalQuarter =
    month < 3 ? 4 : Math.floor((month - 3) / 3) + 1;

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
      formatFunc = date =>
        `${getBusinessDateParts(date).year}年第${getSundayWeekNum(date)}周`;
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
