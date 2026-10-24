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
/* eslint-disable camelcase */
import { invert } from 'lodash';
import {
  AnnotationLayer,
  AxisType,
  buildCustomFormatters,
  CategoricalColorNamespace,
  CurrencyFormatter,
  ensureIsArray,
  getCustomPeriodComparison,
  getCustomFormatter,
  getNumberFormatter,
  getXAxisLabel,
  isDefined,
  isEventAnnotationLayer,
  isFormulaAnnotationLayer,
  isIntervalAnnotationLayer,
  isPhysicalColumn,
  isTimeseriesAnnotationLayer,
  QueryFormData,
  QueryFormMetric,
  resolveAutoCurrency,
  TimeseriesChartDataResponseResult,
  TimeseriesDataRecord,
  tooltipHtml,
  ValueFormatter,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import { getOriginalSeries, getTimeOffset } from '@superset-ui/chart-controls';
import type { EChartsCoreOption } from 'echarts/core';
import type { SeriesOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/src/util/types';
import {
  DEFAULT_FORM_DATA,
  EchartsMixedTimeseriesChartTransformedProps,
  EchartsMixedTimeseriesFormData,
  EchartsMixedTimeseriesProps,
} from './types';
import {
  EchartsTimeseriesSeriesType,
  ForecastSeriesEnum,
  Refs,
} from '../types';
import { parseAxisBound } from '../utils/controls';
import { applyAutomaticBarSizing } from '../utils/barSizing';
import { alignPeriodAxis } from '../utils/periodAxis';
import { safeParseEChartOptions } from '../utils/safeEChartOptionsParser';
import {
  dedupSeries,
  extractDataTotalValues,
  extractSeries,
  extractShowValueIndexes,
  extractTooltipKeys,
  getAxisType,
  getColtypesMapping,
  getLegendProps,
  getMinAndMaxFromBounds,
  getOverMaxHiddenFormatter,
  buildLegendGroupMetadata,
  resolveLegendState,
} from '../utils/series';
import type { LegendGroupInput, LegendGroupMetadata } from '../utils/series';
import {
  extractAnnotationLabels,
  getAnnotationData,
} from '../utils/annotation';
import {
  extractForecastSeriesContext,
  extractForecastValuesFromTooltipParams,
  formatForecastTooltipSeries,
  rebaseForecastDatum,
  reorderForecastSeries,
} from '../utils/forecast';
import { convertInteger } from '../utils/convertInteger';
import { defaultGrid, defaultYAxis } from '../defaults';
import {
  getPadding,
  transformEventAnnotation,
  transformFormulaAnnotation,
  transformIntervalAnnotation,
  transformSeries,
  transformTimeseriesAnnotation,
} from '../Timeseries/transformers';
import { TIMEGRAIN_TO_TIMESTAMP, TIMESERIES_CONSTANTS } from '../constants';
import { getDefaultTooltip } from '../utils/tooltip';
import {
  CUSTOM_TIME_TEXT_COLOR,
  CUSTOM_PERIOD_TOOLTIP_STYLE,
  formatCustomPeriodTooltip,
  getCustomTimeControlledFormatter,
  formatCustomPeriodLegendLabel,
  styleCustomPeriodComparisonSeries,
  maskCustomPeriodCurrentData,
} from '../utils/customPeriodTooltip';
import {
  getTooltipTimeFormatter,
  getXAxisFormatter,
  getYAxisFormatter,
} from '../utils/formatters';
import { getMetricDisplayName } from '../utils/metricDisplayName';
import { mergeCustomEChartOptions } from '../utils/mergeCustomEChartOptions';

const getFormatter = (
  customFormatters: Record<string, ValueFormatter>,
  defaultFormatter: ValueFormatter,
  metrics: QueryFormMetric[],
  formatterKey: string,
  forcePercentFormat: boolean,
) => {
  if (forcePercentFormat) {
    return getNumberFormatter(',.0%');
  }
  return (
    getCustomFormatter(customFormatters, metrics, formatterKey) ??
    defaultFormatter
  );
};

export default function transformProps(
  chartProps: EchartsMixedTimeseriesProps,
): EchartsMixedTimeseriesChartTransformedProps {
  /*
   * 功能审计（可重写规格）：混合时序图逻辑图例
   * - 功能目的与触发方式：混合时序图转换 Query A/B 后调用，统一处理维度合并、时间对比、父指标归属和按图表实例保存的图例状态。
   * - 输入契约：两组查询的真实系列、groupby/groupby_b、time_compare/time_compare_b、showQueryIdentifiers 和 ChartRenderer 传入的 legendState。
   * - 输出契约：有对比时 legend.data 使用真实 series.name 代表值并由 formatter 映射文本；legendGroups 描述当前组、offset 组及父子关系；无对比时保留既有维度图例行为。
   * - 处理流程：分别转换 Query A/B，记录真实系列的当前指标标签和偏移，按指标或 offset 建组，解析新旧状态后生成 ECharts 选项。
   * - 业务规则：同一指标的维度共用一个当前图例；同一 offset 的 Query A/B、指标和维度共用一个对比图例；对比成员只有在 offset 组及父当前组都打开时显示；当前默认打开、对比默认关闭。
   * - 次要 Y 轴自动边界规则：开启 truncateYAxisSecondary 时忽略已保存的次要轴最小/最大值，并仅令次要轴按数据范围缩放；关闭后恢复手填边界，主轴不受影响；行级贡献图保持 0–100% 语义。
   * - 状态与副作用：只生成客户端选项并回传图例状态，不修改看板数据库、后端接口或 localStorage；无对比路径不改变既有维度图例。
   * - 外部依赖：依赖 chart-controls 的时间偏移解析、ECharts legend 事件和 ChartRenderer 状态合并；支持两组 offset 配置。
   * - 异常与边界：任一 offset 配置为空时只处理另一组；无父当前组的对比线仍属于 offset 组；注释图例不参与业务分组。
   * - 不变量与约束：图例 key 必须是实际 series.name；查询、普通 tooltip、数字显示、颜色、注释、分页和主副轴 formatter 行为保持不变；自定义期间 tooltip 配对当前与对比桶，并注明派生值单位。
   * - 验证方式：MixedTimeseries transform/component 单测覆盖 Query A/B、维度、offset、父组关闭、全选、无对比回归和次要轴自动边界。
   */
  const {
    width,
    height,
    formData: { echartOptions: _echartOptions, ...formData },
    queriesData,
    hooks,
    filterState,
    datasource,
    theme,
    inContextMenu,
    emitCrossFilters,
    legendState,
  } = chartProps;

  let focusedSeries: string | null = null;

  const {
    verboseMap = {},
    currencyFormats = {},
    columnFormats = {},
    currencyCodeColumn,
  } = datasource;
  const { label_map: labelMap, detected_currency: backendDetectedCurrency } =
    queriesData[0] as TimeseriesChartDataResponseResult;
  const { label_map: labelMapB, detected_currency: backendDetectedCurrencyB } =
    queriesData[1] as TimeseriesChartDataResponseResult;
  const data1 = (queriesData[0].data || []) as TimeseriesDataRecord[];
  const data2 = (queriesData[1].data || []) as TimeseriesDataRecord[];
  const annotationData = getAnnotationData(chartProps);
  const coltypeMapping = {
    ...getColtypesMapping(queriesData[0]),
    ...getColtypesMapping(queriesData[1]),
  };
  const {
    area,
    areaB,
    annotationLayers,
    colorScheme,
    timeShiftColor,
    contributionMode,
    legendOrientation,
    legendMargin,
    legendType,
    legendSort,
    logAxis,
    logAxisSecondary,
    markerEnabled,
    markerEnabledB,
    markerSize,
    markerSizeB,
    opacity,
    opacityB,
    minorSplitLine,
    minorTicks,
    seriesType,
    seriesTypeB,
    showLegend,
    showValue,
    showValueB,
    onlyTotal,
    onlyTotalB,
    stack,
    stackB,
    truncateXAxis,
    truncateYAxis,
    truncateYAxisSecondary,
    tooltipTimeFormat,
    yAxisFormat,
    currencyFormat,
    yAxisFormatSecondary,
    currencyFormatSecondary,
    xAxisTimeFormat,
    yAxisBounds,
    yAxisBoundsSecondary,
    yAxisIndex,
    yAxisIndexB,
    yAxisTitleSecondary,
    zoomable,
    richTooltip,
    tooltipSortByMetric,
    xAxisBounds,
    xAxisLabelRotation,
    xAxisLabelInterval,
    groupby,
    groupbyB,
    xAxis: xAxisOrig,
    xAxisForceCategorical,
    xAxisTitle,
    yAxisTitle,
    xAxisTitleMargin,
    yAxisTitleMargin,
    yAxisTitlePosition,
    sliceId,
    sortSeriesType,
    sortSeriesTypeB,
    sortSeriesAscending,
    sortSeriesAscendingB,
    timeGrainSqla: _timeGrainSqla,
    forceMaxInterval,
    percentageThreshold,
    showQueryIdentifiers = false,
    metrics = [],
    metricsB = [],
  }: EchartsMixedTimeseriesFormData = { ...DEFAULT_FORM_DATA, ...formData };

  const refs: Refs = {};
  const colorScale = CategoricalColorNamespace.getScale(colorScheme as string);

  let xAxisLabel = getXAxisLabel(
    chartProps.rawFormData as QueryFormData,
  ) as string;
  if (
    isPhysicalColumn(chartProps.rawFormData?.x_axis) &&
    isDefined(verboseMap[xAxisLabel])
  ) {
    xAxisLabel = verboseMap[xAxisLabel];
  }

  const dataTypes = getColtypesMapping(queriesData[0]);
  const xAxisDataType = dataTypes?.[xAxisLabel] ?? dataTypes?.[xAxisOrig];
  const xAxisType = getAxisType(stack, xAxisForceCategorical, xAxisDataType);
  const nativeTimeCompare =
    chartProps.rawFormData?.extra_form_data?.time_compare;
  const array = ensureIsArray(
    nativeTimeCompare ?? chartProps.rawFormData?.time_compare,
  );
  const arrayB = ensureIsArray(
    nativeTimeCompare ?? chartProps.rawFormData?.time_compare_b,
  );
  const allTimeCompare = Array.from(new Set([...array, ...arrayB]));
  const selectedPeriod = getCustomPeriodComparison(chartProps.rawFormData);
  const customPeriod = allTimeCompare.includes(
    selectedPeriod?.comparisonTimeRange ?? '',
  )
    ? selectedPeriod
    : undefined;
  const timeGrainSqla =
    (formData as any).extra_form_data?.time_grain_sqla ||
    (chartProps as any).rawFormData?.extra_form_data?.time_grain_sqla ||
    (chartProps as any).rawFormData?.time_grain_sqla ||
    _timeGrainSqla;
  const rebasedDataA = maskCustomPeriodCurrentData(
    rebaseForecastDatum(data1, verboseMap),
    xAxisLabel,
    xAxisDataType === GenericDataType.Temporal ? customPeriod : undefined,
    timeGrainSqla,
    String(chartProps.rawFormData.comparison_type ?? 'values'),
  );
  const { totalStackedValues, thresholdValues } = extractDataTotalValues(
    rebasedDataA,
    {
      stack,
      percentageThreshold,
      xAxisCol: xAxisLabel,
    },
  );

  const MetricDisplayNameA: string =
    getMetricDisplayName(metrics[0], verboseMap) || '';
  const MetricDisplayNameB: string =
    getMetricDisplayName(metricsB[0], verboseMap) || '';

  // 图例属于展示层；保留完整序列名称供交互和 tooltip 使用，只去掉分组维度文本。
  const metricLegendFormatter = (name: string): string => {
    const metricParts = [
      groupby.length > 0
        ? showQueryIdentifiers
          ? `${MetricDisplayNameA} (Query A)`
          : MetricDisplayNameA
        : undefined,
      groupbyB.length > 0
        ? showQueryIdentifiers
          ? `${MetricDisplayNameB} (Query B)`
          : MetricDisplayNameB
        : undefined,
    ].filter((value): value is string => Boolean(value));
    return (
      metricParts.find(
        metric => name === metric || name.startsWith(`${metric}, `),
      ) || name
    );
  };

  const [rawSeriesA, sortedTotalValuesA] = extractSeries(rebasedDataA, {
    fillNeighborValue: stack && !customPeriod ? 0 : undefined,
    xAxis: xAxisLabel,
    sortSeriesType,
    sortSeriesAscending,
    stack,
    totalStackedValues,
    xAxisType,
  });
  const rebasedDataB = maskCustomPeriodCurrentData(
    rebaseForecastDatum(data2, verboseMap),
    xAxisLabel,
    xAxisDataType === GenericDataType.Temporal ? customPeriod : undefined,
    timeGrainSqla,
    String(chartProps.rawFormData.comparison_type_b ?? 'values'),
  );
  const {
    totalStackedValues: totalStackedValuesB,
    thresholdValues: thresholdValuesB,
  } = extractDataTotalValues(rebasedDataB, {
    stack: Boolean(stackB),
    percentageThreshold,
    xAxisCol: xAxisLabel,
  });
  const [rawSeriesB, sortedTotalValuesB] = extractSeries(rebasedDataB, {
    fillNeighborValue: stackB && !customPeriod ? 0 : undefined,
    xAxis: xAxisLabel,
    sortSeriesType: sortSeriesTypeB,
    sortSeriesAscending: sortSeriesAscendingB,
    stack: Boolean(stackB),
    totalStackedValues: totalStackedValuesB,
    xAxisType,
  });
  const series: SeriesOption[] = [];
  // Keep query provenance independently of axis selection and display-name deduplication.
  const customSeriesSources = new Map<
    SeriesOption,
    { primary: boolean; rawName: string }
  >();

  const resolvedCurrency = resolveAutoCurrency(
    currencyFormat,
    backendDetectedCurrency,
    data1,
    currencyCodeColumn,
  );
  const resolvedCurrencySecondary = resolveAutoCurrency(
    currencyFormatSecondary,
    backendDetectedCurrencyB,
    data2,
    currencyCodeColumn,
  );

  const formatter = contributionMode
    ? getNumberFormatter(',.0%')
    : resolvedCurrency?.symbol
      ? new CurrencyFormatter({
          d3Format: yAxisFormat,
          currency: resolvedCurrency,
        })
      : getNumberFormatter(yAxisFormat);
  const formatterSecondary = contributionMode
    ? getNumberFormatter(',.0%')
    : resolvedCurrencySecondary?.symbol
      ? new CurrencyFormatter({
          d3Format: yAxisFormatSecondary,
          currency: resolvedCurrencySecondary,
        })
      : getNumberFormatter(yAxisFormatSecondary);
  const customFormatters = buildCustomFormatters(
    [...ensureIsArray(metrics), ...ensureIsArray(metricsB)],
    currencyFormats,
    columnFormats,
    yAxisFormat,
    resolvedCurrency,
    data1,
    currencyCodeColumn,
  );
  const customFormattersSecondary = buildCustomFormatters(
    [...ensureIsArray(metrics), ...ensureIsArray(metricsB)],
    currencyFormats,
    columnFormats,
    yAxisFormatSecondary,
    resolvedCurrencySecondary,
    data2,
    currencyCodeColumn,
  );

  const showValueIndexesA = extractShowValueIndexes(rawSeriesA, {
    stack,
    onlyTotal,
  });
  const showValueIndexesB = extractShowValueIndexes(rawSeriesB, {
    stack,
    onlyTotal,
  });

  annotationLayers
    .filter((layer: AnnotationLayer) => layer.show)
    .forEach((layer: AnnotationLayer) => {
      if (isFormulaAnnotationLayer(layer))
        series.push(
          transformFormulaAnnotation(
            layer,
            rebasedDataA as TimeseriesDataRecord[],
            xAxisLabel,
            xAxisType,
            colorScale,
            sliceId,
          ),
        );
      else if (isIntervalAnnotationLayer(layer)) {
        series.push(
          ...transformIntervalAnnotation(
            layer,
            data1,
            annotationData,
            colorScale,
            theme,
            sliceId,
          ),
        );
      } else if (isEventAnnotationLayer(layer)) {
        series.push(
          ...transformEventAnnotation(
            layer,
            data1,
            annotationData,
            colorScale,
            theme,
            sliceId,
          ),
        );
      } else if (isTimeseriesAnnotationLayer(layer)) {
        series.push(
          ...transformTimeseriesAnnotation(
            layer,
            markerSize,
            data1,
            annotationData,
            colorScale,
            sliceId,
          ),
        );
      }
    });

  // yAxisBounds need to be parsed to replace incompatible values with undefined
  const [xAxisMin, xAxisMax] = (xAxisBounds || []).map(parseAxisBound);
  let [yAxisMin, yAxisMax] = (yAxisBounds || []).map(parseAxisBound);
  let [minSecondary, maxSecondary] = (yAxisBoundsSecondary || []).map(
    parseAxisBound,
  );
  if (truncateYAxisSecondary) {
    minSecondary = undefined;
    maxSecondary = undefined;
  }

  const inverted = invert(verboseMap);
  const legendInputs: LegendGroupInput[] = [];

  rawSeriesA.forEach(entry => {
    const entryName = String(entry.name || '');
    const seriesName = inverted[entryName] || entryName;
    const colorScaleKey = getOriginalSeries(seriesName, allTimeCompare);

    let displayName: string;

    if (groupby.length > 0) {
      const metricPart: string = showQueryIdentifiers
        ? `${MetricDisplayNameA} (Query A)`
        : MetricDisplayNameA;
      displayName = entryName.includes(metricPart)
        ? entryName
        : `${metricPart}, ${entryName}`;
    } else {
      displayName = showQueryIdentifiers ? `${entryName} (Query A)` : entryName;
    }
    const timeOffset = allTimeCompare.some(offset => entryName.includes(offset))
      ? getTimeOffset(entry, allTimeCompare)
      : undefined;
    if (timeOffset && !displayName.includes(timeOffset)) {
      displayName = `${displayName}, ${timeOffset}`;
    }

    const seriesFormatter = getFormatter(
      customFormatters,
      formatter,
      metrics,
      labelMap?.[seriesName]?.[0],
      !!contributionMode,
    );

    const transformedSeries = transformSeries(
      {
        ...entry,
        id: `${displayName || ''}`,
        name: `${displayName || ''}`,
      },
      colorScale,
      colorScaleKey,
      {
        area,
        markerEnabled,
        markerSize,
        areaOpacity: opacity,
        seriesType,
        showValue,
        onlyTotal,
        stack: Boolean(stack),
        stackIdSuffix: '\na',
        yAxisIndex,
        filterState,
        seriesKey: entry.name,
        sliceId,
        queryIndex: 0,
        formatter:
          seriesType === EchartsTimeseriesSeriesType.Bar
            ? getOverMaxHiddenFormatter({
                max: yAxisMax,
                formatter: seriesFormatter,
              })
            : seriesFormatter,
        totalStackedValues: sortedTotalValuesA,
        showValueIndexes: showValueIndexesA,
        thresholdValues,
        timeShiftColor,
        theme,
      },
    );

    if (transformedSeries) {
      series.push(transformedSeries);
      customSeriesSources.set(transformedSeries, {
        primary: true,
        rawName: entryName,
      });
      const transformedName = String(transformedSeries.name || '');
      legendInputs.push({
        name: transformedName,
        currentLabel:
          groupby.length > 0 ||
          (customPeriod && allTimeCompare.includes(entryName))
            ? showQueryIdentifiers
              ? `${MetricDisplayNameA} (Query A)`
              : MetricDisplayNameA
            : getOriginalSeries(transformedName, allTimeCompare),
        timeOffset:
          customPeriod && allTimeCompare.includes(entryName)
            ? entryName
            : getTimeOffset({ name: transformedName }, allTimeCompare) ||
              undefined,
      });
    }
  });

  rawSeriesB.forEach(entry => {
    const entryName = String(entry.name || '');
    const seriesEntry = inverted[entryName] || entryName;
    const seriesName = `${seriesEntry} (1)`;
    const colorScaleKey = getOriginalSeries(seriesEntry, allTimeCompare);

    let displayName: string;

    if (groupbyB.length > 0) {
      const metricPart: string = showQueryIdentifiers
        ? `${MetricDisplayNameB} (Query B)`
        : MetricDisplayNameB;
      displayName = entryName.includes(metricPart)
        ? entryName
        : `${metricPart}, ${entryName}`;
    } else {
      displayName = showQueryIdentifiers ? `${entryName} (Query B)` : entryName;
    }
    const timeOffset = allTimeCompare.some(offset => entryName.includes(offset))
      ? getTimeOffset(entry, allTimeCompare)
      : undefined;
    if (timeOffset && !displayName.includes(timeOffset)) {
      displayName = `${displayName}, ${timeOffset}`;
    }

    const seriesFormatter = getFormatter(
      customFormattersSecondary,
      formatterSecondary,
      metricsB,
      labelMapB?.[seriesName]?.[0],
      !!contributionMode,
    );

    const transformedSeries = transformSeries(
      {
        ...entry,
        id: `${displayName || ''}`,
        name: `${displayName || ''}`,
      },

      colorScale,
      colorScaleKey,
      {
        area: areaB,
        markerEnabled: markerEnabledB,
        markerSize: markerSizeB,
        areaOpacity: opacityB,
        seriesType: seriesTypeB,
        showValue: showValueB,
        onlyTotal: onlyTotalB,
        stack: Boolean(stackB),
        stackIdSuffix: '\nb',
        yAxisIndex: yAxisIndexB,
        filterState,
        seriesKey: entry.name,
        sliceId,
        queryIndex: 1,
        formatter:
          seriesTypeB === EchartsTimeseriesSeriesType.Bar
            ? getOverMaxHiddenFormatter({
                max: maxSecondary,
                formatter: seriesFormatter,
              })
            : seriesFormatter,
        totalStackedValues: sortedTotalValuesB,
        showValueIndexes: showValueIndexesB,
        thresholdValues: thresholdValuesB,
        timeShiftColor,
        theme,
      },
    );

    if (transformedSeries) {
      series.push(transformedSeries);
      customSeriesSources.set(transformedSeries, {
        primary: false,
        rawName: entryName,
      });
      const transformedName = String(transformedSeries.name || '');
      legendInputs.push({
        name: transformedName,
        currentLabel:
          groupbyB.length > 0 ||
          (customPeriod && allTimeCompare.includes(entryName))
            ? showQueryIdentifiers
              ? `${MetricDisplayNameB} (Query B)`
              : MetricDisplayNameB
            : getOriginalSeries(transformedName, allTimeCompare),
        timeOffset:
          customPeriod && allTimeCompare.includes(entryName)
            ? entryName
            : getTimeOffset({ name: transformedName }, allTimeCompare) ||
              undefined,
      });
    }
  });

  // default to 0-100% range when doing row-level contribution chart
  if (contributionMode === 'row' && stack) {
    if (yAxisMin === undefined) yAxisMin = 0;
    if (yAxisMax === undefined) yAxisMax = 1;
    if (minSecondary === undefined) minSecondary = 0;
    if (maxSecondary === undefined) maxSecondary = 1;
  }

  const controlledTimeFormatter = getCustomTimeControlledFormatter(
    chartProps.rawFormData.extra_form_data,
  );
  const tooltipFormatter =
    xAxisDataType === GenericDataType.Temporal
      ? (controlledTimeFormatter ??
        getTooltipTimeFormatter(tooltipTimeFormat, timeGrainSqla, customPeriod))
      : String;
  const xAxisFormatter =
    xAxisDataType === GenericDataType.Temporal
      ? (controlledTimeFormatter ??
        getXAxisFormatter(xAxisTimeFormat, timeGrainSqla))
      : String;

  const addYAxisTitleOffset =
    !!(yAxisTitle || yAxisTitleSecondary) &&
    convertInteger(yAxisTitleMargin) !== 0;
  const addXAxisTitleOffset =
    !!xAxisTitle && convertInteger(xAxisTitleMargin) !== 0;
  const hasTimeCompare = allTimeCompare.length > 0;
  const legendVisible = hasTimeCompare ? true : showLegend;
  const emptyLegendMetadata: LegendGroupMetadata = {
    groups: {},
    labels: {},
    kinds: {},
    parents: {},
    stateKeys: {},
  };
  const stateLegendGroups = buildLegendGroupMetadata(
    legendInputs,
    Boolean(customPeriod),
  );
  const legendGroups = hasTimeCompare ? stateLegendGroups : emptyLegendMetadata;
  if (customPeriod)
    styleCustomPeriodComparisonSeries(series, colorScale, legendGroups);
  const legendStateWithTimeCompare = hasTimeCompare
    ? resolveLegendState(
        legendState,
        legendGroups,
        customPeriod?.comparisonTimeRange,
      )
    : (() => {
        /*
         * 功能审计（可重写规格）：混合图关闭时间对比时的图例状态投影
         * - 功能目的与触发方式：时间对比从开启切换为关闭后，仍按当前图的真实维度系列恢复用户刚才的当前指标选择。
         * - 输入契约：legendState 可能同时包含 current:<指标>、真实代表系列和维度成员键；stateLegendGroups 只包含当前期真实系列。
         * - 输出契约：保留原状态，并把明确的当前逻辑组状态展开到其所有真实成员；没有逻辑组状态时保留每个维度成员自己的状态。
         * - 处理流程：稳定状态键优先，其次代表系列键和显示标签键；找到逻辑状态时覆盖该组全部成员，未找到时保留维度成员自己的状态，避免把无对比维度的独立选择合并成一个默认值。
         * - 业务规则：关闭对比只移除 offset 图例，不恢复当前指标默认值；新增成员没有旧状态时继续交给 ECharts 默认开启。
         * - 状态与副作用：纯内存映射，不发查询、不写 Redux、数据库、localStorage 或看板配置。
         * - 异常与边界：空 legendState 或没有成员时返回副本；Query A/B 同名指标按现有分组规则共同投影。
         * - 不变量与约束：无对比混合图继续显示维度图例，用户单独隐藏的维度在没有逻辑组覆盖时不被改写。
         * - 验证方式：MixedTimeseries transform 测试覆盖隐藏当前逻辑组后关闭对比，以及无对比维度状态回归。
         */
        const input = legendState ?? {};
        const projected = { ...input };
        Object.entries(stateLegendGroups.groups).forEach(
          ([representative, members]) => {
            const stateKey = stateLegendGroups.stateKeys[representative];
            const label = stateLegendGroups.labels[representative];
            const stableState =
              stateKey && input[stateKey] !== undefined
                ? input[stateKey]
                : undefined;
            const groupState =
              stableState ??
              (input[representative] !== undefined
                ? input[representative]
                : label && input[label] !== undefined
                  ? input[label]
                  : undefined);
            if (groupState !== undefined) {
              members.forEach(member => {
                projected[member] = groupState;
              });
            }
          },
        );
        return projected;
      })();

  const chartPadding = getPadding(
    legendVisible,
    legendOrientation,
    addYAxisTitleOffset,
    zoomable,
    legendMargin,
    addXAxisTitleOffset,
    yAxisTitlePosition,
    convertInteger(yAxisTitleMargin),
    convertInteger(xAxisTitleMargin),
  );

  const { setDataMask = () => {}, onContextMenu, onLegendStateChanged } = hooks;
  const alignTicks = yAxisIndex !== yAxisIndexB;

  // dedupSeries 会修改重复序列的最终 id；tooltip 必须按去重后的序列轴归属选择 formatter。
  const orderedSeries = reorderForecastSeries(series) as SeriesOption[];
  const dedupedSeries = dedupSeries(orderedSeries);
  const customSourcesByKey = new Map(
    dedupedSeries.map((entry, index) => [
      String(entry.id ?? entry.name ?? ''),
      customSeriesSources.get(orderedSeries[index]),
    ]),
  );
  const customOriginalSeries = (key: string): string => {
    const source = customSourcesByKey.get(key);
    const queryMetrics = source?.primary ? metrics : metricsB;
    const groups = source?.primary ? groupby : groupbyB;
    // A single-metric native comparison returns the offset itself as the column name.
    // Resolve only from that query's metric metadata, never from colors or another query.
    if (
      source &&
      source.rawName === customPeriod?.comparisonTimeRange &&
      queryMetrics.length === 1 &&
      groups.length === 0
    ) {
      const metricName = getMetricDisplayName(queryMetrics[0], verboseMap);
      return showQueryIdentifiers
        ? `${metricName} (Query ${source.primary ? 'A' : 'B'})`
        : metricName;
    }
    return getOriginalSeries(key, allTimeCompare);
  };
  const primarySeries = new Set(
    dedupedSeries
      .filter(entry => entry.yAxisIndex !== 1)
      .map(entry => String(entry.id || '')),
  );

  const legendProps = getLegendProps(
    legendType,
    legendOrientation,
    legendVisible,
    theme,
    zoomable,
    legendStateWithTimeCompare,
    chartPadding,
  );

  const echartOptions: EChartsCoreOption = {
    useUTC: true,
    grid: {
      ...defaultGrid,
      ...chartPadding,
    },
    xAxis: {
      type: xAxisType,
      name: xAxisTitle,
      nameGap: convertInteger(xAxisTitleMargin),
      nameLocation: 'middle',
      axisLabel: {
        ...(controlledTimeFormatter &&
        xAxisDataType === GenericDataType.Temporal
          ? { color: CUSTOM_TIME_TEXT_COLOR }
          : {}),
        formatter: xAxisFormatter,
        rotate: xAxisLabelRotation,
        interval: xAxisLabelInterval,
      },
      minorTick: { show: minorTicks },
      minInterval:
        xAxisType === AxisType.Time && timeGrainSqla && !forceMaxInterval
          ? TIMEGRAIN_TO_TIMESTAMP[
              timeGrainSqla as keyof typeof TIMEGRAIN_TO_TIMESTAMP
            ]
          : 0,
      maxInterval:
        xAxisType === AxisType.Time && timeGrainSqla && forceMaxInterval
          ? TIMEGRAIN_TO_TIMESTAMP[
              timeGrainSqla as keyof typeof TIMEGRAIN_TO_TIMESTAMP
            ]
          : undefined,
      ...getMinAndMaxFromBounds(
        xAxisType,
        truncateXAxis,
        xAxisMin,
        xAxisMax,
        seriesType === EchartsTimeseriesSeriesType.Bar ||
          seriesTypeB === EchartsTimeseriesSeriesType.Bar
          ? EchartsTimeseriesSeriesType.Bar
          : undefined,
      ),
    },
    yAxis: [
      {
        ...defaultYAxis,
        type: logAxis ? 'log' : 'value',
        min: yAxisMin,
        max: yAxisMax,
        minorTick: { show: minorTicks },
        minorSplitLine: { show: minorSplitLine },
        axisLabel: {
          formatter: getYAxisFormatter(
            metrics,
            !!contributionMode,
            customFormatters,
            formatter,
            yAxisFormat,
          ),
        },
        scale: truncateYAxis,
        name: yAxisTitle,
        nameGap: convertInteger(yAxisTitleMargin),
        nameLocation: yAxisTitlePosition === 'Left' ? 'middle' : 'end',
        alignTicks,
      },
      {
        ...defaultYAxis,
        type: logAxisSecondary ? 'log' : 'value',
        min: minSecondary,
        max: maxSecondary,
        minorTick: { show: minorTicks },
        splitLine: { show: false },
        minorSplitLine: { show: minorSplitLine },
        axisLabel: {
          formatter: getYAxisFormatter(
            metricsB,
            !!contributionMode,
            customFormattersSecondary,
            formatterSecondary,
            yAxisFormatSecondary,
          ),
        },
        scale: truncateYAxis || truncateYAxisSecondary,
        name: yAxisTitleSecondary,
        alignTicks,
      },
    ],
    tooltip: {
      ...getDefaultTooltip(refs),
      ...(customPeriod ? CUSTOM_PERIOD_TOOLTIP_STYLE : {}),
      show: !inContextMenu,
      trigger: richTooltip ? 'axis' : 'item',
      formatter: (params: any) => {
        const xValue: number = richTooltip
          ? params[0].value[0]
          : params.value[0];
        const forecastValue: any[] = richTooltip ? params : [params];

        const sortedKeys = extractTooltipKeys(
          forecastValue,
          // horizontal mode is not supported in mixed series chart
          1,
          richTooltip,
          tooltipSortByMetric,
        );

        const rows: string[][] = [];
        const forecastValues =
          extractForecastValuesFromTooltipParams(forecastValue);

        if (
          customPeriod &&
          !Object.values(forecastValues).some(
            value =>
              value.forecastTrend || value.forecastLower || value.forecastUpper,
          )
        ) {
          return formatCustomPeriodTooltip({
            params: sortedKeys.flatMap(key =>
              forecastValue.filter(
                (point: CallbackDataParams) => String(point.seriesId) === key,
              ),
            ),
            series: dedupedSeries,
            period: customPeriod,
            timeGrain: timeGrainSqla,
            temporalAxis: xAxisDataType === GenericDataType.Temporal,
            itemTooltip: !richTooltip,
            legendState: legendStateWithTimeCompare,
            focusedSeries,
            originalSeriesForKey: customOriginalSeries,
            isComparisonForSeries: key => {
              const rawName = customSourcesByKey.get(key)?.rawName ?? key;
              return (
                rawName === customPeriod.comparisonTimeRange ||
                Boolean(getTimeOffset({ name: rawName }, allTimeCompare))
              );
            },
            formatterForSeries: key => {
              const isPrimary =
                customSourcesByKey.get(key)?.primary ?? primarySeries.has(key);
              const originalKey = customOriginalSeries(key);
              const groups = isPrimary ? groupby : groupbyB;
              const labels = isPrimary ? labelMap : labelMapB;
              const formatterKey =
                groups.length === 0
                  ? inverted[originalKey]
                  : (labels[key]?.[0] ?? labels[originalKey]?.[0]);
              return getFormatter(
                isPrimary ? customFormatters : customFormattersSecondary,
                isPrimary ? formatter : formatterSecondary,
                isPrimary ? metrics : metricsB,
                formatterKey,
                !!contributionMode,
              );
            },
            comparisonTypeForSeries: key =>
              String(
                chartProps.rawFormData[
                  (customSourcesByKey.get(key)?.primary ??
                  primarySeries.has(key))
                    ? 'comparison_type'
                    : 'comparison_type_b'
                ] ?? 'values',
              ),
          });
        }
        const keys = Object.keys(forecastValues);
        let focusedRow;
        sortedKeys
          .filter(key => keys.includes(key))
          .forEach(key => {
            const value = forecastValues[key];
            // if there are no dimensions, key is a verbose name of a metric,
            // otherwise it is a comma separated string where the first part is metric name
            let formatterKey;
            if (primarySeries.has(key)) {
              formatterKey =
                groupby.length === 0 ? inverted[key] : labelMap[key]?.[0];
            } else {
              formatterKey =
                groupbyB.length === 0 ? inverted[key] : labelMapB[key]?.[0];
            }
            const tooltipFormatter = getFormatter(
              customFormatters,
              formatter,
              metrics,
              formatterKey,
              !!contributionMode,
            );
            const tooltipFormatterSecondary = getFormatter(
              customFormattersSecondary,
              formatterSecondary,
              metricsB,
              formatterKey,
              !!contributionMode,
            );
            const row = formatForecastTooltipSeries({
              ...value,
              seriesName: key,
              formatter: primarySeries.has(key)
                ? tooltipFormatter
                : tooltipFormatterSecondary,
            });
            rows.push(row);
            if (key === focusedSeries) {
              focusedRow = rows.length - 1;
            }
          });
        return tooltipHtml(rows, tooltipFormatter(xValue), focusedRow);
      },
    },
    legend: {
      ...legendProps,
      ...(customPeriod ? { itemWidth: 14, itemHeight: 9, itemGap: 16 } : {}),
      ...(controlledTimeFormatter || customPeriod
        ? {
            textStyle: {
              ...legendProps.textStyle,
              color: CUSTOM_TIME_TEXT_COLOR,
            },
            selectorLabel: {
              ...legendProps.selectorLabel,
              color: CUSTOM_TIME_TEXT_COLOR,
            },
          }
        : {}),
      formatter: hasTimeCompare
        ? (name: string) =>
            customPeriod && legendGroups.kinds[name] === 'comparison'
              ? formatCustomPeriodLegendLabel(
                  customPeriod,
                  legendGroups.labels[name],
                )
              : (legendGroups.labels[name] ?? name)
        : metricLegendFormatter,
      data: (hasTimeCompare
        ? Object.keys(legendGroups.groups).filter(
            name =>
              extractForecastSeriesContext(name).type ===
              ForecastSeriesEnum.Observation,
          )
        : series
            .filter(
              entry =>
                extractForecastSeriesContext((entry.name || '') as string)
                  .type === ForecastSeriesEnum.Observation,
            )
            .map(entry => entry.name || '')
            .concat(extractAnnotationLabels(annotationLayers))
      ).sort((a: string, b: string) => {
        if (!legendSort) return 0;
        const left = legendGroups.labels[a] ?? a;
        const right = legendGroups.labels[b] ?? b;
        return legendSort === 'asc'
          ? left.localeCompare(right)
          : right.localeCompare(left);
      }),
    },
    series: dedupedSeries,
    toolbox: {
      show: zoomable,
      top: TIMESERIES_CONSTANTS.toolboxTop,
      right: TIMESERIES_CONSTANTS.toolboxRight,
      feature: {
        dataZoom: {
          yAxisIndex: false,
          title: {
            zoom: 'zoom area',
            back: 'restore zoom',
          },
        },
      },
    },
    dataZoom: zoomable
      ? [
          {
            type: 'slider',
            start: TIMESERIES_CONSTANTS.dataZoomStart,
            end: TIMESERIES_CONSTANTS.dataZoomEnd,
            bottom: TIMESERIES_CONSTANTS.zoomBottom,
          },
        ]
      : [],
  };

  const onFocusedSeries = (seriesName: string | null) => {
    focusedSeries = seriesName;
  };

  let customEchartOptions;
  try {
    // Parse custom EChart options safely using AST analysis
    // This replaces the unsafe `new Function()` approach with a secure parser
    // that only allows static data structures (no function callbacks)
    customEchartOptions = safeParseEChartOptions(_echartOptions);
  } catch (_) {
    customEchartOptions = undefined;
  }

  const alignedEchartOptions = alignPeriodAxis(
    echartOptions,
    timeGrainSqla,
    false,
    Boolean(controlledTimeFormatter),
  );
  const mergedEchartOptions = customEchartOptions
    ? mergeCustomEChartOptions(alignedEchartOptions, customEchartOptions)
    : alignedEchartOptions;

  return {
    formData,
    width,
    height,
    echartOptions: applyAutomaticBarSizing(mergedEchartOptions, width),
    setDataMask,
    emitCrossFilters,
    labelMap,
    labelMapB,
    groupby,
    groupbyB,
    seriesBreakdown: rawSeriesA.length,
    selectedValues: filterState.selectedValues || [],
    onContextMenu,
    onLegendStateChanged,
    legendGroups,
    onFocusedSeries,
    xValueFormatter: tooltipFormatter,
    xAxis: {
      label: xAxisLabel,
      type: xAxisType,
    },
    refs,
    coltypeMapping,
  };
}
