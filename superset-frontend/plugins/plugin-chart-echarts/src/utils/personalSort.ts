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
  ChartDataResponseResult,
  DataRecord,
  DataRecordValue,
  getColumnLabel,
  normalizePersonalSort,
  PersonalChartSort,
  PersonalSortOrder,
  QueryFormData,
} from '@superset-ui/core';

export function getChartPersonalSort(formData: QueryFormData) {
  return normalizePersonalSort(formData.personal_sort ?? formData.personalSort, formData);
}

/** The server ranks current-period aggregates; renderers must not sum rates or histories again. */
export function getPersonalSortOrder(queries: ChartDataResponseResult[]): PersonalSortOrder | undefined {
  return queries.map(query => query.personal_sort_order).find(order => Array.isArray(order?.columns) && Array.isArray(order?.values));
}

export function orderedDimensionValues(order: PersonalSortOrder | undefined, column: string) {
  const index = order?.columns.indexOf(column) ?? -1;
  return index < 0 ? undefined : [...new Map(order!.values.map(values => [JSON.stringify(values[index]), values[index]])).values()];
}

export function orderRowsByDimension(data: DataRecord[], column: string, values?: DataRecordValue[]) {
  if (!values) return data;
  const positions = new Map(values.map((value, index) => [JSON.stringify(value), index]));
  return data.map((row, index) => ({ row, index })).sort((left, right) =>
    (positions.get(JSON.stringify(left.row[column])) ?? values.length) -
    (positions.get(JSON.stringify(right.row[column])) ?? values.length) || left.index - right.index,
  ).map(({ row }) => row);
}

export function chronologicalRows(data: DataRecord[], column: string) {
  const timestamp = (value: DataRecordValue) => {
    if (value == null) return Infinity;
    const number = typeof value === 'number' ? value : Date.parse(String(value));
    return Number.isFinite(number) ? number : Infinity;
  };
  return data.map((row, index) => ({ row, index })).sort((left, right) =>
    timestamp(left.row[column]) - timestamp(right.row[column]) || left.index - right.index,
  ).map(({ row }) => row);
}

export function getPersonalCategoryValues(
  queries: ChartDataResponseResult[],
  data: DataRecord[][],
  column: string,
  sort: PersonalChartSort,
  rawColumn = column,
) {
  const values = orderedDimensionValues(getPersonalSortOrder(queries), rawColumn);
  const source = sort.field.startsWith('B:') ? [...data].reverse() : data;
  return [...new Map([...(values ?? []), ...source.flatMap(rows => rows.map(row => row[column]))]
    .map(value => [JSON.stringify(value), value])).values()];
}

export function getPersonalSeriesOrder(
  queries: ChartDataResponseResult[],
  labelMap: Record<string, string[]>,
  groupby: QueryFormData['groupby'],
) {
  const order = getPersonalSortOrder(queries);
  const columns = (Array.isArray(groupby) ? groupby : groupby ? [groupby] : []).map(getColumnLabel);
  if (!order || !columns.length) return undefined;
  const indexes = columns.map(column => order.columns.indexOf(column));
  if (indexes.some(index => index < 0)) return undefined;
  const rank = new Map<string, number>();
  order.values.forEach((values, index) => {
    const key = JSON.stringify(indexes.map(i => String(values[i] ?? '')));
    if (!rank.has(key)) rank.set(key, index);
  });
  return (name: string) => {
    const values = labelMap[name];
    return values ? rank.get(JSON.stringify(values.slice(-columns.length).map(String))) : undefined;
  };
}
