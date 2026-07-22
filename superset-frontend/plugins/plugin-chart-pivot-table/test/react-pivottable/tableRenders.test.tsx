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
import { TableRenderer } from '../../src/react-pivottable/TableRenderers';
import type { PivotData } from '../../src/react-pivottable/utilities';

let tableRenderer: TableRenderer;
let mockGetAggregatedData: jest.Mock;
let mockSortAndCacheData: jest.Mock;

const columnIndex = 0;
const visibleColKeys = [['col1'], ['col2']];
const pivotData = {
  subtotals: {
    rowEnabled: true,
    rowPartialOnTop: false,
  },
} as any;
const maxRowIndex = 2;

const mockProps = {
  rows: ['row1'],
  cols: ['col1'],
  data: [],
  aggregatorName: 'Sum',
  vals: ['value'],
  valueFilter: {},
  sorters: {},
  rowOrder: 'key_a_to_z',
  colOrder: 'key_a_to_z',
  tableOptions: {},
  namesMapping: {},
  allowRenderHtml: false,
  onContextMenu: jest.fn(),
  aggregatorsFactory: jest.fn(),
  defaultFormatter: jest.fn(),
  customFormatters: {},
  rowEnabled: true,
  rowPartialOnTop: false,
  colEnabled: false,
  colPartialOnTop: false,
};

beforeEach(() => {
  tableRenderer = new TableRenderer(mockProps);

  mockGetAggregatedData = jest.fn();
  mockSortAndCacheData = jest.fn();

  tableRenderer.getAggregatedData = mockGetAggregatedData;
  tableRenderer.sortAndCacheData = mockSortAndCacheData;

  tableRenderer.cachedBasePivotSettings = {
    pivotData: {
      subtotals: {
        rowEnabled: true,
        rowPartialOnTop: false,
        colEnabled: false,
        colPartialOnTop: false,
      },
    },
    rowKeys: [['A'], ['B'], ['C']],
  } as any;

  tableRenderer.state = {
    sortingOrder: [],
    activeSortColumn: null,
    collapsedRows: {},
    collapsedCols: {},
  } as any;
});

const mockGroups = {
  B: {
    currentVal: 20,
    B1: { currentVal: 15 },
    B2: { currentVal: 5 },
  },
  A: {
    currentVal: 10,
    A1: { currentVal: 8 },
    A2: { currentVal: 2 },
  },
  C: {
    currentVal: 30,
    C1: { currentVal: 25 },
    C2: { currentVal: 5 },
  },
};

const createMockPivotData = (rowData: Record<string, number>) =>
  ({
    rowKeys: Object.keys(rowData).map(key => key.split('.')),
    getAggregator: (rowKey: string[], _colName: string) => ({
      value: () => rowData[rowKey.join('.')],
    }),
  }) as unknown as PivotData;

const createColorPivotSettings = (overrides: Record<string, unknown> = {}) => {
  const makeAggregator = (value: number, isSubtotal = false) => ({
    value: () => value,
    format: (v: number) => String(v),
    isSubtotal,
  });

  return {
    rowAttrs: ['store'],
    colAttrs: ['Metric'],
    rowAttrSpans: [[1]],
    visibleColKeys: [['purchase_cost_rate']],
    pivotData: {
      getAggregator: (rowKey: string[], colKey: string[]) => {
        if (rowKey.length === 0 && colKey.length === 0) {
          return makeAggregator(0.42);
        }
        if (rowKey.length === 0) {
          return makeAggregator(0.41);
        }
        if (colKey.length === 0) {
          return makeAggregator(0.4);
        }
        return makeAggregator(0.39, Boolean(overrides.isSubtotal));
      },
    },
    rowTotals: true,
    rowSubtotalDisplay: {
      enabled: false,
      displayOnTop: false,
      hideOnExpand: false,
    },
    arrowExpanded: null,
    arrowCollapsed: null,
    cellCallbacks: { StoreA: { purchase_cost_rate: jest.fn() } },
    rowTotalCallbacks: { StoreA: jest.fn() },
    colTotalCallbacks: { purchase_cost_rate: jest.fn() },
    grandTotalCallback: jest.fn(),
    namesMapping: {},
    allowRenderHtml: false,
    ...overrides,
  } as any;
};

const colorFormatterProps = {
  ...mockProps,
  tableOptions: {
    cellColorFormatters: {
      Metric: [
        {
          column: 'purchase_cost_rate',
          getColorFromValue: (value: unknown) =>
            typeof value === 'number' && value > 0.35 ? '#7f1d1d' : undefined,
        },
      ],
    },
  },
};

test('applies conditional formatting colors to pivot totals and subtotal cells', () => {
  tableRenderer = new TableRenderer(colorFormatterProps);
  const pivotSettings = createColorPivotSettings();

  const row = tableRenderer.renderTableRow(['StoreA'], 0, pivotSettings) as any;
  const rowTotalCell = row.props.children.at(-1);
  expect(rowTotalCell.props.className).toBe('pvtTotal');
  expect(rowTotalCell.props.style).toEqual(
    expect.objectContaining({ backgroundColor: '#7f1d1d' }),
  );

  const totalsRow = tableRenderer.renderTotalsRow(pivotSettings) as any;
  const totalValueCell = totalsRow.props.children[1];
  expect(totalValueCell.props.className).toBe('pvtTotal pvtRowTotal');
  expect(totalValueCell.props.style).toEqual(
    expect.objectContaining({ backgroundColor: '#7f1d1d' }),
  );

  const grandTotalCell = totalsRow.props.children.at(-1);
  expect(grandTotalCell.props.className).toBe('pvtGrandTotal pvtRowTotal');
  expect(grandTotalCell.props.style).toEqual(
    expect.objectContaining({ backgroundColor: '#7f1d1d' }),
  );

  const subtotalRow = tableRenderer.renderTableRow(
    ['StoreA'],
    0,
    createColorPivotSettings({ isSubtotal: true }),
  ) as any;
  const subtotalValueCell = subtotalRow.props.children[2];
  expect(subtotalValueCell.props.className).toBe('pvtVal');
  expect(subtotalValueCell.props.style).toEqual(
    expect.objectContaining({
      backgroundColor: '#7f1d1d',
      fontWeight: 'bold',
    }),
  );
});

test('marks every cell in the selected leaf row without selecting adjacent rows', () => {
  tableRenderer = new TableRenderer({
    ...mockProps,
    rows: ['delivery_date', 'lt'],
    tableOptions: {
      highlightedHeaderCells: { lt: ['LT-A'] },
    },
  });
  const pivotSettings = createColorPivotSettings({
    rowAttrs: ['delivery_date', 'lt'],
    rowAttrSpans: [
      [2, 1],
      [-1, 1],
    ],
  });

  const selectedRow = tableRenderer.renderTableRow(
    ['2026-04-01', 'LT-A'],
    0,
    pivotSettings,
  ) as any;
  const adjacentRow = tableRenderer.renderTableRow(
    ['2026-04-01', 'LT-B'],
    1,
    pivotSettings,
  ) as any;

  expect(selectedRow.props.className).toBe('pvtRowSelected');
  const [groupCell, leafCell, , valueCell, totalCell] =
    selectedRow.props.children;
  expect(groupCell.props.rowSpan).toBe(2);
  expect(groupCell.props.className).not.toContain('pvtRowSelectedCell');
  expect(leafCell.props.className).toContain('pvtRowSelectedCell');
  expect(valueCell.props.className).toContain('pvtRowSelectedCell');
  expect(totalCell.props.className).toContain('pvtRowSelectedCell');
  expect(adjacentRow.props.className).toBeUndefined();

  const partialRenderer = new TableRenderer({
    ...mockProps,
    rows: ['delivery_date', 'lt'],
    tableOptions: {
      highlightedHeaderCells: { delivery_date: ['2026-04-01'] },
    },
  });
  const partialRow = partialRenderer.renderTableRow(
    ['2026-04-01'],
    0,
    createColorPivotSettings({
      rowAttrs: ['delivery_date', 'lt'],
      rowAttrSpans: [[1]],
    }),
  ) as any;
  expect(partialRow.props.className).toBeUndefined();
});

test('does not highlight rows for column, empty, or malformed selections', () => {
  const row = ['2026-04-01', 'LT-A'];
  const pivotSettings = createColorPivotSettings({
    rowAttrs: ['delivery_date', 'lt'],
    rowAttrSpans: [[1, 1]],
  });

  for (const highlightedHeaderCells of [
    { Metric: ['purchase_cost_rate'] },
    {},
    { lt: 'LT-A' } as any,
  ]) {
    tableRenderer = new TableRenderer({
      ...mockProps,
      rows: ['delivery_date', 'lt'],
      tableOptions: { highlightedHeaderCells },
    });
    const renderedRow = tableRenderer.renderTableRow(
      row,
      0,
      pivotSettings,
    ) as any;
    expect(renderedRow.props.className).toBeUndefined();
  }
});
test('sorts the first row dimension descending first without breaking child groups', () => {
  const rowKeys = [
    ['2026-07-16', 'LT-B'],
    ['2026-07-16', 'LT-A'],
    ['2026-07-15', 'LT-C'],
  ];
  const pivotSettings = {
    rowAttrs: ['delivery_date', 'lt'],
    colAttrs: [],
    rowKeys,
    rowSubtotalDisplay: {
      enabled: false,
      displayOnTop: false,
      hideOnExpand: false,
    },
    maxRowVisible: 2,
    arrowExpanded: null,
    arrowCollapsed: null,
    pivotData: {},
    namesMapping: {
      delivery_date: '配送日期',
      lt: 'LT',
    },
    allowRenderHtml: false,
  } as any;
  tableRenderer.cachedBasePivotSettings = pivotSettings;
  tableRenderer.setState = jest.fn(updater => {
    const nextState =
      typeof updater === 'function'
        ? updater(tableRenderer.state, tableRenderer.props)
        : updater;
    tableRenderer.state = { ...tableRenderer.state, ...nextState };
  });

  const rowHeader = tableRenderer.renderRowHeaderRow(pivotSettings) as any;
  const [rowAttributeHeaders] = rowHeader.props.children;
  const dateHeader = rowAttributeHeaders[0];

  expect(Array.isArray(dateHeader.props.children)).toBe(true);
  const sortControl = dateHeader.props.children[1];
  expect(sortControl.props['aria-label']).toBe('Sort 配送日期');

  const stopPropagation = jest.fn();
  sortControl.props.onClick({ stopPropagation });

  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(tableRenderer.cachedBasePivotSettings?.rowKeys).toEqual([
    ['2026-07-16', 'LT-B'],
    ['2026-07-16', 'LT-A'],
    ['2026-07-15', 'LT-C'],
  ]);

  const sortedHeader = tableRenderer.renderRowHeaderRow(pivotSettings) as any;
  const [sortedRowAttributeHeaders] = sortedHeader.props.children;
  const activeSortControl = sortedRowAttributeHeaders[0].props.children[1];
  expect(activeSortControl.props['aria-label']).toBe(
    'Sorted by 配送日期 descending',
  );

  activeSortControl.props.onClick({ stopPropagation: jest.fn() });

  expect(tableRenderer.cachedBasePivotSettings?.rowKeys).toEqual([
    ['2026-07-15', 'LT-C'],
    ['2026-07-16', 'LT-B'],
    ['2026-07-16', 'LT-A'],
  ]);
});

test('should set initial ascending sort when no active sort column', () => {
  mockGetAggregatedData.mockReturnValue({
    A: { currentVal: 30 },
    B: { currentVal: 10 },
    C: { currentVal: 20 },
  });

  const setStateMock = jest.fn();
  tableRenderer.setState = setStateMock;

  tableRenderer.sortData(columnIndex, visibleColKeys, pivotData, maxRowIndex);

  expect(setStateMock).toHaveBeenCalled();

  const [stateUpdater] = setStateMock.mock.calls[0];

  expect(typeof stateUpdater).toBe('function');

  const previousState = {
    sortingOrder: [],
    activeSortColumn: 0,
  };

  const newState = stateUpdater(previousState);

  expect(newState.sortingOrder[columnIndex]).toBe('asc');
  expect(newState.activeSortColumn).toBe(columnIndex);

  expect(mockGetAggregatedData).toHaveBeenCalledWith(
    pivotData,
    visibleColKeys[columnIndex],
    false,
  );

  expect(mockSortAndCacheData).toHaveBeenCalledWith(
    { A: { currentVal: 30 }, B: { currentVal: 10 }, C: { currentVal: 20 } },
    'asc',
    true,
    false,
    maxRowIndex,
  );
});

test('should toggle from asc to desc when clicking same column', () => {
  mockGetAggregatedData.mockReturnValue({
    A: { currentVal: 30 },
    B: { currentVal: 10 },
    C: { currentVal: 20 },
  });
  const setStateMock = jest.fn(stateUpdater => {
    if (typeof stateUpdater === 'function') {
      const newState = stateUpdater({
        sortingOrder: ['asc' as never],
        activeSortColumn: 0,
      });

      tableRenderer.state = {
        ...tableRenderer.state,
        ...newState,
      };
    }
  });
  tableRenderer.setState = setStateMock;

  tableRenderer.sortData(columnIndex, visibleColKeys, pivotData, maxRowIndex);

  expect(mockSortAndCacheData).toHaveBeenCalledWith(
    { A: { currentVal: 30 }, B: { currentVal: 10 }, C: { currentVal: 20 } },
    'desc',
    true,
    false,
    maxRowIndex,
  );
});

test('should check second call in sequence', () => {
  mockGetAggregatedData.mockReturnValue({
    A: { currentVal: 30 },
    B: { currentVal: 10 },
    C: { currentVal: 20 },
  });

  mockSortAndCacheData.mockClear();

  const setStateMock = jest.fn(stateUpdater => {
    if (typeof stateUpdater === 'function') {
      const newState = stateUpdater(tableRenderer.state);
      tableRenderer.state = {
        ...tableRenderer.state,
        ...newState,
      };
    }
  });
  tableRenderer.setState = setStateMock;

  tableRenderer.state = {
    sortingOrder: [],
    activeSortColumn: 0,
    collapsedRows: {},
    collapsedCols: {},
  } as any;
  tableRenderer.sortData(columnIndex, visibleColKeys, pivotData, maxRowIndex);

  tableRenderer.state = {
    sortingOrder: ['asc' as never],
    activeSortColumn: 0 as any,
    collapsedRows: {},
    collapsedCols: {},
  } as any;
  tableRenderer.sortData(columnIndex, visibleColKeys, pivotData, maxRowIndex);

  expect(mockSortAndCacheData).toHaveBeenCalledTimes(2);

  expect(mockSortAndCacheData.mock.calls[0]).toEqual([
    { A: { currentVal: 30 }, B: { currentVal: 10 }, C: { currentVal: 20 } },
    'asc',
    true,
    false,
    maxRowIndex,
  ]);

  expect(mockSortAndCacheData.mock.calls[1]).toEqual([
    { A: { currentVal: 30 }, B: { currentVal: 10 }, C: { currentVal: 20 } },
    'desc',
    true,
    false,
    maxRowIndex,
  ]);
});

test('should sort hierarchical data in descending order', () => {
  tableRenderer = new TableRenderer(mockProps);
  const groups = {
    A: {
      currentVal: 30,
      A1: { currentVal: 13 },
      A2: { currentVal: 17 },
    },
    B: {
      currentVal: 10,
      B1: { currentVal: 7 },
      B2: { currentVal: 3 },
    },

    C: {
      currentVal: 18,
      C1: { currentVal: 7 },
      C2: { currentVal: 11 },
    },
  };

  const result = tableRenderer.sortAndCacheData(groups, 'desc', true, false, 2);

  expect(result).toBeDefined();

  expect(Array.isArray(result)).toBe(true);

  expect(result).toEqual([
    ['A', 'A2'],
    ['A', 'A1'],
    ['A'],
    ['C', 'C2'],
    ['C', 'C1'],
    ['C'],
    ['B', 'B1'],
    ['B', 'B2'],
    ['B'],
  ]);
});

test('should sort hierarchical data in ascending order', () => {
  tableRenderer = new TableRenderer(mockProps);
  const groups = {
    A: {
      currentVal: 30,
      A1: { currentVal: 13 },
      A2: { currentVal: 17 },
    },
    B: {
      currentVal: 10,
      B1: { currentVal: 7 },
      B2: { currentVal: 3 },
    },

    C: {
      currentVal: 18,
      C1: { currentVal: 7 },
      C2: { currentVal: 11 },
    },
  };

  const result = tableRenderer.sortAndCacheData(groups, 'asc', true, false, 2);

  expect(result).toBeDefined();

  expect(Array.isArray(result)).toBe(true);

  expect(result).toEqual([
    ['B', 'B2'],
    ['B', 'B1'],
    ['B'],
    ['C', 'C1'],
    ['C', 'C2'],
    ['C'],
    ['A', 'A1'],
    ['A', 'A2'],
    ['A'],
  ]);
});

test('should calculate groups from pivot data', () => {
  tableRenderer = new TableRenderer(mockProps);
  const mockAggregator = (value: number) => ({
    value: () => value,
    format: jest.fn(),
    isSubtotal: false,
  });

  const mockPivotData = {
    rowKeys: [['A'], ['B'], ['C']],
    getAggregator: jest
      .fn()
      .mockReturnValueOnce(mockAggregator(30))
      .mockReturnValueOnce(mockAggregator(10))
      .mockReturnValueOnce(mockAggregator(20)),
  };

  const result = tableRenderer.getAggregatedData(
    mockPivotData as any,
    ['col1'],
    false,
  );

  expect(result).toEqual({
    A: { currentVal: 30 },
    B: { currentVal: 10 },
    C: { currentVal: 20 },
  });
});

test('should sort groups and convert to array in ascending order', () => {
  tableRenderer = new TableRenderer(mockProps);
  const result = tableRenderer.sortAndCacheData(
    mockGroups,
    'asc',
    true,
    false,
    2,
  );

  expect(result).toEqual([
    ['A', 'A2'],
    ['A', 'A1'],
    ['A'],
    ['B', 'B2'],
    ['B', 'B1'],
    ['B'],
    ['C', 'C2'],
    ['C', 'C1'],
    ['C'],
  ]);
});

test('should sort groups and convert to array in descending order', () => {
  tableRenderer = new TableRenderer(mockProps);
  const result = tableRenderer.sortAndCacheData(
    mockGroups,
    'desc',
    true,
    false,
    2,
  );

  expect(result).toEqual([
    ['C', 'C1'],
    ['C', 'C2'],
    ['C'],
    ['B', 'B1'],
    ['B', 'B2'],
    ['B'],
    ['A', 'A1'],
    ['A', 'A2'],
    ['A'],
  ]);
});

test('should handle rowPartialOnTop = true configuration', () => {
  tableRenderer = new TableRenderer(mockProps);
  const result = tableRenderer.sortAndCacheData(
    mockGroups,
    'asc',
    true,
    true,
    2,
  );

  expect(result).toEqual([
    ['A'],
    ['A', 'A2'],
    ['A', 'A1'],
    ['B'],
    ['B', 'B2'],
    ['B', 'B1'],
    ['C'],
    ['C', 'C2'],
    ['C', 'C1'],
  ]);
});

test('should handle rowEnabled = false and rowPartialOnTop = false, sorting asc', () => {
  tableRenderer = new TableRenderer(mockProps);

  const result = tableRenderer.sortAndCacheData(
    mockGroups,
    'asc',
    false,
    false,
    2,
  );

  expect(result).toEqual([
    ['A', 'A2'],
    ['A', 'A1'],
    ['B', 'B2'],
    ['B', 'B1'],
    ['C', 'C2'],
    ['C', 'C1'],
  ]);
});

test('should handle rowEnabled = false and rowPartialOnTop = false , sorting desc', () => {
  tableRenderer = new TableRenderer(mockProps);

  const result = tableRenderer.sortAndCacheData(
    mockGroups,
    'desc',
    false,
    false,
    2,
  );

  expect(result).toEqual([
    ['C', 'C1'],
    ['C', 'C2'],
    ['B', 'B1'],
    ['B', 'B2'],
    ['A', 'A1'],
    ['A', 'A2'],
  ]);
});

test('create hierarchical structure with subtotal at bottom', () => {
  tableRenderer = new TableRenderer(mockProps);
  const rowData = {
    'A.A1': 10,
    'A.A2': 20,
    A: 30,
    'B.B1': 30,
    'B.B2': 40,
    B: 70,
    'C.C1': 50,
    'C.C2': 60,
    C: 110,
  };

  const pivotData = createMockPivotData(rowData);
  const result = tableRenderer.getAggregatedData(pivotData, ['Col1'], false);

  expect(result).toEqual({
    A: {
      A1: { currentVal: 10 },
      A2: { currentVal: 20 },
      currentVal: 30,
    },
    B: {
      B1: { currentVal: 30 },
      B2: { currentVal: 40 },
      currentVal: 70,
    },
    C: {
      C1: { currentVal: 50 },
      C2: { currentVal: 60 },
      currentVal: 110,
    },
  });
});

test('create hierarchical structure with subtotal at top', () => {
  tableRenderer = new TableRenderer(mockProps);
  const rowData = {
    A: 30,
    'A.A1': 10,
    'A.A2': 20,
    B: 70,
    'B.B1': 30,
    'B.B2': 40,
    C: 110,
    'C.C1': 50,
    'C.C2': 60,
  };

  const pivotData = createMockPivotData(rowData);
  const result = tableRenderer.getAggregatedData(pivotData, ['Col1'], true);

  expect(result).toEqual({
    A: {
      A1: { currentVal: 10 },
      A2: { currentVal: 20 },
      currentVal: 30,
    },
    B: {
      B1: { currentVal: 30 },
      B2: { currentVal: 40 },
      currentVal: 70,
    },
    C: {
      C1: { currentVal: 50 },
      C2: { currentVal: 60 },
      currentVal: 110,
    },
  });
});

test('values ​​from the 3rd level of the hierarchy with a subtotal at the bottom', () => {
  tableRenderer = new TableRenderer(mockProps);
  const rowData = {
    'A.A1.A11': 10,
    'A.A1.A12': 20,
    'A.A1': 30,
    'A.A2': 30,
    'A.A3': 50,
    A: 110,
  };

  const pivotData = createMockPivotData(rowData);
  const result = tableRenderer.getAggregatedData(pivotData, ['Col1'], false);

  expect(result).toEqual({
    A: {
      A1: {
        A11: { currentVal: 10 },
        A12: { currentVal: 20 },
        currentVal: 30,
      },
      A2: { currentVal: 30 },
      A3: { currentVal: 50 },
      currentVal: 110,
    },
  });
});

test('values ​​from the 3rd level of the hierarchy with a subtotal at the top', () => {
  tableRenderer = new TableRenderer(mockProps);
  const rowData = {
    A: 110,
    'A.A1': 30,
    'A.A1.A11': 10,
    'A.A1.A12': 20,
    'A.A2': 30,
    'A.A3': 50,
  };

  const pivotData = createMockPivotData(rowData);
  const result = tableRenderer.getAggregatedData(pivotData, ['Col1'], true);

  expect(result).toEqual({
    A: {
      A1: {
        A11: { currentVal: 10 },
        A12: { currentVal: 20 },
        currentVal: 30,
      },
      A2: { currentVal: 30 },
      A3: { currentVal: 50 },
      currentVal: 110,
    },
  });
});
