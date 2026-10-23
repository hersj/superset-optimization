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
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import {
  DTTM_ALIAS,
  BinaryQueryObjectFilterClause,
  AxisType,
  getTimeFormatter,
  getColumnLabel,
  getNumberFormatter,
  LegendState,
  ensureIsArray,
} from '@superset-ui/core';
import type { ViewRootGroup } from 'echarts/types/src/util/types';
import type GlobalModel from 'echarts/types/src/model/Global';
import type ComponentModel from 'echarts/types/src/model/Component';
import { EchartsHandler, EventHandlers } from '../types';
import Echart from '../components/Echart';
import { MatrixBarDatum, TimeseriesChartTransformedProps } from './types';
import { formatSeriesName } from '../utils/series';
import { ExtraControls } from '../components/ExtraControls';
import { useLegendDoubleClick } from '../components/useLegendDoubleClick';
import LegendSelector from '../components/LegendSelector';
import { Button, Typography } from '@superset-ui/core/components';

const TIMER_DURATION = 300;

export default function EchartsTimeseries({
  formData,
  height,
  width,
  echartOptions,
  groupby,
  labelMap,
  selectedValues,
  setDataMask,
  setControlValue,
  legendData = [],
  legendGroups = {
    groups: {},
    labels: {},
    kinds: {},
    parents: {},
    stateKeys: {},
  },
  onContextMenu,
  onLegendStateChanged,
  onFocusedSeries,
  onTooltipSeriesClick,
  xValueFormatter,
  xAxis,
  refs,
  emitCrossFilters,
  coltypeMapping,
  onLegendScroll,
  matrixDimensions,
  matrixTimeGrain,
  skuSelection,
}: TimeseriesChartTransformedProps) {
  const { stack, richTooltip, clickToFocusTooltipSeries } = formData;
  const dataZoomStorageKey =
    (matrixDimensions ||
      (skuSelection && formData.orientation === 'horizontal')) &&
    formData.sliceId
      ? JSON.stringify([
          formData.dashboardId ?? 'explore',
          formData.sliceId,
          matrixDimensions ? getColumnLabel(matrixDimensions[1]) : xAxis.label,
        ])
      : undefined;
  const shouldFocusTooltipSeries = clickToFocusTooltipSeries !== false;
  const echartRef = useRef<EchartsHandler | null>(null);
  // eslint-disable-next-line no-param-reassign
  refs.echartRef = echartRef;
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  const extraControlRef = useRef<HTMLDivElement>(null);
  const [extraControlHeight, setExtraControlHeight] = useState(0);
  const [skuDetail, setSkuDetail] = useState<string>();
  useEffect(() => {
    const element = extraControlRef.current;
    if (!element) {
      setExtraControlHeight(0);
      return;
    }

    const updateHeight = () => {
      setExtraControlHeight(element.offsetHeight || 0);
    };

    updateHeight();

    if (typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });
      resizeObserver.observe(element);
      return () => {
        resizeObserver.disconnect();
      };
    }

    window.addEventListener('resize', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
    };
  }, [formData.showExtraControls]);

  const hasDimensions = ensureIsArray(groupby).length > 0;

  const getModelInfo = (target: ViewRootGroup, globalModel: GlobalModel) => {
    let el = target;
    let model: ComponentModel | null = null;
    while (el) {
      // eslint-disable-next-line no-underscore-dangle
      const modelInfo = el.__ecComponentInfo;
      if (modelInfo != null) {
        model = globalModel.getComponent(modelInfo.mainType, modelInfo.index);
        break;
      }
      el = el.parent;
    }
    return model;
  };

  const getCrossFilterDataMask = useCallback(
    (value: string) => {
      const selected: string[] = Object.values(selectedValues);
      let values: string[];
      if (selected.includes(value)) {
        values = selected.filter(v => v !== value);
      } else {
        values = [value];
      }
      const groupbyValues = values.map(value => labelMap[value]);
      return {
        dataMask: {
          extraFormData: {
            filters:
              values.length === 0
                ? []
                : groupby.map((col, idx) => {
                    const val = groupbyValues.map(v => v[idx]);
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
            label: groupbyValues.length ? groupbyValues : undefined,
            value: groupbyValues.length ? groupbyValues : null,
            selectedValues: values.length ? values : null,
          },
        },
        isCurrentValueSelected: selected.includes(value),
      };
    },
    [groupby, labelMap, selectedValues],
  );

  // Cross-filter using X-axis value when no dimensions are set (issue #25334)
  const getXAxisCrossFilterDataMask = useCallback(
    (xAxisValue: string | number) => {
      const stringValue = String(xAxisValue);
      const selected: string[] = Object.values(selectedValues);
      let values: string[];
      if (selected.includes(stringValue)) {
        values = selected.filter(v => v !== stringValue);
      } else {
        values = [stringValue];
      }
      return {
        dataMask: {
          extraFormData: {
            filters:
              values.length === 0
                ? []
                : [
                    {
                      col: xAxis.label,
                      op: 'IN' as const,
                      val: values,
                    },
                  ],
          },
          filterState: {
            label: values.length ? values : undefined,
            value: values.length ? values : null,
            selectedValues: values.length ? values : null,
          },
        },
        isCurrentValueSelected: selected.includes(stringValue),
      };
    },
    [selectedValues, xAxis.label],
  );

  const handleChange = useCallback(
    (value: string) => {
      if (!emitCrossFilters) {
        return;
      }
      setDataMask(getCrossFilterDataMask(value).dataMask);
    },
    [emitCrossFilters, setDataMask, getCrossFilterDataMask],
  );

  // Handle cross-filter using X-axis value when no dimensions (issue #25334)
  const handleXAxisChange = useCallback(
    (xAxisValue: string | number) => {
      if (!emitCrossFilters) {
        return;
      }
      setDataMask(getXAxisCrossFilterDataMask(xAxisValue).dataMask);
    },
    [emitCrossFilters, setDataMask, getXAxisCrossFilterDataMask],
  );

  // Determine if X-axis can be used for cross-filtering (categorical axis without dimensions)
  const canCrossFilterByXAxis =
    !hasDimensions && xAxis.type === AxisType.Category;
  const {
    handleLegendSelect,
    handleLegendDoubleClick,
    handleLegendBulkChange,
  } = useLegendDoubleClick(legendGroups, onLegendStateChanged);

  const getMatrixFilters = (
    datum: MatrixBarDatum,
  ): BinaryQueryObjectFilterClause[] =>
    matrixDimensions!.map((col, index) => ({
      col,
      op: '==',
      val: datum.dimensionValues[index],
      ...(index === 0 && matrixTimeGrain && { grain: matrixTimeGrain }),
    }));
  const getMatrixDataMask = (datum: MatrixBarDatum) => {
    const key = JSON.stringify(datum.dimensionValues);
    const selected = Object.values(selectedValues).includes(key);
    return {
      extraFormData: { filters: selected ? [] : getMatrixFilters(datum) },
      filterState: { selectedValues: selected ? [] : [key] },
    };
  };

  /*
   * 功能审计（可重写规格）：标准时序图图例事件增量
   * - 功能目的与触发方式：处理标准 bar、line、smooth、scatter、step 图的用户图例事件。
   * - 输入契约：selected 为 ECharts 选择映射，changedName 仅由单击事件提供；legendGroups 由 transformProps 生成。
   * - 输出契约：真实成员由当前逻辑组和父当前指标展开；单击返回一个逻辑组的增量，全选/反选返回全部逻辑组。
   * - 处理流程：用户事件直接压缩为逻辑组增量并交由 ChartRenderer 合并；查询刷新仅通过 transformProps 的 legend.selected 和 ECharts setOption 恢复真实成员状态。
   * - 用户事件边界：只有用户单击、全选、反选和 ZRender 原生双击才产生状态增量；图例单击立即生效并允许任意多选，双击通过 __legendDataIndex 解析真实图例后先聚焦目标组、再双击同组恢复双击前选择。图表区域双击只处理 series；不得在刷新时 dispatchAction 图例事件或写回默认选择。
   * - 业务规则：当前指标默认打开、offset 默认关闭；offset 必须同时受自身开关和父当前指标开关约束；双击聚焦后手动单击会清除旧恢复快照；不修改查询或看板配置。
   * - 状态与副作用：只更新 ChartRenderer 内存状态，保留数字显示、tooltip、颜色、分页和注释图例。
   * - 外部依赖：ECharts legend 事件、共享 series 状态工具、ChartRenderer 和 transformProps。
   * - 异常与边界：无逻辑分组时保持原始映射；刷新、数字显示和时间对比开关不产生图例状态回写。
   * - 不变量与约束：ECharts 图例 key 始终是真实系列名，事件不会重置未点击逻辑组。
   * - 验证方式：EchartsTimeseries.test.tsx 覆盖单击增量，transform 测试覆盖刷新和标准图类型。
   */
  const eventHandlers: EventHandlers = {
    click: props => {
      if (
        skuSelection &&
        (props.componentType === 'xAxis' || props.componentType === 'yAxis') &&
        props.value != null
      ) {
        setSkuDetail(String(props.value));
        return;
      }
      if (matrixDimensions && props.data?.dimensionValues) {
        if (clickTimer.current) clearTimeout(clickTimer.current);
        if (emitCrossFilters) {
          clickTimer.current = setTimeout(
            () => setDataMask(getMatrixDataMask(props.data)),
            TIMER_DURATION,
          );
        }
        return;
      }
      if (
        richTooltip &&
        shouldFocusTooltipSeries &&
        props.seriesName &&
        (props.componentType === undefined || props.componentType === 'series')
      ) {
        onTooltipSeriesClick(props.seriesName);
        const chart = echartRef.current?.getEchartInstance();
        chart?.dispatchAction({ type: 'hideTip' });
        chart?.dispatchAction({
          type: 'showTip',
          seriesIndex: props.seriesIndex,
          dataIndex: props.dataIndex,
        });
        return;
      }
      // Allow cross-filter by dimensions OR by categorical X-axis (issue #25334)
      if (!hasDimensions && !canCrossFilterByXAxis) {
        return;
      }
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
      }
      // Ensure that double-click events do not trigger single click event. So we put it in the timer.
      clickTimer.current = setTimeout(() => {
        if (hasDimensions) {
          // Cross-filter by dimension (original behavior)
          const { seriesName: name } = props;
          handleChange(name);
        } else if (canCrossFilterByXAxis && props.data?.[0] != null) {
          // Cross-filter by X-axis value when no dimensions (issue #25334)
          handleXAxisChange(props.data[0]);
        }
      }, TIMER_DURATION);
    },
    mouseout: () => {
      onFocusedSeries(null);
    },
    mouseover: params => {
      onFocusedSeries(params.seriesName);
    },
    legendscroll: payload => {
      onLegendScroll?.(payload.scrollDataIndex);
    },
    legendselectchanged: handleLegendSelect,
    legendselectall: handleLegendBulkChange,
    legendinverseselect: handleLegendBulkChange,
    contextmenu: async eventParams => {
      if (onContextMenu) {
        eventParams.event.stop();
        const { data, seriesName } = eventParams;
        const drillToDetailFilters: BinaryQueryObjectFilterClause[] = [];
        const drillByFilters: BinaryQueryObjectFilterClause[] = [];
        const pointerEvent = eventParams.event.event;
        if (matrixDimensions && data?.dimensionValues) {
          onContextMenu(pointerEvent.clientX, pointerEvent.clientY, {
            drillToDetail: getMatrixFilters(data),
            crossFilter: {
              dataMask: getMatrixDataMask(data),
              isCurrentValueSelected: Object.values(selectedValues).includes(
                JSON.stringify(data.dimensionValues),
              ),
            },
          });
          return;
        }
        const values = [
          ...(eventParams.name
            ? [skuSelection?.axisValues?.[eventParams.name] ?? eventParams.name]
            : []),
          ...(labelMap[seriesName] ?? []),
        ];
        const groupBy = ensureIsArray(formData.groupby);
        if (data && xAxis.type === AxisType.Time) {
          drillToDetailFilters.push({
            col:
              // if the xAxis is '__timestamp', granularity_sqla will be the column of filter
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
          ...(xAxis.type === AxisType.Category && data ? [xAxis.label] : []),
          ...groupBy,
        ].forEach((dimension, i) =>
          drillToDetailFilters.push({
            col: dimension,
            op: '==',
            val: values[i],
            formattedVal: String(values[i]),
          }),
        );
        groupBy.forEach((dimension, i) => {
          const dimensionValues = labelMap[seriesName] ?? [];

          // Skip the metric values at the beginning and get the actual dimension value
          // If we have multiple metrics, they come first, then the dimension values
          const metricsCount = dimensionValues.length - groupBy.length;
          const val = dimensionValues[metricsCount + i];

          drillByFilters.push({
            col: dimension,
            op: '==',
            val,
            formattedVal: formatSeriesName(val, {
              timeFormatter: getTimeFormatter(formData.dateFormat),
              numberFormatter: getNumberFormatter(formData.numberFormat),
              coltype: coltypeMapping?.[getColumnLabel(dimension)],
            }),
          });
        });

        // Provide cross-filter for dimensions OR categorical X-axis (issue #25334)
        let crossFilter;
        if (hasDimensions) {
          crossFilter = getCrossFilterDataMask(seriesName);
        } else if (canCrossFilterByXAxis && data?.[0] != null) {
          crossFilter = getXAxisCrossFilterDataMask(data[0]);
        }

        onContextMenu(pointerEvent.clientX, pointerEvent.clientY, {
          drillToDetail: drillToDetailFilters,
          drillBy: { filters: drillByFilters, groupbyFieldName: 'groupby' },
          crossFilter,
        });
      }
    },
  };

  const zrEventHandlers: EventHandlers = {
    dblclick: params => {
      if (handleLegendDoubleClick(params, legendData)) return;
      // clear single click timer
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
      }
      const pointInPixel = [params.offsetX, params.offsetY];
      const echartInstance = echartRef.current?.getEchartInstance();
      if (echartInstance?.containPixel('grid', pointInPixel)) {
        // do not trigger if click unstacked chart's blank area
        if (!stack && params.target?.type === 'ec-polygon') return;
        // @ts-expect-error
        const globalModel = echartInstance.getModel();
        const model = getModelInfo(params.target, globalModel);
        // 图例双击已经由 legendselectchanged 的聚焦/恢复逻辑处理，不能再被这里的图表区域聚焦覆盖。
        if (model?.mainType === 'series') {
          const { name } = model;
          if (richTooltip && shouldFocusTooltipSeries && name) {
            onTooltipSeriesClick(name);
            echartInstance.dispatchAction({ type: 'hideTip' });
            echartInstance.dispatchAction({
              type: 'showTip',
              x: params.offsetX,
              y: params.offsetY,
            });
            return;
          }
          const legendState: LegendState = legendData.reduce(
            (previous, datum) => ({
              ...previous,
              [datum]: datum === name,
            }),
            {},
          );
          onLegendStateChanged?.(legendState);
        }
      }
    },
  };

  return (
    <>
      <div ref={extraControlRef}>
        {skuSelection && (
          <LegendSelector
            itemLabel="SKU"
            fullLabels={skuSelection.values}
            options={{
              legend: {
                data: skuSelection.names,
                selected: skuSelection.selected,
              },
            }}
            groups={{
              groups: {},
              labels: skuSelection.labels,
              kinds: {},
              parents: {},
              stateKeys: {},
            }}
            onChange={payload => onLegendStateChanged?.(payload.selected)}
            echartRef={echartRef}
          />
        )}
        <LegendSelector
          options={echartOptions}
          groups={legendGroups}
          onChange={handleLegendBulkChange}
          echartRef={echartRef}
        />
        <ExtraControls formData={formData} setControlValue={setControlValue} />
        {skuDetail && (
          <div
            aria-label={t('SKU完整名称')}
            style={{ overflowWrap: 'anywhere' }}
          >
            <Typography.Paragraph copyable>{skuDetail}</Typography.Paragraph>
            <Button buttonSize="small" onClick={() => setSkuDetail(undefined)}>
              收起
            </Button>
          </div>
        )}
      </div>
      <Echart
        ref={echartRef}
        refs={refs}
        height={height - extraControlHeight}
        width={width}
        echartOptions={echartOptions}
        eventHandlers={eventHandlers}
        zrEventHandlers={zrEventHandlers}
        selectedValues={selectedValues}
        vizType={formData.vizType}
        dataZoomStorageKey={dataZoomStorageKey}
      />
    </>
  );
}
