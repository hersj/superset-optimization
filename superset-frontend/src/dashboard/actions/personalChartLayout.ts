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
import { SupersetClient } from '@superset-ui/core';

export interface PersonalChartLayout {
  ordered_metric_ids: string[];
  hidden_metric_ids: string[];
  frozen_column_count?: number;
  frozen_column_key?: string | null;
  version: number;
}

/** A saved personal slot; applying it persists a separate per-chart snapshot. */
export interface PersonalChartTemplate {
  slot: 1 | 2 | 3;
  name: string;
  is_default: boolean;
  layout: PersonalChartLayout;
}

export type PersonalChartTemplateSelection =
  | 1
  | 2
  | 3
  | 'system-default'
  | null;

export interface PivotTemplateLibrary {
  version: 2;
  templates: PersonalChartTemplate[];
  defaults: Record<string, PersonalChartLayout>;
  legacy_layout: PersonalChartLayout | null;
  selections?: Record<string, PersonalChartTemplateSelection>;
}
export const SET_PIVOT_TEMPLATE_LIBRARY = 'SET_PIVOT_TEMPLATE_LIBRARY';
export function setPivotTemplateLibrary(
  library: PivotTemplateLibrary | null,
  initialize = false,
) {
  return { type: SET_PIVOT_TEMPLATE_LIBRARY, library, initialize };
}
export async function getPivotTemplateLibrary(
  dashboardId: number,
): Promise<PivotTemplateLibrary> {
  const { json } = await SupersetClient.get({
    endpoint: `/api/v1/dashboard/${dashboardId}/pivot_templates`,
  });
  return json.result;
}
export async function editPivotTemplateLibrary(
  dashboardId: number,
  payload:
    | {
        action: 'save' | 'delete' | 'default';
        slot: 1 | 2 | 3;
        chart_id?: number;
        template?: { name: string; layout: PersonalChartLayout };
      }
    | {
        action: 'apply';
        chart_id: number;
        layout: PersonalChartLayout;
        selection?: PersonalChartTemplateSelection;
      },
): Promise<PivotTemplateLibrary> {
  const { json } = await SupersetClient.put({
    endpoint: `/api/v1/dashboard/${dashboardId}/pivot_templates`,
    jsonPayload: payload,
  });
  return json.result;
}

export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  return candidate.status === 404 || candidate.response?.status === 404;
}

export type PersonalChartLayoutsMap = Record<string, PersonalChartLayout>;
export type PersonalChartTemplatesMap = Record<string, PersonalChartTemplate[]>;

/** Editing shared columns from one pivot must preserve columns belonging only to another. */
export function mergeDashboardPivotLayout(
  current: PersonalChartLayout | null | undefined,
  edited: PersonalChartLayout,
): PersonalChartLayout {
  if (!current) return edited;
  const present = new Set(edited.ordered_metric_ids);
  return {
    ...edited,
    ordered_metric_ids: [
      ...edited.ordered_metric_ids,
      ...current.ordered_metric_ids.filter(id => !present.has(id)),
    ],
    hidden_metric_ids: [
      ...edited.hidden_metric_ids,
      ...current.hidden_metric_ids.filter(id => !present.has(id)),
    ],
  };
}

export const SET_PERSONAL_CHART_LAYOUTS = 'SET_PERSONAL_CHART_LAYOUTS';
export const UPSERT_PERSONAL_CHART_LAYOUT = 'UPSERT_PERSONAL_CHART_LAYOUT';
export const REMOVE_PERSONAL_CHART_LAYOUT = 'REMOVE_PERSONAL_CHART_LAYOUT';
export const SET_PERSONAL_CHART_TEMPLATES = 'SET_PERSONAL_CHART_TEMPLATES';
export const UPSERT_PERSONAL_CHART_TEMPLATE = 'UPSERT_PERSONAL_CHART_TEMPLATE';
export const REMOVE_PERSONAL_CHART_TEMPLATE = 'REMOVE_PERSONAL_CHART_TEMPLATE';
export const SET_PERSONAL_CHART_TEMPLATE_ACTIVE_SLOT =
  'SET_PERSONAL_CHART_TEMPLATE_ACTIVE_SLOT';
export const SET_DASHBOARD_PIVOT_LAYOUT = 'SET_DASHBOARD_PIVOT_LAYOUT';

export function setDashboardPivotLayout(layout: PersonalChartLayout | null) {
  return { type: SET_DASHBOARD_PIVOT_LAYOUT, layout };
}

export async function getDashboardPivotLayout(
  dashboardId: number,
): Promise<PersonalChartLayout | null> {
  const { json } = await SupersetClient.get({
    endpoint: `/api/v1/dashboard/${dashboardId}/pivot_layout`,
  });
  return (json?.result as PersonalChartLayout) || null;
}

export async function putDashboardPivotLayout(
  dashboardId: number,
  layout: PersonalChartLayout,
): Promise<void> {
  await SupersetClient.put({
    endpoint: `/api/v1/dashboard/${dashboardId}/pivot_layout`,
    jsonPayload: layout,
  });
}

export async function deleteDashboardPivotLayout(
  dashboardId: number,
): Promise<void> {
  await SupersetClient.delete({
    endpoint: `/api/v1/dashboard/${dashboardId}/pivot_layout`,
  });
}

export function setPersonalChartLayouts(layouts: PersonalChartLayoutsMap) {
  return {
    type: SET_PERSONAL_CHART_LAYOUTS,
    layouts,
  };
}

export function upsertPersonalChartLayout(
  chartId: number,
  layout: PersonalChartLayout,
) {
  return {
    type: UPSERT_PERSONAL_CHART_LAYOUT,
    chartId,
    layout,
  };
}

export function removePersonalChartLayout(chartId: number) {
  return {
    type: REMOVE_PERSONAL_CHART_LAYOUT,
    chartId,
  };
}

export function setPersonalChartTemplates(
  templates: PersonalChartTemplatesMap,
) {
  return { type: SET_PERSONAL_CHART_TEMPLATES, templates };
}

export function upsertPersonalChartTemplate(
  chartId: number,
  template: PersonalChartTemplate,
) {
  return { type: UPSERT_PERSONAL_CHART_TEMPLATE, chartId, template };
}

export function removePersonalChartTemplate(chartId: number, slot: number) {
  return { type: REMOVE_PERSONAL_CHART_TEMPLATE, chartId, slot };
}

export function setPersonalChartTemplateActiveSlot(
  chartId: number,
  slot: PersonalChartTemplateSelection,
) {
  return { type: SET_PERSONAL_CHART_TEMPLATE_ACTIVE_SLOT, chartId, slot };
}

export async function getDashboardChartLayouts(
  dashboardId: number,
): Promise<PersonalChartLayoutsMap> {
  const { json } = await SupersetClient.get({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_layouts`,
  });
  return (json?.result || {}) as PersonalChartLayoutsMap;
}

export async function putDashboardChartLayout(
  dashboardId: number,
  chartId: number,
  layout: PersonalChartLayout,
): Promise<void> {
  await SupersetClient.put({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_layouts/${chartId}`,
    jsonPayload: layout,
  });
}

export async function deleteDashboardChartLayout(
  dashboardId: number,
  chartId: number,
): Promise<void> {
  await SupersetClient.delete({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_layouts/${chartId}`,
  });
}

export async function getDashboardChartTemplates(
  dashboardId: number,
): Promise<PersonalChartTemplatesMap> {
  /*
   * 功能审计（可重写规格）：仪表盘个人列模板客户端同步
   * - 功能目的与触发方式：仪表盘加载时一次性读取当前用户各透视图的三 slot 模板；弹窗保存、删除和设默认时通过同一 scope API 同步。
   * - 输入契约：dashboardId/chartId 为当前仪表盘及其中图表，slot 只能 1..3；layout 为后端已校验的 v1 列表 JSON，name 最长 40。
   * - 输出契约：读取返回 chartId 到模板数组；写操作返回服务端模板或完成；Redux 仅保存会话选择及模板副本。
   * - 处理流程：DashboardPage 批量 GET 并从 is_default 生成初始会话布局；用户选择模板只派发本地 layout；保存/删除/设默认调用精确 slot API 后更新 Redux。
   * - 业务规则：非默认模板不改 is_default；系统默认只清当前会话布局；草稿仅在弹窗状态，关闭不写入；保存模板记录当时完整 ID 列表。
   * - 状态与副作用：HTTP 调用和 Redux 状态更新；不使用 localStorage、缓存或客户端持久草稿。
   * - 外部依赖：/api/v1/dashboard/<id>/chart_templates，后端按登录用户及 dashboard/chart 归属隔离。
   * - 异常与边界：请求失败由调用图表提示错误且保留草稿/现有会话布局；未登录或无权限不会暴露模板。
   * - 不变量与约束：每个图表最多三个 slot；不得把默认切换隐式绑定到选择；不得调用旧单布局端点作为模板状态来源。
   * - 验证方式：personalChartLayout.test.ts 覆盖 GET/PUT/default 的精确 scope URL；服务器 API/DAO 测试覆盖用户隔离和默认并发。
   */
  const { json } = await SupersetClient.get({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_templates`,
  });
  return (json?.result || {}) as PersonalChartTemplatesMap;
}

export async function putDashboardChartTemplate(
  dashboardId: number,
  chartId: number,
  slot: 1 | 2 | 3,
  name: string,
  layout: PersonalChartLayout,
): Promise<PersonalChartTemplate> {
  const { json } = await SupersetClient.put({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_templates/${chartId}/${slot}`,
    jsonPayload: { name, layout },
  });
  return json.result as PersonalChartTemplate;
}

export async function deleteDashboardChartTemplate(
  dashboardId: number,
  chartId: number,
  slot: 1 | 2 | 3,
): Promise<void> {
  await SupersetClient.delete({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_templates/${chartId}/${slot}`,
  });
}

export async function setDashboardChartTemplateDefault(
  dashboardId: number,
  chartId: number,
  slot: 1 | 2 | 3,
): Promise<PersonalChartTemplate> {
  const { json } = await SupersetClient.post({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_templates/${chartId}/${slot}/default`,
  });
  return json.result as PersonalChartTemplate;
}
