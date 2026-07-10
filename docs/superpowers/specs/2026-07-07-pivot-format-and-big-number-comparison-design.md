# Pivot Table number format rules and Big Number comparison properties

## Scope

This change adds two public chart-level capabilities:

1. Pivot Table charts can define number-format rules for values matched by row or column attributes.
2. Big Number Total charts can configure default period-over-period comparison behavior instead of relying on hard-coded comparison queries.

Both capabilities are saved in chart form data, so the behavior is shared by everyone who opens the chart or dashboard. They are not user preferences, browser storage, or dashboard filter state.

## Goals

- Preserve existing chart behavior when the new properties are not set.
- Make Pivot Table value formatting resolve in a predictable order: column rule, row rule, metric format, default format.
- Make Big Number comparison public and configurable per chart, with comparison enabled by default for new and existing Big Number Total charts unless a chart explicitly disables it.
- Keep implementation local to the affected chart plugins.
- Use TDD with targeted Jest coverage before implementation.

## Non-goals

- Do not add row-versus-column comparison calculations to Pivot Table in this iteration.
- Do not add per-user formatting preferences.
- Do not change dataset metric definitions, SQL formulas, or dashboard filter behavior.
- Do not rebuild the generic Superset formatting control framework unless the existing controls cannot support the required chart properties.

## Pivot Table design

### Public form-data property

Add `pivot_number_format_rules` to Pivot Table form data.

Each rule contains:

- `axis`: `row` or `column`.
- `field`: the row or column field label used by the pivot renderer after Superset normalizes the selected groupby.
- `value`: the attribute value to match. Matching checks the raw pivot key first and then the formatted display value, so temporal values can be configured using labels such as `2026年Q2`.
- `format`: D3 number format string, for example `,.0f`, `,.2f`, `.2%`, `$,.2f`.

### Formatting precedence

For each numeric value cell:

1. If any column rule matches the cell's column key path, use that rule's format.
2. Otherwise, if any row rule matches the cell's row key path, use that rule's format.
3. Otherwise, use the existing metric-specific formatter.
4. Otherwise, use the existing default number formatter.

Column rules are preferred because pivot columns commonly represent time, metric, or version slices and users usually expect a column-wide display rule to dominate.

### Matching behavior

- Rules only format numeric value cells in the body of the pivot table.
- Row and column header labels keep their existing date and label formatting behavior.
- Subtotal and total cells use the best available context. If they have enough row or column key context to match a rule, they use the rule; otherwise they fall back to metric/default formatting.
- Invalid or empty format strings are ignored and fall back to the next formatter.

### UI

Add a Pivot Table control in the chart Options section with repeatable rules. The control should be clear that rules are chart properties and are visible to all users after saving the chart.

## Big Number Total design

### Public form-data properties

Add Big Number Total chart properties:

- `comparison_enabled`: boolean, default `true`.
- `comparison_modes`: list of `previous` and `year`, default `['previous', 'year']`.
- `comparison_display`: `percent` or `delta_percent`, default `percent`.

### Query behavior

- If `comparison_enabled` is false or `comparison_modes` is empty, only the current query is sent.
- If `previous` is enabled, add the previous same-length range query.
- If `year` is enabled, add the prior-year same-range query.
- Query order remains deterministic: current, previous if enabled, year if enabled.
- Relative or malformed time ranges do not add comparison queries.

### Display behavior

- `percent` renders labels such as `环比 +25.0% | 同比 +100.0%`.
- `delta_percent` renders each enabled comparison as value delta plus percentage, using the chart's existing number formatter for the delta.
- If a comparison query is missing or has no numeric result, omit that comparison label rather than hiding all other enabled labels.
- If no comparison label can be produced, preserve the existing subtitle/subheader behavior instead of forcing an empty comparison string.

## Data flow

Pivot Table:

1. Explore saves `pivot_number_format_rules` in chart form data.
2. `transformProps` normalizes the rule list and prepares reusable formatters.
3. `PivotTableChart` passes the rules and formatters into the table renderer.
4. `TableRenderers` chooses the formatter at render time using row and column key context.

Big Number Total:

1. Explore saves comparison properties in chart form data.
