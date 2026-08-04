/* eslint-disable no-underscore-dangle */
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
  AxisType,
  ChartDataResponseResult,
  DataRecord,
  DataRecordValue,
  DTTM_ALIAS,
  ensureIsArray,
  LegendState,
  normalizeTimestamp,
  NumberFormats,
  NumberFormatter,
  TimeFormatter,
  ValueFormatter,
} from '@superset-ui/core';
import { SupersetTheme } from '@apache-superset/core/theme';
import { GenericDataType } from '@apache-superset/core/common';
import { LegendPaddingType, SortSeriesType } from '@superset-ui/chart-controls';
import { format } from 'echarts/core';
import type { LegendComponentOption } from 'echarts/components';
import type { SeriesOption } from 'echarts';
import { isEmpty, maxBy, meanBy, minBy, orderBy, sumBy } from 'lodash';
import {
  NULL_STRING,
  StackControlsValue,
  TIMESERIES_CONSTANTS,
} from '../constants';
import {
  EchartsTimeseriesSeriesType,
  LegendOrientation,
  LegendType,
  StackType,
} from '../types';
import { defaultLegendPadding } from '../defaults';

function isDefined<T>(value: T | undefined | null): boolean {
  return value !== undefined && value !== null;
}

export type LegendGroupKind = 'current' | 'comparison';

export interface LegendGroupMetadata {
  groups: Record<string, string[]>;
  labels: Record<string, string>;
  kinds: Record<string, LegendGroupKind>;
  parents: Record<string, string>;
  stateKeys: Record<string, string>;
}

export interface LegendGroupInput {
  name: string;
  currentLabel: string;
  timeOffset?: string;
}

/**
 * 功能审计（可重写规格）：时序图真实系列图例元数据
 * - 功能目的与触发方式：标准时序图和混合时序图在转换查询结果后调用，把真实 ECharts 系列合并为当前指标组和时间偏移组。
 * - 输入契约：每项提供唯一的真实系列 name、去除维度后的当前指标显示名，以及可选的 timeOffset；空偏移表示当前期。
 * - 输出契约：groups 的键和成员全部是真实系列 name；labels 为代表系列到显示文本的映射；kinds 区分当前组和对比组；parents 将对比系列映射到同一指标的当前代表系列；stateKeys 提供稳定的 current:<指标> 或 comparison:<offset> 状态键。
 * - 处理流程：先按当前指标或偏移建立桶并保留首次真实系列为代表值，再将当前组排在对比组之前，最后建立对比到当前的归属关系和稳定状态键。
 * - 业务规则：同一当前指标的多个维度只产生一个当前图例；同一 timeOffset 的所有指标和维度只产生一个对比图例；代表值永远不能是虚拟偏移名称。
 * - 状态与副作用：纯函数，只生成内存元数据，不修改查询结果、图表配置、看板数据库或浏览器存储。
 * - 外部依赖：仅依赖调用方提供的已转换真实系列名；调用方负责使用 resolveLegendState 和 ECharts action 应用状态。
 * - 异常与边界：空输入返回五个空对象；缺失父当前组的对比系列仍保留在偏移组，只不建立 parents 映射。
 * - 不变量与约束：每个真实系列最多属于一个组；组内成员顺序稳定；调用结果可重复且无副作用。
 * - 验证方式：series.test.ts 覆盖维度合并、真实代表值、偏移合并和父组映射。
 */
export function buildLegendGroupMetadata(
  inputs: LegendGroupInput[],
): LegendGroupMetadata {
  type Group = {
    kind: LegendGroupKind;
    label: string;
    members: string[];
  };

  const groups = new Map<string, Group>();
  const currentRepresentativeByLabel = new Map<string, string>();
  const currentLabelByMember = new Map<string, string>();

  inputs.forEach(({ name, currentLabel, timeOffset }) => {
    const member = String(name);
    const label = String(currentLabel ?? '');
    const kind: LegendGroupKind = timeOffset ? 'comparison' : 'current';
    const groupLabel = kind === 'comparison' ? String(timeOffset) : label;
    const key = `${kind}\u0000${groupLabel}`;
    const group = groups.get(key) ?? { kind, label: groupLabel, members: [] };

    if (!group.members.includes(member)) group.members.push(member);
    groups.set(key, group);
    currentLabelByMember.set(member, label);
    if (kind === 'current' && !currentRepresentativeByLabel.has(label)) {
      currentRepresentativeByLabel.set(label, member);
    }
  });

  const orderedGroups = [...groups.values()].sort(
    (left, right) =>
      Number(left.kind === 'comparison') - Number(right.kind === 'comparison'),
  );
  const metadata: LegendGroupMetadata = {
    groups: {},
    labels: {},
    kinds: {},
    parents: {},
    stateKeys: {},
  };

  orderedGroups.forEach(group => {
    const [representative] = group.members;
    if (!representative) return;
    metadata.groups[representative] = group.members;
    metadata.stateKeys[representative] = `${group.kind}:${group.label}`;
    metadata.labels[representative] = group.label;
    metadata.kinds[representative] = group.kind;
    if (group.kind === 'comparison') {
      group.members.forEach(member => {
        const parent = currentRepresentativeByLabel.get(
          currentLabelByMember.get(member) ?? '',
        );
        if (parent) metadata.parents[member] = parent;
      });
    }
  });

  return metadata;
}

/**
 * 功能审计（可重写规格）：时序图逻辑图例状态解析
 * - 功能目的与触发方式：标准时序图和混合时序图在生成选项、处理图例事件或刷新查询后调用，统一解析当前指标与时间对比图例的可见状态。
 * - 输入契约：selected 为稳定逻辑键、ECharts 真实代表系列、显示标签或旧维度成员到布尔值的映射，可为空；metadata 提供这些键的优先级所需的代表系列、成员系列、图例标签、分组类型和对比成员所属的当前指标。
 * - 输出契约：返回保留未知图例状态的完整映射，并为每个真实系列写入最终可见状态；当前组默认打开，对比组默认关闭，稳定逻辑键保留其独立开关。
 * - 处理流程：按稳定逻辑键、真实代表系列、显示标签、旧成员状态、默认值的顺序恢复逻辑状态，再按当前组状态约束对比成员，最后展开到所有真实系列成员。
 * - 业务规则：稳定逻辑键优先于代表系列、显示标签和旧维度成员；对比成员只有在自身 offset 组和所属当前指标均打开时可见；没有父当前组的对比成员只受 offset 组控制。
 * - 状态与副作用：纯函数，不修改输入对象，不写入数据库、缓存或浏览器存储。
 * - 异常与边界：缺失组类型按当前组处理；缺失父组的对比成员只受自身组状态控制。
 * - 不变量与约束：逻辑组代表值必须是真实系列名；同一成员只允许由一个逻辑组决定状态；调用必须是幂等的。
 * - 验证方式：series.test.ts 覆盖父组关闭、默认值、旧成员状态和真实成员展开。
 */
export function resolveLegendState(
  selected: LegendState | undefined,
  metadata: LegendGroupMetadata,
): LegendState {
  const input = selected ?? {};
  const state: LegendState = { ...input };
  const groupSelected: Record<string, boolean> = {};

  Object.entries(metadata.groups).forEach(([representative, members]) => {
    const kind = metadata.kinds[representative] ?? 'current';
    const label = metadata.labels[representative];
    const stateKey =
      metadata.stateKeys[representative] ?? `${kind}:${label ?? ''}`;
    const selectedByStateKey = input[stateKey];
    const selectedByRepresentative = input[representative];
    const selectedByLabel = label !== undefined ? input[label] : undefined;
    const memberValues = members
      .map(member => input[member])
      .filter((value): value is boolean => value !== undefined);
    const legacyMemberState =
      memberValues.length === 0
        ? undefined
        : kind === 'current'
          ? memberValues.every(Boolean)
          : memberValues.some(Boolean);
    const isSelected =
      selectedByStateKey ??
      selectedByRepresentative ??
      selectedByLabel ??
      legacyMemberState ??
      kind !== 'comparison';

    groupSelected[representative] = isSelected;
    state[stateKey] = isSelected;
    state[representative] = isSelected;
  });

  Object.entries(metadata.groups).forEach(([representative, members]) => {
    const kind = metadata.kinds[representative] ?? 'current';
    members.forEach(member => {
      const parent = metadata.parents[member];
      state[member] =
        groupSelected[representative] &&
        (kind !== 'comparison' || !parent || groupSelected[parent] !== false);
    });
  });

  return state;
}

/**
 * 中文职责：把一次 ECharts 图例事件压缩成只影响被操作逻辑组的增量状态；全选和反选不提供 changedName，因此更新全部逻辑组。
 */
export function getLegendStateChange(
  selected: LegendState | undefined,
  metadata: LegendGroupMetadata,
  changedName?: string,
): LegendState {
  const input = selected ?? {};
  if (Object.keys(metadata.groups).length === 0) {
    return { ...input };
  }

  const changedRepresentative = changedName
    ? Object.entries(metadata.groups).find(
        ([representative, members]) =>
          representative === changedName ||
          members.includes(changedName) ||
          metadata.labels[representative] === changedName ||
          metadata.stateKeys[representative] === changedName,
      )?.[0]
    : undefined;
  const representatives = changedRepresentative
    ? [changedRepresentative]
    : changedName
      ? []
      : Object.keys(metadata.groups);
  const selectedForResolution = { ...input };
  if (changedRepresentative) {
    const stateKey = metadata.stateKeys[changedRepresentative];
    if (stateKey) delete selectedForResolution[stateKey];
  } else if (!changedName) {
    Object.values(metadata.stateKeys).forEach(stateKey => {
      delete selectedForResolution[stateKey];
    });
  }
  const resolved = resolveLegendState(selectedForResolution, metadata);
  const result: LegendState = {};

  representatives.forEach(representative => {
    const stateKey = metadata.stateKeys[representative];
    const groupSelected = stateKey
      ? (resolved[stateKey] ?? resolved[representative] ?? false)
      : (resolved[representative] ?? false);
    if (stateKey) result[stateKey] = groupSelected;
    result[representative] = resolved[representative] ?? groupSelected;
    metadata.groups[representative].forEach(member => {
      result[member] = resolved[member] ?? groupSelected;
    });
  });

  if (changedName && !changedRepresentative) {
    const value = input[changedName];
    if (value !== undefined) result[changedName] = value;
    return result;
  }

  if (!changedName) {
    const knownKeys = new Set(
      Object.entries(metadata.groups).flatMap(([representative, members]) => [
        representative,
        metadata.labels[representative],
        metadata.stateKeys[representative],
        ...members,
      ]),
    );
    Object.entries(input).forEach(([key, value]) => {
      if (!knownKeys.has(key)) result[key] = value;
    });
  }

  return result;
}

export function extractDataTotalValues(
  data: DataRecord[],
  opts: {
    stack: StackType;
    percentageThreshold: number;
    xAxisCol: string;
    legendState?: LegendState;
  },
): {
  totalStackedValues: number[];
  thresholdValues: number[];
} {
  const totalStackedValues: number[] = [];
  const thresholdValues: number[] = [];
  const { stack, percentageThreshold, xAxisCol, legendState } = opts;
  if (stack) {
    data.forEach(datum => {
      const values = Object.keys(datum).reduce((prev, curr) => {
        if (curr === xAxisCol) {
          return prev;
        }
        if (legendState && !legendState[curr]) {
          return prev;
        }
        const value = datum[curr] || 0;
        return prev + (value as number);
      }, 0);
      totalStackedValues.push(values);
      thresholdValues.push(((percentageThreshold || 0) / 100) * values);
    });
  }
  return {
    totalStackedValues,
    thresholdValues,
  };
}

export function extractShowValueIndexes(
  series: SeriesOption[],
  opts: {
    stack: StackType;
    onlyTotal?: boolean;
    isHorizontal?: boolean;
    legendState?: LegendState;
  },
): number[] {
  const showValueIndexes: number[] = [];
  const { legendState, stack, isHorizontal, onlyTotal } = opts;
  if (stack) {
    series.forEach((entry, seriesIndex) => {
      const { data = [] } = entry;
      (data as [any, number][]).forEach((datum, dataIndex) => {
        if (entry.id && legendState && !legendState[entry.id]) {
          return;
        }
        if (!onlyTotal && datum[isHorizontal ? 0 : 1] !== null) {
          showValueIndexes[dataIndex] = seriesIndex;
        }
        if (onlyTotal) {
          if (datum[isHorizontal ? 0 : 1] > 0) {
            showValueIndexes[dataIndex] = seriesIndex;
          }
          if (
            !showValueIndexes[dataIndex] &&
            datum[isHorizontal ? 0 : 1] !== null
          ) {
            showValueIndexes[dataIndex] = seriesIndex;
          }
        }
      });
    });
  }
  return showValueIndexes;
}

export function sortAndFilterSeries(
  rows: DataRecord[],
  xAxis: string,
  extraMetricLabels: any[],
  sortSeriesType?: SortSeriesType,
  sortSeriesAscending?: boolean,
): string[] {
  const seriesNames = Object.keys(rows[0])
    .filter(key => key !== xAxis)
    .filter(key => !extraMetricLabels.includes(key));

  let aggregator: (name: string) => { name: string; value: any };

  switch (sortSeriesType) {
    case SortSeriesType.Sum:
      aggregator = name => ({ name, value: sumBy(rows, name) });
      break;
    case SortSeriesType.Min:
      aggregator = name => ({ name, value: minBy(rows, name)?.[name] });
      break;
    case SortSeriesType.Max:
      aggregator = name => ({ name, value: maxBy(rows, name)?.[name] });
      break;
    case SortSeriesType.Avg:
      aggregator = name => ({ name, value: meanBy(rows, name) });
      break;
    default: {
      const collator = new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return seriesNames.sort((a, b) =>
        sortSeriesAscending ? collator.compare(a, b) : collator.compare(b, a),
      );
    }
  }

  const sortedValues = seriesNames.map(aggregator);

  return orderBy(
    sortedValues,
    ['value', 'name'],
    [sortSeriesAscending ? 'asc' : 'desc', 'asc'],
  ).map(({ name }) => name);
}

export function sortRows(
  rows: DataRecord[],
  totalStackedValues: number[],
  xAxis: string,
  xAxisSortSeries: SortSeriesType,
  xAxisSortSeriesAscending: boolean,
) {
  const sortedRows = rows.map((row, idx) => {
    let sortKey: DataRecordValue = '';
    let aggregate: number | undefined;
    let entries = 0;
    Object.entries(row).forEach(([key, value]) => {
      const isValueDefined = isDefined(value);
      if (key === xAxis) {
        sortKey = value;
      }
      if (
        xAxisSortSeries === SortSeriesType.Name ||
        typeof value !== 'number'
      ) {
        return;
      }

      if (!(xAxisSortSeries === SortSeriesType.Avg && !isValueDefined)) {
        entries += 1;
      }

      switch (xAxisSortSeries) {
        case SortSeriesType.Avg:
        case SortSeriesType.Sum:
          if (aggregate === undefined) {
            aggregate = value;
          } else {
            aggregate += value;
          }
          break;
        case SortSeriesType.Min:
          aggregate =
            aggregate === undefined || (isValueDefined && value < aggregate)
              ? value
              : aggregate;
          break;
        case SortSeriesType.Max:
          aggregate =
            aggregate === undefined || (isValueDefined && value > aggregate)
              ? value
              : aggregate;
          break;
        default:
          break;
      }
    });
    if (
      xAxisSortSeries === SortSeriesType.Avg &&
      entries > 0 &&
      aggregate !== undefined
    ) {
      aggregate /= entries;
    }

    const value =
      xAxisSortSeries === SortSeriesType.Name
        ? typeof sortKey === 'string'
          ? sortKey.toLowerCase()
          : sortKey
        : aggregate;

    return {
      key: sortKey,
      value,
      row,
      totalStackedValue: totalStackedValues[idx],
    };
  });

  return orderBy(
    sortedRows,
    ['value'],
    [xAxisSortSeriesAscending ? 'asc' : 'desc'],
  ).map(({ row, totalStackedValue }) => ({ row, totalStackedValue }));
}

export function extractSeries(
  data: DataRecord[],
  opts: {
    fillNeighborValue?: number;
    xAxis?: string;
    extraMetricLabels?: string[];
    removeNulls?: boolean;
    stack?: StackType;
    totalStackedValues?: number[];
    isHorizontal?: boolean;
    sortSeriesType?: SortSeriesType;
    sortSeriesAscending?: boolean;
    xAxisSortSeries?: SortSeriesType;
    xAxisSortSeriesAscending?: boolean;
    xAxisType?: AxisType;
  } = {},
): [SeriesOption[], number[], number | undefined] {
  const {
    fillNeighborValue,
    xAxis = DTTM_ALIAS,
    extraMetricLabels = [],
    removeNulls = false,
    stack = false,
    totalStackedValues = [],
    isHorizontal = false,
    sortSeriesType,
    sortSeriesAscending,
    xAxisSortSeries,
    xAxisSortSeriesAscending,
    xAxisType,
  } = opts;
  if (data.length === 0) return [[], [], undefined];
  const rows: DataRecord[] = data.map(datum => ({
    ...datum,
    [xAxis]:
      datum[xAxis] === null && xAxisType === AxisType.Category
        ? NULL_STRING
        : datum[xAxis],
  }));
  const sortedSeries = sortAndFilterSeries(
    rows,
    xAxis,
    extraMetricLabels,
    sortSeriesType,
    sortSeriesAscending,
  );
  const sortedRows =
    isDefined(xAxisSortSeries) && isDefined(xAxisSortSeriesAscending)
      ? sortRows(
          rows,
          totalStackedValues,
          xAxis,
          xAxisSortSeries!,
          xAxisSortSeriesAscending!,
        )
      : rows.map((row, idx) => ({
          row,
          totalStackedValue: totalStackedValues[idx],
        }));

  let minPositiveValue: number | undefined;
  const finalSeries = sortedSeries.map(name => ({
    id: name,
    name,
    data: sortedRows
      .map(({ row, totalStackedValue }, idx) => {
        const currentValue = row[name];
        if (
          typeof currentValue === 'number' &&
          currentValue > 0 &&
          (minPositiveValue === undefined || minPositiveValue > currentValue)
        ) {
          minPositiveValue = currentValue;
        }
        const isNextToDefinedValue =
          isDefined(rows[idx - 1]?.[name]) || isDefined(rows[idx + 1]?.[name]);
        const isFillNeighborValue =
          !isDefined(currentValue) &&
          isNextToDefinedValue &&
          fillNeighborValue !== undefined;
        let value: DataRecordValue | undefined = currentValue;
        if (isFillNeighborValue) {
          value = fillNeighborValue;
        } else if (
          stack === StackControlsValue.Expand &&
          totalStackedValue !== undefined
        ) {
          value = ((value || 0) as number) / totalStackedValue;
        }
        return [row[xAxis], value];
      })
      .filter(obs => !removeNulls || (obs[0] !== null && obs[1] !== null))
      .map(obs => (isHorizontal ? [obs[1], obs[0]] : obs)),
  }));
  return [
    finalSeries,
    sortedRows.map(({ totalStackedValue }) => totalStackedValue),
    minPositiveValue,
  ];
}

export function formatSeriesName(
  name: DataRecordValue | undefined,
  {
    numberFormatter,
    timeFormatter,
    coltype,
  }: {
    numberFormatter?: ValueFormatter;
    timeFormatter?: TimeFormatter;
    coltype?: GenericDataType;
  } = {},
): string {
  if (name === undefined || name === null) {
    return NULL_STRING;
  }
  if (typeof name === 'boolean' || typeof name === 'bigint') {
    return name.toString();
  }
  if (name instanceof Date || coltype === GenericDataType.Temporal) {
    const normalizedName =
      typeof name === 'string' ? normalizeTimestamp(name) : name;
    const d =
      normalizedName instanceof Date
        ? normalizedName
        : new Date(normalizedName);

    return timeFormatter ? timeFormatter(d) : d.toISOString();
  }
  if (typeof name === 'number') {
    return numberFormatter ? numberFormatter(name) : name.toString();
  }
  return name;
}

export const getColtypesMapping = ({
  coltypes = [],
  colnames = [],
}: Pick<ChartDataResponseResult, 'coltypes' | 'colnames'>): Record<
  string,
  GenericDataType
> =>
  colnames.reduce(
    (accumulator, item, index) => ({ ...accumulator, [item]: coltypes[index] }),
    {},
  );

export function extractGroupbyLabel({
  datum = {},
  groupby,
  numberFormatter,
  timeFormatter,
  coltypeMapping = {},
}: {
  datum?: DataRecord;
  groupby?: string[] | null;
  numberFormatter?: NumberFormatter;
  timeFormatter?: TimeFormatter;
  coltypeMapping?: Record<string, GenericDataType>;
}): string {
  return ensureIsArray(groupby)
    .map(val =>
      formatSeriesName(datum[val], {
        numberFormatter,
        timeFormatter,
        ...(coltypeMapping[val] && { coltype: coltypeMapping[val] }),
      }),
    )
    .join(', ');
}

export function getLegendProps(
  type: LegendType,
  orientation: LegendOrientation,
  show: boolean,
  theme: SupersetTheme,
  zoomable = false,
  legendState?: LegendState,
  padding?: LegendPaddingType,
): LegendComponentOption {
  const isHorizontal =
    orientation === LegendOrientation.Top ||
    orientation === LegendOrientation.Bottom;

  const effectiveType =
    type === LegendType.Scroll || !isHorizontal ? type : LegendType.Scroll;
  const legend: LegendComponentOption = {
    orient: [LegendOrientation.Top, LegendOrientation.Bottom].includes(
      orientation,
    )
      ? 'horizontal'
      : 'vertical',
    show,
    type: effectiveType,
    selected: legendState ?? {},
    selector: ['all', 'inverse'],
    selectorLabel: {
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSizeSM,
      color: theme.colorText,
      borderColor: theme.colorBorder,
    },
  };
  const MIN_LEGEND_WIDTH = 0;
  const MARGIN_GUTTER = 45;
  const getLegendWidth = (paddingWidth: number) =>
    Math.max(paddingWidth - MARGIN_GUTTER, MIN_LEGEND_WIDTH);

  switch (orientation) {
    case LegendOrientation.Left:
      legend.left = 0;
      if (padding?.left) {
        legend.textStyle = {
          overflow: 'truncate',
          width: getLegendWidth(padding.left),
        };
      }
      break;
    case LegendOrientation.Right:
      legend.right = 0;
      legend.top = zoomable ? TIMESERIES_CONSTANTS.legendRightTopOffset : 0;
      if (padding?.right) {
        legend.textStyle = {
          overflow: 'truncate',
          width: getLegendWidth(padding.right),
        };
      }
      break;
    case LegendOrientation.Bottom:
      legend.bottom = 0;
      if (padding?.left) {
        legend.left = padding.left;
      }
      break;
    case LegendOrientation.Top:
      legend.top = 0;
      legend.right = zoomable ? TIMESERIES_CONSTANTS.legendTopRightOffset : 0;
      break;
    default:
      legend.top = 0;
      legend.right = zoomable ? TIMESERIES_CONSTANTS.legendTopRightOffset : 0;
      break;
  }
  return legend;
}

export function getChartPadding(
  show: boolean,
  orientation: LegendOrientation,
  margin?: string | number | null,
  padding?: LegendPaddingType,
  isHorizontal?: boolean,
): {
  bottom: number;
  left: number;
  right: number;
  top: number;
} {
  let legendMargin;
  if (!show) {
    legendMargin = 0;
  } else if (
    margin === null ||
    margin === undefined ||
    typeof margin === 'string'
  ) {
    legendMargin = defaultLegendPadding[orientation];
  } else {
    legendMargin = margin;
  }

  const { bottom = 0, left = 0, right = 0, top = 0 } = padding || {};

  if (isHorizontal) {
    return {
      left:
        left + (orientation === LegendOrientation.Bottom ? legendMargin : 0),
      right:
        right + (orientation === LegendOrientation.Right ? legendMargin : 0),
      top: top + (orientation === LegendOrientation.Top ? legendMargin : 0),
      bottom:
        bottom + (orientation === LegendOrientation.Left ? legendMargin : 0),
    };
  }

  return {
    left: left + (orientation === LegendOrientation.Left ? legendMargin : 0),
    right: right + (orientation === LegendOrientation.Right ? legendMargin : 0),
    top: top + (orientation === LegendOrientation.Top ? legendMargin : 0),
    bottom:
      bottom + (orientation === LegendOrientation.Bottom ? legendMargin : 0),
  };
}

export function dedupSeries(series: SeriesOption[]): SeriesOption[] {
  const counter = new Map<string, number>();
  return series.map(row => {
    let { id } = row;
    if (id === undefined) return row;
    id = String(id);
    const count = counter.get(id) || 0;
    const suffix = count > 0 ? ` (${count})` : '';
    counter.set(id, count + 1);
    return {
      ...row,
      id: `${id}${suffix}`,
    };
  });
}

export function sanitizeHtml(text: string): string {
  return format.encodeHTML(text);
}

export function getAxisType(
  stack: StackType,
  forceCategorical?: boolean,
  dataType?: GenericDataType,
): AxisType {
  if (forceCategorical) {
    return AxisType.Category;
  }
  if (dataType === GenericDataType.Temporal) {
    return AxisType.Time;
  }
  if (dataType === GenericDataType.Numeric && !stack) {
    return AxisType.Value;
  }
  return AxisType.Category;
}

export function getOverMaxHiddenFormatter(
  config: {
    max?: number;
    formatter?: ValueFormatter;
  } = {},
) {
  const { max, formatter } = config;
  // Only apply this logic if there's a MAX set in the controls
  const shouldHideIfOverMax = !!max || max === 0;

  return new NumberFormatter({
    formatFunc: value =>
      `${
        shouldHideIfOverMax && value > max
          ? ''
          : formatter?.format(value) || value
      }`,
    id: NumberFormats.OVER_MAX_HIDDEN,
  });
}

export function calculateLowerLogTick(minPositiveValue: number) {
  const logBase10 = Math.floor(Math.log10(minPositiveValue));
  return Math.pow(10, logBase10);
}

type BoundsType = {
  min?: number | 'dataMin';
  max?: number | 'dataMax';
  scale?: true;
};

export function getMinAndMaxFromBounds(
  axisType: AxisType,
  truncateAxis: boolean,
  min?: number,
  max?: number,
  seriesType?: EchartsTimeseriesSeriesType,
): BoundsType | {} {
  if (axisType === AxisType.Value && truncateAxis) {
    const ret: BoundsType = {};
    if (seriesType === EchartsTimeseriesSeriesType.Bar) {
      ret.scale = true;
    }
    if (min !== undefined) {
      ret.min = min;
    } else if (seriesType !== EchartsTimeseriesSeriesType.Bar) {
      ret.min = 'dataMin';
    }
    if (max !== undefined) {
      ret.max = max;
    } else if (seriesType !== EchartsTimeseriesSeriesType.Bar) {
      ret.max = 'dataMax';
    }
    return ret;
  }
  return {};
}

/**
 * Returns the stackId used in stacked series.
 * It will return the defaultId if the chart is not using time comparison.
 * If time comparison is used, it will return the time comparison value as the stackId
 * if the name includes the time comparison value.
 *
 * @param {string} defaultId The default stackId.
 * @param {string[]} timeCompare The time comparison values.
 * @param {string | number} name The name of the serie.
 *
 * @returns {string} The stackId.
 */
export function getTimeCompareStackId(
  defaultId: string,
  timeCompare: string[],
  name?: string | number,
): string {
  if (isEmpty(timeCompare)) {
    return defaultId;
  }
  // Each timeCompare is its own stack so it doesn't stack on top of original ones
  return (
    timeCompare.find(value => {
      if (typeof name === 'string') {
        // offset is represented as <offset>, group by list
        return (
          name.includes(`${value},`) ||
          // offset is represented as <metric>__<offset>
          name.includes(`__${value}`)
        );
      }
      return name?.toString().includes(value);
    }) || defaultId
  );
}

const TOOLTIP_SERIES_KEY = 'seriesId';
export function extractTooltipKeys(
  forecastValue: any[],
  yIndex: number,
  richTooltip?: boolean,
  tooltipSortByMetric?: boolean,
): string[] {
  if (richTooltip && tooltipSortByMetric) {
    return forecastValue
      .slice()
      .sort((a, b) => b.data[yIndex] - a.data[yIndex])
      .map(value => value[TOOLTIP_SERIES_KEY]);
  }
  if (richTooltip) {
    return forecastValue.map(s => s[TOOLTIP_SERIES_KEY]);
  }
  return [forecastValue[0][TOOLTIP_SERIES_KEY]];
}

export function groupData(data: DataRecord[], by?: string | null) {
  const seriesMap: Map<DataRecordValue | undefined, DataRecord[]> = new Map();
  if (by) {
    data.forEach(datum => {
      const value = seriesMap.get(datum[by]);
      if (value) {
        value.push(datum);
      } else {
        seriesMap.set(datum[by], [datum]);
      }
    });
  } else {
    seriesMap.set(undefined, data);
  }
  return seriesMap;
}
