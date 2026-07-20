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

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomEChartOptions } from './eChartOptionsSchema';

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Index-wise deep merge for arrays.
 * Each custom element is merged into the base element at the same index:
 * plain objects merge recursively, primitives/arrays replace.
 * Base elements beyond the custom array length are preserved untouched.
 * This lets callers override a single series' style (e.g. areaStyle/lineStyle)
 * without having to re-specify the whole — dynamically generated — series array.
 */
function mergeArraysByIndex(
  baseArr: unknown[],
  customArr: unknown[],
): unknown[] {
  const merged = [...baseArr];
  customArr.forEach((customEl, i) => {
    const baseEl = merged[i];
    if (customEl === undefined) {
      return;
    }
    if (isPlainObject(customEl) && isPlainObject(baseEl)) {
      merged[i] = mergeCustomEChartOptions(
        baseEl as EChartsCoreOption,
        customEl as CustomEChartOptions,
      );
    } else {
      merged[i] = customEl;
    }
  });
  return merged;
}

/**
 * Deep merges custom EChart options into base options.
 * Objects are merged recursively; arrays are merged element-wise by index
 * (base elements past the custom length are kept).
 *
 * @param baseOptions - The base ECharts options object
 * @param customOptions - Custom options to merge (from safeParseEChartOptions)
 * @returns Merged ECharts options
 */
export function mergeCustomEChartOptions<T extends EChartsCoreOption>(
  baseOptions: T,
  customOptions: CustomEChartOptions | undefined,
): T & Partial<CustomEChartOptions> {
  type MergedResult = T & Partial<CustomEChartOptions>;

  if (!customOptions) {
    return baseOptions as MergedResult;
  }

  const result = { ...baseOptions } as MergedResult;

  for (const key of Object.keys(customOptions) as Array<
    keyof typeof customOptions
  >) {
    const customValue = customOptions[key];
    const baseValue = result[key as keyof T];

    if (customValue === undefined) {
      continue;
    }

    if (isPlainObject(customValue) && isPlainObject(baseValue)) {
      // Recursively merge nested objects
      (result as PlainObject)[key] = mergeCustomEChartOptions(
        baseValue as EChartsCoreOption,
        customValue as CustomEChartOptions,
      );
    } else if (Array.isArray(customValue) && Array.isArray(baseValue)) {
      // Merge arrays element-wise by index (e.g. per-series style overrides)
      (result as PlainObject)[key] = mergeArraysByIndex(
        baseValue as unknown[],
        customValue as unknown[],
      );
    } else {
      // Replace remaining values directly
      (result as PlainObject)[key] = customValue;
    }
  }

  return result;
}

export default mergeCustomEChartOptions;
