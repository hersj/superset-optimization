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
import type { LegendState, DataRecord } from '@superset-ui/core';

export type SkuSelection = {
  names: string[];
  labels: Record<string, string>;
  values: Record<string, string>;
  selected: LegendState;
  axisValues?: Record<string, string>;
};

// Legacy SQL aliases may collide, while their series retain complete SKU keys.
export function expandSkuAliases(
  data: DataRecord[],
  field: string,
  seriesValues: Record<string, string>,
) {
  const axisValues: Record<string, string> = {};
  const entries = Object.entries(seriesValues);
  const expanded = data.flatMap(row => {
    const values = [
      ...new Set(
        entries.filter(([key]) => row[key] != null).map(([, value]) => value),
      ),
    ];
    return values.map(value => {
      axisValues[value] = String(row[field] ?? '');
      return {
        ...row,
        [field]: value,
        ...Object.fromEntries(
          entries
            .filter(([, sku]) => sku !== value)
            .map(([key]) => [key, null]),
        ),
      };
    });
  });
  return { data: expanded, axisValues };
}

// Display aliases never become data, filter, color or persistence keys.
export function buildSkuSelection(
  field: string,
  values: string[],
  state: LegendState = {},
): SkuSelection {
  const unique = [...new Set(values)].sort();
  const aliases = new Map<string, string[]>();
  unique.forEach(value => {
    const chars = Array.from(value);
    const short =
      chars.reduce(
        (length, char) => length + (char.codePointAt(0)! > 255 ? 2 : 1),
        0,
      ) > 28
        ? `${Array.from(value.split('-').slice(0, 3).join('-')).slice(0, 10).join('')}…\n…${chars.slice(-12).join('')}`
        : value;
    aliases.set(short, [...(aliases.get(short) ?? []), value]);
  });
  const labels: Record<string, string> = {};
  const fullValues: Record<string, string> = {};
  const selected: LegendState = {};
  aliases.forEach((members, alias) => {
    members.forEach(value => {
      const key = `sku:${JSON.stringify([field, value])}`;
      let label = alias;
      if (members.length > 1) {
        // A deterministic code survives query ordering; collisions get
        // a distinct prefix instead of presenting two identical aliases.
        let hash = 2166136261;
        for (const char of value) {
          hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
        }
        label = `[${hash.toString(36)}] ${alias}`;
      }
      labels[key] = label;
      fullValues[key] = value;
      selected[key] = state[key] ?? true;
    });
  });
  const counts = new Map<string, number>();
  Object.values(labels).forEach(label =>
    counts.set(label, (counts.get(label) ?? 0) + 1),
  );
  const collisions = new Map<string, number>();
  Object.keys(labels).forEach(key => {
    const label = labels[key];
    if (counts.get(label)! > 1) {
      const index = (collisions.get(label) ?? 0) + 1;
      collisions.set(label, index);
      labels[key] = `#${index} ${label}`;
    }
  });
  return { names: Object.keys(labels), labels, values: fullValues, selected };
}
