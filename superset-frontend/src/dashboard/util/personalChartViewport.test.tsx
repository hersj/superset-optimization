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
import { createRef } from 'react';
import { act, fireEvent, render } from 'spec/helpers/testing-library';
import {
  readPersonalChartViewport,
  updatePersonalChartViewport,
  usePersonalChartViewport,
} from './personalChartViewport';

beforeEach(() => localStorage.clear());

test('viewport is isolated by user, dashboard, chart and active sort', () => {
  updatePersonalChartViewport('u', 'd', 'c', 'null', {
    positions: { table: { top: 80, left: 20 } },
    currentPage: 3,
    pageSize: 25,
  });
  expect(readPersonalChartViewport('v', 'd', 'c', 'null')).toBeUndefined();
  expect(readPersonalChartViewport('u', 'e', 'c', 'null')).toBeUndefined();
  expect(readPersonalChartViewport('u', 'd', 'x', 'null')).toBeUndefined();
  expect(readPersonalChartViewport('u', 'd', 'c', 'metric')).toBeUndefined();
  updatePersonalChartViewport('u', 'd', 'c', 'null', {
    positions: { pivot: { top: 30, left: 5 } },
    currentPage: 4,
  });
  expect(readPersonalChartViewport('u', 'd', 'c', 'null')).toEqual({
    positions: { table: { top: 80, left: 20 }, pivot: { top: 30, left: 5 } },
    currentPage: 4,
    pageSize: 25,
  });
});

test('corrupt viewport storage degrades without breaking charts', () => {
  updatePersonalChartViewport('u', 'd', 'c', 'null', { currentPage: 2 });
  const key = localStorage.key(0)!;
  localStorage.setItem(key, '{broken');
  expect(readPersonalChartViewport('u', 'd', 'c', 'null')).toBeUndefined();
  updatePersonalChartViewport('u', 'd', 'c', 'new', { pageSize: 50 });
  expect(readPersonalChartViewport('u', 'd', 'c', 'new')).toEqual({
    positions: {},
    pageSize: 50,
  });
});

const Viewport = ({ ready = true, signature = 'null', version = 1 }) => {
  const ref = createRef<HTMLDivElement>();
  usePersonalChartViewport(ref, 'u', 'd', 'c', signature, ready);
  return (
    <div ref={ref}>
      <div key={version} data-test="body" data-personal-sort-scroll="table" />
    </div>
  );
};

test('viewport restores refreshed DOM only after success and saves real browsing', async () => {
  updatePersonalChartViewport('u', 'd', 'c', 'null', {
    positions: { table: { top: 90, left: 15 } },
  });
  const { getByTestId, rerender } = render(<Viewport ready={false} />);
  expect(getByTestId('body').scrollTop).toBe(0);
  rerender(<Viewport />);
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(getByTestId('body').scrollTop).toBe(90);
  getByTestId('body').scrollTop = 120;
  fireEvent.scroll(getByTestId('body'));
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(
    readPersonalChartViewport('u', 'd', 'c', 'null')?.positions.table.top,
  ).toBe(120);
  rerender(<Viewport version={2} />);
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(getByTestId('body').scrollTop).toBe(120);
  rerender(<Viewport signature="changed" version={2} />);
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(getByTestId('body').scrollTop).toBe(0);
  expect(
    readPersonalChartViewport('u', 'd', 'c', 'changed')?.currentPage,
  ).toBeUndefined();
});

test('initial sort hydration preserves the saved viewport', async () => {
  updatePersonalChartViewport('u', 'd', 'c', 'saved-sort', {
    positions: { table: { top: 75, left: 10 } },
  });
  const { getByTestId, rerender } = render(
    <Viewport ready={false} signature="null" />,
  );
  rerender(<Viewport signature="saved-sort" />);
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(getByTestId('body').scrollTop).toBe(75);
});

test('refresh loading retains browsing on existing nodes but does not initialize replacement nodes', async () => {
  updatePersonalChartViewport('u', 'd', 'c', 'null', {
    positions: { table: { top: 90, left: 15 } },
  });
  const { getByTestId, rerender } = render(<Viewport />);
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  rerender(<Viewport ready={false} />);
  getByTestId('body').scrollTop = 140;
  fireEvent.scroll(getByTestId('body'));
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(
    readPersonalChartViewport('u', 'd', 'c', 'null')?.positions.table.top,
  ).toBe(140);
  rerender(<Viewport />);
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(getByTestId('body').scrollTop).toBe(140);
  rerender(<Viewport ready={false} version={2} />);
  expect(getByTestId('body').scrollTop).toBe(0);
  fireEvent.scroll(getByTestId('body'));
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(
    readPersonalChartViewport('u', 'd', 'c', 'null')?.positions.table.top,
  ).toBe(140);
  rerender(<Viewport version={2} />);
  await act(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(getByTestId('body').scrollTop).toBe(140);
});

const apiSortSignature = JSON.stringify({ direction: 'asc', field: 'quantity', mode: 'metric' });
const clientSortSignature = JSON.stringify({ mode: 'metric', field: 'quantity', direction: 'asc' });

test('legacy raw sort signatures preserve viewport and pagination across JSON key order changes', () => {
  updatePersonalChartViewport('u', 'd', 'c', apiSortSignature, {
    positions: { table: { top: 195, left: 40 } }, currentPage: 3, pageSize: 200,
  });
  const key = localStorage.key(0)!;
  const legacy = JSON.parse(localStorage.getItem(key)!);
  localStorage.setItem(key, JSON.stringify({ ...legacy, signature: apiSortSignature }));
  expect(readPersonalChartViewport('u', 'd', 'c', clientSortSignature)).toEqual({
    positions: { table: { top: 195, left: 40 } }, currentPage: 3, pageSize: 200,
  });
  updatePersonalChartViewport('u', 'd', 'c', clientSortSignature, {
    positions: { table: { top: 210, left: 40 } },
  });
  expect(readPersonalChartViewport('u', 'd', 'c', apiSortSignature)).toEqual({
    positions: { table: { top: 210, left: 40 } }, currentPage: 3, pageSize: 200,
  });
});

test('sort hydration, reload and equivalent key reordering retain scroll and page', async () => {
  updatePersonalChartViewport('u', 'd', 'c', apiSortSignature, {
    positions: { table: { top: 195, left: 40 } }, currentPage: 3, pageSize: 200,
  });
  const first = render(<Viewport ready={false} signature="null" />);
  first.rerender(<Viewport signature={clientSortSignature} />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(first.getByTestId('body').scrollTop).toBe(195);
  first.rerender(<Viewport signature={apiSortSignature} />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(first.getByTestId('body').scrollTop).toBe(195);
  expect(readPersonalChartViewport('u', 'd', 'c', clientSortSignature)?.currentPage).toBe(3);
  first.unmount();
  const second = render(<Viewport signature={clientSortSignature} />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(second.getByTestId('body').scrollTop).toBe(195);
  second.rerender(<Viewport signature={JSON.stringify({ mode: 'metric', field: 'quantity', direction: 'desc' })} />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(second.getByTestId('body').scrollTop).toBe(0);
});

test('signature normalization retains array order and value types', () => {
  const original = JSON.stringify({ mode: 'custom', field: 'sku', direction: 'asc', customOrder: ['A', 'B'], columnValues: ['US', 'DE'] });
  updatePersonalChartViewport('u', 'd', 'c', original, { currentPage: 2 });
  const reorderedKeys = JSON.stringify({ columnValues: ['US', 'DE'], direction: 'asc', customOrder: ['A', 'B'], field: 'sku', mode: 'custom' });
  expect(readPersonalChartViewport('u', 'd', 'c', reorderedKeys)?.currentPage).toBe(2);
  expect(readPersonalChartViewport('u', 'd', 'c', JSON.stringify({ ...JSON.parse(original), customOrder: ['B', 'A'] }))).toBeUndefined();
  expect(readPersonalChartViewport('u', 'd', 'c', JSON.stringify({ ...JSON.parse(original), columnValues: ['DE', 'US'] }))).toBeUndefined();
  const numericContext = JSON.stringify({ ...JSON.parse(original), columnValues: [1, 'DE'] });
  updatePersonalChartViewport('u', 'd', 'c', numericContext, { currentPage: 4 });
  expect(readPersonalChartViewport('u', 'd', 'c', numericContext)?.currentPage).toBe(4);
  expect(readPersonalChartViewport('u', 'd', 'c', JSON.stringify({ ...JSON.parse(original), columnValues: ['1', 'DE'] }))).toBeUndefined();
});
