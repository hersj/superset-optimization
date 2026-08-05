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
import { useCallback, useRef } from 'react';
import {
  AxisType,
  BinaryQueryObjectFilterClause,
  DTTM_ALIAS,
  DataRecordValue,
  getColumnLabel,
  getNumberFormatter,
  getTimeFormatter,
} from '@superset-ui/core';
import { EchartsMixedTimeseriesChartTransformedProps } from './types';
import Echart from '../components/Echart';
import { EchartsHandler, EventHandlers } from '../types';
import { formatSeriesName, getLegendStateChange } from '../utils/series';

export default function EchartsMixedTimeseries({
  height,
  width,
  echartOptions,
  setDataMask,
  labelMap,
  labelMapB,
  groupby,
  groupbyB,
  selectedValues,
  formData,
  emitCrossFilters,
  seriesBreakdown,
  onContextMenu,
  onFocusedSeries,
  onLegendStateChanged,
  legendGroups = {
    groups: {},
    labels: {},
    kinds: {},
    parents: {},
    stateKeys: {},
  },
  xValueFormatter,
  xAxis,
  refs,
  coltypeMapping,
}: EchartsMixedTimeseriesChartTransformedProps) {
  const echartRef = useRef<EchartsHandler | null>(null);
  refs.echartRef = echartRef;
  const isFirstQuery = useCallback(
    (seriesIndex: number) => seriesIndex < seriesBreakdown,
    [seriesBreakdown],
  );

  const getCrossFilterDataMask = useCallback(
    (seriesName, seriesIndex) => {
      const selected: string[] = Object.values(selectedValues || {});
      let values: string[];
      if (selected.includes(seriesName)) {
        values = selected.filter(v => v !== seriesName);
      } else {
        values = [seriesName];
      }

      const currentGroupBy = isFirstQuery(seriesIndex) ? groupby : groupbyB;
      const currentLabelMap = isFirstQuery(seriesIndex) ? labelMap : labelMapB;
      const groupbyValues = values
        .map(value => currentLabelMap?.[value])
        .filter(value => !!value);

      return {
        dataMask: {
          extraFormData: {
            filters:
              values.length === 0
                ? []
                : currentGroupBy.map((col, idx) => {
                    const val: DataRecordValue[] = groupbyValues.map(
                      v => v[idx],
                    );
                    if (val === null || val === undefined)
                      return {
                        col,
                        op: 'IS NULL' as const,
                      };
                    return {
                      col,
                      op: 'IN' as const,
                      val: val as (string | number | boolean)[],
                    };
                  }),
          },
          filterState: {
            value: !groupbyValues.length ? null : groupbyValues,
            selectedValues: values.length ? values : null,
          },
        },
        isCurrentValueSelected: selected.includes(seriesName),
      };
    },
    [groupby, groupbyB, isFirstQuery, labelMap, labelMapB, selectedValues],
  );

  const handleChange = useCallback(
    (seriesName: string, seriesIndex: number) => {
      const isFirst = isFirstQuery(seriesIndex);
      if (
        !emitCrossFilters ||
        (isFirst && groupby.length === 0) ||
        (!isFirst && groupbyB.length === 0)
      ) {
        return;
      }

      setDataMask(getCrossFilterDataMask(seriesName, seriesIndex).dataMask);
    },
    [
      isFirstQuery,
      emitCrossFilters,
      groupby.length,
      groupbyB.length,
      setDataMask,
      getCrossFilterDataMask,
    ],
  );

  /*
   * 功能审计（可重写规格）：混合时序图逻辑图例状态同步
   * - 功能目的与触发方式：响应混合时序图的用户图例单击、全选和反选。
   * - 输入契约：selected 是 ECharts 当前图例选择映射；单击时另有 changedName；legendGroups.groups 的 key 是真实系列代表值，value 是同一逻辑组的真实系列名。
   * - 输出契约：真实成员按逻辑状态展开；单击只返回被修改逻辑组的增量，全选/反选返回全部逻辑组；不修改查询数据或看板配置。
   * - 处理流程：事件以本次真实代表系列值生成逻辑组增量；查询刷新仅通过 transformProps 的 legend.selected 和 ECharts setOption 恢复真实成员。
   * - 用户事件边界：只有用户单击、全选、反选才产生状态增量；刷新不得 dispatchAction 图例事件或回写默认选择。
   * - 业务规则：当前指标组默认打开、offset 组默认关闭；稳定 key 优先用于刷新，事件组优先使用 ECharts 本次选择；无对比时不改变既有维度图例行为。
   * - 状态与副作用：仅把用户状态交给 ChartRenderer 合并保存，不直接修改 ECharts 实例。
   * - 外部依赖：ECharts legend 事件、getLegendStateChange 和 transformProps 生成的 legendGroups。
   * - 异常与边界：空分组或空 selected 不抛错；数字显示和时间对比切换不改变已有状态。
   * - 不变量与约束：代表值必须是真实系列名，不能使用虚拟 offset 名称；同一事件不可重置其他逻辑组。
   * - 验证方式：MixedTimeseries 组件图例事件测试及看板 74 的 Query A/B、维度、offset 交互冒烟。
   */
  const eventHandlers: EventHandlers = {
    click: props => {
      const { seriesName, seriesIndex } = props;
      handleChange(seriesName, seriesIndex);
    },
    mouseout: () => {
      onFocusedSeries(null);
    },
    mouseover: params => {
      onFocusedSeries(params.seriesName);
    },
    legendselectchanged: payload => {
      onLegendStateChanged?.(
        getLegendStateChange(payload.selected, legendGroups, payload.name),
      );
    },
    legendselectall: payload => {
      onLegendStateChanged?.(
        getLegendStateChange(payload.selected, legendGroups),
      );
    },
    legendinverseselect: payload => {
      onLegendStateChanged?.(
        getLegendStateChange(payload.selected, legendGroups),
      );
    },
    contextmenu: async eventParams => {
      if (onContextMenu) {
        eventParams.event.stop();
        const { data, seriesName, seriesIndex } = eventParams;
        const pointerEvent = eventParams.event.event;
        const drillToDetailFilters: BinaryQueryObjectFilterClause[] = [];
        const drillByFilters: BinaryQueryObjectFilterClause[] = [];
        const isFirst = isFirstQuery(seriesIndex);
        const values = [
          ...(eventParams.name ? [eventParams.name] : []),
          ...((isFirst ? labelMap : labelMapB)[eventParams.seriesName] || []),
        ];
        if (data && xAxis.type === AxisType.Time) {
          drillToDetailFilters.push({
            col:
              xAxis.label === DTTM_ALIAS
                ? formData.granularitySqla
                : xAxis.label,
            grain: formData.timeGrainSqla,
            op: '==',
            val: data[0],
            formattedVal: xValueFormatter(data[0]),
          });
        }
        [
          ...(data && xAxis.type === AxisType.Category ? [xAxis.label] : []),
          ...(isFirst ? formData.groupby : formData.groupbyB),
        ].forEach((dimension, i) =>
          drillToDetailFilters.push({
            col: dimension,
            op: '==',
            val: values[i],
            formattedVal: String(values[i]),
          }),
        );

        [...(isFirst ? formData.groupby : formData.groupbyB)].forEach(
          (dimension, i) =>
            drillByFilters.push({
              col: dimension,
              op: '==',
              val: values[i],
              formattedVal: formatSeriesName(values[i], {
                timeFormatter: getTimeFormatter(formData.dateFormat),
                numberFormatter: getNumberFormatter(formData.numberFormat),
                coltype: coltypeMapping?.[getColumnLabel(dimension)],
              }),
            }),
        );
        const hasCrossFilter =
          (isFirst && groupby.length > 0) || (!isFirst && groupbyB.length > 0);

        onContextMenu(pointerEvent.clientX, pointerEvent.clientY, {
          drillToDetail: drillToDetailFilters,
          crossFilter: hasCrossFilter
            ? getCrossFilterDataMask(seriesName, seriesIndex)
            : undefined,
          drillBy: {
            filters: drillByFilters,
            groupbyFieldName: isFirst ? 'groupby' : 'groupby_b',
            adhocFilterFieldName: isFirst ? 'adhoc_filters' : 'adhoc_filters_b',
          },
        });
      }
    },
  };

  return (
    <Echart
      refs={refs}
      ref={echartRef}
      height={height}
      width={width}
      echartOptions={echartOptions}
      eventHandlers={eventHandlers}
      selectedValues={selectedValues}
      vizType={formData.vizType}
    />
  );
}
