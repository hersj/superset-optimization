import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@apache-superset/core/theme';
import { DEFAULT_PRESETS, TIME_GRAIN_OPTIONS, TimePreset, TimeGrainOption } from './types';
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
    container: { padding: 0, width: '100%', fontSize: 13, background: bg, color: text } as React.CSSProperties,
    shell: { display: 'flex', flexDirection: 'column' as const, minHeight: 330, border: `1px solid ${split}`, background: bg } as React.CSSProperties,
    toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', fontSize: 13, minHeight: 36, border: `1px solid ${split}`, background: bgElevated } as React.CSSProperties,
    grainColumn: { padding: '6px 12px', borderBottom: `1px solid ${split}` } as React.CSSProperties,
    presetColumn: { padding: '6px 12px', borderBottom: `1px solid ${split}` } as React.CSSProperties,
    panel: { padding: '10px 12px', flex: 1 } as React.CSSProperties,
    grid: { display: 'flex', flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 } as React.CSSProperties,
    denseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))', gap: 8 } as React.CSSProperties,
    monthGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 } as React.CSSProperties,
    quarterGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 } as React.CSSProperties,
    yearGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 } as React.CSSProperties,
    grainGrid: { display: 'flex', flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 } as React.CSSProperties,
    btn: { padding: '2px 8px', borderRadius: 4, fontSize: 13, cursor: 'pointer', border: '1px solid transparent', background: fill, color: textSecondary, textAlign: 'center' as const, lineHeight: '22px', whiteSpace: 'nowrap' as const } as React.CSSProperties,
    btnActive: { padding: '2px 8px', borderRadius: 4, fontSize: 13, cursor: 'pointer', border: `1px solid ${primary}`, background: primaryBg, color: primary, textAlign: 'center' as const, fontWeight: 600 as const, lineHeight: '22px', whiteSpace: 'nowrap' as const } as React.CSSProperties,
    grainBtn: { padding: '2px 10px', borderRadius: 4, fontSize: 13, cursor: 'pointer', border: '1px solid transparent', background: fill, color: textSecondary, textAlign: 'center' as const, lineHeight: '22px', whiteSpace: 'nowrap' as const } as React.CSSProperties,
    grainActive: { padding: '2px 10px', borderRadius: 4, fontSize: 13, cursor: 'pointer', border: `1px solid ${primary}`, background: primaryBg, color: primary, textAlign: 'center' as const, fontWeight: 600 as const, lineHeight: '22px', whiteSpace: 'nowrap' as const } as React.CSSProperties,
    periodBtn: { padding: '5px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid ${border}`, background: bgElevated, color: text, textAlign: 'center' as const, lineHeight: '18px', whiteSpace: 'nowrap' as const } as React.CSSProperties,
    periodActive: { padding: '5px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid ${primary}`, background: primaryBg, color: primary, textAlign: 'center' as const, fontWeight: 600 as const, lineHeight: '18px', whiteSpace: 'nowrap' as const } as React.CSSProperties,
    nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 } as React.CSSProperties,
    selectInput: { fontSize: 12, padding: '1px 4px', border: `1px solid ${border}`, borderRadius: 4, background: bgElevated, color: text } as React.CSSProperties,
    hint: { fontSize: 11, color: textTertiary, marginBottom: 8 } as React.CSSProperties,
    status: { marginTop: 6, padding: '3px 6px', fontSize: 11, color: textTertiary, background: fill, borderRadius: 4, lineHeight: '16px' } as React.CSSProperties,
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

function nextMonthStart(month: string): string {
  return addMonths(monthStartFromMonth(month), 1);
}

function toSunday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseRange(timeRange?: string): { start: string; endExclusive: string } {
  const [start = '', endExclusive = ''] = (timeRange || '')
    .split(':')
    .map(part => part.trim());
  return { start, endExclusive };
}

function isPresetKey(value: unknown): value is string {
  return typeof value === 'string' && DEFAULT_PRESETS.some(p => p.key === value);
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
  return Boolean(start && endExclusive && (date === start || date === subtractDays(endExclusive, 1)));
}

function getDataEndDate(): string {
  return getProfitDataEndDate();
}

function fiscalYearStartFromDate(dateStr: string): number {
  const [year, month] = dateStr.split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

function getFQRange(year: number, q: number): { start: string; end: string } {
  const qStart: Record<number, [number, number]> = {
    1: [year, 4], 2: [year, 7], 3: [year, 10], 4: [year + 1, 1],
  };
  const qEnd: Record<number, [number, number]> = {
    1: [year, 7], 2: [year, 10], 3: [year + 1, 1], 4: [year + 1, 4],
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
  return getFQRange(qa.year, qa.q).start.localeCompare(getFQRange(qb.year, qb.q).start);
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
 * - 业务规则：严格使用 formData.groupby 指定的列，不从图表 x 轴推断；财年从 4 月 1 日到次年 3 月 30 日，内部以次年 3 月 31 日右开边界表示；按财年按钮只产生财年分组，不保留日历年分组；本财年和财年日历同时设置范围与财年粒度；其他快捷范围只改变范围；财年列表只能选择不晚于数据截止财年的年份；第一次财年点击作为起点，第二次点击按年份排序后生成连续区间，再次点击重新开始选择。
 * - 状态与副作用：仅更新当前 Dashboard 会话 DataMask 和 ownState，不直接写数据库；切换普通预设、日历或粒度时清除已失效的财年状态，避免恢复陈旧范围。
 * - 外部依赖：依赖原生筛选器传入的 formData、Superset DataMask/QueryContext 对 TEMPORAL_RANGE、time_grain_sqla 和 time_compare 的处理。
 * - 异常与边界：旧配置没有 groupby 时保留全局 time_range 兼容路径；绑定列缺失时不伪造过滤列；空范围不得保留前一次范围；恢复时仅接受完整财年边界组成的连续区间；未来财年按钮不可选。
 * - 不变量与约束：一次只绑定一个时间列；时间粒度行只出现一个按财年入口；预设、财年日历、粒度和不过滤均走同一 applyFilter 路径，比较参数不能因入口不同而丢失；旧 this_fiscal_year 状态及旧版单/多财年区间状态必须恢复为 fiscal_year；财年多选只能形成连续区间，不能生成离散日期集合。
 * - 验证方式：组件测试覆盖绑定列、未绑定兼容、不过滤、按财年单选与连续多选、本财年快捷范围、旧状态恢复、财年格式化、外部范围同步和陈旧状态清理。
*/

export default function CustomTimeFilterPlugin(props: any) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { formData, filterState, ownState = {}, setDataMask } = props;

  const {
    defaultPreset = 'last_7d',
    defaultGrain = 'day',
    enablePresets = true,
    enableCustomRange = true,
    enableTimeGrain = true,
  } = formData || {};
  const timeColumn = getConfiguredTimeColumn(formData);

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

  const [activePreset, setActivePreset] = useState<string | null>(initialPreset);
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
    (ownState.startMonth as string | undefined) || monthFromDate(parsedSavedRange.start),
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
        ? new Date(`${parsedSavedRange.endExclusive}T00:00:00`).getFullYear() - 1
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
  const [pendingFiscalYearStart, setPendingFiscalYearStart] = useState<number | null>(null);

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
      const currentRange =
        Object.prototype.hasOwnProperty.call(overrides, 'lastRange')
          ? (overrides.lastRange as string)
          : lastRangeRef.current;
      return {
        activePreset,
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
      const rangeLabel = !timeRange
        ? '不过滤'
        : (stateOverrides.rangeLabel as string | undefined) ||
          (nextActivePreset === 'this_fiscal_year'
            ? `${fiscalYearStartFromDate(getDataEndDate())}财年`
            : nextActivePreset
              ? DEFAULT_PRESETS.find(p => p.key === nextActivePreset)?.label || timeRange
              : '自定义范围');

      setDataMask({
        extraFormData: {
          ...(timeColumn
            ? {
                filters: timeRange
                  ? [{ col: timeColumn, op: 'TEMPORAL_RANGE', val: timeRange }]
                  : [],
                time_range: timeRange || 'No filter',
              }
            : { time_range: timeRange }),
          time_grain_sqla: grainValue,
          time_compare: timeCompare,
        },
        filterState: {
          value: timeRange ? nextActivePreset || timeRange : null,
          grain: grainKey,
          label: rangeLabel + ' | ' + grainLabel,
        },
        ownState: buildOwnState({
          activePreset: nextActivePreset,
          activeGrain: grainKey,
          lastRange: timeRange,
          ...stateOverrides,
        }),
      });
    },
    [buildOwnState, setDataMask, timeColumn],
  );

  useEffect(() => {
    if (filterState?.value === null) {
      const grainKey = getEffectiveGrain(
        filterState.value,
        (filterState.grain as string) || defaultGrain,
        filterState.value,
        ownState.fiscalYear,
      );
      applyFilter('', grainKey, null, {
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
          activePreset: preset.key,
          activeGrain: grainKey,
          fiscalYear,
          fiscalYearEnd: null,
          ...(fiscalYear !== null
            ? { rangeLabel: `${fiscalYear}财年` }
            : {}),
        });
      } else {
        const restoredFiscalYearRange = getRestoredFiscalYearRange(filterState.value);
        applyFilter(filterState.value as string, grainKey, null, {
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
          activePreset: preset.key,
          activeGrain: grainKey,
          fiscalYear,
          fiscalYearEnd: null,
          ...(fiscalYear !== null
            ? { rangeLabel: `${fiscalYear}财年` }
            : {}),
        });
      }
    }
  }, []);

  const prevFSValue = useRef(filterState?.value);
  const prevFSGrain = useRef(filterState?.grain);
  useEffect(() => {
    if (filterState?.value !== prevFSValue.current) {
      prevFSValue.current = filterState.value;
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
            activePreset: preset.key,
            activeGrain: grainKey,
            fiscalYear,
            fiscalYearEnd: null,
            ...(fiscalYear !== null
              ? { rangeLabel: `${fiscalYear}财年` }
              : {}),
          });
        } else if (filterState.value) {
          const restoredFiscalYearRange = getRestoredFiscalYearRange(filterState.value);
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
      setActiveGrain(getEffectiveGrain(filterState.value, filterState.grain as string));
    }
  }, [
    filterState?.value,
    filterState?.grain,
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

  const handlePresetClick = (preset: TimePreset) => {
    clearPendingSelections();
    const isFiscalPreset = preset.key === 'this_fiscal_year';
    const fiscalYear = isFiscalPreset
      ? fiscalYearStartFromDate(getDataEndDate())
      : null;
    const grainKey = isFiscalPreset ? 'fiscal_year' : activeGrain;
    setActivePreset(preset.key);
    setActiveGrain(grainKey);
    setActiveFiscalYear(fiscalYear);
    setActiveFiscalYearEnd(null);
    applyFilter(getPresetTimeRange(preset.key), grainKey, preset.key, {
      activePreset: preset.key,
      activeGrain: grainKey,
      fiscalYear,
      fiscalYearEnd: null,
      ...(fiscalYear !== null
        ? { rangeLabel: `${fiscalYear}财年` }
        : {}),
    });
  };

  const applyFiscalYearRange = (rangeStart: number, rangeEnd: number) => {
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
    if (grain.key === 'fiscal_year') {
      const currentFiscalYear = fiscalYearStartFromDate(getDataEndDate());
      setFiscalYearOffset(0);
      applyFiscalYearRange(currentFiscalYear, currentFiscalYear);
      return;
    }

    const nextPreset = activePreset === 'this_fiscal_year' ? null : activePreset;
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
    if (val > getDataEndDate()) {
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
      if (m >= 4 && m <= 6) { q = 1; sy = y; }
      else if (m >= 7 && m <= 9) { q = 2; sy = y; }
      else if (m >= 10 && m <= 12) { q = 3; sy = y; }
      else { q = 4; sy = y - 1; }
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

    const [rangeStart, rangeEnd] = normalizePair(pendingDayStart, val, (a, b) => a.localeCompare(b));
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
    if (weekStart > getDataEndDate()) {
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
    const [rangeStart, rangeEnd] = normalizePair(pendingWeekStart, weekStart, (a, b) => a.localeCompare(b));
    setPendingWeekStart('');
    applyWeekRange(rangeStart, rangeEnd);
  };

  const applyMonthRange = (rangeStart: string, rangeEnd: string) => {
    setStartMonth(rangeStart);
    setEndMonth(rangeEnd);
    applyFilter(`${monthStartFromMonth(rangeStart)} : ${nextMonthStart(rangeEnd)}`, activeGrain, null, {
      activePreset: null,
      fiscalYear: null,
      fiscalYearEnd: null,
      startMonth: rangeStart,
      endMonth: rangeEnd,
    });
  };

  const handleMonthClick = (month: string) => {
    if (monthStartFromMonth(month) > getDataEndDate()) {
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
    const [rangeStart, rangeEnd] = normalizePair(pendingMonthStart, month, (a, b) => a.localeCompare(b));
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
    if (getFQRange(year, q).start > getDataEndDate()) {
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
    const [rangeStart, rangeEnd] = normalizePair(pendingQuarterStart, id, compareQuarter);
    setPendingQuarterStart('');
    applyQuarterRange(rangeStart, rangeEnd);
  };

  const applyYearRange = (rangeStart: number, rangeEnd: number) => {
    setStartYear(rangeStart);
    setEndYear(rangeEnd);
    applyFilter(`${fmtDate(rangeStart, 1, 1)} : ${fmtDate(rangeEnd + 1, 1, 1)}`, activeGrain, null, {
      activePreset: null,
      fiscalYear: null,
      fiscalYearEnd: null,
      startYear: rangeStart,
      endYear: rangeEnd,
    });
  };

  const handleYearClick = (year: number) => {
    if (fmtDate(year, 1, 1) > getDataEndDate()) {
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
    const [rangeStart, rangeEnd] = normalizePair(pendingYearStart, year, (a, b) => a - b);
    setPendingYearStart(null);
    applyYearRange(rangeStart, rangeEnd);
  };

  const currentLabel =
    activeFiscalYear !== null
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
  const currentGrain = TIME_GRAIN_OPTIONS.find(g => g.key === activeGrain)?.label || '日';
  const currentRange = activePreset ? getPresetTimeRange(activePreset) : lastRangeRef.current;

  const baseMonth = getMonthStart(getDataEndDate());
  const firstCalendarMonth = addMonths(baseMonth, calendarMonthOffset);
  const canGoBack = calendarMonthOffset > -60;
  const canGoForward = calendarMonthOffset < 0;

  const displayYearStart = currentYear + yearDecadeOffset * 12;
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = displayYearStart; y < displayYearStart + 12; y++) years.push(y);
    return years;
  }, [displayYearStart]);

  const displayYear = currentYear + monthYearOffset;
  const monthOptions = useMemo(() => {
    const months: string[] = [];
    for (let m = 1; m <= 12; m += 1) {
      months.push(`${displayYear}-${String(m).padStart(2, '0')}`);
    }
    return months;
  }, [displayYear]);

  const displayQuarterYear = currentYear + quarterYearOffset;
  const quarterOptions = useMemo(() => {
    const quarters: string[] = [];
    for (let q = 1; q <= 4; q += 1) {
      quarters.push(quarterId(displayQuarterYear, q));
    }
    return quarters;
  }, [displayQuarterYear]);

  const renderCalendarNavigation = () => (
    <div style={styles.nav}>
      <button type="button" onClick={() => canGoBack && setCalendarMonthOffset(o => o - 1)} disabled={!canGoBack} style={{ ...styles.btn, color: canGoBack ? styles.colors.primary : styles.colors.disabled }}>
        ← 上个月
      </button>
      <select
        aria-label="快速跳转月份"
        value={firstCalendarMonth}
        onChange={e => {
          const target = new Date(`${e.target.value}T00:00:00`);
          const base = new Date(`${baseMonth}T00:00:00`);
          const diffMonths = (target.getFullYear() - base.getFullYear()) * 12 + (target.getMonth() - base.getMonth());
          setCalendarMonthOffset(diffMonths);
        }}
        style={styles.selectInput}
      >
        {Array.from({ length: 61 }, (_, i) => {
          const m = addMonths(baseMonth, i - 60);
          return <option key={m} value={m}>{m.substring(0, 7)}</option>;
        })}
      </select>
      <button type="button" onClick={() => canGoForward && setCalendarMonthOffset(o => o + 1)} disabled={!canGoForward} style={{ ...styles.btn, color: canGoForward ? styles.colors.primary : styles.colors.disabled }}>
        下个月 →
      </button>
    </div>
  );

  const renderCalendarMonth = (monthStart: string) => (
    <div style={{ minWidth: 'unset' }}>
      <div style={{ textAlign: 'center', fontWeight: 600, marginBottom: 12, color: styles.colors.text }}>
        {formatMonthTitle(monthStart)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 26px)', gap: 5, color: styles.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
        {['一', '二', '三', '四', '五', '六', '日'].map(day => (
          <div key={day} style={{ textAlign: 'center' }}>{day}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 26px)', gap: 5 }}>
        {getMonthDays(monthStart).map(day => {
          const selected = isDateInRange(day.date, currentRange);
          const endpoint = isDateRangeEndpoint(day.date, currentRange);
          const capped = day.date > getDataEndDate();
          return (
            <button
              key={day.date}
              type="button"
              aria-label={day.date}
              disabled={capped}
              onClick={() => handleCalendarDayClick(day.date)}
              style={{
                width: 26,
                height: 26,
                border: 'none',
                borderRadius: endpoint ? 13 : selected ? 2 : 0,
                background: endpoint ? styles.colors.primary : selected ? styles.colors.primaryBg : 'transparent',
                color: endpoint ? styles.colors.selectedText : day.muted || capped ? styles.colors.disabled : selected ? styles.colors.primary : styles.colors.text,
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
      <div style={{ textAlign: 'center', fontWeight: 600, marginBottom: 12, color: styles.colors.text }}>
        {formatMonthTitle(monthStart)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 26px)', gap: 5, color: styles.colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} style={{ textAlign: 'center' }}>{day}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 26px)', gap: 5 }}>
        {getMonthDays(monthStart, true).map(day => {
          const weekStart = toSunday(day.date);
          const weekEndExclusive = addDays(weekStart, 7);
          const selected = Boolean(currentRange && weekStart < parseRange(currentRange).endExclusive && weekEndExclusive > parseRange(currentRange).start);
          const endpoint = parseRange(currentRange).start === weekStart || parseRange(currentRange).endExclusive === weekEndExclusive;
          const capped = day.date > getDataEndDate();
          return (
            <button
              key={day.date}
              type="button"
              aria-label={day.date}
              disabled={capped}
              onClick={() => handleWeekClick(weekStart)}
              title={`周 ${weekStart} ~ ${addDays(weekStart, 6)}`}
              style={{
                width: 26,
                height: 26,
                border: 'none',
                borderRadius: endpoint ? 13 : selected ? 2 : 0,
                background: endpoint ? styles.colors.primary : selected ? styles.colors.primaryBg : 'transparent',
                color: endpoint ? styles.colors.selectedText : day.muted || capped ? styles.colors.disabled : selected ? styles.colors.primary : styles.colors.text,
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
        单击选择一天；继续单击第二个日期选择范围。范围完成后再次单击会重新开始。
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {renderWeekCalendarMonth(firstCalendarMonth)}
      </div>
    </>
  );

  const renderMonthSelector = () => (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => setMonthYearOffset(o => o - 1)} style={{ fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent', color: styles.colors.primary }}>{'<'} {displayYear - 1}年</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: styles.colors.text }}>{displayYear}年</span>
        <button type="button" onClick={() => setMonthYearOffset(o => o + 1)} style={{ fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent', color: styles.colors.primary }}>{displayYear + 1}年 {'>'}</button>
      </div>
    <div data-test="custom-time-month-grid" style={styles.monthGrid}>
      {monthOptions.map(month => {
        const selected = isDateInRange(monthStartFromMonth(month), currentRange);
        const capped = monthStartFromMonth(month) > getDataEndDate();
        return (
          <button
            key={month}
            type="button"
            disabled={capped}
            onClick={() => handleMonthClick(month)}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => setQuarterYearOffset(o => o - 1)} style={{ fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent', color: styles.colors.primary }}>{'<'} {displayQuarterYear - 1}年</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: styles.colors.text }}>{displayQuarterYear}年</span>
        <button type="button" onClick={() => setQuarterYearOffset(o => o + 1)} style={{ fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent', color: styles.colors.primary }}>{displayQuarterYear + 1}年 {'>'}</button>
      </div>
    <div data-test="custom-time-quarter-grid" style={styles.quarterGrid}>
      {quarterOptions.map(id => {
        const { year, q } = parseQuarterId(id);
        const range = getFQRange(year, q);
        const selected = isDateInRange(range.start, currentRange);
        const capped = range.start > getDataEndDate();
        return (
          <button
            key={id}
            type="button"
            disabled={capped}
            onClick={() => handleQuarterClick(id)}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => setYearDecadeOffset(o => o - 1)} style={{ fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent', color: styles.colors.primary }}>{'<'} 前十年</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: styles.colors.text }}>{displayYearStart} - {displayYearStart + 11}</span>
        <button type="button" onClick={() => setYearDecadeOffset(o => o + 1)} style={{ fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent', color: styles.colors.primary }}>后十年 {'>'}</button>
      </div>
    <div data-test="custom-time-year-grid" style={styles.yearGrid}>
      {yearOptions.map(year => {
        const selected = isDateInRange(fmtDate(year, 1, 1), currentRange);
        const capped = fmtDate(year, 1, 1) > getDataEndDate();
        return (
          <button
            key={year}
            type="button"
            disabled={capped}
            onClick={() => handleYearClick(year)}
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
  const displayFiscalYearStart = fiscalYearStart + fiscalYearOffset * 12;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          type="button"
          aria-label="前十二年财年"
          onClick={() => setFiscalYearOffset(offset => offset - 1)}
          style={{ fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent', color: styles.colors.primary }}
        >
          {'<'} 前十二年
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: styles.colors.text }}>
          {displayFiscalYearStart} - {displayFiscalYearStart + 11} 财年
        </span>
        <button
          type="button"
          aria-label="后十二年财年"
          onClick={() => canGoForwardFiscalYear && setFiscalYearOffset(offset => offset + 1)}
          disabled={!canGoForwardFiscalYear}
          style={{ fontSize: 12, cursor: canGoForwardFiscalYear ? 'pointer' : 'not-allowed', border: 'none', background: 'transparent', color: canGoForwardFiscalYear ? styles.colors.primary : styles.colors.disabled }}
        >
          后十二年 {'>'}
        </button>
      </div>
      <div style={{ ...styles.hint }}>
        单击选择一个财年；继续单击第二个财年选择连续区间。范围完成后再次单击会重新开始。
      </div>
      <div data-test="custom-time-fiscal-year-grid" style={styles.yearGrid}>
        {fiscalYearOptions.map(year => {
          const capped = year > fiscalYearStart;
          const selected =
            activeFiscalYear !== null &&
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

  if (collapsed) {
    return (
      <div style={styles.container} data-test="custom-time-filter" data-theme-aware="true">
        <div style={styles.toolbar}>
          <span style={{ color: styles.colors.text, fontWeight: 500 }}>{currentLabel} | {currentGrain}</span>
          <button type="button" onClick={() => setCollapsed(false)} style={styles.btn}>展开 ▼</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} data-test="custom-time-filter" data-theme-aware="true">
      <div style={{ textAlign: 'right', padding: '4px 8px 0' }}>
        <button type="button" onClick={() => setCollapsed(true)} style={{ ...styles.btn, color: styles.colors.primary }}>▲ 收起</button>
      </div>
      <div style={styles.shell}>
        {enableTimeGrain && (
          <div style={styles.grainColumn}>
            <div style={styles.grainGrid}>
              {TIME_GRAIN_OPTIONS.filter(g => g.key !== 'fiscal_year' || enableCustomRange).map(g => (
                <button key={g.key} type="button" style={activeGrain === g.key ? styles.grainActive : styles.grainBtn} onClick={() => handleGrainClick(g)}>
                  {getGrainDisplayLabel(g.label)}
                </button>
              ))}
            </div>
          </div>
        )}
        {enablePresets && (
          <div style={styles.presetColumn}>
            <div style={styles.grid}>
              {DEFAULT_PRESETS.filter(p => p.key !== 'this_fiscal_year').map(p => (
                <button key={p.key} type="button" style={activePreset === p.key ? styles.btnActive : styles.btn} onClick={() => handlePresetClick(p)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={styles.panel}>
          {enableCustomRange && renderExpandedSelector()}
        </div>
      </div>
      <div style={styles.status}>
        {currentLabel} | {currentGrain}
        {timeColumn ? ' | 时间列：' + timeColumn : ' | 未绑定时间列'}
      </div>
    </div>
  );
}
