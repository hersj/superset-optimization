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
  DataMaskStateWithId,
  SupersetClient,
} from '@superset-ui/core';

const SELLERFOX_CASCADE_COLUMNS_BASE = [
  'department_label',
  'country',
  'shop_name',
  'main_pf',
  'main_spu',
  'lt',
  'grade',
];

export const SELLERFOX_CASCADE_COLUMNS = [
  ...SELLERFOX_CASCADE_COLUMNS_BASE,
  'kk_sku',
];

export const SELLERFOX_CASCADE_COLUMNS_BY_CONTEXT: Record<string, string[]> = {
  '44:98': SELLERFOX_CASCADE_COLUMNS,
  '51:98': SELLERFOX_CASCADE_COLUMNS_BASE,
  '51:104': SELLERFOX_CASCADE_COLUMNS_BASE,
};

type SellerfoxCascadeOptionsResponse = Record<string, ChartDataResponseResult>;

type SellerfoxCascadeOptionsPayload = {
  dataset_id: number;
  columns: string[];
  applied_filters: Record<string, unknown[]>;
  time_range?: string;
};

const requestCache = new Map<string, Promise<SellerfoxCascadeOptionsResponse>>();

type NativeFilterConfig = {
  filterType?: string;
  targets?: {
    datasetId?: number;
    column?: {
      name?: string;
    };
  }[];
};

type NativeFiltersById = Record<string, NativeFilterConfig>;

export const clearSellerfoxCascadeFilterOptionsCache = () => {
  requestCache.clear();
};

export const getSellerfoxCascadeColumns = (
  dashboardId: number,
  datasetId: number | undefined,
) =>
  datasetId === undefined
    ? []
    : SELLERFOX_CASCADE_COLUMNS_BY_CONTEXT[`${dashboardId}:${datasetId}`] ?? [];

export const isSellerfoxCascadeFilter = (
  dashboardId: number,
  datasetId: number | undefined,
  filterType: string,
  groupby: string | undefined,
) => {
  const columns = getSellerfoxCascadeColumns(dashboardId, datasetId);

  return (
    filterType === 'filter_select' &&
    groupby !== undefined &&
    columns.includes(groupby)
  );
};

const getTargetColumn = (
  filterConfig: NativeFilterConfig,
  datasetId: number,
) => {
  const [target] = filterConfig.targets || [];

  if (target?.datasetId !== datasetId) {
    return undefined;
  }

  return target.column?.name;
};

export const getCascadeFilterColumns = (
  _dashboardId: number,
  datasetId: number | undefined,
  nativeFilters: NativeFiltersById = {},
) => {
  if (datasetId === undefined) {
    return [];
  }

  return Object.values(nativeFilters).reduce<string[]>(
    (columns, filterConfig) => {
      if (filterConfig.filterType !== 'filter_select') {
        return columns;
      }

      const column = getTargetColumn(filterConfig, datasetId);
      if (column && !columns.includes(column)) {
        columns.push(column);
      }

      return columns;
    },
    [],
  );
};

export const isCascadeFilter = (
  dashboardId: number,
  datasetId: number | undefined,
  filterType: string,
  groupby: string | undefined,
  nativeFilters: NativeFiltersById = {},
) => {
  const columns = getCascadeFilterColumns(dashboardId, datasetId, nativeFilters);

  return (
    filterType === 'filter_select' &&
    groupby !== undefined &&
    columns.includes(groupby)
  );
};

const toArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
};

const getPayload = (
  dashboardId: number,
  datasetId: number,
  nativeFilters: NativeFiltersById | undefined,
  dataMaskSelected?: DataMaskStateWithId,
): SellerfoxCascadeOptionsPayload => {
  const appliedFilters: Record<string, unknown[]> = {};
  let timeRange: string | undefined;
  const columns = nativeFilters
    ? getCascadeFilterColumns(dashboardId, datasetId, nativeFilters)
    : getSellerfoxCascadeColumns(dashboardId, datasetId);
  const columnSet = new Set(columns);

  Object.values(dataMaskSelected ?? {}).forEach(dataMask => {
    dataMask.extraFormData?.filters?.forEach(filter => {
      const column = filter.col;
      if (column && columnSet.has(column)) {
        const values = toArray(filter.val);
        if (values.length) {
          appliedFilters[column] = values;
        }
      }
    });
    if (dataMask.extraFormData?.time_range) {
      timeRange = dataMask.extraFormData.time_range;
    }
  });

  return {
    dataset_id: datasetId,
    columns,
    applied_filters: appliedFilters,
    ...(timeRange ? { time_range: timeRange } : {}),
  };
};

export const getSellerfoxCascadeFilterOptions = async (
  dashboardId: number,
  datasetId: number,
  dataMaskSelected?: DataMaskStateWithId,
) => {
  const payload = getPayload(dashboardId, datasetId, undefined, dataMaskSelected);
  const cacheKey = JSON.stringify({ dashboardId, ...payload });
  const cachedRequest = requestCache.get(cacheKey);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = SupersetClient.post({
    endpoint: `/api/v1/dashboard/${dashboardId}/cascade_filter_options`,
    jsonPayload: payload,
  }).then(({ json }) => json.result as SellerfoxCascadeOptionsResponse);

  requestCache.set(cacheKey, request);
  if (requestCache.size > 50) {
    requestCache.delete(requestCache.keys().next().value);
  }

  return request;
};

export const getCascadeFilterOptions = async (
  dashboardId: number,
  datasetId: number,
  nativeFilters: NativeFiltersById,
  dataMaskSelected?: DataMaskStateWithId,
) => {
  const payload = getPayload(
    dashboardId,
    datasetId,
    nativeFilters,
    dataMaskSelected,
  );
  const cacheKey = JSON.stringify({ dashboardId, ...payload });
  const cachedRequest = requestCache.get(cacheKey);

  if (cachedRequest) {
    return cachedRequest;
  }

  const request = SupersetClient.post({
    endpoint: `/api/v1/dashboard/${dashboardId}/cascade_filter_options`,
    jsonPayload: payload,
  }).then(({ json }) => json.result as SellerfoxCascadeOptionsResponse);

  requestCache.set(cacheKey, request);
  if (requestCache.size > 50) {
    requestCache.delete(requestCache.keys().next().value);
  }

  return request;
};
