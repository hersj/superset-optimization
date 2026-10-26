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
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { EChartsCoreOption } from 'echarts/core';
import Echart from './Echart';

const mockSetOption = jest.fn();
const mockThemeOverrides: Record<string, unknown> = {};
const mockState = {
  common: { locale: 'en' },
  user: { userId: 1 },
  dashboardState: { isRefreshing: true },
};
const mockChart = {
  dispatchAction: jest.fn(),
  setOption: mockSetOption,
  resize: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  dispose: jest.fn(),
  getOption: jest.fn(),
};

jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

jest.mock('echarts/core', () => ({
  init: jest.fn(() => mockChart),
  registerLocale: jest.fn(),
  use: jest.fn(),
}));

jest.mock('@apache-superset/core/theme', () => {
  const React = require('react');
  const component = React.forwardRef(({ children, ...props }: any, ref: any) =>
    React.createElement('div', { ...props, ref }, children),
  );
  const styledFactory = (...args: any[]) =>
    Array.isArray(args[0]) ? component : () => component;
  const styled = new Proxy(styledFactory, { get: () => styledFactory });
  return {
    styled,
    useTheme: () => ({
      colorText: '#111',
      colorTextSecondary: '#666',
      colorBgContainer: '#fff',
      colorPrimary: '#1677ff',
      colorSplit: '#eee',
      colorBorderSecondary: '#eee',
      colorTextDisabled: '#aaa',
      fontFamily: 'sans-serif',
      echartsOptionsOverrides: mockThemeOverrides,
      echartsOptionsOverridesByChartType: {},
    }),
  };
});

afterEach(() => {
  Object.keys(mockThemeOverrides).forEach(
    key => delete mockThemeOverrides[key],
  );
  mockSetOption.mockReset();
  mockChart.resize.mockReset();
  mockChart.on.mockClear();
  mockChart.off.mockClear();
  mockChart.getOption.mockReset();
  localStorage.clear();
  mockState.user.userId = 1;
});

test('replaces the legend component during a dashboard refresh', async () => {
  render(
    <Echart
      width={800}
      height={400}
      echartOptions={{ legend: { data: ['订购数量'] } } as EChartsCoreOption}
      eventHandlers={{}}
      zrEventHandlers={{}}
      selectedValues={{}}
    />,
  );

  await waitFor(() => expect(mockSetOption).toHaveBeenCalled());

  expect(mockSetOption.mock.calls.at(-1)?.[1]).toMatchObject({
    notMerge: false,
    replaceMerge: ['series', 'legend'],
    lazyUpdate: true,
  });
});

const matrixOptions = {
  dataZoom: [{ id: 'matrix-rows', yAxisIndex: 0, startValue: 0, endValue: 2 }],
};
const matrixChart = (scope = '[73,726,"competitor"]') => (
  <Echart
    width={800}
    height={400}
    echartOptions={{ ...matrixOptions }}
    dataZoomStorageKey={scope}
  />
);

test('retains a resized and panned range on dashboard refresh and remount', async () => {
  const first = render(matrixChart());
  await waitFor(() =>
    expect(mockChart.on).toHaveBeenCalledWith('datazoom', expect.any(Function)),
  );
  const handler = mockChart.on.mock.calls.at(-1)?.[1];
  mockChart.getOption.mockReturnValue({
    dataZoom: [{ id: 'matrix-rows', start: 20, end: 45 }],
  });
  act(() => handler());
  first.rerender(matrixChart());
  expect(mockSetOption.mock.calls.at(-1)?.[0].dataZoom[0]).toMatchObject({
    start: 20,
    end: 45,
    startValue: undefined,
    endValue: undefined,
  });
  first.unmount();
  render(matrixChart());
  await waitFor(() =>
    expect(mockSetOption.mock.calls.at(-1)?.[0].dataZoom[0]).toMatchObject({
      start: 20,
      end: 45,
    }),
  );
  expect(mockChart.off).toHaveBeenCalledWith('datazoom', handler);
});

test('keeps other users and dashboards on their own ranges', async () => {
  localStorage.setItem(
    `echarts__matrix_viewport:${JSON.stringify([1, '[73,726,"competitor"]'])}`,
    JSON.stringify({ start: 20, end: 45 }),
  );
  const view = render(matrixChart('[74,726,"competitor"]'));
  await waitFor(() => expect(mockSetOption).toHaveBeenCalled());
  expect(
    mockSetOption.mock.calls.at(-1)?.[0].dataZoom[0].start,
  ).toBeUndefined();
  mockState.user.userId = 2;
  view.rerender(matrixChart());
  expect(
    mockSetOption.mock.calls.at(-1)?.[0].dataZoom[0].start,
  ).toBeUndefined();
});

test('restored full range expands 100 SKU rows and retains scroll on refresh and remount', async () => {
  const scope = '[87,839,"kk_sku"]';
  const key = `echarts__matrix_viewport:${JSON.stringify([1, scope])}`;
  localStorage.setItem(key, JSON.stringify({ start: 0, end: 100 }));
  const options = {
    yAxis: { data: Array.from({ length: 100 }, (_, i) => `SKU${i}`) },
    grid: { top: 38, bottom: 42 },
    dataZoom: [{ id: 'matrix-rows', yAxisIndex: 0, start: 97, end: 100 }],
  };
  const chart = () => (
    <Echart
      refs={{}}
      width={800}
      height={300}
      minCategoryHeight={84}
      echartOptions={{ ...options }}
      dataZoomStorageKey={scope}
    />
  );
  const first = render(chart());
  await waitFor(() =>
    expect(mockChart.resize).toHaveBeenCalledWith({ width: 784, height: 8480 }),
  );
  const region = screen.getByRole('region', { name: '图表滚动区域' });
  expect(region.style.height).toBe('300px');
  expect(region.style.overflowY).toBe('auto');
  fireEvent.scroll(screen.getByRole('region'), { target: { scrollTop: 1260 } });
  expect(localStorage.getItem(`${key}:scroll`)).toBe('1260');
  first.rerender(chart());
  expect(screen.getByRole('region').scrollTop).toBe(1260);
  first.unmount();
  render(chart());
  await waitFor(() => expect(screen.getByRole('region').scrollTop).toBe(1260));
  expect(mockChart.resize).toHaveBeenLastCalledWith({
    width: 784,
    height: 8480,
  });
});

test('resizing the SKU slider grows the content without locking the chosen range', async () => {
  const options = {
    yAxis: { data: Array.from({ length: 100 }, (_, i) => `SKU${i}`) },
    dataZoom: [
      {
        id: 'matrix-rows',
        yAxisIndex: 0,
        start: 97,
        end: 100,
        zoomLock: false,
      },
    ],
  };
  render(
    <Echart
      refs={{}}
      width={800}
      height={300}
      minCategoryHeight={84}
      echartOptions={options}
      dataZoomStorageKey='[87,839,"kk_sku"]'
    />,
  );
  await waitFor(() =>
    expect(mockChart.on).toHaveBeenCalledWith('datazoom', expect.any(Function)),
  );
  mockChart.getOption.mockReturnValue({
    ...options,
    dataZoom: [{ id: 'matrix-rows', start: 50, end: 100 }],
  });
  act(() => mockChart.on.mock.calls.at(-1)?.[1]());
  expect(mockChart.resize).toHaveBeenLastCalledWith({
    width: 784,
    height: 4364,
  });
});

test('mount never writes a temporary clamped scroll position over the saved SKU anchor', async () => {
  const scope = '[87,839,"kk_sku"]';
  const key = `echarts__matrix_viewport:${JSON.stringify([1, scope])}`;
  const options = {
    yAxis: { data: Array.from({ length: 100 }, (_, i) => `SKU${i}`) },
    grid: { top: 36, bottom: 28 },
    dataZoom: [{ id: 'matrix-rows', yAxisIndex: 0, start: 0, end: 100 }],
  };
  const { persistSkuScroll } = require('../utils/matrixViewport');
  persistSkuScroll(options, 5264, 1695, key);
  const originalAnchor = localStorage.getItem(`${key}:anchor`);
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollTop',
  );
  const positions = new WeakMap<HTMLElement, number>();
  const writes: number[] = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return positions.get(this) ?? 0;
    },
    set(value: number) {
      positions.set(this, value);
      writes.push(value);
      this.dispatchEvent(new Event('scroll'));
    },
  });
  try {
    const view = render(
      <Echart
        refs={{}}
        width={800}
        height={300}
        minCategoryHeight={52}
        echartOptions={options}
        dataZoomStorageKey={scope}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('region').scrollTop).toBe(1695),
    );
    expect(writes.every(value => value === 1695)).toBe(true);
    expect(localStorage.getItem(`${key}:anchor`)).toBe(originalAnchor);
    view.unmount();
  } finally {
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, 'scrollTop', descriptor);
    else delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
  }
});

test('history semantics survive the final theme merge without extra series or new identities', async () => {
  mockThemeOverrides.series = [
    {
      name: 'wrong',
      type: 'scatter',
      data: [[0, 999]],
      lineStyle: { type: 'dashed' },
    },
    {
      name: 'wrong-history',
      type: 'bar',
      data: [[0, 999]],
      lineStyle: { type: 'solid' },
    },
  ];
  render(
    <Echart
      refs={{}}
      width={800}
      height={400}
      comparisonGroups={{
        groups: { current: ['current'], history: ['history'] },
        labels: { current: 'sales', history: 'sales' },
        kinds: { current: 'current', history: 'comparison' },
        parents: { history: 'current' },
        stateKeys: {
          current: 'current:sales',
          history: 'comparison:period:sales',
        },
      }}
      echartOptions={{
        series: [
          {
            id: 'a',
            name: 'current',
            type: 'line',
            data: [[1, 100]],
            itemStyle: { color: '#168ca8' },
          },
          {
            id: 'b',
            name: 'history',
            type: 'line',
            data: [[1, 60]],
            itemStyle: { color: '#168ca8' },
          },
        ],
      }}
    />,
  );
  await waitFor(() => expect(mockSetOption).toHaveBeenCalled());
  const series = mockSetOption.mock.calls.at(-1)?.[0].series;
  expect(series.map((entry: { name: string }) => entry.name)).toEqual([
    'current',
    'history',
  ]);
  expect(series.map((entry: { type: string }) => entry.type)).toEqual([
    'line',
    'line',
  ]);
  expect(series[0].lineStyle.type).toBe('solid');
  expect(series[1].lineStyle.type).toBe('dashed');
  expect(series[1].data).toEqual([[1, 60]]);
});

test('a ranked SKU keeps its raw anchor after reorder, refresh and remount', async () => {
  const scope = '[87,839,"kk_sku"]';
  const key = `echarts__matrix_viewport:${JSON.stringify([1, scope])}`;
  const values = Array.from({ length: 100 }, (_, i) => `SKU${i}`);
  const options = (data: string[]) => ({
    yAxis: { data, inverse: true },
    grid: { top: 38, bottom: 42 },
    dataZoom: [{ id: 'matrix-rows', yAxisIndex: 0, start: 0, end: 100 }],
  });
  const chart = (data: string[]) => (
    <Echart
      refs={{}}
      width={800}
      height={300}
      minCategoryHeight={52}
      echartOptions={options(data)}
      dataZoomStorageKey={scope}
    />
  );
  const first = render(chart(values));
  await waitFor(() =>
    expect(mockChart.resize).toHaveBeenCalledWith({ width: 784, height: 5280 }),
  );
  fireEvent.scroll(screen.getByRole('region'), { target: { scrollTop: 558 } });
  const saved = JSON.parse(localStorage.getItem(`${key}:anchor`)!);
  expect(saved.value).toBe('SKU10');
  const ranked = [...values].reverse();
  first.rerender(chart(ranked));
  const position = screen.getByRole('region').scrollTop;
  expect(position).toBe(38 + 89 * 52);
  first.rerender(chart(ranked));
  expect(screen.getByRole('region').scrollTop).toBe(position);
  first.unmount();
  render(chart(ranked));
  await waitFor(() =>
    expect(screen.getByRole('region').scrollTop).toBe(position),
  );
  expect(JSON.parse(localStorage.getItem(`${key}:anchor`)!)).toEqual(saved);
});
