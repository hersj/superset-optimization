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
import { cloneDeep } from 'lodash';
import { fireEvent, render, waitFor } from '@superset-ui/core/spec';
import {
  ComparisonType,
  QueryMode,
  type PersonalChartSort,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import buildQuery from '../src/buildQuery';
import TableChart from '../src/TableChart';
import transformProps from '../src/transformProps';
import testData from './testData';

const metricSort: PersonalChartSort = {
  mode: 'metric',
  field: 'sum__num',
  direction: 'desc',
};

test('table transform carries the personal criterion and preserves private own state', () => {
  const source = cloneDeep(testData.advanced);
  source.rawFormData.personal_sort = metricSort;
  source.ownState = { searchText: 'Michael', pageSize: 25 };
  const result = transformProps(source);
  expect(result.personalSort).toEqual(metricSort);
  expect(result.sortFields.sum__num).toEqual({
    mode: 'metric',
    field: 'sum__num',
  });
  expect(result.ownState).toEqual(source.ownState);
});

test.each([false, true])(
  'table header emits the shared real-field preference with server pagination=%s',
  async serverPagination => {
    const source = cloneDeep(testData.advanced);
    const setDataMask = jest.fn();
    source.hooks.setDataMask = setDataMask;
    source.ownState = { pageSize: 25, searchText: 'retained' };
    source.rawFormData.server_pagination = serverPagination;
    source.rawFormData.personal_sort = null;
    const { container } = render(
      <TableChart {...transformProps(source)} sticky={false} />,
    );
    const header = container.querySelector<HTMLElement>(
      'th[data-column-name="1"]',
    )!;
    expect(header).not.toBeNull();
    expect(header).toHaveTextContent('Sum of Num');
    fireEvent.click(header);
    await waitFor(() =>
      expect(setDataMask).toHaveBeenCalledWith({
        ownState: expect.objectContaining({
          pageSize: 25,
          searchText: 'retained',
          currentPage: 0,
          personalSort: expect.objectContaining({
            field: 'sum__num',
            mode: 'metric',
          }),
        }),
      }),
    );
    setDataMask.mockClear();
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(setDataMask).toHaveBeenCalledTimes(1);
    expect(setDataMask.mock.calls[0][0].ownState.personalSort.field).toBe(
      'sum__num',
    );
  },
);

test('personal table sorting does not reorder the server-selected candidate result locally', async () => {
  const source = cloneDeep(testData.advanced);
  source.rawFormData.personal_sort = metricSort;
  source.queriesData[0].data.reverse();
  const props = transformProps(source);
  const setDataMask = jest.fn();
  const { container, rerender } = render(
    <TableChart {...props} setDataMask={setDataMask} sticky={false} />,
  );
  const names = () =>
    [
      ...container.querySelectorAll('tbody td[aria-labelledby="header-name"]'),
    ].map(cell => cell.textContent);
  expect(names()).toEqual(['Maria', 'Joe', 'Michael']);
  rerender(
    <TableChart
      {...props}
      columns={[...props.columns]}
      data={[...props.data]}
      setDataMask={setDataMask}
      sticky={false}
    />,
  );
  expect(names()).toEqual(['Maria', 'Joe', 'Michael']);
  expect(
    setDataMask.mock.calls.some(([mask]) =>
      Object.prototype.hasOwnProperty.call(mask.ownState ?? {}, 'personalSort'),
    ),
  ).toBe(false);
  expect(
    setDataMask.mock.calls.some(([mask]) => mask.ownState?.currentPage === 0),
  ).toBe(false);
});

test('client table restores page and page length through automatic refresh', () => {
  const source = cloneDeep(testData.advanced);
  source.rawFormData.personal_sort = metricSort;
  source.ownState = { currentPage: 1, pageSize: 1 };
  const props = transformProps(source);
  const setDataMask = jest.fn();
  const { container, rerender } = render(
    <TableChart {...props} setDataMask={setDataMask} sticky={false} />,
  );
  const names = () =>
    [
      ...container.querySelectorAll('tbody td[aria-labelledby="header-name"]'),
    ].map(cell => cell.textContent);
  expect(names()).toEqual(['Joe']);
  rerender(
    <TableChart
      {...props}
      data={[...props.data]}
      setDataMask={setDataMask}
      sticky={false}
    />,
  );
  expect(names()).toEqual(['Joe']);
  rerender(
    <TableChart
      {...props}
      data={props.data.slice(0, 1)}
      setDataMask={setDataMask}
      sticky={false}
    />,
  );
  expect(names()).toEqual(['Michael']);
  expect(
    setDataMask.mock.calls.some(([mask]) =>
      Object.prototype.hasOwnProperty.call(mask.ownState ?? {}, 'personalSort'),
    ),
  ).toBe(false);
  expect(
    setDataMask.mock.calls.some(([mask]) => mask.ownState?.currentPage === 0),
  ).toBe(false);
});

test.each([
  [false, 25],
  [true, 2],
  [true, 200],
] as const)(
  'time-comparison table replays the full candidate ranking before rendering, server pagination=%s, page size=%s',
  (serverPagination, pageSize) => {
    const source = cloneDeep(testData.advanced);
    source.rawFormData = {
      ...source.rawFormData,
      query_mode: QueryMode.Aggregate,
      groupby: ['name'],
      percent_metrics: [],
      server_pagination: serverPagination,
      server_page_length: 25,
      time_compare: ['1 day ago'],
      comparison_type: ComparisonType.Values,
      personal_sort: { ...metricSort, direction: 'asc' },
    };
    const currentPage = pageSize === 2 ? 1 : 0;
    source.ownState = { currentPage, pageSize };
    const query = buildQuery(source.rawFormData, { ownState: source.ownState })
      .queries[0];
    expect(query.time_offsets).toEqual(['1 day ago']);
    expect(query.personal_sort).toEqual({ ...metricSort, direction: 'asc' });
    expect(query.row_offset ?? 0).toBe(
      serverPagination ? currentPage * pageSize : 0,
    );
    if (serverPagination) expect(query.row_limit).toBe(pageSize);
    const rows = [
      { name: 'ACA', sum__num: 9, 'sum__num__1 day ago': 900 },
      { name: 'TL', sum__num: 74, 'sum__num__1 day ago': 1 },
      { name: '售后A60黑', sum__num: 5, 'sum__num__1 day ago': 500 },
      { name: '售后Q50黑', sum__num: 157, 'sum__num__1 day ago': 2 },
      { name: '售后A60三色', sum__num: 38, 'sum__num__1 day ago': 380 },
      { name: '售后Q50三色', sum__num: 10, 'sum__num__1 day ago': 3 },
    ];
    const fullOrder = [
      '售后A60黑',
      'ACA',
      '售后Q50三色',
      '售后A60三色',
      'TL',
      '售后Q50黑',
    ];
    const expected = pageSize === 2 ? fullOrder.slice(2, 4) : fullOrder;
    const pageRows = rows.filter(row => expected.includes(row.name));
    source.queriesData = [
      {
        ...source.queriesData[0],
        data: pageRows,
        colnames: ['name', 'sum__num', 'sum__num__1 day ago'],
        coltypes: [
          GenericDataType.String,
          GenericDataType.Numeric,
          GenericDataType.Numeric,
        ],
        personal_sort_order: {
          columns: ['name'],
          values: expected.map(name => [name]),
        },
      },
      {
        ...source.queriesData[0],
        data: [{ rowcount: 6 }],
        colnames: ['rowcount'],
        coltypes: [GenericDataType.Numeric],
      },
    ];
    const transformed = transformProps(source);
    expect(transformed.data.map(row => row.name)).toEqual(expected);
    expect(transformed.data.map(row => row['Main sum__num'])).toEqual(
      expected.map(name => rows.find(row => row.name === name)!.sum__num),
    );
    expect(transformed.data.map(row => row['# sum__num'])).toEqual(
      expected.map(
        name => rows.find(row => row.name === name)!['sum__num__1 day ago'],
      ),
    );
    expect(source.queriesData[0].data).toEqual(pageRows);
    const { container, rerender } = render(
      <TableChart {...transformed} sticky={false} />,
    );
    const names = () =>
      [
        ...container.querySelectorAll(
          'tbody td[aria-labelledby="header-name"]',
        ),
      ].map(cell => cell.textContent);
    expect(names()).toEqual(expected);
    rerender(
      <TableChart {...transformProps(cloneDeep(source))} sticky={false} />,
    );
    expect(names()).toEqual(expected);
  },
);

test('table candidate ranking uses every raw dimension, keeps null distinct and leaves unmatched history stable', () => {
  const source = cloneDeep(testData.advanced);
  source.rawFormData.personal_sort = metricSort;
  const rows = [
    { name: 'A', shop: 'null', sum__num: 1 },
    { name: 'A', shop: null, sum__num: 2 },
    { name: 'A', shop: 'US', sum__num: 3 },
    { name: 'history-only', shop: 'US', sum__num: null },
  ];
  source.queriesData[0].data = rows;
  source.queriesData[0].personal_sort_order = {
    columns: ['name', 'shop'],
    values: [
      ['A', 'US'],
      ['A', null],
      ['A', 'null'],
    ],
  };
  expect(transformProps(source).data.map(row => row.sum__num)).toEqual([
    3,
    2,
    1,
    null,
  ]);
  source.rawFormData.personal_sort = null;
  expect(transformProps(source).data.map(row => row.sum__num)).toEqual([
    1,
    2,
    3,
    null,
  ]);
});
