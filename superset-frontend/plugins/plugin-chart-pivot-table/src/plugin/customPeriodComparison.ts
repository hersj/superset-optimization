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
import {
  calculatePeriodDifference,
  CUSTOM_PERIOD_SUFFIX,
  getMetricLabel,
  type QueryFormMetric,
} from '@superset-ui/core';
import type {
  PivotRatioColumnConfig,
  PivotRatioComponentLabels,
} from './pivotRatioMetrics';

export const PERIOD_KEY = '期间对比';
export const PERIOD_COLUMNS = ['当前值', '对比值', '差额', '变化率'];

export function getPeriodOperation(
  rowAttrs: string[],
  rowKey: string[],
  colAttrs: string[],
  colKey: string[],
) {
  return (
    rowKey[rowAttrs.indexOf(PERIOD_KEY)] || colKey[colAttrs.indexOf(PERIOD_KEY)]
  );
}

const number = (value: unknown): number | null => {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean'
  )
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Only a complete outer SUM/COUNT can be rolled up from grouped result rows.
function isAdditiveSql(expression: string): boolean {
  const sql = expression.trim();
  const prefix = /^(SUM|COUNT)\s*\(/i.exec(sql);
  if (!prefix || /^\s*DISTINCT\b/i.test(sql.slice(prefix[0].length)))
    return false;
  let depth = 1;
  let quote = '';
  for (let index = prefix[0].length; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      if (char === '\\' || (char === quote && sql[index + 1] === quote))
        index += 1;
      else if (char === quote) quote = '';
    } else if (["'", '"', '`'].includes(char)) quote = char;
    else if (
      sql.slice(index, index + 2) === '--' ||
      sql.slice(index, index + 2) === '/*'
    )
      return false;
    else if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0)
        return (
          index === sql.length - 1 &&
          sql.slice(prefix[0].length, index).trim().length > 0
        );
    }
  }
  return false;
}

export function validateCustomPeriodMetrics(
  metrics: QueryFormMetric[],
  columnConfig: Record<
    string,
    PivotRatioColumnConfig & { pivotAggregateFunction?: string }
  >,
  savedMetrics: Array<{
    metric_name?: string;
    metricName?: string;
    expression?: string | null;
    sqlExpression?: string | null;
  }>,
  aggregateFunction: string,
) {
  metrics.forEach(metric => {
    const name = getMetricLabel(metric);
    const config = columnConfig[name];
    if (config?.pivotRatioNumerator && config?.pivotRatioDenominator) {
      if (
        !isAdditiveSql(config.pivotRatioNumerator) ||
        !isAdditiveSql(config.pivotRatioDenominator)
      ) {
        throw new Error(
          `自定义期间对比：${name} 的分子分母不可加，请使用 SUM/COUNT 聚合。`,
        );
      }
      return;
    }
    if ((config?.pivotAggregateFunction || aggregateFunction) !== 'Sum') {
      throw new Error(
        `自定义期间对比：${name} 目前仅支持 Sum 或分子分母配置。`,
      );
    }
    if (typeof metric !== 'string' && metric.expressionType === 'SIMPLE') {
      if (['SUM', 'COUNT'].includes(metric.aggregate || '')) return;
      throw new Error(`自定义期间对比：${name} 是不可加指标。`);
    }
    const definition =
      typeof metric === 'string'
        ? savedMetrics.find(
            item => (item.metric_name || item.metricName) === metric,
          )
        : metric;
    const expression =
      definition?.sqlExpression ||
      (definition as { expression?: string | null } | undefined)?.expression;
    if (!expression)
      throw new Error(
        `自定义期间对比：缺少 ${name} 的指标定义，无法核对合计。`,
      );
    if (!isAdditiveSql(expression))
      throw new Error(
        `自定义期间对比：${name} 是不可加指标，请配置分子分母或使用 SUM/COUNT。`,
      );
  });
}

export function unpivotCustomPeriodData(
  data: Record<string, unknown>[],
  metricNames: string[],
  ratios: Record<string, PivotRatioComponentLabels>,
  metricKey: string,
  currencyCodeColumn?: string,
) {
  return data.flatMap(record =>
    metricNames.flatMap(name =>
      PERIOD_COLUMNS.map(operation => ({
        ...record,
        [metricKey]: name,
        [PERIOD_KEY]: operation,
        value: record[name],
        __periodCurrent: record[name],
        __periodComparison: record[`${name}__${CUSTOM_PERIOD_SUFFIX}`],
        __periodCurrentNum: ratios[name]
          ? record[ratios[name].numeratorLabel]
          : undefined,
        __periodCurrentDen: ratios[name]
          ? record[ratios[name].denominatorLabel]
          : undefined,
        __periodComparisonNum: ratios[name]
          ? record[`${ratios[name].numeratorLabel}__${CUSTOM_PERIOD_SUFFIX}`]
          : undefined,
        __periodComparisonDen: ratios[name]
          ? record[`${ratios[name].denominatorLabel}__${CUSTOM_PERIOD_SUFFIX}`]
          : undefined,
        __currencyColumn: currencyCodeColumn,
      })),
    ),
  );
}

export function createCustomPeriodAggregator(
  formatter: (
    value: number,
    aggregator?: { getCurrencies: () => string[] },
  ) => string,
  ratio = false,
  absoluteNumerator = false,
  percentageMetric = false,
) {
  return (_pivotData: unknown, rowKey: string[], colKey: string[]) => {
    const pivotProps = (
      _pivotData as { props?: { rows?: string[]; cols?: string[] } } | null
    )?.props;
    const operation = pivotProps
      ? getPeriodOperation(
          pivotProps.rows || [],
          rowKey,
          pivotProps.cols || [],
          colKey,
        )
      : [...rowKey, ...colKey].find(key => PERIOD_COLUMNS.includes(key));
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    const currencies = new Set<string>();
    const fields = ratio
      ? [
          '__periodCurrentNum',
          '__periodCurrentDen',
          '__periodComparisonNum',
          '__periodComparisonDen',
        ]
      : ['__periodCurrent', '__periodComparison'];
    const sum = (field: string) => (counts[field] ? sums[field] : null);
    const periodValue = (side: 'Current' | 'Comparison') => {
      if (!ratio) return sum(`__period${side}`);
      const numerator = sum(`__period${side}Num`);
      const denominator = sum(`__period${side}Den`);
      return numerator === null || denominator === null || denominator === 0
        ? null
        : (absoluteNumerator ? Math.abs(numerator) : numerator) / denominator;
    };
    return {
      push(record: Record<string, unknown>) {
        if (!operation) return;
        fields.forEach(field => {
          const parsed = number(record[field]);
          if (parsed !== null) {
            sums[field] = (sums[field] || 0) + parsed;
            counts[field] = (counts[field] || 0) + 1;
          }
        });
        const code = record[String(record.__currencyColumn)];
        if (typeof code === 'string') currencies.add(code);
      },
      value() {
        if (!operation) return null;
        const current = periodValue('Current');
        const comparison = periodValue('Comparison');
        if (operation === '当前值') return current;
        if (operation === '对比值') return comparison;
        const difference = calculatePeriodDifference(current, comparison);
        return operation === '差额'
          ? difference.valueDifference
          : difference.percentDifferenceNum;
      },
      format(value: number | null) {
        if (value === null) return '—';
        if (operation === '变化率')
          return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
        if (operation === '差额' && percentageMetric)
          return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)} 个百分点`;
        return `${operation === '差额' && value > 0 ? '+' : ''}${formatter(value, { getCurrencies: () => Array.from(currencies) })}`;
      },
      getCurrencies: () => Array.from(currencies),
      numInputs: 0,
    };
  };
}
