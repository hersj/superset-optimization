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
import { LegendState } from '@superset-ui/core';
import { getLegendStateChange, LegendGroupMetadata } from '../utils/series';

type LegendSelectionPayload = {
  componentType?: string;
  name?: string;
  selected?: LegendState;
  target?: LegendZrTarget;
};

type LegendZrTarget = {
  __legendDataIndex?: number;
  parent?: LegendZrTarget;
};

type FocusedLegend = {
  focusState: LegendState;
  name: string;
  restoreState: LegendState;
};

function hasSameLogicalSelection(
  left: LegendState,
  right: LegendState,
  metadata: LegendGroupMetadata,
) {
  return Object.keys(metadata.groups).every(representative => {
    const stateKey = metadata.stateKeys[representative] ?? representative;
    return (
      (left[stateKey] ?? left[representative] ?? false) ===
      (right[stateKey] ?? right[representative] ?? false)
    );
  });
}

function getLegendNameFromZrEvent(
  target: LegendZrTarget | undefined,
  legendData: string[],
) {
  let current = target;
  while (current) {
    if (Number.isInteger(current.__legendDataIndex)) {
      return legendData[current.__legendDataIndex as number];
    }
    current = current.parent;
  }
  return undefined;
}

/**
 * 功能审计（可重写规格）：时序图例双击聚焦与恢复
 * - 功能目的与触发方式：标准时序图和混合时序图把 ECharts 的 legendselectchanged、ZRender 原生 dblclick、全选和反选事件传入；双击图例时临时聚焦，再次双击恢复原选择。
 * - 输入契约：legendGroups 是真实系列到逻辑图例组的稳定元数据；onLegendStateChanged 接收可与 ChartRenderer 当前状态合并的增量；selected 来自 ECharts 选择事件；ZRender dblclick 通过目标父链的 __legendDataIndex 和当前 legend.data 解析真实图例名。
 * - 输出契约：单击立即提交被点击逻辑组的增量；首次 ZRender 双击提交目标组聚焦状态；当前仍处于该聚焦状态时再次双击同组，提交首次双击前的完整选择；全选/反选提交全量状态。
 * - 处理流程：每次选择事件立即保存 ECharts 完整选择并提交单组增量；ZRender 双击时把最新完整选择解析为当前逻辑状态，与已保存聚焦状态比较，决定恢复旧快照或保存新快照后聚焦。
 * - 业务规则：单击始终允许任意多选；聚焦后若用户单击形成新组合，该组合与旧聚焦状态不同，下一次双击会以新组合建立快照；只在同一图表组件实例内保存状态。
 * - 状态与副作用：只通过回调更新当前 ChartRenderer 的内存图例状态；不写查询、Redux、数据库、看板配置或 localStorage；不使用自定义双击时限。
 * - 外部依赖：依赖浏览器和 ZRender 原生 dblclick 判定、ECharts LegendView 的 __legendDataIndex，以及 getLegendStateChange 对真实成员、维度和对比父子关系的展开。
 * - 异常与边界：显式非 legend 双击、找不到合法索引或索引越界时忽略；空 selected 按空映射处理；未知图例按共享工具的安全降级处理。
 * - 不变量与约束：双击只影响当前图；普通单击不得重置其他图例；比较图例仍受其当前指标父组约束；数字显示、和过去对比及刷新不得伪造此用户事件。
 * - 验证方式：标准和混合时序组件测试覆盖双击聚焦/恢复，series.test.ts 覆盖聚焦状态展开；浏览器手工检查三图例多选、聚焦和恢复。
 */
export function useLegendDoubleClick(
  legendGroups: LegendGroupMetadata,
  onLegendStateChanged?: (state: LegendState) => void,
) {
  const latestSelectionRef = useRef<LegendState>({});
  const focusedRef = useRef<FocusedLegend>();

  const handleLegendSelect = useCallback(
    (payload: LegendSelectionPayload) => {
      const { name, selected = {} } = payload;
      latestSelectionRef.current = selected;
      onLegendStateChanged?.(
        getLegendStateChange(selected, legendGroups, name),
      );
    },
    [legendGroups, onLegendStateChanged],
  );

  const handleLegendDoubleClick = useCallback(
    (payload: LegendSelectionPayload, legendData: string[] = []) => {
      const { componentType } = payload;
      if (componentType && componentType !== 'legend') return false;
      const name =
        payload.name ?? getLegendNameFromZrEvent(payload.target, legendData);
      if (!name) return false;

      const currentState = getLegendStateChange(
        latestSelectionRef.current,
        legendGroups,
      );
      const focused = focusedRef.current;
      if (
        focused?.name === name &&
        hasSameLogicalSelection(currentState, focused.focusState, legendGroups)
      ) {
        onLegendStateChanged?.(focused.restoreState);
        focusedRef.current = undefined;
        return true;
      }

      const focusState = getLegendStateChange(
        latestSelectionRef.current,
        legendGroups,
        name,
        'focus',
      );
      focusedRef.current = { focusState, name, restoreState: currentState };
      onLegendStateChanged?.(focusState);
      return true;
    },
    [legendGroups, onLegendStateChanged],
  );

  const handleLegendBulkChange = useCallback(
    (payload: LegendSelectionPayload) => {
      latestSelectionRef.current = payload.selected ?? {};
      focusedRef.current = undefined;
      onLegendStateChanged?.(
        getLegendStateChange(payload.selected ?? {}, legendGroups),
      );
    },
    [legendGroups, onLegendStateChanged],
  );

  return {
    handleLegendSelect,
    handleLegendDoubleClick,
    handleLegendBulkChange,
  };
}
