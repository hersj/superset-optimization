# Pivot Format and Big Number Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public chart properties for Pivot Table row/column value formatting and configurable Big Number Total comparisons.

**Architecture:** Keep both changes inside existing Superset frontend chart plugins. Big Number comparison settings are read by `buildQuery` and `transformProps`; Pivot Table format rules are normalized in `transformProps`, compiled into formatters, and applied in the table renderer using row/column key context.

**Tech Stack:** TypeScript, React, Jest, Superset chart control panel APIs, `@superset-ui/core` formatters.

---

## File Structure

- Modify `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/controlPanel.ts` to expose comparison controls.
- Modify `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.ts` to respect `comparison_enabled` and `comparison_modes`.
- Modify `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/transformProps.ts` to render only configured comparison labels and preserve ordinary subheader behavior.
- Modify `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.test.ts` and `transformProps.test.ts` for TDD coverage.
- Create `superset-frontend/plugins/plugin-chart-pivot-table/src/utils/numberFormatRules.ts` for Pivot Table rule normalization and formatting.
- Create `superset-frontend/plugins/plugin-chart-pivot-table/src/utils/numberFormatRules.test.ts` for rule precedence and matching coverage.
- Modify `superset-frontend/plugins/plugin-chart-pivot-table/src/types.ts`, `plugin/transformProps.ts`, `PivotTableChart.tsx`, and `react-pivottable/TableRenderers.tsx` to carry and apply rules.
- Create `superset-frontend/src/explore/components/controls/PivotNumberFormatRuleControl.tsx` and register it in `src/explore/components/controls/index.ts`.
- Modify `superset-frontend/plugins/plugin-chart-pivot-table/src/plugin/controlPanel.tsx` to add a `CollectionControl` named `pivot_number_format_rules`.

### Task 1: Big Number Query Properties

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.test.ts`
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.ts`
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/controlPanel.ts`

- [ ] **Step 1: Write failing query tests**

Add these tests to `buildQuery.test.ts`:

```ts
it('keeps a single query when comparison is disabled', () => {
  const queryContext = buildQuery({
    ...baseFormData,
    comparison_enabled: false,
    time_range: '2026-06-26 : 2026-07-01',
  });

  expect(queryContext.queries).toHaveLength(1);
  expect(queryContext.queries[0].time_range).toBe('2026-06-26 : 2026-07-01');
});

it('adds only selected comparison modes', () => {
  const queryContext = buildQuery({
    ...baseFormData,
    comparison_modes: ['year'],
    time_range: '2026-06-26 : 2026-07-01',
  });

  expect(queryContext.queries.map((query: any) => query.time_range)).toEqual([
    '2026-06-26 : 2026-07-01',
    '2025-06-26 : 2025-07-01',
  ]);
});
```

- [ ] **Step 2: Run the failing test**

Run: `cd /superset/superset/superset-frontend && npm test -- --runTestsByPath plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.test.ts`

Expected: the new tests fail because `buildQuery` still always adds both comparison queries for absolute ranges.

- [ ] **Step 3: Implement query controls and buildQuery logic**

Add controls to `controlPanel.ts` in Chart Options:

```ts
[
  {
    name: 'comparison_enabled',
    config: {
      type: 'CheckboxControl',
      label: t('Show comparison'),
      renderTrigger: true,
      default: true,
      description: t('Show period and year comparison for this chart'),
    },
  },
],
[
  {
    name: 'comparison_modes',
    config: {
      type: 'SelectControl',
      label: t('Comparison modes'),
      multi: true,
      renderTrigger: true,
      default: ['previous', 'year'],
      choices: [
        ['previous', t('Previous period')],
        ['year', t('Same period last year')],
      ],
      description: t('Comparison ranges saved with this chart'),
    },
  },
],
[
  {
    name: 'comparison_display',
    config: {
      type: 'SelectControl',
      label: t('Comparison display'),
      clearable: false,
      renderTrigger: true,
      default: 'percent',
      choices: [
        ['percent', t('Percent change')],
        ['delta_percent', t('Delta and percent change')],
      ],
    },
  },
],
```

Update `buildQuery.ts` so `comparison_enabled === false` returns `[baseQueryObject]`, and selected modes append only the requested previous/year query objects in deterministic order.

- [ ] **Step 4: Run Big Number query tests**

Run: `cd /superset/superset/superset-frontend && npm test -- --runTestsByPath plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/buildQuery.test.ts`

Expected: all tests in that file pass.

### Task 2: Big Number Display Properties

**Files:**
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/transformProps.test.ts`
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/transformProps.ts`

- [ ] **Step 1: Write failing display tests**

Add tests for selected modes, disabled mode, and subtitle preservation:

```ts
test('renders only configured year comparison', () => {
  const result = transformProps({
    ...baseChartProps,
    queriesData: [
      { data: [{ value: '100' }], coltypes: [0] },
      { data: [{ value: '50' }], coltypes: [0] },
    ],
    formData: { ...baseFormData, comparisonModes: ['year'] },
  } as unknown as BigNumberTotalChartProps);

  expect(result.subheader).toBe('同比 +100.0%');
});

test('preserves configured subheader when comparison is disabled', () => {
  const result = transformProps({
    ...baseChartProps,
    queriesData: [{ data: [{ value: '100' }], coltypes: [0] }],
    formData: {
      ...baseFormData,
      comparisonEnabled: false,
      subheader: 'Manual subheader',
    },
  } as unknown as BigNumberTotalChartProps);

  expect(result.subheader).toBe('Manual subheader');
});
```

- [ ] **Step 2: Run the failing display tests**

Run: `cd /superset/superset/superset-frontend && npm test -- --runTestsByPath plugins/plugin-chart-echarts/src/BigNumber/BigNumberTotal/transformProps.test.ts`

Expected: the new tests fail because transformProps assumes fixed query positions and replaces subheader with comparison text.

- [ ] **Step 3: Implement display logic**

Update `transformProps.ts` to:

- default `comparisonEnabled` to true unless explicitly false,
- default `comparisonModes` to `['previous', 'year']`,
- consume comparison query results in the same order as `buildQuery`,
- omit missing comparison labels independently,
- return `subheader: comparisonText || subheader || ''`.

- [ ] **Step 4: Run Big Number display tests**

