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

import { Component, ReactNode, MouseEvent, createRef } from 'react';
import { safeHtmlSpan } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import PropTypes from 'prop-types';
import { FaSort } from 'react-icons/fa';
import { FaSortDown as FaSortDesc } from 'react-icons/fa';
import { FaSortUp as FaSortAsc } from 'react-icons/fa';
import { PivotData, flatKey } from './utilities';
import { Styles } from './Styles';
import { freezePivotColumns, pivotFreezeKey } from './freezePivotColumns';
import {
  formatPivotValueWithRules,
  type PivotNumberFormatRule,
} from '../utils/numberFormatRules';

interface CellColorFormatter {
  column: string;
  getColorFromValue(value: unknown): string | undefined;
}

type ClickCallback = (
  e: MouseEvent,
  value: unknown,
  filters: Record<string, string>,
  pivotData: InstanceType<typeof PivotData>,
) => void;

type HeaderClickCallback = (
  e: MouseEvent,
  value: string,
  filters: Record<string, string>,
  pivotData: InstanceType<typeof PivotData>,
  isSubtotal: boolean,
  isGrandTotal: boolean,
) => void;

interface TableOptions {
  rowTotals?: boolean;
  colTotals?: boolean;
  rowSubTotals?: boolean;
  colSubTotals?: boolean;
  clickCallback?: ClickCallback;
  clickColumnHeaderCallback?: HeaderClickCallback;
  clickRowHeaderCallback?: HeaderClickCallback;
  highlightHeaderCellsOnHover?: boolean;
  omittedHighlightHeaderGroups?: string[];
  highlightedHeaderCells?: Record<string, unknown[]>;
  cellColorFormatters?: Record<string, CellColorFormatter[]>;
  dateFormatters?: Record<string, ((val: unknown) => string) | undefined>;
  pivotNumberFormatRules?: PivotNumberFormatRule[];
}

interface SubtotalDisplay {
  displayOnTop: boolean;
  enabled?: boolean;
  hideOnExpand: boolean;
}

interface SubtotalOptions {
  arrowCollapsed?: ReactNode;
  arrowExpanded?: ReactNode;
  colSubtotalDisplay?: Partial<SubtotalDisplay>;
  rowSubtotalDisplay?: Partial<SubtotalDisplay>;
}

interface TableRendererProps {
  cols: string[];
  rows: string[];
  aggregatorName: string;
  tableOptions: TableOptions;
  subtotalOptions?: SubtotalOptions;
  namesMapping?: Record<string, string>;
  onContextMenu: (
    e: MouseEvent,
    colKey?: string[],
    rowKey?: string[],
    filters?: Record<string, string>,
  ) => void;
  allowRenderHtml?: boolean;
  frozenColumnCount?: number;
  frozenColumnKey?: string | null;
  freezeMetricIds?: Record<string, string>;
  freezeMetricAxis?: string;
  [key: string]: unknown;
}

interface TableRendererState {
  freezeMissing?: boolean;
  collapsedRows: Record<string, boolean>;
  collapsedCols: Record<string, boolean>;
  sortingOrder: string[];
  activeSortColumn?: number | null;
  // 行维度排序与指标列排序分开记录，避免两个入口的图标状态相互污染。
  rowSortingOrder: string[];
  activeSortRowDimension?: number | null;
}

interface PivotSettings {
  pivotData: InstanceType<typeof PivotData>;
  colAttrs: string[];
  rowAttrs: string[];
  colKeys: string[][];
  rowKeys: string[][];
  rowTotals: boolean;
  colTotals: boolean;
  arrowCollapsed: ReactNode;
  arrowExpanded: ReactNode;
  colSubtotalDisplay: SubtotalDisplay;
  rowSubtotalDisplay: SubtotalDisplay;
  cellCallbacks: Record<string, Record<string, (e: MouseEvent) => void>>;
  rowTotalCallbacks: Record<string, (e: MouseEvent) => void>;
  colTotalCallbacks: Record<string, (e: MouseEvent) => void>;
  grandTotalCallback: ((e: MouseEvent) => void) | null;
  namesMapping: Record<string, string>;
  allowRenderHtml?: boolean;
  visibleRowKeys?: string[][];
  visibleColKeys?: string[][];
  maxRowVisible?: number;
  maxColVisible?: number;
  rowAttrSpans?: number[][];
  colAttrSpans?: number[][];
}

const parseLabel = (value: unknown): string | number => {
  if (typeof value === 'string') {
    if (value === 'metric') return t('metric');
    return value;
  }
  if (typeof value === 'number') {
    return value;
  }
  return String(value);
};

function displayCell(value: unknown, allowRenderHtml?: boolean): ReactNode {
  if (allowRenderHtml && typeof value === 'string') {
    return safeHtmlSpan(value);
  }
  return parseLabel(value);
}
function displayHeaderCell(
  needToggle: boolean,
  ArrowIcon: ReactNode,
  onArrowClick: ((e: MouseEvent<HTMLSpanElement>) => void) | null,
  value: unknown,
  namesMapping: Record<string, string>,
  allowRenderHtml?: boolean,
): ReactNode {
  const name = namesMapping[String(value)] || value;
  const parsedLabel = parseLabel(name);
  const labelContent =
    allowRenderHtml && typeof parsedLabel === 'string'
      ? safeHtmlSpan(parsedLabel)
      : parsedLabel;
  return needToggle ? (
    <span className="toggle-wrapper">
      <span
        role="button"
        tabIndex={0}
        className="toggle"
        onClick={onArrowClick || undefined}
      >
        {ArrowIcon}
      </span>
      <span className="toggle-val">{labelContent}</span>
    </span>
  ) : (
    labelContent
  );
}

function getCellColor(
  keys: string[],
  aggValue: string | number | null,
  cellColorFormatters: Record<string, CellColorFormatter[]> | undefined,
): { backgroundColor: string | undefined; color: string | undefined } {
  if (!cellColorFormatters)
    return { backgroundColor: undefined, color: undefined };

  const formatters: CellColorFormatter[] = [];
  for (const cellColorFormatter of Object.values(cellColorFormatters)) {
    if (Array.isArray(cellColorFormatter)) {
      formatters.push(...cellColorFormatter);
    }
  }

  const keySet = new Set(keys);
  const matchingFormatters = formatters.filter(formatter =>
    keySet.has(formatter.column),
  );
  const formatterColumns = new Set(
    formatters.map(formatter => formatter.column),
  );
  const candidateFormatters = matchingFormatters.length
    ? matchingFormatters
    : formatterColumns.size === 1
      ? formatters
      : [];
  let backgroundColor: string | undefined;
  for (const formatter of candidateFormatters) {
    const result = formatter.getColorFromValue(aggValue);
    if (result) {
      backgroundColor = result;
    }
  }

  return { backgroundColor, color: undefined };
}

/**
 * 功能审计（可重写规格）：透视表已选行视觉高亮
 * - 功能目的与触发方式：当用户通过透视表行维度选择产生 selectedFilters 时，让同一叶子行的维度单元格和数值单元格呈现统一选中状态，便于用户确认选择目标。
 * - 输入契约：rowAttrs 与 rowKey 为当前渲染行的维度名称和原始值；仅 rowKey 长度等于 rowAttrs 长度的完整叶子行可选中；highlightedHeaderCells 为外部传入的 {维度名: 已选原始值[]}，可为空。
 * - 输出契约：返回布尔值；true 时渲染行带 pvtRowSelected class，false 时不增加 class。
 * - 处理流程：先排除小计/部分行，再提取属于行维度的已选条件；若没有行维度条件返回 false；每个已选行维度都必须与当前 rowKey 对应值匹配才返回 true。
 * - 业务规则：多个行维度条件按 AND 匹配，避免同一日期下其他 LT 被误高亮；列维度选择不高亮所有行；取消选择后的空对象不高亮任何行。
 * - 状态与副作用：纯计算，不改变 selectedFilters、不发起筛选请求、不修改透视表数据或总计。
 * - 外部依赖：依赖 PivotTableChart 既有 highlightedHeaderCells/selectedFilters 传递；无新增配置、接口或持久化状态。
 * - 异常与边界：未知维度、非数组值或缺失 rowKey 值均视为不匹配；行合并单元格的 rowspan 结构保持原样。
 * - 不变量与约束：只影响普通数据行的视觉 class；不得改变已有表头 active、条件色计算、点击筛选或展开/排序行为。
 * - 验证方式：tableRenders 测试覆盖匹配叶子行有 class、相邻非匹配行无 class；页面验收点击 LT 后仅该 LT 行高亮，取消后恢复。
 */
function isRowSelectionActive(
  rowAttrs: string[],
  rowKey: string[],
  highlightedHeaderCells: Record<string, unknown[]> | undefined,
): boolean {
  if (!highlightedHeaderCells || rowKey.length !== rowAttrs.length) {
    return false;
  }

  const selectedRowDimensions = Object.entries(highlightedHeaderCells).filter(
    ([attr, values]) => rowAttrs.includes(attr) && Array.isArray(values),
  );
  if (selectedRowDimensions.length === 0) {
    return false;
  }

  return selectedRowDimensions.every(([attr, values]) => {
    const attrIndex = rowAttrs.indexOf(attr);
    return values.includes(rowKey[attrIndex]);
  });
}

interface HierarchicalNode {
  currentVal?: number;
  [key: string]: HierarchicalNode | number | undefined;
}

function sortHierarchicalObject(
  obj: Record<string, HierarchicalNode>,
  objSort: string,
  rowPartialOnTop: boolean | undefined,
): Map<string, unknown> {
  // Performs a recursive sort of nested object structures. Sorts objects based on
  // their currentVal property. The function preserves the hierarchical structure
  // while sorting each level according to the specified criteria.
  const sortedKeys = Object.keys(obj).sort((a, b) => {
    const valA = obj[a].currentVal || 0;
    const valB = obj[b].currentVal || 0;
    if (rowPartialOnTop) {
      if (obj[a].currentVal !== undefined && obj[b].currentVal === undefined) {
        return -1;
      }
      if (obj[b].currentVal !== undefined && obj[a].currentVal === undefined) {
        return 1;
      }
    }
    return objSort === 'asc' ? valA - valB : valB - valA;
  });

  const result = new Map<string, unknown>();
  sortedKeys.forEach(key => {
    const value = obj[key];
    if (typeof value === 'object' && !Array.isArray(value)) {
      result.set(
        key,
        sortHierarchicalObject(
          value as Record<string, HierarchicalNode>,
          objSort,
          rowPartialOnTop,
        ),
      );
    } else {
      result.set(key, value);
    }
  });
  return result;
}

function convertToArray(
  obj: Map<string, unknown>,
  rowEnabled: boolean | undefined,
  rowPartialOnTop: boolean | undefined,
  maxRowIndex: number,
  parentKeys: string[] = [],
  result: string[][] = [],
  flag = false,
): string[][] {
  // Recursively flattens a hierarchical Map structure into an array of key paths.
  // Handles different rendering scenarios based on row grouping configurations and
  // depth limitations. The function supports complex hierarchy flattening with
  let updatedFlag = flag;

  const keys = Array.from(obj.keys());
  const getValue = (key: string) => obj.get(key);

  keys.forEach(key => {
    if (key === 'currentVal') {
      return;
    }
    const value = getValue(key);
    if (rowEnabled && rowPartialOnTop && parentKeys.length < maxRowIndex - 1) {
      result.push(parentKeys.length > 0 ? [...parentKeys, key] : [key]);
      updatedFlag = true;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      convertToArray(
        value as Map<string, unknown>,
        rowEnabled,
        rowPartialOnTop,
        maxRowIndex,
        [...parentKeys, key],
        result,
      );
    }
    if (
      parentKeys.length >= maxRowIndex - 1 ||
      (rowEnabled && !rowPartialOnTop)
    ) {
      if (!updatedFlag) {
        result.push(parentKeys.length > 0 ? [...parentKeys, key] : [key]);
        return;
      }
    }
    if (parentKeys.length === 0 && maxRowIndex === 1) {
      result.push([key]);
    }
  });
  return result;
}

export class TableRenderer extends Component<
  TableRendererProps,
  TableRendererState
> {
  sortCache: Map<string, string[][]>;
  cachedProps: TableRendererProps | null;
  cachedBasePivotSettings: PivotSettings | null;
  tableRef = createRef<HTMLTableElement>();
  freezeFrame = 0;
  lastFrozenCount = 0;

  static propTypes: Record<string, unknown>;
  static defaultProps: Record<string, unknown>;

  constructor(props: TableRendererProps) {
    super(props);

    // We need state to record which entries are collapsed and which aren't.
    // This is an object with flat-keys indicating if the corresponding rows
    // should be collapsed.
    // 指标列和顶层行维度使用独立排序状态，切换入口时由对应处理函数重置另一组状态。
    this.state = {
      collapsedRows: {},
      collapsedCols: {},
      sortingOrder: [],
      rowSortingOrder: [],
    };
    this.sortCache = new Map();
    this.cachedProps = null;
    this.cachedBasePivotSettings = null;
    this.clickHeaderHandler = this.clickHeaderHandler.bind(this);
    this.clickHandler = this.clickHandler.bind(this);
  }

  getBasePivotSettings(): PivotSettings {
    // One-time extraction of pivot settings that we'll use throughout the render.

    const { props } = this;
    const colAttrs = props.cols;
    const rowAttrs = props.rows;

    const tableOptions: TableOptions = {
      rowTotals: true,
      colTotals: true,
      ...props.tableOptions,
    };
    const rowTotals = tableOptions.rowTotals || colAttrs.length === 0;
    const colTotals = tableOptions.colTotals || rowAttrs.length === 0;

    const namesMapping = props.namesMapping || {};
    const subtotalOptions: Required<
      Pick<SubtotalOptions, 'arrowCollapsed' | 'arrowExpanded'>
    > &
      SubtotalOptions = {
      arrowCollapsed: '\u25B2',
      arrowExpanded: '\u25BC',
      ...props.subtotalOptions,
    };

    const colSubtotalDisplay: SubtotalDisplay = {
      displayOnTop: false,
      enabled: tableOptions.colSubTotals,
      hideOnExpand: false,
      ...subtotalOptions.colSubtotalDisplay,
    };

    const rowSubtotalDisplay: SubtotalDisplay = {
      displayOnTop: false,
      enabled: tableOptions.rowSubTotals,
      hideOnExpand: false,
      ...subtotalOptions.rowSubtotalDisplay,
    };

    const pivotData = new PivotData(props as Record<string, unknown>, {
      rowEnabled: rowSubtotalDisplay.enabled,
      colEnabled: colSubtotalDisplay.enabled,
      rowPartialOnTop: rowSubtotalDisplay.displayOnTop,
      colPartialOnTop: colSubtotalDisplay.displayOnTop,
    });
    const rowKeys = pivotData.getRowKeys();
    const colKeys = pivotData.getColKeys();

    // Also pre-calculate all the callbacks for cells, etc... This is nice to have to
    // avoid re-calculations of the call-backs on cell expansions, etc...
    const cellCallbacks: Record<
      string,
      Record<string, (e: MouseEvent) => void>
    > = {};
    const rowTotalCallbacks: Record<string, (e: MouseEvent) => void> = {};
    const colTotalCallbacks: Record<string, (e: MouseEvent) => void> = {};
    let grandTotalCallback: ((e: MouseEvent) => void) | null = null;
    if (tableOptions.clickCallback) {
      rowKeys.forEach(rowKey => {
        const flatRowKey = flatKey(rowKey);
        if (!(flatRowKey in cellCallbacks)) {
          cellCallbacks[flatRowKey] = {};
        }
        colKeys.forEach(colKey => {
          cellCallbacks[flatRowKey][flatKey(colKey)] = this.clickHandler(
            pivotData,
            rowKey,
            colKey,
          );
        });
      });

      // Add in totals as well.
      if (rowTotals) {
        rowKeys.forEach(rowKey => {
          rowTotalCallbacks[flatKey(rowKey)] = this.clickHandler(
            pivotData,
            rowKey,
            [],
          );
        });
      }
      if (colTotals) {
        colKeys.forEach(colKey => {
          colTotalCallbacks[flatKey(colKey)] = this.clickHandler(
            pivotData,
            [],
            colKey,
          );
        });
      }
      if (rowTotals && colTotals) {
        grandTotalCallback = this.clickHandler(pivotData, [], []);
      }
    }

    return {
      pivotData,
      colAttrs,
      rowAttrs,
      colKeys,
      rowKeys,
      rowTotals,
      colTotals,
      arrowCollapsed: subtotalOptions.arrowCollapsed,
      arrowExpanded: subtotalOptions.arrowExpanded,
      colSubtotalDisplay,
      rowSubtotalDisplay,
      cellCallbacks,
      rowTotalCallbacks,
      colTotalCallbacks,
      grandTotalCallback,
      namesMapping,
      allowRenderHtml: props.allowRenderHtml,
    };
  }

  clickHandler(
    pivotData: InstanceType<typeof PivotData>,
    rowValues: string[],
    colValues: string[],
  ) {
    const colAttrs = this.props.cols;
    const rowAttrs = this.props.rows;
    const value = pivotData.getAggregator(rowValues, colValues).value();
    const filters: Record<string, string> = {};
    const colLimit = Math.min(colAttrs.length, colValues.length);
    for (let i = 0; i < colLimit; i += 1) {
      const attr = colAttrs[i];
      if (colValues[i] !== null) {
        filters[attr] = colValues[i];
      }
    }
    const rowLimit = Math.min(rowAttrs.length, rowValues.length);
    for (let i = 0; i < rowLimit; i += 1) {
      const attr = rowAttrs[i];
      if (rowValues[i] !== null) {
        filters[attr] = rowValues[i];
      }
    }
    const { clickCallback } = this.props.tableOptions;
    return (e: MouseEvent) => clickCallback?.(e, value, filters, pivotData);
  }

  clickHeaderHandler(
    pivotData: InstanceType<typeof PivotData>,
    values: string[],
    attrs: string[],
    attrIdx: number,
    callback: HeaderClickCallback | undefined,
    isSubtotal = false,
    isGrandTotal = false,
  ) {
    const filters: Record<string, string> = {};
    for (let i = 0; i <= attrIdx; i += 1) {
      const attr = attrs[i];
      filters[attr] = values[i];
    }
    return (e: MouseEvent) =>
      callback?.(
        e,
        values[attrIdx],
        filters,
        pivotData,
        isSubtotal,
        isGrandTotal,
      );
  }

  collapseAttr(rowOrCol: boolean, attrIdx: number, allKeys: string[][]) {
    return (e: MouseEvent<HTMLSpanElement>) => {
      // Collapse an entire attribute.
      e.stopPropagation();
      const keyLen = attrIdx + 1;
      const collapsed = allKeys
        .filter((k: string[]) => k.length === keyLen)
        .map(flatKey);

      const updates: Record<string, boolean> = {};
      collapsed.forEach((k: string) => {
        updates[k] = true;
      });

      if (rowOrCol) {
        this.setState(state => ({
          collapsedRows: { ...state.collapsedRows, ...updates },
        }));
      } else {
        this.setState(state => ({
          collapsedCols: { ...state.collapsedCols, ...updates },
        }));
      }
    };
  }

  expandAttr(rowOrCol: boolean, attrIdx: number, allKeys: string[][]) {
    return (e: MouseEvent<HTMLSpanElement>) => {
      // Expand an entire attribute. This implicitly implies expanding all of the
      // parents as well. It's a bit inefficient but ah well...
      e.stopPropagation();
      const updates: Record<string, boolean> = {};
      allKeys.forEach((k: string[]) => {
        for (let i = 0; i <= attrIdx; i += 1) {
          updates[flatKey(k.slice(0, i + 1))] = false;
        }
      });

      if (rowOrCol) {
        this.setState(state => ({
          collapsedRows: { ...state.collapsedRows, ...updates },
        }));
      } else {
        this.setState(state => ({
          collapsedCols: { ...state.collapsedCols, ...updates },
        }));
      }
    };
  }

  toggleRowKey(flatRowKey: string) {
    return (e: MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      this.setState(state => ({
        collapsedRows: {
          ...state.collapsedRows,
          [flatRowKey]: !state.collapsedRows[flatRowKey],
        },
      }));
    };
  }

  toggleColKey(flatColKey: string) {
    return (e: MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      this.setState(state => ({
        collapsedCols: {
          ...state.collapsedCols,
          [flatColKey]: !state.collapsedCols[flatColKey],
        },
      }));
    };
  }

  calcAttrSpans(attrArr: string[][], numAttrs: number) {
    // Given an array of attribute values (i.e. each element is another array with
    // the value at every level), compute the spans for every attribute value at
    // every level. The return value is a nested array of the same shape. It has
    // -1's for repeated values and the span number otherwise.

    const spans = [];
    // Index of the last new value
    const li = Array(numAttrs).map(() => 0);
    let lv: (string | null)[] = Array(numAttrs).map(() => null);
    for (let i = 0; i < attrArr.length; i += 1) {
      // Keep increasing span values as long as the last keys are the same. For
      // the rest, record spans of 1. Update the indices too.
      const cv = attrArr[i];
      const ent = [];
      let depth = 0;
      const limit = Math.min(lv.length, cv.length);
      while (depth < limit && lv[depth] === cv[depth]) {
        ent.push(-1);
        spans[li[depth]][depth] += 1;
        depth += 1;
      }
      while (depth < cv.length) {
        li[depth] = i;
        ent.push(1);
        depth += 1;
      }
      spans.push(ent);
      lv = cv;
    }
    return spans;
  }

  getAggregatedData(
    pivotData: InstanceType<typeof PivotData>,
    visibleColName: string[],
    rowPartialOnTop: boolean | undefined,
  ) {
    // Transforms flat row keys into a hierarchical group structure where each level
    // represents a grouping dimension. For each row key path, it calculates the
    // aggregated value for the specified column and builds a nested object that
    // preserves the hierarchy while storing aggregation values at each level.
    const groups: Record<string, HierarchicalNode> = {};
    const rows = pivotData.rowKeys;
    rows.forEach(rowKey => {
      const aggValue =
        pivotData.getAggregator(rowKey, visibleColName).value() ?? 0;

      if (rowPartialOnTop) {
        const parent = rowKey
          .slice(0, -1)
          .reduce(
            (acc: Record<string, HierarchicalNode>, key: string) =>
              (acc[key] ??= {}) as Record<string, HierarchicalNode>,
            groups,
          );
        parent[rowKey.at(-1)!] = { currentVal: aggValue as number };
      } else {
        rowKey.reduce((acc: Record<string, HierarchicalNode>, key: string) => {
          acc[key] = acc[key] || { currentVal: 0 };
          (acc[key] as HierarchicalNode).currentVal = aggValue as number;
          return acc[key] as Record<string, HierarchicalNode>;
        }, groups);
      }
    });
    return groups;
  }

  sortAndCacheData(
    groups: Record<string, HierarchicalNode>,
    sortOrder: string,
    rowEnabled: boolean | undefined,
    rowPartialOnTop: boolean | undefined,
    maxRowIndex: number,
  ) {
    // Processes hierarchical data by first sorting it according to the specified order
    // and then converting the sorted structure into a flat array format. This function
    // serves as an intermediate step between hierarchical data representation and
    // flat array representation needed for rendering.
    const sortedGroups = sortHierarchicalObject(
      groups,
      sortOrder,
      rowPartialOnTop,
    );
    return convertToArray(
      sortedGroups,
      rowEnabled,
      rowPartialOnTop,
      maxRowIndex,
    );
  }

  sortRowDimension(dimensionIndex: number, rowKeys: string[][]) {
    // 只按选中的行维度原始值排序；值相同时保留原索引，使同一配送日期下的
    // LT 明细和小计维持既有相对顺序，不会被拆散到其他日期分组。
    this.setState(state => {
      const { activeSortRowDimension, rowSortingOrder } = state;
      // 透视表默认已按行键升序展示，因此首次点击直接切为降序，避免用户看到
      // 箭头变化但日期顺序没有变化；再次点击同一维度时再恢复升序。
      const newDirection =
        activeSortRowDimension === dimensionIndex &&
        rowSortingOrder[dimensionIndex] === 'desc'
          ? 'asc'
          : 'desc';

      const sortedRowKeys = rowKeys
        .map((rowKey, originalIndex) => ({ rowKey, originalIndex }))
        .sort((left, right) => {
          const leftValue = String(left.rowKey[dimensionIndex] ?? '');
          const rightValue = String(right.rowKey[dimensionIndex] ?? '');
          const comparison = leftValue.localeCompare(rightValue, undefined, {
            numeric: true,
            sensitivity: 'base',
          });
          if (comparison === 0) {
            return left.originalIndex - right.originalIndex;
          }
          return newDirection === 'asc' ? comparison : -comparison;
        })
        .map(({ rowKey }) => rowKey);

      this.cachedBasePivotSettings = {
        ...this.cachedBasePivotSettings!,
        rowKeys: sortedRowKeys,
      };

      const newRowSortingOrder: string[] = [];
      newRowSortingOrder[dimensionIndex] = newDirection;

      return {
        rowSortingOrder: newRowSortingOrder,
        activeSortRowDimension: dimensionIndex,
        // 用户改按日期维度排序后，清除指标列高亮，确保界面只显示一个生效排序。
        sortingOrder: [],
        activeSortColumn: null,
      };
    });
  }

  sortData(
    columnIndex: number,
    visibleColKeys: string[][],
    pivotData: InstanceType<typeof PivotData>,
    maxRowIndex: number,
  ) {
    // 指标列排序在升序和降序之间切换，并按指标、层级配置和方向缓存结果，
    // 避免用户重复点击同一指标时再次计算整棵行分组。
    this.setState(state => {
      const { sortingOrder, activeSortColumn } = state;

      const newSortingOrder = [];
      let newDirection = 'asc';

      if (activeSortColumn === columnIndex) {
        newDirection = sortingOrder[columnIndex] === 'asc' ? 'desc' : 'asc';
      }

      const { rowEnabled, rowPartialOnTop } = pivotData.subtotals as {
        rowEnabled?: boolean;
        rowPartialOnTop?: boolean;
      };
      newSortingOrder[columnIndex] = newDirection;

      const cacheKey = `${columnIndex}-${visibleColKeys.length}-${rowEnabled}-${rowPartialOnTop}-${newDirection}`;
      let newRowKeys;
      if (this.sortCache.has(cacheKey)) {
        const cachedRowKeys = this.sortCache.get(cacheKey);
        newRowKeys = cachedRowKeys;
      } else {
        const groups = this.getAggregatedData(
          pivotData,
          visibleColKeys[columnIndex],
          rowPartialOnTop,
        );
        const sortedRowKeys = this.sortAndCacheData(
          groups,
          newDirection,
          rowEnabled,
          rowPartialOnTop,
          maxRowIndex,
        );
        this.sortCache.set(cacheKey, sortedRowKeys);
        newRowKeys = sortedRowKeys;
      }
      this.cachedBasePivotSettings = {
        ...this.cachedBasePivotSettings!,
        rowKeys: newRowKeys!,
      };

      return {
        sortingOrder: newSortingOrder,
        activeSortColumn: columnIndex,
        // 用户改按指标排序后，清除日期维度高亮，防止两个入口同时显示为生效。
        rowSortingOrder: [],
        activeSortRowDimension: null,
      };
    });
  }

  renderColHeaderRow(
    attrName: string,
    attrIdx: number,
    pivotSettings: PivotSettings,
  ) {
    // Render a single row in the column header at the top of the pivot table.

    const {
      rowAttrs,
      colAttrs,
      colKeys,
      visibleColKeys,
      colAttrSpans,
      rowTotals,
      arrowExpanded,
      arrowCollapsed,
      colSubtotalDisplay,
      maxColVisible,
      pivotData,
      namesMapping,
      allowRenderHtml,
    } = pivotSettings;
    const {
      highlightHeaderCellsOnHover,
      omittedHighlightHeaderGroups = [],
      highlightedHeaderCells,
      cellColorFormatters,
      dateFormatters,
    } = this.props.tableOptions;

    if (!visibleColKeys || !colAttrSpans) {
      return null;
    }

    const spaceCell =
      attrIdx === 0 && rowAttrs.length !== 0 ? (
        <th
          key="padding"
          colSpan={rowAttrs.length}
          rowSpan={colAttrs.length}
          aria-hidden="true"
        />
      ) : null;

    const needToggle =
      colSubtotalDisplay.enabled === true && attrIdx !== colAttrs.length - 1;
    let arrowClickHandle = null;
    let subArrow = null;
    if (needToggle) {
      arrowClickHandle =
        attrIdx + 1 < maxColVisible!
          ? this.collapseAttr(false, attrIdx, colKeys)
          : this.expandAttr(false, attrIdx, colKeys);
      subArrow = attrIdx + 1 < maxColVisible! ? arrowExpanded : arrowCollapsed;
    }
    const attrNameCell = (
      <th key="label" className="pvtAxisLabel">
        {displayHeaderCell(
          needToggle,
          subArrow,
          arrowClickHandle,
          attrName,
          namesMapping,
          allowRenderHtml,
        )}
      </th>
    );

    const attrValueCells = [];
    const rowIncrSpan = rowAttrs.length !== 0 ? 1 : 0;
    // Iterate through columns. Jump over duplicate values.
    let i = 0;
    while (i < visibleColKeys.length) {
      let handleContextMenu: ((e: MouseEvent) => void) | undefined;
      const colKey = visibleColKeys[i];
      const colSpan = attrIdx < colKey.length ? colAttrSpans[i][attrIdx] : 1;
      let colLabelClass = 'pvtColLabel';
      if (attrIdx < colKey.length) {
        if (!omittedHighlightHeaderGroups.includes(colAttrs[attrIdx])) {
          if (highlightHeaderCellsOnHover) {
            colLabelClass += ' hoverable';
          }
          handleContextMenu = (e: MouseEvent) =>
            this.props.onContextMenu(e, colKey, undefined, {
              [attrName]: colKey[attrIdx],
            });
        }
        if (
          highlightedHeaderCells &&
          Array.isArray(highlightedHeaderCells[colAttrs[attrIdx]]) &&
          highlightedHeaderCells[colAttrs[attrIdx]].includes(colKey[attrIdx])
        ) {
          colLabelClass += ' active';
        }
        const maxRowIndex = pivotSettings.maxRowVisible!;
        const mColVisible = pivotSettings.maxColVisible!;
        const visibleSortIcon = mColVisible - 1 === attrIdx;
        const columnName = colKey[mColVisible - 1];

        const rowSpan = 1 + (attrIdx === colAttrs.length - 1 ? rowIncrSpan : 0);
        const flatColKey = flatKey(colKey.slice(0, attrIdx + 1));
        const onArrowClick = needToggle ? this.toggleColKey(flatColKey) : null;
        const getSortIcon = (key: number) => {
          const { activeSortColumn, sortingOrder } = this.state;

          if (activeSortColumn !== key) {
            return (
              <FaSort
                onClick={() =>
                  this.sortData(key, visibleColKeys, pivotData, maxRowIndex)
                }
              />
            );
          }

          const SortIcon = sortingOrder[key] === 'asc' ? FaSortAsc : FaSortDesc;
          return (
            <SortIcon
              onClick={() =>
                this.sortData(key, visibleColKeys, pivotData, maxRowIndex)
              }
            />
          );
        };
        const headerCellFormattedValue =
          dateFormatters?.[attrName]?.(colKey[attrIdx]) ?? colKey[attrIdx];
        const { backgroundColor, color } = getCellColor(
          [attrName],
          headerCellFormattedValue,
          cellColorFormatters,
        );
        const style = { backgroundColor, color };
        attrValueCells.push(
          <th
            className={colLabelClass}
            data-pivot-freeze-key={
              colSpan === 1 && attrIdx === colKey.length - 1
                ? pivotFreezeKey(
                    colAttrs,
                    colKey,
                    this.props.freezeMetricAxis || '',
                    this.props.freezeMetricIds || {},
                  )
                : undefined
            }
            data-pivot-freeze-label={colKey
              .map(
                (value, index) =>
                  namesMapping[value] ||
                  dateFormatters?.[colAttrs[index]]?.(value) ||
                  value,
              )
              .join(' / ')}
            data-pivot-metric-id={
              this.props.freezeMetricIds?.[
                colKey[colAttrs.indexOf(this.props.freezeMetricAxis || '')]
              ]
            }
            key={`colKey-${flatColKey}`}
            style={style}
            colSpan={colSpan}
            rowSpan={rowSpan}
            role="columnheader button"
            onClick={this.clickHeaderHandler(
              pivotData,
              colKey,
              this.props.cols,
              attrIdx,
              this.props.tableOptions.clickColumnHeaderCallback,
            )}
            onContextMenu={handleContextMenu}
          >
            {displayHeaderCell(
              needToggle,
              this.state.collapsedCols[flatColKey]
                ? arrowCollapsed
                : arrowExpanded,
              onArrowClick,
              headerCellFormattedValue,
              namesMapping,
              allowRenderHtml,
            )}
            <span
              role="columnheader"
              tabIndex={0}
              // Prevents event bubbling to avoid conflict with column header click handlers
              // Ensures sort operation executes without triggering cross-filtration
              onClick={e => {
                e.stopPropagation();
              }}
              aria-label={
                this.state.activeSortColumn === i
                  ? `Sorted by ${columnName} ${this.state.sortingOrder[i] === 'asc' ? 'ascending' : 'descending'}`
                  : undefined
              }
            >
              {visibleSortIcon && getSortIcon(i)}
            </span>
          </th>,
        );
      } else if (attrIdx === colKey.length) {
        const rowSpan = colAttrs.length - colKey.length + rowIncrSpan;
        attrValueCells.push(
          <th
            className={`${colLabelClass} pvtSubtotalLabel`}
            key={`colKeyBuffer-${flatKey(colKey)}`}
            colSpan={colSpan}
            rowSpan={rowSpan}
            role="columnheader button"
            onClick={this.clickHeaderHandler(
              pivotData,
              colKey,
              this.props.cols,
              attrIdx,
              this.props.tableOptions.clickColumnHeaderCallback,
              true,
            )}
          >
            {t('Subtotal')}
          </th>,
        );
      }
      // The next colSpan columns will have the same value anyway...
      i += colSpan;
    }

    const totalCell =
      attrIdx === 0 && rowTotals ? (
        <th
          key="total"
          className="pvtTotalLabel"
          rowSpan={colAttrs.length + Math.min(rowAttrs.length, 1)}
          role="columnheader button"
          onClick={this.clickHeaderHandler(
            pivotData,
            [],
            this.props.cols,
            attrIdx,
            this.props.tableOptions.clickColumnHeaderCallback,
            false,
            true,
          )}
        >
          {t('Total (%(aggregatorName)s)', {
            aggregatorName: t(this.props.aggregatorName),
          })}
        </th>
      ) : null;

    const cells = [spaceCell, attrNameCell, ...attrValueCells, totalCell];
    return <tr key={`colAttr-${attrIdx}`}>{cells}</tr>;
  }

  renderRowHeaderRow(pivotSettings: PivotSettings) {
    // 渲染行维度标题；第一层是父分组，允许排序，子维度继续跟随父分组展示。
    const {
      rowAttrs,
      colAttrs,
      rowKeys,
      arrowCollapsed,
      arrowExpanded,
      rowSubtotalDisplay,
      maxRowVisible,
      pivotData,
      namesMapping,
      allowRenderHtml,
    } = pivotSettings;
    return (
      <tr key="rowHdr">
        {rowAttrs.map((r, i) => {
          const needLabelToggle =
            rowSubtotalDisplay.enabled === true && i !== rowAttrs.length - 1;
          let arrowClickHandle = null;
          let subArrow = null;
          if (needLabelToggle) {
            arrowClickHandle =
              i + 1 < maxRowVisible!
                ? this.collapseAttr(true, i, rowKeys)
                : this.expandAttr(true, i, rowKeys);
            subArrow = i + 1 < maxRowVisible! ? arrowExpanded : arrowCollapsed;
          }
          // 仅开放第一层行维度排序，避免对子维度单独排序后破坏父子分组关系。
          const isSortableTopLevelDimension = i === 0;
          const rowDimensionLabel = String(namesMapping[r] || r);
          const isActiveRowSort = this.state.activeSortRowDimension === i;
          const RowSortIcon = !isActiveRowSort
            ? FaSort
            : this.state.rowSortingOrder[i] === 'asc'
              ? FaSortAsc
              : FaSortDesc;
          return (
            <th
              className="pvtAxisLabel"
              key={`rowAttr-${i}`}
              data-pivot-freeze-key={JSON.stringify(['dimension', r])}
              data-pivot-freeze-label={rowDimensionLabel}
            >
              {displayHeaderCell(
                needLabelToggle,
                subArrow,
                arrowClickHandle,
                r,
                namesMapping,
                allowRenderHtml,
              )}
              {isSortableTopLevelDimension && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={event => {
                    event.stopPropagation();
                    this.sortRowDimension(i, rowKeys);
                  }}
                  aria-label={
                    isActiveRowSort
                      ? `Sorted by ${rowDimensionLabel} ${
                          this.state.rowSortingOrder[i] === 'asc'
                            ? 'ascending'
                            : 'descending'
                        }`
                      : `Sort ${rowDimensionLabel}`
                  }
                >
                  <RowSortIcon />
                </span>
              )}
            </th>
          );
        })}
        <th
          className="pvtTotalLabel"
          key="padding"
          role="columnheader button"
          onClick={this.clickHeaderHandler(
            pivotData,
            [],
            this.props.rows,
            0,
            this.props.tableOptions.clickRowHeaderCallback,
            false,
            true,
          )}
        >
          {colAttrs.length === 0
            ? t('Total (%(aggregatorName)s)', {
                aggregatorName: t(this.props.aggregatorName),
              })
            : null}
        </th>
      </tr>
    );
  }

  renderTableRow(
    rowKey: string[],
    rowIdx: number,
    pivotSettings: PivotSettings,
  ) {
    // Render a single row in the pivot table.

    const {
      rowAttrs,
      colAttrs,
      rowAttrSpans,
      visibleColKeys,
      pivotData,
      rowTotals,
      rowSubtotalDisplay,
      arrowExpanded,
      arrowCollapsed,
      cellCallbacks,
      rowTotalCallbacks,
      namesMapping,
      allowRenderHtml,
    } = pivotSettings;

    const {
      highlightHeaderCellsOnHover,
      omittedHighlightHeaderGroups = [],
      highlightedHeaderCells,
      cellColorFormatters,
      dateFormatters,
      pivotNumberFormatRules,
    } = this.props.tableOptions;
    const flatRowKey = flatKey(rowKey);
    const isSelectedRow = isRowSelectionActive(
      rowAttrs,
      rowKey,
      highlightedHeaderCells,
    );

    const colIncrSpan = colAttrs.length !== 0 ? 1 : 0;
    const attrValueCells = rowKey.map((r: string, i: number) => {
      let handleContextMenu: ((e: MouseEvent) => void) | undefined;
      let valueCellClassName = 'pvtRowLabel';
      if (!omittedHighlightHeaderGroups.includes(rowAttrs[i])) {
        if (highlightHeaderCellsOnHover) {
          valueCellClassName += ' hoverable';
        }
        handleContextMenu = (e: MouseEvent) =>
          this.props.onContextMenu(e, undefined, rowKey, {
            [rowAttrs[i]]: r,
          });
      }
      if (
        highlightedHeaderCells &&
        Array.isArray(highlightedHeaderCells[rowAttrs[i]]) &&
        highlightedHeaderCells[rowAttrs[i]].includes(r)
      ) {
        valueCellClassName += ' active';
      }
      const rowSpan = rowAttrSpans![rowIdx][i];
      if (isSelectedRow && rowSpan === 1) {
        valueCellClassName += ' pvtRowSelectedCell';
      }
      if (rowSpan > 0) {
        const flatRowKey = flatKey(rowKey.slice(0, i + 1));
        const colSpan = 1 + (i === rowAttrs.length - 1 ? colIncrSpan : 0);
        const needRowToggle =
          rowSubtotalDisplay.enabled === true && i !== rowAttrs.length - 1;
        const onArrowClick = needRowToggle
          ? this.toggleRowKey(flatRowKey)
          : null;

        const headerCellFormattedValue =
          dateFormatters?.[rowAttrs[i]]?.(r) ?? r;

        const { backgroundColor, color } = getCellColor(
          [rowAttrs[i]],
          headerCellFormattedValue,
          cellColorFormatters,
        );
        const style = { backgroundColor, color };
        return (
          <th
            key={`rowKeyLabel-${i}`}
            className={valueCellClassName}
            style={style}
            rowSpan={rowSpan}
            colSpan={colSpan}
            role="columnheader button"
            onClick={this.clickHeaderHandler(
              pivotData,
              rowKey,
              this.props.rows,
              i,
              this.props.tableOptions.clickRowHeaderCallback,
            )}
            onContextMenu={handleContextMenu}
          >
            {displayHeaderCell(
              needRowToggle,
              this.state.collapsedRows[flatRowKey]
                ? arrowCollapsed
                : arrowExpanded,
              onArrowClick,
              headerCellFormattedValue,
              namesMapping,
              allowRenderHtml,
            )}
          </th>
        );
      }
      return null;
    });

    const attrValuePaddingCell =
      rowKey.length < rowAttrs.length ? (
        <th
          className="pvtRowLabel pvtSubtotalLabel"
          key="rowKeyBuffer"
          colSpan={rowAttrs.length - rowKey.length + colIncrSpan}
          rowSpan={1}
          role="columnheader button"
          onClick={this.clickHeaderHandler(
            pivotData,
            rowKey,
            this.props.rows,
            rowKey.length,
            this.props.tableOptions.clickRowHeaderCallback,
            true,
          )}
        >
          {t('Subtotal')}
        </th>
      ) : null;

    if (!visibleColKeys) {
      return null;
    }

    const rowClickHandlers = cellCallbacks[flatRowKey] || {};
    const valueCells = visibleColKeys.map((colKey: string[]) => {
      const flatColKey = flatKey(colKey);
      const agg = pivotData.getAggregator(rowKey, colKey);
      const aggValue = agg.value();

      const keys = [...rowKey, ...colKey];

      const { backgroundColor, color } = getCellColor(
        keys,
        aggValue,
        cellColorFormatters,
      );

      const style = agg.isSubtotal
        ? { fontWeight: 'bold', backgroundColor, color }
        : { backgroundColor, color };

      return (
        <td
          role="gridcell"
          className={isSelectedRow ? 'pvtVal pvtRowSelectedCell' : 'pvtVal'}
          key={`pvtVal-${flatColKey}`}
          onClick={rowClickHandlers[flatColKey]}
          onContextMenu={e => this.props.onContextMenu(e, colKey, rowKey)}
          style={style}
        >
          {displayCell(
            formatPivotValueWithRules({
              value: aggValue,
              rowAttrs,
              rowKey,
              colAttrs,
              colKey,
              rules: pivotNumberFormatRules,
              dateFormatters,
              defaultFormatter: () => agg.format(aggValue, agg),
            }),
            allowRenderHtml,
          )}
        </td>
      );
    });

    let totalCell = null;
    if (rowTotals) {
      const agg = pivotData.getAggregator(rowKey, []);
      const aggValue = agg.value();
      const { backgroundColor, color } = getCellColor(
        rowKey,
        aggValue,
        cellColorFormatters,
      );
      totalCell = (
        <td
          role="gridcell"
          key="total"
          className={isSelectedRow ? 'pvtTotal pvtRowSelectedCell' : 'pvtTotal'}
          onClick={rowTotalCallbacks[flatRowKey]}
          onContextMenu={e => this.props.onContextMenu(e, undefined, rowKey)}
          style={{ backgroundColor, color }}
        >
          {displayCell(
            formatPivotValueWithRules({
              value: aggValue,
              rowAttrs,
              rowKey,
              colAttrs,
              colKey: [],
              rules: pivotNumberFormatRules,
              dateFormatters,
              defaultFormatter: () => agg.format(aggValue, agg),
            }),
            allowRenderHtml,
          )}
        </td>
      );
    }

    const rowCells = [
      ...attrValueCells,
      attrValuePaddingCell,
      ...valueCells,
      totalCell,
    ];

    return (
      <tr
        key={`keyRow-${flatRowKey}`}
        className={isSelectedRow ? 'pvtRowSelected' : undefined}
      >
        {rowCells}
      </tr>
    );
  }

  renderTotalsRow(pivotSettings: PivotSettings) {
    // Render the final totals rows that has the totals for all the columns.

    const {
      rowAttrs,
      colAttrs,
      visibleColKeys,
      rowTotals,
      pivotData,
      colTotalCallbacks,
      grandTotalCallback,
    } = pivotSettings;

    if (!visibleColKeys) {
      return null;
    }

    const { cellColorFormatters, dateFormatters, pivotNumberFormatRules } =
      this.props.tableOptions;

    const totalLabelCell = (
      <th
        key="label"
        className="pvtTotalLabel pvtRowTotalLabel"
        colSpan={rowAttrs.length + Math.min(colAttrs.length, 1)}
        role="columnheader button"
        onClick={this.clickHeaderHandler(
          pivotData,
          [],
          this.props.rows,
          0,
          this.props.tableOptions.clickRowHeaderCallback,
          false,
          true,
        )}
      >
        {t('Total (%(aggregatorName)s)', {
          aggregatorName: t(this.props.aggregatorName),
        })}
      </th>
    );

    const totalValueCells = visibleColKeys.map((colKey: string[]) => {
      const flatColKey = flatKey(colKey);
      const agg = pivotData.getAggregator([], colKey);
      const aggValue = agg.value();
      const { backgroundColor, color } = getCellColor(
        colKey,
        aggValue,
        cellColorFormatters,
      );

      return (
        <td
          role="gridcell"
          className="pvtTotal pvtRowTotal"
          key={`total-${flatColKey}`}
          onClick={colTotalCallbacks[flatColKey]}
          onContextMenu={e => this.props.onContextMenu(e, colKey, undefined)}
          style={{ padding: '5px', backgroundColor, color }}
        >
          {displayCell(
            formatPivotValueWithRules({
              value: aggValue,
              rowAttrs,
              rowKey: [],
              colAttrs,
              colKey,
              rules: pivotNumberFormatRules,
              dateFormatters,
              defaultFormatter: () => agg.format(aggValue, agg),
            }),
            this.props.allowRenderHtml,
          )}
        </td>
      );
    });

    let grandTotalCell = null;
    if (rowTotals) {
      const agg = pivotData.getAggregator([], []);
      const aggValue = agg.value();
      const { backgroundColor, color } = getCellColor(
        [],
        aggValue,
        cellColorFormatters,
      );
      grandTotalCell = (
        <td
          role="gridcell"
          key="total"
          className="pvtGrandTotal pvtRowTotal"
          onClick={grandTotalCallback || undefined}
          onContextMenu={e => this.props.onContextMenu(e, undefined, undefined)}
          style={{ backgroundColor, color }}
        >
          {displayCell(
            formatPivotValueWithRules({
              value: aggValue,
              rowAttrs,
              rowKey: [],
              colAttrs,
              colKey: [],
              rules: pivotNumberFormatRules,
              dateFormatters,
              defaultFormatter: () => agg.format(aggValue, agg),
            }),
            this.props.allowRenderHtml,
          )}
        </td>
      );
    }

    const totalCells = [totalLabelCell, ...totalValueCells, grandTotalCell];

    return (
      <tr key="total" className="pvtRowTotals">
        {totalCells}
      </tr>
    );
  }

  visibleKeys(
    keys: string[][],
    collapsed: Record<string, boolean>,
    numAttrs: number,
    subtotalDisplay: SubtotalDisplay,
  ) {
    return keys.filter(
      (key: string[]) =>
        // Is the key hidden by one of its parents?
        !key.some(
          (_k: string, j: number) => collapsed[flatKey(key.slice(0, j))],
        ) &&
        // Leaf key.
        (key.length === numAttrs ||
          // Children hidden. Must show total.
          flatKey(key) in collapsed ||
          // Don't hide totals.
          !subtotalDisplay.hideOnExpand),
    );
  }

  isDashboardEditMode() {
    return document.contains(document.querySelector('.dashboard--editing'));
  }

  componentDidMount() {
    this.scheduleFreeze();
  }

  componentDidUpdate() {
    this.scheduleFreeze();
  }

  scheduleFreeze() {
    if (
      !this.props.frozenColumnKey &&
      !this.props.frozenColumnCount &&
      !this.lastFrozenCount &&
      !this.state.freezeMissing
    )
      return;
    cancelAnimationFrame(this.freezeFrame);
    this.freezeFrame = requestAnimationFrame(() => {
      if (this.tableRef.current) {
        const missing = freezePivotColumns(
          this.tableRef.current,
          this.props.frozenColumnCount || 0,
          this.props.frozenColumnKey,
        );
        this.lastFrozenCount = this.props.frozenColumnKey
          ? 1
          : this.props.frozenColumnCount || 0;
        if (Boolean(this.state.freezeMissing) !== missing)
          this.setState({ freezeMissing: missing });
      }
    });
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.freezeFrame);
    this.sortCache.clear();
  }

  render() {
    if (this.cachedProps !== this.props) {
      this.sortCache.clear();
      // 新查询属性会生成一套新的行键，渲染前同步清空两类排序状态，
      // 避免旧图表的列索引或日期方向作用到新结果上。
      (this.state as TableRendererState).sortingOrder = [];
      (this.state as TableRendererState).activeSortColumn = null;
      (this.state as TableRendererState).rowSortingOrder = [];
      (this.state as TableRendererState).activeSortRowDimension = null;
      this.cachedProps = this.props;
      this.cachedBasePivotSettings = this.getBasePivotSettings();
    }
    const basePivotSettings = this.cachedBasePivotSettings!;
    const {
      colAttrs,
      rowAttrs,
      rowKeys,
      colKeys,
      colTotals,
      rowSubtotalDisplay,
      colSubtotalDisplay,
      allowRenderHtml,
    } = basePivotSettings;

    // Need to account for exclusions to compute the effective row
    // and column keys.
    const visibleRowKeys = this.visibleKeys(
      rowKeys,
      this.state.collapsedRows,
      rowAttrs.length,
      rowSubtotalDisplay,
    );
    const visibleColKeys = this.visibleKeys(
      colKeys,
      this.state.collapsedCols,
      colAttrs.length,
      colSubtotalDisplay,
    );

    const pivotSettings: PivotSettings = {
      visibleRowKeys,
      maxRowVisible: Math.max(...visibleRowKeys.map((k: string[]) => k.length)),
      visibleColKeys,
      maxColVisible: Math.max(...visibleColKeys.map((k: string[]) => k.length)),
      rowAttrSpans: this.calcAttrSpans(visibleRowKeys, rowAttrs.length),
      colAttrSpans: this.calcAttrSpans(visibleColKeys, colAttrs.length),
      allowRenderHtml,
      ...basePivotSettings,
    };

    return (
      <Styles isDashboardEditMode={this.isDashboardEditMode()}>
        {this.state.freezeMissing && (
          <div role="status">
            {t('冻结边界列已隐藏或不存在，当前图表未冻结。请重新选择冻结列。')}
          </div>
        )}
        <table className="pvtTable" role="grid" ref={this.tableRef}>
          <thead>
            {colAttrs.map((c: string, j: number) =>
              this.renderColHeaderRow(c, j, pivotSettings),
            )}
            {rowAttrs.length !== 0 && this.renderRowHeaderRow(pivotSettings)}
          </thead>
          <tbody>
            {visibleRowKeys.map((r: string[], i: number) =>
              this.renderTableRow(r, i, pivotSettings),
            )}
            {colTotals && this.renderTotalsRow(pivotSettings)}
          </tbody>
        </table>
      </Styles>
    );
  }
}

TableRenderer.propTypes = {
  ...PivotData.propTypes,
  tableOptions: PropTypes.object,
  onContextMenu: PropTypes.func,
};
TableRenderer.defaultProps = { ...PivotData.defaultProps, tableOptions: {} };
