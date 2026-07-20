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
  version: number;
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

export const SET_PERSONAL_CHART_LAYOUTS = 'SET_PERSONAL_CHART_LAYOUTS';
export const UPSERT_PERSONAL_CHART_LAYOUT = 'UPSERT_PERSONAL_CHART_LAYOUT';
export const REMOVE_PERSONAL_CHART_LAYOUT = 'REMOVE_PERSONAL_CHART_LAYOUT';

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
