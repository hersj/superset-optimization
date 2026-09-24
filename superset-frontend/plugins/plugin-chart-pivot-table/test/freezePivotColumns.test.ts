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
  freezePivotColumns,
  readPivotFreezeColumns,
  pivotFreezeKey,
} from '../src/react-pivottable/freezePivotColumns';

test('freezes the requested physical columns across merged pivot rows', () => {
  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr><th colspan="2" data-left="0">Dimensions</th><th data-left="180">Metric</th></tr></thead>
    <tbody>
      <tr><th rowspan="2" data-left="0">Date</th><th data-left="90">Store</th><td data-left="180">1</td></tr>
      <tr><th data-left="90">Store 2</th><td data-left="180">2</td></tr>
    </tbody>`;
  table.querySelectorAll<HTMLElement>('[data-left]').forEach(cell => {
    cell.getBoundingClientRect = () =>
      ({ left: Number(cell.dataset.left) }) as DOMRect;
  });

  freezePivotColumns(table, 2);
  expect(
    table.querySelector('thead th')?.getAttribute('data-pivot-frozen'),
  ).toBe('true');
  expect(
    (table.querySelector('tbody tr:nth-child(2) th') as HTMLElement).style.left,
  ).toBe('90px');
  expect(
    table.querySelector('tbody td')?.getAttribute('data-pivot-frozen'),
  ).toBeNull();

  freezePivotColumns(table, 0);
  expect(table.querySelectorAll('[data-pivot-frozen]')).toHaveLength(0);
});

test('does not pin a merged header that crosses the freeze boundary', () => {
  const table = document.createElement('table');
  table.innerHTML =
    '<thead><tr><th colspan="3">Merged</th></tr></thead><tbody><tr><td>A</td><td>B</td><td>C</td></tr></tbody>';
  freezePivotColumns(table, 2);
  expect(
    table.querySelector('thead th')?.getAttribute('data-pivot-frozen'),
  ).toBeNull();
  expect(table.querySelectorAll('tbody [data-pivot-frozen]')).toHaveLength(2);
});

test('named boundary follows reordered columns and fails closed when missing or ambiguous', () => {
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th data-pivot-freeze-key="date">Date</th>
    <th data-pivot-freeze-key="profit">Profit</th><th data-pivot-freeze-key="sales">Sales</th>
    </tr></thead><tbody><tr><td>Date</td><td>2</td><td>3</td></tr></tbody>`;
  expect(freezePivotColumns(table, 9, 'profit')).toBe(false);
  expect(table.querySelectorAll('tbody [data-pivot-frozen]')).toHaveLength(2);
  const row = table.tHead!.rows[0];
  row.appendChild(row.cells[1]);
  expect(freezePivotColumns(table, 9, 'profit')).toBe(false);
  expect(table.querySelectorAll('tbody [data-pivot-frozen]')).toHaveLength(3);
  row.cells[2].remove();
  expect(freezePivotColumns(table, 9, 'profit')).toBe(true);
  expect(table.querySelectorAll('[data-pivot-frozen]')).toHaveLength(0);
  row.cells[1].dataset.pivotFreezeKey = 'date';
  expect(freezePivotColumns(table, 9, 'date')).toBe(true);
  expect(table.querySelectorAll('[data-pivot-frozen]')).toHaveLength(0);
  expect(freezePivotColumns(table, 9, null)).toBe(false);
  expect(table.querySelectorAll('[data-pivot-frozen]')).toHaveLength(0);
});

test('physical header boundaries account for row spans and grouped metrics', () => {
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th rowspan="2" data-pivot-freeze-key="date">Date</th>
    <th colspan="2">Group</th></tr><tr><th data-pivot-freeze-key="sales">Sales</th>
    <th data-pivot-freeze-key="profit">Profit</th></tr></thead>`;
  expect(
    readPivotFreezeColumns(table).map(column => [column.key, column.count]),
  ).toEqual([
    ['date', 1],
    ['sales', 2],
    ['profit', 3],
  ]);
  const first = pivotFreezeKey(['country', '指标'], ['US', 'Sales'], '指标', {
    Sales: 'metric-1',
  });
  expect(first).toBe(
    pivotFreezeKey(['country', 'Metric'], ['US', 'Sales renamed'], 'Metric', {
      'Sales renamed': 'metric-1',
    }),
  );
  expect(first).not.toBe(
    pivotFreezeKey(['country', 'Metric'], ['CA', 'Sales'], 'Metric', {
      Sales: 'metric-1',
    }),
  );
});
