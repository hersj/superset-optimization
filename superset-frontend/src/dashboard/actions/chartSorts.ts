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
import { PersonalChartSort, SupersetClient } from '@superset-ui/core';
import { createFilterStateSaveQueue } from '../util/pendingFilterState';

export type ChartSorts = Record<string, PersonalChartSort>;
export const SET_CHART_SORTS = 'SET_CHART_SORTS';
export const SET_CHART_SORT = 'SET_CHART_SORT';

export const setChartSorts = (sorts: ChartSorts | null) => ({
  type: SET_CHART_SORTS,
  sorts,
});
export const setChartSort = (
  chartId: number,
  sort: PersonalChartSort | null,
) => ({
  type: SET_CHART_SORT,
  chartId,
  sort,
});

export async function getChartSorts(dashboardId: number): Promise<ChartSorts> {
  const { json } = await SupersetClient.get({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_sorts`,
  });
  return json.result;
}

export async function saveChartSort(
  dashboardId: number,
  chartId: number,
  sort: PersonalChartSort | null,
): Promise<void> {
  await SupersetClient.put({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_sorts`,
    jsonPayload: { chart_id: chartId, sort },
  });
}

const pendingKey = (userId: number, dashboardId: number) =>
  `dashboard__pending_chart_sorts:${JSON.stringify([userId, dashboardId])}`;

export function readPendingChartSorts(
  userId: number,
  dashboardId: number,
): Record<string, PersonalChartSort | null> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(pendingKey(userId, dashboardId)) ?? '{}',
    );
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, PersonalChartSort | null>)
      : {};
  } catch {
    return {};
  }
}

export function writePendingChartSort(
  userId: number,
  dashboardId: number,
  chartId: number,
  value: PersonalChartSort | null,
) {
  try {
    localStorage.setItem(
      pendingKey(userId, dashboardId),
      JSON.stringify({
        ...readPendingChartSorts(userId, dashboardId),
        [chartId]: value,
      }),
    );
  } catch {
    // The server remains authoritative if browser storage is unavailable.
  }
}

export function clearPendingChartSort(
  userId: number,
  dashboardId: number,
  chartId: number,
  acknowledged: PersonalChartSort | null,
) {
  const pending = readPendingChartSorts(userId, dashboardId);
  if (JSON.stringify(pending[chartId]) !== JSON.stringify(acknowledged)) return;
  delete pending[chartId];
  try {
    if (Object.keys(pending).length)
      localStorage.setItem(
        pendingKey(userId, dashboardId),
        JSON.stringify(pending),
      );
    else localStorage.removeItem(pendingKey(userId, dashboardId));
  } catch {
    // Failure only leaves an acknowledged recovery hint.
  }
}

// Hydration recovery and live edits must share the same per-chart write order.
const saveQueues = new Map<
  string,
  ReturnType<typeof createFilterStateSaveQueue>
>();
export function saveQueuedChartSort(
  userId: number,
  dashboardId: number,
  chartId: number,
  sort: PersonalChartSort | null,
) {
  const scope = JSON.stringify([userId, dashboardId, chartId]);
  let queue = saveQueues.get(scope);
  if (!queue) {
    queue = createFilterStateSaveQueue(async serialized => {
      const value: PersonalChartSort | null = JSON.parse(serialized);
      await saveChartSort(dashboardId, chartId, value);
      clearPendingChartSort(userId, dashboardId, chartId, value);
    });
    saveQueues.set(scope, queue);
  }
  return queue(JSON.stringify(sort));
}
