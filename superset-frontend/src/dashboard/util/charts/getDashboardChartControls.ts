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
