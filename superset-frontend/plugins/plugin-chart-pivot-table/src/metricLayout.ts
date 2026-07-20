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
import { getMetricLabel, QueryFormMetric } from '@superset-ui/core';

export interface PivotMetricDescriptor {
  id: string;
  label: string;
  metric: QueryFormMetric;
}

export interface PivotMetricLayout {
  ordered_metric_ids: string[];
  hidden_metric_ids: string[];
  version: number;
}

export const PIVOT_METRIC_LAYOUT_VERSION = 1;

export interface ReconciledMetricLayout {
  orderedMetrics: PivotMetricDescriptor[];
  orderedMetricIds: string[];
  hiddenMetricIds: string[];
  visibleMetrics: PivotMetricDescriptor[];
}

function normalizeMetricForId(metric: QueryFormMetric): unknown {
  if (typeof metric === 'string') {
    return { type: 'saved', metric };
  }

  const { label: _label, optionName: _optionName, ...rest } = metric;
  return { type: 'adhoc', ...rest };
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function buildMetricDescriptors(
  metrics: QueryFormMetric[],
): PivotMetricDescriptor[] {
  const baseCounts = new Map<string, number>();

  return metrics.map(metric => {
    const baseId = getMetricId(metric);
    const seenCount = baseCounts.get(baseId) || 0;
    baseCounts.set(baseId, seenCount + 1);

    return {
      id: seenCount === 0 ? baseId : `${baseId}__${seenCount + 1}`,
      label: getMetricLabel(metric),
      metric,
    };
  });
}

export function getMetricId(metric: QueryFormMetric): string {
  return stableSerialize(normalizeMetricForId(metric));
}

export function reconcileMetricLayout(
  metrics: PivotMetricDescriptor[],
  layout?: PivotMetricLayout | null,
): ReconciledMetricLayout {
  const metricsById = new Map(metrics.map(metric => [metric.id, metric]));
  const orderedMetrics: PivotMetricDescriptor[] = [];
  const seenIds = new Set<string>();

  (layout?.ordered_metric_ids || []).forEach(metricId => {
    const metric = metricsById.get(metricId);
    if (metric && !seenIds.has(metricId)) {
      orderedMetrics.push(metric);
      seenIds.add(metricId);
    }
  });

  metrics.forEach(metric => {
    if (!seenIds.has(metric.id)) {
      orderedMetrics.push(metric);
      seenIds.add(metric.id);
    }
  });

  const hiddenMetricIds = (layout?.hidden_metric_ids || []).filter(metricId =>
    seenIds.has(metricId),
  );
  const hiddenMetricIdSet = new Set(hiddenMetricIds);

  let visibleMetrics = orderedMetrics.filter(
    metric => !hiddenMetricIdSet.has(metric.id),
  );

  if (visibleMetrics.length === 0 && orderedMetrics.length > 0) {
    hiddenMetricIdSet.delete(orderedMetrics[0].id);
    visibleMetrics = [orderedMetrics[0], ...orderedMetrics.slice(1)].filter(
      metric => !hiddenMetricIdSet.has(metric.id),
    );
  }

  return {
    orderedMetrics,
    orderedMetricIds: orderedMetrics.map(metric => metric.id),
    hiddenMetricIds: orderedMetrics
      .map(metric => metric.id)
      .filter(metricId => hiddenMetricIdSet.has(metricId)),
    visibleMetrics,
  };
}

export function isDefaultMetricLayout(
  metrics: PivotMetricDescriptor[],
  layout?: PivotMetricLayout | null,
): boolean {
  if (!layout) {
    return true;
  }

  const reconciled = reconcileMetricLayout(metrics, layout);

  return (
    reconciled.hiddenMetricIds.length === 0 &&
    reconciled.orderedMetricIds.length === metrics.length &&
    reconciled.orderedMetricIds.every((metricId, index) => metricId === metrics[index].id)
  );
}
