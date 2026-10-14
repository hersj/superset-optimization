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
  buildQueryContext,
  ensureIsArray,
  getCustomPeriodComparison,
  getXAxisColumn,
  isXAxisSet,
  normalizeOrderBy,
  PostProcessingPivot,
  QueryFormData,
} from '@superset-ui/core';
import {
  contributionOperator,
  extractExtraMetrics,
  flattenOperator,
  isTimeComparison,
  pivotOperator,
  prophetOperator,
  renameOperator,
  resampleOperator,
  rollingWindowOperator,
  sortOperator,
  timeComparePivotOperator,
  timeCompareOperator,
} from '@superset-ui/chart-controls';

/**
 * 功能审计（可重写规格）：时序图使用自定义时间筛选器的过去对比
 * - 功能目的与触发方式：看板自定义时间筛选器改变日、周、月粒度时构建时序查询。
 * - 输入契约：extra_form_data.time_compare 是本次筛选器覆盖值，图表 time_compare 是保存的兜底值。
 * - 输出契约：查询、后处理与 time_offsets 使用同一偏移数组。
 * - 处理流程：筛选器偏移优先，缺失时使用图表偏移，再复用既有查询构建。
 * - 业务规则：日、周、月分别采用 1 day ago、1 week ago、1 month ago。
 * - 状态与副作用：纯前端查询转换，不写图表、看板或存储。
 * - 外部依赖：原生筛选器 extra_form_data 与 Superset query builder。
 * - 异常与边界：缺失偏移返回空数组；空数组代表不比较。
 * - 不变量与约束：保存的 30 days ago 不得覆盖本次周或月筛选器偏移。
 * - 验证方式：Timeseries buildQuery 覆盖 30 days ago -> 1 week ago。
 */
export default function buildQuery(formData: QueryFormData) {
  const customPeriod = getCustomPeriodComparison(formData);
  const effectiveFormData = {
    ...formData,
    time_compare: ensureIsArray(
      (formData.extra_form_data as any)?.time_compare ?? formData.time_compare,
    ),
  };
  const { groupby } = effectiveFormData;
  return buildQueryContext(effectiveFormData, baseQueryObject => {
    const extras = { ...baseQueryObject.extras };
    if (customPeriod) {
      delete extras.time_compare;
      delete extras.instant_time_comparison_range;
    }
    /* the `pivotOperatorInRuntime` determines how to pivot the dataframe returned from the raw query.
       1. If it's a time compared query, there will return a pivoted dataframe that append time compared metrics. for instance:

                            MAX(value) MAX(value)__1 year ago MIN(value) MIN(value)__1 year ago
          city               LA                     LA         LA                     LA
          __timestamp
          2015-01-01      568.0                  671.0        5.0                    6.0
          2015-02-01      407.0                  649.0        4.0                    3.0
          2015-03-01      318.0                  465.0        0.0                    3.0

       2. If it's a normal query, there will return a pivoted dataframe.

                     MAX(value)  MIN(value)
          city               LA          LA
          __timestamp
          2015-01-01      568.0         5.0
          2015-02-01      407.0         4.0
          2015-03-01      318.0         0.0

     */
    // only add series limit metric if it's explicitly needed e.g. for sorting
    const extra_metrics = extractExtraMetrics(effectiveFormData);

    const pivotOperatorInRuntime: PostProcessingPivot = isTimeComparison(
      effectiveFormData,
      baseQueryObject,
    )
      ? timeComparePivotOperator(effectiveFormData, baseQueryObject)
      : pivotOperator(effectiveFormData, baseQueryObject);

    const columns = [
      ...(isXAxisSet(effectiveFormData)
        ? ensureIsArray(getXAxisColumn(effectiveFormData))
        : []),
      ...ensureIsArray(groupby),
    ];

    const time_offsets = isTimeComparison(effectiveFormData, baseQueryObject)
      ? effectiveFormData.time_compare
      : [];

    return [
      {
        ...baseQueryObject,
        extras,
        metrics: [...(baseQueryObject.metrics || []), ...extra_metrics],
        columns,
        series_columns: groupby,
        ...(isXAxisSet(effectiveFormData) ? {} : { is_timeseries: true }),
        // todo: move `normalizeOrderBy to extractQueryFields`
        orderby: normalizeOrderBy(baseQueryObject).orderby,
        time_offsets,
        /* Note that:
          1. The resample, rolling, cum, timeCompare operators should be after pivot.
          2. Resample must come before rolling so that imputed values are
             included in the rolling window calculation.
          3. the flatOperator makes multiIndex Dataframe into flat Dataframe
        */
        post_processing: [
          pivotOperatorInRuntime,
          resampleOperator(effectiveFormData, baseQueryObject),
          rollingWindowOperator(effectiveFormData, baseQueryObject),
          timeCompareOperator(effectiveFormData, baseQueryObject),
          renameOperator(effectiveFormData, baseQueryObject),
          contributionOperator(
            effectiveFormData,
            baseQueryObject,
            time_offsets,
          ),
          sortOperator(effectiveFormData, baseQueryObject),
          flattenOperator(effectiveFormData, baseQueryObject),
          // todo: move prophet before flatten
          prophetOperator(effectiveFormData, baseQueryObject),
        ],
      },
    ];
  });
}
