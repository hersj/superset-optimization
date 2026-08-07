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
import { render, waitFor } from '@testing-library/react';
import type { EChartsCoreOption } from 'echarts/core';
import Echart from './Echart';

const mockSetOption = jest.fn();
const mockChart = {
  dispatchAction: jest.fn(),
  setOption: mockSetOption,
  resize: jest.fn(),
};

jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) =>
    selector({
      common: { locale: 'en' },
      dashboardState: { isRefreshing: true },
    }),
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
      echartsOptionsOverrides: {},
      echartsOptionsOverridesByChartType: {},
    }),
  };
});

afterEach(() => {
  mockSetOption.mockReset();
  mockChart.resize.mockReset();
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
