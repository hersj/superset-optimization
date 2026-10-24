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
  render as renderWithProviders,
} from '../../../../spec/helpers/testing-library';
import { AxisType } from '@superset-ui/core';
import type { EChartsCoreOption } from 'echarts/core';
import type { ComponentType, ReactNode, ReactElement } from 'react';
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

const render = (ui: ReactElement) =>
  renderWithProviders(ui, { useRedux: true });

const mockDispatchAction = jest.fn();
const mockEchart = jest.fn();
const mockGetLegendStateChange = jest.fn(() => ({ 'current:订购数量': false }));
const mockContainPixel = jest.fn();
const mockGetComponent = jest.fn();

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
        getEchartInstance: () =>
          ({
            dispatchAction: mockDispatchAction,
            containPixel: mockContainPixel,
            getModel: () => ({ getComponent: mockGetComponent }),
          }) as any,
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
  mockGetLegendStateChange.mockReturnValue({ 'current:订购数量': false });
  mockContainPixel.mockReset();
  mockGetComponent.mockReset();
  jest.useRealTimers();
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

test('routes a real ZRender legend double-click without chart-area focus', () => {
  const onLegendStateChanged = jest.fn();
  const focusedState = {
    'current:毛利润': false,
    'current:配送销售额': true,
    'current:毛利率': false,
  };
  mockGetLegendStateChange.mockImplementation(
    (
      _selected: unknown,
      _groups: unknown,
      changedName?: string,
      mode?: string,
    ) => {
      if (mode === 'focus') return focusedState;
      return changedName ? { [`current:${changedName}`]: true } : {};
    },
  );
  mockContainPixel.mockReturnValue(true);
  mockGetComponent.mockReturnValue({
    mainType: 'legend',
    name: '配送销售额',
  });

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
        legendData: ['毛利润', '配送销售额', '毛利率'],
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
  act(() => {
    echartProps.eventHandlers?.legendselectchanged?.({
      name: '配送销售额',
      selected: { 毛利润: true, 配送销售额: false, 毛利率: false },
    });
    echartProps.eventHandlers?.legendselectchanged?.({
      name: '配送销售额',
      selected: { 毛利润: true, 配送销售额: true, 毛利率: false },
    });
    echartProps.zrEventHandlers?.dblclick?.({
      offsetX: 320,
      offsetY: 90,
      target: {
        type: 'rect',
        parent: { __legendDataIndex: 1 },
      },
    });
  });

  expect(onLegendStateChanged).toHaveBeenCalledTimes(3);
  expect(onLegendStateChanged).toHaveBeenLastCalledWith(focusedState);
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

test('double-clicking a legend focuses it and double-clicking again restores the prior selection', () => {
  const onLegendStateChanged = jest.fn();
  const restoreState = {
    'current:订购数量': true,
    '订购数量, LED5': true,
    'current:配送数量': true,
    '配送数量, LED5': true,
    'current:毛利润': false,
    '毛利润, LED5': false,
  };
  const focusedState = {
    'current:订购数量': true,
    '订购数量, LED5': true,
    'current:配送数量': false,
    '配送数量, LED5': false,
    'current:毛利润': false,
    '毛利润, LED5': false,
  };
  mockGetLegendStateChange.mockImplementation(
    (
      selected: Record<string, boolean>,
      _groups: unknown,
      changedName?: string,
      mode?: string,
    ) => {
      if (mode === 'focus') return focusedState;
      if (changedName === undefined) {
        return selected['配送数量, LED5'] ? restoreState : focusedState;
      }
      if (changedName === '配送数量, LED5') {
        return {
          'current:配送数量': true,
          '配送数量, LED5': true,
        };
      }
      return { [`current:${changedName}`]: true };
    },
  );

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
        onLegendStateChanged,
        onFocusedSeries: jest.fn(),
        onTooltipSeriesClick: jest.fn(),
        xValueFormatter: String,
        xAxis: { label: '日期', type: AxisType.Time },
        refs: {},
        emitCrossFilters: false,
        coltypeMapping: {},
        onLegendScroll: jest.fn(),
        legendData: ['订购数量, LED5', '配送数量, LED5', '毛利润, LED5'],
        legendGroups: {
          groups: {
            '订购数量, LED5': ['订购数量, LED5'],
            '配送数量, LED5': ['配送数量, LED5'],
            '毛利润, LED5': ['毛利润, LED5'],
          },
          labels: {
            '订购数量, LED5': '订购数量',
            '配送数量, LED5': '配送数量',
            '毛利润, LED5': '毛利润',
          },
          kinds: {
            '订购数量, LED5': 'current',
            '配送数量, LED5': 'current',
            '毛利润, LED5': 'current',
          },
          parents: {},
          stateKeys: {
            '订购数量, LED5': 'current:订购数量',
            '配送数量, LED5': 'current:配送数量',
            '毛利润, LED5': 'current:毛利润',
          },
        },
      } as unknown as TimeseriesChartTransformedProps)}
    />,
  );

  const [echartProps] = mockEchart.mock.calls.at(-1) as [EchartsProps];
  const select = echartProps.eventHandlers?.legendselectchanged;
  const doubleClick = echartProps.zrEventHandlers?.dblclick;

  act(() => {
    select?.({
      name: '订购数量, LED5',
      selected: {
        '订购数量, LED5': false,
        '配送数量, LED5': true,
        '毛利润, LED5': false,
      },
    });
    select?.({
      name: '订购数量, LED5',
      selected: {
        '订购数量, LED5': true,
        '配送数量, LED5': true,
        '毛利润, LED5': false,
      },
    });
    doubleClick?.({
      target: { parent: { __legendDataIndex: 0 } },
    });
  });

  expect(onLegendStateChanged).toHaveBeenCalledTimes(3);
  expect(onLegendStateChanged).toHaveBeenLastCalledWith(focusedState);

  act(() => {
    select?.({
      name: '配送数量, LED5',
      selected: {
        '订购数量, LED5': true,
        '配送数量, LED5': true,
        '毛利润, LED5': false,
      },
    });
  });
  expect(onLegendStateChanged).toHaveBeenCalledTimes(4);
  expect(onLegendStateChanged).toHaveBeenLastCalledWith({
    'current:配送数量': true,
    '配送数量, LED5': true,
  });

  act(() => {
    select?.({
      name: '订购数量, LED5',
      selected: {
        '订购数量, LED5': false,
        '配送数量, LED5': true,
        '毛利润, LED5': false,
      },
    });
    select?.({
      name: '订购数量, LED5',
      selected: {
        '订购数量, LED5': true,
        '配送数量, LED5': true,
        '毛利润, LED5': false,
      },
    });
    doubleClick?.({
      target: { parent: { __legendDataIndex: 0 } },
    });
  });

  expect(onLegendStateChanged).toHaveBeenCalledTimes(7);
  expect(onLegendStateChanged).toHaveBeenLastCalledWith(focusedState);

  act(() => {
    select?.({
      name: '订购数量, LED5',
      selected: {
        '订购数量, LED5': false,
        '配送数量, LED5': false,
        '毛利润, LED5': false,
      },
    });
    select?.({
      name: '订购数量, LED5',
      selected: {
        '订购数量, LED5': true,
        '配送数量, LED5': false,
        '毛利润, LED5': false,
      },
    });
    doubleClick?.({
      target: { parent: { __legendDataIndex: 0 } },
    });
  });

  expect(onLegendStateChanged).toHaveBeenCalledTimes(10);
  expect(onLegendStateChanged).toHaveBeenLastCalledWith(restoreState);
});
