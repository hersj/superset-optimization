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

export type ChartRowLimits = Record<string, number>;
export const SET_CHART_ROW_LIMITS = 'SET_CHART_ROW_LIMITS';
export const SET_CHART_ROW_LIMIT = 'SET_CHART_ROW_LIMIT';

export const setChartRowLimits = (rowLimits: ChartRowLimits | null) => ({
  type: SET_CHART_ROW_LIMITS,
  rowLimits,
});
export const setChartRowLimit = (chartId: number, rowLimit: number | null) => ({
  type: SET_CHART_ROW_LIMIT,
  chartId,
  rowLimit,
});
export async function getChartRowLimits(
  dashboardId: number,
): Promise<ChartRowLimits> {
  const { json } = await SupersetClient.get({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_row_limits`,
  });
  return json.result;
}
export async function saveChartRowLimit(
  dashboardId: number,
  chartId: number,
  rowLimit: number | null,
): Promise<void> {
  await SupersetClient.put({
    endpoint: `/api/v1/dashboard/${dashboardId}/chart_row_limits`,
    jsonPayload: { chart_id: chartId, row_limit: rowLimit },
  });
}
