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
  LegendComponentOption,
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
  const selected = ensureIsArray(
    base.echartOptions.legend as LegendComponentOption[],
  )[0]?.selected;
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
          dimensions.includes(getMetricLabel(metric)) ||
          originalName === getMetricLabel(metric) ||
          originalName.startsWith(`${getMetricLabel(metric)}, `),
      ) ?? metrics[0];
    const offset = getTimeOffset({ name }, offsets) ?? '';
    const rate = Boolean(
      offset &&
      ['percentage', 'ratio'].includes(String(formData.comparisonType)),
    );
    const domainKey = JSON.stringify([getMetricLabel(metric), rate]);
    const visible = selected?.[name] !== false;
    // Raw-value comparisons share a metric's scale and slot; rates have their own unit.
    if (visible && !slots.has(domainKey)) slots.set(domainKey, slots.size);
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
      if (visible) {
        domain[0] = Math.min(domain[0], value);
        domain[1] = Math.max(domain[1], value);
      }
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
      comparison: Boolean(offset && !rate),
      points,
      formatter,
    };
  });
  const horizontal = formData.orientation === OrientationType.Horizontal;
  const slotCount = Math.max(slots.size, 1);
  const series: CustomSeriesOption[] = entries.map(
    ({ source, name, domainKey, comparison, points, formatter }) => {
      const slot = slots.get(domainKey) ?? 0;
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
        const top = center[1] - cellHeight / 2 + 6;
        const width = cellWidth * 0.8;
        const height = Math.max(1, cellHeight - 12);
        const slotWidth = horizontal ? width : width / slotCount;
        const slotHeight = horizontal ? height / slotCount : height;
        const x = left + (horizontal ? 0 : slot * slotWidth);
        const y = top + (horizontal ? slot * slotHeight : 0);
        const thickness = Math.min(
          18,
          (horizontal ? slotHeight : slotWidth) * 0.7,
        );
        const barLength =
          horizontal && formData.showValue
            ? slotWidth - Math.min(56, slotWidth * 0.35)
            : slotWidth;
        const zero = horizontal
          ? x + (-lower / divisor) * barLength
          : y + (upper / divisor) * slotHeight;
        const end =
          zero +
          (horizontal ? 1 : -1) *
            (value / unit / divisor) *
            (horizontal ? barLength : slotHeight);
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
                    x: comparison ? end - 1.5 : Math.min(zero, end),
                    y: y + (slotHeight - thickness) / 2 - (comparison ? 2 : 0),
                    width: comparison ? 3 : Math.abs(end - zero),
                    height: thickness + (comparison ? 4 : 0),
                    r: comparison ? 0 : theme.borderRadiusXS,
                  }
                : {
                    x: x + (slotWidth - thickness) / 2 - (comparison ? 2 : 0),
                    y: comparison ? end - 1.5 : Math.min(zero, end),
                    width: thickness + (comparison ? 4 : 0),
                    height: comparison ? 3 : Math.abs(end - zero),
                    r: comparison ? 0 : theme.borderRadiusXS,
                  },
              style: {
                fill: value < 0 ? theme.colorError : api.visual('color'),
              },
              transition: ['shape'],
            },
            ...(formData.showValue &&
            !comparison &&
            slotWidth > 24 &&
            slotHeight > 22
              ? [
                  {
                    type: 'text' as const,
                    x: horizontal ? x + slotWidth : x + slotWidth / 2,
                    y: horizontal ? y + slotHeight / 2 : y + height + 3,
                    silent: true,
                    style: {
                      text: formatter(value),
                      fill: theme.colorText,
                      fontSize: theme.fontSizeSM,
                      fontFamily: theme.fontFamily,
                      align: horizontal
                        ? ('right' as const)
                        : ('center' as const),
                      verticalAlign: horizontal
                        ? ('middle' as const)
                        : ('top' as const),
                      width: horizontal
                        ? Math.min(56, slotWidth * 0.35) - 2
                        : slotWidth - 4,
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
        z: comparison ? 5 : 2,
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
  const minCategoryHeight = horizontal ? Math.max(36, slotCount * 24 + 12) : 36;
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
    minCategoryHeight,
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
        right: 16,
        bottom: 16,
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
        axisLabel: {
          color: theme.colorText,
          width: Math.min(200, chartProps.width * 0.25),
          overflow: 'truncate',
          interval: 0,
        },
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
      dataZoom: [],
    },
  };
}
