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
import { escape, invert } from 'lodash';
import { alignPeriodAxis } from '../utils/periodAxis';
import { t } from '@apache-superset/core/translation';
import {
  AnnotationLayer,
  AxisType,
  buildCustomFormatters,
  CategoricalColorNamespace,
  CurrencyFormatter,
  ensureIsArray,
  getCustomPeriodComparison,
  tooltipHtml,
  getCustomFormatter,
  getMetricLabel,
  getNumberFormatter,
  getXAxisLabel,
  isDefined,
  isEventAnnotationLayer,
  isFormulaAnnotationLayer,
  isIntervalAnnotationLayer,
  isPhysicalColumn,
  isTimeseriesAnnotationLayer,
  resolveAutoCurrency,
  TimeseriesChartDataResponseResult,
  TimeseriesDataRecord,
  NumberFormats,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import {
  extractExtraMetrics,
  getOriginalSeries,
  getTimeOffset,
  isDerivedSeries,
} from '@superset-ui/chart-controls';
import type { EChartsCoreOption } from 'echarts/core';
import type {
  LineStyleOption,
  CallbackDataParams,
} from 'echarts/types/src/util/types';
import type { SeriesOption } from 'echarts';
import {
  EchartsTimeseriesChartProps,
  EchartsTimeseriesFormData,
  EchartsTimeseriesSeriesType,
  OrientationType,
  TimeseriesChartTransformedProps,
} from './types';
import { DEFAULT_FORM_DATA } from './constants';
import { ForecastSeriesEnum, ForecastValue, Refs } from '../types';
import { parseAxisBound } from '../utils/controls';
import {
  calculateLowerLogTick,
  dedupSeries,
  extractDataTotalValues,
  extractSeries,
  extractShowValueIndexes,
  extractTooltipKeys,
  getAxisType,
  getColtypesMapping,
  getLegendProps,
  getMinAndMaxFromBounds,
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
  extractForecastSeriesContexts,
  extractForecastValuesFromTooltipParams,
  formatForecastTooltipSeries,
  rebaseForecastDatum,
  reorderForecastSeries,
} from '../utils/forecast';
import { convertInteger } from '../utils/convertInteger';
import { defaultGrid, defaultYAxis } from '../defaults';
import {
  getBaselineSeriesForStream,
  getPadding,
  transformEventAnnotation,
  transformFormulaAnnotation,
  transformIntervalAnnotation,
  transformSeries,
  transformTimeseriesAnnotation,
} from './transformers';
import {
  OpacityEnum,
  StackControlsValue,
  TIMEGRAIN_TO_TIMESTAMP,
  TIMESERIES_CONSTANTS,
} from '../constants';
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
  getPercentFormatter,
  getTooltipTimeFormatter,
  getXAxisFormatter,
  getYAxisFormatter,
} from '../utils/formatters';
import { safeParseEChartOptions } from '../utils/safeEChartOptionsParser';
import { getMetricDisplayName } from '../utils/metricDisplayName';
import { mergeCustomEChartOptions } from '../utils/mergeCustomEChartOptions';
import {
  buildSkuSelection,
  expandSkuAliases,
  layoutSkuRanking,
} from '../utils/skuLabels';

/*
 * 功能审计（可重写规格）：折线图点击聚焦富提示框系列
 * - 功能目的与触发方式：用户点击标准时序图系列时，为开启该开关的富提示框提供单系列聚焦。
 * - 输入契约：clickToFocusTooltipSeries 为可选布尔值，缺失按关闭处理；组件只传入非空真实 seriesName。
 * - 输出契约：首次点击选中系列，再次点击同系列恢复全部，点击其他系列切换目标；选中时隐藏 Total/百分比汇总。
 * - 处理流程：transformProps 保存当前图表实例的选中系列；tooltip formatter 仅过滤当前参数中存在的目标系列；组件在点击后重新显示当前 tooltip。
 * - 业务规则：富提示框和开关同时开启才聚焦；开关关闭或目标缺失时保持原有 tooltip 与交叉筛选行为。
 * - 状态与副作用：状态只存在当前 transform 闭包，不写数据库、接口、缓存或浏览器存储。
 * - 外部依赖：ECharts series click、tooltip formatter 和 Timeseries 组件回调。
 * - 异常与边界：目标系列不在当前横坐标数据中时回退全部系列，避免空提示框；空点击不改变状态。
 * - 不变量与约束：状态按图表实例隔离；图例、查询数据、颜色、数字显示和注释行为不受影响。
 * - 验证方式：EchartsTimeseries 组件测试覆盖开关开启、重复点击、延迟单击和关闭开关回归。
 */
export default function transformProps(
  chartProps: EchartsTimeseriesChartProps,
): TimeseriesChartTransformedProps {
  /*
   * 功能审计（可重写规格）：时序图指标与维度图例合并
   * - 功能目的与触发方式：时序图完成查询数据转换后，为带 groupby 维度或 time_compare 偏移的系列生成可读、可联动的图例。
   * - 输入契约：time_compare 为偏移文本数组；groupby 优先取当前表单，当前表单缺失维度时取原始图表表单；序列名由查询结果和 label_map 提供，允许有维度与多个指标。
   * - 输出契约：同一指标下的多个维度系列只生成一个指标图例；每个时间偏移只生成一个偏移图例；真实系列和数据仍完整保留。
   * - 处理流程：先从系列名移除配置的时间偏移，再按偏移优先、指标其次归组，最后由图表组件把虚拟图例状态同步到真实系列。
   * - 业务规则：维度值不作为额外图例；时间偏移系列按偏移合并且默认关闭；没有 groupby/time_compare 时沿用原系列名。
   * - 状态与副作用：仅生成 ECharts 选项和前端 legendState，不写入数据源；图例点击只改变当前图实例显示。
   * - 外部依赖：依赖 chart-controls 的时间偏移/原始系列解析和 ECharts legend 事件。
   * - 异常与边界：无法匹配指标的系列保持原名；空数据、空维度或空偏移不合并不相关系列。
   * - 不变量与约束：查询结果、tooltip、颜色和真实系列名称不变；点击指标或偏移图例必须同步其全部成员。
   * - 验证方式：Timeseries transformProps 单测覆盖无偏移维度合并、有偏移维度合并和真实系列保留；浏览器验证销售数量走势图例。
   */
  const {
    width,
    height,
    filterState,
    legendState,
    formData: { echartOptions: _echartOptions, ...formData },
    hooks,
    queriesData,
    datasource,
    theme,
    inContextMenu,
    emitCrossFilters,
    legendIndex,
  } = chartProps;

  let focusedSeries: string | null = null;
  let selectedTooltipSeries: string | null = null;

  const {
    verboseMap = {},
    columnFormats = {},
    currencyFormats = {},
    currencyCodeColumn,
  } = datasource;
  const [queryData] = queriesData;
  const {
    data = [],
    label_map = {},
    detected_currency: backendDetectedCurrency,
  } = queryData as TimeseriesChartDataResponseResult;

  const dataTypes = getColtypesMapping(queryData);
  const annotationData = getAnnotationData(chartProps);

  const {
    area,
    annotationLayers,
    colorScheme,
    contributionMode,
    forecastEnabled,
    groupby,
    legendOrientation,
    legendType,
    legendMargin,
    legendSort,
    logAxis,
    markerEnabled,
    markerSize,
    metrics,
    minorSplitLine,
    minorTicks,
    onlyTotal,
    opacity,
    orientation,
    percentageThreshold,
    richTooltip,
    seriesType,
    showLegend,
    showValue,
    colorByPrimaryAxis,
    sliceId,
    sortSeriesType,
    sortSeriesAscending,
    timeGrainSqla: _timeGrainSqla,
    forceMaxInterval,
    timeCompare,
    timeShiftColor,
    stack,
    tooltipTimeFormat,
    tooltipSortByMetric,
    showTooltipTotal,
    showTooltipPercentage,
    clickToFocusTooltipSeries,
    truncateXAxis,
    truncateYAxis,
    xAxis: xAxisOrig,
    xAxisBounds,
    xAxisForceCategorical,
    xAxisLabelRotation,
    xAxisLabelInterval,
    xAxisSort,
    xAxisSortAsc,
    xAxisTimeFormat,
    xAxisNumberFormat,
    xAxisTitle,
    xAxisTitleMargin,
    yAxisBounds,
    yAxisFormat,
    currencyFormat,
    yAxisTitle,
    yAxisTitleMargin,
    yAxisTitlePosition,
    zoomable,
    stackDimension,
  }: EchartsTimeseriesFormData = { ...DEFAULT_FORM_DATA, ...formData };

  const timeGrainSqla =
    (formData as any).extra_form_data?.time_grain_sqla ||
    (chartProps as any).ownState?.time_grain_sqla ||
    (chartProps as any).rawFormData?.extra_form_data?.time_grain_sqla ||
    (chartProps as any).rawFormData?.time_grain_sqla ||
    (formData as any).time_grain_sqla ||
    _timeGrainSqla;

  const refs: Refs = {};
  const configuredGroupBy = ensureIsArray(groupby);
  // 看板级表单合并可能只保留原始图表配置；查询结果仍按原始 groupby 返回时，必须继续按维度合并图例。
  const groupBy =
    configuredGroupBy.length > 0
      ? configuredGroupBy
      : ensureIsArray(chartProps.rawFormData?.groupby);
  const labelMap: { [key: string]: string[] } = Object.entries(
    label_map,
  ).reduce((acc, entry) => {
    if (
      entry[1].length > groupBy.length &&
      Array.isArray(timeCompare) &&
      timeCompare.includes(entry[1][0])
    ) {
      entry[1].shift();
    }
    return { ...acc, [entry[0]]: entry[1] };
  }, {});
  const colorScale = CategoricalColorNamespace.getScale(colorScheme as string);
  let xAxisLabel = getXAxisLabel(chartProps.rawFormData) as string;
  if (
    isPhysicalColumn(chartProps.rawFormData?.x_axis) &&
    isDefined(verboseMap[xAxisLabel])
  ) {
    xAxisLabel = verboseMap[xAxisLabel];
  }
  const xAxisDataType = dataTypes?.[xAxisLabel] ?? dataTypes?.[xAxisOrig];
  const xAxisType = getAxisType(stack, xAxisForceCategorical, xAxisDataType);
  const array = ensureIsArray(
    chartProps.rawFormData?.extra_form_data?.time_compare ??
      chartProps.rawFormData?.time_compare,
  );
  const selectedPeriod = getCustomPeriodComparison(chartProps.rawFormData);
  const customPeriod = array.includes(selectedPeriod?.comparisonTimeRange ?? '')
    ? selectedPeriod
    : undefined;
  const unfilteredData = maskCustomPeriodCurrentData(
    rebaseForecastDatum(data, verboseMap),
    xAxisLabel,
    xAxisDataType === GenericDataType.Temporal ? customPeriod : undefined,
    timeGrainSqla,
    String(chartProps.rawFormData.comparison_type ?? 'values'),
  );
  const isHorizontal = orientation === OrientationType.Horizontal;
  const isSkuAxis =
    seriesType === EchartsTimeseriesSeriesType.Bar &&
    xAxisType === AxisType.Category &&
    /sku/i.test(JSON.stringify(chartProps.rawFormData?.x_axis ?? xAxisOrig));
  const skuGroupIndex = groupBy.findIndex(column =>
    /sku/i.test(typeof column === 'string' ? column : (column.label ?? '')),
  );
  const aliasedSkuData =
    isSkuAxis && /简称/.test(xAxisLabel) && skuGroupIndex >= 0
      ? expandSkuAliases(
          unfilteredData,
          xAxisLabel,
          Object.fromEntries(
            Object.entries(labelMap)
              .filter(([, values]) => values.length >= groupBy.length)
              .map(([key, values]) => [
                key,
                String(values[values.length - groupBy.length + skuGroupIndex]),
              ]),
          ),
        )
      : undefined;
  const skuData = aliasedSkuData?.data ?? unfilteredData;
  const skuSelection = isSkuAxis
    ? {
        ...buildSkuSelection(
          xAxisLabel,
          skuData.map(row => String(row[xAxisLabel] ?? '')),
          legendState,
        ),
        axisValues: aliasedSkuData?.axisValues,
      }
    : undefined;
  const visibleSkus = new Set(
    skuSelection?.names
      .filter(key => skuSelection.selected[key])
      .map(key => skuSelection.values[key]),
  );
  const skuLabels: Record<string, string> = Object.fromEntries(
    skuSelection?.names.map(key => [
      skuSelection.values[key],
      skuSelection.labels[key],
    ]) ?? [],
  );
  const skuRanking = Boolean(skuSelection && isHorizontal);
  const skuBarsPerRow = Math.max(
    1,
    ensureIsArray(metrics).length * (array.length + 1),
  );
  const rebasedData = skuSelection
    ? skuData.filter(row => visibleSkus.has(String(row[xAxisLabel] ?? '')))
    : skuData;
  const { totalStackedValues, thresholdValues } = extractDataTotalValues(
    rebasedData,
    {
      stack,
      percentageThreshold,
      xAxisCol: xAxisLabel,
      legendState,
    },
  );
  const extraMetricLabels = extractExtraMetrics(chartProps.rawFormData).map(
    getMetricLabel,
  );

  const isMultiSeries = groupBy.length || metrics?.length > 1;

  const [rawSeries, sortedTotalValues, minPositiveValue] = extractSeries(
    rebasedData,
    {
      fillNeighborValue:
        stack && !forecastEnabled && !customPeriod ? 0 : undefined,
      xAxis: xAxisLabel,
      extraMetricLabels,
      stack,
      totalStackedValues,
      isHorizontal,
      sortSeriesType,
      sortSeriesAscending,
      xAxisSortSeries: isMultiSeries ? xAxisSort : undefined,
      xAxisSortSeriesAscending: isMultiSeries ? xAxisSortAsc : undefined,
      xAxisType,
    },
  );
  const showValueIndexes = extractShowValueIndexes(rawSeries, {
    stack,
    onlyTotal,
    isHorizontal,
    legendState,
  });
  const seriesContexts = extractForecastSeriesContexts(
    rawSeries.map(series => series.name as string),
  );
  const isAreaExpand = stack === StackControlsValue.Expand;
  const series: SeriesOption[] = [];

  const forcePercentFormatter = Boolean(contributionMode || isAreaExpand);
  const percentFormatter = forcePercentFormatter
    ? getPercentFormatter(yAxisFormat)
    : getPercentFormatter(NumberFormats.PERCENT_2_POINT);

  // Resolve currency for AUTO mode (backend detection takes precedence)
  const resolvedCurrency = resolveAutoCurrency(
    currencyFormat,
    backendDetectedCurrency,
    data,
    currencyCodeColumn,
  );

  const defaultFormatter = resolvedCurrency?.symbol
    ? new CurrencyFormatter({
        d3Format: yAxisFormat,
        currency: resolvedCurrency,
      })
    : getNumberFormatter(yAxisFormat);
  const customFormatters = buildCustomFormatters(
    metrics,
    currencyFormats,
    columnFormats,
    yAxisFormat,
    resolvedCurrency,
    data,
    currencyCodeColumn,
  );

  const effectiveRawFormData = {
    ...chartProps.rawFormData,
    time_compare: array,
  };
  const inverted = invert(verboseMap);

  // 图例是展示层分组；真实系列名仍保留维度，便于 tooltip、颜色和 ECharts 交互使用。
  const metricLegendNames = Array.from(
    new Set(
      ensureIsArray(metrics)
        .map(metric => getMetricLabel(metric))
        .filter((name): name is string => Boolean(name)),
    ),
  );
  const getMetricLegendName = (seriesName: string): string => {
    const originalSeriesName = getOriginalSeries(seriesName, array);
    return (
      metricLegendNames.find(
        metricName =>
          originalSeriesName === metricName ||
          originalSeriesName.startsWith(`${metricName}, `),
      ) ||
      (groupBy.length > 0 && metricLegendNames.length === 1
        ? metricLegendNames[0]
        : seriesName)
    );
  };

  const offsetLineWidths: { [key: string]: number } = {};

  // For horizontal bar charts, calculate min/max from data to avoid cutting off labels
  const shouldCalculateDataBounds =
    isHorizontal &&
    seriesType === EchartsTimeseriesSeriesType.Bar &&
    truncateYAxis;
  let dataMax: number | undefined;
  let dataMin: number | undefined;

  rawSeries.forEach(entry => {
    const entryName = String(entry.name || '');
    const seriesName = inverted[entryName] || entryName;
    // isDerivedSeries checks for time comparison series patterns:
    // - "metric__1 day ago" pattern (via hasTimeOffset)
    // - "1 day ago, groupby" pattern (via hasTimeOffset)
    // - exact match "1 day ago" (via seriesName parameter)
    const derivedSeries = isDerivedSeries(
      entry,
      effectiveRawFormData,
      seriesName,
    );

    const lineStyle: LineStyleOption = {};
    if (derivedSeries) {
      // Get the time offset for this series to assign different dash patterns
      const offset = getTimeOffset(entry, array) || seriesName;
      if (!offsetLineWidths[offset]) {
        offsetLineWidths[offset] = Object.keys(offsetLineWidths).length + 1;
      }
      // Use visible dash patterns that vary by offset index
      // Pattern: [dash length, gap length] - scaled to be clearly visible
      const patternIndex = offsetLineWidths[offset];
      lineStyle.type = [
        (patternIndex % 5) + 4, // dash: 4-8px (visible)
        (patternIndex % 3) + 3, // gap: 3-5px (visible)
      ];
      lineStyle.opacity = OpacityEnum.DerivedSeries;
    }

    // Calculate min/max from data for horizontal bar charts
    if (shouldCalculateDataBounds && entry.data && Array.isArray(entry.data)) {
      (entry.data as [number, any][]).forEach((datum: [number, any]) => {
        const value = datum[0];
        if (typeof value === 'number' && !Number.isNaN(value)) {
          if (dataMax === undefined || value > dataMax) {
            dataMax = value;
          }
          if (dataMin === undefined || value < dataMin) {
            dataMin = value;
          }
        }
      });
    }

    let colorScaleKey = getOriginalSeries(seriesName, array);

    // When there's a single metric with dimensions, the backend replaces the metric
    // with the time offset in derived series (e.g., "28 days ago, Medium" instead of
    // "SUM(sales), 28 days ago, Medium"). To match colors, strip the metric label
    // from original series so both produce the same key (e.g., "Medium").
    if (
      groupby &&
      groupby.length > 0 &&
      array.length > 0 &&
      metrics?.length === 1
    ) {
      const metricLabel = getMetricLabel(metrics[0]);
      colorScaleKey = colorScaleKey.replace(`${metricLabel}, `, '');
    }

    // If series name exactly matches a time offset (single metric case, no dimensions),
    // find the original series for color matching
    if (derivedSeries && array.includes(seriesName)) {
      const originalSeries = rawSeries.find(
        s =>
          !isDerivedSeries(
            s,
            effectiveRawFormData,
            inverted[String(s.name || '')] || String(s.name || ''),
          ),
      );
      if (originalSeries) {
        const originalSeriesName =
          inverted[String(originalSeries.name || '')] ||
          String(originalSeries.name || '');
        colorScaleKey = getOriginalSeries(originalSeriesName, array);
      }
    }

    const transformedSeries = transformSeries(
      entry,
      colorScale,
      colorScaleKey,
      {
        area,
        connectNulls: customPeriod ? false : derivedSeries,
        filterState,
        seriesContexts,
        markerEnabled,
        markerSize,
        areaOpacity: opacity,
        seriesType,
        legendState,
        stack,
        formatter: forcePercentFormatter
          ? percentFormatter
          : (getCustomFormatter(
              customFormatters,
              metrics,
              labelMap?.[seriesName]?.[0],
            ) ?? defaultFormatter),
        showValue,
        onlyTotal,
        totalStackedValues: sortedTotalValues,
        showValueIndexes,
        thresholdValues,
        richTooltip,
        sliceId,
        isHorizontal,
        lineStyle,
        timeCompare: array,
        timeShiftColor,
        theme,
        hasDimensions: (groupBy?.length ?? 0) > 0,
        colorByPrimaryAxis,
      },
    );
    if (transformedSeries) {
      if (stack === StackControlsValue.Stream) {
        // bug in Echarts - `stackStrategy: 'all'` doesn't work with nulls, so we cast them to 0
        series.push({
          ...transformedSeries,
          data: (transformedSeries.data as any).map(
            (row: [string | number, number]) => [row[0], row[1] ?? 0],
          ),
        });
      } else {
        series.push(transformedSeries);
      }
    }
  });

  // Add x-axis color legend when colorByPrimaryAxis is enabled
  if (colorByPrimaryAxis && groupBy.length === 0 && series.length > 0) {
    // Hide original series from legend
    series.forEach(s => {
      s.legendHoverLink = false;
    });

    // Get x-axis values from the first series
    const firstSeries = series[0];
    if (firstSeries && Array.isArray(firstSeries.data)) {
      const xAxisValues: (string | number)[] = [];

      // Extract primary axis values (category axis)
      // For horizontal charts the category is at index 1, for vertical at index 0
      const primaryAxisIndex = isHorizontal ? 1 : 0;
      (firstSeries.data as any[]).forEach(point => {
        let xValue;
        if (point && typeof point === 'object' && 'value' in point) {
          const val = point.value;
          xValue = Array.isArray(val) ? val[primaryAxisIndex] : val;
        } else if (Array.isArray(point)) {
          xValue = point[primaryAxisIndex];
        } else {
          xValue = point;
        }
        xAxisValues.push(xValue);
      });

      // Create hidden series for legend (using 'line' type to not affect bar width)
      // Deduplicate x-axis values to avoid duplicate legend entries and unnecessary series
      const uniqueXAxisValues = Array.from(
        new Set(xAxisValues.map(v => String(v))),
      );
      uniqueXAxisValues.forEach(xValue => {
        const colorKey = xValue;
        series.push({
          name: xValue,
          type: 'line', // Use line type to not affect bar positioning
          data: [], // Empty - doesn't render
          itemStyle: {
            color: colorScale(colorKey, sliceId),
          },
          lineStyle: {
            color: colorScale(colorKey, sliceId),
          },
          silent: true,
          legendHoverLink: false,
          showSymbol: false,
        });
      });
    }
  }

  if (stack === StackControlsValue.Stream) {
    const baselineSeries = getBaselineSeriesForStream(
      series.map(entry => entry.data) as [string | number, number][][],
      seriesType,
    );

    series.unshift(baselineSeries);
  }
  const selectedValues = (filterState.selectedValues || []).reduce(
    (acc: Record<string, number>, selectedValue: string) => {
      const index = series.findIndex(({ name }) => name === selectedValue);
      return {
        ...acc,
        [index]: selectedValue,
      };
    },
    {},
  );

  annotationLayers
    .filter((layer: AnnotationLayer) => layer.show)
    .forEach((layer: AnnotationLayer) => {
      if (isFormulaAnnotationLayer(layer))
        series.push(
          transformFormulaAnnotation(
            layer,
            rebasedData as TimeseriesDataRecord[],
            xAxisLabel,
            xAxisType,
            colorScale,
            sliceId,
            orientation,
          ),
        );
      else if (isIntervalAnnotationLayer(layer)) {
        series.push(
          ...transformIntervalAnnotation(
            layer,
            data,
            annotationData,
            colorScale,
            theme,
            sliceId,
            orientation,
          ),
        );
      } else if (isEventAnnotationLayer(layer)) {
        series.push(
          ...transformEventAnnotation(
            layer,
            data,
            annotationData,
            colorScale,
            theme,
            sliceId,
            orientation,
          ),
        );
      } else if (isTimeseriesAnnotationLayer(layer)) {
        series.push(
          ...transformTimeseriesAnnotation(
            layer,
            markerSize,
            data,
            annotationData,
            colorScale,
            sliceId,
            orientation,
          ),
        );
      }
    });

  if (
    stack === StackControlsValue.Stack &&
    stackDimension &&
    chartProps.rawFormData.groupby
  ) {
    const idxSelectedDimension =
      formData.metrics.length > 1
        ? 1
        : 0 + chartProps.rawFormData.groupby.indexOf(stackDimension);
    for (const s of series) {
      if (s.id) {
        const columnsArr = labelMap[s.id];
        (s as any).stack = columnsArr[idxSelectedDimension];
      }
    }
  }

  // axis bounds need to be parsed to replace incompatible values with undefined
  const [xAxisMin, xAxisMax] = (xAxisBounds || []).map(parseAxisBound);
  let [yAxisMin, yAxisMax] = (yAxisBounds || []).map(parseAxisBound);

  // default to 0-100% range when doing row-level contribution chart
  if ((contributionMode === 'row' || isAreaExpand) && stack) {
    if (yAxisMin === undefined) yAxisMin = 0;
    if (yAxisMax === undefined) yAxisMax = 1;
  } else if (
    logAxis &&
    yAxisMin === undefined &&
    minPositiveValue !== undefined
  ) {
    yAxisMin = calculateLowerLogTick(minPositiveValue);
  }

  // For horizontal bar charts, set max/min from calculated data bounds
  if (shouldCalculateDataBounds) {
    // Set max to actual data max to avoid gaps and ensure labels are visible
    if (dataMax !== undefined && yAxisMax === undefined) {
      yAxisMax = dataMax;
    }
    // Set min to actual data min for diverging bars
    if (dataMin !== undefined && yAxisMin === undefined && dataMin < 0) {
      yAxisMin = dataMin;
    }
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
      : xAxisDataType === GenericDataType.Numeric
        ? getNumberFormatter(xAxisNumberFormat)
        : String;

  const {
    setDataMask = () => {},
    setControlValue = () => {},
    onContextMenu,
    onLegendStateChanged,
    onLegendScroll,
  } = hooks;

  const addYAxisLabelOffset =
    !!yAxisTitle && convertInteger(yAxisTitleMargin) !== 0;
  const addXAxisLabelOffset =
    !!xAxisTitle && convertInteger(xAxisTitleMargin) !== 0;
  const hasTimeCompare = array.length > 0;
  const legendVisible =
    skuSelection && colorByPrimaryAxis
      ? false
      : hasTimeCompare
        ? true
        : showLegend;
  const padding = getPadding(
    legendVisible,
    legendOrientation,
    addYAxisLabelOffset,
    zoomable,
    legendMargin,
    addXAxisLabelOffset,
    yAxisTitlePosition,
    convertInteger(yAxisTitleMargin),
    convertInteger(xAxisTitleMargin),
    isHorizontal,
  );

  /*
   * 功能审计（可重写规格）：标准时序图逻辑图例
   * - 功能目的与触发方式：标准 bar、line、smooth、scatter、step 时序图完成系列转换后调用，统一处理维度合并、时间对比和用户图例状态。
   * - 输入契约：真实 series.name、metrics、groupby、time_compare 和 ChartRenderer 传入的 legendState；比较偏移为空表示当前期。
   * - 输出契约：legend.data 使用真实系列代表值，formatter 单独映射显示文本；legend.selected 展开到所有真实成员，legendGroups 提供分组及父子关系。
   * - 处理流程：按当前指标或 offset 建立逻辑组，解析旧状态和本次 ECharts 事件状态，再生成图例和系列选择配置。
   * - 业务规则：同一指标的多个维度共用一个当前图例；同一 offset 共用一个对比图例；对比系列必须同时满足 offset 组和父当前指标组打开；当前组默认打开、对比组默认关闭。
   * - 状态与副作用：只生成客户端 ECharts 选项并回传图例状态，不写看板数据库、接口或浏览器存储；点击提示框聚焦逻辑保持不变。
   * - 外部依赖：依赖 chart-controls 的时间偏移解析、ECharts legend 事件和 ChartRenderer 的按图表实例状态保存。
   * - 异常与边界：缺失 groupby 时回退 rawFormData；无法匹配指标标签时使用去偏移系列名；colorByPrimaryAxis 不进入逻辑分组。
   * - 不变量与约束：图例代表值必须是实际 series.name；查询刷新和比较开关切换不能清除仍存在的隐藏状态；普通 tooltip、数字显示、颜色、注释和分页保持不变；自定义期间 tooltip 按对齐桶显示当前和对比列。
   * - 验证方式：Timeseries transform/component 单测覆盖标准图、维度、多个 offset、父组关闭、全选和无对比回归。
   */
  const shouldGroupLogicalLegends =
    !colorByPrimaryAxis && (hasTimeCompare || groupBy.length > 0);
  const annotationLabels = new Set(extractAnnotationLabels(annotationLayers));
  const metricLabels = Array.from(
    new Set(
      [
        ...ensureIsArray(metrics).map(getMetricLabel),
        ...extraMetricLabels,
      ].filter(Boolean),
    ),
  ).sort((left, right) => right.length - left.length);
  const getCurrentLegendLabel = (seriesName: string): string => {
    if (customPeriod && array.includes(seriesName) && metricLabels.length === 1)
      return metricLabels[0];
    const originalName = getOriginalSeries(seriesName, array);
    if (groupBy.length === 0) return originalName;
    return (
      metricLabels.find(
        metric =>
          originalName === metric || originalName.startsWith(`${metric}, `),
      ) ?? originalName.split(',')[0].trim()
    );
  };
  const legendInputs: LegendGroupInput[] = series
    .filter(
      entry =>
        extractForecastSeriesContext(String(entry.name || '')).type ===
          ForecastSeriesEnum.Observation &&
        !annotationLabels.has(String(entry.name || '')),
    )
    .map(entry => ({
      name: String(entry.name || ''),
      currentLabel: getCurrentLegendLabel(String(entry.name || '')),
      timeOffset:
        customPeriod && array.includes(String(entry.name))
          ? String(entry.name)
          : getTimeOffset(entry, array) || undefined,
    }));
  const emptyLegendMetadata: LegendGroupMetadata = {
    groups: {},
    labels: {},
    kinds: {},
    parents: {},
    stateKeys: {},
  };
  const legendGroups = shouldGroupLogicalLegends
    ? buildLegendGroupMetadata(legendInputs, Boolean(customPeriod))
    : emptyLegendMetadata;
  if (customPeriod)
    styleCustomPeriodComparisonSeries(series, colorScale, legendGroups);
  const groupedLegendState = shouldGroupLogicalLegends
    ? resolveLegendState(
        legendState,
        legendGroups,
        customPeriod?.comparisonTimeRange,
      )
    : legendState;
  const legendData =
    colorByPrimaryAxis && groupBy.length === 0 && series.length > 0
      ? // When colorByPrimaryAxis is enabled, show only primary axis values (deduped + filtered)
        (() => {
          const firstSeries = series[0];
          // For horizontal charts the category is at index 1, for vertical at index 0
          const primaryAxisIndex = isHorizontal ? 1 : 0;
          if (firstSeries && Array.isArray(firstSeries.data)) {
            const names = (firstSeries.data as any[])
              .map(point => {
                if (point && typeof point === 'object' && 'value' in point) {
                  const val = point.value;
                  return String(
                    Array.isArray(val) ? val[primaryAxisIndex] : val,
                  );
                }
                if (Array.isArray(point)) {
                  return String(point[primaryAxisIndex]);
                }
                return String(point);
              })
              .filter(
                name => name !== '' && name !== 'undefined' && name !== 'null',
              );
            return Array.from(new Set(names));
          }
          return [];
        })()
      : // Otherwise show original series names or logical group representatives
        shouldGroupLogicalLegends
        ? Object.keys(legendGroups.groups)
            .filter(
              entry =>
                extractForecastSeriesContext(entry).type ===
                ForecastSeriesEnum.Observation,
            )
            .concat(extractAnnotationLabels(annotationLayers))
        : rawSeries
            .filter(
              entry =>
                extractForecastSeriesContext(entry.name || '').type ===
                ForecastSeriesEnum.Observation,
            )
            .map(entry => entry.name || '')
            .concat(extractAnnotationLabels(annotationLayers));

  let xAxis: any = {
    type: xAxisType,
    name: xAxisTitle,
    nameGap: convertInteger(xAxisTitleMargin),
    nameLocation: 'middle',
    axisLabel: {
      // When rotation is applied on time axes, hideOverlap can
      // aggressively hide the last label. Rotated labels already
      // have less overlap, so disabling hideOverlap is safe.
      // At 0° rotation, keep hideOverlap to prevent long labels
      // from overlapping each other, with showMaxLabel to ensure
      // the last data point label stays visible (#37181).
      hideOverlap: !(xAxisType === AxisType.Time && xAxisLabelRotation !== 0),
      ...(controlledTimeFormatter && xAxisDataType === GenericDataType.Temporal
        ? { color: CUSTOM_TIME_TEXT_COLOR }
        : {}),
      formatter: xAxisFormatter,
      rotate: xAxisLabelRotation,
      interval: xAxisLabelInterval,
      // Force last label on non-rotated time axes to prevent
      // hideOverlap from hiding it. Skipped when rotated to
      // avoid phantom labels at the axis boundary.
      ...(xAxisType === AxisType.Time &&
        xAxisLabelRotation === 0 && {
          showMaxLabel: true,
          alignMaxLabel: 'right',
        }),
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
      seriesType,
    ),
  };

  let yAxis: any = {
    ...defaultYAxis,
    type: logAxis ? AxisType.Log : AxisType.Value,
    min: yAxisMin,
    max: yAxisMax,
    minorTick: { show: minorTicks },
    minorSplitLine: { show: minorSplitLine },
    axisLabel: {
      formatter: getYAxisFormatter(
        metrics,
        forcePercentFormatter,
        customFormatters,
        defaultFormatter,
        yAxisFormat,
      ),
    },
    scale: truncateYAxis,
    name: yAxisTitle,
    nameGap: convertInteger(yAxisTitleMargin),
    nameLocation: yAxisTitlePosition === 'Left' ? 'middle' : 'end',
  };

  // Increase right padding for rotated time axis labels to prevent
  // the last label from being clipped at the chart boundary.
  if (
    xAxisType === AxisType.Time &&
    xAxisLabelRotation !== 0 &&
    !isHorizontal
  ) {
    padding.right = Math.max(
      padding.right || 0,
      TIMESERIES_CONSTANTS.gridOffsetRight +
        Math.ceil(
          Math.abs(Math.sin((xAxisLabelRotation * Math.PI) / 180)) * 80,
        ),
    );
  }

  if (isHorizontal) {
    [xAxis, yAxis] = [yAxis, xAxis];
    [padding.bottom, padding.left] = [padding.left, padding.bottom];
    // Increase right padding for horizontal bar charts to ensure value labels are visible
    if (seriesType === EchartsTimeseriesSeriesType.Bar && showValue) {
      padding.right = Math.max(
        padding.right || 0,
        TIMESERIES_CONSTANTS.horizontalBarLabelRightPadding,
      );
    }
    // Explicitly set yAxis.data to preserve SQL ORDER BY for categorical axis.
    // Without this, ECharts auto-sorts categories alphabetically.
    if (xAxisType === AxisType.Category && rawSeries.length > 0) {
      const firstSeries = rawSeries[0];
      const seenCats = new Set<string>();
      const categoryData: string[] = [];
      if (Array.isArray(firstSeries.data)) {
        (firstSeries.data as any[]).forEach(d => {
          const cat = Array.isArray(d) ? d[1] : (d as any)?.value?.[1];
          const catStr = String(cat ?? '');
          if (cat !== null && cat !== undefined && !seenCats.has(catStr)) {
            seenCats.add(catStr);
            categoryData.push(catStr);
          }
        });
      }
      if (categoryData.length > 0) {
        (yAxis as any).data = categoryData;
      }
    }
  }

  if (skuSelection) {
    const categoryAxis = isHorizontal ? yAxis : xAxis;
    categoryAxis.axisLabel = {
      ...categoryAxis.axisLabel,
      formatter: (value: string) => skuLabels[value] ?? value,
      width: skuRanking
        ? Math.max(100, width - 64)
        : Math.max(72, Math.min(190, width * 0.3)),
      overflow: skuRanking ? 'break' : 'truncate',
      rotate: 0,
      color: theme.colorTextSecondary,
      ...(skuRanking
        ? {
            inside: true,
            align: 'left',
            verticalAlign: 'bottom',
            padding: [0, 0, 10 + skuBarsPerRow * 8, 0],
            margin: 0,
            lineHeight: 16,
            fontSize: 13,
            interval: 0,
            hideOverlap: false,
          }
        : {}),
    };
    categoryAxis.triggerEvent = true;
    categoryAxis.data = [
      ...new Set(rebasedData.map(row => String(row[xAxisLabel] ?? ''))),
    ];
    categoryAxis.name = skuRanking ? '' : 'SKU';
    categoryAxis.tooltip = {
      show: !skuRanking,
      formatter: ({ value }: { value: string }) => escape(String(value)),
    };
    if (skuRanking) {
      categoryAxis.axisLine = { show: false };
      categoryAxis.axisTick = { show: false };
      Object.assign(padding, { left: 16, right: 84, top: 38, bottom: 42 });
    }
  }

  const legendProps = getLegendProps(
    legendType,
    legendOrientation,
    legendVisible,
    theme,
    zoomable,
    colorByPrimaryAxis ? legendState : groupedLegendState,
    padding,
  );

  const echartOptions: EChartsCoreOption = {
    useUTC: true,
    ...(skuSelection ? { backgroundColor: theme.colorBgContainer } : {}),
    grid: {
      ...defaultGrid,
      ...padding,
      ...(skuRanking ? { containLabel: false } : {}),
    },
    xAxis,
    yAxis,
    tooltip: {
      ...getDefaultTooltip(refs),
      ...(customPeriod ? CUSTOM_PERIOD_TOOLTIP_STYLE : {}),
      show: !inContextMenu,
      trigger: richTooltip ? 'axis' : 'item',
      formatter: (params: any) => {
        const [xIndex, yIndex] = isHorizontal ? [1, 0] : [0, 1];
        const xValue: number = richTooltip
          ? params[0].value[xIndex]
          : params.value[xIndex];
        const forecastValue: CallbackDataParams[] = richTooltip
          ? params
          : [params];
        const sortedKeys = extractTooltipKeys(
          forecastValue,
          yIndex,
          richTooltip,
          tooltipSortByMetric,
        );
        const filteredForecastValue = forecastValue.filter(
          (item: CallbackDataParams) =>
            !annotationLayers.some(
              (annotation: AnnotationLayer) =>
                item.seriesName === annotation.name,
            ),
        );
        const forecastValues: Record<string, ForecastValue> =
          extractForecastValuesFromTooltipParams(forecastValue, isHorizontal);

        const filteredForecastValues: Record<string, ForecastValue> =
          extractForecastValuesFromTooltipParams(
            filteredForecastValue,
            isHorizontal,
          );

        const isForecast = Object.values(forecastValues).some(
          value =>
            value.forecastTrend || value.forecastLower || value.forecastUpper,
        );

        const formatter = forcePercentFormatter
          ? percentFormatter
          : (getCustomFormatter(customFormatters, metrics) ?? defaultFormatter);

        const rows: string[][] = [];
        const total = Object.values(filteredForecastValues).reduce(
          (acc, value) =>
            value.observation !== undefined ? acc + value.observation : acc,
          0,
        );
        const allowTotal = Boolean(isMultiSeries) && richTooltip && !isForecast;
        const keys = Object.keys(forecastValues);
        const selectedSeriesName =
          richTooltip &&
          clickToFocusTooltipSeries &&
          selectedTooltipSeries &&
          keys.includes(selectedTooltipSeries)
            ? selectedTooltipSeries
            : null;
        if (customPeriod && !isForecast) {
          const tooltipPoints = sortedKeys.flatMap(key =>
            forecastValue.filter(point => String(point.seriesId) === key),
          );
          return formatCustomPeriodTooltip({
            params: stack ? tooltipPoints.reverse() : tooltipPoints,
            series: echartOptions.series as SeriesOption[],
            period: customPeriod,
            timeGrain: timeGrainSqla,
            temporalAxis: xAxisDataType === GenericDataType.Temporal,
            xIndex,
            yIndex,
            itemTooltip: !richTooltip,
            legendState: groupedLegendState,
            focusedSeries,
            selectedSeries: selectedSeriesName,
            originalSeriesForKey: key =>
              key === customPeriod.comparisonTimeRange &&
              metrics.length === 1 &&
              groupBy.length === 0
                ? getMetricDisplayName(metrics[0], verboseMap)
                : getOriginalSeries(key, array),
            formatterForSeries: () => formatter,
            comparisonTypeForSeries: () =>
              String(chartProps.rawFormData.comparison_type ?? 'values'),
          });
        }
        const isTooltipSeriesSelected = selectedSeriesName !== null;
        const showPercentage =
          allowTotal &&
          !isTooltipSeriesSelected &&
          !forcePercentFormatter &&
          showTooltipPercentage;
        let focusedRow;
        sortedKeys
          .filter(
            key =>
              keys.includes(key) &&
              (selectedSeriesName === null || key === selectedSeriesName),
          )
          .forEach(key => {
            const value = forecastValues[key];
            if (value.observation === 0 && stack) {
              return;
            }
            const row = formatForecastTooltipSeries({
              ...value,
              seriesName: key,
              formatter,
            });

            const annotationRow = annotationLayers.some(
              item => item.name === key,
            );

            if (
              showPercentage &&
              value.observation !== undefined &&
              !annotationRow
            ) {
              row.push(
                percentFormatter.format(value.observation / (total || 1)),
              );
            }
            rows.push(row);
            if (key === focusedSeries) {
              focusedRow = rows.length - 1;
            }
          });
        if (stack) {
          rows.reverse();
          if (focusedRow !== undefined) {
            focusedRow = rows.length - focusedRow - 1;
          }
        }
        if (allowTotal && showTooltipTotal) {
          const totalRow = ['Total', formatter.format(total)];
          if (showPercentage) {
            totalRow.push(percentFormatter.format(1));
          }
          rows.push(totalRow);
        }
        return tooltipHtml(
          rows,
          skuRanking
            ? `<span style="display:inline-block;max-width:360px;white-space:normal;overflow-wrap:anywhere">${escape(skuLabels[String(xValue)] ?? String(xValue)).replace(/\n/g, '<br/>')}</span>`
            : tooltipFormatter(xValue),
          focusedRow,
        );
      },
    },
    legend: {
      ...legendProps,
      ...(skuRanking && legendData.length <= 1 ? { show: false } : {}),
      ...(customPeriod ? { itemWidth: 14, itemHeight: 9, itemGap: 16 } : {}),
      ...(controlledTimeFormatter || customPeriod || skuSelection
        ? {
            textStyle: {
              ...legendProps.textStyle,
              color: skuSelection
                ? theme.colorTextSecondary
                : CUSTOM_TIME_TEXT_COLOR,
            },
            selectorLabel: {
              ...legendProps.selectorLabel,
              color: skuSelection
                ? theme.colorTextSecondary
                : CUSTOM_TIME_TEXT_COLOR,
            },
          }
        : {}),
      scrollDataIndex: legendIndex || 0,
      ...(shouldGroupLogicalLegends
        ? {
            formatter: (name: string) =>
              customPeriod && legendGroups.kinds[name] === 'comparison'
                ? formatCustomPeriodLegendLabel(
                    customPeriod,
                    legendGroups.labels[name],
                  )
                : (legendGroups.labels[name] ?? name),
          }
        : {}),
      data:
        colorByPrimaryAxis && groupBy.length === 0
          ? // When colorByPrimaryAxis, configure legend items with roundRect icons
            legendData.map(name => ({
              name,
              icon: 'roundRect',
            }))
          : // Otherwise use normal legend data
            legendData.sort((a: string, b: string) => {
              if (!legendSort) return 0;
              const left = legendGroups.labels[a] ?? a;
              const right = legendGroups.labels[b] ?? b;
              return legendSort === 'asc'
                ? left.localeCompare(right)
                : right.localeCompare(left);
            }),
      // Disable legend selection and buttons when colorByPrimaryAxis is enabled
      ...(colorByPrimaryAxis && groupBy.length === 0
        ? {
            selectedMode: false, // Disable clicking legend items
            selector: false, // Hide All/Invert buttons
          }
        : {}),
    },
    series: dedupSeries(reorderForecastSeries(series) as SeriesOption[]),
    toolbox: {
      show: zoomable,
      top: TIMESERIES_CONSTANTS.toolboxTop,
      right: TIMESERIES_CONSTANTS.toolboxRight,
      feature: {
        dataZoom: {
          ...(stack ? { yAxisIndex: false } : {}), // disable y-axis zoom for stacked charts
          title: {
            zoom: t('zoom area'),
            back: t('restore zoom'),
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
            yAxisIndex: isHorizontal ? 0 : undefined,
          },
          {
            type: 'inside',
            yAxisIndex: 0,
            zoomOnMouseWheel: false,
            moveOnMouseWheel: true,
          },
          {
            type: 'inside',
            xAxisIndex: 0,
            zoomOnMouseWheel: false,
            moveOnMouseWheel: true,
          },
        ]
      : [],
  };

  const onFocusedSeries = (seriesName: string | null) => {
    focusedSeries = seriesName;
  };

  const onTooltipSeriesClick = (seriesName: string) => {
    if (!richTooltip || !clickToFocusTooltipSeries) return;
    selectedTooltipSeries =
      selectedTooltipSeries === seriesName ? null : seriesName;
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
    isHorizontal,
    Boolean(controlledTimeFormatter),
  );
  let mergedEchartOptions = customEchartOptions
    ? mergeCustomEChartOptions(alignedEchartOptions, customEchartOptions)
    : alignedEchartOptions;

  let minCategoryHeight: number | undefined;
  if (skuRanking) {
    mergedEchartOptions = {
      ...mergedEchartOptions,
      dataZoom: [
        {
          id: 'matrix-rows',
          type: 'slider',
          yAxisIndex: 0,
          start: 0,
          end: 100,
          right: 0,
          width: 12,
          top: 38,
          bottom: 42,
          zoomLock: false,
          // Resize the scroll content after release so dragging keeps its handle.
          realtime: false,
          show: false,
          showDetail: false,
          filterMode: 'empty',
        },
      ],
      series: ensureIsArray(mergedEchartOptions.series as SeriesOption[]).map(
        entry =>
          entry.type === 'bar'
            ? {
                ...entry,
                barMaxWidth: 14,
                labelLayout: () => ({ x: width - 48, align: 'right' as const }),
              }
            : entry,
      ),
    };
    const layout = layoutSkuRanking(
      mergedEchartOptions,
      width,
      skuLabels,
      skuBarsPerRow,
      undefined,
      legendGroups,
    );
    mergedEchartOptions = layout.echartOptions;
    minCategoryHeight = layout.minCategoryHeight;
  }

  // If visualMap is configured, remove static itemStyle.color from series so
  // visualMap can control per-bar colors (static color overrides visualMap).
  if (
    (mergedEchartOptions as any).visualMap &&
    Array.isArray((mergedEchartOptions as any).series)
  ) {
    mergedEchartOptions = {
      ...mergedEchartOptions,
      series: ((mergedEchartOptions as any).series as any[]).map(s => {
        if (s && s.itemStyle && s.itemStyle.color !== undefined) {
          const { color: _color, ...restItemStyle } = s.itemStyle;
          return { ...s, itemStyle: restItemStyle };
        }
        return s;
      }),
    };
  }

  return {
    echartOptions: mergedEchartOptions,
    emitCrossFilters,
    formData,
    groupby: groupBy,
    height,
    labelMap,
    selectedValues,
    setDataMask,
    setControlValue,
    width,
    legendData,
    legendGroups,
    skuSelection,
    minCategoryHeight,
    skuBarsPerRow,
    onContextMenu,
    onLegendStateChanged,
    onFocusedSeries,
    onTooltipSeriesClick,
    xValueFormatter: tooltipFormatter,
    xAxis: {
      label: xAxisLabel,
      type: xAxisType,
    },
    refs,
    coltypeMapping: dataTypes,
    onLegendScroll,
  };
}
