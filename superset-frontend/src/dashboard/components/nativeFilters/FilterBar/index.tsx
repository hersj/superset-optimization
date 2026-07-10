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

/* eslint-disable no-param-reassign */
import {
  FC,
  memo,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';

import { useDispatch, useSelector } from 'react-redux';
import {
  DataMaskStateWithId,
  DataMaskWithId,
  Filter,
  Divider,
  DataMask,
  isNativeFilter,
  usePrevious,
  NativeFilterTarget,
  ChartCustomization,
  ChartCustomizationDivider,
} from '@superset-ui/core';
import { styled } from '@apache-superset/core/theme';
import { Constants } from '@superset-ui/core/components';
import { useHistory } from 'react-router-dom';
import {
  updateDataMasks,
  removeDataMask,
} from 'src/dataMask/actions';
import {
  saveChartCustomization,
  clearAllPendingChartCustomizations,
  clearAllChartCustomizationsFromMetadata,
} from 'src/dashboard/actions/chartCustomizationActions';

import { useImmer } from 'use-immer';
import { isEmpty, isEqual, debounce } from 'lodash';
import { getInitialDataMask } from 'src/dataMask/reducer';
import { URL_PARAMS } from 'src/constants';
import { applicationRoot } from 'src/utils/getBootstrapData';
import { getUrlParam } from 'src/utils/urlUtils';
import { useTabId } from 'src/hooks/useTabId';
import { logEvent } from 'src/logger/actions';
import { LOG_ACTIONS_CHANGE_DASHBOARD_FILTER } from 'src/logger/LogUtils';
import { FilterBarOrientation, RootState } from 'src/dashboard/types';
import { UserWithPermissionsAndRoles } from 'src/types/bootstrapTypes';
import { isChartCustomization } from '../FiltersConfigModal/utils';
import { checkIsApplyDisabled, getFiltersToApply } from './utils';
import { extractLabel } from '../selectors';
import { FiltersBarProps } from './types';
import {
  useAllAppliedDataMask,
  useFilters,
  useFilterUpdates,
  useInitialization,
} from './state';
import {
  createFilterKey,
  saveLastFilterValue,
  updateFilterKey,
} from './keyValue';
import ActionButtons from './ActionButtons';
import Horizontal from './Horizontal';
import Vertical from './Vertical';
import {
  useSelectFiltersInScope,
  useChartCustomizationConfiguration,
} from '../state';

// FilterBar is just being hidden as it must still
// render fully due to encapsulated logics
const HiddenFilterBar = styled.div`
  display: none;
`;

const EXCLUDED_URL_PARAMS: string[] = [
  URL_PARAMS.nativeFilters.name,
  URL_PARAMS.permalinkKey.name,
];

const EMPTY_DATA_MASK_RECORD: Record<string, DataMask> = {};

const publishDataMask = debounce(
  async (
    history,
    dashboardId,
    updateKey,
    dataMaskSelected: DataMaskStateWithId,
    tabId,
  ) => {
    const { location } = history;
    const { search } = location;
    const previousParams = new URLSearchParams(search);
    const newParams = new URLSearchParams();
    let dataMaskKey: string | null;
    previousParams.forEach((value, key) => {
      if (!EXCLUDED_URL_PARAMS.includes(key)) {
        newParams.append(key, value);
      }
    });

    const nativeFiltersCacheKey = getUrlParam(URL_PARAMS.nativeFiltersKey);
    const dataMask = JSON.stringify(dataMaskSelected);

    await saveLastFilterValue(dashboardId, dataMask);

    if (
      updateKey &&
      nativeFiltersCacheKey &&
      (await updateFilterKey(
        dashboardId,
        dataMask,
        nativeFiltersCacheKey,
        tabId,
      ))
    ) {
      dataMaskKey = nativeFiltersCacheKey;
    } else {
      dataMaskKey = await createFilterKey(dashboardId, dataMask, tabId);
    }
    if (dataMaskKey) {
      newParams.set(URL_PARAMS.nativeFiltersKey.name, dataMaskKey);
    }

    // pathname could be updated somewhere else through window.history
    // keep react router history in sync with window history
    // replace params only when current page is /superset/dashboard
    // this prevents a race condition between updating filters and navigating to Explore
    if (window.location.pathname.includes('/superset/dashboard')) {
      // The history API is part of React router and understands that a basename may exist.
      // Internally it treats all paths as if they are relative to the root and appends
      // it when necessary. We strip any prefix so that history.replace adds it back and doesn't
      // double it up.
      const appRoot = applicationRoot();
      let replacementPathname = window.location.pathname;
      if (appRoot !== '/' && replacementPathname.startsWith(appRoot)) {
        replacementPathname = replacementPathname.substring(appRoot.length);
      }
      history.replace({
        pathname: replacementPathname,
        search: newParams.toString(),
      });
    }
  },
  Constants.SLOW_DEBOUNCE,
);

export const shouldPublishDataMask = (
  dataMaskText: string,
  lastPublishedDataMaskText: string | null | undefined,
) => dataMaskText !== lastPublishedDataMaskText;

export const shouldPublishAppliedDataMask = ({
  dataMaskText,
  lastPublishedDataMaskText,
  isInitialized,
  hasPublishBaseline,
}: {
  dataMaskText: string;
  lastPublishedDataMaskText: string | null | undefined;
  isInitialized: boolean;
  hasPublishBaseline: boolean;
}) =>
  isInitialized &&
  hasPublishBaseline &&
  shouldPublishDataMask(dataMaskText, lastPublishedDataMaskText);

export const AUTO_APPLY_DEBOUNCE_MS = Constants.SLOW_DEBOUNCE;

export const getDataMaskForRedux = (dataMask: Partial<DataMask>) => {
  const { filterState, ...restDataMask } = dataMask;

  if (!filterState) {
    return dataMask;
  }

  const { validateStatus, ...filterStateForRedux } = filterState;

  return {
    ...restDataMask,
    filterState: filterStateForRedux,
  };
};

const getComparableDataMask = (dataMask: Partial<DataMask> | undefined) => {
  if (!dataMask) {
    return undefined;
  }

  const { id, ...dataMaskForComparison } = getDataMaskForRedux(dataMask) as
    Partial<DataMask> & { id?: string | number };

  return dataMaskForComparison;
};

export const shouldAutoApplyDataMask = (
  selectedDataMask: Partial<DataMask>,
  appliedDataMask: Partial<DataMask> | undefined,
) =>
  !isEqual(
    getComparableDataMask(selectedDataMask),
    getComparableDataMask(appliedDataMask),
  );

export const getAutoApplyDataMaskUpdates = (
  entries: [string, Partial<DataMask>][],
  dataMaskApplied: DataMaskStateWithId,
  inScopeFilterIds: Set<string>,
) =>
  entries.reduce<Record<string, DataMask>>((updates, [filterId, dataMask]) => {
    const dataMaskForRedux = getDataMaskForRedux(dataMask) as DataMask;

    if (
      inScopeFilterIds.has(filterId) &&
      shouldAutoApplyDataMask(dataMaskForRedux, dataMaskApplied[filterId])
    ) {
      updates[filterId] = dataMaskForRedux;
    }

    return updates;
  }, {});

export const createDebouncedDataMaskApplier = (
  apply: (entries: [string, Partial<DataMask>][]) => void,
  delay = AUTO_APPLY_DEBOUNCE_MS,
  setTimer: (
    callback: () => void,
    timeout: number,
  ) => ReturnType<typeof setTimeout> = setTimeout,
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pendingDataMasks = new Map<string, Partial<DataMask>>();

  const clearTimerIfIdle = () => {
    if (pendingDataMasks.size === 0 && timer) {
      clearTimer(timer);
      timer = null;
    }
  };

  const flush = () => {
    const entries = Array.from(pendingDataMasks.entries());
    pendingDataMasks.clear();
    timer = null;
    apply(entries);
  };

  return {
    schedule(filterId: string, dataMask: Partial<DataMask>) {
      pendingDataMasks.set(filterId, dataMask);
      if (timer) {
        clearTimer(timer);
      }
      timer = setTimer(flush, delay);
    },
    clear(filterId: string) {
      pendingDataMasks.delete(filterId);
      clearTimerIfIdle();
    },
    cancel() {
      pendingDataMasks.clear();
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
    },
    flush() {
      if (timer) {
        clearTimer(timer);
      }
      flush();
    },
  };
};

const FilterBar: FC<FiltersBarProps> = ({
  orientation = FilterBarOrientation.Vertical,
  verticalConfig,
  hidden = false,
}) => {
  const history = useHistory();
  const dataMaskApplied: DataMaskStateWithId = useAllAppliedDataMask();

  const [dataMaskSelected, setDataMaskSelected] =
    useImmer<DataMaskStateWithId>(dataMaskApplied);
  const [pendingCustomizationDataMasks, setPendingCustomizationDataMasks] =
    useState<Record<string, DataMask>>(EMPTY_DATA_MASK_RECORD);
  const chartCustomizationValues = useChartCustomizationConfiguration();
  const dispatch = useDispatch();
  const [updateKey, setUpdateKey] = useState(0);
  const tabId = useTabId();
  const filters = useFilters();
  const previousFilters = usePrevious(filters);
  const filterValues = useMemo(
    () => Object.values(filters) as (Filter | Divider)[],
    [filters],
  );
  const nativeFilterValues = useMemo(
    () => filterValues.filter(isNativeFilter),
    [filterValues],
  );
  const dashboardId = useSelector<any, number>(
    ({ dashboardInfo }) => dashboardInfo?.id,
  );
  const previousDashboardId = usePrevious(dashboardId);
  const canEdit = useSelector<RootState, boolean>(
    ({ dashboardInfo }) => dashboardInfo.dash_edit_perm,
  );
  const user: UserWithPermissionsAndRoles = useSelector<
    RootState,
    UserWithPermissionsAndRoles
  >(state => state.user);

  const [filtersInScope] = useSelectFiltersInScope(nativeFilterValues);
  const inScopeFilterIds = useMemo(
    () => new Set(filtersInScope.map(f => f.id)),
    [filtersInScope],
  );

  const hasOutOfScopeRequiredFilters = useMemo(
    () =>
      nativeFilterValues.some(
        filter =>
          !inScopeFilterIds.has(filter.id) &&
          !!filter.controlValues?.enableEmptyFilter,
      ),
    [nativeFilterValues, inScopeFilterIds],
  );

  const [clearAllTriggers, setClearAllTriggers] = useState<
    Record<string, boolean>
  >({});
  const [initializedFilters, setInitializedFilters] = useState<Set<string>>(
    new Set(),
  );
  const [hasClearedChartCustomizations, setHasClearedChartCustomizations] =
    useState(false);
  const isInitialized = useInitialization();

  const dataMaskSelectedRef = useRef(dataMaskSelected);
  dataMaskSelectedRef.current = dataMaskSelected;
  const dataMaskAppliedRef = useRef(dataMaskApplied);
  dataMaskAppliedRef.current = dataMaskApplied;
  const autoApplyHandlerRef = useRef<
    (entries: [string, Partial<DataMask>][]) => void
  >(() => undefined);
  const autoApplyApplierRef =
    useRef<ReturnType<typeof createDebouncedDataMaskApplier>>();

  autoApplyHandlerRef.current = entries => {
    const dataMasksToApply = getAutoApplyDataMaskUpdates(
      entries,
      dataMaskAppliedRef.current,
      inScopeFilterIds,
    );

    if (!isEmpty(dataMasksToApply)) {
      dispatch(updateDataMasks(dataMasksToApply));
    }
  };

  if (!autoApplyApplierRef.current) {
    autoApplyApplierRef.current = createDebouncedDataMaskApplier(
      entries => autoApplyHandlerRef.current(entries),
    );
  }

  useEffect(
    () => () => {
      autoApplyApplierRef.current?.cancel();
    },
    [],
  );

  const handleFilterSelectionChange = useCallback(
    (
      filter: Pick<Filter, 'id'> & Partial<Filter>,
      dataMask: Partial<DataMask>,
    ) => {
      const dataMaskForRedux = getDataMaskForRedux(dataMask);

      if (
        inScopeFilterIds.has(filter.id) &&
        shouldAutoApplyDataMask(
          dataMaskForRedux,
          dataMaskAppliedRef.current[filter.id],
        )
      ) {
        autoApplyApplierRef.current?.schedule(filter.id, dataMaskForRedux);
      } else {
        autoApplyApplierRef.current?.clear(filter.id);
      }

      setDataMaskSelected(draft => {
        // Mark filter as initialized after getting its first value WITH extraFormData
        // This ensures we don't mark it as initialized on the first sync (value but no extraFormData)
        // but do mark it after the second sync (value AND extraFormData)
        if (
          dataMask.filterState?.value !== undefined &&
          dataMask.extraFormData &&
          Object.keys(dataMask.extraFormData).length > 0 &&
          !initializedFilters.has(filter.id)
        ) {
          setInitializedFilters(prev => new Set(prev).add(filter.id));
        }

        const baseDataMask = {
          ...(getInitialDataMask(filter.id) as DataMaskWithId),
          ...dataMask,
        };

        // Recalculate validation status
        const isRequired = !!filter.controlValues?.enableEmptyFilter;
        const value = baseDataMask.filterState?.value;

        const isEmptyValue =
          value == null ||
          (Array.isArray(value) && value.length === 0) ||
          (typeof value === 'string' && value.trim() === '');

        const hasRequiredValue = isRequired && isEmptyValue;

        draft[filter.id] = {
          ...baseDataMask,
          filterState: {
            ...baseDataMask.filterState,
            validateStatus: hasRequiredValue ? 'error' : undefined,
          },
        };
      });
    },
    [
      setDataMaskSelected,
      initializedFilters,
      setInitializedFilters,
      inScopeFilterIds,
    ],
  );

  useEffect(() => {
    if (previousFilters && dashboardId === previousDashboardId) {
      const updates: Record<string, DataMaskWithId> = {};
      Object.values(filters).forEach(currentFilter => {
        const previousFilter = previousFilters?.[currentFilter.id];
        if (!previousFilter) {
          return;
        }
        const currentType = currentFilter.filterType;
        const currentTargets = currentFilter.targets;
        const currentDataMask = currentFilter.defaultDataMask;
        const previousType = previousFilter?.filterType;
        const previousTargets = previousFilter?.targets;
        const previousDataMask = previousFilter?.defaultDataMask;
        const typeChanged = currentType !== previousType;
        const targetsChanged = !isEqual(currentTargets, previousTargets);
        const dataMaskChanged = !isEqual(currentDataMask, previousDataMask);

        if (typeChanged || targetsChanged || dataMaskChanged) {
          updates[currentFilter.id] = getInitialDataMask(
            currentFilter.id,
          ) as DataMaskWithId;
        }
      });

      if (!isEmpty(updates)) {
        setDataMaskSelected(draft => ({ ...draft, ...updates }));
      }
    }
  }, [dashboardId, filters, previousDashboardId, setDataMaskSelected]);

  const dataMaskAppliedText = JSON.stringify(dataMaskApplied);
  const lastPublishedDataMaskTextRef = useRef<string | null>(
    dataMaskAppliedText,
  );
  const hasPublishBaselineRef = useRef(false);
  const prevDataMaskAppliedRef = useRef(dataMaskApplied);

  useEffect(() => {
    const dashboardChanged = dashboardId !== previousDashboardId;

    if (dashboardChanged) {
      setDataMaskSelected(() => dataMaskApplied);
    } else {
      const prevApplied = prevDataMaskAppliedRef.current;

      // Only sync filters whose applied state actually changed
      setDataMaskSelected(prev => {
        let hasChanges = false;
        const updated = { ...prev };

        Object.entries(dataMaskApplied).forEach(([filterId, appliedMask]) => {
          const prevAppliedMask = prevApplied[filterId];
          const appliedChanged = !isEqual(appliedMask, prevAppliedMask);
          const notInitialized = !prev[filterId];

          if (appliedChanged || notInitialized) {
            updated[filterId] = appliedMask;
            hasChanges = true;
          }
        });

        // Remove stale entries that no longer exist in dataMaskApplied
        Object.keys(updated).forEach(filterId => {
          if (
            !isChartCustomization(filterId) &&
            !(filterId in dataMaskApplied)
          ) {
            delete updated[filterId];
            hasChanges = true;
          }
        });

        return hasChanges ? updated : prev;
      });
    }

    prevDataMaskAppliedRef.current = dataMaskApplied;
  }, [dataMaskApplied, setDataMaskSelected, dashboardId, previousDashboardId]);

  useEffect(() => {
    // embedded users can't persist filter combinations
    if (!user?.userId) {
      return;
    }

    if (dashboardId !== previousDashboardId) {
      hasPublishBaselineRef.current = false;
      lastPublishedDataMaskTextRef.current = dataMaskAppliedText;
      return;
    }

    if (!isInitialized || !hasPublishBaselineRef.current) {
      lastPublishedDataMaskTextRef.current = dataMaskAppliedText;
      if (isInitialized) {
        hasPublishBaselineRef.current = true;
      }
      return;
    }

    if (
      shouldPublishAppliedDataMask({
        dataMaskText: dataMaskAppliedText,
        lastPublishedDataMaskText: lastPublishedDataMaskTextRef.current,
        isInitialized,
        hasPublishBaseline: hasPublishBaselineRef.current,
      })
    ) {
      lastPublishedDataMaskTextRef.current = dataMaskAppliedText;
      publishDataMask(history, dashboardId, updateKey, dataMaskApplied, tabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dashboardId,
    dataMaskAppliedText,
    history,
    isInitialized,
    previousDashboardId,
    updateKey,
    tabId,
  ]);

  const pendingChartCustomizations = useSelector<
    RootState,
    Record<string, ChartCustomization> | undefined
  >(state => state.dashboardInfo.pendingChartCustomizations);

  const handlePendingCustomizationDataMaskChange = useCallback(
    (customizationId: string, dataMask: DataMask) => {
      setPendingCustomizationDataMasks(prev => ({
        ...prev,
        [customizationId]: dataMask,
      }));
    },
    [],
  );

  const handleApply = useCallback(() => {
    autoApplyApplierRef.current?.cancel();
    dispatch(logEvent(LOG_ACTIONS_CHANGE_DASHBOARD_FILTER, {}));
    setUpdateKey(1);

    const filtersToApply = getFiltersToApply(
      dataMaskSelected,
      inScopeFilterIds,
    );

    const dataMasksToApply: Record<string, DataMask> = {};
    filtersToApply.forEach(filterId => {
      const dataMask = dataMaskSelected[filterId];
      if (dataMask) {
        dataMasksToApply[filterId] = getDataMaskForRedux(dataMask) as DataMask;
      }
    });

    if (
      pendingCustomizationDataMasks &&
      Object.keys(pendingCustomizationDataMasks).length > 0
    ) {
      Object.entries(pendingCustomizationDataMasks).forEach(
        ([customizationId, dataMask]) => {
          const customizationFilterId = customizationId;
          if (dataMask) {
            dataMasksToApply[customizationFilterId] = dataMask;
          }
        },
      );
    }

    if (!isEmpty(dataMasksToApply)) {
      dispatch(updateDataMasks(dataMasksToApply));
    }

    if (
      pendingChartCustomizations &&
      Object.keys(pendingChartCustomizations).length > 0
    ) {
      const pendingItems = Object.values(pendingChartCustomizations).filter(
        Boolean,
      ) as (ChartCustomization | ChartCustomizationDivider)[];

      if (pendingItems.length > 0) {
        dispatch(saveChartCustomization(pendingItems, []));
      }
      dispatch(clearAllPendingChartCustomizations());
      setPendingCustomizationDataMasks({});
    } else if (hasClearedChartCustomizations) {
      const clearedChartCustomizations = chartCustomizationValues.map(item => ({
        ...item,
        targets: [
          {
            datasetId: item.targets?.[0]?.datasetId,
          },
        ] as [Partial<NativeFilterTarget>],
      }));

      chartCustomizationValues.forEach(item => {
        dispatch(removeDataMask(item.id));
      });

      dispatch(clearAllChartCustomizationsFromMetadata());

      dispatch(saveChartCustomization(clearedChartCustomizations, []));
    }

    setHasClearedChartCustomizations(false);
  }, [
    dataMaskSelected,
    dispatch,
    inScopeFilterIds,
    pendingChartCustomizations,
    pendingCustomizationDataMasks,
    hasClearedChartCustomizations,
    chartCustomizationValues,
  ]);

  const handleClearAll = useCallback(() => {
    autoApplyApplierRef.current?.cancel();
    const newClearAllTriggers = { ...clearAllTriggers };
    const dataMasksToClear: Record<string, DataMask> = {};

    nativeFilterValues.forEach(filter => {
      const { id, filterType } = filter;

      // Only clear in-scope filters
      if (!inScopeFilterIds.has(id)) return;

      // Range filters use [null, null] as the cleared value; others use undefined
      const clearedValue =
        filterType === 'filter_range' ? [null, null] : undefined;
      const clearedDataMask = {
        filterState: { value: clearedValue },
        extraFormData: {},
      };
      if (dataMaskSelected[id]) {
        dataMasksToClear[id] = clearedDataMask;
        setDataMaskSelected(draft => {
          if (draft[id].filterState?.value !== undefined) {
            draft[id].filterState!.value = clearedValue;
          }
          draft[id].extraFormData = {};
        });
        newClearAllTriggers[id] = true;
      }
    });

    if (!isEmpty(dataMasksToClear)) {
      dispatch(updateDataMasks(dataMasksToClear));
    }

    const allDataMasks = { ...dataMaskSelected, ...dataMaskApplied };
    const hasCustomizationDataMasks = Object.keys(allDataMasks).some(key =>
      isChartCustomization(key),
    );
    const hasSavedCustomizations = chartCustomizationValues.some(item => {
      if (item.removed) return false;
      const mask = dataMaskApplied[item.id] || dataMaskSelected[item.id];
      return extractLabel(mask?.filterState) !== null;
    });

    if (hasCustomizationDataMasks || hasSavedCustomizations) {
      chartCustomizationValues.forEach(item => {
        setDataMaskSelected(draft => {
          draft[item.id] = {
            id: item.id,
            filterState: { value: null },
            ownState: { column: null },
            extraFormData: {},
          };
        });
      });

      dispatch(clearAllPendingChartCustomizations());
      setPendingCustomizationDataMasks({});
      setHasClearedChartCustomizations(true);
    }

    setClearAllTriggers(newClearAllTriggers);
  }, [
    dataMaskSelected,
    dataMaskApplied,
    nativeFilterValues,
    inScopeFilterIds,
    setDataMaskSelected,
    chartCustomizationValues,
    clearAllTriggers,
    dispatch,
  ]);

  const handleClearAllComplete = useCallback((filterId: string) => {
    setClearAllTriggers(prev => {
      const newTriggers = { ...prev };
      delete newTriggers[filterId];
      return newTriggers;
    });
  }, []);

  useFilterUpdates(dataMaskSelected, setDataMaskSelected);

  const hasPendingChartCustomizations =
    pendingChartCustomizations &&
    Object.keys(pendingChartCustomizations).length > 0;

  const hasMissingRequiredChartCustomization =
    chartCustomizationValues?.some(item => {
      if (item.removed) return false;

      const required = !!item.controlValues?.enableEmptyFilter;
      if (!required) return false;

      const mask =
        pendingCustomizationDataMasks?.[item.id] || dataMaskSelected[item.id];
      const hasValue = extractLabel(mask?.filterState) !== null;

      return !hasValue;
    }) || false;

  const checkResult = checkIsApplyDisabled(
    dataMaskSelected,
    dataMaskApplied,
    filtersInScope.filter(isNativeFilter),
    nativeFilterValues,
  );

  const isApplyDisabled =
    (checkResult &&
      !hasPendingChartCustomizations &&
      !hasClearedChartCustomizations) ||
    hasMissingRequiredChartCustomization;

  const actions = useMemo(
    () => (
      <ActionButtons
        filterBarOrientation={orientation}
        width={verticalConfig?.width}
        onApply={handleApply}
        onClearAll={handleClearAll}
        dataMaskSelected={dataMaskSelected}
        dataMaskApplied={dataMaskApplied}
        isApplyDisabled={isApplyDisabled}
        chartCustomizationItems={chartCustomizationValues}
        hasOutOfScopeRequiredFilters={hasOutOfScopeRequiredFilters}
      />
    ),
    [
      orientation,
      verticalConfig?.width,
      handleApply,
      handleClearAll,
      dataMaskSelected,
      dataMaskApplied,
      isApplyDisabled,
      chartCustomizationValues,
      hasOutOfScopeRequiredFilters,
    ],
  );

  const filterBarComponent =
    orientation === FilterBarOrientation.Horizontal ? (
      <Horizontal
        actions={actions}
        canEdit={canEdit}
        dashboardId={dashboardId}
        dataMaskSelected={dataMaskSelected}
        filterValues={filterValues}
        chartCustomizationValues={chartCustomizationValues}
        isInitialized={isInitialized}
        onSelectionChange={handleFilterSelectionChange}
        onPendingCustomizationDataMaskChange={
          handlePendingCustomizationDataMaskChange
        }
        clearAllTriggers={clearAllTriggers}
        onClearAllComplete={handleClearAllComplete}
      />
    ) : verticalConfig ? (
      <Vertical
        actions={actions}
        canEdit={canEdit}
        dataMaskSelected={dataMaskSelected}
        filtersOpen={verticalConfig.filtersOpen}
        filterValues={filterValues}
        chartCustomizationValues={chartCustomizationValues}
        isInitialized={isInitialized}
        height={verticalConfig.height}
        offset={verticalConfig.offset}
        onSelectionChange={handleFilterSelectionChange}
        onPendingCustomizationDataMaskChange={
          handlePendingCustomizationDataMaskChange
        }
        toggleFiltersBar={verticalConfig.toggleFiltersBar}
        width={verticalConfig.width}
        clearAllTriggers={clearAllTriggers}
        onClearAllComplete={handleClearAllComplete}
      />
    ) : null;

  return hidden ? (
    <HiddenFilterBar>{filterBarComponent}</HiddenFilterBar>
  ) : (
    filterBarComponent
  );
};
export default memo(FilterBar);
