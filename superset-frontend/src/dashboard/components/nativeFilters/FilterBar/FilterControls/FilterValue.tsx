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
  FC,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { t } from '@apache-superset/core/translation';
import {
  ChartDataResponseResult,
  Behavior,
  DataMask,
  isFeatureEnabled,
  FeatureFlag,
  getChartMetadataRegistry,
  JsonObject,
  QueryFormData,
  SuperChart,
  ClientErrorObject,
  ErrorTypeEnum,
  getClientErrorObject,
  isChartCustomization,
} from '@superset-ui/core';
import { styled } from '@apache-superset/core/theme';
import { useDispatch, useSelector } from 'react-redux';
import { isEqual, isEqualWith } from 'lodash';
import { getChartDataRequest } from 'src/components/Chart/chartAction';
import { ErrorAlert, ErrorMessageWithStackTrace } from 'src/components';
import { Loading, Constants } from '@superset-ui/core/components';
import { waitForAsyncData } from 'src/middleware/asyncEvent';
import { FilterBarOrientation, RootState } from 'src/dashboard/types';
import { useChartLayoutItems } from 'src/dashboard/util/useChartLayoutItems';
import { useChartIds } from 'src/dashboard/util/charts/useChartIds';
import {
  onFiltersRefreshSuccess,
  setDirectPathToChild,
} from 'src/dashboard/actions/dashboardState';
import {
  setHoveredChartCustomization,
  unsetHoveredChartCustomization,
} from 'src/dashboard/actions/nativeFilters';
import { RESPONSIVE_WIDTH } from 'src/filters/components/common';
import { dispatchHoverAction, dispatchFocusAction } from './utils';
import { FilterControlProps } from './types';
import { getFormData, mergeExtraFormData } from '../../utils';
import { useFilterDependencies } from './state';
import { useFilterOutlined } from '../useFilterOutlined';
import {
  getCascadeFilterOptions,
  getCascadeComparisonContext,
  isCascadeFilter,
} from './cascadeFilterOptions';
import {
  NativeFilterDependencyError,
  resolveNativeFilterDependencies,
} from './nativeFilterDependencies';
import type { NativeFilterDependencyResult } from './nativeFilterDependencies';

const HEIGHT = 32;

// Overrides superset-ui height with min-height
const StyledDiv = styled.div<{
  orientation: FilterBarOrientation;
  overflow: boolean;
}>`
  padding-bottom: ${({ theme, orientation, overflow }) =>
    orientation === FilterBarOrientation.Horizontal && !overflow
      ? 0
      : (theme?.sizeUnit ?? 4)}px;

  & > div {
    height: auto !important;
    min-height: ${HEIGHT}px;
  }
`;

const queriesDataPlaceholder = [{ data: [{}] }];

const getNativeFilterDependencyError = (
  message: string,
): ClientErrorObject => ({
  error: message,
  errors: [
    {
      error_type: ErrorTypeEnum.GENERIC_BACKEND_ERROR,
      extra: null,
      level: 'error',
      message,
    },
  ],
});

export const shouldStartFilterOptionsRequest = ({
  isRefreshing,
  formDataChanged,
  ownStateChanged,
  shouldRefresh,
  shouldLoadOptions = true,
  hasLoadedOptions = true,
}: {
  isRefreshing: boolean;
  formDataChanged: boolean;
  ownStateChanged: boolean;
  shouldRefresh: boolean;
  shouldLoadOptions?: boolean;
  hasLoadedOptions?: boolean;
}) =>
  shouldLoadOptions &&
  (formDataChanged ||
    ownStateChanged ||
    (!hasLoadedOptions && !isRefreshing) ||
    (shouldRefresh && !isRefreshing));

export const shouldLoadFilterOptions = ({
  defaultToFirstItem,
  hasLoadedOptions,
  isFilterActive,
  isBatchableFilter = false,
  isRangeFilter = false,
}: {
  defaultToFirstItem: boolean;
  hasLoadedOptions: boolean;
  isFilterActive: boolean;
  isBatchableFilter?: boolean;
  isRangeFilter?: boolean;
}) =>
  defaultToFirstItem ||
  hasLoadedOptions ||
  isFilterActive ||
  isBatchableFilter ||
  isRangeFilter;

export const shouldApplyFilterOptionsRequestResult = ({
  requestId,
  currentRequestId,
  requestDashboardId,
  currentDashboardId,
}: {
  requestId: number;
  currentRequestId: number;
  requestDashboardId: number;
  currentDashboardId: number;
}) =>
  requestId === currentRequestId && requestDashboardId === currentDashboardId;

const useShouldFilterRefresh = () => {
  const isDashboardRefreshing = useSelector<RootState, boolean>(
    state => state.dashboardState.isRefreshing,
  );
  const isFilterRefreshing = useSelector<RootState, boolean>(
    state => state.dashboardState.isFiltersRefreshing,
  );

  // trigger filter requests only after charts requests were triggered
  return !isDashboardRefreshing && isFilterRefreshing;
};

export type FilterValueProps = FilterControlProps;

/*
 * 功能审计（可重写规格）：filter_select 的自定义时间隐式级联
 * - 功能目的与触发方式：filter_select 首次加载、父筛选器变化、看板刷新或自定义时间筛选器变化时，自动把适用的 filter_custom_time 作为时间父级。
 * - 输入契约：读取当前 FilterBar 的 filter、按 filterId 的 dataMaskSelected、initializedFilters、nativeFilters、当前看板 chart scope 与 chart→dataset 映射；时间范围必须来自有效字符串或 TEMPORAL_RANGE.val。
 * - 输出契约：ready 时向级联接口和图表数据请求传递同一个顶层 time_range；unconfigured 时保持旧请求；pending、invalid、conflict 时显示可观察错误并且不发起任一数据请求。
 * - 处理流程：先由共享 resolver 按目标数据集及既有 scope 判断适用父级，再按每个父级自身 ID 判断 hydrate，生成 effectiveDependencies，最后才决定 cascade 或普通 chart data 请求。
 * - 业务规则：已 hydrate 的父级只读当前值，清空/非法不得恢复默认；未 hydrate 才允许使用自身 defaultDataMask；多个有效范围必须一致；TEMPORAL_RANGE 不进入 applied_filters；无适用父级才省略时间范围。
 * - 状态与副作用：只更新当前 FilterValue 的加载、选项和错误状态；正常网络错误保留既有 chart fallback，但必须继续携带已解析时间范围；依赖错误不得 fallback 为全历史。
 * - 外部依赖：现有 Redux FilterBar 状态、scope helper、slice datasource、getCascadeFilterOptions、getChartDataRequest 和 SuperChart；不写数据库、看板配置、localStorage 或新增状态层。
 * - 异常与边界：scope、chart 映射或 hydrate 未就绪，以及用户清空、非法或多父级冲突，均停止请求；依赖恢复为合法值后重新计算并请求，过期请求结果仍按现有 dashboard/request guard 丢弃。
 * - 不变量与约束：每个图表和 child 独立；右上角时间/展示开关只触发重新计算，不改变既有图例或父级状态；无时间对比混合图继续使用原有依赖行为。
 * - 验证方式：FilterValue.test.ts 的组件回归覆盖阻断、恢复和 time_range；nativeFilterDependencies.test.ts 覆盖 scope/hydrate；cascadeFilterOptions.test.ts 覆盖最终 payload。
 */

const FilterValue: FC<FilterValueProps> = ({
  dataMaskSelected,
  filter,
  onFilterSelectionChange,
  inView = true,
  showOverflow,
  parentRef,
  isFilterActive = false,
  setFilterActive,
  orientation = FilterBarOrientation.Vertical,
  overflow = false,
  validateStatus,
  clearAllTrigger,
  onClearAllComplete,
  initializedFilters,
  matchModeContainer,
}) => {
  const { id, targets, filterType } = filter;
  const isCustomization = isChartCustomization(filter);
  const adhocFilters = isCustomization ? undefined : filter.adhoc_filters;
  const timeRange = isCustomization ? undefined : filter.time_range;
  const granularitySqla = isCustomization ? undefined : filter.granularity_sqla;
  const metadata = getChartMetadataRegistry().get(filterType);
  const dependencies = useFilterDependencies(id, dataMaskSelected);
  const shouldRefresh = useShouldFilterRefresh();

  const behaviors = useMemo(
    () => [
      isCustomization ? Behavior.ChartCustomization : Behavior.NativeFilter,
    ],
    [isCustomization],
  );
  const [state, setState] = useState<ChartDataResponseResult[]>([]);
  const dashboardId = useSelector<RootState, number>(
    state => state.dashboardInfo.id,
  );
  const nativeFilters = useSelector<RootState, Record<string, any>>(
    state => state.nativeFilters.filters,
  );
  const comparisonEnabled = useSelector<RootState, boolean>(
    state =>
      state.dashboardState.dashboardChartControls?.timeCompareEnabled ?? true,
  );
  // 级联请求只使用当前看板 Redux 中已加载的 slice datasource_id；映射未就绪时由共享依赖 resolver 拒绝不明确的 scope。
  const sliceEntities = useSelector(
    (state: RootState) => state.sliceEntities.slices,
  );
  const chartDatasetIds = useMemo(
    () =>
      Object.entries(sliceEntities).reduce<Record<number, number>>(
        (result, [chartId, slice]) => {
          if (slice?.datasource_id !== undefined) {
            result[Number(chartId)] = slice.datasource_id;
          }
          return result;
        },
        {},
      ),
    [sliceEntities],
  );
  const [error, setError] = useState<ClientErrorObject>();
  const [formData, setFormData] = useState<Partial<QueryFormData>>({
    inView: false,
  });
  const [ownState, setOwnState] = useState<JsonObject>({});
  const [inViewFirstTime, setInViewFirstTime] = useState(inView);
  const inputRef = useRef<HTMLInputElement>(null);
  const [target] = targets || [];
  const {
    datasetId,
    column = {},
  }: Partial<{ datasetId: number; column: { name?: string } }> = target || {};
  const groupby = column?.name;
  const hasDataSource = !!datasetId;

  const chartIds = useChartIds();
  const chartLayoutItems = useChartLayoutItems();
  const implicitTimeDependency = useMemo<NativeFilterDependencyResult>(() => {
    if (filterType !== 'filter_select' || datasetId === undefined) {
      return { status: 'unconfigured', timeFilterIds: [] };
    }
    return resolveNativeFilterDependencies({
      datasetId,
      childFilterId: id,
      nativeFilters,
      dataMaskSelected,
      initializedFilters,
      chartDatasetIds,
      chartIds,
      chartLayoutItems,
    });
  }, [
    filterType,
    datasetId,
    id,
    nativeFilters,
    dataMaskSelected,
    initializedFilters,
    chartDatasetIds,
    chartIds,
    chartLayoutItems,
  ]);
  const effectiveDependencies = useMemo(
    () =>
      mergeExtraFormData(dependencies, implicitTimeDependency.extraFormData),
    [dependencies, implicitTimeDependency.extraFormData],
  );
  const isImplicitTimeDependencyBlocked =
    filterType === 'filter_select' &&
    implicitTimeDependency.status !== 'ready' &&
    implicitTimeDependency.status !== 'unconfigured';

  const [isLoading, setIsLoading] = useState<boolean>(hasDataSource);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewSearch, setPreviewSearch] = useState<string>();
  const [hasLoadedOptions, setHasLoadedOptions] = useState(!hasDataSource);
  const requestIdRef = useRef(0);
  const comparisonContextRef = useRef('{}');
  const dashboardIdRef = useRef(dashboardId);
  const dispatch = useDispatch();

  const { outlinedFilterId, lastUpdated } = useFilterOutlined();

  const handleFilterLoadFinish = useCallback(() => {
    setIsRefreshing(false);
    setIsLoading(false);
    if (shouldRefresh) {
      dispatch(onFiltersRefreshSuccess());
    }
  }, [dispatch, shouldRefresh]);

  useEffect(() => {
    dashboardIdRef.current = dashboardId;
  }, [dashboardId]);

  useEffect(() => {
    requestIdRef.current += 1;
    setIsRefreshing(false);
    setIsLoading(hasDataSource);
    setHasLoadedOptions(!hasDataSource);
    setPreviewSearch(undefined);
    setState([]);
    setError(undefined);
    setFormData({ inView: false });
    setOwnState({});
  }, [dashboardId, hasDataSource, id]);

  useEffect(() => {
    if (!inViewFirstTime && inView) {
      setInViewFirstTime(true);
    }
  }, [inView, inViewFirstTime, setInViewFirstTime]);

  useEffect(() => {
    if (!inViewFirstTime) {
      return;
    }
    const newFormData = getFormData({
      ...filter,
      datasetId,
      dependencies: effectiveDependencies,
      groupby,
      adhoc_filters: adhocFilters,
      time_range: timeRange,
      granularity_sqla: granularitySqla,
      dashboardId,
    });
    const filterOwnState = filter.dataMask?.ownState || {};

    if (isImplicitTimeDependencyBlocked) {
      // Blocking a dependency also invalidates requests already in flight.
      requestIdRef.current += 1;
      setFormData(newFormData);
      setOwnState(filterOwnState);
      setState([]);
      setError(
        getNativeFilterDependencyError(
          implicitTimeDependency.message ??
            'Applicable dashboard time filter is not ready',
        ),
      );
      handleFilterLoadFinish();
      return;
    }

    let comparisonContext: ReturnType<typeof getCascadeComparisonContext>;
    try {
      comparisonContext = getCascadeComparisonContext(
        nativeFilters,
        dataMaskSelected,
        implicitTimeDependency,
        comparisonEnabled,
      );
    } catch (comparisonError) {
      requestIdRef.current += 1;
      setError(
        getNativeFilterDependencyError(
          comparisonError instanceof Error
            ? comparisonError.message
            : String(comparisonError),
        ),
      );
      handleFilterLoadFinish();
      return;
    }
    const comparisonKey = JSON.stringify(comparisonContext);
    const hasComparisonContext = Boolean(
      comparisonContext.comparison_time_ranges?.length ||
      comparisonContext.time_offsets?.length,
    );

    if ((filter.cascadeParentIds ?? []).length) {
      // Prevent unnecessary backend requests by validating parent filter selections first

      let selectedParentFilterValueCounts = 0;

      (filter.cascadeParentIds ?? []).forEach(pId => {
        const extraFormData = dataMaskSelected?.[pId]?.extraFormData;
        if (extraFormData?.filters?.length) {
          selectedParentFilterValueCounts += extraFormData.filters.length;
        } else if (extraFormData?.time_range) {
          selectedParentFilterValueCounts += 1;
        }
      });

      // check if all parent filters with defaults have a value selected

      let depsCount = dependencies.filters?.length ?? 0;

      if (dependencies?.time_range) {
        depsCount += 1;
      }
      if (selectedParentFilterValueCounts !== depsCount) {
        // child filter should not request backend until it
        // has all the required information from parent filters
        return;
      }
    }

    // TODO: We should try to improve our useEffect hooks to depend more on
    // granular information instead of big objects that require deep comparison.
    const customizer = (
      objValue: Partial<QueryFormData>,
      othValue: Partial<QueryFormData>,
      key: string,
    ) => (key === 'url_params' ? true : undefined);
    const formDataChanged =
      !isEqualWith(formData, newFormData, customizer) ||
      comparisonContextRef.current !== comparisonKey;
    const ownStateChanged = !isEqual(ownState, filterOwnState);
    const isContainsSearch =
      newFormData.allowFuzzyMatch !== false &&
      filter.dataMask?.filterState?.matchMode === 'contains';
    const isBatchableFilter =
      (!filterOwnState.search || isContainsSearch || hasComparisonContext) &&
      isCascadeFilter(
        dashboardId,
        datasetId,
        filterType,
        groupby,
        nativeFilters,
      );
    const defaultToFirstItem = Boolean(
      newFormData.defaultToFirstItem &&
      filter.dataMask?.filterState?.value === undefined &&
      !clearAllTrigger,
    );
    const shouldLoadOptions = shouldLoadFilterOptions({
      defaultToFirstItem,
      hasLoadedOptions,
      isFilterActive,
      isBatchableFilter,
      isRangeFilter: filterType === 'filter_range',
    });
    if (!shouldLoadOptions) {
      if (formDataChanged) {
        setFormData(newFormData);
      }
      if (ownStateChanged) {
        setOwnState(filterOwnState);
      }
      setIsLoading(false);
      return;
    }
    if (
      shouldStartFilterOptionsRequest({
        isRefreshing,
        formDataChanged,
        ownStateChanged,
        shouldRefresh,
        shouldLoadOptions,
        hasLoadedOptions,
      })
    ) {
      setFormData(newFormData);
      setOwnState(filterOwnState);
      if (!hasDataSource) {
        return;
      }
      setIsRefreshing(true);
      setHasLoadedOptions(true);
      comparisonContextRef.current = comparisonKey;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const requestDashboardId = dashboardId;
      const isCurrentRequest = () =>
        shouldApplyFilterOptionsRequestResult({
          requestId,
          currentRequestId: requestIdRef.current,
          requestDashboardId,
          currentDashboardId: dashboardIdRef.current,
        });
      const finishCurrentRequest = () => {
        if (isCurrentRequest()) {
          setPreviewSearch(filterOwnState.search);
          handleFilterLoadFinish();
        }
      };

      const loadChartData = () =>
        getChartDataRequest({
          formData: newFormData,
          force: shouldRefresh,
          ownState: filterOwnState,
        })
          .then(({ response, json }) => {
            if (!isCurrentRequest()) {
              return;
            }
            if (isFeatureEnabled(FeatureFlag.GlobalAsyncQueries)) {
              // deal with getChartDataRequest transforming the response data
              const result = 'result' in json ? json.result[0] : json;
              if (response.status === 200) {
                setState([result as ChartDataResponseResult]);
                finishCurrentRequest();
              } else if (response.status === 202) {
                waitForAsyncData(
                  result as Parameters<typeof waitForAsyncData>[0],
                )
                  .then((asyncResult: ChartDataResponseResult[]) => {
                    if (!isCurrentRequest()) {
                      return;
                    }
                    setState(asyncResult);
                    finishCurrentRequest();
                  })
                  .catch((error: Response) => {
                    if (!isCurrentRequest()) {
                      return;
                    }
                    getClientErrorObject(error).then(clientErrorObject => {
                      if (!isCurrentRequest()) {
                        return;
                      }
                      setError(clientErrorObject);
                      finishCurrentRequest();
                    });
                  });
              } else {
                throw new Error(
                  `Received unexpected response status (${response.status}) while fetching chart data`,
                );
              }
            } else {
              setState(json.result as ChartDataResponseResult[]);
              setError(undefined);
              finishCurrentRequest();
            }
          })
          .catch((error: Response) => {
            if (!isCurrentRequest()) {
              return;
            }
            getClientErrorObject(error).then(clientErrorObject => {
              if (!isCurrentRequest()) {
                return;
              }
              setError(clientErrorObject);
              finishCurrentRequest();
            });
          });

      if (isBatchableFilter) {
        getCascadeFilterOptions(
          dashboardId,
          datasetId as number,
          nativeFilters,
          dataMaskSelected,
          chartDatasetIds,
          {
            childFilterId: id,
            comparisonEnabled,
            initializedFilters,
            chartIds,
            chartLayoutItems,
            ...((isContainsSearch || hasComparisonContext) &&
            filterOwnState.search
              ? {
                  search: {
                    column: groupby as string,
                    value: filterOwnState.search,
                  },
                }
              : {}),
          },
        )
          .then(result => {
            if (!isCurrentRequest()) {
              return undefined;
            }
            const columnResult = result[groupby as string];
            if (!columnResult) {
              if (hasComparisonContext)
                throw new Error(
                  'Comparison filter options response is incomplete',
                );
              return loadChartData();
            }
            setState([columnResult]);
            setError(undefined);
            finishCurrentRequest();
            return undefined;
          })
          .catch(error => {
            if (!isCurrentRequest()) {
              return undefined;
            }
            if (
              error instanceof NativeFilterDependencyError ||
              hasComparisonContext
            ) {
              if (error instanceof NativeFilterDependencyError) setState([]);
              setError(
                getNativeFilterDependencyError(
                  error instanceof Error ? error.message : String(error),
                ),
              );
              finishCurrentRequest();
              return undefined;
            }
            return loadChartData();
          });
      } else {
        loadChartData();
      }
    }
  }, [
    inViewFirstTime,
    dashboardId,
    dependencies,
    effectiveDependencies,
    implicitTimeDependency,
    isImplicitTimeDependencyBlocked,
    comparisonEnabled,
    datasetId,
    groupby,
    handleFilterLoadFinish,
    filter,
    hasDataSource,
    hasLoadedOptions,
    isFilterActive,
    isRefreshing,
    shouldRefresh,
    dataMaskSelected,
    nativeFilters,
    chartDatasetIds,
    initializedFilters,
    chartIds,
    chartLayoutItems,
  ]);

  useEffect(() => {
    if (outlinedFilterId && outlinedFilterId === filter.id) {
      setTimeout(
        () => {
          inputRef?.current?.focus();
        },
        overflow ? Constants.FAST_DEBOUNCE : 0,
      );
    }
  }, [inputRef, outlinedFilterId, lastUpdated, filter.id, overflow]);

  const setDataMask = useCallback(
    (dataMask: DataMask) => onFilterSelectionChange(filter, dataMask),
    [filter, onFilterSelectionChange],
  );

  const setFocusedFilter = useCallback(() => {
    if (isCustomization) {
      return;
    }
    if (outlinedFilterId !== id) {
      dispatchFocusAction(dispatch, id);
    }
  }, [dispatch, id, outlinedFilterId, isCustomization]);

  const unsetFocusedFilter = useCallback(() => {
    if (isCustomization) {
      return;
    }
    dispatchFocusAction(dispatch);
    if (outlinedFilterId === id) {
      dispatch(setDirectPathToChild([]));
    }
  }, [dispatch, id, outlinedFilterId, isCustomization]);

  const setHoveredFilter = useCallback(() => {
    if (isCustomization) {
      dispatch(setHoveredChartCustomization(id));
    } else {
      dispatchHoverAction(dispatch, id);
    }
  }, [dispatch, id, isCustomization]);

  const unsetHoveredFilter = useCallback(() => {
    if (isCustomization) {
      dispatch(unsetHoveredChartCustomization());
    } else {
      dispatchHoverAction(dispatch);
    }
  }, [dispatch, isCustomization]);

  const hooks = useMemo(
    () => ({
      setDataMask,
      setHoveredFilter,
      unsetHoveredFilter,
      setFocusedFilter,
      unsetFocusedFilter,
      setFilterActive,
      clearAllTrigger,
      onClearAllComplete,
    }),
    [
      setDataMask,
      setFilterActive,
      setHoveredFilter,
      unsetHoveredFilter,
      setFocusedFilter,
      unsetFocusedFilter,
      clearAllTrigger,
      onClearAllComplete,
    ],
  );

  const filterState = useMemo(
    () => ({
      ...filter.dataMask?.filterState,
      validateStatus,
    }),
    [filter.dataMask?.filterState, validateStatus],
  );

  const displaySettings = useMemo(
    () => ({
      filterBarOrientation: orientation,
      isOverflowingFilterBar: overflow,
      matchModeContainer,
      previewSearch,
    }),
    [orientation, overflow, matchModeContainer, previewSearch],
  );

  if (error) {
    return (
      <ErrorMessageWithStackTrace
        error={error.errors?.[0]}
        compact
        fallback={
          <ErrorAlert
            errorType={t('Network error')}
            message={t('Network error while attempting to fetch resource')}
            type="error"
            compact
          />
        }
      />
    );
  }

  return (
    <StyledDiv
      data-test="form-item-value"
      orientation={orientation}
      overflow={overflow}
    >
      {isLoading ? (
        <Loading position="inline-centered" size="s" muted />
      ) : (
        <SuperChart
          height={HEIGHT}
          width={RESPONSIVE_WIDTH}
          showOverflow={showOverflow}
          formData={formData}
          displaySettings={displaySettings}
          parentRef={parentRef}
          inputRef={inputRef}
          // For charts that don't have datasource we need workaround for empty placeholder
          queriesData={hasDataSource ? state : queriesDataPlaceholder}
          chartType={filterType}
          behaviors={behaviors}
          filterState={filterState}
          ownState={filter.dataMask?.ownState}
          enableNoResults={metadata?.enableNoResults}
          isRefreshing={isRefreshing}
          hooks={hooks}
        />
      )}
    </StyledDiv>
  );
};
export default memo(FilterValue);
