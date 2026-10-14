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
import { buildQueryContext, QueryFormData } from '@superset-ui/core';
import {
  buildBigNumberPeriodQueries,
  getBigNumberCustomPeriod,
} from '../customComparison';
import { getBigNumberComparisonRanges } from './comparisonRanges';

type ComparisonMode = 'previous' | 'year';

const DEFAULT_COMPARISON_MODES: ComparisonMode[] = ['previous', 'year'];

function getFormDataValue<T>(
  formData: QueryFormData,
  snakeKey: string,
  camelKey: string,
): T | undefined {
  const values = formData as Record<string, T | undefined>;
  return values[snakeKey] ?? values[camelKey];
}

function getComparisonModes(formData: QueryFormData): ComparisonMode[] {
  const rawModes = getFormDataValue<ComparisonMode | ComparisonMode[]>(
    formData,
    'comparison_modes',
    'comparisonModes',
  );
  if (rawModes === undefined) {
    return DEFAULT_COMPARISON_MODES;
  }
  const modes = Array.isArray(rawModes) ? rawModes : [rawModes];
  return modes.filter(
    (mode): mode is ComparisonMode => mode === 'previous' || mode === 'year',
  );
}

function isComparisonEnabled(formData: QueryFormData): boolean {
  return (
    getFormDataValue<boolean>(
      formData,
      'comparison_enabled',
      'comparisonEnabled',
    ) !== false
  );
}

export default function buildQuery(formData: QueryFormData) {
  return buildQueryContext(formData, baseQueryObject => {
    const customPeriod = getBigNumberCustomPeriod(formData);
    if (customPeriod)
      return buildBigNumberPeriodQueries(baseQueryObject, customPeriod);
    const timeRange =
      (baseQueryObject.time_range as string | undefined) ||
      (formData.time_range as string | undefined) ||
      ((formData as any).extraFormData?.time_range as string | undefined);
    const comparisonModes = getComparisonModes(formData);

    if (!isComparisonEnabled(formData) || comparisonModes.length === 0) {
      return [baseQueryObject];
    }

    const comparisonRanges = getBigNumberComparisonRanges(timeRange);

    if (!comparisonRanges) {
      return [baseQueryObject];
    }

    return [
      baseQueryObject,
      ...(comparisonModes.includes('previous')
        ? [
            {
              ...baseQueryObject,
              time_range: comparisonRanges.previousRange,
            },
          ]
        : []),
      ...(comparisonModes.includes('year')
        ? [
            {
              ...baseQueryObject,
              time_range: comparisonRanges.yearRange,
            },
          ]
        : []),
    ];
  });
}
