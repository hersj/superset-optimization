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
  render,
  screen,
  userEvent,
} from 'spec/helpers/testing-library';
import reducerIndex from 'spec/helpers/reducerIndex';
import type { RootState } from 'src/dashboard/types';
import { getPersistedDashboardChartControls } from 'src/dashboard/util/charts/getDashboardChartControls';
import DashboardChartControls from './DashboardChartControls';

const STORAGE_KEY = 'dashboard__chart_controls';

beforeEach(() => {
  localStorage.clear();
});

test('toggles dashboard chart controls without marking the dashboard dirty', async () => {
  const store = createStore(
    {
      dashboardState: {
        dashboardChartControls: {
          timeCompareEnabled: true,
          showValueEnabled: true,
        },
        hasUnsavedChanges: false,
      },
    },
    reducerIndex,
  );

  render(<DashboardChartControls />, {
    store,
    useTheme: true,
  });

  await userEvent.click(
    screen.getByRole('switch', { name: 'Time comparison' }),
  );

  expect((store.getState() as unknown as RootState).dashboardState).toEqual(
    expect.objectContaining({
      dashboardChartControls: {
        timeCompareEnabled: false,
        showValueEnabled: true,
      },
      hasUnsavedChanges: false,
    }),
  );
});

test('restores and persists controls for the current user', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      '1': {
        timeCompareEnabled: false,
        showValueEnabled: true,
      },
    }),
  );

  const store = createStore(
    {
      user: { userId: 1 },
      dashboardState: {
        dashboardChartControls: getPersistedDashboardChartControls(1)!,
        hasUnsavedChanges: false,
      },
    },
    reducerIndex,
  );

  render(<DashboardChartControls />, {
    store,
    useTheme: true,
  });

  expect(
    screen.getByRole('switch', { name: 'Time comparison' }),
  ).not.toBeChecked();

  await userEvent.click(screen.getByRole('switch', { name: 'Show Values' }));

  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
    '1': {
      timeCompareEnabled: false,
      showValueEnabled: false,
    },
  });
});

test("does not restore another user's controls", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      '1': {
        timeCompareEnabled: false,
        showValueEnabled: false,
      },
    }),
  );

  const store = createStore(
    {
      user: { userId: 2 },
      dashboardState: { hasUnsavedChanges: false },
    },
    reducerIndex,
  );
  expect(getPersistedDashboardChartControls(2)).toBeNull();

  render(<DashboardChartControls />, {
    store,
    useTheme: true,
  });

  expect(screen.getByRole('switch', { name: 'Time comparison' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Show Values' })).toBeChecked();
});
