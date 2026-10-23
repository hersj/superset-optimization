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
  this_fiscal_year: '本财年',
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
 * - 输入契约：now 为 Date、ISO 日期字符串或省略；dataLagDays 默认2，BSR显式配置0。
 * - 输出契约：返回上海时间 YYYY-MM-DD；利润维持T-2，当日来源允许T。
 * - 处理流程：统一输入类型，转换上海日期，再扣除配置的延迟天数。
 * - 业务规则：无效日期返回空字符串，避免筛选器渲染阶段抛出类型异常。
 * - 状态与副作用：纯计算，不写入数据库或缓存。
 * - 外部依赖：依赖 JavaScript Date 和既有日期格式化函数。
 * - 异常与边界：兼容恢复状态中的 ISO 字符串，非法输入安全降级为空值。
 * - 不变量与约束：同一有效时刻必须生成相同截止日。
 * - 验证方式：profitDateRanges.test.ts 覆盖 Date 和 ISO 字符串输入。
 */
export function getProfitDataEndDate(
  now: Date | string = new Date(),
  dataLagDays: 0 | 2 = 2,
): string {
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
  return fmtDate(addDays(businessToday, -dataLagDays));
}

export function getProfitPresetRange(
  presetKey: string,
  now: Date = new Date(),
  dataLagDays: 0 | 2 = 2,
): ProfitPresetRange | null {
  const dataEnd = parseDate(getProfitDataEndDate(now, dataLagDays));
  if (!dataEnd) {
    return null;
  }
  let endExclusive = addDays(dataEnd, 1);
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
  } else if (presetKey === 'this_fiscal_year') {
    const fiscalYearStart =
      dataEnd.getUTCMonth() >= 3
        ? dataEnd.getUTCFullYear()
        : dataEnd.getUTCFullYear() - 1;
    start = new Date(Date.UTC(fiscalYearStart, 3, 1));
    // The requested fiscal year includes March 30; ranges are right-open.
    endExclusive = new Date(Date.UTC(fiscalYearStart + 1, 2, 31));
  } else {
    return null;
  }

  return {
    label: PRESET_LABELS[presetKey],
    timeRange: range(start, endExclusive),
  };
}

/**
 * 将一个财年或首尾财年转换为连续的半开区间，供筛选器 DataMask 使用。
 * 财年从 4 月 1 日开始，结束边界为最后一个财年次年 3 月 31 日。
 */
export function getProfitFiscalYearRange(
  fiscalYearStart: number,
  fiscalYearEnd: number = fiscalYearStart,
): ProfitPresetRange {
  const start = new Date(Date.UTC(fiscalYearStart, 3, 1));
  const endExclusive = new Date(Date.UTC(fiscalYearEnd + 1, 2, 31));

  return {
    label:
      fiscalYearStart === fiscalYearEnd
        ? `${fiscalYearStart}财年`
        : `${fiscalYearStart}-${fiscalYearEnd}财年`,
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
