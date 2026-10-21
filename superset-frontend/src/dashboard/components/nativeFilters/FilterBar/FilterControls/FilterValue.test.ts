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
  shouldApplyFilterOptionsRequestResult,
  shouldLoadFilterOptions,
  shouldStartFilterOptionsRequest,
} from './FilterValue';
import { createElement } from 'react';
import { Provider } from 'react-redux';
import { render, waitFor } from 'spec/helpers/testing-library';
import configureStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import { SupersetClient } from '@superset-ui/core';
import { FilterBarOrientation } from 'src/dashboard/types';
import { getChartDataRequest } from 'src/components/Chart/chartAction';
import * as cascadeFilterOptions from './cascadeFilterOptions';
import FilterValue from './FilterValue';

jest.mock('src/components/Chart/chartAction', () => ({
  getChartDataRequest: jest.fn(),
}));

jest.mock('./cascadeFilterOptions', () => {
  const actual = jest.requireActual('./cascadeFilterOptions');
  return {
    ...actual,
    getCascadeFilterOptions: jest.fn(actual.getCascadeFilterOptions),
  };
});

const filterOptionsRequestMock =
  cascadeFilterOptions.getCascadeFilterOptions as unknown as jest.Mock;
const chartDataRequestMock = getChartDataRequest as unknown as jest.Mock;
const mockStore = configureStore([thunk]);

const createNativeFilter = (id: string, overrides = {}) => ({
  id,
  name: id,
  filterType: 'filter_custom_time',
  targets: [{ datasetId: 98, column: { name: 'earliest_ship_date' } }],
  chartsInScope: [1],
  ...overrides,
});

const childFilter = {
  id: 'shop',
  name: 'Shop',
  filterType: 'filter_select',
  targets: [{ datasetId: 98, column: { name: 'shop_name' } }],
  defaultDataMask: {},
  controlValues: {},
  cascadeParentIds: [],
  dataMask: {},
};

const createState = (nativeFilters: Record<string, any>) => ({
  dashboardInfo: { id: 44 },
  dashboardState: {
    isRefreshing: false,
    isFiltersRefreshing: false,
    sliceIds: [1],
    directPathToChild: [],
    directPathLastUpdated: 0,
  },
  dashboardLayout: {
    present: {
      'CHART-1': {
        type: 'CHART',
        id: 'CHART-1',
        meta: { chartId: 1 },
      },
    },
  },
  nativeFilters: { filters: nativeFilters },
  sliceEntities: { slices: { 1: { datasource_id: 98 } } },
});

const renderFilterValue = (
  nativeFilters: Record<string, any>,
  dataMaskSelected: Record<string, any> = {},
  initializedFilters: ReadonlySet<string> = new Set(),
) => {
  const store = mockStore(createState(nativeFilters));
  return render(
    createElement(
      Provider,
      { store },
      createElement(FilterValue, {
        filter: childFilter as any,
        dataMaskSelected: dataMaskSelected as any,
        initializedFilters,
        onFilterSelectionChange: jest.fn(),
        inView: true,
        isFilterActive: true,
        orientation: FilterBarOrientation.Vertical,
      }),
    ),
  );
};

beforeEach(() => {
  filterOptionsRequestMock.mockClear();
  chartDataRequestMock.mockReset();
  chartDataRequestMock.mockResolvedValue({
    response: { status: 200 },
    json: { result: [] },
  });
  jest.spyOn(SupersetClient, 'post').mockResolvedValue({
    json: { result: {} },
  } as any);
  cascadeFilterOptions.clearSellerfoxCascadeFilterOptionsCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FilterValue request lifecycle guards', () => {
  test('starts a new options request when query context changes during an in-flight request', () => {
    expect(
      shouldStartFilterOptionsRequest({
        isRefreshing: true,
        formDataChanged: true,
        ownStateChanged: false,
        shouldRefresh: false,
      }),
    ).toBe(true);
  });

  test('does not duplicate refresh-only requests while a refresh request is already in flight', () => {
    expect(
      shouldStartFilterOptionsRequest({
        isRefreshing: true,
        formDataChanged: false,
        ownStateChanged: false,
        shouldRefresh: true,
      }),
    ).toBe(false);
  });

  test('does not start a first options request while a filter has not been opened', () => {
    expect(
      shouldLoadFilterOptions({
        defaultToFirstItem: false,
        hasLoadedOptions: false,
        isFilterActive: false,
      }),
    ).toBe(false);
    expect(
      shouldStartFilterOptionsRequest({
        isRefreshing: false,
        formDataChanged: true,
        ownStateChanged: false,
        shouldRefresh: false,
        shouldLoadOptions: false,
        hasLoadedOptions: false,
      }),
    ).toBe(false);
  });

  test('allows a batchable filter to preload its first options request', () => {
    expect(
      shouldLoadFilterOptions({
        defaultToFirstItem: false,
        hasLoadedOptions: false,
        isFilterActive: false,
        isBatchableFilter: true,
      }),
    ).toBe(true);
    expect(
      shouldStartFilterOptionsRequest({
        isRefreshing: false,
        formDataChanged: false,
        ownStateChanged: false,
        shouldRefresh: false,
        shouldLoadOptions: true,
        hasLoadedOptions: false,
      }),
    ).toBe(true);
  });

  test('preloads a range filter to obtain its minimum and maximum', () => {
    expect(
      shouldLoadFilterOptions({
        defaultToFirstItem: false,
        hasLoadedOptions: false,
        isFilterActive: false,
        isRangeFilter: true,
      }),
    ).toBe(true);
  });

  test('starts the first options request when a filter is opened', () => {
    expect(
      shouldLoadFilterOptions({
        defaultToFirstItem: false,
        hasLoadedOptions: false,
        isFilterActive: true,
      }),
    ).toBe(true);
    expect(
      shouldStartFilterOptionsRequest({
        isRefreshing: false,
        formDataChanged: false,
        ownStateChanged: false,
        shouldRefresh: false,
        shouldLoadOptions: true,
        hasLoadedOptions: false,
      }),
    ).toBe(true);
  });

  test('keeps loading options for filters that need an initial first item default', () => {
    expect(
      shouldLoadFilterOptions({
        defaultToFirstItem: true,
        hasLoadedOptions: false,
        isFilterActive: false,
      }),
    ).toBe(true);
  });

  test('allows already loaded filters to refresh their options', () => {
    expect(
      shouldLoadFilterOptions({
        defaultToFirstItem: false,
        hasLoadedOptions: true,
        isFilterActive: false,
      }),
    ).toBe(true);
    expect(
      shouldStartFilterOptionsRequest({
        isRefreshing: false,
        formDataChanged: false,
        ownStateChanged: false,
        shouldRefresh: true,
        shouldLoadOptions: true,
        hasLoadedOptions: true,
      }),
    ).toBe(true);
  });

  test('applies only the latest request for the current dashboard', () => {
    expect(
      shouldApplyFilterOptionsRequestResult({
        requestId: 3,
        currentRequestId: 3,
        requestDashboardId: 44,
        currentDashboardId: 44,
      }),
    ).toBe(true);
    expect(
      shouldApplyFilterOptionsRequestResult({
        requestId: 2,
        currentRequestId: 3,
        requestDashboardId: 44,
        currentDashboardId: 44,
      }),
    ).toBe(false);
    expect(
      shouldApplyFilterOptionsRequestResult({
        requestId: 3,
        currentRequestId: 3,
        requestDashboardId: 44,
        currentDashboardId: 51,
      }),
    ).toBe(false);
  });
});

describe('FilterValue custom time dependency integration', () => {
  test.each([
    ['pending', createNativeFilter('time')],
    ['invalid', createNativeFilter('time')],
    [
      'conflict',
      {
        timeA: createNativeFilter('timeA', {
          defaultDataMask: {
            extraFormData: { time_range: '2026-01-01 : 2026-01-07' },
          },
        }),
        timeB: createNativeFilter('timeB', {
          defaultDataMask: {
            extraFormData: { time_range: '2026-02-01 : 2026-02-07' },
          },
        }),
      },
    ],
  ])(
    'does not request cascade or chart data when the time dependency is %s',
    async (status, timeFilters) => {
      const nativeFilters = {
        ...(status === 'conflict'
          ? timeFilters
          : { time: timeFilters as Record<string, any> }),
        shop: childFilter,
      };
      const selected =
        status === 'invalid'
          ? {
              time: {
                id: 'time',
                extraFormData: { filters: [] },
                filterState: { value: null },
              },
            }
          : {};
      const initialized = status === 'invalid' ? new Set(['time']) : new Set();

      renderFilterValue(nativeFilters, selected, initialized);

      await waitFor(() => {
        expect(filterOptionsRequestMock).not.toHaveBeenCalled();
        expect(chartDataRequestMock).not.toHaveBeenCalled();
      });
    },
  );

  test('retries the child with the selected time range after a blocked parent becomes valid', async () => {
    const nativeFilters = {
      time: createNativeFilter('time'),
      shop: childFilter,
    };
    const initiallyCleared = {
      time: {
        id: 'time',
        extraFormData: { filters: [] },
        filterState: { value: null },
      },
    };
    const initialized = new Set(['time']);
    const { rerender } = renderFilterValue(
      nativeFilters,
      initiallyCleared,
      initialized,
    );

    await waitFor(() => {
      expect(filterOptionsRequestMock).not.toHaveBeenCalled();
      expect(chartDataRequestMock).not.toHaveBeenCalled();
    });

    const selectedRange = '2026-03-01 : 2026-03-31';
    const validDataMask = {
      time: {
        id: 'time',
        extraFormData: {
          filters: [
            {
              col: 'earliest_ship_date',
              op: 'TEMPORAL_RANGE',
              val: selectedRange,
            },
          ],
        },
        filterState: { value: selectedRange },
      },
    };

    rerender(
      createElement(
        Provider,
        { store: mockStore(createState(nativeFilters)) },
        createElement(FilterValue, {
          filter: childFilter as any,
          dataMaskSelected: validDataMask as any,
          initializedFilters: initialized,
          onFilterSelectionChange: jest.fn(),
          inView: true,
          isFilterActive: true,
          orientation: FilterBarOrientation.Vertical,
        }),
      ),
    );

    await waitFor(() => {
      expect(filterOptionsRequestMock).toHaveBeenCalledTimes(1);
    });
    expect(SupersetClient.post).toBeDefined();
    const request = await waitFor(() => {
      const call = (SupersetClient.post as unknown as jest.Mock).mock.calls[0];
      expect(call).toBeDefined();
      return call[0];
    });
    expect(request.jsonPayload).toEqual(
      expect.objectContaining({ time_range: selectedRange }),
    );
    expect(chartDataRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        formData: expect.objectContaining({
          extra_form_data: { time_range: selectedRange },
        }),
      }),
    );
  });
});

test('a contains preview keeps the batch cascade path and its five-name search', async () => {
  const original = childFilter.dataMask;
  const controls = childFilter.controlValues;
  childFilter.controlValues = { allowFuzzyMatch: true };
  childFilter.dataMask = {
    filterState: { value: ['品牌'], matchMode: 'contains' },
    ownState: { search: '品牌', searchMatchMode: 'contains' },
  };
  filterOptionsRequestMock.mockResolvedValueOnce({
    shop_name: { data: [], colnames: ['shop_name'], coltypes: [1] },
  });
  try {
    renderFilterValue({ shop: childFilter });
    await waitFor(() =>
      expect(filterOptionsRequestMock).toHaveBeenCalledWith(
        44,
        98,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          search: { column: 'shop_name', value: '品牌' },
        }),
      ),
    );
    expect(chartDataRequestMock).not.toHaveBeenCalled();
  } finally {
    childFilter.dataMask = original;
    childFilter.controlValues = controls;
  }
});
