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
import { writePendingFilterState } from 'src/dashboard/util/pendingFilterState';
import { URL_PARAMS } from 'src/constants';
import { getUrlParam } from 'src/utils/urlUtils';
import {
  getFilterValue,
  getLastFilterValue,
  getPermalinkValue,
} from 'src/dashboard/components/nativeFilters/FilterBar/keyValue';
import {
  loadDashboardDataMask,
  shouldSaveLastFilterState,
} from './DashboardPage';

jest.mock('src/utils/urlUtils', () => ({
  getUrlParam: jest.fn(),
}));

jest.mock('src/dashboard/components/nativeFilters/FilterBar/keyValue', () => ({
  getFilterValue: jest.fn(),
  getLastFilterValue: jest.fn(),
  getPermalinkValue: jest.fn(),
}));

const mockGetUrlParam = getUrlParam as jest.Mock;
const mockGetFilterValue = getFilterValue as jest.Mock;
const mockGetLastFilterValue = getLastFilterValue as jest.Mock;
const mockGetPermalinkValue = getPermalinkValue as jest.Mock;

describe('loadDashboardDataMask', () => {
  const urlValues: Record<string, unknown> = {};

  beforeEach(() => {
    Object.keys(urlValues).forEach(key => delete urlValues[key]);
    jest.clearAllMocks();
    localStorage.clear();
    mockGetUrlParam.mockImplementation(param => urlValues[param.name]);
  });

  test('loads the current user last filter state when URL has no filter state', async () => {
    mockGetLastFilterValue.mockResolvedValue({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    });

    await expect(loadDashboardDataMask(51)).resolves.toEqual({
      dataMask: {
        'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
      },
      activeTabs: null,
      chartStates: null,
      anchor: undefined,
    });
    expect(mockGetLastFilterValue).toHaveBeenCalledWith(51);
  });

  test('prefers native_filters_key over the current user last filter state', async () => {
    urlValues[URL_PARAMS.nativeFiltersKey.name] = 'abc123';
    mockGetFilterValue.mockResolvedValue({ fromKey: true });

    await expect(loadDashboardDataMask(51)).resolves.toEqual({
      dataMask: { fromKey: true },
      activeTabs: null,
      chartStates: null,
      anchor: undefined,
    });
    expect(mockGetFilterValue).toHaveBeenCalledWith(51, 'abc123');
    expect(mockGetLastFilterValue).not.toHaveBeenCalled();
  });

  test('keeps legacy native_filters rison state over stored last filter state', async () => {
    urlValues[URL_PARAMS.nativeFiltersKey.name] = 'abc123';
    urlValues[URL_PARAMS.nativeFilters.name] = '(NATIVE_FILTER-1:())';
    mockGetFilterValue.mockResolvedValue({ fromKey: true });

    await expect(loadDashboardDataMask(51)).resolves.toEqual({
      dataMask: '(NATIVE_FILTER-1:())',
      activeTabs: null,
      chartStates: null,
      anchor: undefined,
    });
    expect(mockGetFilterValue).toHaveBeenCalledWith(51, 'abc123');
    expect(mockGetLastFilterValue).not.toHaveBeenCalled();
  });

  test('prefers permalink state over the current user last filter state', async () => {
    urlValues[URL_PARAMS.permalinkKey.name] = 'permalink-1';
    mockGetPermalinkValue.mockResolvedValue({
      state: {
        dataMask: { fromPermalink: true },
        activeTabs: ['TAB-1'],
        anchor: 'CHART-1',
      },
    });

    await expect(loadDashboardDataMask(51)).resolves.toEqual({
      dataMask: { fromPermalink: true },
      activeTabs: ['TAB-1'],
      chartStates: null,
      anchor: 'CHART-1',
    });
    expect(mockGetPermalinkValue).toHaveBeenCalledWith('permalink-1');
    expect(mockGetLastFilterValue).not.toHaveBeenCalled();
  });
});

describe('shouldSaveLastFilterState', () => {
  test('does not save the just-hydrated dashboard data mask again', () => {
    const restoredDataMask = {
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    };

    expect(
      shouldSaveLastFilterState(
        restoredDataMask,
        JSON.stringify(restoredDataMask),
      ),
    ).toBe(false);
  });

  test('saves when the user changes the hydrated dashboard data mask', () => {
    const restoredDataMask = {
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    };
    const changedDataMask = {
      'NATIVE_FILTER-1': { filterState: { value: ['shop-b'] } },
    };

    expect(
      shouldSaveLastFilterState(
        changedDataMask,
        JSON.stringify(restoredDataMask),
      ),
    ).toBe(true);
  });
});

test('an immediate reload restores the unsaved clear for this user and URL only', async () => {
  mockGetUrlParam.mockImplementation(param =>
    param.name === URL_PARAMS.nativeFiltersKey.name ? 'key' : undefined,
  );
  const cleared = { filter: { filterState: { value: null, searchValue: '' } } };
  writePendingFilterState(1, 87, 'key', JSON.stringify(cleared));
  await expect(loadDashboardDataMask(87, 1)).resolves.toMatchObject({
    dataMask: cleared,
    hasPendingFilterState: true,
  });
  mockGetFilterValue.mockResolvedValue({ fromServer: {} });
  await expect(loadDashboardDataMask(87, 2)).resolves.toMatchObject({
    dataMask: { fromServer: {} },
  });
});

test('pending local state never overrides an explicit permalink', async () => {
  mockGetUrlParam.mockImplementation(param =>
    param.name === URL_PARAMS.permalinkKey.name ? 'shared' : undefined,
  );
  writePendingFilterState(1, 87, null, '{}');
  mockGetPermalinkValue.mockResolvedValue({
    state: { dataMask: { shared: {} } },
  });
  await expect(loadDashboardDataMask(87, 1)).resolves.toMatchObject({
    dataMask: { shared: {} },
  });
});
