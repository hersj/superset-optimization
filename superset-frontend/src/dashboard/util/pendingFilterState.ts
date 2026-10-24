/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
const storageKey = (userId: number, dashboardId: number) =>
  `dashboard__pending_filters:${JSON.stringify([userId, dashboardId])}`;

// Serialize writes so a slow acknowledgement cannot restore an older selection.
export function createFilterStateSaveQueue(
  save: (value: string) => Promise<void>,
) {
  let latest: string | undefined;
  let inFlight: Promise<void> | undefined;
  return (value: string): Promise<void> => {
    latest = value;
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(async () => {
          while (latest !== undefined) {
            const next = latest;
            latest = undefined;
            await save(next);
          }
        })
        .finally(() => {
          inFlight = undefined;
        });
    }
    return inFlight;
  };
}

// Bridge the server-save debounce; only the same user, dashboard and URL context
// may restore it. Remove it after the matching server acknowledgement.
export function writePendingFilterState(
  userId: number,
  dashboardId: number,
  nativeKey: string | null | undefined,
  value: string,
) {
  try {
    localStorage.setItem(
      storageKey(userId, dashboardId),
      JSON.stringify({ nativeKey: nativeKey ?? null, value }),
    );
  } catch {
    // Existing server persistence still works when browser storage is restricted.
  }
}

export function readPendingFilterState(
  userId: number,
  dashboardId: number,
  nativeKey: string | null | undefined,
): Record<string, unknown> | undefined {
  try {
    const pending = JSON.parse(
      localStorage.getItem(storageKey(userId, dashboardId)) ?? 'null',
    );
    if (
      pending?.nativeKey !== (nativeKey ?? null) ||
      typeof pending?.value !== 'string'
    )
      return undefined;
    const mask: unknown = JSON.parse(pending.value);
    return mask && typeof mask === 'object' && !Array.isArray(mask)
      ? (mask as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function clearPendingFilterState(
  userId: number,
  dashboardId: number,
  acknowledgedValue: string,
) {
  try {
    const key = storageKey(userId, dashboardId);
    const pending = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (pending?.value === acknowledgedValue) localStorage.removeItem(key);
  } catch {
    // An older or failed request must not discard a newer local selection.
  }
}
