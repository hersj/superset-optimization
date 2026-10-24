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

import { act, render, screen, userEvent } from 'spec/helpers/testing-library';
import { stateWithoutNativeFilters } from 'spec/fixtures/mockStore';
import { testWithId } from 'src/utils/testUtils';
import { Preset, makeApi } from '@superset-ui/core';
import {
  TimeFilterPlugin,
  SelectFilterPlugin,
  RangeFilterPlugin,
  CustomTimeFilterPlugin,
} from 'src/filters/components';
import fetchMock from 'fetch-mock';
import { FilterBarOrientation } from 'src/dashboard/types';
import { FILTER_BAR_TEST_ID } from './utils';
import FilterBar, {
  AUTO_APPLY_DEBOUNCE_MS,
  createDebouncedDataMaskApplier,
  getAutoApplyDataMaskUpdates,
  getPendingFilterState,
  getDataMaskForRedux,
  shouldAutoApplyDataMask,
  shouldPublishAppliedDataMask,
  shouldPublishDataMask,
} from '.';
import { FILTERS_CONFIG_MODAL_TEST_ID } from '../FiltersConfigModal/FiltersConfigModal';
import * as dataMaskActions from 'src/dataMask/actions';
import dataMaskReducer from 'src/dataMask/reducer';
import {
  readPendingFilterState,
  writePendingFilterState,
} from 'src/dashboard/util/pendingFilterState';

jest.useFakeTimers();

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  makeApi: jest.fn(),
}));

const mockedMakeApi = makeApi as jest.Mock;

// Register preset once for all tests
class MainPreset extends Preset {
  constructor() {
    super({
      name: 'Legacy charts',
      plugins: [
        new TimeFilterPlugin().configure({ key: 'filter_time' }),
        new SelectFilterPlugin().configure({ key: 'filter_select' }),
        new RangeFilterPlugin().configure({ key: 'filter_range' }),
        new CustomTimeFilterPlugin().configure({ key: 'filter_custom_time' }),
      ],
    });
  }
}

new MainPreset().register();

fetchMock.get('glob:*/api/v1/dataset/7', {
  description_columns: {},
  id: 1,
  label_columns: { columns: 'Columns', table_name: 'Table Name' },
  result: {
    metrics: [],
    columns: [{ column_name: 'Column A', id: 1 }],
    table_name: 'birth_names',
    id: 1,
  },
  show_columns: ['id', 'table_name'],
});

// Cleanup between tests
beforeEach(() => {
  jest.clearAllMocks();
});

describe('shouldPublishDataMask', () => {
  test('does not publish the just-hydrated applied data mask again', () => {
    const restoredDataMask = JSON.stringify({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    });

    expect(shouldPublishDataMask(restoredDataMask, restoredDataMask)).toBe(
      false,
    );
  });

  test('publishes when the applied data mask changes after hydration', () => {
    const restoredDataMask = JSON.stringify({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    });
    const changedDataMask = JSON.stringify({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-b'] } },
    });

    expect(shouldPublishDataMask(changedDataMask, restoredDataMask)).toBe(true);
  });

  test('does not publish while filter bar initialization is still adopting hydrated state', () => {
    const restoredDataMask = JSON.stringify({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    });

    expect(
      shouldPublishAppliedDataMask({
        dataMaskText: restoredDataMask,
        lastPublishedDataMaskText: '{}',
        isInitialized: false,
        hasPublishBaseline: true,
      }),
    ).toBe(false);
  });

  test('does not publish the first initialized data mask baseline', () => {
    const restoredDataMask = JSON.stringify({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    });

    expect(
      shouldPublishAppliedDataMask({
        dataMaskText: restoredDataMask,
        lastPublishedDataMaskText: '{}',
        isInitialized: true,
        hasPublishBaseline: false,
      }),
    ).toBe(false);
  });

  test('publishes changed data masks after initialization baseline is established', () => {
    const restoredDataMask = JSON.stringify({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    });
    const changedDataMask = JSON.stringify({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-b'] } },
    });

    expect(
      shouldPublishAppliedDataMask({
        dataMaskText: changedDataMask,
        lastPublishedDataMaskText: restoredDataMask,
        isInitialized: true,
        hasPublishBaseline: true,
      }),
    ).toBe(true);
  });
});

describe('pending selection before automatic apply', () => {
  test('restores a cleared keyword before auto apply or server save can run', () => {
    localStorage.clear();
    const id = 'NATIVE_FILTER-1';
    const applied = {
      [id]: {
        id,
        filterState: { value: ['old'], searchValue: 'old' },
        extraFormData: {},
      },
    };
    const cleared = {
      filterState: { value: null, searchValue: '' },
      extraFormData: {},
    };
    const apply = jest.fn();
    const applier = createDebouncedDataMaskApplier(apply);
    const pending = getPendingFilterState(
      { ...applied, [id]: { ...cleared, id } },
      applied,
      new Set([id]),
    );
    writePendingFilterState(1, 87, 'same-url', JSON.stringify(pending));
    applier.schedule(id, cleared);
    expect(apply).not.toHaveBeenCalled();
    expect(readPendingFilterState(1, 87, 'same-url')).toMatchObject({
      [id]: { ...cleared, id },
    });
    expect(JSON.stringify(pending)).toBe(
      JSON.stringify(
        dataMaskReducer(
          applied,
          dataMaskActions.updateDataMasks({ [id]: cleared }),
        ),
      ),
    );
    applier.cancel();
  });

  test('keeps rapid choices in two filters and ignores out of scope drafts', () => {
    const a = { id: 'a', filterState: { value: ['old'] }, extraFormData: {} };
    const b = { id: 'b', filterState: { value: ['old'] }, extraFormData: {} };
    const applied = { a, b };
    const first = getPendingFilterState(
      { a: { ...a, filterState: { value: ['new-a'] } }, b },
      applied,
      new Set(['a', 'b']),
    );
    const second = getPendingFilterState(
      {
        ...first,
        b: { ...b, filterState: { value: ['new-b'] } },
        outside: { id: 'outside', filterState: { value: ['ignored'] } },
      },
      applied,
      new Set(['a', 'b']),
    );
    expect(second.a.filterState?.value).toEqual(['new-a']);
    expect(second.b.filterState?.value).toEqual(['new-b']);
    expect(second).not.toHaveProperty('outside');
  });
});

describe('automatic filter apply batching', () => {
  test('dispatches only the final selected data mask after the debounce window', () => {
    const apply = jest.fn();
    const applier = createDebouncedDataMaskApplier(
      apply,
      AUTO_APPLY_DEBOUNCE_MS,
    );

    applier.schedule('NATIVE_FILTER-1', {
      filterState: { value: ['shop-a'] },
      extraFormData: {
        filters: [{ col: 'shop_name', op: 'IN', val: ['shop-a'] }],
      },
    });
    applier.schedule('NATIVE_FILTER-1', {
      filterState: { value: ['shop-b'] },
      extraFormData: {
        filters: [{ col: 'shop_name', op: 'IN', val: ['shop-b'] }],
      },
    });

    jest.advanceTimersByTime(AUTO_APPLY_DEBOUNCE_MS - 1);
    expect(apply).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith([
      [
        'NATIVE_FILTER-1',
        {
          filterState: { value: ['shop-b'] },
          extraFormData: {
            filters: [{ col: 'shop_name', op: 'IN', val: ['shop-b'] }],
          },
        },
      ],
    ]);
  });

  test('does not auto apply restored or equivalent data masks', () => {
    const selectedMask = {
      id: 'NATIVE_FILTER-1',
      filterState: { value: ['shop-a'], validateStatus: 'error' },
      extraFormData: {
        filters: [{ col: 'shop_name', op: 'IN', val: ['shop-a'] }],
      },
    } as any;
    const appliedMask = {
      id: 'NATIVE_FILTER-1',
      filterState: { value: ['shop-a'] },
      extraFormData: {
        filters: [{ col: 'shop_name', op: 'IN', val: ['shop-a'] }],
      },
    } as any;

    expect(getDataMaskForRedux(selectedMask)).toEqual(appliedMask);
    expect(shouldAutoApplyDataMask(selectedMask, appliedMask)).toBe(false);
  });

  test('builds one bulk update payload from pending auto apply entries', () => {
    const updates = getAutoApplyDataMaskUpdates(
      [
        [
          'NATIVE_FILTER-1',
          {
            filterState: { value: ['shop-b'], validateStatus: 'error' },
            extraFormData: {
              filters: [{ col: 'shop_name', op: 'IN', val: ['shop-b'] }],
            },
          } as any,
        ],
        [
          'NATIVE_FILTER-2',
          {
            filterState: { value: ['same'] },
            extraFormData: {
              filters: [{ col: 'country', op: 'IN', val: ['same'] }],
            },
          },
        ],
        [
          'NATIVE_FILTER-out-of-scope',
          {
            filterState: { value: ['ignored'] },
          },
        ],
      ],
      {
        'NATIVE_FILTER-1': {
          id: 'NATIVE_FILTER-1',
          filterState: { value: ['shop-a'] },
          extraFormData: {
            filters: [{ col: 'shop_name', op: 'IN', val: ['shop-a'] }],
          },
        },
        'NATIVE_FILTER-2': {
          id: 'NATIVE_FILTER-2',
          filterState: { value: ['same'] },
          extraFormData: {
            filters: [{ col: 'country', op: 'IN', val: ['same'] }],
          },
        },
      } as any,
      new Set(['NATIVE_FILTER-1', 'NATIVE_FILTER-2']),
    );

    expect(updates).toEqual({
      'NATIVE_FILTER-1': {
        filterState: { value: ['shop-b'] },
        extraFormData: {
          filters: [{ col: 'shop_name', op: 'IN', val: ['shop-b'] }],
        },
      },
    });
  });
});

const getTestId = testWithId<string>(FILTER_BAR_TEST_ID, true);
const getModalTestId = testWithId<string>(FILTERS_CONFIG_MODAL_TEST_ID, true);

function createClosedBarProps(toggleFiltersBar = jest.fn()) {
  return { filtersOpen: false, toggleFiltersBar };
}

function createOpenedBarProps(toggleFiltersBar = jest.fn()) {
  return { filtersOpen: true, toggleFiltersBar };
}

function createMockApi(filterName = 'Time filter 1') {
  return jest.fn(async data => {
    if (!data?.modified?.length) {
      return { id: 1234, result: [] };
    }
    const filterId = data.modified[0].id;
    return {
      id: 1234,
      result: [
        {
          id: filterId,
          name: filterName,
          filterType: 'filter_time',
          targets: [{ datasetId: 11, column: { name: 'color' } }],
          defaultDataMask: { filterState: { value: null } },
          controlValues: {},
          cascadeParentIds: [],
          scope: { rootPath: ['ROOT_ID'], excluded: [] },
        },
      ],
    };
  });
}

function createFilter(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || 'test-filter';
  return {
    id,
    name: 'Test Filter',
    filterType: 'filter_select',
    targets: [{ datasetId: 1, column: { name: 'test_column' } }],
    defaultDataMask: { filterState: { value: null }, extraFormData: {} },
    controlValues: {},
    cascadeParentIds: [],
    scope: { rootPath: ['ROOT_ID'], excluded: [] },
    type: 'NATIVE_FILTER',
    description: '',
    chartsInScope: [],
    tabsInScope: [],
    ...overrides,
  };
}

function createDataMask(
  filterId: string,
  value: unknown = undefined,
  extraFormData: Record<string, unknown> = {},
) {
  return {
    id: filterId,
    filterState: { value },
    extraFormData,
  };
}

function createDivider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'NATIVE_FILTER_DIVIDER-1',
    type: 'DIVIDER',
    scope: { rootPath: ['ROOT_ID'], excluded: [] },
    title: 'Select time range',
    description: 'Select year/month etc..',
    chartsInScope: [],
    tabsInScope: [],
    ...overrides,
  };
}

function createStateWithFilter(
  filter: ReturnType<typeof createFilter>,
  dataMask: ReturnType<typeof createDataMask>,
  dashboardInfoOverrides: Record<string, unknown> = {},
) {
  return {
    ...stateWithoutNativeFilters,
    dashboardInfo: {
      id: 1,
      dash_edit_perm: true,
      metadata: {
        native_filter_configuration: [filter],
      },
      ...dashboardInfoOverrides,
    },
    dashboardState: {
      ...stateWithoutNativeFilters.dashboardState,
      activeTabs: ['ROOT_ID'],
    },
    dataMask: { [filter.id]: dataMask },
    nativeFilters: {
      filters: { [filter.id]: filter },
      filtersState: {},
    },
  };
}

function setupTimeRangeMocks() {
  const urls = {
    noFilter: 'glob:*/api/v1/time_range/?q=%27No%20filter%27',
    lastDay: 'glob:*/api/v1/time_range/?q=%27Last%20day%27',
    lastWeek: 'glob:*/api/v1/time_range/?q=%27Last%20week%27',
  };

  fetchMock.removeRoute(urls.noFilter);
  fetchMock.get(
    urls.noFilter,
    { result: { since: '', until: '', timeRange: 'No filter' } },
    { name: urls.noFilter },
  );

  fetchMock.removeRoute(urls.lastDay);
  fetchMock.get(
    urls.lastDay,
    {
      result: {
        since: '2021-04-13T00:00:00',
        until: '2021-04-14T00:00:00',
        timeRange: 'Last day',
      },
    },
    { name: urls.lastDay },
  );

  fetchMock.removeRoute(urls.lastWeek);
  fetchMock.get(
    urls.lastWeek,
    {
      result: {
        since: '2021-04-07T00:00:00',
        until: '2021-04-14T00:00:00',
        timeRange: 'Last week',
      },
    },
    { name: urls.lastWeek },
  );
}

function renderFilterBar(
  props: { filtersOpen: boolean; toggleFiltersBar: jest.Mock },
  state?: object,
) {
  return render(
    <FilterBar
      orientation={FilterBarOrientation.Vertical}
      verticalConfig={{
        width: 280,
        height: 400,
        offset: 0,
        ...props,
      }}
    />,
    {
      initialState: state,
      useDnd: true,
      useRedux: true,
      useRouter: true,
    },
  );
}

test('FilterBar renders without crashing', () => {
  const props = createClosedBarProps();
  const { container } = renderFilterBar(props);
  expect(container).toBeInTheDocument();
});

test('FilterBar renders "Filters and controls" heading', () => {
  const props = createClosedBarProps();
  renderFilterBar(props);
  expect(screen.getByText('Filters and controls')).toBeInTheDocument();
});

test('FilterBar renders "Clear all" button', () => {
  const props = createClosedBarProps();
  renderFilterBar(props);
  expect(screen.getByText('Clear all')).toBeInTheDocument();
});

test('FilterBar renders "Apply filters" button', () => {
  const props = createClosedBarProps();
  renderFilterBar(props);
  expect(screen.getByText('Apply filters')).toBeInTheDocument();
});

test('FilterBar renders collapse icon', () => {
  const props = createClosedBarProps();
  renderFilterBar(props);
  expect(
    screen.getByRole('img', { name: 'vertical-align' }),
  ).toBeInTheDocument();
});

test('FilterBar renders filter icon', () => {
  const props = createClosedBarProps();
  renderFilterBar(props);
  expect(screen.getByRole('img', { name: 'filter' })).toBeInTheDocument();
});

test('FilterBar calls toggleFiltersBar when collapse icon is clicked', () => {
  const toggleFiltersBar = jest.fn();
  const props = createClosedBarProps(toggleFiltersBar);
  renderFilterBar(props);

  const collapse = screen.getByRole('img', { name: 'vertical-align' });
  expect(toggleFiltersBar).not.toHaveBeenCalled();

  userEvent.click(collapse);
  expect(toggleFiltersBar).toHaveBeenCalled();
});

test('FilterBar opens when expand button is clicked', () => {
  const toggleFiltersBar = jest.fn();
  const props = createClosedBarProps(toggleFiltersBar);
  renderFilterBar(props);

  expect(screen.getByTestId(getTestId('filter-icon'))).toBeInTheDocument();
  expect(screen.getByTestId(getTestId('expand-button'))).toBeInTheDocument();

  userEvent.click(screen.getByTestId(getTestId('collapsable')));
  expect(toggleFiltersBar).toHaveBeenCalledWith(true);
});

test('FilterBar hides edit filter button when user lacks permissions', () => {
  const props = createOpenedBarProps();
  const stateWithoutPermissions = {
    ...stateWithoutNativeFilters,
    dashboardInfo: { metadata: {} },
  };

  renderFilterBar(props, stateWithoutPermissions);

  expect(
    screen.queryByTestId(getTestId('create-filter')),
  ).not.toBeInTheDocument();
});

test('FilterBar closes when collapse button is clicked', () => {
  const toggleFiltersBar = jest.fn();
  const props = createOpenedBarProps(toggleFiltersBar);
  renderFilterBar(props);

  const collapseButton = screen.getByTestId(getTestId('collapse-button'));
  expect(collapseButton).toBeInTheDocument();

  userEvent.click(collapseButton);
  expect(toggleFiltersBar).toHaveBeenCalledWith(false);
});

test('FilterBar disables buttons when there are no filters', () => {
  const props = createOpenedBarProps();
  renderFilterBar(props, stateWithoutNativeFilters);

  expect(screen.getByTestId(getTestId('clear-button'))).toBeDisabled();
  expect(screen.getByTestId(getTestId('apply-button'))).toBeDisabled();
});

test('FilterBar renders dividers with title and description', async () => {
  const props = createOpenedBarProps();
  const divider = createDivider();
  const stateWithDivider = {
    ...stateWithoutNativeFilters,
    dashboardInfo: {
      ...stateWithoutNativeFilters.dashboardInfo,
      metadata: {
        ...stateWithoutNativeFilters.dashboardInfo.metadata,
        native_filter_configuration: [divider],
      },
    },
    nativeFilters: {
      filters: { [divider.id]: divider },
    },
  };

  renderFilterBar(props, stateWithDivider);

  await act(async () => {
    jest.advanceTimersByTime(1000);
  });

  const title = await screen.findByText('Select time range');
  const description = await screen.findByText('Select year/month etc..');

  expect(title.tagName).toBe('H3');
  expect(description.tagName).toBe('P');
  expect(screen.getByTestId(getTestId('clear-button'))).toBeDisabled();
  expect(screen.getByTestId(getTestId('apply-button'))).toBeDisabled();
});

test('FilterBar apply button is disabled after creating a filter', async () => {
  setupTimeRangeMocks();
  mockedMakeApi.mockReturnValue(createMockApi());

  const props = createOpenedBarProps();
  renderFilterBar(props, stateWithoutNativeFilters);

  expect(screen.getByTestId(getTestId('apply-button'))).toBeDisabled();

  // Simulate add filter flow
  userEvent.click(screen.getByTestId(getTestId('collapsable')));
  userEvent.click(screen.getByLabelText('setting'));
  userEvent.click(screen.getByText('Add or edit filters and controls'));
  userEvent.click(screen.getByText('Value'));
  userEvent.click(screen.getByText('Time range'));
  userEvent.type(
    screen.getByTestId(getModalTestId('name-input')),
    'Time filter 1',
  );
  userEvent.click(screen.getByText('Save'));

  expect(screen.getByTestId(getTestId('apply-button'))).toBeDisabled();
});

test('FilterBar renders without errors when filter has required controlValues', () => {
  const props = createOpenedBarProps();
  const filter = createFilter({
    id: 'test-filter',
    controlValues: { enableEmptyFilter: true },
  });
  const dataMask = createDataMask('test-filter', undefined, {});
  const state = createStateWithFilter(filter, dataMask);

  const { container } = renderFilterBar(props, state);
  expect(container).toBeInTheDocument();
});

test('FilterBar does not crash when filter has value but empty extraFormData', async () => {
  const filterId = 'test-filter-auto-apply';
  const updateDataMaskSpy = jest.spyOn(dataMaskActions, 'updateDataMask');
  const props = createOpenedBarProps();

  const filter = createFilter({
    id: filterId,
    requiredFirst: true,
    controlValues: { enableEmptyFilter: true },
    defaultDataMask: {
      filterState: { value: ['value1'] },
      extraFormData: {},
    },
  });

  const dataMask = createDataMask(filterId, ['value1'], {});
  const state = createStateWithFilter(filter, dataMask);

  renderFilterBar(props, state);

  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  expect(screen.getByTestId(getTestId('filter-icon'))).toBeInTheDocument();
  expect(screen.getByText('Filters and controls')).toBeInTheDocument();

  // The filter value should not be cleared during initialization
  expect(updateDataMaskSpy).not.toHaveBeenCalled();

  updateDataMaskSpy.mockRestore();
});

test('FilterBar renders correctly when filter has complete extraFormData', async () => {
  const filterId = 'test-filter-complete';
  const props = createOpenedBarProps();
  const filter = createFilter({
    id: filterId,
    controlValues: { enableEmptyFilter: true },
    defaultDataMask: {
      filterState: { value: ['value1'] },
      extraFormData: {
        filters: [{ col: 'test_column', op: 'IN', val: ['value1'] }],
      },
    },
  });
  const dataMask = createDataMask(filterId, ['value1'], {
    filters: [{ col: 'test_column', op: 'IN', val: ['value1'] }],
  });
  const state = createStateWithFilter(filter, dataMask);

  renderFilterBar(props, state);

  await act(async () => {
    jest.advanceTimersByTime(100);
  });

  expect(screen.getByTestId(getTestId('filter-icon'))).toBeInTheDocument();
});

test('handleClearAll dispatches one updateDataMasks payload with value undefined for filter_select', async () => {
  const filterId = 'NATIVE_FILTER-clear-select';
  const updateDataMasksSpy = jest.spyOn(dataMaskActions, 'updateDataMasks');
  const selectFilter = createFilter({
    id: filterId,
    name: 'Region',
    filterType: 'filter_select',
    targets: [{ datasetId: 7, column: { name: 'region' } }],
    defaultDataMask: { filterState: { value: null }, extraFormData: {} },
    chartsInScope: [18],
  });
  const stateWithSelect = {
    ...stateWithoutNativeFilters,
    dashboardInfo: {
      id: 1,
      dash_edit_perm: true,
      filterBarOrientation: FilterBarOrientation.Vertical,
      metadata: {
        native_filter_configuration: [selectFilter],
        chart_configuration: {},
      },
    },
    dashboardState: {
      ...stateWithoutNativeFilters.dashboardState,
      activeTabs: ['ROOT_ID'],
    },
    dataMask: {
      [filterId]: createDataMask(filterId, ['East']),
    },
    nativeFilters: {
      filters: { [filterId]: selectFilter },
      filtersState: {},
    },
  };

  const props = createOpenedBarProps();
  renderFilterBar(props, stateWithSelect);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  const clearBtn = screen.getByTestId(getTestId('clear-button'));
  expect(clearBtn).not.toBeDisabled();
  await act(async () => {
    userEvent.click(clearBtn);
  });

  expect(updateDataMasksSpy).toHaveBeenCalledWith({
    [filterId]: {
      filterState: { value: undefined },
      extraFormData: {},
    },
  });
  updateDataMasksSpy.mockRestore();
});

test('handleClearAll dispatches one updateDataMasks payload with [null, null] for filter_range', async () => {
  fetchMock.post('glob:*/api/v1/chart/data', {
    result: [{ data: [{ min: 0, max: 100 }] }],
  });
  const filterId = 'NATIVE_FILTER-clear-range';
  const updateDataMasksSpy = jest.spyOn(dataMaskActions, 'updateDataMasks');
  const rangeFilter = createFilter({
    id: filterId,
    name: 'Age',
    filterType: 'filter_range',
    targets: [{ datasetId: 7, column: { name: 'age' } }],
    defaultDataMask: { filterState: { value: null }, extraFormData: {} },
    chartsInScope: [18],
  });
  const stateWithRange = {
    ...stateWithoutNativeFilters,
    dashboardInfo: {
      id: 1,
      dash_edit_perm: true,
      filterBarOrientation: FilterBarOrientation.Vertical,
      metadata: {
        native_filter_configuration: [rangeFilter],
        chart_configuration: {},
      },
    },
    dashboardState: {
      ...stateWithoutNativeFilters.dashboardState,
      activeTabs: ['ROOT_ID'],
    },
    dataMask: {
      [filterId]: createDataMask(filterId, [10, 50]),
    },
    nativeFilters: {
      filters: { [filterId]: rangeFilter },
      filtersState: {},
    },
  };

  const props = createOpenedBarProps();
  renderFilterBar(props, stateWithRange);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  const clearBtn = screen.getByTestId(getTestId('clear-button'));
  expect(clearBtn).not.toBeDisabled();
  await act(async () => {
    userEvent.click(clearBtn);
  });

  expect(updateDataMasksSpy).toHaveBeenCalledWith({
    [filterId]: {
      filterState: { value: [null, null] },
      extraFormData: {},
    },
  });
  updateDataMasksSpy.mockRestore();
});

test('handleClearAll only includes filters present in dataMask', async () => {
  const idInMask = 'NATIVE_FILTER-has-value';
  const idNotInMask = 'NATIVE_FILTER-no-value';
  const updateDataMasksSpy = jest.spyOn(dataMaskActions, 'updateDataMasks');
  const filterInMask = createFilter({
    id: idInMask,
    name: 'A',
    filterType: 'filter_select',
    targets: [{ datasetId: 7, column: { name: 'x' } }],
    chartsInScope: [18],
  });
  const filterNotInMask = createFilter({
    id: idNotInMask,
    name: 'B',
    filterType: 'filter_select',
    targets: [{ datasetId: 7, column: { name: 'x' } }],
    chartsInScope: [18],
  });
  const stateWithTwoFilters = {
    ...stateWithoutNativeFilters,
    dashboardInfo: {
      id: 1,
      dash_edit_perm: true,
      filterBarOrientation: FilterBarOrientation.Vertical,
      metadata: {
        native_filter_configuration: [filterInMask, filterNotInMask],
        chart_configuration: {},
      },
    },
    dashboardState: {
      ...stateWithoutNativeFilters.dashboardState,
      activeTabs: ['ROOT_ID'],
    },
    dataMask: {
      [idInMask]: createDataMask(idInMask, ['v']),
    },
    nativeFilters: {
      filters: {
        [idInMask]: filterInMask,
        [idNotInMask]: filterNotInMask,
      },
      filtersState: {},
    },
  };

  const props = createOpenedBarProps();
  renderFilterBar(props, stateWithTwoFilters);
  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  const clearBtn = screen.getByTestId(getTestId('clear-button'));
  await act(async () => {
    userEvent.click(clearBtn);
  });

  expect(updateDataMasksSpy).toHaveBeenCalledTimes(1);
  expect(updateDataMasksSpy).toHaveBeenCalledWith({
    [idInMask]: {
      filterState: { value: undefined },
      extraFormData: {},
    },
  });
  expect(updateDataMasksSpy).not.toHaveBeenCalledWith(
    expect.objectContaining({
      [idNotInMask]: expect.anything(),
    }),
  );
  updateDataMasksSpy.mockRestore();
});

test('FilterBar Clear All only clears in-scope filters, not out-of-scope ones', async () => {
  const inScopeFilterId = 'NATIVE_FILTER-in-scope';
  const outOfScopeRequiredFilterId = 'NATIVE_FILTER-out-of-scope-required';
  const outOfScopeNonRequiredFilterId =
    'NATIVE_FILTER-out-of-scope-non-required';
  const updateDataMasksSpy = jest.spyOn(dataMaskActions, 'updateDataMasks');

  const dashboardLayoutWithTabs = {
    ROOT_ID: { id: 'ROOT_ID', type: 'ROOT', children: ['TABS-1'] },
    'TABS-1': {
      id: 'TABS-1',
      type: 'TABS',
      children: ['TAB-active', 'TAB-inactive'],
    },
    'TAB-active': {
      id: 'TAB-active',
      type: 'TAB',
      children: ['CHART_ROW-1'],
      meta: { text: 'Active Tab' },
      parents: ['ROOT_ID', 'TABS-1'],
    },
    'TAB-inactive': {
      id: 'TAB-inactive',
      type: 'TAB',
      children: ['CHART_ROW-2'],
      meta: { text: 'Inactive Tab' },
      parents: ['ROOT_ID', 'TABS-1'],
    },
    'CHART_ROW-1': {
      id: 'CHART_ROW-1',
      type: 'CHART',
      meta: { chartId: 1 },
      parents: ['ROOT_ID', 'TABS-1', 'TAB-active'],
    },
    'CHART_ROW-2': {
      id: 'CHART_ROW-2',
      type: 'CHART',
      meta: { chartId: 2 },
      parents: ['ROOT_ID', 'TABS-1', 'TAB-inactive'],
    },
  };

  const inScopeFilter = createFilter({
    id: inScopeFilterId,
    name: 'In Scope Filter',
    targets: [{ datasetId: 1, column: { name: 'column1' } }],
    controlValues: { enableEmptyFilter: false },
    chartsInScope: [1],
    tabsInScope: ['TAB-active'],
  });

  const outOfScopeRequiredFilter = createFilter({
    id: outOfScopeRequiredFilterId,
    name: 'Out of Scope Required Filter',
    targets: [{ datasetId: 1, column: { name: 'column2' } }],
    controlValues: { enableEmptyFilter: true },
    chartsInScope: [2],
    tabsInScope: ['TAB-inactive'],
  });

  const outOfScopeNonRequiredFilter = createFilter({
    id: outOfScopeNonRequiredFilterId,
    name: 'Out of Scope Non-Required Filter',
    targets: [{ datasetId: 1, column: { name: 'column3' } }],
    controlValues: { enableEmptyFilter: false },
    chartsInScope: [2],
    tabsInScope: ['TAB-inactive'],
  });

  const stateWithTabsAndFilters = {
    ...stateWithoutNativeFilters,
    dashboardLayout: {
      present: dashboardLayoutWithTabs,
      past: [],
      future: [],
    },
    dashboardState: {
      ...stateWithoutNativeFilters.dashboardState,
      activeTabs: ['TAB-active'],
    },
    dashboardInfo: {
      id: 1,
      dash_edit_perm: true,
      metadata: {
        native_filter_configuration: [
          inScopeFilter,
          outOfScopeRequiredFilter,
          outOfScopeNonRequiredFilter,
        ],
      },
    },
    dataMask: {
      [inScopeFilterId]: createDataMask(inScopeFilterId, ['value1'], {
        filters: [{ col: 'column1', op: 'IN', val: ['value1'] }],
      }),
      [outOfScopeRequiredFilterId]: createDataMask(
        outOfScopeRequiredFilterId,
        ['value2'],
        { filters: [{ col: 'column2', op: 'IN', val: ['value2'] }] },
      ),
      [outOfScopeNonRequiredFilterId]: createDataMask(
        outOfScopeNonRequiredFilterId,
        ['value3'],
        { filters: [{ col: 'column3', op: 'IN', val: ['value3'] }] },
      ),
    },
    nativeFilters: {
      filters: {
        [inScopeFilterId]: inScopeFilter,
        [outOfScopeRequiredFilterId]: outOfScopeRequiredFilter,
        [outOfScopeNonRequiredFilterId]: outOfScopeNonRequiredFilter,
      },
      filtersState: {},
    },
  };

  const props = createOpenedBarProps();
  renderFilterBar(props, stateWithTabsAndFilters);

  await act(async () => {
    jest.advanceTimersByTime(300);
  });

  const clearButton = screen.getByTestId(getTestId('clear-button'));
  expect(clearButton).toBeInTheDocument();

  await act(async () => {
    userEvent.click(clearButton);
  });

  const clearedDataMasks = updateDataMasksSpy.mock.calls[0][0];
  expect(Object.keys(clearedDataMasks)).toContain(inScopeFilterId);
  expect(Object.keys(clearedDataMasks)).not.toContain(
    outOfScopeRequiredFilterId,
  );
  expect(Object.keys(clearedDataMasks)).not.toContain(
    outOfScopeNonRequiredFilterId,
  );

  // Verify the in-scope filter was cleared with the correct value
  expect(updateDataMasksSpy).toHaveBeenCalledWith({
    [inScopeFilterId]: {
      filterState: { value: undefined },
      extraFormData: {},
    },
  });

  updateDataMasksSpy.mockRestore();
});

test.each([
  ['error', '2026-08-17', '2026-08-05', true],
  [undefined, '2026-08-05', '2026-08-17', false],
])(
  'pending chart customization cannot bypass CustomTime validation %s',
  (validateStatus, comparisonStartDate, comparisonEndDate, disabled) => {
    const filterId = 'NATIVE_FILTER-custom-period-validation';
    const range = '2026-10-01 : 2026-10-14';
    const dataMask = {
      ...createDataMask(filterId, range, {
        custom_form_data: { custom_period_comparison: null },
      }),
      filterState: {
        value: range,
        grain: 'day',
        customComparisonMode: 'custom',
        comparisonStartDate,
        comparisonEndDate,
        validateStatus,
      },
    };
    const filter = createFilter({
      id: filterId,
      filterType: 'filter_custom_time',
      targets: [{ datasetId: 7, column: { name: 'Column A' } }],
      controlValues: { enableCustomComparison: true, defaultGrain: 'day' },
      defaultDataMask: dataMask,
    });
    const state = createStateWithFilter(filter, dataMask, {
      pendingChartCustomizations: {
        pending: {
          id: 'pending',
          type: 'CHART_CUSTOMIZATION',
          name: 'Pending chart control',
          removed: false,
        },
      },
    });
    renderFilterBar(createClosedBarProps(), state);
    const apply = screen.getByTestId(getTestId('apply-button'));
    expect(apply).toHaveProperty('disabled', disabled);
    const updateSpy = jest.spyOn(dataMaskActions, 'updateDataMasks');
    if (disabled) userEvent.click(apply);
    expect(updateSpy).not.toHaveBeenCalled();
    updateSpy.mockRestore();
  },
);
