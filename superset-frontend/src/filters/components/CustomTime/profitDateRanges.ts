export interface ProfitPresetRange {
  label: string;
  timeRange: string;
}

export interface ProfitComparisonRanges {
  previousRange: string;
  yearRange: string;
}

const PRESET_LABELS: Record<string, string> = {
  last_7d: '最近7天',
  last_30d: '最近30天',
  last_90d: '最近90天',
  this_month: '本月',
  this_year: '本年',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function fmtDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseDate(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function range(start: Date, endExclusive: Date): string {
  return `${fmtDate(start)} : ${fmtDate(endExclusive)}`;
}

export function getProfitDataEndDate(now: Date = new Date()): string {
  const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const businessToday = new Date(
    Date.UTC(
      shanghaiNow.getUTCFullYear(),
      shanghaiNow.getUTCMonth(),
      shanghaiNow.getUTCDate(),
    ),
  );
  return fmtDate(addDays(businessToday, -2));
}

export function getProfitPresetRange(
  presetKey: string,
  now: Date = new Date(),
): ProfitPresetRange | null {
  const dataEnd = parseDate(getProfitDataEndDate(now));
  if (!dataEnd) {
    return null;
  }
  const endExclusive = addDays(dataEnd, 1);
  let start: Date;

  if (presetKey === 'last_7d') {
    start = addDays(dataEnd, -6);
  } else if (presetKey === 'last_30d') {
    start = addDays(dataEnd, -29);
  } else if (presetKey === 'last_90d') {
    start = addDays(dataEnd, -89);
  } else if (presetKey === 'this_month') {
    start = startOfMonth(dataEnd);
  } else if (presetKey === 'this_year') {
    start = startOfYear(dataEnd);
  } else {
    return null;
  }

  return {
    label: PRESET_LABELS[presetKey],
    timeRange: range(start, endExclusive),
  };
}

export function getProfitComparisonRanges(
  timeRange?: string,
): ProfitComparisonRanges | null {
  const [rawStart, rawEnd, extra] = (timeRange || '')
    .split(':')
    .map(part => part.trim());
  if (!rawStart || !rawEnd || extra !== undefined) {
    return null;
  }

  const start = parseDate(rawStart);
  const endExclusive = parseDate(rawEnd);
  if (!start || !endExclusive || start >= endExclusive) {
    return null;
  }

  const durationDays = Math.round(
    (endExclusive.getTime() - start.getTime()) / 86400000,
  );
  const previousStart = addDays(start, -durationDays);
  const yearStart = addYears(start, -1);
  const yearEnd = addYears(endExclusive, -1);

  return {
    previousRange: range(previousStart, start),
    yearRange: range(yearStart, yearEnd),
  };
}
