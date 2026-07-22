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
  canPersist: boolean;
  legacyId: string;
  label: string;
  metric: QueryFormMetric;
}

export interface PivotMetricLayout {
  ordered_metric_ids: string[];
  hidden_metric_ids: string[];
  version: number;
}

export const PIVOT_METRIC_LAYOUT_VERSION = 1;

/** 仅用于读取上线前已保存的 layout；新模板永远不再写入此格式。 */
function getLegacyMetricId(metric: QueryFormMetric): string {
  const normalized =
    typeof metric === 'string'
      ? { type: 'saved', metric }
      : (() => {
          const { label: _label, optionName: _optionName, ...rest } = metric;
          return { type: 'adhoc', ...rest };
        })();
  return stableSerialize(normalized);
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
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableSerialize(entryValue)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface ReconciledMetricLayout {
  orderedMetrics: PivotMetricDescriptor[];
  orderedMetricIds: string[];
  hiddenMetricIds: string[];
  visibleMetrics: PivotMetricDescriptor[];
}

export interface ReconcileMetricLayoutOptions {
  includeMissingMetrics?: boolean;
}

export function buildMetricDescriptors(
  metrics: QueryFormMetric[],
): PivotMetricDescriptor[] {
  const counts = new Map<string, number>();
  return metrics.map((metric, index) => {
    const persistenceId = getMetricId(metric);
    const baseId = persistenceId || `__unpersistable_${index}`;
    const occurrence = counts.get(baseId) || 0;
    counts.set(baseId, occurrence + 1);
    return {
      id: occurrence ? `${baseId}__${occurrence + 1}` : baseId,
      canPersist: Boolean(persistenceId) && occurrence === 0,
      legacyId: getLegacyMetricId(metric),
      label: getMetricLabel(metric),
      metric,
    };
  });
}

export function getMetricId(metric: QueryFormMetric): string {
  if (typeof metric === 'string') {
    return metric;
  }
  return typeof (metric as { optionName?: unknown }).optionName === 'string'
    ? (metric as { optionName: string }).optionName
    : '';
}

export function reconcileMetricLayout(
  metrics: PivotMetricDescriptor[],
  layout?: PivotMetricLayout | null,
  options: ReconcileMetricLayoutOptions = {},
): ReconciledMetricLayout {
  /*
   * 功能审计（可重写规格）：透视表个人列模板恢复
   * - 功能目的与触发方式：图表渲染和模板编辑时，把保存的列顺序/隐藏状态恢复为当前指标列表；没有模板时使用系统指标顺序。
   * - 输入契约：saved metric 的 identity 为 metric_name 字符串，adhoc metric 为持久化 optionName；display label 不参与匹配，identity 改名按旧指标删除和新指标新增处理。
   * - 输出契约：返回当前可识别指标的顺序、隐藏集合和至少一个可见指标；不会写入浏览器或服务端。
   * - 处理流程：先按保存顺序匹配已知 ID；系统默认或编辑/保存模式补入全部当前指标；过滤未知 ID；必要时用当前第一个指标兜底显示。
   * - 业务规则：历史模板缺席的新指标保持隐藏；隐藏 ID 必须属于有效排序；全部隐藏或全失效时第一个当前指标可见。
   * - 状态与副作用：纯函数，无网络、缓存或持久化副作用。
   * - 外部依赖：QueryFormMetric、getMetricLabel 和模板 API 的 layout v1 结构。
   * - 异常与边界：没有 optionName 或重复 identity 的指标仍正常渲染但不能保存模板；未知 ID 安静丢弃；空指标返回空布局。
   * - 不变量与约束：不得以 label 作为 ID；渲染历史模板时不得自动展示新增指标，编辑并保存时必须将其补入完整排序且保持隐藏；不得产生重复 ID。
   * - 验证方式：metricLayout.test.ts 覆盖 saved/adhoc identity、label 变化和历史模板新增指标隐藏。
   */
  const metricsById = new Map(metrics.map(metric => [metric.id, metric]));
  const currentIdByLegacyId = new Map(
    metrics.map(metric => [metric.legacyId, metric.id]),
  );
  const resolveMetricId = (metricId: string) =>
    metricsById.has(metricId) ? metricId : currentIdByLegacyId.get(metricId);
  const orderedMetrics: PivotMetricDescriptor[] = [];
  const seenIds = new Set<string>();

  (layout?.ordered_metric_ids || []).forEach(savedMetricId => {
    const metricId = resolveMetricId(savedMetricId);
    const metric = metricId ? metricsById.get(metricId) : undefined;
    if (metric && metricId && !seenIds.has(metricId)) {
      orderedMetrics.push(metric);
      seenIds.add(metricId);
    }
  });

  const hiddenMetricIds = (layout?.hidden_metric_ids || []).reduce<string[]>(
    (ids, savedMetricId) => {
      const metricId = resolveMetricId(savedMetricId);
      if (metricId && seenIds.has(metricId) && !ids.includes(metricId)) {
        ids.push(metricId);
      }
      return ids;
    },
    [],
  );
  const hiddenMetricIdSet = new Set(hiddenMetricIds);
  // 系统默认保持原始全部列；编辑历史模板时追加新增列并默认隐藏。
  if (!layout || options.includeMissingMetrics) {
    metrics.forEach(metric => {
      if (!seenIds.has(metric.id)) {
        orderedMetrics.push(metric);
        seenIds.add(metric.id);
        if (layout) {
          hiddenMetricIdSet.add(metric.id);
        }
      }
    });
  }

  let visibleMetrics = orderedMetrics.filter(
    metric => !hiddenMetricIdSet.has(metric.id),
  );

  if (visibleMetrics.length === 0 && metrics.length > 0) {
    const fallbackMetric = metrics[0];
    if (!seenIds.has(fallbackMetric.id)) {
      orderedMetrics.unshift(fallbackMetric);
      seenIds.add(fallbackMetric.id);
    }
    hiddenMetricIdSet.delete(fallbackMetric.id);
    visibleMetrics = orderedMetrics.filter(
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
    reconciled.orderedMetricIds.every(
      (metricId, index) => metricId === metrics[index].id,
    )
  );
}
