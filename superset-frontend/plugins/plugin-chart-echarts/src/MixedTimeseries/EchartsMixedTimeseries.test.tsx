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
import { act, render } from 'spec/helpers/testing-library';
import { AxisType } from '@superset-ui/core';
import type { EChartsCoreOption } from 'echarts/core';
import type { ComponentType, ReactNode } from 'react';
import type { EchartsHandler, EchartsProps } from '../types';
import type { EchartsMixedTimeseriesChartTransformedProps } from './types';
import EchartsMixedTimeseries from './EchartsMixedTimeseries';

jest.mock(
  'react-error-boundary',
  () => ({
    ErrorBoundary: ({ children }: { children: ReactNode }) => children,
    withErrorBoundary: (Component: ComponentType) => Component,
    useErrorBoundary: () => ({
      showBoundary: jest.fn(),
      resetBoundary: jest.fn(),
    }),
  }),
  { virtual: true },
);
jest.mock('react-js-cron', () => ({ __esModule: true, default: () => null }), {
  virtual: true,
});
const mockGetLegendStateChange = jest.fn(() => ({}));

jest.mock('../utils/series', () => ({
  formatSeriesName: jest.fn(),
  getLegendStateChange: (...args: unknown[]) =>
    mockGetLegendStateChange(...args),
  resolveLegendState: jest.fn(selected => selected),
}));

const mockDispatchAction = jest.fn();
const mockEchart = jest.fn();

jest.mock('../components/Echart', () => {
  const { forwardRef, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  const MockEchart = forwardRef<EchartsHandler | null, EchartsProps>(
    (props, ref) => {
      useImperativeHandle(ref, () => ({
        getEchartInstance: () => ({ dispatchAction: mockDispatchAction }),
      }));
      mockEchart(props);
      return null;
    },
  );
  MockEchart.displayName = 'MockEchart';
  return { __esModule: true, default: MockEchart };
});

afterEach(() => {
  mockDispatchAction.mockReset();
  mockEchart.mockReset();
  mockGetLegendStateChange.mockReset();
  mockGetLegendStateChange.mockReturnValue({});
  jest.useRealTimers();
});

test('does not dispatch legend actions while mixed-chart options restore grouped state', () => {
  const onLegendStateChanged = jest.fn();
  const props = {
    height: 400,
    width: 800,
    echartOptions: {
      legend: {
        selected: {
          'current:订购销售额': false,
          '订购销售额, LED5-CA': false,
          '订购销售额, LED4-UK': false,
        },
      },
    } as EChartsCoreOption,
    setDataMask: jest.fn(),
    labelMap: {},
    labelMapB: {},
    groupby: [],
    groupbyB: [],
    selectedValues: {},
    formData: {},
    emitCrossFilters: false,
    seriesBreakdown: 0,
    onContextMenu: jest.fn(),
    onFocusedSeries: jest.fn(),
    onLegendStateChanged,
    legendGroups: {
      groups: {
        '订购销售额, LED5-CA': ['订购销售额, LED5-CA', '订购销售额, LED4-UK'],
      },
      labels: { '订购销售额, LED5-CA': '订购销售额' },
      kinds: { '订购销售额, LED5-CA': 'current' },
      parents: {},
      stateKeys: { '订购销售额, LED5-CA': 'current:订购销售额' },
    },
    xValueFormatter: String,
    xAxis: { label: '日期', type: AxisType.Time },
    refs: {},
    coltypeMapping: {},
  } as unknown as EchartsMixedTimeseriesChartTransformedProps;

  render(<EchartsMixedTimeseries {...props} />);

  expect(mockDispatchAction).not.toHaveBeenCalled();
  expect(onLegendStateChanged).not.toHaveBeenCalled();
});

test('routes a mixed-chart ZRender legend double-click through focus', () => {
  const onLegendStateChanged = jest.fn();
  const focusedState = { 'current:订购销售额': true };
  mockGetLegendStateChange.mockImplementation(
    (
      _selected: unknown,
      _groups: unknown,
      changedName?: string,
      mode?: string,
    ) => {
      if (mode === 'focus') return focusedState;
      if (changedName === undefined) return focusedState;
      return { [`current:${changedName}`]: true };
    },
  );

  render(
    <EchartsMixedTimeseries
      {...({
        height: 400,
        width: 800,
        echartOptions: {
          legend: { data: ['订购销售额, Query A'] },
        } as EChartsCoreOption,
        setDataMask: jest.fn(),
        labelMap: {},
        labelMapB: {},
        groupby: [],
        groupbyB: [],
        selectedValues: {},
        formData: {},
        emitCrossFilters: false,
        seriesBreakdown: 0,
        onContextMenu: jest.fn(),
        onFocusedSeries: jest.fn(),
        onLegendStateChanged,
        legendGroups: {
          groups: { '订购销售额, Query A': ['订购销售额, Query A'] },
          labels: { '订购销售额, Query A': '订购销售额' },
          kinds: { '订购销售额, Query A': 'current' },
          parents: {},
          stateKeys: { '订购销售额, Query A': 'current:订购销售额' },
        },
        xValueFormatter: String,
        xAxis: { label: '日期', type: AxisType.Time },
        refs: {},
        coltypeMapping: {},
      } as unknown as EchartsMixedTimeseriesChartTransformedProps)}
    />,
  );

  const [echartProps] = mockEchart.mock.calls.at(-1) as [EchartsProps];
  const select = echartProps.eventHandlers?.legendselectchanged;
  const doubleClick = echartProps.zrEventHandlers?.dblclick;
  act(() => {
    select?.({
      name: '订购销售额, Query A',
      selected: { '订购销售额, Query A': false },
    });
    select?.({
      name: '订购销售额, Query A',
      selected: { '订购销售额, Query A': true },
    });
    doubleClick?.({
      target: { parent: { __legendDataIndex: 0 } },
    });
  });
  expect(onLegendStateChanged).toHaveBeenCalledTimes(3);
  expect(onLegendStateChanged).toHaveBeenLastCalledWith(focusedState);
});
