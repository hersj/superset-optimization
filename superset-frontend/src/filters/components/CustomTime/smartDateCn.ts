import {
  getSellerfoxSundayWeek,
  getSellerfoxSundayWeekLabel,
  getTimeFormatterRegistry,
  TimeFormatter,
} from '@superset-ui/core';
import {
  timeSecond as tsec,
  timeMinute as tmin,
  timeHour as thour,
  timeDay as tday,
  timeMonth as tmon,
  timeYear as tyear,
} from 'd3-time';

function getFiscalQuarter(month: number): string | null {
  const map: Record<number, string> = { 3: 'Q1', 6: 'Q2', 9: 'Q3', 0: 'Q4' };
  return map[month] ?? null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function smartDateCnFormat(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';

  if (tsec(date) < date) return `.${pad2(date.getMilliseconds())}`;
  if (tmin(date) < date) return `:${pad2(date.getSeconds())}`;
  if (thour(date) < date)
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (tday(date) < date) return `${pad2(date.getHours())}:00`;

  if (tmon(date) < date) {
    if (date.getDay() === 0) {
      const { week } = getSellerfoxSundayWeek(date);
      return `第${week}周`;
    }
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  if (tyear(date) < date) {
    const month = date.getMonth();
    const day = date.getDate();
    if (day === 1) {
      const q = getFiscalQuarter(month);
      if (q) {
        return `${date.getFullYear()}年${q}`;
      }
      return `${date.getFullYear()}年${month + 1}月`;
    }
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  return `${date.getFullYear()}年`;
}

function smartDateCnVerboseFormat(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';

  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());

  if (tsec(date) < date)
    return `${y}-${m}-${d} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad2(date.getMilliseconds())}`;
  if (tmin(date) < date)
    return `${y}-${m}-${d} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  if (thour(date) < date)
    return `${y}-${m}-${d} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (tday(date) < date) return `${y}-${m}-${d} ${pad2(date.getHours())}:00`;

  if (tmon(date) < date) {
    if (date.getDay() === 0) {
      return getSellerfoxSundayWeekLabel(date);
    }
    return `${y}-${m}-${d}`;
  }

  if (tyear(date) < date) {
    const month = date.getMonth();
    const day = date.getDate();
    if (day === 1) {
      const q = getFiscalQuarter(month);
      if (q) {
        return `${y}年${q}`;
      }
      return `${y}年${month + 1}月`;
    }
    return `${y}-${m}-${d}`;
  }

  return `${y}年`;
}

export function registerSmartDateCn() {
  try {
    const registry = getTimeFormatterRegistry();
    registry.registerValue(
      'smart_date',
      new TimeFormatter({
        id: 'smart_date',
        formatFunc: smartDateCnFormat,
        useLocalTime: true,
      }),
    );
    registry.registerValue(
      'smart_date_verbose',
      new TimeFormatter({
        id: 'smart_date_verbose',
        formatFunc: smartDateCnVerboseFormat,
        useLocalTime: true,
      }),
    );
    console.log('smart_date_cn registered (smart_date + smart_date_verbose)');
  } catch (e) {
    console.warn('Failed to register smart_date_cn:', e);
  }
}
