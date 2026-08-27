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
import { resolveNativeFilterDependencies } from './nativeFilterDependencies';

const childFilter = {
  id: 'shop',
  filterType: 'filter_select',
  targets: [{ datasetId: 98, column: { name: 'shop_name' } }],
};

const timeFilter = (id: string, overrides = {}) => ({
  id,
  filterType: 'filter_custom_time',
  targets: [{ datasetId: 98, column: { name: 'event_date' } }],
  ...overrides,
});

const dataMask = (id: string, extraFormData: unknown, filterState?: unknown) =>
  ({
    id,
    extraFormData,
    ...(filterState === undefined ? {} : { filterState }),
  }) as any;

describe('native filter implicit time dependencies', () => {
  test('uses an unhydrated parent default without treating it as user state', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        time: timeFilter('time', {
          defaultDataMask: {
            extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
          },
        }),
      },
      dataMaskSelected: {},
      initializedFilters: new Set(),
    });

    expect(result).toMatchObject({
      status: 'ready',
      timeRange: '2026-01-01 : 2026-01-31',
    });
  });

  test('uses the default for an unhydrated placeholder data mask', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        time: timeFilter('time', {
          defaultDataMask: {
            extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
          },
        }),
      },
      dataMaskSelected: {
        time: dataMask('time', {}, { value: null }),
      },
      initializedFilters: new Set(),
    });

    expect(result).toMatchObject({
      status: 'ready',
      timeRange: '2026-01-01 : 2026-01-31',
    });
  });
  test('does not restore a default after a hydrated parent was cleared', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        time: timeFilter('time', {
          defaultDataMask: {
            extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
          },
        }),
      },
      dataMaskSelected: {
        time: dataMask('time', { filters: [] }, { value: null }),
      },
      initializedFilters: new Set(['time']),
    });

    expect(result.status).toBe('invalid');
  });

  test('reads a TEMPORAL_RANGE filter when the top-level time_range is absent', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        time: timeFilter('time'),
      },
      dataMaskSelected: {
        time: dataMask('time', {
          filters: [
            {
              col: 'event_date',
              op: 'TEMPORAL_RANGE',
              val: '2026-02-01 : 2026-02-28',
            },
          ],
        }),
      },
      initializedFilters: new Set(['time']),
    });

    expect(result).toMatchObject({
      status: 'ready',
      timeRange: '2026-02-01 : 2026-02-28',
    });
  });

  test('resolves each parent independently before rejecting a cleared/default conflict', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        timeA: timeFilter('timeA', {
          defaultDataMask: {
            extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
          },
        }),
        timeB: timeFilter('timeB', {
          defaultDataMask: {
            extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
          },
        }),
      },
      dataMaskSelected: {
        timeA: dataMask('timeA', { filters: [] }, { value: null }),
      },
      initializedFilters: new Set(['timeA']),
    });

    expect(result.status).toBe('invalid');
  });

  test('blocks an applicable parent while its own data mask is not hydrated', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        time: timeFilter('time'),
      },
      dataMaskSelected: {
        time: dataMask('time', {}),
      },
      initializedFilters: new Set(),
    });

    expect(result.status).toBe('pending');
  });

  test('waits for a configured chart scope to hydrate before resolving applicability', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        time: timeFilter('time', {
          targets: [],
          scope: { rootPath: ['ROOT_ID'], excluded: [] },
        }),
      },
      dataMaskSelected: {
        time: dataMask('time', {
          time_range: '2026-03-01 : 2026-03-31',
        }),
      },
      initializedFilters: new Set(['time']),
      chartIds: [],
      chartLayoutItems: [],
      chartDatasetIds: {},
    });

    expect(result.status).toBe('pending');
  });
  test('does not treat an empty target scope as global', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        time: timeFilter('time', { targets: [], chartsInScope: [] }),
      },
      dataMaskSelected: {
        time: dataMask('time', { time_range: '2026-03-01 : 2026-03-31' }),
      },
      initializedFilters: new Set(['time']),
    });

    expect(result.status).toBe('pending');
  });

  test('applies a targetless time parent only to its resolved chart scope', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter: { ...childFilter, chartsInScope: [629] },
      nativeFilters: {
        time: timeFilter('time', {
          targets: [],
          scope: { rootPath: ['ROOT_ID', 'TAB-1'], excluded: [] },
        }),
      },
      dataMaskSelected: {
        time: dataMask('time', { time_range: '2026-04-01 : 2026-04-30' }),
      },
      initializedFilters: new Set(['time']),
      chartIds: [629, 630],
      chartLayoutItems: [
        {
          type: 'CHART',
          meta: { chartId: 629 },
          parents: ['ROOT_ID', 'TAB-1'],
        },
        {
          type: 'CHART',
          meta: { chartId: 630 },
          parents: ['ROOT_ID', 'TAB-2'],
        },
      ] as any,
      chartDatasetIds: { 629: 98, 630: 99 },
    });

    expect(result).toMatchObject({
      status: 'ready',
      timeRange: '2026-04-01 : 2026-04-30',
    });
  });

  test('returns unconfigured only when no applicable time parent exists', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        other: {
          id: 'other',
          filterType: 'filter_select',
          targets: [{ datasetId: 98, column: { name: 'shop_name' } }],
        },
      },
      dataMaskSelected: {},
      initializedFilters: new Set(),
    });

    expect(result.status).toBe('unconfigured');
  });

  test('reports conflicting valid ranges instead of choosing one', () => {
    const result = resolveNativeFilterDependencies({
      datasetId: 98,
      childFilter,
      nativeFilters: {
        timeA: timeFilter('timeA'),
        timeB: timeFilter('timeB'),
      },
      dataMaskSelected: {
        timeA: dataMask('timeA', {
          time_range: '2026-05-01 : 2026-05-31',
        }),
        timeB: dataMask('timeB', {
          time_range: '2026-06-01 : 2026-06-30',
        }),
      },
      initializedFilters: new Set(['timeA', 'timeB']),
    });

    expect(result.status).toBe('conflict');
  });
});
