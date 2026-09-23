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
  deleteDashboardPivotLayout,
  mergeDashboardPivotLayout,
  deleteDashboardChartTemplate,
  removePersonalChartTemplate,
  removePersonalChartLayout,
  setPersonalChartTemplateActiveSlot,
  setDashboardPivotLayout,
  type PersonalChartLayout,
  type PersonalChartTemplate,
  putDashboardChartTemplate,
  putDashboardPivotLayout,
  setDashboardChartTemplateDefault,
  upsertPersonalChartLayout,
  upsertPersonalChartTemplate,
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

  /*
   * 功能审计（可重写规格）：看板图例会话状态
   * - 功能目的与触发方式：看板虚拟化卸载不可视 ChartRenderer 后，右上角开关触发查询刷新时仍恢复该图表的用户图例选择。
   * - 输入契约：图表子组件回传的真实系列/逻辑图例布尔映射；首次挂载为空。
   * - 输出契约：按 chart 组件实例保存内存状态并传给 ChartContainer，不写数据库、localStorage 或后端接口。
   * - 处理流程：ChartRenderer 回传状态 -> 本组件保存 -> 子组件卸载后重新挂载时作为初始 legendState 传入。
   * - 业务规则：状态只属于当前图表实例；数字显示和时间对比开关只改变查询/标注，不覆盖该映射；未出现的新系列继续使用图表默认规则。
   * - 状态与副作用：仅产生 React 会话状态；图表离开可视区时子渲染器可卸载，但本容器保持状态。
   * - 外部依赖：ChartContainer/ChartRenderer 的 legendState 和 onLegendStateChanged 透传。
   * - 异常与边界：容器本身卸载或页面刷新时状态清空，符合不新增图例持久化的约束。
   * - 不变量与约束：不同 chartId 的状态互不共享，不影响看板保存配置。
   * - 验证方式：ChartRenderer 卸载重挂测试，以及看板 54/74 多图表切换右上角开关后逐图核对。
   */
  const [legendState, setLegendState] = useState<
    Record<string, boolean> | undefined
  >();

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
  const dashboardPivotLayout = useSelector(
    (state: RootState) => state.dashboardState.dashboardPivotLayout,
  ) as PersonalChartLayout | null | undefined;
  const personalChartTemplates = useSelector(
    (state: RootState) =>
      state.dashboardState.personalChartTemplates?.[props.id],
  ) as PersonalChartTemplate[] | undefined;
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
    ],
  );

  const dashboardChartControlQuerySignature =
    getDashboardChartControlQuerySignature(formData as JsonObject);
  const latestQueryChartControlSignature =
    getDashboardChartControlQuerySignature(
      chart?.latestQueryFormData as JsonObject | undefined,
    );
  const latestQueryFormData = chart?.latestQueryFormData as
    | JsonObject
    | undefined;
  const latestQueryExtraFormData = latestQueryFormData?.extra_form_data as
    | JsonObject
    | undefined;
  const latestQueryHasDashboardChartControls =
    ['time_compare', 'show_value', 'show_valueB'].some(field =>
      Object.prototype.hasOwnProperty.call(latestQueryFormData || {}, field),
    ) ||
    Object.prototype.hasOwnProperty.call(
      latestQueryExtraFormData || {},
      'time_compare',
    );
  const dashboardChartControlQueryMismatch =
    latestQueryHasDashboardChartControls &&
    dashboardChartControlQuerySignature !== latestQueryChartControlSignature;

  /**
   * 功能审计（可重写规格）：看板开关查询同步
   * - 功能目的与触发方式：看板右上角“和过去对比”或“数字显示”改变，或首次 hydrate 后图表配置晚于开关状态到达时，确保当前图表提交一次使用最新覆盖项的查询。
   * - 输入契约：当前 dashboardChartControls、当前 formData、最近一次 query formData、chart.triggerQuery 和 chartId。
   * - 输出契约：仅在必要时 dispatch 一次 triggerQuery(true, chartId)；图表随后由现有 Chart -> postChartFormData 链路重新查询。
   * - 处理流程：先判断开关对象引用是否改变，再判断当前三个显示字段与最近查询是否不一致；查询进行中不重复触发；同一签名已请求但 Redux 尚未回写时不重复触发。
   * - 业务规则：当前时间对比值优先读取 extra_form_data.time_compare；空数组和保存的偏移不同；数字显示同时比较 Query A/B 字段；普通筛选和图例状态不在此处处理。
   * - 状态与副作用：只触发既有 Redux 查询动作，不修改图表、看板配置、数据库或用户偏好。
   * - 外部依赖：依赖 Chart reducer 的 latestQueryFormData/triggerQuery 和现有 query abort 机制。
   * - 异常与边界：没有最近查询时不因初始化额外发起请求；查询已在进行时跳过；请求签名回写后清除去重标记。
   * - 不变量与约束：关闭对比后的查询不得继续使用旧 offset；一个图表的判断和请求不影响其他图表。
   * - 验证方式：Chart.test.tsx 覆盖首次加载错位和控制开关切换；真实看板检查请求与图例。
   */
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

    const activeLayout = dashboardPivotLayout || personalChartLayout;
    return activeLayout && slice.viz_type === 'pivot_table_v2'
      ? {
          ...ownStateWithChartState,
          pivot_table_metric_layout: activeLayout,
          pivot_table_metric_layout_scope: dashboardPivotLayout
            ? 'dashboard'
            : 'chart',
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
        version: PIVOT_METRIC_LAYOUT_VERSION,
      };
    },
    [formData],
  );

  const applyPersonalChartLayout = useCallback(
    (layout: PersonalChartLayout | null, slot: 1 | 2 | 3 | null) => {
      if (layout) {
        dispatch(
          upsertPersonalChartLayout(props.id, normalizeTemplateLayout(layout)),
        );
      } else {
        dispatch(removePersonalChartLayout(props.id));
      }
      dispatch(setPersonalChartTemplateActiveSlot(props.id, slot));
    },
    [dispatch, normalizeTemplateLayout, props.id],
  );

  const savePersonalChartTemplate = useCallback(
    async (slot: 1 | 2 | 3, name: string, layout: PersonalChartLayout) => {
      const normalizedLayout = normalizeTemplateLayout(layout);
      setIsSavingPersonalChartLayout(true);
      try {
        const template = await putDashboardChartTemplate(
          props.dashboardId,
          props.id,
          slot,
          name,
          normalizedLayout,
        );
        dispatch(upsertPersonalChartTemplate(props.id, template));
        dispatch(upsertPersonalChartLayout(props.id, template.layout));
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
      props.dashboardId,
      props.id,
    ],
  );

  const saveDashboardSharedLayout = useCallback(
    async (layout: PersonalChartLayout) => {
      setIsSavingPersonalChartLayout(true);
      try {
        const normalized = mergeDashboardPivotLayout(
          dashboardPivotLayout,
          normalizeTemplateLayout(layout),
        );
        await putDashboardPivotLayout(props.dashboardId, normalized);
        dispatch(setDashboardPivotLayout(normalized));
        boundActionCreators.addSuccessToast(t('本看板个人列布局已启用'));
      } catch {
        boundActionCreators.addDangerToast(t('本看板个人列布局保存失败'));
        throw new Error('本看板个人列布局保存失败');
      } finally {
        setIsSavingPersonalChartLayout(false);
      }
    },
    [
      boundActionCreators,
      dashboardPivotLayout,
      dispatch,
      normalizeTemplateLayout,
      props.dashboardId,
    ],
  );

  const disableDashboardSharedLayout = useCallback(async () => {
    setIsSavingPersonalChartLayout(true);
    try {
      await deleteDashboardPivotLayout(props.dashboardId);
      dispatch(setDashboardPivotLayout(null));
      boundActionCreators.addSuccessToast(t('已恢复各图表的个人列布局'));
    } catch {
      boundActionCreators.addDangerToast(t('停用本看板个人列布局失败'));
      throw new Error('停用本看板个人列布局失败');
    } finally {
      setIsSavingPersonalChartLayout(false);
    }
  }, [boundActionCreators, dispatch, props.dashboardId]);

  const setPersonalChartTemplateDefault = useCallback(
    async (slot: 1 | 2 | 3) => {
      setIsSavingPersonalChartLayout(true);
      try {
        const template = await setDashboardChartTemplateDefault(
          props.dashboardId,
          props.id,
          slot,
        );
        dispatch(upsertPersonalChartTemplate(props.id, template));
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
        await deleteDashboardChartTemplate(props.dashboardId, props.id, slot);
        dispatch(removePersonalChartTemplate(props.id, slot));
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
        personalChartLayout={dashboardPivotLayout || personalChartLayout}
        dashboardPivotLayout={dashboardPivotLayout}
        personalChartTemplates={personalChartTemplates}
        personalChartTemplateActiveSlot={personalChartTemplateActiveSlot}
        onApplyPersonalChartLayout={applyPersonalChartLayout}
        onSavePersonalChartTemplate={savePersonalChartTemplate}
        onSaveDashboardPivotLayout={saveDashboardSharedLayout}
        onDisableDashboardPivotLayout={disableDashboardSharedLayout}
        onSetPersonalChartTemplateDefault={setPersonalChartTemplateDefault}
        onDeletePersonalChartTemplate={deletePersonalChartTemplate}
        isSavingPersonalChartLayout={isSavingPersonalChartLayout}
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
          onLegendStateChanged={setLegendState}
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
