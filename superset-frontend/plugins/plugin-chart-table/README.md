<!--
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
-->

## @superset-ui/plugin-chart-table

[![Version](https://img.shields.io/npm/v/@superset-ui/plugin-chart-table.svg?style=flat)](https://www.npmjs.com/package/@superset-ui/plugin-chart-table)
[![Libraries.io](https://img.shields.io/librariesio/release/npm/%40superset-ui%2Fplugin-chart-table?style=flat)](https://libraries.io/npm/@superset-ui%2Fplugin-chart-table)

This plugin provides Table chart for Superset.

### Column display controls

Customize columns supports search, visibility, drag or keyboard ordering, and
numeric-format updates for selected columns. Display order is stored with the
existing per-column configuration; inactive/hidden-column settings are retained.
Comparison columns use the stable `Main <metric>` key, while legacy Chinese
`主项 <metric>` configurations remain readable (the stable key takes precedence).

Right-click a column header to freeze the visible columns through that position
or clear the freeze. In Explore, the `frozen_columns` render-only control can be
saved with the chart. In a dashboard the menu only changes the current table view:
it neither issues a query nor writes shared chart configuration. Frozen header,
body and totals offsets use measured column widths; comparison headers crossing
the boundary are split. Numerical data, sorting and exports remain unchanged.

### Usage

Configure `key`, which can be any `string`, and register the plugin. This `key` will be used to
lookup this chart throughout the app.

```js
import TableChartPlugin from '@superset-ui/plugin-chart-table';

new TableChartPlugin().configure({ key: 'table' }).register();
```

Then use it via `SuperChart`. See
[storybook](https://apache-superset.github.io/superset-ui-plugins/?selectedKind=plugin-chart-table)
for more details.

```js
<SuperChart
  chartType="table"
  width={600}
  height={600}
  formData={...}
  queriesData={[{
    data: {...},
  }]}
/>
```
