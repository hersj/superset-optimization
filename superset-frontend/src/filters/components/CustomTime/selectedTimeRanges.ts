/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 * See the License for the specific language governing permissions
 * and limitations under the License.
 */

export type SelectionMode = 'continuous' | 'points';
type Bounds = [string, string];

function bounds(value: string): Bounds {
  const parts = value.split(':').map(part => part.trim());
  if (
    parts.length !== 2 ||
    parts.some(
      part =>
        !/^\d{4}-\d{2}-\d{2}$/.test(part) ||
        Number.isNaN(Date.parse(part)) ||
        new Date(part).toISOString().slice(0, 10) !== part,
    ) ||
    parts[0] >= parts[1]
  ) {
    throw new Error('点选区间必须是有效的左闭右开日期范围');
  }
  return parts as Bounds;
}

/**
 * 功能审计（可重写规格）：点选区间规范化与逐项取消。
 * - 目的与触发：时间日历点击、状态恢复和级联解析时规范化选中日期并集。
 * - 输入：最多10000项YYYY-MM-DD : YYYY-MM-DD字符串；左闭右开、不转换时区。
 * - 输出：排序去重并合并重叠区间的数组；相邻区间不合并，空数组表示未选择，绝非全历史。
 * - 流程与规则：严格检查每项后排序；toggle遇到已覆盖单位则减去该单位，否则增加该单位。
 * - 副作用与依赖：纯计算，不修改输入、网络、Redux或缓存；使用原生Date仅验证ISO日期。
 * - 异常与边界：非法项整体失败，不静默丢弃；包络仅用于查询边界，不能替代并集过滤。
 * - 不变量：取消选中单位不影响其他日期；模式切换补齐空档前必须由UI确认。
 * - 验证：selectedTimeRanges.test.ts覆盖跨年乱序、间隔、重复、取消中间单位、空及非法日期。
 */
export function normalizeSelectedRanges(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 10000 ||
    value.some(item => typeof item !== 'string')
  ) {
    throw new Error('点选区间必须是日期范围数组');
  }
  const sorted = (value as string[])
    .map(bounds)
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const result: Bounds[] = [];
  for (const [start, end] of sorted) {
    const last = result[result.length - 1];
    if (last && start < last[1]) {
      last[1] = end > last[1] ? end : last[1];
    } else {
      result.push([start, end]);
    }
  }
  return result.map(([start, end]) => `${start} : ${end}`);
}

/** 包络保留查询起止元数据；调用方必须同时附带原始点选过滤条件。 */
export function selectedRangeEnvelope(value: string[]): string {
  const ranges = normalizeSelectedRanges(value);
  return ranges.length
    ? `${bounds(ranges[0])[0]} : ${bounds(ranges[ranges.length - 1])[1]}`
    : '';
}

/** 模式切换前检测补齐包络是否会新增日期。 */
export function selectedRangesHaveGaps(value: string[]): boolean {
  const ranges = normalizeSelectedRanges(value).map(bounds);
  return ranges.some(
    ([start], index) => index > 0 && start > ranges[index - 1][1],
  );
}

/** 点击完整选中的单位执行集合差，否则执行集合并；复用既有日历给出的单位边界。 */
export function toggleSelectedRange(value: string[], unit: string): string[] {
  const ranges = normalizeSelectedRanges(value).map(bounds);
  const [start, end] = bounds(unit);
  let coveredUntil = start;
  for (const [left, right] of ranges) {
    if (left <= coveredUntil && right > coveredUntil) coveredUntil = right;
  }
  if (coveredUntil < end) return normalizeSelectedRanges([...value, unit]);
  const remainder: string[] = [];
  for (const [left, right] of ranges) {
    if (right <= start || left >= end) remainder.push(`${left} : ${right}`);
    else {
      if (left < start) remainder.push(`${left} : ${start}`);
      if (right > end) remainder.push(`${end} : ${right}`);
    }
  }
  return normalizeSelectedRanges(remainder);
}
