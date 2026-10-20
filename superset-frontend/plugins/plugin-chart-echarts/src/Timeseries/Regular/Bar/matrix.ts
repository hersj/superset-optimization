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
import type {
  BarSeriesOption,
  CustomSeriesOption,
  CustomSeriesRenderItem,
  SeriesOption,
} from 'echarts';
import type { CallbackDataParams } from 'echarts/types/src/util/types';
import { t } from '@apache-superset/core/translation';
import {
  AxisType,
  DataRecordValue,
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  getNumberFormatter,
  getValueFormatter,
  getXAxisColumn,
  getXAxisLabel,
  QueryFormColumn,
  QueryFormData,
  tooltipHtml,
} from '@superset-ui/core';
import { getOriginalSeries, getTimeOffset } from '@superset-ui/chart-controls';
import buildQuery from '../../buildQuery';
import { DEFAULT_FORM_DATA } from '../../constants';
import {
  EchartsTimeseriesChartProps,
  MatrixBarDatum,
  OrientationType,
  TimeseriesChartTransformedProps,
} from '../../types';
import { getDefaultTooltip } from '../../../utils/tooltip';

export function buildBarQuery(formData: QueryFormData) {
  const yAxis = formData.y_axis_dimension as QueryFormColumn | undefined;
  if (!yAxis) return buildQuery(formData);
  if (getColumnLabel(yAxis) === getXAxisLabel(formData)) {
    throw new Error(t('二维柱状图的 X 轴和 Y 轴请选择不同维度。'));
  }
  return buildQuery({ ...formData, groupby: [yAxis], forecast_enabled: false });
}

// Reuse the bar query, metric formats, colors and comparison legends; only replace its coordinates.
export function transformBarMatrix(
  chartProps: EchartsTimeseriesChartProps,
  base: TimeseriesChartTransformedProps,
): TimeseriesChartTransformedProps {
  const {
    formData: inputFormData,
    theme,
    datasource,
    queriesData,
  } = chartProps;
  const formData = { ...DEFAULT_FORM_DATA, ...inputFormData };
  const yColumn = formData.yAxisDimension!;
  const yLabel = getColumnLabel(yColumn);
  const xColumn = getXAxisColumn(chartProps.rawFormData)!;
  const { metrics } = formData;
  const offsets = ensureIsArray(
    chartProps.rawFormData.extra_form_data?.time_compare ??
      chartProps.rawFormData.time_compare,
  );
  const xValues: DataRecordValue[] = [];
  const yValues: DataRecordValue[] = [];
  const xIndexes = new Map<DataRecordValue, number>();
  const yIndexes = new Map<DataRecordValue, number>();
  const slots = new Map<string, number>();
  const domains = new Map<string, [number, number]>();
  const sourceSeries = ensureIsArray(
    base.echartOptions.series as SeriesOption[],
  ).filter(
    (series): series is BarSeriesOption =>
      series.type === 'bar' && Boolean(series.data?.length),
  );
  const entries = sourceSeries.map(source => {
    const name = String(source.name);
    const dimensions = base.labelMap[name];
    if (!dimensions?.length)
      throw new Error(t('二维柱状图缺少维度映射，请重新运行查询。'));
    const y = dimensions[dimensions.length - 1];
    if (!yIndexes.has(y)) {
      yIndexes.set(y, yValues.length);
      yValues.push(y);
    }
    const originalName = getOriginalSeries(name, offsets);
    const metric =
      metrics.find(
        metric =>
          originalName === getMetricLabel(metric) ||
          originalName.startsWith(`${getMetricLabel(metric)}, `),
      ) ?? metrics[0];
    const offset = getTimeOffset({ name }, offsets) ?? '';
    const rate = Boolean(
      offset &&
      ['percentage', 'ratio'].includes(String(formData.comparisonType)),
    );
    const domainKey = JSON.stringify([getMetricLabel(metric), rate]);
    const slotKey = JSON.stringify([getMetricLabel(metric), offset]);
    if (!slots.has(slotKey)) slots.set(slotKey, slots.size);
    const domain = domains.get(domainKey) ?? [0, 0];
    const points: MatrixBarDatum[] = [];
    (
      source.data as (
        | [DataRecordValue, number | null]
        | { value: [DataRecordValue, number | null] }
      )[]
    ).forEach(datum => {
      const [x, value] = Array.isArray(datum) ? datum : datum.value;
      if (!xIndexes.has(x)) {
        xIndexes.set(x, xValues.length);
        xValues.push(x);
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      domain[0] = Math.min(domain[0], value);
      domain[1] = Math.max(domain[1], value);
      points.push({
        value: [xIndexes.get(x)!, yIndexes.get(y)!, value],
        dimensionValues: [x, y],
      });
    });
    domains.set(domainKey, domain);
    const formatter =
      rate || formData.contributionMode
        ? getNumberFormatter('.1%')
        : getValueFormatter(
            metric,
            datasource.currencyFormats ?? {},
            datasource.columnFormats ?? {},
            formData.yAxisFormat,
            formData.currencyFormat,
            undefined,
            queriesData[0].data,
            datasource.currencyCodeColumn,
            queriesData[0].detected_currency,
          );
    return {
      source,
      name,
      domainKey,
      slot: slots.get(slotKey)!,
      points,
      formatter,
    };
  });
  const horizontal = formData.orientation === OrientationType.Horizontal;
  const slotCount = Math.max(slots.size, 1);
  const series: CustomSeriesOption[] = entries.map(
    ({ source, name, domainKey, slot, points, formatter }) => {
      const [min, max] = domains.get(domainKey)!;
      const unit = Math.max(-min, max) || 1;
      const lower = min / unit;
      const upper = max / unit;
      const divisor = upper - lower || 1;
      const renderItem: CustomSeriesRenderItem = (_params, api) => {
        const value = Number(api.value(2));
        const center = api.coord([api.value(0), api.value(1)]);
        const cell = api.size!([1, 1]) as number[];
        const cellWidth = Math.abs(cell[0]);
        const cellHeight = Math.abs(cell[1]);
        const left = center[0] - cellWidth * 0.4;
        const top = center[1] - cellHeight * 0.36;
        const width = cellWidth * 0.8;
        const height = cellHeight * (formData.showValue ? 0.62 : 0.72);
        const slotWidth = horizontal ? width : width / slotCount;
        const slotHeight = horizontal ? height / slotCount : height;
        const x = left + (horizontal ? 0 : slot * slotWidth);
        const y = top + (horizontal ? slot * slotHeight : 0);
        const zero = horizontal
          ? x + (-lower / divisor) * slotWidth
          : y + (upper / divisor) * slotHeight;
        const end =
          zero +
          (horizontal ? 1 : -1) *
            (value / unit / divisor) *
            (horizontal ? slotWidth : slotHeight);
        return {
          type: 'group',
          children: [
            {
              type: 'line',
              shape: horizontal
                ? { x1: zero, x2: zero, y1: y, y2: y + slotHeight }
                : { x1: x, x2: x + slotWidth, y1: zero, y2: zero },
              style: { stroke: theme.colorBorderSecondary, lineWidth: 1 },
              silent: true,
            },
            {
              type: 'rect',
              shape: horizontal
                ? {
                    x: Math.min(zero, end),
                    y: y + slotHeight * 0.18,
                    width: Math.abs(end - zero),
                    height: slotHeight * 0.64,
                    r: theme.borderRadiusXS,
                  }
                : {
                    x: x + slotWidth * 0.18,
                    y: Math.min(zero, end),
                    width: slotWidth * 0.64,
                    height: Math.abs(end - zero),
                    r: theme.borderRadiusXS,
                  },
              style: {
                fill: value < 0 ? theme.colorError : api.visual('color'),
              },
              transition: ['shape'],
            },
            ...(formData.showValue && slotWidth > 24 && slotHeight > 22
              ? [
                  {
                    type: 'text' as const,
                    x: x + slotWidth / 2,
                    y: horizontal ? y + slotHeight : y + height + 3,
                    silent: true,
                    style: {
                      text: formatter(value),
                      fill: theme.colorText,
                      fontSize: theme.fontSizeSM,
                      fontFamily: theme.fontFamily,
                      align: 'center' as const,
                      verticalAlign: 'top' as const,
                      width: slotWidth - 4,
                      overflow: 'truncate' as const,
                    },
                  },
                ]
              : []),
          ],
        };
      };
      return {
        name,
        type: 'custom',
        renderItem,
        data: points,
        encode: { x: 0, y: 1, tooltip: 2 },
        clip: true,
        progressive: 0,
        itemStyle: {
          color:
            typeof source.itemStyle?.color === 'function'
              ? undefined
              : source.itemStyle?.color,
        },
        tooltip: { valueFormatter: value => formatter(Number(value)) },
      };
    },
  );
  const visibleRows = Math.max(
    1,
    Math.floor((chartProps.height - 110) / Math.max(120, slotCount * 48)),
  );
  const scrollRows = yValues.length > visibleRows;
  const label = (value: DataRecordValue) =>
    value == null ? t('NULL') : String(value);
  const xLabel = (value: DataRecordValue) =>
    typeof value === 'string' || typeof value === 'number'
      ? base.xAxis.type === AxisType.Time
        ? base.xValueFormatter(Number(value))
        : String(value)
      : label(value);
  return {
    ...base,
    formData: {
      ...base.formData,
      orientation: formData.orientation,
      showExtraControls: false,
    },
    matrixDimensions: [
      xColumn === '__timestamp' ? formData.granularitySqla : xColumn,
      yColumn,
    ],
    matrixTimeGrain:
      base.xAxis.type === AxisType.Time ? formData.timeGrainSqla : undefined,
    xAxis: { ...base.xAxis, type: AxisType.Category },
    echartOptions: {
      ...base.echartOptions,
      grid: {
        top: formData.showLegend ? 65 : 35,
        left: 25,
        right: formData.zoomable || scrollRows ? 45 : 25,
        bottom: formData.zoomable ? 65 : 25,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xValues.map(xLabel),
        position: 'top',
        name: formData.xAxisTitle || base.xAxis.label,
        nameLocation: 'middle',
        nameGap: 28,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { interval: 0, hideOverlap: true, color: theme.colorText },
        splitLine: {
          show: true,
          lineStyle: { color: theme.colorBorderSecondary },
        },
      },
      yAxis: {
        type: 'category',
        data: yValues.map(label),
        inverse: true,
        name: formData.yAxisTitle || datasource.verboseMap?.[yLabel] || yLabel,
        nameLocation: 'start',
        nameGap: 16,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: theme.colorText },
        splitLine: {
          show: true,
          lineStyle: { color: theme.colorBorderSecondary },
        },
      },
      series,
      tooltip: {
        ...getDefaultTooltip(base.refs),
        trigger: 'item',
        formatter: (params: CallbackDataParams) => {
          const point = params.data as MatrixBarDatum;
          const entry = entries.find(
            entry => entry.name === params.seriesName,
          )!;
          return tooltipHtml([
            [base.xAxis.label, xLabel(point.dimensionValues[0])],
            [
              datasource.verboseMap?.[yLabel] || yLabel,
              label(point.dimensionValues[1]),
            ],
            [entry.name, entry.formatter(point.value[2])],
          ]);
        },
      },
      dataZoom: [
        ...(formData.zoomable
          ? [
              {
                type: 'slider' as const,
                xAxisIndex: 0,
                bottom: 0,
                filterMode: 'weakFilter' as const,
              },
            ]
          : []),
        ...(formData.zoomable || scrollRows
          ? [
              {
                id: 'matrix-rows',
                type: 'slider' as const,
                yAxisIndex: 0,
                right: 0,
                filterMode: 'weakFilter' as const,
                ...(scrollRows && {
                  startValue: 0,
                  endValue: visibleRows - 1,
                  zoomLock: true,
                  brushSelect: false,
                  showDetail: false,
                }),
              },
            ]
          : []),
        ...(scrollRows
          ? [
              {
                type: 'inside' as const,
                yAxisIndex: 0,
                filterMode: 'weakFilter' as const,
                zoomLock: true,
                zoomOnMouseWheel: false,
                moveOnMouseWheel: true,
                moveOnMouseMove: true,
              },
            ]
          : []),
      ],
    },
  };
}
