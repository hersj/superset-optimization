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
  createStore,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import { FeatureFlag, SupersetClient, VizType } from '@superset-ui/core';
import * as redux from 'redux';

import * as exploreUtils from 'src/explore/exploreUtils';
import * as chartStateConverter from '../../../util/chartStateConverter';
import { setPivotTemplateLibrary } from '../../../actions/personalChartLayout';
import { setDashboardChartControls } from '../../../actions/dashboardState';
import { DEFAULT_DASHBOARD_CHART_CONTROLS } from '../../../util/charts/getDashboardChartControls';
import reducerIndex from 'spec/helpers/reducerIndex';
import { sliceEntitiesForChart as sliceEntities } from 'spec/fixtures/mockSliceEntities';
import mockDatasource from 'spec/fixtures/mockDatasource';
import chartQueries, {
  sliceId as queryId,
} from 'spec/fixtures/mockChartQueries';
import Chart from './Chart';

let capturedChartContainerProps: Record<string, unknown> = {};
jest.mock('src/components/Chart/ChartContainer', () => {
  const MockChartContainer = (props: Record<string, unknown>) => {
    capturedChartContainerProps = props;
    return <div data-test="chart-container" />;
  };
  return { __esModule: true, default: MockChartContainer };
});

const props = {
  id: queryId,
  width: 100,
  height: 100,
  updateSliceName() {},
  // from redux
  maxRows: 500, // will be overwritten with SQL_MAX_ROW from conf
  formData: chartQueries[queryId].form_data,
  datasource: (mockDatasource as Record<string, unknown>)[
    sliceEntities.slices[queryId].datasource
  ],
  sliceName: sliceEntities.slices[queryId].slice_name,
  timeout: 60,
  filters: {},
  refreshChart() {},
  toggleExpandSlice() {},
  addFilter() {},
  logEvent() {},
  handleToggleFullSize() {},
  changeFilter() {},
  setFocusedFilterField() {},
  unsetFocusedFilterField() {},
  addSuccessToast() {},
  addDangerToast() {},
  exportCSV() {},
  exportFullCSV() {},
  exportXLSX() {},
  exportFullXLSX() {},
  componentId: 'test',
  dashboardId: 111,
};

const defaultState = {
  charts: chartQueries,
  sliceEntities: {
    ...sliceEntities,
    slices: {
      [queryId]: {
        ...sliceEntities.slices[queryId],
        description_markdown: 'markdown',
        owners: [],
        viz_type: VizType.Table,
      },
    },
  },
  datasources: mockDatasource,
  dashboardState: { editMode: false, expandedSlices: {} },
  dashboardInfo: {
    id: props.dashboardId,
    superset_can_explore: false,
    superset_can_share: false,
    superset_can_csv: false,
    common: { conf: { SUPERSET_WEBSERVER_TIMEOUT: 0, SQL_MAX_ROW: 666 } },
  },
  dashboardLayout: {
    present: {},
    past: [],
    future: [],
  },
};

function setup(
  overrideProps: Record<string, unknown> = {},
  overrideState: Record<string, unknown> = {},
) {
  return render(<Chart {...props} {...overrideProps} />, {
    useRedux: true,
    useRouter: true,
    initialState: { ...defaultState, ...overrideState },
  });
}

const refreshChart = jest.fn();
const logEvent = jest.fn();
const changeFilter = jest.fn();
const addSuccessToast = jest.fn();
const addDangerToast = jest.fn();
const toggleExpandSlice = jest.fn();
const setFocusedFilterField = jest.fn();
const unsetFocusedFilterField = jest.fn();
beforeAll(() => {
  jest.spyOn(redux, 'bindActionCreators').mockImplementation(() => ({
    refreshChart,
    logEvent,
    changeFilter,
    addSuccessToast,
    addDangerToast,
    toggleExpandSlice,
    setFocusedFilterField,
    unsetFocusedFilterField,
  }));
});

afterEach(() => {
  jest.clearAllMocks();
});

test('should render a SliceHeader', () => {
  const { getByTestId, container } = setup();
  expect(getByTestId('slice-header')).toBeInTheDocument();
  expect(container.querySelector('.slice_description')).not.toBeInTheDocument();
});

test('should render a ChartContainer', () => {
  const { getByTestId } = setup();
  expect(getByTestId('chart-container')).toBeInTheDocument();
});

test('should trigger a query when dashboard chart controls change', async () => {
  const store = createStore(
    {
      ...defaultState,
      dashboardState: {
        ...defaultState.dashboardState,
        dashboardChartControls: DEFAULT_DASHBOARD_CHART_CONTROLS,
      },
    },
    reducerIndex,
  );
  const dispatchSpy = jest.spyOn(store, 'dispatch');

  render(<Chart {...props} />, {
    store,
    useRouter: true,
  });

  store.dispatch(
    setDashboardChartControls({
      ...DEFAULT_DASHBOARD_CHART_CONTROLS,
      showValueEnabled: false,
    }),
  );

  await waitFor(() => {
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'TRIGGER_QUERY',
      value: true,
      key: queryId,
    });
    expect(capturedChartContainerProps.formData).toEqual(
      expect.objectContaining({ show_value: false }),
    );
  });
});

test('should render a description if it has one and isExpanded=true', () => {
  const { container } = setup(
    {},
    {
      dashboardState: {
        ...defaultState.dashboardState,
        expandedSlices: { [props.id]: true },
      },
    },
  );
  expect(container.querySelector('.slice_description')).toBeInTheDocument();
});

test('should call refreshChart when SliceHeader calls forceRefresh', () => {
  const { getByText, getByRole } = setup({});
  fireEvent.click(getByRole('button', { name: 'More Options' }));
  fireEvent.click(getByText('Force refresh'));
  expect(refreshChart).toHaveBeenCalled();
});

/* oxlint-disable-next-line jest/no-disabled-tests */
test.skip('should call changeFilter when ChartContainer calls changeFilter', () => {
  const mockChangeFilter = jest.fn();
  const wrapper = setup({ changeFilter: mockChangeFilter }) as any;
  wrapper.instance().changeFilter();
  expect((mockChangeFilter as any).callCount).toBe(1);
});

test('should call exportChart when exportCSV is clicked', async () => {
  const stubbedExportCSV = jest
    .spyOn(exploreUtils, 'exportChart')
    .mockImplementation((() => {}) as any);
  const { findByText, getByRole } = setup(
    {},
    {
      dashboardInfo: { ...defaultState.dashboardInfo, superset_can_csv: true },
    },
  );
  fireEvent.click(getByRole('button', { name: 'More Options' }));
  fireEvent.mouseOver(getByRole('menuitem', { name: 'Download right' }));
  const exportAction = await findByText('Export to .CSV');
  fireEvent.click(exportAction);
  expect(stubbedExportCSV).toHaveBeenCalledTimes(1);
  expect(stubbedExportCSV).toHaveBeenCalledWith(
    expect.objectContaining({
      formData: expect.objectContaining({
        dashboardId: 111,
      }),
      resultType: 'full',
      resultFormat: 'csv',
    }),
  );
  stubbedExportCSV.mockRestore();
});

test('should call exportChart with row_limit props.maxRows when exportFullCSV is clicked', async () => {
  (global as any).featureFlags = {
    [FeatureFlag.AllowFullCsvExport]: true,
  };
  const stubbedExportCSV = jest
    .spyOn(exploreUtils, 'exportChart')
    .mockImplementation((() => {}) as any);
  const { findByText, getByRole } = setup(
    {},
    {
      dashboardInfo: { ...defaultState.dashboardInfo, superset_can_csv: true },
    },
  );
  fireEvent.click(getByRole('button', { name: 'More Options' }));
  fireEvent.mouseOver(getByRole('menuitem', { name: 'Download right' }));
  const exportAction = await findByText('Export to full .CSV');
  fireEvent.click(exportAction);
  expect(stubbedExportCSV).toHaveBeenCalledTimes(1);
  expect(stubbedExportCSV).toHaveBeenCalledWith(
    expect.objectContaining({
      formData: expect.objectContaining({
        row_limit: 666,
        dashboardId: 111,
      }),
      resultType: 'full',
      resultFormat: 'csv',
    }),
  );
  stubbedExportCSV.mockRestore();
});

test('should call exportChart when exportXLSX is clicked', async () => {
  const stubbedExportXLSX = jest
    .spyOn(exploreUtils, 'exportChart')
    .mockImplementation((() => {}) as any);
  const { findByText, getByRole } = setup(
    {},
    {
      dashboardInfo: { ...defaultState.dashboardInfo, superset_can_csv: true },
    },
  );
  fireEvent.click(getByRole('button', { name: 'More Options' }));
  fireEvent.mouseOver(getByRole('menuitem', { name: 'Download right' }));
  const exportAction = await findByText('Export to Excel');
  fireEvent.click(exportAction);
  expect(stubbedExportXLSX).toHaveBeenCalledTimes(1);
  expect(stubbedExportXLSX).toHaveBeenCalledWith(
    expect.objectContaining({
      resultType: 'full',
      resultFormat: 'xlsx',
    }),
  );
  stubbedExportXLSX.mockRestore();
});

test('should call exportChart with row_limit props.maxRows when exportFullXLSX is clicked', async () => {
  (global as any).featureFlags = {
    [FeatureFlag.AllowFullCsvExport]: true,
  };
  const stubbedExportXLSX = jest
    .spyOn(exploreUtils, 'exportChart')
    .mockImplementation((() => {}) as any);
  const { findByText, getByRole } = setup(
    {},
    {
      dashboardInfo: { ...defaultState.dashboardInfo, superset_can_csv: true },
    },
  );
  fireEvent.click(getByRole('button', { name: 'More Options' }));
  fireEvent.mouseOver(getByRole('menuitem', { name: 'Download right' }));
  const exportAction = await findByText('Export to full Excel');
  fireEvent.click(exportAction);
  expect(stubbedExportXLSX).toHaveBeenCalledTimes(1);
  expect(stubbedExportXLSX).toHaveBeenCalledWith(
    expect.objectContaining({
      formData: expect.objectContaining({
        row_limit: 666,
        dashboardId: 111,
      }),
      resultType: 'full',
      resultFormat: 'xlsx',
    }),
  );

  stubbedExportXLSX.mockRestore();
});

test('should re-render when chart becomes visible', () => {
  const { rerender, getByTestId } = setup({ isComponentVisible: false });
  expect(getByTestId('chart-container')).toBeInTheDocument();

  rerender(<Chart {...props} isComponentVisible />);
  expect(getByTestId('chart-container')).toBeInTheDocument();
});

test('should re-render when componentId changes', () => {
  const { rerender, getByTestId } = setup({
    isComponentVisible: true,
    componentId: 'test-1',
  });
  expect(getByTestId('chart-container')).toBeInTheDocument();

  rerender(<Chart {...props} isComponentVisible componentId="test-2" />);
  expect(getByTestId('chart-container')).toBeInTheDocument();
});

test('should re-render when cacheBusterProp changes', () => {
  const { rerender, getByTestId } = setup({
    isComponentVisible: true,
    cacheBusterProp: 'v1',
  });
  expect(getByTestId('chart-container')).toBeInTheDocument();

  rerender(<Chart {...props} isComponentVisible cacheBusterProp="v2" />);
  expect(getByTestId('chart-container')).toBeInTheDocument();
});

test('should handle chart state conversion when converter exists', () => {
  const mockChartState = { sortColumn: 'column1', sortOrder: 'asc' };
  const mockConvertedState = { sort: [{ columnId: 'column1', order: 'asc' }] };

  jest
    .spyOn(chartStateConverter, 'hasChartStateConverter')
    .mockReturnValue(true);
  jest
    .spyOn(chartStateConverter, 'convertChartStateToOwnState')
    .mockReturnValue(mockConvertedState);

  const { getByTestId } = setup(
    {},
    {
      ...defaultState,
      dashboardState: {
        ...defaultState.dashboardState,
        chartStates: {
          [queryId]: { state: mockChartState },
        },
      },
    },
  );

  expect(getByTestId('chart-container')).toBeInTheDocument();
  expect(chartStateConverter.hasChartStateConverter).toHaveBeenCalledWith(
    VizType.Table,
  );
});

test('should fallback to formData state when runtime state not available', () => {
  const mockFormDataState = { sortColumn: 'column2', sortOrder: 'desc' };
  const mockConvertedState = { sort: [{ columnId: 'column2', order: 'desc' }] };

  jest
    .spyOn(chartStateConverter, 'hasChartStateConverter')
    .mockReturnValue(true);
  jest
    .spyOn(chartStateConverter, 'convertChartStateToOwnState')
    .mockReturnValue(mockConvertedState);

  const { getByTestId } = setup(
    {},
    {
      ...defaultState,
      charts: {
        ...defaultState.charts,
        [queryId]: {
          ...defaultState.charts[queryId],
          form_data: {
            ...defaultState.charts[queryId].form_data,
            table_state: mockFormDataState,
          },
        },
      },
    },
  );

  expect(getByTestId('chart-container')).toBeInTheDocument();
});

test('should not show a close button on chart error banners', () => {
  const { queryByRole } = setup(
    {},
    {
      ...defaultState,
      charts: {
        ...defaultState.charts,
        [queryId]: {
          ...defaultState.charts[queryId],
          chartStatus: 'failed',
          chartAlert: 'Something went wrong',
          queriesResponse: [
            {
              message: 'Something went wrong',
              errors: [],
            },
          ],
        },
      },
    },
  );

  expect(queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
});

test('should handle chart state when no converter exists', () => {
  jest
    .spyOn(chartStateConverter, 'hasChartStateConverter')
    .mockReturnValue(false);
  jest.spyOn(chartStateConverter, 'convertChartStateToOwnState');

  const { getByTestId } = setup(
    {},
    {
      ...defaultState,
      dashboardState: {
        ...defaultState.dashboardState,
        chartStates: {
          [queryId]: { state: { someState: 'value' } },
        },
      },
    },
  );

  expect(getByTestId('chart-container')).toBeInTheDocument();
  expect(
    chartStateConverter.convertChartStateToOwnState,
  ).not.toHaveBeenCalled();
});

test('should merge base ownState with converted chart state', () => {
  const baseOwnState = { existingProp: 'value' };
  const mockChartState = { sortColumn: 'column1', sortOrder: 'asc' };
  const mockConvertedState = { sort: [{ columnId: 'column1', order: 'asc' }] };

  jest
    .spyOn(chartStateConverter, 'hasChartStateConverter')
    .mockReturnValue(true);
  jest
    .spyOn(chartStateConverter, 'convertChartStateToOwnState')
    .mockReturnValue(mockConvertedState);

  const { getByTestId } = setup(
    {},
    {
      ...defaultState,
      dataMask: {
        [queryId]: {
          ownState: baseOwnState,
        },
      },
      dashboardState: {
        ...defaultState.dashboardState,
        chartStates: {
          [queryId]: { state: mockChartState },
        },
      },
    },
  );

  expect(getByTestId('chart-container')).toBeInTheDocument();
});

test('should re-query when persisted comparison differs from the last query', async () => {
  const chartWithOldComparison = {
    ...chartQueries[queryId],
    triggerQuery: false,
    latestQueryFormData: {
      ...(chartQueries[queryId].latestQueryFormData || {}),
      time_compare: ['1 day ago'],
      extra_form_data: { time_compare: ['1 day ago'] },
    },
  };
  const store = createStore(
    {
      ...defaultState,
      charts: { ...chartQueries, [queryId]: chartWithOldComparison },
      dashboardState: {
        ...defaultState.dashboardState,
        dashboardChartControls: {
          timeCompareEnabled: false,
          showValueEnabled: true,
        },
      },
    },
    reducerIndex,
  );
  const dispatchSpy = jest.spyOn(store, 'dispatch');

  render(<Chart {...props} />, { store, useRouter: true });

  await waitFor(() => {
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'TRIGGER_QUERY',
      value: true,
      key: queryId,
    });
  });
});
test('should pass filterState from dataMask to ChartContainer', () => {
  const mockFilterState = { value: ['bar'], selectedValues: ['bar'] };

  setup(
    {},
    {
      ...defaultState,
      dataMask: {
        [queryId]: {
          filterState: mockFilterState,
        },
      },
    },
  );

  expect(capturedChartContainerProps).toHaveProperty(
    'filterState',
    mockFilterState,
  );
});

const rememberedLayout = {
  version: 1,
  ordered_metric_ids: ['profit', 'sales'],
  hidden_metric_ids: ['sales'],
  frozen_column_key: 'profit',
};
const previousLayout = {
  version: 1,
  ordered_metric_ids: ['sales', 'profit'],
  hidden_metric_ids: [],
};
function setupPivot() {
  return setup(
    {},
    {
      charts: {
        ...chartQueries,
        [queryId]: {
          ...chartQueries[queryId],
          form_data: {
            ...chartQueries[queryId].form_data,
            viz_type: VizType.PivotTable,
            metrics: ['sales', 'profit'],
          },
        },
      },
      sliceEntities: {
        ...defaultState.sliceEntities,
        slices: {
          [queryId]: {
            ...defaultState.sliceEntities.slices[queryId],
            viz_type: VizType.PivotTable,
          },
        },
      },
      dashboardState: {
        ...defaultState.dashboardState,
        personalChartLayouts: { [queryId]: previousLayout },
        pivotTemplateLibrary: {
          version: 2,
          templates: [
            {
              slot: 1,
              name: '利润布局',
              is_default: false,
              layout: rememberedLayout,
            },
          ],
          defaults: {},
          legacy_layout: null,
        },
      },
    },
  );
}

test('using a template persists before changing the rendered chart layout', async () => {
  let finish!: (value: Awaited<ReturnType<typeof SupersetClient.put>>) => void;
  const put = jest.spyOn(SupersetClient, 'put').mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  setupPivot();
  userEvent.click(screen.getByRole('button', { name: /列模板：/ }));
  userEvent.click(await screen.findByText('利润布局'));
  expect(put).toHaveBeenCalledWith({
    endpoint: '/api/v1/dashboard/111/pivot_templates',
    jsonPayload: {
      action: 'apply',
      chart_id: queryId,
      layout: rememberedLayout,
      selection: 1,
    },
  });
  expect(capturedChartContainerProps.ownState).toEqual(
    expect.objectContaining({ pivot_table_metric_layout: previousLayout }),
  );
  finish({
    json: {
      result: {
        version: 2,
        templates: [],
        defaults: { [queryId]: rememberedLayout },
        legacy_layout: null,
      },
    },
  } as never);
  await waitFor(() =>
    expect(capturedChartContainerProps.ownState).toEqual(
      expect.objectContaining({ pivot_table_metric_layout: rememberedLayout }),
    ),
  );
});

test('failed template persistence keeps the previous chart layout and reports the failure', async () => {
  jest.spyOn(SupersetClient, 'put').mockRejectedValueOnce(new Error('offline'));
  setupPivot();
  userEvent.click(screen.getByRole('button', { name: /列模板：/ }));
  userEvent.click(await screen.findByText('利润布局'));
  await waitFor(() =>
    expect(addDangerToast).toHaveBeenCalledWith('个人列布局保存失败，请重试'),
  );
  expect(capturedChartContainerProps.ownState).toEqual(
    expect.objectContaining({ pivot_table_metric_layout: previousLayout }),
  );
});

test('system default persists all current metrics with no hidden or frozen columns', async () => {
  const put = jest.spyOn(SupersetClient, 'put').mockResolvedValueOnce({
    json: {
      result: {
        version: 2,
        templates: [],
        defaults: {},
        legacy_layout: null,
      },
    },
  } as never);
  setupPivot();
  userEvent.click(screen.getByRole('button', { name: /列模板：/ }));
  userEvent.click(await screen.findByText('系统默认'));
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/111/pivot_templates',
      jsonPayload: {
        action: 'apply',
        chart_id: queryId,
        selection: 'system-default',
        layout: {
          ...previousLayout,
          frozen_column_count: 0,
          frozen_column_key: null,
        },
      },
    }),
  );
});

test('reload restores the selected name even when another template has identical columns', async () => {
  const store = createStore(defaultState, reducerIndex);
  store.dispatch(
    setPivotTemplateLibrary(
      {
        version: 2,
        templates: [
          {
            slot: 1,
            name: '第一模板',
            is_default: false,
            layout: rememberedLayout,
          },
          {
            slot: 2,
            name: '第二模板',
            is_default: false,
            layout: rememberedLayout,
          },
        ],
        defaults: { [queryId]: rememberedLayout },
        selections: { [queryId]: 2 },
        legacy_layout: null,
      },
      true,
    ),
  );
  const state = store.getState();
  render(<Chart {...props} />, {
    useRouter: true,
    useRedux: true,
    initialState: {
      ...state,
      charts: {
        ...chartQueries,
        [queryId]: {
          ...chartQueries[queryId],
          form_data: {
            ...chartQueries[queryId].form_data,
            viz_type: VizType.PivotTable,
            metrics: ['sales', 'profit'],
          },
        },
      },
      sliceEntities: {
        ...defaultState.sliceEntities,
        slices: {
          [queryId]: {
            ...defaultState.sliceEntities.slices[queryId],
            viz_type: VizType.PivotTable,
          },
        },
      },
    },
  });
  expect(
    screen.getByRole('button', { name: '列模板：第二模板' }),
  ).toBeInTheDocument();
  expect(capturedChartContainerProps.ownState).toEqual(
    expect.objectContaining({ pivot_table_metric_layout: rememberedLayout }),
  );
});
