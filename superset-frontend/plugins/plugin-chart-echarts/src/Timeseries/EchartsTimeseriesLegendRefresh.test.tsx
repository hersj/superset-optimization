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
import { render } from '@testing-library/react';
import { AxisType } from '@superset-ui/core';
import type { EChartsCoreOption } from 'echarts/core';
import type { ComponentType, ReactNode } from 'react';
import type { EchartsHandler, EchartsProps } from '../types';
import EchartsTimeseries from './EchartsTimeseries';
import type { TimeseriesChartTransformedProps } from './types';

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

const mockDispatchAction = jest.fn();
const mockEchart = jest.fn();
const mockGetLegendStateChange = jest.fn(() => ({ 'current:订购数量': false }));

jest.mock('../utils/series', () => ({
  formatSeriesName: jest.fn(),
  getLegendStateChange: (...args: unknown[]) =>
    mockGetLegendStateChange(...args),
  resolveLegendState: jest.fn(selected => selected),
}));
jest.mock('../components/ExtraControls', () => ({ ExtraControls: () => null }));
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
  mockGetLegendStateChange.mockClear();
});

test('restores grouped legend options without programmatic legend actions', () => {
  const onLegendStateChanged = jest.fn();
  const props = {
    height: 400,
    width: 800,
    echartOptions: {
      legend: {
        selected: {
          'current:订购数量': false,
          '订购数量, LED5-CA': false,
          '订购数量, LED4-UK': false,
        },
      },
    } as EChartsCoreOption,
    formData: {},
    groupby: [],
    labelMap: {},
    selectedValues: {},
    setDataMask: jest.fn(),
    setControlValue: jest.fn(),
    onContextMenu: jest.fn(),
    onLegendStateChanged,
    onFocusedSeries: jest.fn(),
    onTooltipSeriesClick: jest.fn(),
    xValueFormatter: String,
    xAxis: { label: '日期', type: AxisType.Time },
    refs: {},
    emitCrossFilters: false,
    coltypeMapping: {},
    onLegendScroll: jest.fn(),
    legendGroups: {
      groups: {
        '订购数量, LED5-CA': ['订购数量, LED5-CA', '订购数量, LED4-UK'],
      },
      labels: { '订购数量, LED5-CA': '订购数量' },
      kinds: { '订购数量, LED5-CA': 'current' },
      parents: {},
      stateKeys: { '订购数量, LED5-CA': 'current:订购数量' },
    },
  } as unknown as TimeseriesChartTransformedProps;

  render(<EchartsTimeseries {...props} />);

  expect(mockDispatchAction).not.toHaveBeenCalled();
  expect(onLegendStateChanged).not.toHaveBeenCalled();
});

test('forwards a user legend selection to ChartRenderer', () => {
  const onLegendStateChanged = jest.fn();
  render(
    <EchartsTimeseries
      {...({
        height: 400,
        width: 800,
        echartOptions: {} as EChartsCoreOption,
        formData: {},
        groupby: [],
        labelMap: {},
        selectedValues: {},
        setDataMask: jest.fn(),
        setControlValue: jest.fn(),
        onContextMenu: jest.fn(),
        onLegendStateChanged,
        onFocusedSeries: jest.fn(),
        onTooltipSeriesClick: jest.fn(),
        xValueFormatter: String,
        xAxis: { label: '日期', type: AxisType.Time },
        refs: {},
        emitCrossFilters: false,
        coltypeMapping: {},
        onLegendScroll: jest.fn(),
      } as unknown as TimeseriesChartTransformedProps)}
    />,
  );

  const [echartProps] = mockEchart.mock.calls.at(-1) as [EchartsProps];
  echartProps.eventHandlers?.legendselectchanged?.({
    name: '订购数量',
    selected: { 订购数量: false },
  });

  expect(onLegendStateChanged).toHaveBeenCalledWith({
    'current:订购数量': false,
  });
});
