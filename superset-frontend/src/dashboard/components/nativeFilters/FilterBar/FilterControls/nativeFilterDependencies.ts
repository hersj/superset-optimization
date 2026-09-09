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
  DataMask,
  DataMaskStateWithId,
  ExtraFormData,
  NativeFilterScope,
} from '@superset-ui/core';
import { LayoutItem } from 'src/dashboard/types';
import { getChartIdsInFilterScope } from 'src/dashboard/util/getChartIdsInFilterScope';
import {
  normalizeSelectedRanges,
  selectedRangeEnvelope,
} from 'src/filters/components/CustomTime/selectedTimeRanges';

export type NativeFilterConfig = {
  id?: string;
  filterType?: string;
  targets?: {
    datasetId?: number;
    column?: {
      name?: string;
    };
  }[];
  chartsInScope?: number[];
  scope?: NativeFilterScope | 'global';
  defaultDataMask?: DataMask;
};

export type NativeFiltersById = Record<string, NativeFilterConfig>;
export type ChartDatasetIdsByChart = Record<number, number>;

export type NativeFilterDependencyStatus =
  | 'unconfigured'
  | 'ready'
  | 'pending'
  | 'invalid'
  | 'conflict';

export type NativeFilterDependencyResult = {
  status: NativeFilterDependencyStatus;
  timeFilterIds: string[];
  timeRange?: string;
  timeRanges?: string[];
  timeColumn?: string;
  extraFormData?: ExtraFormData;
  message?: string;
};

export type NativeFilterDependencyInput = {
  datasetId: number;
  childFilter?: NativeFilterConfig;
  childFilterId?: string;
  nativeFilters?: NativeFiltersById;
  dataMaskSelected?: DataMaskStateWithId;
  initializedFilters?: ReadonlySet<string>;
  chartDatasetIds?: ChartDatasetIdsByChart;
  chartIds?: number[];
  chartLayoutItems?: LayoutItem[];
};

export type CascadeFilterScopeContext = Pick<
  NativeFilterDependencyInput,
  'chartDatasetIds' | 'chartIds' | 'chartLayoutItems'
>;

export class NativeFilterDependencyError extends Error {
  readonly status: Exclude<
    NativeFilterDependencyStatus,
    'ready' | 'unconfigured'
  >;

  constructor(result: NativeFilterDependencyResult) {
    super(result.message ?? 'Applicable dashboard time filter is not ready');
    this.name = 'NativeFilterDependencyError';
    this.status = result.status as NativeFilterDependencyError['status'];
  }
}

type ResolvedScope =
  | { kind: 'global' }
  | { kind: 'scoped'; chartIds: Set<number> }
  | { kind: 'pending' };

type TimeFilterClause = {
  col?: string;
  op?: string;
  val?: unknown;
  [key: string]: unknown;
};

type ResolvedMaskRange = {
  range?: string;
  timeRanges?: string[];
  timeColumn?: string;
  temporalFilters: TimeFilterClause[];
};

const readTimeRange = (value: unknown, source: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${source} time range is invalid`);
  }
  const range = value.trim();
  if (range.toLowerCase() === 'no filter') {
    throw new Error(`${source} time range is invalid`);
  }
  return range;
};

const getTemporalFilters = (extraFormData?: ExtraFormData) =>
  (Array.isArray(extraFormData?.filters)
    ? (extraFormData.filters as TimeFilterClause[])
    : []
  ).filter(filter => filter.op === 'TEMPORAL_RANGE');

const readMaskRange = (
  mask: DataMask | undefined,
  source: string,
): ResolvedMaskRange => {
  // 点选完整集合参与一致性判定；两个相同包络、不同空档的选择不能视为同一个父级范围。
  const temporalFilters = getTemporalFilters(mask?.extraFormData);
  const pointFilters = temporalFilters.filter(filter =>
    Array.isArray(filter.val),
  );
  if (pointFilters.length) {
    const selections = pointFilters.map(filter =>
      normalizeSelectedRanges(filter.val),
    );
    const ranges = selections[0];
    const range = selectedRangeEnvelope(ranges);
    if (
      !range ||
      !pointFilters[0].col ||
      temporalFilters.length !== pointFilters.length ||
      selections.some(
        value => JSON.stringify(value) !== JSON.stringify(ranges),
      ) ||
      pointFilters.some(filter => filter.col !== pointFilters[0].col) ||
      (mask?.extraFormData?.time_range !== undefined &&
        mask.extraFormData.time_range !== range)
    ) {
      throw new Error(`${source} selected time ranges are empty or conflict`);
    }
    return {
      range,
      timeRanges: ranges,
      timeColumn: pointFilters[0].col,
      temporalFilters,
    };
  }
  const ranges = [
    readTimeRange(mask?.extraFormData?.time_range, `${source} top-level`),
    ...temporalFilters.map(filter =>
      readTimeRange(filter.val, `${source} TEMPORAL_RANGE`),
    ),
  ].filter((range): range is string => range !== undefined);

  if (new Set(ranges).size > 1) {
    throw new Error(`${source} time ranges conflict`);
  }

  return { range: ranges[0], temporalFilters };
};

const hasValidScope = (
  scope: NativeFilterScope | 'global' | undefined,
): scope is NativeFilterScope =>
  scope !== undefined &&
  scope !== 'global' &&
  Array.isArray(scope.rootPath) &&
  Array.isArray(scope.excluded);

const resolveScope = (
  filter: NativeFilterConfig,
  context: CascadeFilterScopeContext,
): ResolvedScope => {
  if (filter.scope === 'global') {
    return { kind: 'global' };
  }

  if (Array.isArray(filter.chartsInScope) && filter.chartsInScope.length > 0) {
    return { kind: 'scoped', chartIds: new Set(filter.chartsInScope) };
  }

  if (hasValidScope(filter.scope)) {
    if (!context.chartIds?.length || !context.chartLayoutItems?.length) {
      return { kind: 'pending' };
    }
    return {
      kind: 'scoped',
      chartIds: new Set(
        getChartIdsInFilterScope(
          filter.scope,
          context.chartIds,
          context.chartLayoutItems,
        ),
      ),
    };
  }

  if (Array.isArray(filter.chartsInScope)) {
    // An empty calculated scope is not evidence of a global filter. The
    // dashboard must finish supplying either scope or chart IDs first.
    return { kind: 'pending' };
  }

  if (filter.targets?.some(target => target.datasetId !== undefined)) {
    return { kind: 'global' };
  }

  return { kind: 'pending' };
};

const hasIntersection = (left: Set<number>, right: Set<number>) =>
  [...left].some(chartId => right.has(chartId));

const getApplicableTimeFilters = (
  input: NativeFilterDependencyInput,
): {
  applicable: Array<[string, NativeFilterConfig]>;
  pending: boolean;
} => {
  const nativeFilters = input.nativeFilters ?? {};
  const childFilter =
    input.childFilter ??
    (input.childFilterId ? nativeFilters[input.childFilterId] : undefined);
  const context: CascadeFilterScopeContext = input;
  const childScope = childFilter
    ? resolveScope(childFilter, context)
    : { kind: 'global' as const };
  const applicable: Array<[string, NativeFilterConfig]> = [];
  let pending = false;

  Object.entries(nativeFilters).forEach(([filterKey, filterConfig]) => {
    if (filterConfig.filterType !== 'filter_custom_time') {
      return;
    }

    const filterId = filterConfig.id ?? filterKey;
    const targetDatasetIds = (filterConfig.targets ?? [])
      .map(target => target.datasetId)
      .filter((id): id is number => id !== undefined);
    if (
      targetDatasetIds.length > 0 &&
      !targetDatasetIds.includes(input.datasetId)
    ) {
      return;
    }

    const sourceScope = resolveScope(filterConfig, context);
    if (sourceScope.kind === 'pending') {
      pending = true;
      return;
    }

    if (sourceScope.kind === 'global') {
      if (childScope.kind === 'pending') {
        pending = true;
      } else {
        applicable.push([filterId, filterConfig]);
      }
      return;
    }

    if (targetDatasetIds.length === 0 && !input.chartDatasetIds) {
      pending = true;
      return;
    }

    if (
      targetDatasetIds.length === 0 &&
      [...sourceScope.chartIds].some(
        chartId => input.chartDatasetIds?.[chartId] === undefined,
      )
    ) {
      pending = true;
      return;
    }

    const sourceMatchesDataset =
      targetDatasetIds.length > 0 ||
      [...sourceScope.chartIds].some(
        chartId => input.chartDatasetIds?.[chartId] === input.datasetId,
      );
    if (!sourceMatchesDataset) {
      return;
    }

    if (childScope.kind === 'pending') {
      pending = true;
    } else if (
      childScope.kind === 'global' ||
      hasIntersection(sourceScope.chartIds, childScope.chartIds)
    ) {
      applicable.push([filterId, filterConfig]);
    }
  });

  return { applicable, pending };
};

const resolveParentRange = (
  filterId: string,
  filterConfig: NativeFilterConfig,
  input: NativeFilterDependencyInput,
): ResolvedMaskRange & {
  status: 'ready' | 'pending' | 'invalid';
  message?: string;
} => {
  const selected = input.dataMaskSelected?.[filterId];
  const isInitialized = input.initializedFilters?.has(filterId) ?? false;

  let selectedResult: ResolvedMaskRange;
  try {
    selectedResult = readMaskRange(selected, `Selected filter ${filterId}`);
  } catch (error) {
    if (isInitialized) {
      return {
        status: 'invalid',
        temporalFilters: [],
        message: error instanceof Error ? error.message : String(error),
      };
    }
    selectedResult = { temporalFilters: [] };
  }

  if (selectedResult.range !== undefined) {
    return { status: 'ready', ...selectedResult };
  }
  if (isInitialized) {
    return {
      status: 'invalid',
      temporalFilters: [],
      message: `Selected filter ${filterId} time range is not ready`,
    };
  }

  try {
    const defaultResult = readMaskRange(
      filterConfig.defaultDataMask,
      `Default filter ${filterId}`,
    );
    if (defaultResult.range === undefined) {
      return {
        status: 'pending',
        temporalFilters: [],
        message: `Applicable dashboard time filter ${filterId} is not ready`,
      };
    }
    return { status: 'ready', ...defaultResult };
  } catch (error) {
    return {
      status: 'invalid',
      temporalFilters: [],
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

/*
 * 功能审计（可重写规格）：自定义时间筛选器的隐式级联依赖
 * - 功能目的与触发方式：下游 filter_select 加载选项或生成查询表单时，自动把同一看板中实际适用的 filter_custom_time 视为时间父级。
 * - 输入契约：当前 child 的 datasetId、filter 配置及 scope/targets、看板 chartIds/layout、chart→dataset 映射、按 filterId 的 dataMaskSelected、已有 initializedFilters；连续时间为非空字符串；点选是绑定列 TEMPORAL_RANGE 的非空 ISO 半开区间数组。
 * - 输出契约：返回 unconfigured、ready、pending、invalid 或 conflict；ready 时返回唯一 timeRange 及可合并的 extraFormData，点选另返回 timeRanges/timeColumn 且 fallback 表单保留数组；其他状态必须阻止级联请求和普通全历史回退。
 * - 处理流程：先按 targets 和 scope 解析源时间父级，再与 child scope 求交；逐个父级按 initializedFilters 判断使用当前 dataMask 或 defaultDataMask；最后校验所有有效范围一致。
 * - 业务规则：targets=[] 不代表全局；显式 chart scope 需要 chart→dataset 映射，scope 未就绪为 pending；未 hydrate 才能使用默认值，hydrate 后空/非法值不得恢复默认；多个时间父级必须同值，否则 conflict；只有没有适用时间父级才是 unconfigured。
 * - 状态与副作用：纯函数，只读输入，不写 Redux、数据库、缓存或网络。
 * - 外部依赖：Superset native filter 配置、既有 initializedFilters、scope helper 和 DataMask 结构。
 * - 异常与边界：scope 缺失、初始化未完成、空值、非法值或冲突均返回阻断状态；不猜测范围、不扩大为全历史。
 * - 不变量与约束：每个父级独立解析；child scope 与源 scope 不相交时不适用；点选以完整规范集合及绑定列比较冲突，不仅比较包络；不改变无适用时间父级的旧无范围行为。
 * - 验证方式：nativeFilterDependencies.test.ts、cascadeFilterOptions.test.ts，以及 dashboard 44/51 的 Network 观察。
 */
export const resolveNativeFilterDependencies = (
  input: NativeFilterDependencyInput,
): NativeFilterDependencyResult => {
  const { applicable, pending } = getApplicableTimeFilters(input);
  if (pending) {
    return {
      status: 'pending',
      timeFilterIds: applicable.map(([filterId]) => filterId),
      message: 'Applicable dashboard time filter scope or value is not ready',
    };
  }
  if (applicable.length === 0) {
    return { status: 'unconfigured', timeFilterIds: [] };
  }

  const parentResults = applicable.map(([filterId, filterConfig]) => ({
    filterId,
    ...resolveParentRange(filterId, filterConfig, input),
  }));

  const invalid = parentResults.find(result => result.status === 'invalid');
  if (invalid) {
    return {
      status: 'invalid',
      timeFilterIds: parentResults.map(result => result.filterId),
      message: invalid.message,
    };
  }

  const waiting = parentResults.find(result => result.status === 'pending');
  if (waiting) {
    return {
      status: 'pending',
      timeFilterIds: parentResults.map(result => result.filterId),
      message: waiting.message,
    };
  }

  const ranges = parentResults
    .map(result => result.range)
    .filter((range): range is string => range !== undefined);
  const uniqueRanges = [...new Set(ranges)];
  const selectedSignatures = parentResults.map(result =>
    JSON.stringify([result.timeRanges, result.timeColumn]),
  );
  if (uniqueRanges.length !== 1 || new Set(selectedSignatures).size !== 1) {
    return {
      status: 'conflict',
      timeFilterIds: parentResults.map(result => result.filterId),
      message: 'Applicable dashboard time ranges conflict',
    };
  }

  return {
    status: 'ready',
    timeFilterIds: parentResults.map(result => result.filterId),
    timeRange: uniqueRanges[0],
    timeRanges: parentResults[0].timeRanges,
    timeColumn: parentResults[0].timeColumn,
    extraFormData: {
      time_range: uniqueRanges[0],
      ...(parentResults[0].timeRanges
        ? {
            filters: [
              {
                col: parentResults[0].timeColumn!,
                op: 'TEMPORAL_RANGE',
                val: parentResults[0].timeRanges,
              },
            ],
          }
        : {}),
    },
  };
};
