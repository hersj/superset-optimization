import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  createCustomPeriodComparison,
  formatCustomPeriodComparisonLabel,
} from '@superset-ui/core';
import { useTheme } from '@apache-superset/core/theme';
import {
  DEFAULT_PRESETS,
  TIME_GRAIN_OPTIONS,
  TimePreset,
  TimeGrainOption,
} from './types';
import {
  normalizeSelectedRanges,
  selectedRangeEnvelope,
  selectedRangesHaveGaps,
  toggleSelectedRange,
  SelectionMode,
} from './selectedTimeRanges';
import {
  getProfitComparisonRanges,
  getProfitDataEndDate,
  getProfitFiscalYearRange,
  getProfitPresetRange,
} from './profitDateRanges';

function token(theme: any, key: string, fallback: string): string {
  return theme?.[key] || fallback;
}

function createStyles(theme: any) {
  const bg = token(theme, 'colorBgContainer', '#fff');
  const bgElevated = token(theme, 'colorBgElevated', bg);
  const text = token(theme, 'colorText', '#222');
  const textSecondary = token(theme, 'colorTextSecondary', '#555');
  const textTertiary = token(theme, 'colorTextTertiary', '#888');
  const disabled = token(theme, 'colorTextDisabled', '#aaa');
  const border = token(theme, 'colorBorder', '#d9d9d9');
  const split = token(theme, 'colorSplit', '#f0f0f0');
  const fill = token(theme, 'colorFillTertiary', '#f5f5f5');
  const primary = token(theme, 'colorPrimary', '#1677ff');
  const primaryBg = token(theme, 'colorPrimaryBg', '#e6f4ff');

  return {
    colors: {
      bg,
      bgElevated,
      text,
      textSecondary,
      textTertiary,
      disabled,
      border,
      split,
      fill,
      primary,
      primaryBg,
      selectedText: token(theme, 'colorTextLightSolid', '#fff'),
    },
    container: {
      padding: 0,
      width: '100%',
      fontSize: 13,
      background: bg,
      color: text,
    } as React.CSSProperties,
    shell: {
      display: 'flex',
      flexDirection: 'column' as const,
      minHeight: 330,
      border: `1px solid ${split}`,
      background: bg,
    } as React.CSSProperties,
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 12px',
      fontSize: 13,
      minHeight: 36,
      border: `1px solid ${split}`,
      background: bgElevated,
    } as React.CSSProperties,
    grainColumn: {
      padding: '6px 12px',
      borderBottom: `1px solid ${split}`,
    } as React.CSSProperties,
    presetColumn: {
      padding: '6px 12px',
      borderBottom: `1px solid ${split}`,
    } as React.CSSProperties,
    panel: { padding: '10px 12px', flex: 1 } as React.CSSProperties,
    grid: {
      display: 'flex',
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 8,
    } as React.CSSProperties,
    denseGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))',
      gap: 8,
    } as React.CSSProperties,
    monthGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 8,
    } as React.CSSProperties,
    quarterGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 8,
    } as React.CSSProperties,
    yearGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 8,
    } as React.CSSProperties,
    grainGrid: {
      display: 'flex',
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 8,
    } as React.CSSProperties,
    btn: {
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 13,
      cursor: 'pointer',
      border: '1px solid transparent',
      background: fill,
      color: textSecondary,
      textAlign: 'center' as const,
      lineHeight: '22px',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    btnActive: {
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 13,
      cursor: 'pointer',
      border: `1px solid ${primary}`,
      background: primaryBg,
      color: primary,
      textAlign: 'center' as const,
      fontWeight: 600 as const,
      lineHeight: '22px',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    grainBtn: {
      padding: '2px 10px',
      borderRadius: 4,
      fontSize: 13,
      cursor: 'pointer',
      border: '1px solid transparent',
      background: fill,
      color: textSecondary,
      textAlign: 'center' as const,
      lineHeight: '22px',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    grainActive: {
      padding: '2px 10px',
      borderRadius: 4,
      fontSize: 13,
      cursor: 'pointer',
      border: `1px solid ${primary}`,
      background: primaryBg,
      color: primary,
      textAlign: 'center' as const,
      fontWeight: 600 as const,
      lineHeight: '22px',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    periodBtn: {
      padding: '5px 8px',
      borderRadius: 4,
      fontSize: 12,
      cursor: 'pointer',
      border: `1px solid ${border}`,
      background: bgElevated,
      color: text,
      textAlign: 'center' as const,
      lineHeight: '18px',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    periodActive: {
      padding: '5px 8px',
      borderRadius: 4,
      fontSize: 12,
      cursor: 'pointer',
      border: `1px solid ${primary}`,
      background: primaryBg,
      color: primary,
      textAlign: 'center' as const,
      fontWeight: 600 as const,
      lineHeight: '18px',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    nav: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      gap: 8,
    } as React.CSSProperties,
    selectInput: {
      fontSize: 12,
      padding: '1px 4px',
      border: `1px solid ${border}`,
      borderRadius: 4,
      background: bgElevated,
      color: text,
    } as React.CSSProperties,
    hint: {
      fontSize: 11,
      color: textTertiary,
      marginBottom: 8,
    } as React.CSSProperties,
    status: {
      marginTop: 6,
      padding: '3px 6px',
      fontSize: 11,
      color: textTertiary,
      background: fill,
      borderRadius: 4,
      lineHeight: '16px',
    } as React.CSSProperties,
  };
}

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function subtractDays(dateStr: string, n: number): string {
  return addDays(dateStr, -n);
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months, 1);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, 1);
}

function getMonthStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, 1);
}

function monthFromDate(dateStr: string): string {
  return dateStr ? dateStr.substring(0, 7) : '';
}

function monthStartFromMonth(month: string): string {
  return `${month}-01`;
}

const DEFAULT_CALENDAR_START_DATE = '2022-01-01';

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getConfiguredCalendarStartDate(value: unknown): string {
  return isValidIsoDate(value) ? value : DEFAULT_CALENDAR_START_DATE;
}

function nextMonthStart(month: string): string {
  return addMonths(monthStartFromMonth(month), 1);
}

function toSunday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseRange(timeRange?: string): {
  start: string;
  endExclusive: string;
} {
  const [start = '', endExclusive = ''] = (timeRange || '')
    .split(':')
    .map(part => part.trim());
  return { start, endExclusive };
}

function isPresetKey(value: unknown): value is string {
  return (
    typeof value === 'string' && DEFAULT_PRESETS.some(p => p.key === value)
  );
}

type FiscalYearSelection = {
  start: number;
  end: number;
};

/**
 * 从已保存的半开时间区间恢复单个或连续财年，供组件初始化和外部状态同步使用。
 */
function getRestoredFiscalYearRange(
  timeRange: unknown,
): FiscalYearSelection | null {
  if (typeof timeRange !== 'string') {
    return null;
  }
  const { start, endExclusive } = parseRange(timeRange);
  const startMatch = /^(\d{4})-04-01$/.exec(start);
  const endMatch = /^(\d{4})-03-31$/.exec(endExclusive);
  if (!startMatch || !endMatch) {
    return null;
  }
  const rangeStart = Number(startMatch[1]);
  const rangeEnd = Number(endMatch[1]) - 1;
  if (
    rangeEnd < rangeStart ||
    getProfitFiscalYearRange(rangeStart, rangeEnd).timeRange !==
      `${start} : ${endExclusive}`
  ) {
    return null;
  }
  return { start: rangeStart, end: rangeEnd };
}

/**
 * 仅把明确保存了 fiscalYear 的旧财年状态恢复为财年粒度；没有该状态的普通日期区间仍保持原粒度。
 */
function getEffectiveGrain(
  value: unknown,
  fallback: string,
  timeRange?: unknown,
  fiscalYear?: unknown,
): string {
  const hasLegacyFiscalSelection =
    typeof fiscalYear === 'number' &&
    Number.isInteger(fiscalYear) &&
    getRestoredFiscalYearRange(timeRange) !== null;
  return value === 'this_fiscal_year' || hasLegacyFiscalSelection
    ? 'fiscal_year'
    : fallback;
}

function getGrainDisplayLabel(label: string): string {
  if (label === '日') return '按天';
  return `按${label === '季度' ? '季' : label}`;
}

function formatMonthTitle(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

function getMonthDays(
  monthStart: string,
  weekStartsOnSunday = false,
): Array<{ date: string; day: number; muted: boolean }> {
  const first = new Date(`${monthStart}T00:00:00`);
  const gridStart = new Date(first.getTime());
  const offset = weekStartsOnSunday ? first.getDay() : (first.getDay() + 6) % 7;
  gridStart.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(gridStart.getTime());
    d.setDate(gridStart.getDate() + index);
    const date = fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return {
      date,
      day: d.getDate(),
      muted: d.getMonth() !== first.getMonth(),
    };
  });
}

function isDateInRange(date: string, timeRange: string): boolean {
  const { start, endExclusive } = parseRange(timeRange);
  return Boolean(start && endExclusive && date >= start && date < endExclusive);
}

function isDateRangeEndpoint(date: string, timeRange: string): boolean {
  const { start, endExclusive } = parseRange(timeRange);
  return Boolean(
    start &&
    endExclusive &&
    (date === start || date === subtractDays(endExclusive, 1)),
  );
}

function getDataEndDate(): string {
  return getProfitDataEndDate();
}

function fiscalYearStartFromDate(dateStr: string): number {
  const [year, month] = dateStr.split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

/** 返回第一个完整落在最早日期之后的月份，供整月选择器使用。 */
function getFirstSelectableMonth(minimumDate: string): string {
  const monthStart = getMonthStart(minimumDate);
  return minimumDate === monthStart
    ? monthStart
    : nextMonthStart(monthFromDate(minimumDate));
}

/** 返回第一个完整落在最早日期之后的年份，供整年选择器使用。 */
function getFirstSelectableYear(minimumDate: string): number {
  const year = Number(minimumDate.substring(0, 4));
  return fmtDate(year, 1, 1) >= minimumDate ? year : year + 1;
}

/** 返回第一个完整落在最早日期之后的财年，避免财年范围覆盖起始日前数据。 */
function getFirstSelectableFiscalYear(minimumDate: string): number {
  let year = fiscalYearStartFromDate(minimumDate);
  while (
    getProfitFiscalYearRange(year).timeRange.substring(0, 10) < minimumDate
  ) {
    year += 1;
  }
  return year;
}

/** 返回第一个可选季度所在的展示年份，保留财季 Q4 的自然年归属。 */
function getFirstSelectableQuarterDisplayYear(minimumDate: string): number {
  const fiscalYear = fiscalYearStartFromDate(minimumDate);
  for (let year = fiscalYear; year <= fiscalYear + 2; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      if (getFQRange(year, quarter).start >= minimumDate) {
        return year;
      }
    }
  }
  return fiscalYear + 2;
}

function getFQRange(year: number, q: number): { start: string; end: string } {
  const qStart: Record<number, [number, number]> = {
    1: [year, 4],
    2: [year, 7],
    3: [year, 10],
    4: [year + 1, 1],
  };
  const qEnd: Record<number, [number, number]> = {
    1: [year, 7],
    2: [year, 10],
    3: [year + 1, 1],
    4: [year + 1, 4],
  };
  const [sy, sm] = qStart[q];
  const [ey, em] = qEnd[q];
  return { start: fmtDate(sy, sm, 1), end: fmtDate(ey, em, 1) };
}

function quarterId(year: number, q: number): string {
  return `${year}-Q${q}`;
}

function parseQuarterId(id: string): { year: number; q: number } {
  const [year, q] = id.split('-Q');
  return { year: Number(year), q: Number(q) };
}

function quarterLabel(id: string): string {
  const { year, q } = parseQuarterId(id);
  const months: Record<number, string> = {
    1: '4-6月',
    2: '7-9月',
    3: '10-12月',
    4: '1-3月',
  };
  return `${year} Q${q} (${months[q]})`;
}

function compareQuarter(a: string, b: string): number {
  const qa = parseQuarterId(a);
  const qb = parseQuarterId(b);
  return getFQRange(qa.year, qa.q).start.localeCompare(
    getFQRange(qb.year, qb.q).start,
  );
}

function normalizePair<T extends string | number>(
  a: T,
  b: T,
  compare: (left: T, right: T) => number,
): [T, T] {
  return compare(a, b) <= 0 ? [a, b] : [b, a];
}

function getConfiguredTimeColumn(formData: any): string | undefined {
  const groupby = formData?.groupby;
  if (Array.isArray(groupby)) {
    return typeof groupby[0] === 'string' ? groupby[0] : undefined;
  }
  return typeof groupby === 'string' ? groupby : undefined;
}

/**
 * 功能审计（可重写规格）：自定义时间筛选器的时间范围与财年粒度
 * - 功能目的与触发方式：用户在 Dashboard 原生时间筛选器中选择范围、粒度或“不过滤”时触发；按财年是与按天/周/月/季/年并列的独立时间粒度。
 * - 输入契约：formData.groupby 为可选的单个绑定时间列；timeRange 为半开区间“开始 : 结束”或空值；grainKey 为 day/week/month/quarter/year/fiscal_year；数据截止日由数据源提供。
 * - 处理流程：读取绑定列和当前状态→按快捷范围、日历或粒度按钮计算范围→统一经 applyFilter 构造 DataMask→保存可恢复的范围、粒度、预设和财年状态；按财年进入财年维度后，连续点击两个财年按钮选择包含首尾财年的连续区间。
 * - 业务规则：严格使用 formData.groupby 指定的列，不从图表 x 轴推断；calendarStartDate 为当前筛选器对应表的最早可选日期，缺失或非法时使用 2022-01-01；起始日期之前的日历日期不展示，包含起始日前日期的整周不展示，起始日前的整月/整季/整年/财年不展示，数据截止日之后不可选；财年从 4 月 1 日到次年 3 月 30 日，内部以次年 3 月 31 日右开边界表示；按财年按钮只产生财年分组，不保留日历年分组；本财年和财年日历同时设置范围与财年粒度；其他快捷范围只改变范围；财年列表只能选择不晚于数据截止财年的年份；第一次财年点击作为起点，第二次点击按年份排序后生成连续区间，再次点击重新开始选择。
 * - 状态与副作用：仅更新当前 Dashboard 会话 DataMask 和 ownState，不直接写数据库；切换普通预设、日历或粒度时清除已失效的财年状态，避免恢复陈旧范围。
 * - 外部依赖：依赖原生筛选器传入的 formData、Superset DataMask/QueryContext 对 TEMPORAL_RANGE、time_grain_sqla 和 time_compare 的处理。
 * - 异常与边界：旧配置没有 groupby 时保留全局 time_range 兼容路径；绑定列缺失时不伪造过滤列；空范围不得保留前一次范围；非法 calendarStartDate 安全回退默认日期；日历不能通过补位日期、周或其他粒度导航绕过当前起点；已保存的旧范围仍可恢复；恢复时仅接受完整财年边界组成的连续区间；未来财年按钮不可选。
 * - 不变量与约束：一次只绑定一个时间列；时间粒度行只出现一个按财年入口；预设、财年日历、粒度和不过滤均走同一 applyFilter 路径，比较参数不能因入口不同而丢失；旧 this_fiscal_year 状态及旧版单/多财年区间状态必须恢复为 fiscal_year；连续模式的财年多选仍形成连续区间。
 * - 点选输入与输出：selectionMode 默认 continuous；points 必须绑定时间列，selectedRanges 为排序后的 ISO 日期半开区间数组，写入 filterState/ownState 及该列 TEMPORAL_RANGE.val；顶层 time_range 仅为包络，不能替代并集条件；空数组保留恒假过滤，不能视为不过滤。
 * - 点选交互规则：日/周/月/季/年/财年点击单位执行集合并，完整选中后再点执行集合差；跨年和乱序点击不改变日期排序。切换粒度保留精确日期集合，预设替换为预设范围；连续转点选保留范围；点选转连续有空档时用确认框明确补齐，取消不改变状态或请求。
 * - 比较与恢复：points 发“上一选中区间”，支持比较的时间轴图表按日期顺序 B/A、C/B，缺数据不能跳期，图表关闭比较优先；无时间轴图表只聚合并集。恢复以 filterState 为准，缺少 selectionMode 的历史配置默认连续，不继承本地或 ownState 的点选模式/集合；恢复当次就必须发布字符串 TEMPORAL_RANGE 和普通比较，不能先发一帧点选查询。包络相同也须恢复模式/完整集合；非法点选整体失败。
 * - 验证方式：组件测试覆盖绑定列、未绑定兼容、不过滤、默认 2022-01-01 与每个筛选器自定义起始日期、起始日期前选项隐藏、按财年单选与连续多选、本财年快捷范围、旧状态恢复、财年格式化、外部范围同步和陈旧状态清理。
 */

type CustomComparisonDraft = {
  customComparisonMode: 'original' | 'custom';
  comparisonStartDate: string;
  comparisonEndDate: string;
};

function getCustomComparisonDraft(
  range: string,
  mode: SelectionMode,
  state: CustomComparisonDraft,
) {
  if (state.customComparisonMode !== 'custom')
    return { period: null, error: undefined };
  if (!range || range === 'No filter')
    return { period: null, error: '请先选择有限的当前期间。' };
  if (mode === 'points')
    return { period: null, error: '自定义期间总量对比请使用连续区间。' };
  try {
    return {
      period: createCustomPeriodComparison(
        range,
        state.comparisonStartDate,
        state.comparisonEndDate,
      ),
      error: undefined,
    };
  } catch {
    return {
      period: null,
      error: '请填写有效的对比起止日期，结束日期不得早于开始日期。',
    };
  }
}

export default function CustomTimeFilterPlugin(props: any) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { formData, filterState, ownState = {}, setDataMask } = props;
  // 恢复配置与用户点击分开取值：历史配置没有模式字段，不能借用上一帧点选状态。
  const restoredSelection = useMemo(
    () => ({
      selectionMode: (filterState?.selectionMode === 'points'
        ? 'points'
        : 'continuous') as SelectionMode,
      selectedRanges:
        filterState?.selectionMode === 'points'
          ? normalizeSelectedRanges(filterState.selectedRanges ?? [])
          : [],
    }),
    [filterState?.selectionMode, filterState?.selectedRanges],
  );
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(
    restoredSelection.selectionMode,
  );
  const [selectedRanges, setSelectedRanges] = useState<string[]>(
    () => restoredSelection.selectedRanges,
  );

  const {
    defaultPreset = 'last_7d',
    defaultGrain = 'day',
    enablePresets = true,
    enableCustomRange = true,
    enableTimeGrain = true,
    enableCustomComparison = false,
  } = formData || {};
  const minimumCalendarDate = getConfiguredCalendarStartDate(
    formData?.calendarStartDate,
  );
  const minimumCalendarMonth = getMonthStart(minimumCalendarDate);
  const minimumSelectableMonth = getFirstSelectableMonth(minimumCalendarDate);
  const minimumMonthDisplayYear = Number(
    minimumSelectableMonth.substring(0, 4),
  );
  const minimumSelectableYear = getFirstSelectableYear(minimumCalendarDate);
  const minimumQuarterDisplayYear =
    getFirstSelectableQuarterDisplayYear(minimumCalendarDate);
  const minimumFiscalYear = getFirstSelectableFiscalYear(minimumCalendarDate);
  const timeColumn = getConfiguredTimeColumn(formData);
  const restoredComparison = useMemo<CustomComparisonDraft>(
    () => ({
      customComparisonMode:
        filterState?.customComparisonMode === 'custom' ? 'custom' : 'original',
      comparisonStartDate:
        typeof filterState?.comparisonStartDate === 'string'
          ? filterState.comparisonStartDate
          : '',
      comparisonEndDate:
        typeof filterState?.comparisonEndDate === 'string'
          ? filterState.comparisonEndDate
          : '',
    }),
    [
      filterState?.customComparisonMode,
      filterState?.comparisonStartDate,
      filterState?.comparisonEndDate,
    ],
  );
  const [customComparisonMode, setCustomComparisonMode] = useState(
    restoredComparison.customComparisonMode,
  );
  const [comparisonStartDate, setComparisonStartDate] = useState(
    restoredComparison.comparisonStartDate,
  );
  const [comparisonEndDate, setComparisonEndDate] = useState(
    restoredComparison.comparisonEndDate,
  );
  useEffect(() => {
    setCustomComparisonMode(restoredComparison.customComparisonMode);
    setComparisonStartDate(restoredComparison.comparisonStartDate);
    setComparisonEndDate(restoredComparison.comparisonEndDate);
  }, [restoredComparison]);

  const currentYear = Number(getDataEndDate().substring(0, 4));
  const savedRange =
    (ownState.lastRange as string | undefined) ||
    (!isPresetKey(filterState?.value) ? (filterState?.value as string) : '') ||
    '';
  const parsedSavedRange = parseRange(savedRange);
  const savedEndDate = parsedSavedRange.endExclusive
    ? subtractDays(parsedSavedRange.endExclusive, 1)
    : getDataEndDate();
  const restoredFiscalYearRange =
    filterState?.value === 'this_fiscal_year'
      ? {
          start: fiscalYearStartFromDate(getDataEndDate()),
          end: fiscalYearStartFromDate(getDataEndDate()),
        }
      : getRestoredFiscalYearRange(savedRange);
  const initialGrain = getEffectiveGrain(
    filterState?.value,
    (ownState.activeGrain as string | undefined) ||
      (filterState?.grain as string | undefined) ||
      defaultGrain,
    savedRange,
    ownState.fiscalYear,
  );
  const initialPreset =
    ownState.activePreset !== undefined
      ? (ownState.activePreset as string | null)
      : filterState?.value === null
        ? null
        : isPresetKey(filterState?.value)
          ? (filterState.value as string)
          : filterState?.value
            ? null
            : defaultPreset;

  const [activePreset, setActivePreset] = useState<string | null>(
    initialPreset,
  );
  const [activeFiscalYear, setActiveFiscalYear] = useState<number | null>(
    restoredFiscalYearRange?.start ?? null,
  );
  const [activeFiscalYearEnd, setActiveFiscalYearEnd] = useState<number | null>(
    restoredFiscalYearRange &&
      restoredFiscalYearRange.end !== restoredFiscalYearRange.start
      ? restoredFiscalYearRange.end
      : null,
  );
  const [activeGrain, setActiveGrain] = useState<string>(initialGrain);
  const [startDate, setStartDate] = useState(
    (ownState.startDate as string | undefined) || parsedSavedRange.start || '',
  );
  const [endDate, setEndDate] = useState(
    (ownState.endDate as string | undefined) || savedEndDate,
  );
  const [weekStartDate, setWeekStartDate] = useState(
    (ownState.weekStartDate as string | undefined) ||
      (parsedSavedRange.start ? toSunday(parsedSavedRange.start) : ''),
  );
  const [weekEndDate, setWeekEndDate] = useState(
    (ownState.weekEndDate as string | undefined) ||
      (parsedSavedRange.endExclusive
        ? toSunday(subtractDays(parsedSavedRange.endExclusive, 7))
        : toSunday(getDataEndDate())),
  );
  const [startMonth, setStartMonth] = useState(
    (ownState.startMonth as string | undefined) ||
      monthFromDate(parsedSavedRange.start),
  );
  const [endMonth, setEndMonth] = useState(
    (ownState.endMonth as string | undefined) ||
      monthFromDate(savedEndDate) ||
      getDataEndDate().substring(0, 7),
  );
  const [qStartYear, setQStartYear] = useState(
    (ownState.qStartYear as number | undefined) || currentYear,
  );
  const [qStartQ, setQStartQ] = useState(
    (ownState.qStartQ as number | undefined) || 1,
  );
  const [qEndYear, setQEndYear] = useState(
    (ownState.qEndYear as number | undefined) || currentYear,
  );
  const [qEndQ, setQEndQ] = useState(
    (ownState.qEndQ as number | undefined) || 1,
  );
  const [startYear, setStartYear] = useState(
    (ownState.startYear as number | undefined) ||
      (parsedSavedRange.start
        ? new Date(`${parsedSavedRange.start}T00:00:00`).getFullYear()
        : currentYear),
  );
  const [endYear, setEndYear] = useState(
    (ownState.endYear as number | undefined) ||
      (parsedSavedRange.endExclusive
        ? new Date(`${parsedSavedRange.endExclusive}T00:00:00`).getFullYear() -
          1
        : currentYear),
  );
  const [collapsed, setCollapsed] = useState(true);
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [monthYearOffset, setMonthYearOffset] = useState(0);
  const [quarterYearOffset, setQuarterYearOffset] = useState(0);
  const [yearDecadeOffset, setYearDecadeOffset] = useState(0);
  const [fiscalYearOffset, setFiscalYearOffset] = useState(0);
  const [pendingDayStart, setPendingDayStart] = useState('');
  const [pendingWeekStart, setPendingWeekStart] = useState('');
  const [pendingMonthStart, setPendingMonthStart] = useState('');
  const [pendingQuarterStart, setPendingQuarterStart] = useState('');
  const [pendingYearStart, setPendingYearStart] = useState<number | null>(null);
  const [pendingFiscalYearStart, setPendingFiscalYearStart] = useState<
    number | null
  >(null);

  const lastRangeRef = useRef<string>(savedRange);

  const getPresetTimeRange = useCallback((presetKey: string): string => {
    const profitPreset = getProfitPresetRange(presetKey);
    if (profitPreset) {
      return profitPreset.timeRange;
    }
    return DEFAULT_PRESETS.find(p => p.key === presetKey)?.duration || '';
  }, []);

  const buildOwnState = useCallback(
    (overrides: Record<string, unknown> = {}) => {
      const currentRange = Object.prototype.hasOwnProperty.call(
        overrides,
        'lastRange',
      )
        ? (overrides.lastRange as string)
        : lastRangeRef.current;
      return {
        activePreset,
        ...(enableCustomComparison
          ? { customComparisonMode, comparisonStartDate, comparisonEndDate }
          : {}),
        fiscalYear: activeFiscalYear,
        fiscalYearEnd: activeFiscalYearEnd,
        activeGrain,
        lastRange: currentRange,
        profitDataEndDate: getDataEndDate(),
        comparison: getProfitComparisonRanges(currentRange),
        startDate,
        endDate,
        weekStartDate,
        weekEndDate,
        startMonth,
        endMonth,
        qStartYear,
        qStartQ,
        qEndYear,
        qEndQ,
        startYear,
        endYear,
        ...overrides,
      };
    },
    [
      activePreset,
      enableCustomComparison,
      customComparisonMode,
      comparisonStartDate,
      comparisonEndDate,
      activeFiscalYear,
      activeFiscalYearEnd,
      activeGrain,
      endDate,
      endMonth,
      endYear,
      qEndQ,
      qEndYear,
      qStartQ,
      qStartYear,
      startDate,
      startMonth,
      startYear,
      weekEndDate,
      weekStartDate,
    ],
  );

  const applyFilter = useCallback(
    (
      timeRange: string,
      grainKey: string,
      presetKey?: string | null,
      stateOverrides: Record<string, unknown> = {},
    ) => {
      // 恢复入口显式传入模式/集合；点击入口才使用本地交互状态，不按包络相等猜测恢复。
      const mode =
        (stateOverrides.selectionMode as SelectionMode | undefined) ??
        selectionMode;
      if (mode === 'points' && !timeColumn) {
        throw new Error('点选区间需要绑定时间列，不能回退全历史');
      }
      const points =
        mode === 'points'
          ? normalizeSelectedRanges(
              stateOverrides.selectedRanges ??
                (timeRange !== lastRangeRef.current
                  ? timeRange
                    ? [timeRange]
                    : []
                  : selectedRanges),
            )
          : [];
      if (mode === 'points') {
        timeRange = selectedRangeEnvelope(points);
        setSelectedRanges(points);
      }
      lastRangeRef.current = timeRange;
      const grainOption = TIME_GRAIN_OPTIONS.find(g => g.key === grainKey);
      const grainValue = grainOption?.value || 'P1D';
      const grainLabel = grainOption?.label || '日';
      const timeCompare =
        {
          day: '1 day ago',
          week: '1 week ago',
          month: '1 month ago',
          quarter: '3 months ago',
          year: '1 year ago',
          fiscal_year: '1 year ago',
        }[grainKey] || '1 day ago';
      const nextActivePreset = presetKey ?? null;
      const rangeLabel =
        mode === 'points'
          ? points.length
            ? `点选区间（${points.length}段）`
            : '请选择区间'
          : !timeRange
            ? '不过滤'
            : (stateOverrides.rangeLabel as string | undefined) ||
              (nextActivePreset === 'this_fiscal_year'
                ? `${fiscalYearStartFromDate(getDataEndDate())}财年`
                : nextActivePreset
                  ? DEFAULT_PRESETS.find(p => p.key === nextActivePreset)
                      ?.label || timeRange
                  : '自定义范围');

      const comparisonState: CustomComparisonDraft = {
        customComparisonMode:
          (stateOverrides.customComparisonMode as
            | CustomComparisonDraft['customComparisonMode']
            | undefined) ?? customComparisonMode,
        comparisonStartDate:
          (stateOverrides.comparisonStartDate as string | undefined) ??
          comparisonStartDate,
        comparisonEndDate:
          (stateOverrides.comparisonEndDate as string | undefined) ??
          comparisonEndDate,
      };
      const comparisonDraft = getCustomComparisonDraft(
        timeRange,
        mode,
        comparisonState,
      );
      const customPeriod = comparisonDraft.period
        ? { ...comparisonDraft.period, ...(timeColumn ? { timeColumn } : {}) }
        : null;
      setDataMask({
        extraFormData: {
          ...(timeColumn
            ? {
                filters:
                  mode === 'points'
                    ? [{ col: timeColumn, op: 'TEMPORAL_RANGE', val: points }]
                    : timeRange
                      ? [
                          {
                            col: timeColumn,
                            op: 'TEMPORAL_RANGE',
                            val: timeRange,
                          },
                        ]
                      : [],
                time_range: timeRange || 'No filter',
              }
            : { time_range: timeRange }),
          time_grain_sqla: grainValue,
          time_compare:
            mode === 'points'
              ? points.length
                ? ['上一选中区间']
                : []
              : timeCompare,
          ...(enableCustomComparison
            ? { custom_form_data: { custom_period_comparison: customPeriod } }
            : {}),
        },
        filterState: {
          value: timeRange ? nextActivePreset || timeRange : null,
          grain: grainKey,
          label: rangeLabel + ' | ' + grainLabel,
          ...(enableCustomComparison
            ? {
                ...comparisonState,
                validateStatus: comparisonDraft.error ? 'error' : undefined,
              }
            : {}),
          ...(mode === 'points' || filterState?.selectionMode
            ? { selectionMode: mode, selectedRanges: points }
            : {}),
        },
        ownState: buildOwnState({
          activePreset: nextActivePreset,
          activeGrain: grainKey,
          lastRange: timeRange,
          ...(enableCustomComparison ? comparisonState : {}),
          ...stateOverrides,
          selectionMode: mode,
          selectedRanges: points,
        }),
      });
    },
    [
      buildOwnState,
      setDataMask,
      timeColumn,
      selectionMode,
      selectedRanges,
      filterState?.selectionMode,
      enableCustomComparison,
      customComparisonMode,
      comparisonStartDate,
      comparisonEndDate,
    ],
  );

  // 分享链接/外部恢复可改变点选集合，即使包络不变也必须同步高亮。
  const savedSelectionKey = JSON.stringify(restoredSelection);
  useEffect(() => {
    setSelectionMode(restoredSelection.selectionMode);
    setSelectedRanges(restoredSelection.selectedRanges);
  }, [restoredSelection]);

  const initializedFilter = useRef(false);
  useEffect(() => {
    if (initializedFilter.current) return;
    initializedFilter.current = true;
    if (filterState?.value === null) {
      const grainKey = getEffectiveGrain(
        filterState.value,
        (filterState.grain as string) || defaultGrain,
        filterState.value,
        ownState.fiscalYear,
      );
      applyFilter('', grainKey, null, {
        ...restoredSelection,
        ...(enableCustomComparison ? restoredComparison : {}),
        activePreset: null,
        activeGrain: grainKey,
        lastRange: '',
        fiscalYear: null,
        fiscalYearEnd: null,
      });
    } else if (filterState?.value) {
      const grainKey = getEffectiveGrain(
        filterState.value,
        (filterState.grain as string) || defaultGrain,
        filterState.value,
        ownState.fiscalYear,
      );
      const preset = DEFAULT_PRESETS.find(p => p.key === filterState.value);
      if (preset) {
        const fiscalYear =
          preset.key === 'this_fiscal_year'
            ? fiscalYearStartFromDate(getDataEndDate())
            : null;
        setActiveGrain(grainKey);
        setActiveFiscalYear(fiscalYear);
        setActiveFiscalYearEnd(null);
        applyFilter(getPresetTimeRange(preset.key), grainKey, preset.key, {
          ...restoredSelection,
          ...(enableCustomComparison ? restoredComparison : {}),
          activePreset: preset.key,
          activeGrain: grainKey,
          fiscalYear,
          fiscalYearEnd: null,
          ...(fiscalYear !== null ? { rangeLabel: `${fiscalYear}财年` } : {}),
        });
      } else {
        const restoredFiscalYearRange = getRestoredFiscalYearRange(
          filterState.value,
        );
        applyFilter(filterState.value as string, grainKey, null, {
          ...restoredSelection,
          ...(enableCustomComparison ? restoredComparison : {}),
          activePreset: null,
          activeGrain: grainKey,
          lastRange: filterState.value,
          fiscalYear: restoredFiscalYearRange?.start ?? null,
          fiscalYearEnd:
            restoredFiscalYearRange &&
            restoredFiscalYearRange.end !== restoredFiscalYearRange.start
              ? restoredFiscalYearRange.end
              : null,
          ...(restoredFiscalYearRange !== null
            ? {
                rangeLabel: getProfitFiscalYearRange(
                  restoredFiscalYearRange.start,
                  restoredFiscalYearRange.end,
                ).label,
              }
            : {}),
        });
      }
    } else {
      const preset = DEFAULT_PRESETS.find(p => p.key === defaultPreset);
      if (preset) {
        const grainKey = getEffectiveGrain(preset.key, initialGrain);
        const fiscalYear =
          preset.key === 'this_fiscal_year'
            ? fiscalYearStartFromDate(getDataEndDate())
            : null;
        setActiveGrain(grainKey);
        setActiveFiscalYear(fiscalYear);
        setActiveFiscalYearEnd(null);
        applyFilter(getPresetTimeRange(preset.key), grainKey, preset.key, {
          ...restoredSelection,
          ...(enableCustomComparison ? restoredComparison : {}),
          activePreset: preset.key,
          activeGrain: grainKey,
          fiscalYear,
          fiscalYearEnd: null,
          ...(fiscalYear !== null ? { rangeLabel: `${fiscalYear}财年` } : {}),
        });
      }
    }
  }, [
    restoredSelection,
    enableCustomComparison,
    initialGrain,
    restoredComparison,
    applyFilter,
    filterState?.grain,
    defaultPreset,
    filterState?.value,
    defaultGrain,
    getPresetTimeRange,
    ownState.fiscalYear,
  ]);

  const prevFSValue = useRef(filterState?.value);
  const prevFSGrain = useRef(filterState?.grain);
  const prevFSSelection = useRef(savedSelectionKey);
  const savedComparisonKey = JSON.stringify(restoredComparison);
  const prevFSComparison = useRef(savedComparisonKey);
  useEffect(() => {
    if (
      filterState?.value !== prevFSValue.current ||
      savedSelectionKey !== prevFSSelection.current ||
      savedComparisonKey !== prevFSComparison.current
    ) {
      prevFSValue.current = filterState.value;
      prevFSSelection.current = savedSelectionKey;
      prevFSComparison.current = savedComparisonKey;
      const grainKey = getEffectiveGrain(
        filterState.value,
        (filterState.grain as string) || activeGrain,
        filterState.value,
        ownState.fiscalYear,
      );
      if (filterState.value === null) {
        setActivePreset(null);
        setActiveFiscalYear(null);
        setActiveFiscalYearEnd(null);
        setPendingFiscalYearStart(null);
        applyFilter('', grainKey, null, {
          ...restoredSelection,
          ...(enableCustomComparison ? restoredComparison : {}),
          activePreset: null,
          activeGrain: grainKey,
          lastRange: '',
          fiscalYear: null,
          fiscalYearEnd: null,
        });
      } else {
        const preset = DEFAULT_PRESETS.find(p => p.key === filterState.value);
        if (preset) {
          const fiscalYear =
            preset.key === 'this_fiscal_year'
              ? fiscalYearStartFromDate(getDataEndDate())
              : null;
          setActivePreset(preset.key);
          setActiveGrain(grainKey);
          setActiveFiscalYear(fiscalYear);
          setActiveFiscalYearEnd(null);
          setPendingFiscalYearStart(null);
          applyFilter(getPresetTimeRange(preset.key), grainKey, preset.key, {
            ...restoredSelection,
            ...(enableCustomComparison ? restoredComparison : {}),
            activePreset: preset.key,
            activeGrain: grainKey,
            fiscalYear,
            fiscalYearEnd: null,
            ...(fiscalYear !== null ? { rangeLabel: `${fiscalYear}财年` } : {}),
          });
        } else if (filterState.value) {
          const restoredFiscalYearRange = getRestoredFiscalYearRange(
            filterState.value,
          );
          setActivePreset(null);
          setActiveFiscalYear(restoredFiscalYearRange?.start ?? null);
          setActiveFiscalYearEnd(
            restoredFiscalYearRange &&
              restoredFiscalYearRange.end !== restoredFiscalYearRange.start
              ? restoredFiscalYearRange.end
              : null,
          );
          if (restoredFiscalYearRange === null) {
            setPendingFiscalYearStart(null);
          }
          applyFilter(filterState.value as string, grainKey, null, {
            ...restoredSelection,
            ...(enableCustomComparison ? restoredComparison : {}),
            activePreset: null,
            activeGrain: grainKey,
            lastRange: filterState.value,
            fiscalYear: restoredFiscalYearRange?.start ?? null,
            fiscalYearEnd:
              restoredFiscalYearRange &&
              restoredFiscalYearRange.end !== restoredFiscalYearRange.start
                ? restoredFiscalYearRange.end
                : null,
            ...(restoredFiscalYearRange !== null
              ? {
                  rangeLabel: getProfitFiscalYearRange(
                    restoredFiscalYearRange.start,
                    restoredFiscalYearRange.end,
                  ).label,
                }
              : {}),
          });
        }
      }
    }
    if (filterState?.grain && filterState.grain !== prevFSGrain.current) {
      prevFSGrain.current = filterState.grain;
      setActiveGrain(
        getEffectiveGrain(filterState.value, filterState.grain as string),
      );
    }
  }, [
    filterState?.value,
    filterState?.grain,
    savedSelectionKey,
    savedComparisonKey,
    enableCustomComparison,
    restoredComparison,
    restoredSelection,
    ownState.fiscalYear,
    activeGrain,
    applyFilter,
    getPresetTimeRange,
  ]);

  const clearPendingSelections = () => {
    setPendingDayStart('');
    setPendingWeekStart('');
    setPendingMonthStart('');
    setPendingQuarterStart('');
    setPendingYearStart(null);
    setPendingFiscalYearStart(null);
  };

  const clearNonFiscalPendingSelections = () => {
    setPendingDayStart('');
    setPendingWeekStart('');
    setPendingMonthStart('');
    setPendingQuarterStart('');
    setPendingYearStart(null);
  };

  const selectPoint = (unit: string, grain = activeGrain) => {
    clearPendingSelections();
    setActivePreset(null);
    setActiveFiscalYear(null);
    setActiveFiscalYearEnd(null);
    applyFilter(lastRangeRef.current, grain, null, {
      selectionMode: 'points',
      selectedRanges: toggleSelectedRange(selectedRanges, unit),
      fiscalYear: null,
      fiscalYearEnd: null,
    });
  };

  const changeSelectionMode = (mode: SelectionMode) => {
    if (mode === selectionMode) return;
    if (mode === 'points' && !timeColumn) return;
    if (mode === 'continuous' && selectedRangesHaveGaps(selectedRanges)) {
      // 原生确认阻止扩大日期范围；取消不修改 DataMask，也不发起查询。
      // eslint-disable-next-line no-alert
      if (!window.confirm('切换到连续区间将包含中间所有未选日期，是否继续？'))
        return;
    }
    const range = activePreset
      ? getPresetTimeRange(activePreset)
      : lastRangeRef.current;
    const points = mode === 'points' && range ? [range] : [];
    const continuous =
      selectionMode === 'points'
        ? selectedRangeEnvelope(selectedRanges)
        : range;
    clearPendingSelections();
    setSelectionMode(mode);
    setActivePreset(null);
    setActiveFiscalYear(null);
    setActiveFiscalYearEnd(null);
    applyFilter(continuous, activeGrain, null, {
      selectionMode: mode,
      selectedRanges: points,
      fiscalYear: null,
      fiscalYearEnd: null,
    });
  };

  const handlePresetClick = (preset: TimePreset) => {
    const isFiscalPreset = preset.key === 'this_fiscal_year';
    const fiscalYear = isFiscalPreset
      ? fiscalYearStartFromDate(getDataEndDate())
      : null;
    if (fiscalYear !== null && fiscalYear < minimumFiscalYear) {
      return;
    }
    clearPendingSelections();
    const grainKey = isFiscalPreset ? 'fiscal_year' : activeGrain;
    setActivePreset(preset.key);
    setActiveGrain(grainKey);
    setActiveFiscalYear(fiscalYear);
    setActiveFiscalYearEnd(null);
    applyFilter(getPresetTimeRange(preset.key), grainKey, preset.key, {
      ...(selectionMode === 'points'
        ? { selectedRanges: [getPresetTimeRange(preset.key)] }
        : {}),
      activePreset: preset.key,
      activeGrain: grainKey,
      fiscalYear,
      fiscalYearEnd: null,
      ...(fiscalYear !== null ? { rangeLabel: `${fiscalYear}财年` } : {}),
    });
  };

  const applyFiscalYearRange = (rangeStart: number, rangeEnd: number) => {
    if (rangeStart < minimumFiscalYear) {
      return;
    }
    const fiscalRange = getProfitFiscalYearRange(rangeStart, rangeEnd);
    const isSingleFiscalYear = rangeStart === rangeEnd;
    setActivePreset(null);
    setActiveGrain('fiscal_year');
    setActiveFiscalYear(rangeStart);
    setActiveFiscalYearEnd(isSingleFiscalYear ? null : rangeEnd);
    applyFilter(fiscalRange.timeRange, 'fiscal_year', null, {
      activePreset: null,
      activeGrain: 'fiscal_year',
      fiscalYear: rangeStart,
      fiscalYearEnd: isSingleFiscalYear ? null : rangeEnd,
      rangeLabel: fiscalRange.label,
    });
  };

  const handleFiscalYearClick = (fiscalYear: number) => {
    if (
      fiscalYear < minimumFiscalYear ||
      getProfitFiscalYearRange(fiscalYear).timeRange.substring(0, 10) >
        getDataEndDate()
    ) {
      return;
    }
    if (selectionMode === 'points') {
      selectPoint(
        getProfitFiscalYearRange(fiscalYear).timeRange,
        'fiscal_year',
      );
      return;
    }
    clearNonFiscalPendingSelections();
    setActivePreset(null);
    setActiveGrain('fiscal_year');
    if (pendingFiscalYearStart === null) {
      setPendingFiscalYearStart(fiscalYear);
      applyFiscalYearRange(fiscalYear, fiscalYear);
      return;
    }
    const [rangeStart, rangeEnd] = normalizePair(
      pendingFiscalYearStart,
      fiscalYear,
      (a, b) => a - b,
    );
    setPendingFiscalYearStart(null);
    applyFiscalYearRange(rangeStart, rangeEnd);
  };

  const handleGrainClick = (grain: TimeGrainOption) => {
    clearPendingSelections();
    if (selectionMode === 'points') {
      setActiveGrain(grain.key);
      applyFilter(lastRangeRef.current, grain.key, null, { selectedRanges });
      return;
    }
    if (grain.key === 'fiscal_year') {
      const currentFiscalYear = fiscalYearStartFromDate(getDataEndDate());
      setFiscalYearOffset(0);
      applyFiscalYearRange(currentFiscalYear, currentFiscalYear);
      return;
    }

    const nextPreset =
      activePreset === 'this_fiscal_year' ? null : activePreset;
    const range = activePreset
      ? getPresetTimeRange(activePreset)
      : lastRangeRef.current;
    setActiveGrain(grain.key);
    setActiveFiscalYear(null);
    setActiveFiscalYearEnd(null);
    if (range) {
      applyFilter(range, grain.key, nextPreset, {
        activePreset: nextPreset,
        activeGrain: grain.key,
        fiscalYear: null,
        fiscalYearEnd: null,
      });
    } else {
      applyFilter('', grain.key, null, {
        activePreset: null,
        activeGrain: grain.key,
        lastRange: '',
        fiscalYear: null,
        fiscalYearEnd: null,
      });
    }
  };

  const handleCalendarDayClick = (val: string) => {
    if (val < minimumCalendarDate || val > getDataEndDate()) {
      return;
    }

    // Route to grain-specific handlers for month/quarter/year
    if (activeGrain === 'month') {
      handleMonthClick(val.substring(0, 7));
      return;
    }
    if (activeGrain === 'quarter') {
      const m = parseInt(val.substring(5, 7), 10);
      const y = parseInt(val.substring(0, 4), 10);
      let q: number, sy: number;
      if (m >= 4 && m <= 6) {
        q = 1;
        sy = y;
      } else if (m >= 7 && m <= 9) {
        q = 2;
        sy = y;
      } else if (m >= 10 && m <= 12) {
        q = 3;
        sy = y;
      } else {
        q = 4;
        sy = y - 1;
      }
      handleQuarterClick(quarterId(sy, q));
      return;
    }
    if (activeGrain === 'year') {
      handleYearClick(parseInt(val.substring(0, 4), 10));
      return;
    }

    setActivePreset(null);
    setActiveFiscalYear(null);
    setActiveFiscalYearEnd(null);

    if (selectionMode === 'points') {
      selectPoint(`${val} : ${addDays(val, 1)}`);
      return;
    }
    if (!pendingDayStart) {
      setPendingDayStart(val);
      setStartDate(val);
      setEndDate(val);
      applyFilter(`${val} : ${addDays(val, 1)}`, activeGrain, null, {
        activePreset: null,
        fiscalYear: null,
        fiscalYearEnd: null,
        startDate: val,
        endDate: val,
      });
      return;
    }

    const [rangeStart, rangeEnd] = normalizePair(pendingDayStart, val, (a, b) =>
      a.localeCompare(b),
    );
    setPendingDayStart('');
    setStartDate(rangeStart);
    setEndDate(rangeEnd);
    applyFilter(`${rangeStart} : ${addDays(rangeEnd, 1)}`, activeGrain, null, {
      activePreset: null,
      fiscalYear: null,
      fiscalYearEnd: null,
      startDate: rangeStart,
      endDate: rangeEnd,
    });
  };

  const applyWeekRange = (rangeStart: string, rangeEnd: string) => {
    setWeekStartDate(rangeStart);
    setWeekEndDate(rangeEnd);
    applyFilter(`${rangeStart} : ${addDays(rangeEnd, 7)}`, activeGrain, null, {
      activePreset: null,
      fiscalYear: null,
      fiscalYearEnd: null,
      weekStartDate: rangeStart,
      weekEndDate: rangeEnd,
    });
  };

  const handleWeekClick = (weekStart: string) => {
    if (weekStart < minimumCalendarDate || weekStart > getDataEndDate()) {
      return;
    }
    if (selectionMode === 'points') {
      selectPoint(`${weekStart} : ${addDays(weekStart, 7)}`);
      return;
    }
    setActivePreset(null);
    setActiveFiscalYear(null);
    setActiveFiscalYearEnd(null);
    if (!pendingWeekStart) {
      setPendingWeekStart(weekStart);
      applyWeekRange(weekStart, weekStart);
      return;
    }
    const [rangeStart, rangeEnd] = normalizePair(
      pendingWeekStart,
      weekStart,
      (a, b) => a.localeCompare(b),
    );
    setPendingWeekStart('');
    applyWeekRange(rangeStart, rangeEnd);
  };

  const applyMonthRange = (rangeStart: string, rangeEnd: string) => {
    setStartMonth(rangeStart);
    setEndMonth(rangeEnd);
    applyFilter(
      `${monthStartFromMonth(rangeStart)} : ${nextMonthStart(rangeEnd)}`,
      activeGrain,
      null,
      {
        activePreset: null,
        fiscalYear: null,
        fiscalYearEnd: null,
        startMonth: rangeStart,
        endMonth: rangeEnd,
      },
    );
  };

  const handleMonthClick = (month: string) => {
    if (
      monthStartFromMonth(month) < minimumCalendarDate ||
      monthStartFromMonth(month) > getDataEndDate()
    ) {
      return;
    }
    if (selectionMode === 'points') {
      selectPoint(`${monthStartFromMonth(month)} : ${nextMonthStart(month)}`);
      return;
    }
    setActivePreset(null);
    setActiveFiscalYear(null);
    setActiveFiscalYearEnd(null);
    if (!pendingMonthStart) {
      setPendingMonthStart(month);
      applyMonthRange(month, month);
      return;
    }
    const [rangeStart, rangeEnd] = normalizePair(
      pendingMonthStart,
      month,
      (a, b) => a.localeCompare(b),
    );
    setPendingMonthStart('');
    applyMonthRange(rangeStart, rangeEnd);
  };

  const applyQuarterRange = (rangeStart: string, rangeEnd: string) => {
    const start = parseQuarterId(rangeStart);
    const end = parseQuarterId(rangeEnd);
    const qs = getFQRange(start.year, start.q);
    const qe = getFQRange(end.year, end.q);
    setQStartYear(start.year);
    setQStartQ(start.q);
    setQEndYear(end.year);
    setQEndQ(end.q);
    applyFilter(`${qs.start} : ${qe.end}`, activeGrain, null, {
      activePreset: null,
      fiscalYear: null,
      fiscalYearEnd: null,
      qStartYear: start.year,
      qStartQ: start.q,
      qEndYear: end.year,
      qEndQ: end.q,
    });
  };

  const handleQuarterClick = (id: string) => {
    const { year, q } = parseQuarterId(id);
    const quarterRange = getFQRange(year, q);
    if (
      quarterRange.start < minimumCalendarDate ||
      quarterRange.start > getDataEndDate()
    ) {
      return;
    }
    if (selectionMode === 'points') {
      selectPoint(`${quarterRange.start} : ${quarterRange.end}`);
      return;
    }
    setActivePreset(null);
    setActiveFiscalYear(null);
    setActiveFiscalYearEnd(null);
    if (!pendingQuarterStart) {
      setPendingQuarterStart(id);
      applyQuarterRange(id, id);
      return;
    }
    const [rangeStart, rangeEnd] = normalizePair(
      pendingQuarterStart,
      id,
      compareQuarter,
    );
    setPendingQuarterStart('');
    applyQuarterRange(rangeStart, rangeEnd);
  };

  const applyYearRange = (rangeStart: number, rangeEnd: number) => {
    setStartYear(rangeStart);
    setEndYear(rangeEnd);
    applyFilter(
      `${fmtDate(rangeStart, 1, 1)} : ${fmtDate(rangeEnd + 1, 1, 1)}`,
      activeGrain,
      null,
      {
        activePreset: null,
        fiscalYear: null,
        fiscalYearEnd: null,
        startYear: rangeStart,
        endYear: rangeEnd,
      },
    );
  };

  const handleYearClick = (year: number) => {
    if (
      fmtDate(year, 1, 1) < minimumCalendarDate ||
      fmtDate(year, 1, 1) > getDataEndDate()
    ) {
      return;
    }
    if (selectionMode === 'points') {
      selectPoint(`${fmtDate(year, 1, 1)} : ${fmtDate(year + 1, 1, 1)}`);
      return;
    }
    setActivePreset(null);
    setActiveFiscalYear(null);
    setActiveFiscalYearEnd(null);
    if (pendingYearStart === null) {
      setPendingYearStart(year);
      applyYearRange(year, year);
      return;
    }
    const [rangeStart, rangeEnd] = normalizePair(
      pendingYearStart,
      year,
      (a, b) => a - b,
    );
    setPendingYearStart(null);
    applyYearRange(rangeStart, rangeEnd);
  };

  const currentLabel =
    selectionMode === 'points'
      ? selectedRanges.length
        ? `点选区间（${selectedRanges.length}段）`
        : '请选择区间'
      : activeFiscalYear !== null
        ? activeFiscalYearEnd !== null
          ? `${activeFiscalYear}-${activeFiscalYearEnd}财年`
          : `${activeFiscalYear}财年`
        : activePreset === 'this_fiscal_year'
          ? `${fiscalYearStartFromDate(getDataEndDate())}财年`
          : activePreset
            ? DEFAULT_PRESETS.find(p => p.key === activePreset)?.label || ''
            : lastRangeRef.current
              ? '自定义范围'
              : '不过滤';
  const currentGrain =
    TIME_GRAIN_OPTIONS.find(g => g.key === activeGrain)?.label || '日';
  const currentRange = activePreset
    ? getPresetTimeRange(activePreset)
    : lastRangeRef.current;
  const displayRanges =
    selectionMode === 'points' ? selectedRanges : [currentRange];
  const dateSelected = (date: string) =>
    displayRanges.some(range => isDateInRange(date, range));

  const baseMonth = getMonthStart(getDataEndDate());
  const calendarStartMonth =
    minimumCalendarMonth > baseMonth ? baseMonth : minimumCalendarMonth;
  const firstCalendarMonth = addMonths(baseMonth, calendarMonthOffset);
  const calendarMonthCount = Math.max(
    1,
    (Number(baseMonth.substring(0, 4)) -
      Number(calendarStartMonth.substring(0, 4))) *
      12 +
      Number(baseMonth.substring(5, 7)) -
      Number(calendarStartMonth.substring(5, 7)) +
      1,
  );
  const canGoBack = firstCalendarMonth > calendarStartMonth;
  const canGoForward = firstCalendarMonth < baseMonth;

  const displayYearStart = Math.max(
    minimumSelectableYear,
    currentYear + yearDecadeOffset * 12,
  );
  const canGoBackYear = displayYearStart > minimumSelectableYear;
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = displayYearStart; y < displayYearStart + 12; y++)
      years.push(y);
    return years;
  }, [displayYearStart]);

  const displayYear = Math.max(
    minimumMonthDisplayYear,
    currentYear + monthYearOffset,
  );
  const canGoBackMonth = displayYear > minimumMonthDisplayYear;
  const monthOptions = useMemo(() => {
    const months: string[] = [];
    for (let m = 1; m <= 12; m += 1) {
      const month = `${displayYear}-${String(m).padStart(2, '0')}`;
      if (monthStartFromMonth(month) >= minimumSelectableMonth) {
        months.push(month);
      }
    }
    return months;
  }, [displayYear, minimumSelectableMonth]);

  const displayQuarterYear = Math.max(
    minimumQuarterDisplayYear,
    currentYear + quarterYearOffset,
  );
  const canGoBackQuarter = displayQuarterYear > minimumQuarterDisplayYear;
  const quarterOptions = useMemo(() => {
    const quarters: string[] = [];
    for (let q = 1; q <= 4; q += 1) {
      const id = quarterId(displayQuarterYear, q);
      if (getFQRange(displayQuarterYear, q).start >= minimumCalendarDate) {
        quarters.push(id);
      }
    }
    return quarters;
  }, [displayQuarterYear, minimumCalendarDate]);

  const renderCalendarNavigation = () => (
    <div style={styles.nav}>
      <button
        type="button"
        onClick={() => canGoBack && setCalendarMonthOffset(o => o - 1)}
        disabled={!canGoBack}
        style={{
          ...styles.btn,
          color: canGoBack ? styles.colors.primary : styles.colors.disabled,
        }}
      >
        ← 上个月
      </button>
      <select
        aria-label="快速跳转月份"
        value={firstCalendarMonth}
        onChange={e => {
          const target = new Date(`${e.target.value}T00:00:00`);
          const base = new Date(`${baseMonth}T00:00:00`);
          const diffMonths =
            (target.getFullYear() - base.getFullYear()) * 12 +
            (target.getMonth() - base.getMonth());
          setCalendarMonthOffset(diffMonths);
        }}
        style={styles.selectInput}
      >
        {Array.from({ length: calendarMonthCount }, (_, i) => {
          const m = addMonths(calendarStartMonth, i);
          return (
            <option key={m} value={m}>
              {m.substring(0, 7)}
            </option>
          );
        })}
      </select>
      <button
        type="button"
        onClick={() => canGoForward && setCalendarMonthOffset(o => o + 1)}
        disabled={!canGoForward}
        style={{
          ...styles.btn,
          color: canGoForward ? styles.colors.primary : styles.colors.disabled,
        }}
      >
        下个月 →
      </button>
    </div>
  );

  const renderCalendarMonth = (monthStart: string) => (
    <div style={{ minWidth: 'unset' }}>
      <div
        style={{
          textAlign: 'center',
          fontWeight: 600,
          marginBottom: 12,
          color: styles.colors.text,
        }}
      >
        {formatMonthTitle(monthStart)}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 26px)',
          gap: 5,
          color: styles.colors.textSecondary,
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {['一', '二', '三', '四', '五', '六', '日'].map(day => (
          <div key={day} style={{ textAlign: 'center' }}>
            {day}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 26px)',
          gap: 5,
        }}
      >
        {getMonthDays(monthStart).map(day => {
          const selected = dateSelected(day.date);
          const endpoint = displayRanges.some(range =>
            isDateRangeEndpoint(day.date, range),
          );
          const capped = day.date > getDataEndDate();
          if (day.date < minimumCalendarDate) {
            return <span key={day.date} aria-hidden="true" />;
          }
          return (
            <button
              key={day.date}
              type="button"
              aria-label={day.date}
              aria-pressed={selected}
              disabled={capped}
              onClick={() => handleCalendarDayClick(day.date)}
              style={{
                width: 26,
                height: 26,
                border: 'none',
                borderRadius: endpoint ? 13 : selected ? 2 : 0,
                background: endpoint
                  ? styles.colors.primary
                  : selected
                    ? styles.colors.primaryBg
                    : 'transparent',
                color: endpoint
                  ? styles.colors.selectedText
                  : day.muted || capped
                    ? styles.colors.disabled
                    : selected
                      ? styles.colors.primary
                      : styles.colors.text,
                cursor: capped ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              {day.day}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderWeekCalendarMonth = (monthStart: string) => (
    <div style={{ minWidth: 'unset' }}>
      <div
        style={{
          textAlign: 'center',
          fontWeight: 600,
          marginBottom: 12,
          color: styles.colors.text,
        }}
      >
        {formatMonthTitle(monthStart)}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 26px)',
          gap: 5,
          color: styles.colors.textSecondary,
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} style={{ textAlign: 'center' }}>
            {day}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 26px)',
          gap: 5,
        }}
      >
        {getMonthDays(monthStart, true).map(day => {
          const weekStart = toSunday(day.date);
          const weekEndExclusive = addDays(weekStart, 7);
          const selected = displayRanges.some(range =>
            Boolean(
              range &&
              weekStart < parseRange(range).endExclusive &&
              weekEndExclusive > parseRange(range).start,
            ),
          );
          const endpoint = displayRanges.some(
            range =>
              parseRange(range).start === weekStart ||
              parseRange(range).endExclusive === weekEndExclusive,
          );
          const capped = day.date > getDataEndDate();
          if (weekStart < minimumCalendarDate) {
            return <span key={day.date} aria-hidden="true" />;
          }
          return (
            <button
              key={day.date}
              type="button"
              aria-label={day.date}
              disabled={capped}
              onClick={() => handleWeekClick(weekStart)}
              title={`周 ${weekStart} ~ ${addDays(weekStart, 6)}`}
              aria-pressed={selected}
              style={{
                width: 26,
                height: 26,
                border: 'none',
                borderRadius: endpoint ? 13 : selected ? 2 : 0,
                background: endpoint
                  ? styles.colors.primary
                  : selected
                    ? styles.colors.primaryBg
                    : 'transparent',
                color: endpoint
                  ? styles.colors.selectedText
                  : day.muted || capped
                    ? styles.colors.disabled
                    : selected
                      ? styles.colors.primary
                      : styles.colors.text,
                cursor: capped ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              {day.day}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderDaySelector = () => (
    <>
      {renderCalendarNavigation()}
      <div style={{ ...styles.hint }}>
        {selectionMode === 'points'
          ? '逐项点选，再次点击取消；中间未选日期不参与查询。'
          : '单击选择一天；继续单击第二个日期选择范围。范围完成后再次单击会重新开始。'}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        {renderCalendarMonth(firstCalendarMonth)}
      </div>
    </>
  );

  const renderWeekSelector = () => (
    <>
      {renderCalendarNavigation()}
      <div style={{ ...styles.hint }}>
        点击任意日期会自动选择该日期所在的周日-周六整周。
      </div>
      <div
        style={{
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        {renderWeekCalendarMonth(firstCalendarMonth)}
      </div>
    </>
  );

  const renderMonthSelector = () => (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={() => canGoBackMonth && setMonthYearOffset(o => o - 1)}
          disabled={!canGoBackMonth}
          style={{
            fontSize: 12,
            cursor: canGoBackMonth ? 'pointer' : 'not-allowed',
            border: 'none',
            background: 'transparent',
            color: canGoBackMonth
              ? styles.colors.primary
              : styles.colors.disabled,
          }}
        >
          {'<'} {displayYear - 1}年
        </button>
        <span
          style={{ fontSize: 12, fontWeight: 600, color: styles.colors.text }}
        >
          {displayYear}年
        </span>
        <button
          type="button"
          onClick={() => setMonthYearOffset(o => o + 1)}
          style={{
            fontSize: 12,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: styles.colors.primary,
          }}
        >
          {displayYear + 1}年 {'>'}
        </button>
      </div>
      <div data-test="custom-time-month-grid" style={styles.monthGrid}>
        {monthOptions.map(month => {
          const selected = dateSelected(monthStartFromMonth(month));
          const capped = monthStartFromMonth(month) > getDataEndDate();
          return (
            <button
              key={month}
              type="button"
              disabled={capped}
              onClick={() => handleMonthClick(month)}
              aria-pressed={selected}
              style={{
                ...(selected ? styles.periodActive : styles.periodBtn),
                opacity: capped ? 0.45 : 1,
                cursor: capped ? 'not-allowed' : 'pointer',
              }}
            >
              {month}
            </button>
          );
        })}
      </div>
    </>
  );

  const renderQuarterSelector = () => (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={() => canGoBackQuarter && setQuarterYearOffset(o => o - 1)}
          disabled={!canGoBackQuarter}
          style={{
            fontSize: 12,
            cursor: canGoBackQuarter ? 'pointer' : 'not-allowed',
            border: 'none',
            background: 'transparent',
            color: canGoBackQuarter
              ? styles.colors.primary
              : styles.colors.disabled,
          }}
        >
          {'<'} {displayQuarterYear - 1}年
        </button>
        <span
          style={{ fontSize: 12, fontWeight: 600, color: styles.colors.text }}
        >
          {displayQuarterYear}年
        </span>
        <button
          type="button"
          onClick={() => setQuarterYearOffset(o => o + 1)}
          style={{
            fontSize: 12,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: styles.colors.primary,
          }}
        >
          {displayQuarterYear + 1}年 {'>'}
        </button>
      </div>
      <div data-test="custom-time-quarter-grid" style={styles.quarterGrid}>
        {quarterOptions.map(id => {
          const { year, q } = parseQuarterId(id);
          const range = getFQRange(year, q);
          const selected = dateSelected(range.start);
          const capped =
            range.start < minimumCalendarDate || range.start > getDataEndDate();
          return (
            <button
              key={id}
              type="button"
              disabled={capped}
              onClick={() => handleQuarterClick(id)}
              aria-pressed={selected}
              style={{
                ...(selected ? styles.periodActive : styles.periodBtn),
                opacity: capped ? 0.45 : 1,
                cursor: capped ? 'not-allowed' : 'pointer',
              }}
            >
              {quarterLabel(id)}
            </button>
          );
        })}
      </div>
    </>
  );

  const renderYearSelector = () => (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          onClick={() => canGoBackYear && setYearDecadeOffset(o => o - 1)}
          disabled={!canGoBackYear}
          style={{
            fontSize: 12,
            cursor: canGoBackYear ? 'pointer' : 'not-allowed',
            border: 'none',
            background: 'transparent',
            color: canGoBackYear
              ? styles.colors.primary
              : styles.colors.disabled,
          }}
        >
          {'<'} 前十年
        </button>
        <span
          style={{ fontSize: 12, fontWeight: 600, color: styles.colors.text }}
        >
          {displayYearStart} - {displayYearStart + 11}
        </span>
        <button
          type="button"
          onClick={() => setYearDecadeOffset(o => o + 1)}
          style={{
            fontSize: 12,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: styles.colors.primary,
          }}
        >
          后十年 {'>'}
        </button>
      </div>
      <div data-test="custom-time-year-grid" style={styles.yearGrid}>
        {yearOptions.map(year => {
          const selected = dateSelected(fmtDate(year, 1, 1));
          const capped =
            fmtDate(year, 1, 1) < minimumCalendarDate ||
            fmtDate(year, 1, 1) > getDataEndDate();
          return (
            <button
              key={year}
              type="button"
              disabled={capped}
              onClick={() => handleYearClick(year)}
              aria-pressed={selected}
              style={{
                ...(selected ? styles.periodActive : styles.periodBtn),
                opacity: capped ? 0.45 : 1,
                cursor: capped ? 'not-allowed' : 'pointer',
              }}
            >
              {year}年
            </button>
          );
        })}
      </div>
    </>
  );

  const fiscalYearStart = fiscalYearStartFromDate(getDataEndDate());
  const displayFiscalYearStart = Math.max(
    minimumFiscalYear,
    fiscalYearStart + fiscalYearOffset * 12,
  );
  const canGoBackFiscalYear = displayFiscalYearStart > minimumFiscalYear;
  const canGoForwardFiscalYear = fiscalYearOffset < 0;
  const fiscalYearOptions = useMemo(() => {
    const years: number[] = [];
    for (
      let year = displayFiscalYearStart;
      year < displayFiscalYearStart + 12;
      year += 1
    ) {
      years.push(year);
    }
    return years;
  }, [displayFiscalYearStart]);

  const renderFiscalYearSelector = () => (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          aria-label="前十二年财年"
          onClick={() =>
            canGoBackFiscalYear && setFiscalYearOffset(offset => offset - 1)
          }
          disabled={!canGoBackFiscalYear}
          style={{
            fontSize: 12,
            cursor: canGoBackFiscalYear ? 'pointer' : 'not-allowed',
            border: 'none',
            background: 'transparent',
            color: canGoBackFiscalYear
              ? styles.colors.primary
              : styles.colors.disabled,
          }}
        >
          {'<'} 前十二年
        </button>
        <span
          style={{ fontSize: 12, fontWeight: 600, color: styles.colors.text }}
        >
          {displayFiscalYearStart} - {displayFiscalYearStart + 11} 财年
        </span>
        <button
          type="button"
          aria-label="后十二年财年"
          onClick={() =>
            canGoForwardFiscalYear && setFiscalYearOffset(offset => offset + 1)
          }
          disabled={!canGoForwardFiscalYear}
          style={{
            fontSize: 12,
            cursor: canGoForwardFiscalYear ? 'pointer' : 'not-allowed',
            border: 'none',
            background: 'transparent',
            color: canGoForwardFiscalYear
              ? styles.colors.primary
              : styles.colors.disabled,
          }}
        >
          后十二年 {'>'}
        </button>
      </div>
      <div style={{ ...styles.hint }}>
        {selectionMode === 'points'
          ? '逐项选择财年，再次点击取消；不自动包含中间财年。'
          : '单击选择一个财年；继续单击第二个财年选择连续区间。范围完成后再次单击会重新开始。'}
      </div>
      <div data-test="custom-time-fiscal-year-grid" style={styles.yearGrid}>
        {fiscalYearOptions.map(year => {
          const capped = year < minimumFiscalYear || year > fiscalYearStart;
          const selected =
            selectionMode === 'points'
              ? dateSelected(fmtDate(year, 4, 1))
              : activeFiscalYear !== null &&
                year >= activeFiscalYear &&
                year <= (activeFiscalYearEnd ?? activeFiscalYear);
          return (
            <button
              key={year}
              type="button"
              aria-label={`${year}财年`}
              title={getProfitFiscalYearRange(year).timeRange}
              disabled={capped}
              onClick={() => handleFiscalYearClick(year)}
              aria-pressed={selected}
              style={{
                ...(selected ? styles.periodActive : styles.periodBtn),
                opacity: capped ? 0.45 : 1,
                cursor: capped ? 'not-allowed' : 'pointer',
              }}
            >
              {year}财年
            </button>
          );
        })}
      </div>
    </>
  );

  const renderExpandedSelector = () => {
    switch (activeGrain) {
      case 'week':
        return renderWeekSelector();
      case 'month':
        return renderMonthSelector();
      case 'quarter':
        return renderQuarterSelector();
      case 'year':
        return renderYearSelector();
      case 'fiscal_year':
        return renderFiscalYearSelector();
      case 'day':
      default:
        return renderDaySelector();
    }
  };

  const comparisonDraft = getCustomComparisonDraft(
    lastRangeRef.current,
    selectionMode,
    { customComparisonMode, comparisonStartDate, comparisonEndDate },
  );
  const changeComparison = (next: CustomComparisonDraft) => {
    setCustomComparisonMode(next.customComparisonMode);
    setComparisonStartDate(next.comparisonStartDate);
    setComparisonEndDate(next.comparisonEndDate);
    applyFilter(lastRangeRef.current, activeGrain, activePreset, next);
  };
  const comparisonStatus =
    enableCustomComparison &&
    customComparisonMode === 'custom' &&
    (comparisonDraft.error ? (
      <div role="alert">{comparisonDraft.error}</div>
    ) : (
      comparisonDraft.period && (
        <div role="status">
          {formatCustomPeriodComparisonLabel(comparisonDraft.period)}
        </div>
      )
    ));
  const currentBounds = parseRange(lastRangeRef.current);
  const currentPeriodLabel =
    isValidIsoDate(currentBounds.start) &&
    isValidIsoDate(currentBounds.endExclusive)
      ? `${currentBounds.start} ～ ${subtractDays(currentBounds.endExclusive, 1)}`
      : currentLabel;
  const comparisonControls = enableCustomComparison && (
    <div role="group" aria-label="对比期间" style={styles.grainColumn}>
      <strong>对比期间</strong>
      <label>
        对比方式{' '}
        <select
          aria-label="对比方式"
          value={customComparisonMode}
          onChange={event =>
            changeComparison({
              customComparisonMode: event.target
                .value as CustomComparisonDraft['customComparisonMode'],
              comparisonStartDate,
              comparisonEndDate,
            })
          }
        >
          <option value="original">原有对比</option>
          <option value="custom">自定义期间</option>
        </select>
      </label>
      {customComparisonMode === 'custom' && (
        <>
          <div>
            <label>
              对比开始日期{' '}
              <input
                type="date"
                aria-label="对比开始日期"
                value={comparisonStartDate}
                onChange={event =>
                  changeComparison({
                    customComparisonMode,
                    comparisonStartDate: event.target.value,
                    comparisonEndDate,
                  })
                }
              />
            </label>
          </div>
          <div>
            <label>
              对比结束日期{' '}
              <input
                type="date"
                aria-label="对比结束日期"
                value={comparisonEndDate}
                onChange={event =>
                  changeComparison({
                    customComparisonMode,
                    comparisonStartDate,
                    comparisonEndDate: event.target.value,
                  })
                }
              />
            </label>
          </div>
          {comparisonStatus}
        </>
      )}
      <div style={styles.hint}>
        自定义期间控制作用范围内图表原有的时间比较，并用于大数字、表格和透视表。
        请打开看板右上角“时间比较”；关闭时仅显示当前期间。
      </div>
      {customComparisonMode === 'original' && (
        <div style={styles.hint}>
          按现有时间粒度的原有策略对比；选择自定义期间后通过侧栏“应用筛选”提交。
        </div>
      )}
    </div>
  );

  if (collapsed) {
    return (
      <div
        style={styles.container}
        data-test="custom-time-filter"
        data-theme-aware="true"
      >
        <div style={styles.toolbar}>
          <span style={{ color: styles.colors.text, fontWeight: 500 }}>
            {currentLabel} | {currentGrain}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            style={styles.btn}
          >
            展开 ▼
          </button>
        </div>
        {comparisonStatus}
      </div>
    );
  }

  return (
    <div
      style={styles.container}
      data-test="custom-time-filter"
      data-theme-aware="true"
    >
      <div style={{ textAlign: 'right', padding: '4px 8px 0' }}>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          style={{ ...styles.btn, color: styles.colors.primary }}
        >
          ▲ 收起
        </button>
      </div>
      <div style={styles.shell}>
        <section role="group" aria-label="当前期间">
          <div style={styles.grainColumn}>
            <strong>当前期间</strong>
            <div style={styles.hint}>{currentPeriodLabel}</div>
          </div>
          <details open={enableCustomComparison ? undefined : true}>
            <summary style={styles.grainColumn}>修改当前期间</summary>
            {enableCustomRange && (
              <div style={styles.grainColumn}>
                <div
                  role="group"
                  aria-label="区间选择方式"
                  style={styles.grainGrid}
                >
                  {(['continuous', 'points'] as const).map(mode => (
                    <button
                      type="button"
                      key={mode}
                      aria-pressed={selectionMode === mode}
                      disabled={mode === 'points' && !timeColumn}
                      style={
                        selectionMode === mode
                          ? styles.grainActive
                          : styles.grainBtn
                      }
                      onClick={() => changeSelectionMode(mode)}
                    >
                      {mode === 'continuous' ? '连续区间' : '点选区间'}
                    </button>
                  ))}
                </div>
                {selectionMode === 'points' && (
                  <div style={styles.hint}>
                    比较方式：较上一选中区间；无时间轴图表显示选中区间合计。
                  </div>
                )}
                {!timeColumn && (
                  <div style={styles.hint}>绑定时间列后可使用点选区间。</div>
                )}
              </div>
            )}
            {enableTimeGrain && (
              <div style={styles.grainColumn}>
                <div style={styles.grainGrid}>
                  {TIME_GRAIN_OPTIONS.filter(
                    g => g.key !== 'fiscal_year' || enableCustomRange,
                  ).map(g => (
                    <button
                      key={g.key}
                      type="button"
                      style={
                        activeGrain === g.key
                          ? styles.grainActive
                          : styles.grainBtn
                      }
                      onClick={() => handleGrainClick(g)}
                    >
                      {getGrainDisplayLabel(g.label)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {enablePresets && (
              <div style={styles.presetColumn}>
                <div style={styles.grid}>
                  {DEFAULT_PRESETS.filter(
                    p => p.key !== 'this_fiscal_year',
                  ).map(p => (
                    <button
                      key={p.key}
                      type="button"
                      style={
                        activePreset === p.key ? styles.btnActive : styles.btn
                      }
                      onClick={() => handlePresetClick(p)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={styles.panel}>
              {enableCustomRange && renderExpandedSelector()}
            </div>
          </details>
        </section>
        {comparisonControls}
      </div>
      <div style={styles.status}>
        {currentLabel} | {currentGrain}
        {timeColumn ? ' | 时间列：' + timeColumn : ' | 未绑定时间列'}
      </div>
    </div>
  );
}
