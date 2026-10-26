/*
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
import getColumnLabel from './getColumnLabel';
import getMetricLabel from './getMetricLabel';
import {
  QueryFormColumn,
  QueryFormData,
  QueryFormMetric,
} from './types/QueryFormData';

export interface PersonalChartSort {
  mode: 'metric' | 'name' | 'custom';
  field: string;
  direction: 'asc' | 'desc';
  customOrder?: string[];
  columnValues?: string[];
}

export interface PersonalSortOption {
  value: string;
  label: string;
  kind: 'metric' | 'name';
  query?: 'A' | 'B';
  metric?: QueryFormMetric;
  column?: QueryFormColumn;
}

const asArray = <T>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

export const getPersonalSortMetricId = (metric: QueryFormMetric): string =>
  typeof metric === 'string'
    ? metric
    : metric.optionName || getMetricLabel(metric);

/** Real fields only; generated comparison labels and display short names are never keys. */
export function getPersonalSortOptions(
  formData: QueryFormData,
): PersonalSortOption[] {
  if (['big_number', 'big_number_total'].includes(formData.viz_type)) return [];
  const mixed = formData.viz_type === 'mixed_timeseries';
  const options: PersonalSortOption[] = [];
  const addMetrics = (values: QueryFormMetric[], query?: 'A' | 'B') => {
    values.filter(Boolean).forEach(metric => {
      const id = getPersonalSortMetricId(metric);
      if (id)
        options.push({
          value: query ? `${query}:${id}` : id,
          label: getMetricLabel(metric),
          kind: 'metric',
          query,
          metric,
        });
    });
  };
  addMetrics(
    [
      ...asArray<QueryFormMetric>(formData.metrics),
      ...asArray<QueryFormMetric>(formData.metric),
      ...asArray<QueryFormMetric>(formData.metric_2),
      ...(formData.viz_type === 'bubble_v2'
        ? [
            ...asArray<QueryFormMetric>(formData.x),
            ...asArray<QueryFormMetric>(formData.y),
            ...asArray<QueryFormMetric>(formData.size),
          ]
        : []),
    ],
    mixed ? 'A' : undefined,
  );
  if (mixed) addMetrics(asArray<QueryFormMetric>(formData.metrics_b), 'B');
  const rawColumns =
    formData.viz_type === 'pivot_table_v2'
      ? asArray<QueryFormColumn>(
          formData.transpose_pivot
            ? formData.groupbyColumns
            : formData.groupbyRows,
        )
      : [
          ...asArray<QueryFormColumn>(formData.x_axis),
          ...asArray<QueryFormColumn>(formData.y_axis_dimension),
          ...asArray<QueryFormColumn>(formData.groupby),
          ...asArray<QueryFormColumn>(formData.columns),
          ...asArray<QueryFormColumn>(formData.all_columns),
          ...asArray<QueryFormColumn>(formData.entity),
          ...asArray<QueryFormColumn>(formData.series),
        ];
  rawColumns.filter(Boolean).forEach(column => {
    const label = getColumnLabel(column);
    if (
      label &&
      label !== '__timestamp' &&
      !(
        ((formData.viz_type || '').startsWith('echarts_timeseries') || mixed) &&
        label === getColumnLabel(formData.x_axis || '') &&
        (label === formData.granularity_sqla ||
          (formData.temporal_columns_lookup || {})[label])
      )
    ) {
      options.push({ value: label, label, kind: 'name', column });
    }
  });
  if (
    ((formData.viz_type || '').startsWith('echarts_timeseries') || mixed) &&
    !options.some(option => option.kind === 'name')
  )
    return [];
  return options.filter(
    (entry, index) =>
      options.findIndex(
        other => other.value === entry.value && other.kind === entry.kind,
      ) === index,
  );
}

/** Invalid or obsolete saved fields fall back to the author's unchanged default. */
export function normalizePersonalSort(
  value: unknown,
  formData: QueryFormData,
): PersonalChartSort | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Partial<PersonalChartSort>;
  if (
    !['metric', 'name', 'custom'].includes(input.mode || '') ||
    !['asc', 'desc'].includes(input.direction || '') ||
    typeof input.field !== 'string'
  )
    return undefined;
  const option = getPersonalSortOptions(formData).find(
    entry =>
      entry.value === input.field &&
      entry.kind === (input.mode === 'metric' ? 'metric' : 'name'),
  );
  if (!option) return undefined;
  const result: PersonalChartSort = {
    mode: input.mode!,
    field: input.field,
    direction: input.direction!,
  };
  if (input.mode === 'custom') {
    if (
      !Array.isArray(input.customOrder) ||
      input.customOrder.length > 1000 ||
      input.customOrder.some(
        item => typeof item !== 'string' || item.length > 4096,
      )
    )
      return undefined;
    result.customOrder = [...new Set(input.customOrder)];
    if (JSON.stringify(result.customOrder).length > 65536) return undefined;
  }
  if (input.columnValues !== undefined) {
    if (
      input.mode !== 'metric' ||
      formData.viz_type !== 'pivot_table_v2' ||
      !Array.isArray(input.columnValues) ||
      input.columnValues.length !==
        asArray(
          formData.transpose_pivot
            ? formData.groupbyRows
            : formData.groupbyColumns,
        ).length ||
      input.columnValues.some(
        item => typeof item !== 'string' || item.length > 4096,
      )
    )
      return undefined;
    result.columnValues = [...input.columnValues];
  }
  return result;
}

/** Keep the viewer override after plugin-specific query construction. */
export function applyPersonalSortToQuery(
  query: import('./types/Query').QueryObject,
  formData: QueryFormData,
): import('./types/Query').QueryObject {
  const sort = normalizePersonalSort(formData.personal_sort, formData);
  if (!sort) return query;
  return {
    ...query,
    personal_sort: sort,
    post_processing: query.post_processing
      ?.filter(operation => operation?.operation !== 'sort')
      .map(operation =>
        operation?.operation === 'pivot'
          ? {
              ...operation,
              options: { ...operation.options, preserve_row_order: true },
            }
          : operation,
      ),
  };
}
