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
import { ensureIsArray } from '@superset-ui/core';
import type { EChartsCoreOption } from 'echarts/core';
import type {
  DataZoomComponentOption,
  GridComponentOption,
} from 'echarts/components';
import type { YAXisComponentOption } from 'echarts/types/dist/shared';

type Viewport = { start: number; end: number };

function isViewport(value: unknown): value is Viewport {
  if (typeof value !== 'object' || value === null) return false;
  const range = value as Viewport;
  return (
    typeof range.start === 'number' &&
    Number.isFinite(range.start) &&
    typeof range.end === 'number' &&
    Number.isFinite(range.end) &&
    range.start >= 0 &&
    range.end <= 100 &&
    range.start <= range.end
  );
}

export function restoreMatrixViewport(
  options: EChartsCoreOption,
  key?: string,
): EChartsCoreOption {
  const zooms = ensureIsArray(options.dataZoom as DataZoomComponentOption[]);
  if (!key || !zooms.some(zoom => zoom.id === 'matrix-rows')) return options;
  try {
    const range: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!isViewport(range)) return options;
    return {
      ...options,
      dataZoom: zooms.map(zoom =>
        zoom.yAxisIndex === 0
          ? {
              ...zoom,
              start: range.start,
              end: range.end,
              // Percentages preserve the slider's length when refreshed row counts change.
              startValue: undefined,
              endValue: undefined,
            }
          : zoom,
      ),
    };
  } catch {
    return options;
  }
}

export function persistMatrixViewport(options: EChartsCoreOption, key: string) {
  const zoom = ensureIsArray(
    options.dataZoom as DataZoomComponentOption[],
  ).find(item => item.id === 'matrix-rows');
  if (!isViewport(zoom)) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ start: zoom.start, end: zoom.end }),
    );
  } catch {
    // Storage restrictions must not prevent chart navigation.
  }
}

export function getScrollableChartHeight(
  options: EChartsCoreOption,
  viewportHeight: number,
  minCategoryHeight: number,
): number {
  const [axis] = ensureIsArray(options.yAxis as YAXisComponentOption[]);
  const count = axis?.data?.length ?? 0;
  const zoom = ensureIsArray(
    options.dataZoom as DataZoomComponentOption[],
  ).find(item => item.id === 'matrix-rows');
  const start = typeof zoom?.start === 'number' ? zoom.start : 0;
  const end = typeof zoom?.end === 'number' ? zoom.end : 100;
  // Category zoom rounds its endpoints; include the endpoint row in the height.
  const visibleRows = count
    ? Math.ceil(((count - 1) * (end - start)) / 100) + 1
    : 0;
  const [grid] = ensureIsArray(options.grid as GridComponentOption[]);
  const top = typeof grid?.top === 'number' ? grid.top : 38;
  const bottom = typeof grid?.bottom === 'number' ? grid.bottom : 42;
  return Math.max(
    viewportHeight,
    visibleRows * minCategoryHeight + top + bottom,
  );
}

// Anchor to identity rather than a pixel offset when rankings or row density change.
export function getSkuScrollGeometry(
  options: EChartsCoreOption,
  height: number,
) {
  const [axis] = ensureIsArray(options.yAxis as YAXisComponentOption[]);
  const categories = (axis?.data ?? []).map(String);
  const zoom = ensureIsArray(
    options.dataZoom as DataZoomComponentOption[],
  ).find(item => item.id === 'matrix-rows');
  const start = Math.round(
    ((categories.length - 1) * (zoom?.start ?? 0)) / 100,
  );
  const end = Math.round(((categories.length - 1) * (zoom?.end ?? 100)) / 100);
  const values = categories.slice(Math.max(0, start), end + 1);
  if (!axis?.inverse) values.reverse();
  const [grid] = ensureIsArray(options.grid as GridComponentOption[]);
  const top = typeof grid?.top === 'number' ? grid.top : 38;
  const bottom = typeof grid?.bottom === 'number' ? grid.bottom : 42;
  return {
    values,
    top,
    pitch: Math.max(1, (height - top - bottom) / Math.max(1, values.length)),
  };
}

export function persistSkuScroll(
  options: EChartsCoreOption,
  height: number,
  scrollTop: number,
  key: string,
) {
  const { values, top, pitch } = getSkuScrollGeometry(options, height);
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.floor((scrollTop - top) / pitch)),
  );
  try {
    localStorage.setItem(`${key}:scroll`, JSON.stringify(scrollTop));
    if (values[index])
      localStorage.setItem(
        `${key}:anchor`,
        JSON.stringify({
          value: values[index],
          index,
          offset: (scrollTop - top - index * pitch) / pitch,
        }),
      );
  } catch {
    /* Storage restrictions must not prevent chart navigation. */
  }
}

export function restoreSkuScroll(
  options: EChartsCoreOption,
  height: number,
  viewportHeight: number,
  key?: string,
): number {
  if (!key) return 0;
  let target = 0;
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(`${key}:scroll`) ?? 'null',
    );
    if (typeof saved === 'number' && Number.isFinite(saved)) target = saved;
    if (saved == null) {
      const legacy: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (isViewport(legacy))
        target = (legacy.start / 100) * Math.max(0, height - viewportHeight);
    }
    const anchor = JSON.parse(localStorage.getItem(`${key}:anchor`) ?? 'null');
    const { values, top, pitch } = getSkuScrollGeometry(options, height);
    if (
      typeof anchor?.value === 'string' &&
      Number.isInteger(anchor.index) &&
      anchor.index >= 0 &&
      Number.isFinite(anchor.offset) &&
      Math.abs(anchor.offset) <= 1 &&
      values.length
    ) {
      const found = values.indexOf(anchor.value);
      const index =
        found < 0 ? Math.min(anchor.index, values.length - 1) : found;
      target = top + (index + anchor.offset) * pitch;
    }
  } catch {
    /* Invalid or unavailable preferences use the beginning of the list. */
  }
  return Math.max(0, Math.min(target, height - viewportHeight));
}
