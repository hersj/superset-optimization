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
    positions: { table: { top: 80, left: 20 } }, currentPage: 3, pageSize: 25,
  });
  expect(readPersonalChartViewport('v', 'd', 'c', 'null')).toBeUndefined();
  expect(readPersonalChartViewport('u', 'e', 'c', 'null')).toBeUndefined();
  expect(readPersonalChartViewport('u', 'd', 'x', 'null')).toBeUndefined();
  expect(readPersonalChartViewport('u', 'd', 'c', 'metric')).toBeUndefined();
  updatePersonalChartViewport('u', 'd', 'c', 'null', {
    positions: { pivot: { top: 30, left: 5 } }, currentPage: 4,
  });
  expect(readPersonalChartViewport('u', 'd', 'c', 'null')).toEqual({
    positions: { table: { top: 80, left: 20 }, pivot: { top: 30, left: 5 } },
    currentPage: 4, pageSize: 25,
  });
});

test('corrupt viewport storage degrades without breaking charts', () => {
  updatePersonalChartViewport('u', 'd', 'c', 'null', { currentPage: 2 });
  const key = localStorage.key(0)!;
  localStorage.setItem(key, '{broken');
  expect(readPersonalChartViewport('u', 'd', 'c', 'null')).toBeUndefined();
  updatePersonalChartViewport('u', 'd', 'c', 'new', { pageSize: 50 });
  expect(readPersonalChartViewport('u', 'd', 'c', 'new')).toEqual({ positions: {}, pageSize: 50 });
});

const Viewport = ({ ready = true, signature = 'null', version = 1 }) => {
  const ref = createRef<HTMLDivElement>();
  usePersonalChartViewport(ref, 'u', 'd', 'c', signature, ready);
  return <div ref={ref}><div key={version} data-testid="body" data-personal-sort-scroll="table" /></div>;
};

test('viewport restores refreshed DOM only after success and saves real browsing', async () => {
  updatePersonalChartViewport('u', 'd', 'c', 'null', { positions: { table: { top: 90, left: 15 } } });
  const { getByTestId, rerender } = render(<Viewport ready={false} />);
  expect(getByTestId('body').scrollTop).toBe(0);
  rerender(<Viewport />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(getByTestId('body').scrollTop).toBe(90);
  getByTestId('body').scrollTop = 120;
  fireEvent.scroll(getByTestId('body'));
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(readPersonalChartViewport('u', 'd', 'c', 'null')?.positions.table.top).toBe(120);
  rerender(<Viewport version={2} />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(getByTestId('body').scrollTop).toBe(120);
  rerender(<Viewport signature="changed" version={2} />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(getByTestId('body').scrollTop).toBe(0);
  expect(readPersonalChartViewport('u', 'd', 'c', 'changed')?.currentPage).toBeUndefined();
});


test('initial sort hydration preserves the saved viewport', async () => {
  updatePersonalChartViewport('u', 'd', 'c', 'saved-sort', { positions: { table: { top: 75, left: 10 } } });
  const { getByTestId, rerender } = render(<Viewport ready={false} signature="null" />);
  rerender(<Viewport signature="saved-sort" />);
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(getByTestId('body').scrollTop).toBe(75);
});
