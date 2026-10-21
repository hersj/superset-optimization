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
import cx from 'classnames';
import { useCallback, useEffect, useRef, useMemo, useState, memo } from 'react';
import type {
  ChartCustomization,
  JsonObject,
  QueryFormMetric,
} from '@superset-ui/core';
import { styled } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import { debounce } from 'lodash';
import { bindActionCreators } from 'redux';
import { useDispatch, useSelector } from 'react-redux';

import { exportChart } from 'src/explore/exploreUtils';
import ChartContainer from 'src/components/Chart/ChartContainer';
import {
  legendStorageKey,
  readLegendState,
  writeLegendState,
} from 'src/dashboard/util/legendStateStorage';
import LastQueriedLabel from 'src/components/LastQueriedLabel';
import {
  StreamingExportModal,
  useStreamingExport,
} from 'src/components/StreamingExportModal';
import {
  LOG_ACTIONS_CHANGE_DASHBOARD_FILTER,
  LOG_ACTIONS_EXPLORE_DASHBOARD_CHART,
  LOG_ACTIONS_EXPORT_CSV_DASHBOARD_CHART,
  LOG_ACTIONS_EXPORT_XLSX_DASHBOARD_CHART,
  LOG_ACTIONS_FORCE_REFRESH_CHART,
} from 'src/logger/LogUtils';
import { DEFAULT_CSV_STREAMING_ROW_THRESHOLD } from 'src/constants';
import { enforceSharedLabelsColorsArray } from 'src/utils/colorScheme';
import exportPivotExcel from 'src/utils/downloadAsPivotExcel';
import type { RootState, Datasource, Slice } from 'src/dashboard/types';
import {
  convertChartStateToOwnState,
  hasChartStateConverter,
} from '../../../util/chartStateConverter';
import { useIsAutoRefreshing } from 'src/dashboard/contexts/AutoRefreshContext';

import SliceHeader from '../../SliceHeader';
import {
  setChartRowLimit,
  saveChartRowLimit,
} from '../../../actions/chartRowLimits';
import MissingChart from '../../MissingChart';

import {
  addDangerToast,
  addSuccessToast,
} from '../../../../components/MessageToasts/actions';
import {
  setFocusedFilterField,
  toggleExpandSlice,
  unsetFocusedFilterField,
  updateChartState,
} from '../../../actions/dashboardState';
import {
  editPivotTemplateLibrary,
  setPivotTemplateLibrary,
  mergeDashboardPivotLayout,
  setPersonalChartTemplateActiveSlot,
  type PersonalChartLayout,
  type PersonalChartTemplate,
  upsertPersonalChartLayout,
} from '../../../actions/personalChartLayout';
import { changeFilter } from '../../../actions/dashboardFilters';
import {
  refreshChart,
  triggerQuery,
} from '../../../../components/Chart/chartAction';
import { logEvent } from '../../../../logger/actions';
import {
  getActiveFilters,
  getAppliedFilterValues,
} from '../../../util/activeDashboardFilters';
import getFormDataWithExtraFilters from '../../../util/charts/getFormDataWithExtraFilters';
import {
  DEFAULT_DASHBOARD_CHART_CONTROLS,
  getDashboardChartExtraControls,
} from '../../../util/charts/getDashboardChartControls';
import { useChartCustomizationFromRedux } from '../../nativeFilters/state';
import { PLACEHOLDER_DATASOURCE } from '../../../constants';
import {
  buildMetricDescriptors,
  PIVOT_METRIC_LAYOUT_VERSION,
  reconcileMetricLayout,
} from '../../../../../plugins/plugin-chart-pivot-table/src/metricLayout';

interface ChartProps {
  id: number;
  componentId: string;
  dashboardId: number;
  width: number;
  height: number;
  updateSliceName: (sliceId: number, name: string) => void;
  isComponentVisible?: boolean;
  handleToggleFullSize: () => void;
  setControlValue?: (controlName: string, value: unknown) => void;
  sliceName: string;
  isFullSize?: boolean;
  extraControls?: JsonObject;
  isInView?: boolean;
  cacheBusterProp?: string | number;
}

const RESIZE_TIMEOUT = 500;
const DEFAULT_HEADER_HEIGHT = 22;
const QUERIED_LABEL_HEIGHT = 24;

const ChartWrapper = styled.div`
  overflow: hidden;
  position: relative;

  &.dashboard-chart--overflowable {
    overflow: visible;
  }
`;

const ChartOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  z-index: 5;
`;

const SliceContainer = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 100%;
`;

const EMPTY_OBJECT: Record<string, never> = {};

/**
 * 功能审计（可重写规格）：判断看板开关是否已经反映到最近一次图表查询
 * - 功能目的与触发方式：比较当前派生 formData 与图表最近一次查询使用的三个显示相关字段，补足首次 hydrate 或图表配置晚到时遗漏的重新查询。
 * - 输入契约：formData 与 latestQueryFormData 可为空；time_compare 可为字符串、字符串数组、空数组或未定义；show_value/show_valueB 可为布尔值或未定义。
 * - 输出契约：返回稳定字符串；相同的有效时间对比和数字显示设置必须得到相同结果。
 * - 处理流程：优先读取 extra_form_data.time_compare，再读取顶层 time_compare；把单值归一为数组，并与两个数字显示字段组合。
 * - 业务规则：空数组表示关闭对比；show_valueB 缺失时不人为补值；只比较会被看板级开关覆盖的字段，不把普通筛选变化混入本判断。
 * - 状态与副作用：纯函数，不发请求、不写 Redux、不写存储。
 * - 外部依赖：依赖图表 formData 的顶层与嵌套时间对比字段约定。
 * - 异常与边界：null、undefined 和非数组时间偏移均安全归一；未知 formData 字段忽略。
 * - 不变量与约束：不能把保存的 1 day ago 误判为关闭后的有效值；相同输入在刷新期间不得产生变化。
 * - 验证方式：Chart 组件测试覆盖开关已关闭但最近查询仍带时间对比的首次加载顺序。
 */
const getDashboardChartControlQuerySignature = (
  formData?: JsonObject,
): string => {
  const extraFormData = formData?.extra_form_data as JsonObject | undefined;
  const timeCompare = extraFormData?.time_compare ?? formData?.time_compare;
  const normalizedTimeCompare = Array.isArray(timeCompare)
    ? timeCompare
    : timeCompare == null
      ? []
      : [timeCompare];

  return JSON.stringify({
    timeCompare: normalizedTimeCompare,
    showValue: formData?.show_value,
    showValueB: formData?.show_valueB,
  });
};

// Helper function to get chart state with fallback
const getChartStateWithFallback = (
  chartState: { state?: JsonObject } | undefined,
  formData: JsonObject,
  vizType: string,
): JsonObject | null => {
  if (!hasChartStateConverter(vizType)) {
    return null;
  }

  return (
    chartState?.state || formData.table_state || formData.pivot_table_state
  );
};

// Helper function to create own state with chart state conversion
const createOwnStateWithChartState = (
  baseOwnState: JsonObject,
  chartState: { state?: JsonObject } | undefined,
  vizType: string,
): JsonObject => {
  const state = getChartStateWithFallback(chartState, {}, vizType);

  if (!state) {
    return baseOwnState;
  }

  const convertedState = convertChartStateToOwnState(vizType, state);
  return {
    ...baseOwnState,
    ...convertedState,
    chartState: state,
  };
};

const Chart = (props: ChartProps) => {
  const dispatch = useDispatch();
  const descriptionRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const boundActionCreators = useMemo(
    () =>
      bindActionCreators(
        {
          addSuccessToast,
          addDangerToast,
          toggleExpandSlice,
          changeFilter,
          setFocusedFilterField,
          unsetFocusedFilterField,
          refreshChart,
          logEvent,
        },
        dispatch,
      ),
    [dispatch],
  );

  const chart = useSelector((state: RootState) => state.charts[props.id]);
  const queriesResponse = chart?.queriesResponse;
  const chartUpdateEndTime = chart?.chartUpdateEndTime;
  const chartStatus = chart?.chartStatus;
  const annotationQuery = chart?.annotationQuery;

  const slice: Slice | Record<string, never> = useSelector(
    (state: RootState) => state.sliceEntities.slices[props.id] || EMPTY_OBJECT,
  );
  const sliceVizType = slice.viz_type;
  const sliceSliceId = slice.slice_id;
  const sliceSliceName = slice.slice_name;
  const editMode = useSelector(
    (state: RootState) => state.dashboardState.editMode,
  );
  const isExpanded = useSelector(
    (state: RootState) =>
      !!(state.dashboardState as JsonObject).expandedSlices?.[props.id],
  );
  const supersetCanExplore = useSelector(
    (state: RootState) =>
      !!(state.dashboardInfo as JsonObject).superset_can_explore,
  );
  const supersetCanShare = useSelector(
    (state: RootState) =>
      !!(state.dashboardInfo as JsonObject).superset_can_share,
  );
  const supersetCanCSV = useSelector(
    (state: RootState) =>
      !!(state.dashboardInfo as JsonObject).superset_can_csv,
  );
  const timeout: number = useSelector(
    (state: RootState) =>
      state.dashboardInfo.common.conf.SUPERSET_WEBSERVER_TIMEOUT as number,
  );
  const emitCrossFilters = useSelector(
    (state: RootState) => !!state.dashboardInfo.crossFiltersEnabled,
  );
  const maxRows: number = useSelector(
    (state: RootState) => state.dashboardInfo.common.conf.SQL_MAX_ROW as number,
  );
  const streamingThreshold: number = useSelector(
    (state: RootState) =>
      (state.dashboardInfo.common.conf.CSV_STREAMING_ROW_THRESHOLD as number) ||
      DEFAULT_CSV_STREAMING_ROW_THRESHOLD,
  );
  const datasource: Datasource = useSelector(
    (state: RootState) =>
      (chart?.form_data?.datasource &&
        state.datasources[chart.form_data.datasource]) ||
      PLACEHOLDER_DATASOURCE,
  );
  const dashboardInfo = useSelector((state: RootState) => state.dashboardInfo);
  const showChartTimestamps: boolean = useSelector(
    (state: RootState) =>
      (state.dashboardInfo?.metadata as JsonObject)?.show_chart_timestamps ??
      false,
  );
  const suppressLoadingSpinner = useIsAutoRefreshing();

  const isCached: boolean[] = useMemo(
    () =>
      queriesResponse?.map(
        // eslint-disable-next-line camelcase
        (q: JsonObject) => q.is_cached as boolean,
      ) || [],
    [queriesResponse],
  );

  const [descriptionHeight, setDescriptionHeight] = useState(0);
  const [height, setHeight] = useState(props.height);
  const [width, setWidth] = useState(props.width);
  const [isSavingPersonalChartLayout, setIsSavingPersonalChartLayout] =
    useState(false);

  const userId = useSelector((state: RootState) => state.user?.userId);
  const legendKey = legendStorageKey(userId, props.dashboardId, props.id);
  const [rememberedLegend, setRememberedLegend] = useState(() => ({
    key: legendKey,
    state: readLegendState(legendKey),
  }));
  // A new owner must restore its own state before ChartRenderer mounts.
  const legendState =
    rememberedLegend.key === legendKey
      ? rememberedLegend.state
      : readLegendState(legendKey);
  const rememberLegendState = useCallback(
    (state: Record<string, boolean>) => {
      setRememberedLegend({ key: legendKey, state });
      writeLegendState(legendKey, state);
    },
    [legendKey],
  );

  const [isStreamingModalVisible, setIsStreamingModalVisible] = useState(false);
  const { progress, startExport, cancelExport, resetExport, retryExport } =
    useStreamingExport({
      onComplete: () => {
        // Don't show toast here - wait for user to click Download button
      },
      onError: () => {
        boundActionCreators.addDangerToast(
          t('Export failed - please try again'),
        );
      },
    });

  const handleDownloadComplete = useCallback(() => {
    boundActionCreators.addSuccessToast(t('CSV file downloaded successfully'));
  }, [boundActionCreators]);
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const resize = useCallback(
    debounce(() => {
      const { width, height } = props;
      setHeight(height);
      setWidth(width);
    }, RESIZE_TIMEOUT),
    [props.width, props.height],
  );

  const ownColorScheme = chart?.form_data?.color_scheme as string | undefined;

  const addFilter = useCallback(
    (col: string, vals: unknown[], merge = true, _refresh = true) => {
      boundActionCreators.logEvent(LOG_ACTIONS_CHANGE_DASHBOARD_FILTER, {
        id: chart?.id,
        columns: vals !== null ? [col] : [],
      });
      boundActionCreators.changeFilter(chart?.id, { [col]: vals }, merge);
    },
    [boundActionCreators.logEvent, boundActionCreators.changeFilter, chart?.id],
  );

  // Chart state handler for stateful charts
  const handleChartStateChange = useCallback(
    (chartStateArg: JsonObject) => {
      if (hasChartStateConverter(sliceVizType)) {
        dispatch(
          updateChartState(
            props.id,
            sliceVizType,
            chartStateArg as unknown as import('@superset-ui/core').AgGridChartState,
          ),
        );
      }
    },
    [dispatch, props.id, sliceVizType],
  );

  useEffect(() => {
    if (isExpanded) {
      const descHeight =
        isExpanded && descriptionRef.current
          ? descriptionRef.current?.offsetHeight
          : 0;
      setDescriptionHeight(descHeight);
    } else {
      setDescriptionHeight(0);
    }
  }, [isExpanded]);

  useEffect(
    () => () => {
      resize.cancel();
    },
    [resize],
  );

  useEffect(() => {
    resize();
  }, [resize, props.isFullSize]);

  const getHeaderHeight = useCallback((): number => {
    if (headerRef.current) {
      const computedMarginBottom = getComputedStyle(
        headerRef.current,
      ).getPropertyValue('margin-bottom');
      const marginBottom = parseInt(computedMarginBottom, 10) || 0;
      const computedHeight = getComputedStyle(
        headerRef.current,
      ).getPropertyValue('height');
      const headerHeight =
        parseInt(computedHeight, 10) || DEFAULT_HEADER_HEIGHT;
      return headerHeight + marginBottom;
    }
    return DEFAULT_HEADER_HEIGHT;
  }, [headerRef]);

  const queriedDttm: string | null = Array.isArray(queriesResponse)
    ? (((queriesResponse[queriesResponse.length - 1] as JsonObject)
        ?.queried_dttm as string | null) ?? null)
    : null;

  const getChartHeight = useCallback((): number => {
    const headerHeight = getHeaderHeight();
    const queriedLabelHeight =
      showChartTimestamps && queriedDttm != null ? QUERIED_LABEL_HEIGHT : 0;
    return Math.max(
      height - headerHeight - descriptionHeight - queriedLabelHeight,
      20,
    );
  }, [
    getHeaderHeight,
    height,
    descriptionHeight,
    queriedDttm,
    showChartTimestamps,
  ]);

  const handleFilterMenuOpen = useCallback(
    (chartId: number, column: string) => {
      boundActionCreators.setFocusedFilterField(chartId, column);
    },
    [boundActionCreators.setFocusedFilterField],
  );

  const handleFilterMenuClose = useCallback(
    (chartId: number, column: string) => {
      boundActionCreators.unsetFocusedFilterField(chartId, column);
    },
    [boundActionCreators.unsetFocusedFilterField],
  );

  const logExploreChart = useCallback(() => {
    boundActionCreators.logEvent(LOG_ACTIONS_EXPLORE_DASHBOARD_CHART, {
      slice_id: sliceSliceId,
      is_cached: isCached,
    });
  }, [boundActionCreators.logEvent, sliceSliceId, isCached]);

  const chartConfiguration = useSelector(
    (state: RootState) => state.dashboardInfo.metadata?.chart_configuration,
  );
  const chartCustomizationItems = useChartCustomizationFromRedux();
  const colorScheme = useSelector(
    (state: RootState) => state.dashboardState.colorScheme,
  );
  const colorNamespace = useSelector(
    (state: RootState) =>
      (state.dashboardState as JsonObject).colorNamespace as string | undefined,
  );
  const datasetsStatus = useSelector(
    (state: RootState) =>
      (state.dashboardState as JsonObject).datasetsStatus as string | undefined,
  );
  const allSliceIds = useSelector(
    (state: RootState) => state.dashboardState.sliceIds,
  );
  const nativeFilters = useSelector(
    (state: RootState) => state.nativeFilters?.filters,
  );
  const dataMask = useSelector((state: RootState) => state.dataMask);
  const chartState = useSelector(
    (state: RootState) => state.dashboardState.chartStates?.[props.id],
  );
  const personalChartLayout = useSelector(
    (state: RootState) => state.dashboardState.personalChartLayouts?.[props.id],
  ) as PersonalChartLayout | undefined;
  const library = useSelector(
    (state: RootState) => state.dashboardState.pivotTemplateLibrary,
  );
  const dashboardPivotLayout = library?.legacy_layout;
  const legacyChartTemplates = useSelector(
    (state: RootState) =>
      state.dashboardState.personalChartTemplates?.[props.id],
  ) as PersonalChartTemplate[] | undefined;
  const personalChartTemplates = library?.templates || [];
  const personalChartTemplateActiveSlot = useSelector(
    (state: RootState) =>
      state.dashboardState.personalChartTemplateActiveSlots?.[props.id],
  ) as 1 | 2 | 3 | null | undefined;
  const labelsColor: JsonObject = useSelector(
    (state: RootState) =>
      state.dashboardInfo?.metadata?.label_colors || EMPTY_OBJECT,
  );
  const labelsColorMap: JsonObject = useSelector(
    (state: RootState) =>
      state.dashboardInfo?.metadata?.map_label_colors || EMPTY_OBJECT,
  );
  const sharedLabelsColors = useSelector((state: RootState) =>
    enforceSharedLabelsColorsArray(
      state.dashboardInfo?.metadata?.shared_label_colors,
    ),
  );
  const dashboardChartControls = useSelector(
    (state: RootState) =>
      state.dashboardState.dashboardChartControls ||
      DEFAULT_DASHBOARD_CHART_CONTROLS,
  );
  const chartRowLimits = useSelector(
    (state: RootState) => state.dashboardState.chartRowLimits,
  );
  const rowLimit = chartRowLimits?.[props.id];
  const [isSavingRowLimit, setIsSavingRowLimit] = useState(false);
  const applyRowLimit = useCallback(
    async (value: number | null) => {
      setIsSavingRowLimit(true);
      try {
        await saveChartRowLimit(props.dashboardId, props.id, value);
        dispatch(setChartRowLimit(props.id, value));
      } catch {
        boundActionCreators.addDangerToast(
          t('Unable to save row limit. Please try again.'),
        );
      } finally {
        setIsSavingRowLimit(false);
      }
    },
    [props.dashboardId, props.id, dispatch, boundActionCreators.addDangerToast],
  );
  const previousDashboardChartControls = useRef(dashboardChartControls);
  const lastRequestedDashboardChartControlSignature = useRef<string | null>(
    null,
  );

  // 看板级开关只在图表 formData 入口覆盖显示字段，不修改图表实体或看板保存数据。
  const chartExtraControls = useMemo(
    () => ({
      ...(props.extraControls || {}),
      ...getDashboardChartExtraControls(
        dashboardChartControls,
        chart?.form_data as JsonObject | undefined,
      ),
    }),
    [chart?.form_data, dashboardChartControls, props.extraControls],
  );

  const formData = useMemo(
    () =>
      getFormDataWithExtraFilters({
        chart: { id: chart?.id ?? props.id, form_data: chart?.form_data }, // avoid passing the whole chart object
        chartConfiguration,
        chartCustomizationItems:
          chartCustomizationItems as ChartCustomization[],
        filters: getAppliedFilterValues(props.id),
        colorScheme,
        colorNamespace,
        sliceId: props.id,
        nativeFilters,
        allSliceIds,
        dataMask,
        extraControls: chartExtraControls as Record<
          string,
          string | boolean | null
        >,
        labelsColor,
        labelsColorMap,
        sharedLabelsColors,
        ownColorScheme,
        rowLimit,
      }),
    [
      chart?.id,
      chart?.form_data,
      chartConfiguration,
      chartCustomizationItems,
      props.id,
      chartExtraControls,
      colorScheme,
      colorNamespace,
      nativeFilters,
      allSliceIds,
      dataMask,
      labelsColor,
      labelsColorMap,
      sharedLabelsColors,
      ownColorScheme,
      rowLimit,
    ],
  );

  const dashboardChartControlQuerySignature = JSON.stringify([
    getDashboardChartControlQuerySignature(formData as JsonObject),
    (formData as JsonObject).row_limit,
    (formData as JsonObject).row_limit_b,
  ]);
  const latestQueryChartControlSignature = JSON.stringify([
    getDashboardChartControlQuerySignature(
      chart?.latestQueryFormData as JsonObject | undefined,
    ),
    chart?.latestQueryFormData?.row_limit,
    chart?.latestQueryFormData?.row_limit_b,
  ]);
  const latestQueryFormData = chart?.latestQueryFormData as
    | JsonObject
    | undefined;
  const latestQueryExtraFormData = latestQueryFormData?.extra_form_data as
    | JsonObject
    | undefined;
  const latestQueryHasDashboardChartControls =
    ['time_compare', 'show_value', 'show_valueB', 'row_limit'].some(field =>
      Object.prototype.hasOwnProperty.call(latestQueryFormData || {}, field),
    ) ||
    Object.prototype.hasOwnProperty.call(
      latestQueryExtraFormData || {},
      'time_compare',
    );
  const dashboardChartControlQueryMismatch =
    latestQueryHasDashboardChartControls &&
    dashboardChartControlQuerySignature !== latestQueryChartControlSignature;

  // Display controls and personal row limits share the existing query trigger.
  // Compare with the last submitted form so hydration and rapid changes cannot
  // leave auto-refresh using a stale limit; deduplicate until Redux catches up.
  useEffect(() => {
    const controlsChanged =
      previousDashboardChartControls.current !== dashboardChartControls;
    previousDashboardChartControls.current = dashboardChartControls;

    if (chart?.triggerQuery) {
      return;
    }
    if (!controlsChanged && !dashboardChartControlQueryMismatch) {
      lastRequestedDashboardChartControlSignature.current = null;
      return;
    }
    if (
      !controlsChanged &&
      lastRequestedDashboardChartControlSignature.current ===
        dashboardChartControlQuerySignature
    ) {
      return;
    }

    lastRequestedDashboardChartControlSignature.current =
      dashboardChartControlQuerySignature;
    dispatch(triggerQuery(true, props.id));
  }, [
    chart?.triggerQuery,
    dashboardChartControlQueryMismatch,
    dashboardChartControlQuerySignature,
    dashboardChartControls,
    dispatch,
    props.id,
  ]);

  (formData as JsonObject).dashboardId = dashboardInfo.id;

  const chartOwnState = useMemo(() => {
    const baseOwnState =
      (dataMask[props.id]?.ownState as JsonObject) || EMPTY_OBJECT;
    const ownStateWithChartState = createOwnStateWithChartState(
      baseOwnState,
      {
        state:
          getChartStateWithFallback(
            chartState as { state?: JsonObject } | undefined,
            formData as JsonObject,
            slice.viz_type,
          ) ?? undefined,
      },
      slice.viz_type,
    );

    const activeLayout = personalChartLayout || dashboardPivotLayout;
    return activeLayout && slice.viz_type === 'pivot_table_v2'
      ? {
          ...ownStateWithChartState,
          pivot_table_metric_layout: activeLayout,
          pivot_table_metric_layout_scope: 'dashboard',
        }
      : ownStateWithChartState;
  }, [
    chartState,
    dataMask,
    dashboardPivotLayout,
    formData,
    personalChartLayout,
    props.id,
    slice.viz_type,
  ]);

  const exportTable = useCallback(
    (format: string, isFullCSV: boolean, isPivot = false) => {
      const logAction =
        format === 'csv'
          ? LOG_ACTIONS_EXPORT_CSV_DASHBOARD_CHART
          : LOG_ACTIONS_EXPORT_XLSX_DASHBOARD_CHART;
      boundActionCreators.logEvent(logAction, {
        slice_id: sliceSliceId,
        is_cached: isCached,
      });

      const exportFormData = isFullCSV
        ? { ...formData, row_limit: maxRows }
        : formData;
      const resultType = isPivot ? 'post_processed' : 'full';

      let actualRowCount: number | undefined;
      const isTableViz = (formData as JsonObject)?.viz_type === 'table';

      if (
        isTableViz &&
        queriesResponse &&
        queriesResponse.length > 1 &&
        (queriesResponse[1] as JsonObject)?.data?.[0]?.rowcount
      ) {
        actualRowCount = (
          (queriesResponse[1] as JsonObject).data as JsonObject[]
        )[0].rowcount as number;
      } else if ((queriesResponse?.[0] as JsonObject)?.sql_rowcount != null) {
        actualRowCount = (queriesResponse![0] as JsonObject)
          .sql_rowcount as number;
      } else if ((queriesResponse?.[0] as JsonObject)?.rowcount != null) {
        actualRowCount = (queriesResponse![0] as JsonObject).rowcount as number;
      } else {
        actualRowCount = (exportFormData as JsonObject)?.row_limit as
          | number
          | undefined;
      }

      // Handle streaming CSV exports based on row threshold
      const shouldUseStreaming =
        format === 'csv' &&
        !isPivot &&
        actualRowCount !== undefined &&
        actualRowCount >= streamingThreshold;
      let filename: string | undefined;
      if (shouldUseStreaming) {
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toISOString().slice(11, 19).replace(/:/g, '');
        const timestamp = `_${date}_${time}`;
        const chartName =
          sliceSliceName || (formData as JsonObject).viz_type || 'chart';
        const safeChartName = (chartName as string).replace(
          /[^a-zA-Z0-9_-]/g,
          '_',
        );
        filename = `${safeChartName}${timestamp}.csv`;
      }
      exportChart({
        formData:
          exportFormData as unknown as import('@superset-ui/core').QueryFormData,
        resultType,
        resultFormat: format,
        force: true,
        ownState: chartOwnState,
        onStartStreamingExport: shouldUseStreaming
          ? (exportParams: JsonObject) => {
              setIsStreamingModalVisible(true);
              startExport({
                ...(exportParams as Record<string, unknown>),
                filename,
                expectedRows: actualRowCount,
              } as Parameters<typeof startExport>[0]);
            }
          : null,
      });
    },
    [
      sliceSliceId,
      isCached,
      formData,
      maxRows,
      boundActionCreators.logEvent,
      queriesResponse,
      startExport,
      resetExport,
      streamingThreshold,
      chartOwnState,
    ],
  );

  const exportCSV = useCallback(() => {
    exportTable('csv', false);
  }, [exportTable]);

  const exportFullCSV = useCallback(() => {
    exportTable('csv', true);
  }, [exportTable]);

  const exportPivotCSV = useCallback(() => {
    exportTable('csv', false, true);
  }, [exportTable]);

  const exportXLSX = useCallback(() => {
    exportTable('xlsx', false);
  }, [exportTable]);

  const exportFullXLSX = useCallback(() => {
    exportTable('xlsx', true);
  }, [exportTable]);

  const forceRefresh = useCallback(() => {
    boundActionCreators.logEvent(LOG_ACTIONS_FORCE_REFRESH_CHART, {
      slice_id: sliceSliceId,
      is_cached: isCached,
    });
    return boundActionCreators.refreshChart(
      chart?.id ?? props.id,
      true,
      props.dashboardId,
    );
  }, [
    boundActionCreators.refreshChart,
    chart?.id,
    props.dashboardId,
    sliceSliceId,
    isCached,
    boundActionCreators.logEvent,
  ]);

  const normalizeTemplateLayout = useCallback(
    (layout: PersonalChartLayout) => {
      const metricDescriptors = buildMetricDescriptors(
        ((formData as JsonObject).metrics || []) as QueryFormMetric[],
      );
      const reconciled = reconcileMetricLayout(metricDescriptors, layout, {
        includeMissingMetrics: true,
      });
      return {
        ordered_metric_ids: reconciled.orderedMetricIds,
        hidden_metric_ids: reconciled.hiddenMetricIds,
        frozen_column_count: layout.frozen_column_count || 0,
        ...(layout.frozen_column_key !== undefined
          ? { frozen_column_key: layout.frozen_column_key }
          : {}),
        version: PIVOT_METRIC_LAYOUT_VERSION,
      };
    },
    [formData],
  );

  const applyPersonalChartLayout = useCallback(
    async (layout: PersonalChartLayout | null, slot: 1 | 2 | 3 | null) => {
      const appliedLayout = layout || {
        ...normalizeTemplateLayout({
          version: 1,
          ordered_metric_ids: [],
          hidden_metric_ids: [],
          frozen_column_key: null,
        }),
        hidden_metric_ids: [],
      };
      const selection = layout ? slot : 'system-default';
      setIsSavingPersonalChartLayout(true);
      try {
        const updated = await editPivotTemplateLibrary(props.dashboardId, {
          action: 'apply',
          chart_id: props.id,
          layout: appliedLayout,
          selection,
        });
        dispatch(setPivotTemplateLibrary(updated));
        dispatch(upsertPersonalChartLayout(props.id, appliedLayout));
        dispatch(setPersonalChartTemplateActiveSlot(props.id, selection));
      } catch {
        boundActionCreators.addDangerToast(t('个人列布局保存失败，请重试'));
        throw new Error('个人列布局保存失败');
      } finally {
        setIsSavingPersonalChartLayout(false);
      }
    },
    [
      boundActionCreators,
      dispatch,
      normalizeTemplateLayout,
      props.dashboardId,
      props.id,
    ],
  );

  const savePersonalChartTemplate = useCallback(
    async (slot: 1 | 2 | 3, name: string, layout: PersonalChartLayout) => {
      const normalizedLayout = normalizeTemplateLayout(layout);
      setIsSavingPersonalChartLayout(true);
      try {
        const updated = await editPivotTemplateLibrary(props.dashboardId, {
          action: 'save',
          slot,
          template: {
            name,
            layout: mergeDashboardPivotLayout(
              library?.templates.find(item => item.slot === slot)?.layout,
              normalizedLayout,
            ),
          },
        });
        dispatch(setPivotTemplateLibrary(updated));
        boundActionCreators.addSuccessToast(t('个人列模板已保存'));
      } catch {
        boundActionCreators.addDangerToast(t('个人列模板保存失败'));
        throw new Error('个人列模板保存失败');
      } finally {
        setIsSavingPersonalChartLayout(false);
      }
    },
    [
      boundActionCreators,
      dispatch,
      normalizeTemplateLayout,
      library,
      props.dashboardId,
      props.id,
    ],
  );

  const setPersonalChartTemplateDefault = useCallback(
    async (slot: 1 | 2 | 3) => {
      setIsSavingPersonalChartLayout(true);
      try {
        const updated = await editPivotTemplateLibrary(props.dashboardId, {
          action: 'default',
          slot,
          chart_id: props.id,
        });
        dispatch(setPivotTemplateLibrary(updated));
        boundActionCreators.addSuccessToast(t('个人默认模板已保存'));
      } catch {
        boundActionCreators.addDangerToast(t('设为个人默认模板失败'));
        throw new Error('设为个人默认模板失败');
      } finally {
        setIsSavingPersonalChartLayout(false);
      }
    },
    [boundActionCreators, dispatch, props.dashboardId, props.id],
  );

  const deletePersonalChartTemplate = useCallback(
    async (slot: 1 | 2 | 3) => {
      setIsSavingPersonalChartLayout(true);
      try {
        const updated = await editPivotTemplateLibrary(props.dashboardId, {
          action: 'delete',
          slot,
        });
        dispatch(setPivotTemplateLibrary(updated));
        boundActionCreators.addSuccessToast(t('个人列模板已删除'));
      } catch {
        boundActionCreators.addDangerToast(t('个人列模板删除失败'));
        throw new Error('个人列模板删除失败');
      } finally {
        setIsSavingPersonalChartLayout(false);
      }
    },
    [boundActionCreators, dispatch, props.dashboardId, props.id],
  );

  if (!chart || (slice as unknown) === EMPTY_OBJECT) {
    return <MissingChart height={getChartHeight()} />;
  }

  const isLoading = chartStatus === 'loading';
  const cachedDttm: string[] =
    queriesResponse?.map(
      // eslint-disable-next-line camelcase
      (q: JsonObject) => q.cached_dttm as string,
    ) || [];

  // Build slice header shape matching SliceHeaderControlsProps
  const sliceForHeader = {
    description: slice.description || '',
    viz_type: slice.viz_type,
    slice_name: slice.slice_name,
    slice_id: slice.slice_id,
    slice_description: '',
    datasource: slice.form_data?.datasource || '',
  };

  return (
    <SliceContainer
      className="chart-slice"
      data-test="chart-grid-component"
      data-test-chart-id={props.id}
      data-test-viz-type={slice.viz_type}
      data-test-chart-name={slice.slice_name}
    >
      <SliceHeader
        ref={headerRef}
        slice={sliceForHeader}
        isExpanded={isExpanded}
        isCached={isCached as boolean[]}
        cachedDttm={cachedDttm as string[]}
        queriedDttm={queriedDttm as string | null | undefined}
        updatedDttm={chartUpdateEndTime ?? null}
        toggleExpandSlice={boundActionCreators.toggleExpandSlice}
        forceRefresh={forceRefresh}
        editMode={editMode}
        annotationQuery={annotationQuery}
        logExploreChart={logExploreChart}
        logEvent={boundActionCreators.logEvent}
        exportCSV={exportCSV}
        exportPivotCSV={exportPivotCSV}
        exportXLSX={exportXLSX}
        exportFullCSV={exportFullCSV}
        exportFullXLSX={exportFullXLSX}
        updateSliceName={(name: string) =>
          props.updateSliceName(props.id, name)
        }
        sliceName={props.sliceName}
        supersetCanExplore={supersetCanExplore}
        supersetCanShare={supersetCanShare}
        supersetCanCSV={supersetCanCSV}
        componentId={props.componentId}
        dashboardId={props.dashboardId}
        filters={getActiveFilters() || EMPTY_OBJECT}
        addSuccessToast={boundActionCreators.addSuccessToast}
        addDangerToast={boundActionCreators.addDangerToast}
        handleToggleFullSize={props.handleToggleFullSize}
        isFullSize={props.isFullSize}
        chartStatus={chartStatus || ''}
        formData={
          formData as unknown as import('@superset-ui/core').QueryFormData
        }
        exploreUrl=""
        width={width}
        height={getHeaderHeight()}
        exportPivotExcel={exportPivotExcel as unknown as (arg0: string) => void}
        defaultRowLimit={Number(chart?.form_data?.row_limit ?? 10000)}
        personalRowLimit={rowLimit}
        onRowLimitChange={
          chart?.form_data &&
          Object.prototype.hasOwnProperty.call(chart.form_data, 'row_limit') &&
          !chart.form_data.server_pagination
            ? applyRowLimit
            : undefined
        }
        isRowLimitDisabled={chartRowLimits == null || isSavingRowLimit}
        personalChartLayout={
          personalChartLayout || dashboardPivotLayout || undefined
        }
        legacyChartTemplates={legacyChartTemplates}
        personalChartTemplates={personalChartTemplates}
        personalChartTemplateActiveSlot={personalChartTemplateActiveSlot}
        onApplyPersonalChartLayout={applyPersonalChartLayout}
        onSavePersonalChartTemplate={savePersonalChartTemplate}
        onSetPersonalChartTemplateDefault={setPersonalChartTemplateDefault}
        onDeletePersonalChartTemplate={deletePersonalChartTemplate}
        isSavingPersonalChartLayout={isSavingPersonalChartLayout || !library}
      />

      {/*
          This usage of dangerouslySetInnerHTML is safe since it is being used to render
          markdown that is sanitized with nh3. See:
             https://github.com/apache/superset/pull/4390
          and
             https://github.com/apache/superset/pull/23862
        */}
      {isExpanded && slice.description_markdown && (
        <div
          className="slice_description bs-callout bs-callout-default"
          ref={descriptionRef}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: slice.description_markdown,
          }}
          role="complementary"
        />
      )}

      <ChartWrapper
        className={cx('dashboard-chart')}
        aria-label={slice.description}
      >
        {isLoading && !suppressLoadingSpinner && (
          <ChartOverlay
            style={{
              width,
              height: getChartHeight(),
            }}
          />
        )}

        <ChartContainer
          key={legendKey}
          width={width}
          height={getChartHeight()}
          addFilter={addFilter}
          onFilterMenuOpen={handleFilterMenuOpen}
          onFilterMenuClose={handleFilterMenuClose}
          annotationData={chart.annotationData ?? undefined}
          chartAlert={chart.chartAlert ?? undefined}
          chartId={props.id}
          chartStatus={chartStatus ?? undefined}
          datasource={datasource}
          dashboardId={props.dashboardId}
          initialValues={EMPTY_OBJECT}
          formData={
            formData as unknown as import('@superset-ui/core').QueryFormData
          }
          ownState={chartOwnState}
          queriesResponse={chart.queriesResponse ?? undefined}
          timeout={timeout}
          triggerQuery={chart.triggerQuery}
          vizType={slice.viz_type}
          setControlValue={props.setControlValue}
          datasetsStatus={
            datasetsStatus as 'loading' | 'error' | 'complete' | undefined
          }
          isInView={props.isInView}
          emitCrossFilters={emitCrossFilters}
          onChartStateChange={handleChartStateChange}
          suppressLoadingSpinner={suppressLoadingSpinner}
          filterState={dataMask[props.id]?.filterState}
          legendState={legendState}
          onLegendStateChanged={rememberLegendState}
        />
      </ChartWrapper>

      {!isLoading && showChartTimestamps && queriedDttm != null && (
        <LastQueriedLabel queriedDttm={queriedDttm} />
      )}

      <StreamingExportModal
        visible={isStreamingModalVisible}
        onCancel={() => {
          cancelExport();
          setIsStreamingModalVisible(false);
          resetExport();
        }}
        onRetry={retryExport}
        onDownload={handleDownloadComplete}
        progress={progress}
      />
    </SliceContainer>
  );
};

export default memo(Chart, (prevProps: ChartProps, nextProps: ChartProps) => {
  if (prevProps.cacheBusterProp !== nextProps.cacheBusterProp) {
    return false;
  }
  return !!(
    !nextProps.isComponentVisible ||
    (prevProps.componentId === nextProps.componentId &&
      prevProps.isComponentVisible &&
      prevProps.isInView === nextProps.isInView &&
      prevProps.id === nextProps.id &&
      prevProps.dashboardId === nextProps.dashboardId &&
      prevProps.extraControls === nextProps.extraControls &&
      prevProps.handleToggleFullSize === nextProps.handleToggleFullSize &&
      prevProps.isFullSize === nextProps.isFullSize &&
      prevProps.setControlValue === nextProps.setControlValue &&
      prevProps.sliceName === nextProps.sliceName &&
      prevProps.updateSliceName === nextProps.updateSliceName &&
      prevProps.width === nextProps.width &&
      prevProps.height === nextProps.height)
  );
});
