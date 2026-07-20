/*
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

import type { AdhocMetric } from '@superset-ui/core';

export const PIVOT_RATIO_AGGREGATE_FUNCTION = 'Ratio of sums';
export const PIVOT_ABSOLUTE_RATIO_AGGREGATE_FUNCTION = 'Absolute ratio of sums';
export const PIVOT_RATIO_NUMERATOR_FIELD = '__pivotRatioNumerator';
export const PIVOT_RATIO_DENOMINATOR_FIELD = '__pivotRatioDenominator';

export type PivotRatioColumnConfig = {
  pivotRatioNumerator?: string;
  pivotRatioDenominator?: string;
  pivotRatioUseAbsoluteNumerator?: boolean;
};

export type PivotRatioComponentLabels = {
  numeratorLabel: string;
  denominatorLabel: string;
};

export type PivotRatioConfiguration = {
  helperMetrics: AdhocMetric[];
  metricRatioComponents: Record<string, PivotRatioComponentLabels>;
};

/**
 * 将查询结果展开成 PivotData 记录，并保证率指标即使当前桶的展示值为 NULL，
 * 分子、分母仍能进入上级小计和总计；普通指标继续过滤 NULL 展示记录。
 */
export function unpivotPivotTableData(
  data: Record<string, unknown>[],
  metricNames: string[],
  metricRatioComponents: Record<string, PivotRatioComponentLabels>,
  metricKey: string,
  currencyCodeColumn?: string,
) {
  return data.flatMap(record =>
    metricNames
      .map(name => ({
        ...record,
        [metricKey]: name,
        value: record[name],
        [PIVOT_RATIO_NUMERATOR_FIELD]: metricRatioComponents[name]
          ? record[metricRatioComponents[name].numeratorLabel]
          : undefined,
        [PIVOT_RATIO_DENOMINATOR_FIELD]: metricRatioComponents[name]
          ? record[metricRatioComponents[name].denominatorLabel]
          : undefined,
        __currencyColumn: currencyCodeColumn,
      }))
      .filter(
        record =>
          record.value !== null ||
          metricRatioComponents[record[metricKey] as string] !== undefined,
      ),
  );
}

const createHelperMetric = (
  label: string,
  sqlExpression: string,
): AdhocMetric => ({
  expressionType: 'SQL',
  hasCustomLabel: true,
  label,
  sqlExpression,
});

/**
 * 功能审计（可重写规格）：透视表率指标按分子分母重算小计与总计
 * - 功能目的与触发方式：当透视表某个指标在 column_config 同时配置 pivotRatioNumerator 与 pivotRatioDenominator 时启用，避免对月、季、年等分组后的率值做等权平均。
 * - 输入契约：配置键为可见指标标签；分子和分母均为非空 SQL 聚合表达式字符串，表达式由 Superset 原有查询权限与 SQL 校验链处理；可选 activeMetricNames 限定当前图表仍在使用的指标；缺少任一表达式时视为未启用；pivotRatioUseAbsoluteNumerator 仅控制汇总后的分子是否取绝对值。
 * - 输出契约：交互式图表查询返回不展示的 AdhocMetric 查询项，以及“可见指标标签 -> 分子结果列/分母结果列”的映射；未配置率指标时返回空数组与空映射，旧图表查询保持不变；CSV/XLSX/原始 JSON 下载不附加内部列。
 * - 处理流程：按 column_config 的稳定遍历顺序筛选完整配置，为每个率指标生成短且保留前缀的内部结果列，将分子、分母表达式跨角色去重后加入同一次交互式图表查询，并把结果列映射交给前端聚合器；展开查询结果时，率指标即使展示值为 NULL 也保留其组件记录。
 * - 业务规则：率指标的小计和总计必须为范围内 SUM(分子) / SUM(分母)，不能平均明细率；费用率可配置为 ABS(SUM(有符号分子)) / SUM(分母)，禁止先对每个时间桶取 ABS 再相加；ROI 等利润率默认保留正负号；普通 Sum、Average 等指标继续使用原聚合规则；显式率配置优先于 pivotAggregateFunction。
 * - 状态与副作用：仅扩展交互式图表查询的 SELECT 聚合列和前端内存记录，不写数据库、不新增查询次数、不把辅助列渲染或导出成用户指标。
 * - 外部依赖：依赖 Superset buildQueryContext 执行 AdhocMetric SQL、查询响应保留自定义标签，以及 PivotData 对同一范围记录逐条 push 的既有行为。
 * - 异常与边界：空白、不完整或已从图表移除的指标配置被忽略；组件 NULL 按 SQL SUM 规则忽略；聚合后分母为 0 时显示空值；SQL 表达式非法时沿用图表查询原有错误，不静默改写或降级为错误平均值。
 * - 不变量与约束：交互式图表在同一筛选范围的最终率总计不随时间粒度变化；分子保留正负号；率配置之间相同的组件 SQL 只生成一个辅助指标；内部辅助列名不得依赖 SQL 文本长度，避免数据库别名截断；下载仍走 Superset 既有服务端透视处理，本功能不宣称改变其总计口径；旧图表和非率指标行为不变。
 * - 验证方式：buildQuery.test.ts 验证同查询辅助指标与下载隔离，transformProps.test.ts 验证映射与聚合优先级，pivotRatioMetrics.test.ts 验证跨角色去重和 NULL 展示桶保留，pivotData.test.ts 验证月季粒度一致、组件 NULL、零分母及原指标聚合兼容。
 */
export function getPivotRatioConfiguration(
  columnConfig: Record<string, PivotRatioColumnConfig> = {},
  activeMetricNames?: readonly string[],
): PivotRatioConfiguration {
  const helperMetrics: AdhocMetric[] = [];
  const metricRatioComponents: Record<string, PivotRatioComponentLabels> = {};
  const helperLabelsBySql = new Map<string, string>();
  const activeMetrics = activeMetricNames
    ? new Set(activeMetricNames)
    : undefined;
  let ratioIndex = 0;

  Object.entries(columnConfig).forEach(([metricName, config]) => {
    if (activeMetrics && !activeMetrics.has(metricName)) {
      return;
    }
    const numerator = config?.pivotRatioNumerator?.trim();
    const denominator = config?.pivotRatioDenominator?.trim();
    if (!numerator || !denominator) {
      return;
    }

    // 辅助别名保持短且确定，避免长中文指标名被数据库截断后发生碰撞；
    // 同一 SQL 即使跨分子/分母角色出现也只查询一次。
    const getOrCreateHelperLabel = (
      sqlExpression: string,
      role: 'num' | 'den',
    ) => {
      const existingLabel = helperLabelsBySql.get(sqlExpression);
      if (existingLabel) {
        return existingLabel;
      }
      const label = `__pivot_ratio_${role}_${ratioIndex}`;
      helperLabelsBySql.set(sqlExpression, label);
      helperMetrics.push(createHelperMetric(label, sqlExpression));
      return label;
    };
    const numeratorLabel = getOrCreateHelperLabel(numerator, 'num');
    const denominatorLabel = getOrCreateHelperLabel(denominator, 'den');
    ratioIndex += 1;
    metricRatioComponents[metricName] = {
      numeratorLabel,
      denominatorLabel,
    };
  });

  return { helperMetrics, metricRatioComponents };
}
