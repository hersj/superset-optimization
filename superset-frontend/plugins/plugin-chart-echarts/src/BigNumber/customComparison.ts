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
  buildCustomPeriodComparisonQuery,
  calculatePeriodDifference,
  CustomPeriodComparison,
  QueryObject,
  QueryFormData,
  getCustomPeriodComparison,
  getPeriodDayCount,
} from '@superset-ui/core';
import { parseMetricValue } from './utils';

export function getBigNumberCustomPeriod(
  formData: QueryFormData,
  rawFormData?: QueryFormData,
): CustomPeriodComparison | undefined {
  const source =
    rawFormData?.extra_form_data !== undefined ||
    rawFormData?.extraFormData !== undefined
      ? rawFormData
      : formData;
  return getCustomPeriodComparison({
    ...source,
    extra_form_data: source.extra_form_data ?? source.extraFormData,
  });
}

/** Query the metric expression once per whole period, including rate metrics. */
export function buildBigNumberPeriodQueries(
  query: QueryObject,
  period: CustomPeriodComparison,
): [QueryObject, QueryObject] {
  const aggregate = {
    ...query,
    columns: [],
    is_timeseries: false,
    post_processing: [],
    orderby: [],
  };
  return [
    buildCustomPeriodComparisonQuery(aggregate, {
      ...period,
      comparisonTimeRange: period.currentTimeRange,
    }),
    buildCustomPeriodComparisonQuery(aggregate, period),
  ];
}

export function getBigNumberPeriodLabel(
  period: CustomPeriodComparison,
): string {
  const currentDays = getPeriodDayCount(period.currentTimeRange);
  const comparisonDays = getPeriodDayCount(period.comparisonTimeRange);
  return currentDays === comparisonDays
    ? `两期均 ${currentDays} 天`
    : `当前 ${currentDays} 天 · 对比 ${comparisonDays} 天（期间长度不同）`;
}

export function parseBigNumberPeriodValue(value: unknown): number | null {
  return typeof value === 'number' || typeof value === 'string'
    ? parseMetricValue(value)
    : null;
}

export function formatBigNumberPeriodComparison(
  current: unknown,
  comparison: unknown,
  formatter: (value: number) => string,
): string {
  const { valueDifference, percentDifferenceNum } = calculatePeriodDifference(
    current,
    comparison,
  );
  const baseline =
    typeof comparison === 'number' && Number.isFinite(comparison)
      ? formatter(comparison)
      : '—';
  const delta =
    valueDifference === null
      ? '—'
      : `${valueDifference > 0 ? '+' : ''}${formatter(valueDifference)}`;
  const percent =
    percentDifferenceNum === null
      ? '—'
      : `${percentDifferenceNum > 0 ? '+' : ''}${(percentDifferenceNum * 100).toFixed(1)}%`;
  return `对比值 ${baseline}\n差额 ${delta} · 变化率 ${percent}`;
}
