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
import { DataRecordValue, getNumberFormatter } from '@superset-ui/core';
import type { DateFormatter } from '../types';

export type PivotNumberFormatRuleAxis = 'row' | 'column';

export interface PivotNumberFormatRule {
  axis: PivotNumberFormatRuleAxis;
  field: string;
  value: string;
  format: string;
  key?: string;
}

export interface FormatPivotValueWithRulesArgs {
  value: unknown;
  rowAttrs: string[];
  rowKey: string[];
  colAttrs: string[];
  colKey: string[];
  rules?: PivotNumberFormatRule[];
  dateFormatters?: Record<string, DateFormatter | undefined>;
  defaultFormatter: (value: unknown) => string;
}

function normalizeComparableValue(value: unknown): string {
  return String(value ?? '').trim();
}

function getDisplayValue(
  field: string,
  value: DataRecordValue,
  dateFormatters?: Record<string, DateFormatter | undefined>,
): string {
  const formatter = dateFormatters?.[field];
  if (!formatter) {
    return normalizeComparableValue(value);
  }
  return normalizeComparableValue(formatter(value));
}

function matchesKeyValue(
  rule: PivotNumberFormatRule,
  attrs: string[],
  key: string[],
  dateFormatters?: Record<string, DateFormatter | undefined>,
): boolean {
  const attrIndex = attrs.indexOf(rule.field);
  if (attrIndex < 0 || attrIndex >= key.length) {
    return false;
  }
  const rawValue = normalizeComparableValue(key[attrIndex]);
  const displayValue = getDisplayValue(
    rule.field,
    key[attrIndex] as DataRecordValue,
    dateFormatters,
  );
  const targetValue = normalizeComparableValue(rule.value);
  return rawValue === targetValue || displayValue === targetValue;
}

function findMatchingRule(
  axis: PivotNumberFormatRuleAxis,
  attrs: string[],
  key: string[],
  rules: PivotNumberFormatRule[],
  dateFormatters?: Record<string, DateFormatter | undefined>,
): PivotNumberFormatRule | undefined {
  return rules.find(
    rule =>
      rule.axis === axis &&
      rule.field &&
      rule.value !== undefined &&
      rule.format &&
      matchesKeyValue(rule, attrs, key, dateFormatters),
  );
}

function formatWithRule(
  value: unknown,
  rule: PivotNumberFormatRule,
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  try {
    return getNumberFormatter(rule.format)(value);
  } catch {
    return null;
  }
}

export function formatPivotValueWithRules({
  value,
  rowAttrs,
  rowKey,
  colAttrs,
  colKey,
  rules = [],
  dateFormatters,
  defaultFormatter,
}: FormatPivotValueWithRulesArgs): string {
  const columnRule = findMatchingRule(
    'column',
    colAttrs,
    colKey,
    rules,
    dateFormatters,
  );
  if (columnRule) {
    const formattedValue = formatWithRule(value, columnRule);
    if (formattedValue !== null) {
      return formattedValue;
    }
  }

  const rowRule = findMatchingRule(
    'row',
    rowAttrs,
    rowKey,
    rules,
    dateFormatters,
  );
  if (rowRule) {
    const formattedValue = formatWithRule(value, rowRule);
    if (formattedValue !== null) {
      return formattedValue;
    }
  }

  return defaultFormatter(value);
}
