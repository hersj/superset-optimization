# Pivot Table Dimension Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Pivot Table chart assign display labels to its selected row and column dimensions without altering the dataset or query keys.

**Architecture:** Store labels in the chart-only `dimension_label_config` property. A small pure utility extracts non-empty `customColumnName` values, `transformProps` exposes them to the chart, and `PivotTableChart` overlays them on the datasource `verboseMap` immediately before rendering headers. The Explore control reuses the existing `ColumnConfigControl`, scoped to the selected row and column dimensions.

**Tech Stack:** TypeScript, React, Superset Explore controls, Jest, Pivot Table plugin.

---

## File Structure

- Create: `superset-frontend/plugins/plugin-chart-pivot-table/src/utils/dimensionLabelConfig.ts` - normalizes saved dimension-label configuration into safe display overrides.
- Create: `superset-frontend/plugins/plugin-chart-pivot-table/src/utils/dimensionLabelConfig.test.ts` - unit tests for valid labels, blanks, and invalid values.
- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/src/types.ts` - adds chart props for resolved label overrides.
- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/src/plugin/controlPanel.tsx` - exposes the chart-level per-dimension label control.
- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/src/plugin/transformProps.ts` - reads and resolves `dimension_label_config`.
- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/src/PivotTableChart.tsx` - merges chart overrides over `verboseMap` only for header rendering.
- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/test/plugin/transformProps.test.ts` - proves resolved overrides are passed from form data to chart props.

### Task 1: Normalize chart-level label configuration

**Files:**

- Create: `superset-frontend/plugins/plugin-chart-pivot-table/src/utils/dimensionLabelConfig.ts`
- Create: `superset-frontend/plugins/plugin-chart-pivot-table/src/utils/dimensionLabelConfig.test.ts`

- [ ] **Step 1: Write the failing utility test**

```ts
import { getDimensionLabelOverrides } from './dimensionLabelConfig';

test('keeps only non-empty custom dimension labels', () => {
  expect(
    getDimensionLabelOverrides({
      earliest_ship_date: { customColumnName: '发货日期' },
      lt: { customColumnName: ' LT ' },
      country: { customColumnName: '' },
      shop_name: {},
      invalid: '平台',
    }),
  ).toEqual({
    earliest_ship_date: '发货日期',
    lt: 'LT',
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

```bash
docker exec superset-superset-1 bash -lc 'cd /app/superset-frontend && npm test -- --runTestsByPath plugins/plugin-chart-pivot-table/src/utils/dimensionLabelConfig.test.ts'
```

Expected: FAIL because `dimensionLabelConfig.ts` does not exist.

- [ ] **Step 3: Add the minimal normalizer**

```ts
export type DimensionLabelConfig = Record<
  string,
  { customColumnName?: unknown } | undefined
>;

export function getDimensionLabelOverrides(
  config: DimensionLabelConfig | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(config ?? []).flatMap(([column, value]) => {
      const label =
        value && typeof value.customColumnName === 'string'
          ? value.customColumnName.trim()
          : '';
      return label ? [[column, label]] : [];
    }),
  );
}
```

- [ ] **Step 4: Run the utility test to verify GREEN**

Run the command from Step 2. Expected: PASS, 1 test.

### Task 2: Thread resolved overrides into chart rendering

**Files:**

- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/src/types.ts`
- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/src/plugin/transformProps.ts`
- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/src/PivotTableChart.tsx`
- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/test/plugin/transformProps.test.ts`

- [ ] **Step 1: Write the failing transform test**

```ts
test('passes chart-level dimension label overrides to the Pivot Table', () => {
  const result = transformProps(
    new ChartProps<QueryFormData>({
      ...chartProps,
      formData: {
        ...formData,
        dimensionLabelConfig: {
          earliest_ship_date: { customColumnName: '发货日期' },
          lt: { customColumnName: '' },
        },
      },
      datasource: {
        verboseMap: { earliest_ship_date: '原始日期', lt: '生命周期' },
        columnFormats: {},
      },
    }),
  );

  expect(result.dimensionLabelOverrides).toEqual({
    earliest_ship_date: '发货日期',
  });
});
```

- [ ] **Step 2: Run the transform test to verify RED**

```bash
docker exec superset-superset-1 bash -lc 'cd /app/superset-frontend && npm test -- --runTestsByPath plugins/plugin-chart-pivot-table/test/plugin/transformProps.test.ts'
```

Expected: FAIL because `dimensionLabelOverrides` is absent.

- [ ] **Step 3: Add the minimum prop plumbing**

In `types.ts`, add this field to `PivotTableCustomizeProps`:

```ts
dimensionLabelOverrides: Record<string, string>;
```

In `transformProps.ts`, import `DimensionLabelConfig` and `getDimensionLabelOverrides`, read both names produced by Superset form-data normalization, then return the resolved map:

```ts
const dimensionLabelConfig =
  (formData as { dimensionLabelConfig?: DimensionLabelConfig })
    .dimensionLabelConfig ||
  (rawFormData as { dimension_label_config?: DimensionLabelConfig })
    .dimension_label_config;

const dimensionLabelOverrides =
  getDimensionLabelOverrides(dimensionLabelConfig);

return {
  // existing props
  dimensionLabelOverrides,
};
```

In `PivotTableChart.tsx`, destructure the new prop and derive a render-only map:

```ts
const namesMapping = useMemo(
  () => ({ ...verboseMap, ...dimensionLabelOverrides }),
  [dimensionLabelOverrides, verboseMap],
);

// Keep raw rows and cols unchanged; replace only the rendering prop.
<PivotTable namesMapping={namesMapping} />
```

- [ ] **Step 4: Run the transform test to verify GREEN**

Run the command from Step 2. Expected: PASS, including the new override assertion.

### Task 3: Expose selected dimensions in Explore

**Files:**

- Modify: `superset-frontend/plugins/plugin-chart-pivot-table/src/plugin/controlPanel.tsx`

- [ ] **Step 1: Add a chart-level control beside existing Pivot options**

Import `getColumnLabel` from `@superset-ui/core` and add this control to the existing Options section:

```ts
{
  name: 'dimension_label_config',
  config: {
    type: 'ColumnConfigControl',
    label: t('Customize dimension labels'),
    description: t('Set display names for the selected row and column dimensions'),
    width: 400,
    height: 260,
    renderTrigger: true,
    configFormLayout: {
      [GenericDataType.String]: [['customColumnName']],
    },
    shouldMapStateToProps() {
      return true;
    },
    mapStateToProps(explore) {
      const dimensions = [
        ...ensureIsArray(explore?.controls?.groupbyRows?.value),
        ...ensureIsArray(explore?.controls?.groupbyColumns?.value),
      ].map(getColumnLabel);
      const colnames = [...new Set(dimensions)];
      return {
        columnsPropsObject: {
          colnames,
          coltypes: colnames.map(() => GenericDataType.String),
        },
      };
    },
  },
}
```

- [ ] **Step 2: Run the focused Pivot Table tests**

```bash
docker exec superset-superset-1 bash -lc 'cd /app/superset-frontend && npm test -- --runTestsByPath plugins/plugin-chart-pivot-table/src/utils/dimensionLabelConfig.test.ts plugins/plugin-chart-pivot-table/test/plugin/transformProps.test.ts plugins/plugin-chart-pivot-table/test/react-pivottable/tableRenders.test.tsx'
```

Expected: PASS with no TypeScript or Jest regressions.

- [ ] **Step 3: Build the frontend**

```bash
docker exec superset-superset-1 bash -lc 'cd /app/superset-frontend && npm run build'
```

Expected: exit code 0; existing webpack asset-size warnings are acceptable.

### Task 4: Deploy and verify slice 642

**Files:**

- No additional source files.

- [ ] **Step 1: Restart the Superset web service**

```bash
cd /superset/superset
docker compose restart superset
```

- [ ] **Step 2: Verify service health**

```bash
docker inspect -f '{{.State.Health.Status}}' superset-superset-1
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8088/superset/welcome/
```

Expected: `healthy` and HTTP `302` for the unauthenticated welcome route.

- [ ] **Step 3: Verify the chart contract in Explore**

Open slice 642 (`销售数据板块`). Under Options, enter `发货日期` for `earliest_ship_date` and `LT` for `lt`, run the chart, save it, then transpose and run again.

Expected: headers show `发货日期` and `LT` in both layouts; the chart query still groups on `earliest_ship_date` and `lt`; other charts on dataset 98 remain unchanged.
