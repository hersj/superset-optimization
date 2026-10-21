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
import type { LegendState } from '@superset-ui/core';

export function legendStorageKey(
  userId: number | undefined,
  dashboardId: number,
  chartId: number,
) {
  return userId
    ? `dashboard__legend_selection:${JSON.stringify([userId, dashboardId, chartId])}`
    : undefined;
}

export function readLegendState(
  key: string | undefined,
): LegendState | undefined {
  if (!key) return undefined;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !Object.values(value).every(item => typeof item === 'boolean')
    )
      return undefined;
    return value as LegendState;
  } catch {
    return undefined;
  }
}

export function writeLegendState(key: string | undefined, value: LegendState) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage restrictions must not block chart selection. */
  }
}
