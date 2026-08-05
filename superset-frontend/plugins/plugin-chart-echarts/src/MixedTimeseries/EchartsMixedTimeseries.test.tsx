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
jest.mock('../utils/series', () => ({
  formatSeriesName: jest.fn(),
  getLegendStateChange: jest.fn(() => ({})),
  resolveLegendState: jest.fn(selected => selected),
}));

const mockDispatchAction = jest.fn();

jest.mock('../components/Echart', () => {
  const { forwardRef, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  const MockEchart = forwardRef<EchartsHandler | null, EchartsProps>(
    (_props, ref) => {
      useImperativeHandle(ref, () => ({
        getEchartInstance: () => ({ dispatchAction: mockDispatchAction }),
      }));
      return null;
    },
  );
  MockEchart.displayName = 'MockEchart';
  return { __esModule: true, default: MockEchart };
});

afterEach(() => {
  mockDispatchAction.mockReset();
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
