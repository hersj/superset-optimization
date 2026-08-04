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
import type { JsonObject } from '@superset-ui/core';
import {
  getItem,
  LocalStorageKeys,
  setItem,
} from 'src/utils/localStorageHelpers';
import type { DashboardChartControls } from '../../types';

export type { DashboardChartControls } from '../../types';

export const DEFAULT_DASHBOARD_CHART_CONTROLS: DashboardChartControls = {
  timeCompareEnabled: true,
  showValueEnabled: true,
};

function isDashboardChartControls(
  value: unknown,
): value is DashboardChartControls {
  if (typeof value !== 'object' || value === null) return false;
  const controls = value as Record<string, unknown>;
  return (
    typeof controls.timeCompareEnabled === 'boolean' &&
    typeof controls.showValueEnabled === 'boolean'
  );
}

/**
 * 功能审计（可重写规格）：解析看板图表开关的会话状态
 * - 功能目的与触发方式：在首次 hydrate、图表刷新或再次 hydrate 时，为 Header 和图表链路确定两个看板级开关的有效状态。
 * - 输入契约：current 是当前 Redux 会话中的两个布尔字段，persisted 是当前用户 localStorage 偏好或 hydrate 传入的两个布尔字段；任一输入可为 null、undefined 或字段类型错误。
 * - 输出契约：返回有效的 DashboardChartControls；当前会话和持久化值都无效时返回 undefined，由 Header 和图表选择器使用默认开启值，不写入存储、不改变看板配置。
 * - 处理流程：先校验并保留当前会话值；当前会话没有完整有效值时读取已持久化值；两者都无效时保持未初始化，避免把默认显示值误记为用户选择。
 * - 业务规则：状态优先级固定为当前 Redux 会话 > 当前用户持久化偏好 > 未初始化默认值；单个字段缺失的对象整体无效，不能用默认值拼接覆盖已存在会话选择。
 * - 状态与副作用：纯函数，只产生新的状态判定；用户点击产生的持久化由 Header 现有逻辑负责。
 * - 外部依赖：依赖 DashboardChartControls 类型，以及 Header/图表选择器提供的默认常量；不依赖网络、数据库或新的存储 key。
 * - 异常与边界：null、undefined、数组、空对象及任一字段非布尔值均视为无效并继续按优先级降级。
 * - 不变量与约束：图表查询、图表刷新和 hydrate 不能把有效的当前会话选择恢复成默认开启；两个字段必须作为一个完整状态一起解析；未初始化状态不得冒充用户选择。
 * - 验证方式：Header 测试覆盖无状态时默认开启；dashboardState.test.ts 覆盖默认不入会话、后续 hydrate 恢复持久化值及显式会话选择优先。
 */
export function resolveDashboardChartControls({
  current,
  persisted,
}: {
  current?: DashboardChartControls | null;
  persisted?: DashboardChartControls | null;
}): DashboardChartControls | undefined {
  if (isDashboardChartControls(current)) return current;
  if (isDashboardChartControls(persisted)) return persisted;
  return undefined;
}

function getStoredDashboardChartControls(): Record<
  string,
  DashboardChartControls
> {
  const stored = getItem(LocalStorageKeys.DashboardChartControls, {});
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored)
    ? stored
    : {};
}

/**
 * 功能审计（可重写规格）：读取当前用户的看板图表开关偏好
 * - 功能目的与触发方式：看板 hydrate 时恢复当前登录用户上次选择的两个开关。
 * - 输入契约：用户 ID 为 Superset 登录用户的数字 ID；访客或缺少用户 ID 时不读取持久化值。
 * - 输出契约：返回两个布尔字段的有效偏好；没有偏好、格式错误或存储不可用时返回 null。
 * - 处理流程：按固定命名空间读取 localStorage -> 按用户 ID 取值 -> 校验两个字段均为布尔值。
 * - 业务规则：偏好按用户 ID 隔离并跨看板复用，不读取其他用户的值。
 * - 状态与副作用：只读浏览器 localStorage，不写数据库、不修改看板配置。
 * - 外部依赖：依赖浏览器 localStorage；不可用时由现有存储工具降级为空值。
 * - 异常与边界：JSON 损坏、数组、空对象或字段类型错误均视为没有偏好。
 * - 不变量与约束：不得因读取偏好标记看板未保存，不得让用户设置跨用户泄漏。
 * - 验证方式：看板 Header 组件测试验证恢复行为和用户隔离。
 */
export function getPersistedDashboardChartControls(
  userId?: number | null,
): DashboardChartControls | null {
  if (userId == null) return null;
  const controls = getStoredDashboardChartControls()[String(userId)];
  return isDashboardChartControls(controls) ? controls : null;
}

/** 看板图表开关的持久化辅助职责：只更新当前用户的 localStorage 偏好，保留其他用户的值。 */
export function persistDashboardChartControls(
  userId: number | null | undefined,
  controls: DashboardChartControls,
): void {
  if (userId == null) return;
  setItem(LocalStorageKeys.DashboardChartControls, {
    ...getStoredDashboardChartControls(),
    [String(userId)]: controls,
  });
}

/**
 * 看板开关的辅助职责：把当前会话中的两个开关转换成图表 formData 覆盖项。
 * 关闭过去对比时清空图表已有的时间偏移（混合时序同时清空 Query A/B）；打开时不凭空创建时间偏移，保留图表原配置。
 * 数字显示覆盖 ECharts 通用字段，并同步覆盖混合时序的 Query B 字段；不支持这些字段的图表会忽略它们。
 */
export function getDashboardChartExtraControls(
  controls: DashboardChartControls,
  formData: JsonObject = {},
): Record<string, unknown> {
  const isMixedTimeseries = formData.viz_type === 'mixed_timeseries';

  return {
    ...(!controls.timeCompareEnabled && { time_compare: [] }),
    ...(!controls.timeCompareEnabled &&
      isMixedTimeseries && {
        time_compare_b: [],
      }),
    show_value: controls.showValueEnabled,
    ...(isMixedTimeseries && {
      show_valueB: controls.showValueEnabled,
    }),
  };
}
