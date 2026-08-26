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
  id?: string;
  filterType?: string;
  targets?: {
    datasetId?: number;
    column?: {
      name?: string;
    };
  }[];
  chartsInScope?: number[];
  defaultDataMask?: {
    extraFormData?: { time_range?: unknown };
  };
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

type ChartDatasetIdsByChart = Record<number, number>;

const isMeaningfulDataMask = (dataMask: DataMaskStateWithId[string]) =>
  Object.keys(dataMask.extraFormData ?? {}).length > 0 ||
  Object.keys(dataMask.filterState ?? {}).length > 0 ||
  Object.keys(dataMask.ownState ?? {}).length > 0;

const readTimeRange = (value: unknown, source: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${source} time range is invalid`);
  }
  return value.trim();
};

const getApplicableTimeFilters = (
  datasetId: number,
  nativeFilters: NativeFiltersById,
  chartDatasetIds: ChartDatasetIdsByChart | undefined,
) => {
  const applicable: Array<[string, NativeFilterConfig]> = [];
  let scopeAmbiguous = false;

  Object.entries(nativeFilters).forEach(([filterId, filterConfig]) => {
    if (filterConfig.filterType !== 'filter_custom_time') {
      return;
    }
    const configuredTargets = (filterConfig.targets ?? []).filter(
      target => target.datasetId !== undefined,
    );
    if (configuredTargets.length) {
      if (configuredTargets.some(target => target.datasetId === datasetId)) {
        applicable.push([filterConfig.id ?? filterId, filterConfig]);
      }
      return;
    }

    const chartIds = filterConfig.chartsInScope;
    if (chartIds === undefined) {
      scopeAmbiguous = true;
      return;
    }
    if (chartIds.length === 0) {
      return;
    }
    const scopedDatasets = chartIds.map(chartId => chartDatasetIds?.[chartId]);
    if (
      scopedDatasets.some(scopedDataset => scopedDataset === undefined)
    ) {
      scopeAmbiguous = true;
      return;
    }
    if (scopedDatasets.includes(datasetId)) {
      applicable.push([filterConfig.id ?? filterId, filterConfig]);
    }
  });

  return { applicable, scopeAmbiguous };
};

const getApplicableTimeRange = (
  datasetId: number,
  nativeFilters: NativeFiltersById,
  dataMaskSelected: DataMaskStateWithId | undefined,
  chartDatasetIds: ChartDatasetIdsByChart | undefined,
) => {
  const { applicable, scopeAmbiguous } = getApplicableTimeFilters(
    datasetId,
    nativeFilters,
    chartDatasetIds,
  );
  if (scopeAmbiguous) {
    throw new Error('Applicable dashboard time filter scope is not ready');
  }
  const ranges = applicable.map(([filterId, filterConfig]) => {
    const selected = dataMaskSelected?.[filterId];
    const selectedRange = readTimeRange(
      selected?.extraFormData?.time_range,
      `Selected filter ${filterId}`,
    );
    if (selectedRange) {
      return selectedRange;
    }
    if (selected && isMeaningfulDataMask(selected)) {
      throw new Error(`Selected filter ${filterId} time range is not ready`);
    }
    return readTimeRange(
      filterConfig.defaultDataMask?.extraFormData?.time_range,
      `Default filter ${filterId}`,
    );
  });
  if (ranges.some(range => range === undefined)) {
    throw new Error('Applicable dashboard time range is not ready');
  }
  const uniqueRanges = [...new Set(ranges)];
  if (uniqueRanges.length > 1) {
    throw new Error('Applicable dashboard time ranges conflict');
  }
  return uniqueRanges[0];
};

/*
 * 功能审计（可重写规格）：级联筛选选项首次时间范围解析
 * - 功能目的与触发方式：FilterValue 批量加载筛选选项时构造 dashboard cascade 请求。
 * - 输入契约：dashboard/dataset、nativeFilters、按 filter id 的 selected dataMask、chartsInScope→datasource 映射；time_range 为字符串。
 * - 输出契约：应用列过滤和唯一有效 time_range 的请求 payload；未就绪/冲突抛出错误且不发请求。
 * - 处理流程：收集选择列值；generic 模式先解析适用时间筛选器，selected dataMask 优先，空初始化时取 defaultDataMask；legacy sellerfox 模式保留旧 payload。
 * - 业务规则：只取适用 dataset/scope 的 custom time filter；0 个可省略，1 个必须有效，多个必须相同；无关 dataMask 不得覆盖。
 * - 状态与副作用：只读读取 Redux 输入并生成请求对象，不写看板、数据库、localStorage 或缓存。
 * - 外部依赖：Native Filter 配置、sliceEntities datasource scope 和现有 SupersetClient。
 * - 异常与边界：scope 缺失/未解析、值非法、初始化未完成或范围冲突均抛错；调用方可走既有普通选项回退。
 * - 不变量与约束：不能把已配置但未就绪筛选器扩大成全历史查询；无适用筛选器的旧行为保持。
 * - 验证方式：cascadeFilterOptions.test.ts 和 dashboard 44/51 浏览器 Network。
 */
const getPayload = (
  dashboardId: number,
  datasetId: number,
  nativeFilters: NativeFiltersById | undefined,
  dataMaskSelected?: DataMaskStateWithId,
  chartDatasetIds?: ChartDatasetIdsByChart,
): SellerfoxCascadeOptionsPayload => {
  const appliedFilters: Record<string, unknown[]> = {};
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
  });

  const timeRange = nativeFilters
    ? getApplicableTimeRange(
        datasetId,
        nativeFilters,
        dataMaskSelected,
        chartDatasetIds,
      )
    : Object.values(dataMaskSelected ?? {}).reduce<string | undefined>(
        (current, dataMask) => {
          const value = dataMask.extraFormData?.time_range;
          return typeof value === 'string' && value.trim()
            ? value.trim()
            : current;
        },
        undefined,
      );

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
  chartDatasetIds?: ChartDatasetIdsByChart,
) => {
  const payload = getPayload(
    dashboardId,
    datasetId,
    nativeFilters,
    dataMaskSelected,
    chartDatasetIds,
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
