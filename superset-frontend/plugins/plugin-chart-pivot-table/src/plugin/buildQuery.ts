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
  AdhocColumn,
  buildQueryContext,
  buildCustomPeriodComparisonQuery,
  getCustomPeriodComparison,
  ensureIsArray,
  getMetricLabel,
  isPhysicalColumn,
  QueryFormColumn,
  QueryFormMetric,
  QueryFormOrderBy,
} from '@superset-ui/core';
import { PivotTableQueryFormData } from '../types';
import {
  getPivotRatioConfiguration,
  type PivotRatioColumnConfig,
} from './pivotRatioMetrics';

export default function buildQuery(formData: PivotTableQueryFormData) {
  const period = getCustomPeriodComparison(formData);
  const { groupbyColumns = [], groupbyRows = [], extra_form_data } = formData;
  const isDownloadQuery =
    ['csv', 'xlsx'].includes(formData.result_format || '') ||
    (formData.result_format === 'json' &&
      ['results', 'post_processed'].includes(formData.result_type || ''));
  if (period && isDownloadQuery) {
    throw new Error('自定义期间对比暂不支持服务端导出；请切回原有对比后导出。');
  }
  const time_grain_sqla =
    extra_form_data?.time_grain_sqla || formData.time_grain_sqla;
  const { helperMetrics } = getPivotRatioConfiguration(
    formData.column_config as
      | Record<string, PivotRatioColumnConfig>
      | undefined,
    ensureIsArray<QueryFormMetric>(formData.metrics)
      .map(getMetricLabel)
      .filter((name): name is string => Boolean(name)),
  );

  // TODO: add deduping of AdhocColumns
  const columns = Array.from(
    new Set([
      ...ensureIsArray<QueryFormColumn>(groupbyColumns),
      ...ensureIsArray<QueryFormColumn>(groupbyRows),
    ]),
  ).map(col => {
    if (
      isPhysicalColumn(col) &&
      time_grain_sqla &&
      (formData?.temporal_columns_lookup?.[col] ||
        formData.granularity_sqla === col)
    ) {
      return {
        timeGrain: time_grain_sqla,
        columnType: 'BASE_AXIS',
        sqlExpression: col,
        label: col,
        expressionType: 'SQL',
      } as AdhocColumn;
    }
    return col;
  });

  const queryFormData = period
    ? { ...formData, time_compare: [], time_range: period.currentTimeRange }
    : formData;
  return buildQueryContext(queryFormData, baseQueryObject => {
    const { series_limit_metric, metrics, order_desc } = baseQueryObject;
    let orderBy: QueryFormOrderBy[] | undefined;
    if (series_limit_metric) {
      orderBy = [[series_limit_metric, !order_desc]];
    } else if (Array.isArray(metrics) && metrics[0]) {
      orderBy = [[metrics[0], !order_desc]];
    }
    const query = {
      ...baseQueryObject,
      // 率指标分子分母与可见指标共用一次查询，避免额外网络与数据库往返。
      metrics:
        !isDownloadQuery && helperMetrics.length
          ? [...ensureIsArray<QueryFormMetric>(metrics), ...helperMetrics]
          : metrics,
      orderby: orderBy,
      columns,
    };
    if (!period) return [query];
    const rowLimit = Number(query.row_limit);
    if (
      !Number.isSafeInteger(rowLimit) ||
      rowLimit <= 0 ||
      rowLimit >= Number.MAX_SAFE_INTEGER
    ) {
      throw new Error('自定义期间对比需要设置正整数行数限制。');
    }
    if (
      Number(query.row_offset ?? 0) !== 0 ||
      Number(query.series_limit ?? 0) !== 0
    ) {
      throw new Error('自定义期间对比不支持分页偏移或排名限制，请关闭后重试。');
    }
    const current = buildCustomPeriodComparisonQuery(
      { ...query, row_limit: rowLimit + 1 },
      {
        ...period,
        comparisonTimeRange: period.currentTimeRange,
      },
    );
    return [current, buildCustomPeriodComparisonQuery(current, period)];
  });
}
