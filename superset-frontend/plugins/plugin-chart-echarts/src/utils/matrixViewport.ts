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
