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
  const entries = Object.entries(seriesValues).filter(
    ([key]) => key !== field && data.some(row => Object.hasOwn(row, key)),
  );
  const expanded = data.flatMap(row => {
    const values = [
      ...new Set(
        entries
          .filter(
            ([key]) =>
              row[key] != null &&
              (typeof row[key] !== 'number' || Number.isFinite(row[key])),
          )
          .map(([, value]) => value),
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
    const parts = value.split('-');
    let headLength = Math.min(3, parts.length);
    while (/^\d+$/.test(parts[headLength] ?? '')) headLength += 1;
    const short =
      chars.reduce(
        (length, char) => length + (char.codePointAt(0)! > 255 ? 2 : 1),
        0,
      ) > 28 && parts.length > headLength + 3
        ? `${parts.slice(0, headLength).join('-')}\n${parts.slice(-3).join('-')}`
        : value;
    aliases.set(short, [...(aliases.get(short) ?? []), value]);
  });
  const labels: Record<string, string> = {};
  const fullValues: Record<string, string> = {};
  const selected: LegendState = {};
  const scopePrefix = `sku:${JSON.stringify([field]).slice(0, -1)},`;
  const hasSavedSelection = Object.keys(state).some(key =>
    key.startsWith(scopePrefix),
  );
  aliases.forEach((members, alias) => {
    const parts = members.map(value => value.split('-'));
    const differentPositions = Array.from(
      { length: Math.max(...parts.map(tokens => tokens.length)) },
      (_, index) => index,
    ).filter(index => new Set(parts.map(tokens => tokens[index])).size > 1);
    // Prefer the shortest real differing fields; add more only until all variants differ.
    const distinguishing: number[] = [];
    differentPositions.sort(
      (a, b) =>
        Math.max(...parts.map(tokens => (tokens[a] ?? '').length)) -
        Math.max(...parts.map(tokens => (tokens[b] ?? '').length)),
    );
    for (const position of differentPositions) {
      distinguishing.push(position);
      if (
        new Set(
          parts.map(tokens =>
            JSON.stringify(distinguishing.map(index => tokens[index])),
          ),
        ).size === members.length
      )
        break;
    }
    members.forEach(value => {
      const key = `sku:${JSON.stringify([field, value])}`;
      let label = alias;
      if (members.length > 1) {
        // Real differing tokens distinguish variants without changing their full-name keys.
        const tokens = value.split('-');
        const [head, tail] = alias.split('\n');
        label = `${head}\n${distinguishing.map(index => tokens[index] ?? '∅').join(' · ')} · ${tail ?? ''}`;
      }
      labels[key] = label;
      fullValues[key] = value;
      selected[key] = state[key] ?? !hasSavedSelection;
    });
  });
  const counts = new Map<string, number>();
  Object.values(labels).forEach(label =>
    counts.set(label, (counts.get(label) ?? 0) + 1),
  );
  Object.keys(labels).forEach(key => {
    const label = labels[key];
    if (counts.get(label)! > 1) {
      labels[key] = fullValues[key];
    }
  });
  return { names: Object.keys(labels), labels, values: fullValues, selected };
}
