# Profit Date Filter And Big Number Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the custom profit date filter use the available profit-data calendar, and make Big Number Total charts show default period-over-period and year-over-year comparison when they have an absolute time range.

**Architecture:** `CustomTime` owns profit-date range generation and emits absolute `time_range` values capped at T-2. `big_number_total` keeps the existing chart type but expands its query to include current, previous-window, and prior-year windows, then renders comparison lines by default when comparison data is present. Existing charts without a valid time range continue to render the current single value.

**Tech Stack:** Superset frontend, TypeScript, Jest, React Testing Library, ECharts BigNumber plugin, Superset query context API.

---

### Task 1: CustomTime Profit Calendar Ranges

**Files:**
- Create: `superset-frontend/src/filters/components/CustomTime/profitDateRanges.ts`
- Modify: `superset-frontend/src/filters/components/CustomTime/types.ts`
- Modify: `superset-frontend/src/filters/components/CustomTime/CustomTimeFilterPlugin.tsx`
- Test: `superset-frontend/src/filters/components/CustomTime/profitDateRanges.test.ts`
- Test: `superset-frontend/src/filters/components/CustomTime/CustomTimeFilterPlugin.test.tsx`

- [ ] **Step 1: Write failing tests for T-2 range generation**

```ts
import {
  getProfitDataEndDate,
  getProfitPresetRange,
  getProfitComparisonRanges,
} from ./profitDateRanges;

describe(profitDateRanges, () => {
  const now = new Date(2026-07-02T10:00:00+08:00);

  it(caps the profit data calendar at T-2, () => {
    expect(getProfitDataEndDate(now)).toBe(2026-06-30);
  });

  it(uses the profit data month for 本月 instead of the real calendar month, () => {
    expect(getProfitPresetRange(this_month, now)).toEqual({
      timeRange: 2026-06-01 : 2026-07-01,
      label: 本月,
    });
  });

  it(uses the profit data year through the available data day for 本年, () => {
    expect(getProfitPresetRange(this_year, now)).toEqual({
      timeRange: 2026-01-01 : 2026-07-01,
      label: 本年,
    });
  });

  it(builds recent ranges ending on the available profit day inclusively, () => {
    expect(getProfitPresetRange(last_7d, now)).toEqual({
      timeRange: 2026-06-24 : 2026-07-01,
      label: 最近7天,
    });
  });

  it(computes previous-window and prior-year ranges for a selected 5 day range, () => {
    expect(getProfitComparisonRanges(2026-06-26 : 2026-07-01)).toEqual({
      previousRange: 2026-06-21 : 2026-06-26,
      yearRange: 2025-06-26 : 2025-07-01,
    });
  });
});
```

Run: `cd /superset/superset/superset-frontend && npm test -- --runInBand src/filters/components/CustomTime/profitDateRanges.test.ts`
Expected: FAIL because `profitDateRanges.ts` does not exist.

- [ ] **Step 2: Implement minimal date helpers**

Implement pure helpers that parse and format local dates as `YYYY-MM-DD`, use half-open Superset ranges (`start : endExclusive`), cap presets at T-2, and compute previous/yoy ranges with the same selected duration.

- [ ] **Step 3: Run helper tests to green**

Run: `cd /superset/superset/superset-frontend && npm test -- --runInBand src/filters/components/CustomTime/profitDateRanges.test.ts`
Expected: PASS.

- [ ] **Step 4: Write failing component tests for preset behavior**

Add tests asserting the rendered preset list does not include `今天` or `昨天`, clicking `本月` on `2026-07-02` emits `time_range: 2026-06-01 : 2026-07-01`, and `ownState` includes `comparison.previousRange` and `comparison.yearRange`.

Run: `cd /superset/superset/superset-frontend && npm test -- --runInBand src/filters/components/CustomTime/CustomTimeFilterPlugin.test.tsx`
Expected: FAIL on the current `本月` range and missing comparison metadata.

- [ ] **Step 5: Wire CustomTime to helpers**

Update `DEFAULT_PRESETS` to stable preset keys and labels, compute duration at click/render time through `getProfitPresetRange`, and persist comparison metadata in `ownState` while preserving `extraFormData.time_range`, `extraFormData.time_grain_sqla`, `filterState.value`, `filterState.grain`, and `filterState.label`.

- [ ] **Step 6: Run CustomTime tests to green**

Run: `cd /superset/superset/superset-frontend && npm test -- --runInBand src/filters/components/CustomTime/profitDateRanges.test.ts src/filters/components/CustomTime/CustomTimeFilterPlugin.test.tsx`
Expected: PASS.

### Task 2: Big Number Total Default Comparisons

**Files:**
- Create: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/comparisonRanges.ts`
- Test: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/comparisonRanges.test.ts`
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.ts`
- Test: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.test.ts`
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/transformProps.ts`
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/types.ts`
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberViz.tsx`
- Test: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/transformProps.test.ts`

- [ ] **Step 1: Write failing range tests**

