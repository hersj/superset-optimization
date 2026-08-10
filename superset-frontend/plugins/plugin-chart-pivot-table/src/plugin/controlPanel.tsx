/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  ControlPanelConfig,
  D3_TIME_FORMAT_OPTIONS,
  Dataset,
  getStandardizedControls,
  sharedControls,
} from '@superset-ui/chart-controls';
import { t } from '@apache-superset/core/translation';
import { GenericDataType } from '@apache-superset/core/common';
import {
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  isAdhocColumn,
  isPhysicalColumn,
  QueryFormMetric,
  SMART_DATE_ID,
  validateNonEmpty,
  QueryFormColumn,
} from '@superset-ui/core';
import { MetricsLayoutEnum, PIVOT_CHINESE_WEEKDAY_DATE_FORMAT } from '../types';

const PIVOT_METRIC_AGGREGATE_OPTIONS = [
  { value: '', label: t('Use chart default') },
  { value: 'Count', label: t('Count') },
  { value: 'Count Unique Values', label: t('Count Unique Values') },
  { value: 'List Unique Values', label: t('List Unique Values') },
  { value: 'Sum', label: t('Sum') },
  { value: 'Average', label: t('Average') },
  { value: 'Median', label: t('Median') },
  { value: 'Sample Variance', label: t('Sample Variance') },
  { value: 'Sample Standard Deviation', label: t('Sample Standard Deviation') },
  { value: 'Minimum', label: t('Minimum') },
  { value: 'Maximum', label: t('Maximum') },
  { value: 'First', label: t('First') },
  { value: 'Last', label: t('Last') },
  { value: 'Sum as Fraction of Total', label: t('Sum as Fraction of Total') },
  { value: 'Sum as Fraction of Rows', label: t('Sum as Fraction of Rows') },
  {
    value: 'Sum as Fraction of Columns',
    label: t('Sum as Fraction of Columns'),
  },
  {
    value: 'Count as Fraction of Total',
    label: t('Count as Fraction of Total'),
  },
  { value: 'Count as Fraction of Rows', label: t('Count as Fraction of Rows') },
  {
    value: 'Count as Fraction of Columns',
    label: t('Count as Fraction of Columns'),
  },
];

const config: ControlPanelConfig = {
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'groupbyColumns',
            config: {
              ...sharedControls.groupby,
              label: t('Columns'),
              description: t('Columns to group by on the columns'),
            },
          },
        ],
        [
          {
            name: 'groupbyRows',
            config: {
              ...sharedControls.groupby,
              label: t('Rows'),
              description: t('Columns to group by on the rows'),
            },
          },
        ],
        [
          {
            name: 'time_grain_sqla',
            config: {
              ...sharedControls.time_grain_sqla,
              visibility: ({ controls }) => {
                const dttmLookup = Object.fromEntries(
                  ensureIsArray(controls?.groupbyColumns?.options).map(
                    option => [option.column_name, option.is_dttm],
                  ),
                );

                return [
                  ...ensureIsArray(controls?.groupbyColumns.value),
                  ...ensureIsArray(controls?.groupbyRows.value),
                ]
                  .map(selection => {
                    if (isAdhocColumn(selection)) {
                      return true;
                    }
                    if (isPhysicalColumn(selection)) {
                      return !!dttmLookup[selection];
                    }
                    return false;
                  })
                  .some(Boolean);
              },
            },
          },
          'temporal_columns_lookup',
        ],
        [
          {
            name: 'metrics',
            config: {
              ...sharedControls.metrics,
              validators: [validateNonEmpty],
              rerender: ['conditional_formatting'],
            },
          },
        ],
        [
          {
            name: 'metricsLayout',
            config: {
              type: 'RadioButtonControl',
              renderTrigger: true,
              label: t('Apply metrics on'),
              default: MetricsLayoutEnum.COLUMNS,
              options: [
                [MetricsLayoutEnum.COLUMNS, t('Columns')],
                [MetricsLayoutEnum.ROWS, t('Rows')],
              ],
              description: t(
                'Use metrics as a top level group for columns or for rows',
              ),
            },
          },
        ],
        ['adhoc_filters'],
        ['series_limit'],
        [
          {
            name: 'row_limit',
            config: {
              ...sharedControls.row_limit,
              label: t('Cell limit'),
              description: t('Limits the number of cells that get retrieved.'),
            },
          },
        ],
        // TODO(kgabryje): add series_columns control after control panel is redesigned to avoid clutter
        [
          {
            name: 'series_limit_metric',
            config: {
              ...sharedControls.series_limit_metric,
              description: t(
                'Metric used to define how the top series are sorted if a series or cell limit is present. ' +
                  'If undefined reverts to the first metric (where appropriate).',
              ),
            },
          },
        ],
        [
          {
            name: 'order_desc',
            config: {
              type: 'CheckboxControl',
              label: t('Sort Descending'),
              default: true,
              description: t('Whether to sort descending or ascending'),
            },
          },
        ],
      ],
    },
    {
      label: t('Options'),
      expanded: true,
      tabOverride: 'data',
      controlSetRows: [
        [
          {
            name: 'aggregateFunction',
            config: {
              type: 'SelectControl',
              label: t('Aggregation function'),
              clearable: false,
              choices: [
                ['Count', t('Count')],
                ['Count Unique Values', t('Count Unique Values')],
                ['List Unique Values', t('List Unique Values')],
                ['Sum', t('Sum')],
                ['Average', t('Average')],
                ['Median', t('Median')],
                ['Sample Variance', t('Sample Variance')],
                ['Sample Standard Deviation', t('Sample Standard Deviation')],
                ['Minimum', t('Minimum')],
                ['Maximum', t('Maximum')],
                ['First', t('First')],
                ['Last', t('Last')],
                ['Sum as Fraction of Total', t('Sum as Fraction of Total')],
                ['Sum as Fraction of Rows', t('Sum as Fraction of Rows')],
                ['Sum as Fraction of Columns', t('Sum as Fraction of Columns')],
                ['Count as Fraction of Total', t('Count as Fraction of Total')],
                ['Count as Fraction of Rows', t('Count as Fraction of Rows')],
                [
                  'Count as Fraction of Columns',
                  t('Count as Fraction of Columns'),
                ],
              ],
              default: 'Sum',
              description: t(
                'Aggregate function to apply when pivoting and computing the total rows and columns',
              ),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'rowTotals',
            config: {
              type: 'CheckboxControl',
              label: t('Show rows total'),
              default: false,
              renderTrigger: true,
              description: t('Display row level total'),
            },
          },
        ],
        [
          {
            name: 'rowSubTotals',
            config: {
              type: 'CheckboxControl',
              label: t('Show rows subtotal'),
              default: false,
              renderTrigger: true,
              description: t('Display row level subtotal'),
            },
          },
        ],
        [
          {
            name: 'colTotals',
            config: {
              type: 'CheckboxControl',
              label: t('Show columns total'),
              default: false,
              renderTrigger: true,
              description: t('Display column level total'),
            },
          },
        ],
        [
          {
            name: 'colSubTotals',
            config: {
              type: 'CheckboxControl',
              label: t('Show columns subtotal'),
              default: false,
              renderTrigger: true,
              description: t('Display column level subtotal'),
            },
          },
        ],
        [
          {
            name: 'transposePivot',
            config: {
              type: 'CheckboxControl',
              label: t('Transpose pivot'),
              default: false,
              description: t('Swap rows and columns'),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'combineMetric',
            config: {
              type: 'CheckboxControl',
              label: t('Combine metrics'),
              default: false,
              description: t(
                'Display metrics side by side within each column, as ' +
                  'opposed to each column being displayed side by side for each metric.',
              ),
              renderTrigger: true,
            },
          },
        ],
      ],
    },
    {
      label: t('Options'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'valueFormat',
            config: {
              ...sharedControls.y_axis_format,
              label: t('Value format'),
            },
          },
        ],
        ['currency_format'],
        [
          {
            name: 'date_format',
            config: {
              type: 'SelectControl',
              freeForm: true,
              label: t('Date format'),
              default: SMART_DATE_ID,
              renderTrigger: true,
              choices: [
                ...D3_TIME_FORMAT_OPTIONS,
                [PIVOT_CHINESE_WEEKDAY_DATE_FORMAT, 'YYYY-MM-DD（周几）'],
              ],
              description: t('D3 time format for datetime columns'),
            },
          },
        ],
        [
          {
            name: 'rowOrder',
            config: {
              type: 'SelectControl',
              label: t('Sort rows by'),
              default: 'key_a_to_z',
              choices: [
                // [value, label]
                ['key_a_to_z', t('key a-z')],
                ['key_z_to_a', t('key z-a')],
                ['value_a_to_z', t('value ascending')],
                ['value_z_to_a', t('value descending')],
              ],
              renderTrigger: true,
              description: (
                <>
                  <div>{t('Change order of rows.')}</div>
                  <div>{t('Available sorting modes:')}</div>
                  <ul>
                    <li>{t('By key: use row names as sorting key')}</li>
                    <li>{t('By value: use metric values as sorting key')}</li>
                  </ul>
                </>
              ),
            },
          },
        ],
        [
          {
            name: 'colOrder',
            config: {
              type: 'SelectControl',
              label: t('Sort columns by'),
              default: 'key_a_to_z',
              choices: [
                // [value, label]
                ['key_a_to_z', t('key a-z')],
                ['key_z_to_a', t('key z-a')],
                ['value_a_to_z', t('value ascending')],
                ['value_z_to_a', t('value descending')],
              ],
              renderTrigger: true,
              description: (
                <>
                  <div>{t('Change order of columns.')}</div>
                  <div>{t('Available sorting modes:')}</div>
                  <ul>
                    <li>{t('By key: use column names as sorting key')}</li>
                    <li>{t('By value: use metric values as sorting key')}</li>
                  </ul>
                </>
              ),
            },
          },
        ],
        [
          {
            name: 'rowSubtotalPosition',
            config: {
              type: 'SelectControl',
              label: t('Rows subtotal position'),
              default: false,
              choices: [
                // [value, label]
                [true, t('Top')],
                [false, t('Bottom')],
              ],
              renderTrigger: true,
              description: t('Position of row level subtotal'),
            },
          },
        ],
        [
          {
            name: 'colSubtotalPosition',
            config: {
              type: 'SelectControl',
              label: t('Columns subtotal position'),
              default: false,
              choices: [
                // [value, label]
                [true, t('Left')],
                [false, t('Right')],
              ],
              renderTrigger: true,
              description: t('Position of column level subtotal'),
            },
          },
        ],
        [
          {
            name: 'dimension_label_config',
            config: {
              type: 'ColumnConfigControl',
              label: t('Customize dimension labels'),
              description: t(
                'Set display names for the selected row and column dimensions',
              ),
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
                  ...((explore?.controls?.groupbyRows
                    ?.value as QueryFormColumn[]) ?? []),
                  ...((explore?.controls?.groupbyColumns
                    ?.value as QueryFormColumn[]) ?? []),
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
          },
        ],
        [
          {
            name: 'conditional_formatting',
            config: {
              type: 'ConditionalFormattingControl',
              renderTrigger: true,
              label: t('Conditional formatting'),
              description: t('Apply conditional color formatting to metrics'),
              shouldMapStateToProps() {
                return true;
              },
              mapStateToProps(explore, _, chart) {
                const metrics =
                  (explore?.controls?.metrics?.value as QueryFormMetric[]) ??
                  [];
                const columns =
                  (explore?.controls?.groupbyColumns
                    ?.value as QueryFormColumn[]) ?? [];
                const rows =
                  (explore?.controls?.groupbyRows
                    ?.value as QueryFormColumn[]) ?? [];
                const values = [...new Set([...metrics, ...columns, ...rows])];

                const verboseMap = explore?.datasource?.hasOwnProperty(
                  'verbose_map',
                )
                  ? (explore?.datasource as Dataset)?.verbose_map
                  : (explore?.datasource?.columns ?? {});
                const chartStatus = chart?.chartStatus;
                const { colnames, coltypes } =
                  chart?.queriesResponse?.[0] ?? {};
                const metricColumn = values.map(value => {
                  if (typeof value === 'string') {
                    return {
                      value,
                      label: Array.isArray(verboseMap)
                        ? value
                        : verboseMap[value],
                      dataType: colnames && coltypes[colnames?.indexOf(value)],
                    };
                  }
                  return {
                    value: value.label,
                    label: value.label,
                    dataType:
                      colnames && coltypes[colnames?.indexOf(value.label)],
                  };
                });
                return {
                  removeIrrelevantConditions: chartStatus === 'success',
                  columnOptions: metricColumn,
                  verboseMap,
                };
              },
            },
          },
        ],
        [
          {
            name: 'column_config',
            config: {
              type: 'ColumnConfigControl',
              label: t('Customize metrics'),
              description: t('Further customize how to display each metric'),
              width: 400,
              height: 260,
              renderTrigger: true,
              configFormLayout: {
                [GenericDataType.Numeric]: [
                  {
                    tab: t('Number formatting'),
                    children: [
                      [
                        {
                          name: 'pivotAggregateFunction',
                          config: {
                            controlType: 'Select',
                            label: t('Aggregation function'),
                            description: t(
                              'Override the chart-level aggregation for this metric. Use Average for ratio or percentage metrics that should not be summed in pivot totals.',
                            ),
                            options: PIVOT_METRIC_AGGREGATE_OPTIONS,
                            defaultValue: '',
                            minWidth: '14em',
                            debounceDelay: 200,
                          },
                        },
                      ],
                      [
                        {
                          name: 'pivotRatioNumerator',
                          config: {
                            controlType: 'Input',
                            label: t('Ratio numerator SQL'),
                            description: t(
                              'SQL aggregate expression used as the numerator when recalculating subtotals and totals.',
                            ),
                            defaultValue: '',
                            width: '100%',
                          },
                        },
                      ],
                      [
                        {
                          name: 'pivotRatioDenominator',
                          config: {
                            controlType: 'Input',
                            label: t('Ratio denominator SQL'),
                            description: t(
                              'SQL aggregate expression used as the denominator when recalculating interactive subtotals and totals. Both expressions are required. Downloaded pivots keep the existing server aggregation.',
                            ),
                            defaultValue: '',
                            width: '100%',
                          },
                        },
                      ],
                      [
                        {
                          name: 'pivotRatioUseAbsoluteNumerator',
                          config: {
                            controlType: 'Checkbox',
                            label: t('Use absolute numerator after summing'),
                            description: t(
                              'Use ABS(SUM(numerator)) for expense rates. Leave disabled for ROI and profit rates so losses remain negative.',
                            ),
                            defaultValue: false,
                          },
                        },
                      ],
                      ['d3NumberFormat'],
                      ['d3SmallNumberFormat'],
                      ['currencyFormat'],
                    ],
                  },
                ],
              },
              shouldMapStateToProps() {
                return true;
              },
              mapStateToProps(explore, _, chart) {
                const metrics =
                  (explore?.controls?.metrics?.value as QueryFormMetric[]) ??
                  [];
                const { colnames = [], coltypes = [] } =
                  chart?.queriesResponse?.[0] ?? {};
                const metricColnames = metrics
                  .map(metric => getMetricLabel(metric))
                  .filter((metric): metric is string => Boolean(metric));
                const metricColtypes = metricColnames.map(metric => {
                  const colIndex = colnames.indexOf(metric);
                  return colIndex >= 0
                    ? coltypes[colIndex]
                    : GenericDataType.Numeric;
                });

                return {
                  columnsPropsObject: {
                    colnames: metricColnames,
                    coltypes: metricColtypes,
                  },
                };
              },
            },
          },
        ],
        [
          {
            name: 'allow_render_html',
            config: {
              type: 'CheckboxControl',
              label: t('Render columns in HTML format'),
              renderTrigger: true,
              default: true,
              description: t(
                'Renders table cells as HTML when applicable. For example, HTML <a> tags will be rendered as hyperlinks.',
              ),
            },
          },
        ],
      ],
    },
  ],
  formDataOverrides: formData => {
    const groupbyColumns = getStandardizedControls().controls.columns.filter(
      col => !ensureIsArray(formData.groupbyRows).includes(col),
    );
    getStandardizedControls().controls.columns =
      getStandardizedControls().controls.columns.filter(
        col => !groupbyColumns.includes(col),
      );
    return {
      ...formData,
      metrics: getStandardizedControls().popAllMetrics(),
      groupbyColumns,
    };
  },
};

export default config;
