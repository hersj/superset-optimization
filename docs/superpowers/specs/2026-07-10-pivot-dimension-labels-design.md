# Pivot Table Dimension Labels

## Goal

Allow each Pivot Table chart to rename its row and column dimension headers without changing dataset metadata, SQL aliases, filtering, drilling, or other charts.

## Context

Pivot Table currently passes the datasource `verboseMap` to `TableRenderers` as `namesMapping`. Header rendering looks up each row or column field in that map and otherwise displays the query field name. Dataset 98 leaves `earliest_ship_date` and `lt` without `verbose_name`, so slice 642 displays raw field identifiers.

Updating a dataset column `verbose_name` is global. It would change every chart and native filter using that dataset, which is not appropriate for a chart-specific business label.

## Options Considered

1. Dataset `verbose_name`: no product code, but global side effects. Rejected.
2. Reuse metric `column_config` for all dimensions: compact storage but combines number-format controls and dimension labels in one mixed UI. Rejected.
3. Add a Pivot Table `dimension_label_config` chart property, edited through the existing per-field configuration control and merged only for rendering. Recommended.

## Design

The Explore Options section gains a chart property named `Customize dimension labels`. It reuses the existing per-field configuration control and shows only the dimensions currently selected in Rows and Columns. Each field has one optional `Display column name` input. An empty value falls back to the dataset `verbose_name`, then the original field name.

The property is saved in the chart form data as `dimension_label_config`, for example `{ "earliest_ship_date": { "customColumnName": "发货日期" } }`. `transformProps` converts the map into renderable field-to-label overrides. `PivotTableChart` merges them over the datasource `verboseMap` before passing `namesMapping` to the renderer.

The same map is used for both row and column header rendering. Therefore transpose preserves names, and a field used on either axis keeps a single consistent business label.

No query column, filter key, cross-filter payload, drill-to-detail filter, metric format, aggregation, or dataset metadata changes. The override is presentation-only.

## Error Handling

- Duplicate entries: last saved entry for a column wins.
- Blank label: ignored and standard fallback applies.
- A label for a field no longer selected: not rendered and removed by the control when the chart configuration is next saved.
- HTML in a label follows the existing `allow_render_html` behavior used by current header labels.

## Tests

TDD sequence:

1. Add a failing `transformProps` test proving valid overrides are exposed as a map and blank labels do not override dataset aliases.
2. Add a failing renderer test proving a row axis header uses a chart-level label over `namesMapping` and an unchanged header keeps the fallback.
3. Implement the smallest type, control, transform, and mapping changes to make those tests pass.
4. Run the affected Pivot Table test files, then the plugin build. Verify slice 642 retains its raw query field names while rendering business labels.

## Acceptance Criteria

- A user can rename `earliest_ship_date` to `发货日期` and `lt` to `LT` for slice 642 only.
- The labels display in row headers and keep working after transpose.
- Other charts using `public.profit_dws_daily_v2` remain unchanged.
- Header clicks, cross-filters, and drill-to-detail continue to use the raw field keys.
