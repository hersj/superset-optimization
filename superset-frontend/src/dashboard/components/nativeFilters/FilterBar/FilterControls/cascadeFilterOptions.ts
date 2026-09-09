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
import {
  NativeFilterDependencyError,
  resolveNativeFilterDependencies,
} from './nativeFilterDependencies';
import type {
  ChartDatasetIdsByChart,
  NativeFilterConfig,
  NativeFiltersById,
} from './nativeFilterDependencies';
import type { LayoutItem } from 'src/dashboard/types';

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
  time_ranges?: string[];
  time_column?: string;
};

const requestCache = new Map<
  string,
  Promise<SellerfoxCascadeOptionsResponse>
>();

type CascadeFilterOptions = {
  childFilter?: NativeFilterConfig;
  childFilterId?: string;
  initializedFilters?: ReadonlySet<string>;
  chartIds?: number[];
  chartLayoutItems?: LayoutItem[];
};

export const clearSellerfoxCascadeFilterOptionsCache = () => {
  requestCache.clear();
};

export const getSellerfoxCascadeColumns = (
  dashboardId: number,
  datasetId: number | undefined,
) =>
  datasetId === undefined
    ? []
    : (SELLERFOX_CASCADE_COLUMNS_BY_CONTEXT[`${dashboardId}:${datasetId}`] ??
      []);

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
  const columns = getCascadeFilterColumns(
    dashboardId,
    datasetId,
    nativeFilters,
  );

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

/*
 * 功能审计（可重写规格）：自定义时间筛选器的级联依赖请求
 * - 功能目的与触发方式：下游 filter_select 加载选项时，为同一看板中适用的 filter_custom_time 自动增加时间父级约束。
 * - 输入契约：dashboard/dataset、nativeFilters、childFilterId、按 filterId 的 selected dataMask、initializedFilters、chart→dataset 映射和既有 scope 上下文；连续范围为非空字符串，点选 TEMPORAL_RANGE.val 为非空 ISO 半开区间数组。
 * - 输出契约：返回当前级联列的 applied_filters；有且只有 ready 时附带唯一 time_range，点选同时附带完整 time_ranges 和绑定 time_column，否则在请求前抛出可观察错误；点选不能仅发包络。
 * - 处理流程：按 targets 与既有 chartsInScope/scope 解析源父级和 child scope；对每个父级按自身 initializedFilters 选择 selected 或 defaultDataMask；校验同一范围后生成 payload。
 * - 业务规则：targets=[] 不代表全局；scope 需要按既有 helper 解析并与 child scope 求交；未 hydrate 才能使用默认值，hydrate 后空/非法值不得恢复默认；多个有效范围必须一致；无适用父级才省略 time_range。
 * - 状态与副作用：只读 Redux 配置和 dataMask，写入本地请求缓存并发起现有 cascade API 请求；不写看板、数据库或用户偏好。
 * - 外部依赖：Native Filter 配置、initializedFilters、slice datasource、dashboard scope helper、SupersetClient 和既有 API。
 * - 异常与边界：scope/初始化未就绪、值非法或范围冲突均在请求前失败；调用方不得回退为无范围的全历史请求；无适用父级保持旧无范围行为。
 * - 不变量与约束：同一 child 的每个时间父级独立判断；缓存键包含最终 payload；不改变 Sellerfox legacy 无 nativeFilters 的路径。
 * - 验证方式：nativeFilterDependencies.test.ts、cascadeFilterOptions.test.ts，以及 dashboard 44/51 Network 观察。
 */
const getPayload = (
  dashboardId: number,
  datasetId: number,
  nativeFilters: NativeFiltersById | undefined,
  dataMaskSelected?: DataMaskStateWithId,
  chartDatasetIds?: ChartDatasetIdsByChart,
  options: CascadeFilterOptions = {},
): SellerfoxCascadeOptionsPayload => {
  const appliedFilters: Record<string, unknown[]> = {};
  const columns = nativeFilters
    ? getCascadeFilterColumns(dashboardId, datasetId, nativeFilters)
    : getSellerfoxCascadeColumns(dashboardId, datasetId);
  const columnSet = new Set(columns);
  const dependencyResult = nativeFilters
    ? resolveNativeFilterDependencies({
        datasetId,
        nativeFilters,
        dataMaskSelected,
        chartDatasetIds,
        ...options,
      })
    : undefined;

  if (
    dependencyResult &&
    dependencyResult.status !== 'ready' &&
    dependencyResult.status !== 'unconfigured'
  ) {
    throw new NativeFilterDependencyError(dependencyResult);
  }

  Object.values(dataMaskSelected ?? {}).forEach(dataMask => {
    dataMask.extraFormData?.filters?.forEach(filter => {
      if (filter.op === 'TEMPORAL_RANGE') {
        return;
      }
      const column = filter.col;
      if (typeof column === 'string' && columnSet.has(column) && 'val' in filter) {
        const values = toArray(filter.val);
        if (values.length) {
          appliedFilters[column] = values;
        }
      }
    });
  });

  const timeRange =
    dependencyResult?.timeRange ??
    (nativeFilters
      ? undefined
      : Object.values(dataMaskSelected ?? {}).reduce<string | undefined>(
          (current, dataMask) => {
            const value = dataMask.extraFormData?.time_range;
            return typeof value === 'string' && value.trim()
              ? value.trim()
              : current;
          },
          undefined,
        ));

  return {
    dataset_id: datasetId,
    columns,
    applied_filters: appliedFilters,
    ...(timeRange ? { time_range: timeRange } : {}),
    ...(dependencyResult?.timeRanges
      ? {
          time_ranges: dependencyResult.timeRanges,
          time_column: dependencyResult.timeColumn,
        }
      : {}),
  };
};

export const getSellerfoxCascadeFilterOptions = async (
  dashboardId: number,
  datasetId: number,
  dataMaskSelected?: DataMaskStateWithId,
) => {
  const payload = getPayload(
    dashboardId,
    datasetId,
    undefined,
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

export const getCascadeFilterOptions = async (
  dashboardId: number,
  datasetId: number,
  nativeFilters: NativeFiltersById,
  dataMaskSelected?: DataMaskStateWithId,
  chartDatasetIds?: ChartDatasetIdsByChart,
  options?: CascadeFilterOptions,
) => {
  const payload = getPayload(
    dashboardId,
    datasetId,
    nativeFilters,
    dataMaskSelected,
    chartDatasetIds,
    options,
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
