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
  applyPersonalSortToQuery,
  ensureIsArray,
  getCustomPeriodComparison,
  normalizeOrderBy,
  PostProcessingPivot,
  QueryFormData,
  QueryObject,
  isXAxisSet,
  getXAxisColumn,
} from '@superset-ui/core';
import {
  pivotOperator,
  renameOperator,
  flattenOperator,
  isTimeComparison,
  timeComparePivotOperator,
  rollingWindowOperator,
  timeCompareOperator,
  resampleOperator,
} from '@superset-ui/chart-controls';
import {
  retainFormDataSuffix,
  removeFormDataSuffix,
} from '../utils/formDataSuffix';

export default function buildQuery(formData: QueryFormData) {
  const customPeriod = getCustomPeriodComparison(formData);
  const nativeTimeCompare = (formData.extra_form_data as any)?.time_compare;
  const baseFormData = {
    ...formData,
    time_compare: ensureIsArray(nativeTimeCompare ?? formData.time_compare),
    time_compare_b: ensureIsArray(
      nativeTimeCompare ?? (formData as any).time_compare_b,
    ),
  };

  const formData1 = removeFormDataSuffix(baseFormData, '_b');
  const formData2 = retainFormDataSuffix(baseFormData, '_b');

  const queryContexts = [formData1, formData2].map(fd =>
    buildQueryContext(fd, baseQueryObject => {
      const queryObject = {
        ...baseQueryObject,
        extras: { ...baseQueryObject.extras },
        columns: [
          ...(isXAxisSet(formData)
            ? ensureIsArray(getXAxisColumn(formData))
            : []),
          ...ensureIsArray(fd.groupby),
        ],
        series_columns: fd.groupby,
        ...(isXAxisSet(formData) ? {} : { is_timeseries: true }),
      };

      if (customPeriod) {
        delete queryObject.extras.time_compare;
        delete queryObject.extras.instant_time_comparison_range;
      }
      // Preserve the legacy relative-offset grain guard. Custom periods and
      // selected ranges align ordinal buckets at week, quarter and year grains.
      if (ensureIsArray(fd.time_compare).length > 0) {
        const activeGrain =
          (queryObject.extras && (queryObject.extras as any).time_grain_sqla) ||
          (fd.extra_form_data && fd.extra_form_data.time_grain_sqla) ||
          fd.time_grain_sqla;
        const comparisonAllowed =
          // 点选比较按选中周期关联，不使用旧的固定日期偏移对齐。
          ensureIsArray(fd.time_compare).every(
            offset =>
              offset === '上一选中区间' ||
              offset === customPeriod?.comparisonTimeRange,
          ) ||
          activeGrain === 'P1D' ||
          activeGrain === 'P1W' ||
          activeGrain === 'P1M';
        if (!comparisonAllowed) {
          fd.time_compare = [];
        }
      }

      const pivotOperatorInRuntime: PostProcessingPivot = isTimeComparison(
        fd,
        queryObject,
      )
        ? timeComparePivotOperator(fd, queryObject)
        : pivotOperator(fd, queryObject);

      const tmpQueryObject = {
        ...queryObject,
        time_offsets: isTimeComparison(fd, queryObject) ? fd.time_compare : [],
        post_processing: [
          pivotOperatorInRuntime,
          resampleOperator(fd, queryObject),
          rollingWindowOperator(fd, queryObject),
          timeCompareOperator(fd, queryObject),
          renameOperator(fd, queryObject),
          flattenOperator(fd, queryObject),
        ],
      } as QueryObject;
      return [normalizeOrderBy(tmpQueryObject)];
    }),
  );

  return {
    ...queryContexts[0],
    form_data: formData,
    queries: [...queryContexts[0].queries, ...queryContexts[1].queries].map(
      query => applyPersonalSortToQuery(query, formData),
    ),
  };
}
