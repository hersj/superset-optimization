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
import { RefObject, useEffect, useRef } from 'react';

type ScopeId = string | number;
type Position = { top: number; left: number };
export type PersonalChartViewport = {
  positions: Record<string, Position>;
  currentPage?: number;
  pageSize?: number;
};

const storageKey = (user: ScopeId, dashboard: ScopeId, chart: ScopeId) =>
  `superset.personal-chart-viewport:${JSON.stringify([String(user), String(dashboard), String(chart)])}`;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isOffset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isPage = (value: unknown): value is number =>
  isOffset(value) && Number.isInteger(value);
const isMarker = (value: string | null): value is string =>
  value === 'table' || value === 'pivot';

/** Local browsing state is scoped to the exact applied sort, never filter state. */
export function readPersonalChartViewport(
  user: ScopeId,
  dashboard: ScopeId,
  chart: ScopeId,
  signature: string,
): PersonalChartViewport | undefined {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(storageKey(user, dashboard, chart)) ?? 'null',
    );
    if (
      !isObject(saved) ||
      saved.signature !== signature ||
      !isObject(saved.positions)
    )
      return undefined;
    const positions: Record<string, Position> = {};
    Object.entries(saved.positions).forEach(([marker, position]) => {
      if (
        isMarker(marker) &&
        isObject(position) &&
        isOffset(position.top) &&
        isOffset(position.left)
      ) {
        positions[marker] = { top: position.top, left: position.left };
      }
    });
    return {
      positions,
      ...(isPage(saved.currentPage) ? { currentPage: saved.currentPage } : {}),
      ...(isPage(saved.pageSize) ? { pageSize: saved.pageSize } : {}),
    };
  } catch {
    return undefined;
  }
}

export function updatePersonalChartViewport(
  user: ScopeId,
  dashboard: ScopeId,
  chart: ScopeId,
  signature: string,
  patch: Partial<PersonalChartViewport>,
): void {
  // Read at write time: page events and scroll events must not overwrite each
  // other's independently updated fields with a stale React render snapshot.
  const current = readPersonalChartViewport(user, dashboard, chart, signature);
  try {
    localStorage.setItem(
      storageKey(user, dashboard, chart),
      JSON.stringify({
        ...current,
        ...patch,
        signature,
        positions: { ...current?.positions, ...patch.positions },
      }),
    );
  } catch {
    // Storage denial or quota must not prevent chart interactions.
  }
}

export function usePersonalChartViewport(
  ref: RefObject<HTMLElement>,
  user: ScopeId,
  dashboard: ScopeId,
  chart: ScopeId,
  signature: string,
  ready: boolean,
): void {
  const previous = useRef<{ key: string; signature: string }>();
  useEffect(() => {
    const key = storageKey(user, dashboard, chart);
    const changed =
      previous.current?.key === key && previous.current.signature !== signature;
    // Before the first successful result, sort may still be hydrating. That
    // initial null -> saved sort transition is not a user's reset action.
    if (ready || previous.current?.key === key) {
      previous.current = { key, signature };
    } else {
      previous.current = undefined;
    }
    if (changed) {
      const current = readPersonalChartViewport(
        user,
        dashboard,
        chart,
        signature,
      );
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ ...current, signature, positions: {} }),
        );
      } catch {
        // See updatePersonalChartViewport: persistence is best effort.
      }
    }
    const root = ref.current;
    if (!root || !ready) return undefined;
    const restored = new WeakSet<HTMLElement>();
    const pending: Record<string, Position> = {};
    let restoreFrame = 0;
    let saveFrame = 0;
    const restore = () => {
      restoreFrame = 0;
      const saved = readPersonalChartViewport(
        user,
        dashboard,
        chart,
        signature,
      );
      root
        .querySelectorAll<HTMLElement>('[data-personal-sort-scroll]')
        .forEach(node => {
          const marker = node.getAttribute('data-personal-sort-scroll');
          if (!isMarker(marker) || restored.has(node)) return;
          const target = saved?.positions[marker] ?? { top: 0, left: 0 };
          node.scrollTop = target.top;
          node.scrollLeft = target.left;
          // A still-empty measuring container can clamp to zero. Wait for a DOM
          // mutation instead of persisting that transient zero over saved state.
          if (node.scrollTop === target.top && node.scrollLeft === target.left)
            restored.add(node);
        });
    };
    const scheduleRestore = () => {
      if (!restoreFrame) restoreFrame = requestAnimationFrame(restore);
    };
    const onScroll = (event: Event) => {
      const node = event.target;
      if (!(node instanceof HTMLElement) || !restored.has(node)) return;
      const marker = node.getAttribute('data-personal-sort-scroll');
      if (!isMarker(marker)) return;
      pending[marker] = { top: node.scrollTop, left: node.scrollLeft };
      if (!saveFrame)
        saveFrame = requestAnimationFrame(() => {
          saveFrame = 0;
          updatePersonalChartViewport(user, dashboard, chart, signature, {
            positions: { ...pending },
          });
          Object.keys(pending).forEach(name => delete pending[name]);
        });
    };
    const observer = new MutationObserver(scheduleRestore);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener('scroll', onScroll, true);
    scheduleRestore();
    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', onScroll, true);
      cancelAnimationFrame(restoreFrame);
      cancelAnimationFrame(saveFrame);
      if (Object.keys(pending).length) {
        updatePersonalChartViewport(user, dashboard, chart, signature, {
          positions: pending,
        });
      }
    };
  }, [ref, user, dashboard, chart, signature, ready]);
}
