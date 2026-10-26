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
  ChartProps,
  normalizePersonalSort,
  getColumnLabel,
  getCustomPeriodComparison,
  mergeCustomPeriodComparisonRows,
  formatCustomPeriodComparisonLabel,
  Currency,
  DataRecord,
  extractTimegrain,
  getMetricLabel,
  getTimeFormatter,
  getTimeFormatterForGranularity,
  QueryFormData,
  QueryFormMetric,
  SMART_DATE_ID,
  TimeFormatter,
  TimeFormats,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import { getColorFormatters } from '@superset-ui/chart-controls';
import { DateFormatter, PIVOT_CHINESE_WEEKDAY_DATE_FORMAT } from '../types';
import {
  PERIOD_KEY,
  validateCustomPeriodMetrics,
} from './customPeriodComparison';
import {
  buildMetricDescriptors,
  reconcileMetricLayout,
  type PivotMetricLayout,
} from '../metricLayout';
import { getDimensionLabelOverrides } from '../utils/dimensionLabelConfig';
import type { DimensionLabelConfig } from '../utils/dimensionLabelConfig';
import {
  getPivotRatioConfiguration,
  PIVOT_ABSOLUTE_RATIO_AGGREGATE_FUNCTION,
  PIVOT_RATIO_AGGREGATE_FUNCTION,
  type PivotRatioComponentLabels,
  type PivotRatioColumnConfig,
} from './pivotRatioMetrics';

const { DATABASE_DATETIME } = TimeFormats;
const NUMERIC_STRING_RE = /^-?\d+(\.\d+)?$/;

function isNumeric(key: string, data: DataRecord[] = []) {
  return data.every(
    record =>
      record[key] === null ||
      record[key] === undefined ||
      typeof record[key] === 'number',
  );
}

function normalizeTemporalValue(
  value: unknown,
): Date | number | string | null | undefined {
  if (value === null || value === undefined || value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return NUMERIC_STRING_RE.test(trimmed) ? Number(trimmed) : trimmed;
  }

  if (typeof value === 'object' && typeof value.valueOf === 'function') {
    const primitiveValue = value.valueOf();
    if (primitiveValue !== value) {
      return normalizeTemporalValue(primitiveValue);
    }
  }

  return String(value);
}

function createSafeDateFormatter(formatter: TimeFormatter): DateFormatter {
  return (value: unknown) => {
    const normalizedValue = normalizeTemporalValue(value);
    if (typeof normalizedValue === 'string') {
      return String(value);
    }

    const formattedValue = formatter(normalizedValue);

    return typeof formattedValue === 'string' && formattedValue.includes('NaN')
      ? String(value)
      : formattedValue;
  };
}

function createChineseWeekdayDateFormatter(
  formatter: TimeFormatter,
): DateFormatter {
  return (value: unknown) => {
    const normalizedValue = normalizeTemporalValue(value);
    const raw = String(value).trim();
    let dateText = raw;
    if (typeof normalizedValue === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (!match) return raw;
    } else {
      const formattedValue = formatter(normalizedValue);
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(formattedValue));
      if (!match) return raw;
      dateText = match[0];
    }

    const [, yearText, monthText, dayText] =
      /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText) || [];
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return raw;
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return raw;
    }
    return `${dateText}（${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getUTCDay()]}）`;
  };
}

type PivotColumnConfig = {
  d3NumberFormat?: string;
  currencyFormat?: Currency;
  pivotAggregateFunction?: string;
} & PivotRatioColumnConfig;

function mergeColumnConfigMetricFormats(
  savedColumnFormats: Record<string, unknown> = {},
  savedCurrencyFormats: Record<string, Currency> = {},
  columnConfig: Record<string, PivotColumnConfig> = {},
) {
  const mergedColumnFormats = { ...savedColumnFormats };
  const mergedCurrencyFormats = { ...savedCurrencyFormats };

  Object.entries(columnConfig).forEach(([metricName, config]) => {
    if (config?.d3NumberFormat) {
      mergedColumnFormats[metricName] = config.d3NumberFormat;
    }
    if (config?.currencyFormat?.symbol) {
      mergedCurrencyFormats[metricName] = config.currencyFormat;
    }
  });

  return {
    columnFormats: mergedColumnFormats,
    currencyFormats: mergedCurrencyFormats,
  };
}

function getMetricAggregateFunctions(
  columnConfig: Record<string, PivotColumnConfig> = {},
  metricRatioComponents: Record<string, PivotRatioComponentLabels> = {},
) {
  return Object.fromEntries(
    Object.entries(columnConfig)
      .filter(
        ([metricName, config]) =>
          Boolean(config?.pivotAggregateFunction) ||
          Boolean(metricRatioComponents[metricName]),
      )
      .map(([metricName, config]) => [
        metricName,
        metricRatioComponents[metricName]
          ? config.pivotRatioUseAbsoluteNumerator
            ? PIVOT_ABSOLUTE_RATIO_AGGREGATE_FUNCTION
            : PIVOT_RATIO_AGGREGATE_FUNCTION
          : (config.pivotAggregateFunction as string),
      ]),
  );
}

export default function transformProps(chartProps: ChartProps<QueryFormData>) {
  /**
   * 功能审计（可重写规格）：透视表中文星期日期显示
   * - 功能目的与触发方式：用户在透视表选择“YYYY-MM-DD（周几）”时，为日期维度附加中文星期。
   * - 输入契约：处理后端返回的 YYYY-MM-DD 日期字符串或毫秒时间戳；日期列由响应 Temporal 类型或数据集 is_dttm/isDttm 元数据识别；自定义筛选器 extra_form_data.time_grain_sqla 优先于运行时和保存的时间粒度；其他值保持原样。
   * - 输出契约：日粒度展示 YYYY-MM-DD（周X）；周、月、季、年展示现有对应粒度标签；原始日期键、查询和排序不变。
   * - 处理流程：查询结果转换时先识别日期列，再按运行时粒度建立展示 formatter，表格渲染阶段调用该 formatter。
   * - 业务规则：响应将日期降为 Numeric 时，以保留蛇形键的 datasource 元数据或驼峰元数据回退识别；粒度优先级必须与 buildQuery 一致；仅 P1D 追加中文星期，其他粒度复用 Superset 原有时间粒度 formatter。
   * - 状态与副作用：仅生成前端 props，不写入数据库、缓存或筛选状态。
   * - 外部依赖：依赖数据集标记的 Temporal 列和现有 date_format 控制项。
   * - 异常与边界：非日期、无效日期与非该格式选择均回退既有显示。
   * - 不变量与约束：显示文本不得参与透视键、排序、交叉筛选或钻取过滤。
   * - 验证方式：transformProps 测试覆盖日期字符串、P1D 毫秒时间戳、Numeric 响应的 is_dttm 回退及自定义筛选器 extra_form_data 切换 P3M_FISCAL；控制项测试覆盖格式可选。
   */
  /**
   * This function is called after a successful response has been
   * received from the chart data endpoint, and is used to transform
   * the incoming data prior to being sent to the Visualization.
   *
   * The transformProps function is also quite useful to return
   * additional/modified props to your data viz component. The formData
   * can also be accessed from your PivotTableChart.tsx file, but
   * doing supplying custom props here is often handy for integrating third
   * party libraries that rely on specific props.
   *
   * A description of properties in `chartProps`:
   * - `height`, `width`: the height/width of the DOM element in which
   *   the chart is located
   * - `formData`: the chart data request payload that was sent to the
   *   backend.
   * - `queriesData`: the chart data response payload that was received
   *   from the backend. Some notable properties of `queriesData`:
   *   - `data`: an array with data, each row with an object mapping
   *     the column/alias to its value. Example:
   *     `[{ col1: 'abc', metric1: 10 }, { col1: 'xyz', metric1: 20 }]`
   *   - `rowcount`: the number of rows in `data`
   *   - `query`: the query that was issued.
   *
   * Please note: the transformProps function gets cached when the
   * application loads. When making changes to the `transformProps`
   * function during development with hot reloading, changes won't
   * be seen until restarting the development server.
   */
  const {
    width,
    height,
    queriesData,
    formData,
    rawFormData,
    hooks: { setDataMask = () => {}, onContextMenu },
    filterState,
    datasource: {
      verboseMap = {},
      columnFormats = {},
      currencyFormats = {},
      currencyCodeColumn,
      columns = [],
    },
    emitCrossFilters,
    theme,
  } = chartProps;
  const {
    data: currentData,
    colnames,
    coltypes,
    detected_currency: detectedCurrency,
  } = queriesData[0];
  const {
    groupbyRows,
    groupbyColumns,
    metrics,
    tableRenderer,
    colOrder,
    rowOrder,
    aggregateFunction,
    transposePivot,
    combineMetric,
    rowSubtotalPosition,
    colSubtotalPosition,
    colTotals,
    colSubTotals,
    rowTotals,
    rowSubTotals,
    valueFormat,
    dateFormat,
    metricsLayout,
    conditionalFormatting,
    timeGrainSqla,
    currencyFormat,
    allowRenderHtml,
    pivotNumberFormatRules = [],
  } = formData;
  const { selectedFilters } = filterState;
  const period = getCustomPeriodComparison(rawFormData);
  const columnConfig =
    (formData as { columnConfig?: Record<string, PivotColumnConfig> })
      .columnConfig ||
    (rawFormData as { column_config?: Record<string, PivotColumnConfig> })
      .column_config ||
    {};
  const {
    columnFormats: mergedColumnFormats,
    currencyFormats: mergedCurrencyFormats,
  } = mergeColumnConfigMetricFormats(
    columnFormats,
    currencyFormats,
    columnConfig,
  );
  const { metricRatioComponents } = getPivotRatioConfiguration(
    columnConfig,
    metrics
      .map((metric: QueryFormMetric) => getMetricLabel(metric))
      .filter((name: string | undefined): name is string => Boolean(name)),
  );
  const metricAggregateFunctions = getMetricAggregateFunctions(
    columnConfig,
    metricRatioComponents,
  );
  const dimensionLabelConfig =
    (formData as { dimensionLabelConfig?: DimensionLabelConfig })
      .dimensionLabelConfig ||
    (rawFormData as { dimension_label_config?: DimensionLabelConfig })
      .dimension_label_config;
  const dimensionLabelOverrides =
    getDimensionLabelOverrides(dimensionLabelConfig);
  const extraTimeGrain = (
    rawFormData as {
      extra_form_data?: { time_grain_sqla?: string };
    }
  ).extra_form_data?.time_grain_sqla;
  const granularity =
    extraTimeGrain || timeGrainSqla || extractTimegrain(rawFormData);
  const dateColumns = new Set(
    (
      columns as Array<{
        columnName?: string;
        column_name?: string;
        isDttm?: boolean;
        is_dttm?: boolean;
      }>
    )
      .filter(column => column.isDttm || column.is_dttm)
      .map(column => column.columnName || column.column_name),
  );

  const temporalDimensions = [...groupbyRows, ...groupbyColumns]
    .map(getColumnLabel)
    .filter(
      name =>
        dateColumns.has(name) ||
        coltypes[colnames.indexOf(name)] === GenericDataType.Temporal ||
        name === rawFormData.granularity_sqla,
    );
  if (period) {
    if (
      [...groupbyRows, ...groupbyColumns]
        .map(getColumnLabel)
        .includes(PERIOD_KEY)
    ) {
      throw new Error(
        '自定义期间对比的维度名称与“期间对比”冲突，请重命名该维度。',
      );
    }
    validateCustomPeriodMetrics(
      metrics,
      columnConfig,
      chartProps.datasource.metrics || [],
      aggregateFunction,
    );
    if (!queriesData[1]?.data)
      throw new Error('自定义期间对比缺少对比查询结果，请重新应用筛选。');
    const rowLimit = Number(rawFormData.row_limit);
    if (
      !Number.isSafeInteger(rowLimit) ||
      rowLimit <= 0 ||
      rowLimit >= Number.MAX_SAFE_INTEGER
    ) {
      throw new Error('自定义期间对比需要设置正整数行数限制。');
    }
    if (
      currentData.length > rowLimit ||
      queriesData[1].data.length > rowLimit
    ) {
      throw new Error(
        '自定义期间对比结果超过行数限制，请提高行数限制后重试；不计算截断结果。',
      );
    }
  }
  const helperLabels = Object.values(metricRatioComponents).flatMap(
    ({ numeratorLabel, denominatorLabel }) => [
      numeratorLabel,
      denominatorLabel,
    ],
  );
  const data = period
    ? mergeCustomPeriodComparisonRows(
        currentData,
        queriesData[1].data,
        [...new Set([...groupbyRows, ...groupbyColumns].map(getColumnLabel))],
        [...new Set([...metrics.map(getMetricLabel), ...helperLabels])],
        period,
        granularity,
        temporalDimensions,
      )
    : currentData;

  const dateFormatters = colnames
    .filter(
      (colname: string, index: number) =>
        coltypes[index] === GenericDataType.Temporal ||
        dateColumns.has(colname),
    )
    .reduce(
      (
        acc: Record<string, DateFormatter | undefined>,
        temporalColname: string,
      ) => {
        if (period && temporalDimensions.includes(temporalColname)) {
          acc[temporalColname] = (value: unknown) => String(value);
          return acc;
        }
        if (dateFormat === PIVOT_CHINESE_WEEKDAY_DATE_FORMAT) {
          const formatter = granularity
            ? getTimeFormatterForGranularity(granularity)
            : isNumeric(temporalColname, data)
              ? getTimeFormatter(DATABASE_DATETIME)
              : getTimeFormatter(SMART_DATE_ID);
          acc[temporalColname] =
            granularity && granularity !== 'P1D'
              ? createSafeDateFormatter(formatter)
              : createChineseWeekdayDateFormatter(formatter);
          return acc;
        }

        let formatter: TimeFormatter | undefined;
        if (dateFormat === SMART_DATE_ID) {
          if (granularity) {
            formatter = getTimeFormatterForGranularity(granularity);
          } else if (isNumeric(temporalColname, data)) {
            formatter = getTimeFormatter(DATABASE_DATETIME);
          } else {
            formatter = getTimeFormatter(SMART_DATE_ID);
          }
        } else if (dateFormat) {
          formatter = getTimeFormatter(dateFormat);
        }
        if (formatter) {
          acc[temporalColname] = createSafeDateFormatter(formatter);
        }
        return acc;
      },
      {},
    );
  const metricColorFormatters = getColorFormatters(
    conditionalFormatting,
    data,
    theme,
    false,
  );
  const savedMetricLayout = (
    chartProps.ownState as
      | { pivot_table_metric_layout?: PivotMetricLayout }
      | undefined
  )?.pivot_table_metric_layout;
  const dashboardSharedLayout = Boolean(
    (
      chartProps.ownState as
        | { pivot_table_metric_layout_scope?: string }
        | undefined
    )?.pivot_table_metric_layout_scope === 'dashboard',
  );
  const reconciledMetricLayout = reconcileMetricLayout(
    buildMetricDescriptors(metrics),
    savedMetricLayout,
    { includeMissingMetricsVisible: dashboardSharedLayout },
  );

  // AUTO symbol passed through - PivotTableChart handles per-cell currency detection

  return {
    personalSortEnabled: Object.prototype.hasOwnProperty.call(
      rawFormData,
      'personal_sort',
    ),
    personalSort:
      normalizePersonalSort(rawFormData.personal_sort, rawFormData) ?? null,
    personalSortOrder: queriesData[0].personal_sort_order,
    ownState: chartProps.ownState,
    ...(period
      ? {
          customPeriodComparison: true,
          customPeriodComparisonLabel:
            formatCustomPeriodComparisonLabel(period),
          customPeriodTemporalDimensions: temporalDimensions,
        }
      : {}),
    frozenColumnCount: savedMetricLayout?.frozen_column_count || 0,
    frozenColumnKey: savedMetricLayout?.frozen_column_key,
    freezeMetricIds: Object.fromEntries(
      buildMetricDescriptors(metrics).map(metric => [metric.label, metric.id]),
    ),
    width,
    height,
    data,
    groupbyRows,
    groupbyColumns,
    metrics: reconciledMetricLayout.visibleMetrics.map(metric => metric.metric),
    tableRenderer,
    colOrder,
    rowOrder,
    aggregateFunction,
    transposePivot,
    combineMetric,
    rowSubtotalPosition,
    colSubtotalPosition,
    colTotals,
    colSubTotals,
    rowTotals,
    rowSubTotals,
    valueFormat,
    currencyFormat,
    currencyCodeColumn,
    detectedCurrency,
    emitCrossFilters,
    setDataMask,
    selectedFilters,
    verboseMap,
    columnFormats: mergedColumnFormats,
    currencyFormats: mergedCurrencyFormats,
    metricAggregateFunctions,
    metricRatioComponents,
    metricLayoutState: {
      ordered_metric_ids: reconciledMetricLayout.orderedMetricIds,
      hidden_metric_ids: reconciledMetricLayout.hiddenMetricIds,
    },
    metricsLayout,
    metricColorFormatters,
    dateFormatters,
    onContextMenu,
    timeGrainSqla,
    allowRenderHtml,
    pivotNumberFormatRules,
    dimensionLabelOverrides,
  };
}
