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
import type {
  LineSeriesOption,
  BarSeriesOption,
  XAXisComponentOption,
} from 'echarts';
import { isWeekGrain } from './formatters';

// 柱图负值标签可能把二维点包装为 { value, label }；只读取数值，不丢弃包装样式。
function pointValues(row: unknown): number[] | undefined {
  const values =
    row && typeof row === 'object' && 'value' in row ? row.value : row;
  return Array.isArray(values) ? values : undefined;
}

/**
 * 功能审计（可重写规格）：周刻度与实际时间分组对齐
 * - 功能目的与触发方式：标准/混合时序图生成 ECharts 配置后调用，避免连续时间轴在月初插入重复周标签。
 * - 输入契约：有效时间粒度、已有单时间轴和二维折线/柱图系列；日期为查询返回的毫秒时间戳，横向图日期在第二列。
 * - 输出契约：周轴只使用各系列实际日期的升序并集；同一日期共用一个刻度。日/月/年、非时间轴保持原配置。
 * - 处理流程：复用周粒度判定，收集实际日期；使用 ECharts 原生 category 和 encode 将附加的字符串日期映射到绘图轴。
 * - 业务规则：不按显示周名去重、不填补不存在的周、不改变时区或周号算法；查询值和原始前两列不变，tooltip/下钻继续读取原时间戳。
 * - 状态与副作用：只返回展示配置副本，不修改输入、SQL、筛选状态、缓存或图表存储；未显示标签仍保留数据点。
 * - 外部依赖：ECharts 分类轴/encode、既有日期 formatter；标签密度继续服从已有 interval，刻度与柱/折线中心对齐。
 * - 异常与边界：空系列、非二维/非数值时间、带标注或非折线柱图保持原配置，避免改变既有特殊坐标语义；各系列缺周仍按并集对齐。
 * - 不变量与约束：业务时间轴元数据不变，第三列仅用于绘制，旧的日期和指标索引保持不变；自定义 ECharts 配置仍可在随后覆盖。
 * - 验证方式：weeklyAxis.test.ts 用实际 ECharts 跨月渲染验证 13 周唯一刻度、柱线位置、缺周、缩放和原始值不变。
 */
export function alignWeeklyAxis(
  options: EChartsCoreOption,
  timeGrain?: string,
  isHorizontal = false,
): EChartsCoreOption {
  const axisKey = isHorizontal ? 'yAxis' : 'xAxis';
  const axis = options[axisKey] as XAXisComponentOption;
  const series = options.series as (LineSeriesOption | BarSeriesOption)[];
  const dateIndex = isHorizontal ? 1 : 0;
  if (
    !isWeekGrain(timeGrain) ||
    !axis ||
    axis.type !== 'time' ||
    !Array.isArray(series) ||
    !series.length ||
    series.some(
      entry =>
        !['line', 'bar'].includes(entry.type || '') ||
        entry.markArea ||
        entry.markLine ||
        entry.markPoint ||
        !Array.isArray(entry.data) ||
        entry.data.some(row => {
          const values = pointValues(row);
          return values?.length !== 2 || !Number.isFinite(values[dateIndex]);
        }),
    )
  ) {
    return options;
  }
  const dates = [
    ...new Set(
      series.flatMap(entry =>
        entry.data!.map(row => pointValues(row)![dateIndex]),
      ),
    ),
  ].sort((a, b) => a - b);
  if (!dates.length) return options;
  const formatter = (
    axis.axisLabel as
      | {
          formatter?: string | ((value: number, index: number) => string);
        }
      | undefined
  )?.formatter;
  return {
    ...options,
    [axisKey]: {
      ...axis,
      type: 'category',
      data: dates.map(String),
      boundaryGap: true,
      axisTick: { ...axis.axisTick, alignWithLabel: true },
      axisLabel: {
        ...axis.axisLabel,
        formatter:
          typeof formatter === 'function'
            ? (value: string, index: number) => formatter(Number(value), index)
            : formatter,
      },
    },
    series: series.map(entry => ({
      ...entry,
      // 保留原始两列供 tooltip/下钻使用，原生 encode 只让绘图读取第三列。
      data: entry.data!.map(row => {
        const values = pointValues(row)!;
        const value = [...values, String(values[dateIndex])];
        return Array.isArray(row) ? value : { ...(row as object), value };
      }),
      encode: {
        ...entry.encode,
        x: isHorizontal ? 0 : 2,
        y: isHorizontal ? 2 : 1,
      },
    })),
  };
}
