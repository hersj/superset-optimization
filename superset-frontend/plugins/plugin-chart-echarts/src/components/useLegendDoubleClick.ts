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
import { useCallback, useEffect, useRef } from 'react';
import { LegendState } from '@superset-ui/core';
import { getLegendStateChange, LegendGroupMetadata } from '../utils/series';

const DOUBLE_CLICK_DELAY = 300;

type LegendSelectionPayload = {
  name?: string;
  selected?: LegendState;
};

type PendingLegendSelection = {
  name: string;
  selected: LegendState;
  timer: ReturnType<typeof setTimeout>;
};

type FocusedLegend = {
  name: string;
  restoreState: LegendState;
};

/**
 * 功能审计（可重写规格）：时序图例双击聚焦与恢复
 * - 功能目的与触发方式：标准时序图和混合时序图把 ECharts 的 legendselectchanged、全选、反选事件传入；连续双击同一个图例时临时聚焦，再次双击恢复原选择。
 * - 输入契约：legendGroups 是真实系列到逻辑图例组的稳定元数据；onLegendStateChanged 接收可与 ChartRenderer 当前状态合并的增量；payload.name/selected 来自 ECharts 图例事件。
 * - 输出契约：单击在 300ms 窗口后仅提交被点击逻辑组的增量；首次双击提交目标组聚焦状态；聚焦同组的再次双击提交首次双击前保存的完整选择；全选/反选提交全量状态。
 * - 处理流程：先暂存一次单击；同名第二事件到达则取消单击提交，保存或恢复快照；不同名第二事件先提交前一项后再暂存后一项；定时器到期即按普通单击提交。
 * - 业务规则：单击始终允许任意多选；聚焦后发生任何普通单击、全选或反选时清除旧快照，新的手工组合成为当前状态；只在同一图表组件实例内保存快照。
 * - 状态与副作用：只通过回调更新当前 ChartRenderer 的内存图例状态；不写查询、Redux、数据库、看板配置或 localStorage；卸载时取消未提交定时器。
 * - 外部依赖：依赖 ECharts 连续两次 legendselectchanged 代表双击，及 getLegendStateChange 对真实成员、维度和对比父子关系的展开。
 * - 异常与边界：缺少 name 时按普通全量更新；空 selected 按空映射处理；不同图例的快速连续点击不视为双击；未知图例按共享工具的安全降级处理。
 * - 不变量与约束：双击只影响当前图；普通单击不得重置其他图例；比较图例仍受其当前指标父组约束；数字显示、和过去对比及刷新不得伪造此用户事件。
 * - 验证方式：标准和混合时序组件测试覆盖双击聚焦/恢复，series.test.ts 覆盖聚焦状态展开；浏览器手工检查三图例多选、聚焦和恢复。
 */
export function useLegendDoubleClick(
  legendGroups: LegendGroupMetadata,
  onLegendStateChanged?: (state: LegendState) => void,
) {
  const pendingRef = useRef<PendingLegendSelection>();
  const focusedRef = useRef<FocusedLegend>();

  const commitPending = useCallback(
    (pending: Pick<PendingLegendSelection, 'name' | 'selected'>) => {
      onLegendStateChanged?.(
        getLegendStateChange(pending.selected, legendGroups, pending.name),
      );
      focusedRef.current = undefined;
    },
    [legendGroups, onLegendStateChanged],
  );

  const clearPending = useCallback(() => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = undefined;
    }
  }, []);

  useEffect(() => clearPending, [clearPending]);

  const handleLegendSelect = useCallback(
    (payload: LegendSelectionPayload) => {
      const { name, selected = {} } = payload;
      if (!name) {
        clearPending();
        focusedRef.current = undefined;
        onLegendStateChanged?.(getLegendStateChange(selected, legendGroups));
        return;
      }

      const pending = pendingRef.current;
      if (pending?.name === name) {
        clearPending();
        if (focusedRef.current?.name === name) {
          onLegendStateChanged?.(focusedRef.current.restoreState);
          focusedRef.current = undefined;
          return;
        }

        const previousSelection = {
          ...pending.selected,
          [name]: !(pending.selected[name] ?? true),
        };
        focusedRef.current = {
          name,
          restoreState: getLegendStateChange(previousSelection, legendGroups),
        };
        onLegendStateChanged?.(
          getLegendStateChange(selected, legendGroups, name, 'focus'),
        );
        return;
      }

      if (pending) {
        clearPending();
        commitPending(pending);
      }

      const timer = setTimeout(() => {
        const nextPending = pendingRef.current;
        if (!nextPending || nextPending.name !== name) return;
        pendingRef.current = undefined;
        commitPending(nextPending);
      }, DOUBLE_CLICK_DELAY);
      pendingRef.current = { name, selected, timer };
    },
    [clearPending, commitPending, legendGroups, onLegendStateChanged],
  );

  const handleLegendBulkChange = useCallback(
    (payload: LegendSelectionPayload) => {
      clearPending();
      focusedRef.current = undefined;
      onLegendStateChanged?.(
        getLegendStateChange(payload.selected ?? {}, legendGroups),
      );
    },
    [clearPending, legendGroups, onLegendStateChanged],
  );

  return { handleLegendSelect, handleLegendBulkChange };
}
