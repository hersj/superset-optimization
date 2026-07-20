export interface BigNumberComparisonRanges {
  previousRange: string;
  yearRange: string;
}

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

function range(start: Date, endExclusive: Date): string {
  return `${fmtDate(start)} : ${fmtDate(endExclusive)}`;
}

export function getBigNumberComparisonRanges(
  timeRange?: string,
): BigNumberComparisonRanges | null {
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
  return {
    previousRange: range(addDays(start, -durationDays), start),
    yearRange: range(addYears(start, -1), addYears(endExclusive, -1)),
  };
}
