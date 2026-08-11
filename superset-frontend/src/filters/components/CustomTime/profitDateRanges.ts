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

/**
 * 功能审计（可重写规格）：利润数据可用截止日
 * - 功能目的与触发方式：为自定义时间筛选器计算数据日历的安全截止日。
 * - 输入契约：now 可为 Date、ISO 日期字符串或省略；省略时使用运行时日期。
 * - 输出契约：返回 YYYY-MM-DD 字符串，按数据延迟规则取上海时间 T-2。
 * - 处理流程：先统一输入日期类型，再转换上海时区并扣除两天。
 * - 业务规则：无效日期返回空字符串，避免筛选器渲染阶段抛出类型异常。
 * - 状态与副作用：纯计算，不写入数据库或缓存。
 * - 外部依赖：依赖 JavaScript Date 和既有日期格式化函数。
 * - 异常与边界：兼容恢复状态中的 ISO 字符串，非法输入安全降级为空值。
 * - 不变量与约束：同一有效时刻必须生成相同截止日。
 * - 验证方式：profitDateRanges.test.ts 覆盖 Date 和 ISO 字符串输入。
 */
export function getProfitDataEndDate(now: Date | string = new Date()): string {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const shanghaiNow = new Date(date.getTime() + 8 * 60 * 60 * 1000);
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
