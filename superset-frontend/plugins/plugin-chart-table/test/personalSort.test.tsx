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
import type { PersonalChartSort } from '@superset-ui/core';
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
    expect(setDataMask.mock.calls[0][0].ownState.personalSort.field).toBe('sum__num');
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
  expect(setDataMask.mock.calls.some(([mask]) =>
    Object.prototype.hasOwnProperty.call(mask.ownState ?? {}, 'personalSort'),
  )).toBe(false);
  expect(setDataMask.mock.calls.some(([mask]) => mask.ownState?.currentPage === 0)).toBe(false);
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
  expect(setDataMask.mock.calls.some(([mask]) =>
    Object.prototype.hasOwnProperty.call(mask.ownState ?? {}, 'personalSort'),
  )).toBe(false);
  expect(setDataMask.mock.calls.some(([mask]) => mask.ownState?.currentPage === 0)).toBe(false);
});
