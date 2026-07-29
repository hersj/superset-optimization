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

describe('FilterValue request lifecycle guards', () => {
  it('starts a new options request when query context changes during an in-flight request', () => {
    expect(
      shouldStartFilterOptionsRequest({
        isRefreshing: true,
        formDataChanged: true,
        ownStateChanged: false,
        shouldRefresh: false,
      }),
    ).toBe(true);
  });

  it('does not duplicate refresh-only requests while a refresh request is already in flight', () => {
    expect(
      shouldStartFilterOptionsRequest({
        isRefreshing: true,
        formDataChanged: false,
        ownStateChanged: false,
        shouldRefresh: true,
      }),
    ).toBe(false);
  });

  it('does not start a first options request while a filter has not been opened', () => {
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

  it('allows a batchable filter to preload its first options request', () => {
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

  it('preloads a range filter to obtain its minimum and maximum', () => {
    expect(
      shouldLoadFilterOptions({
        defaultToFirstItem: false,
        hasLoadedOptions: false,
        isFilterActive: false,
        isRangeFilter: true,
      }),
    ).toBe(true);
  });

  it('starts the first options request when a filter is opened', () => {
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

  it('keeps loading options for filters that need an initial first item default', () => {
    expect(
      shouldLoadFilterOptions({
        defaultToFirstItem: true,
        hasLoadedOptions: false,
        isFilterActive: false,
      }),
    ).toBe(true);
  });

  it('allows already loaded filters to refresh their options', () => {
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

  it('applies only the latest request for the current dashboard', () => {
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
