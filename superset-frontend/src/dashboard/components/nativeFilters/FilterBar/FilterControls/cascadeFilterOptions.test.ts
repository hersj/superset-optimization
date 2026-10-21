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
import { SupersetClient } from '@superset-ui/core';

import {
  getCascadeFilterOptions,
  getCascadeFilterColumns,
  clearSellerfoxCascadeFilterOptionsCache,
  isCascadeFilter,
  getSellerfoxCascadeFilterOptions,
  getSellerfoxCascadeColumns,
  isSellerfoxCascadeFilter,
  SELLERFOX_CASCADE_COLUMNS,
} from './cascadeFilterOptions';

describe('sellerfox cascade filter options', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    clearSellerfoxCascadeFilterOptionsCache();
  });

  test('posts the full point union and separates cache entries with the same envelope', async () => {
    const post = jest
      .spyOn(SupersetClient, 'post')
      .mockResolvedValue({ json: { result: {} } } as any);
    const nativeFilters = {
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 98, column: { name: 'shop' } }],
      },
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        targets: [{ datasetId: 98, column: { name: 'event_date' } }],
      },
    } as any;
    const ranges = ['2026-01-01 : 2026-02-01', '2026-03-01 : 2026-04-01'];
    for (const selection of [ranges, ['2026-01-01 : 2026-04-01']]) {
      await getCascadeFilterOptions(
        44,
        98,
        nativeFilters,
        {
          time: {
            id: 'time',
            extraFormData: {
              time_range: '2026-01-01 : 2026-04-01',
              filters: [
                { col: 'event_date', op: 'TEMPORAL_RANGE', val: selection },
              ],
            },
          },
        } as any,
        undefined,
        { childFilterId: 'shop', initializedFilters: new Set(['time']) },
      );
    }
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][0]).toMatchObject({
      jsonPayload: {
        time_range: '2026-01-01 : 2026-04-01',
        time_ranges: ranges,
        time_column: 'event_date',
        applied_filters: {},
      },
    });
  });

  test('builds a generic dashboard batch payload from filter metadata', async () => {
    const post = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
      json: {
        result: {},
      },
    } as any);
    const nativeFilters = {
      month: {
        id: 'month',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: '年月' } }],
        cascadeParentIds: [],
      },
      department: {
        id: 'department',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: '事业部' } }],
        cascadeParentIds: ['month'],
      },
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: '店铺名称' } }],
        cascadeParentIds: ['month', 'department'],
      },
      customTime: {
        id: 'customTime',
        filterType: 'filter_custom_time',
        targets: [{ datasetId: 95, column: { name: '日期' } }],
        defaultDataMask: {
          extraFormData: { time_range: '2026-06-01 : 2026-06-30' },
        },
      },
    } as any;

    await getCascadeFilterOptions(43, 95, nativeFilters, {
      month: {
        id: 'month',
        extraFormData: {
          filters: [{ col: '年月', op: 'IN', val: ['2026-06'] }],
        },
      },
    } as any);

    expect(post).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/43/cascade_filter_options',
      jsonPayload: {
        dataset_id: 95,
        columns: ['年月', '事业部', '店铺名称'],
        applied_filters: {
          年月: ['2026-06'],
        },
        time_range: '2026-06-01 : 2026-06-30',
      },
    });
    expect(getCascadeFilterColumns(43, 95, nativeFilters)).toEqual([
      '年月',
      '事业部',
      '店铺名称',
    ]);
  });

  test('enables generic batch loading only for select filters with dataset columns', () => {
    const nativeFilters = {
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        targets: [],
      },
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: '店铺名称' } }],
      },
    } as any;

    expect(
      isCascadeFilter(43, 95, 'filter_select', '店铺名称', nativeFilters),
    ).toBe(true);
    expect(
      isCascadeFilter(43, 95, 'filter_custom_time', undefined, nativeFilters),
    ).toBe(false);
    expect(
      isCascadeFilter(
        43,
        undefined,
        'filter_select',
        '店铺名称',
        nativeFilters,
      ),
    ).toBe(false);
  });

  test('uses a single batch request for matching dashboard filter option loads', async () => {
    const post = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
      json: {
        result: {
          country: {
            colnames: ['country'],
            coltypes: [1],
            data: [{ country: 'US' }],
            rowcount: 1,
          },
          shop_name: {
            colnames: ['shop_name'],
            coltypes: [1],
            data: [{ shop_name: 'Shop A' }],
            rowcount: 1,
          },
        },
      },
    } as any);

    const dataMaskSelected = {
      org: {
        id: 'org',
        extraFormData: {
          filters: [
            {
              col: 'department_label',
              op: 'IN',
              val: ['D1'],
            },
          ],
        },
      },
      time: {
        id: 'time',
        extraFormData: {
          time_range: '2026-01-01 : 2026-12-31',
        },
      },
    } as any;

    const [country, shop] = await Promise.all([
      getSellerfoxCascadeFilterOptions(44, 98, dataMaskSelected),
      getSellerfoxCascadeFilterOptions(44, 98, dataMaskSelected),
    ]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/44/cascade_filter_options',
      jsonPayload: {
        dataset_id: 98,
        columns: SELLERFOX_CASCADE_COLUMNS,
        applied_filters: {
          department_label: ['D1'],
        },
        time_range: '2026-01-01 : 2026-12-31',
      },
    });
    expect(country.country.data).toEqual([{ country: 'US' }]);
    expect(shop.shop_name.data).toEqual([{ shop_name: 'Shop A' }]);
  });

  test('uses the dashboard-specific cascade columns in the batch payload', async () => {
    const post = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
      json: {
        result: {},
      },
    } as any);

    await getSellerfoxCascadeFilterOptions(51, 98, undefined);

    expect(post).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/51/cascade_filter_options',
      jsonPayload: {
        dataset_id: 98,
        columns: getSellerfoxCascadeColumns(51, 98),
        applied_filters: {},
      },
    });
    expect(getSellerfoxCascadeColumns(51, 98)).not.toContain('kk_sku');
  });

  test('only enables the batch loader for the Sellerfox dashboard chain', () => {
    expect(isSellerfoxCascadeFilter(44, 98, 'filter_select', 'country')).toBe(
      true,
    );
    expect(isSellerfoxCascadeFilter(44, 98, 'filter_select', 'kk_sku')).toBe(
      true,
    );
    expect(getSellerfoxCascadeColumns(44, 98)).toContain('kk_sku');
    expect(getSellerfoxCascadeColumns(51, 98)).not.toContain('kk_sku');
    expect(isSellerfoxCascadeFilter(51, 98, 'filter_select', 'kk_sku')).toBe(
      false,
    );
    expect(isSellerfoxCascadeFilter(43, 98, 'filter_select', 'country')).toBe(
      false,
    );
    expect(isSellerfoxCascadeFilter(44, 95, 'filter_select', 'country')).toBe(
      false,
    );
    expect(isSellerfoxCascadeFilter(44, 98, 'filter_time', 'country')).toBe(
      false,
    );
    expect(isSellerfoxCascadeFilter(44, 98, 'filter_select', 'currency')).toBe(
      false,
    );
  });
});

describe('cascade filter time range contract', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    clearSellerfoxCascadeFilterOptionsCache();
  });

  test('does not request when an applicable time filter is not ready', async () => {
    const post = jest.spyOn(SupersetClient, 'post');
    const nativeFilters = {
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        targets: [{ datasetId: 95, column: { name: 'event_date' } }],
        defaultDataMask: {},
      },
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: 'shop_name' } }],
      },
    } as any;

    await expect(
      getCascadeFilterOptions(43, 95, nativeFilters, {}),
    ).rejects.toThrow(/time (filter|range)/i);
    expect(post).not.toHaveBeenCalled();
  });

  test('uses the applicable filter id instead of the last data mask time range', async () => {
    const post = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
      json: { result: {} },
    } as any);
    const nativeFilters = {
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        targets: [{ datasetId: 95, column: { name: 'event_date' } }],
        defaultDataMask: {},
      },
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: 'shop_name' } }],
      },
    } as any;

    await getCascadeFilterOptions(44, 95, nativeFilters, {
      time: {
        id: 'time',
        extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
      },
      unrelated: {
        id: 'unrelated',
        extraFormData: { time_range: '2020-01-01 : 2020-01-31' },
      },
    } as any);

    expect(post).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/44/cascade_filter_options',
      jsonPayload: expect.objectContaining({
        time_range: '2026-01-01 : 2026-01-31',
      }),
    });
    expect(post.mock.calls[0][0].jsonPayload.applied_filters).toEqual({});
  });

  test('rejects conflicting applicable time filter ranges without requesting', async () => {
    const post = jest.spyOn(SupersetClient, 'post');
    const nativeFilters = {
      timeA: {
        id: 'timeA',
        filterType: 'filter_custom_time',
        targets: [{ datasetId: 95, column: { name: 'event_date' } }],
      },
      timeB: {
        id: 'timeB',
        filterType: 'filter_custom_time',
        targets: [{ datasetId: 95, column: { name: 'event_date' } }],
      },
    } as any;

    await expect(
      getCascadeFilterOptions(44, 95, nativeFilters, {
        timeA: {
          id: 'timeA',
          extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
        },
        timeB: {
          id: 'timeB',
          extraFormData: { time_range: '2026-02-01 : 2026-02-28' },
        },
      } as any),
    ).rejects.toThrow(/time range/i);
    expect(post).not.toHaveBeenCalled();
  });

  test('does not apply a time range from an unrelated dashboard filter', async () => {
    const post = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
      json: { result: {} },
    } as any);
    const nativeFilters = {
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: 'shop_name' } }],
      },
    } as any;

    await getCascadeFilterOptions(44, 95, nativeFilters, {
      unrelated: {
        id: 'unrelated',
        extraFormData: { time_range: '2020-01-01 : 2020-01-31' },
      },
    } as any);

    expect(post).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/44/cascade_filter_options',
      jsonPayload: expect.not.objectContaining({
        time_range: expect.anything(),
      }),
    });
  });

  test('does not request when an applicable time scope is unresolved', async () => {
    const post = jest.spyOn(SupersetClient, 'post');
    const nativeFilters = {
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        chartsInScope: [],
      },
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: 'shop_name' } }],
      },
    } as any;

    await expect(
      getCascadeFilterOptions(
        44,
        95,
        nativeFilters,
        {
          time: {
            id: 'time',
            extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
          },
        } as any,
        undefined,
        { childFilterId: 'shop' },
      ),
    ).rejects.toThrow(/scope/i);
    expect(post).not.toHaveBeenCalled();
  });

  test('does not request when a hydrated applicable time filter is cleared', async () => {
    const post = jest.spyOn(SupersetClient, 'post');
    const nativeFilters = {
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        targets: [{ datasetId: 95, column: { name: 'event_date' } }],
        defaultDataMask: {
          extraFormData: { time_range: '2026-01-01 : 2026-01-31' },
        },
      },
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: 'shop_name' } }],
      },
    } as any;

    await expect(
      getCascadeFilterOptions(
        44,
        95,
        nativeFilters,
        {
          time: {
            id: 'time',
            extraFormData: { filters: [] },
            filterState: { value: null },
          },
        } as any,
        undefined,
        {
          childFilterId: 'shop',
          initializedFilters: new Set(['time']),
        },
      ),
    ).rejects.toThrow(/time range/i);
    expect(post).not.toHaveBeenCalled();
  });

  test('uses the selected range for a time filter scoped through the chart dataset', async () => {
    const post = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
      json: { result: {} },
    } as any);
    const nativeFilters = {
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        chartsInScope: [101],
      },
      shop: {
        id: 'shop',
        filterType: 'filter_select',
        targets: [{ datasetId: 95, column: { name: 'shop_name' } }],
      },
    } as any;

    await getCascadeFilterOptions(
      44,
      95,
      nativeFilters,
      {
        time: {
          id: 'time',
          extraFormData: { time_range: '2026-03-01 : 2026-03-31' },
        },
      } as any,
      { 101: 95 },
    );

    expect(post).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/44/cascade_filter_options',
      jsonPayload: expect.objectContaining({
        time_range: '2026-03-01 : 2026-03-31',
      }),
    });
  });

  test('uses a range when the scope includes this and another dataset', async () => {
    const post = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
      json: { result: {} },
    } as any);
    const nativeFilters = {
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        chartsInScope: [101, 102],
      },
    } as any;

    await getCascadeFilterOptions(
      44,
      95,
      nativeFilters,
      {
        time: {
          id: 'time',
          extraFormData: { time_range: '2026-03-01 : 2026-03-31' },
        },
      } as any,
      { 101: 95, 102: 96 },
    );

    expect(post).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/44/cascade_filter_options',
      jsonPayload: expect.objectContaining({
        time_range: '2026-03-01 : 2026-03-31',
      }),
    });
  });

  test('rejects a scoped time filter until chart datasets are ready', async () => {
    const post = jest.spyOn(SupersetClient, 'post');
    const nativeFilters = {
      time: {
        id: 'time',
        filterType: 'filter_custom_time',
        chartsInScope: [101],
      },
    } as any;

    await expect(
      getCascadeFilterOptions(44, 95, nativeFilters, {
        time: {
          id: 'time',
          extraFormData: { time_range: '2026-03-01 : 2026-03-31' },
        },
      } as any),
    ).rejects.toThrow(/scope/i);
    expect(post).not.toHaveBeenCalled();
  });
});

test.each(['ILIKE', 'NOT ILIKE', 'NOT IN'])(
  'a %s parent preserves the country and original operator in the batch request',
  async op => {
    clearSellerfoxCascadeFilterOptionsCache();
    const post = jest
      .spyOn(SupersetClient, 'post')
      .mockResolvedValue({ json: { result: {} } } as Awaited<
        ReturnType<typeof SupersetClient.post>
      >);
    const nativeFilters = {
      parent: {
        filterType: 'filter_select',
        targets: [{ datasetId: 156, column: { name: 'competitor' } }],
      },
      country: {
        filterType: 'filter_select',
        targets: [{ datasetId: 156, column: { name: 'site' } }],
      },
    };
    await getCascadeFilterOptions(73, 156, nativeFilters, {
      parent: {
        id: 'parent',
        extraFormData: { filters: [{ col: 'competitor', op, val: '%深圳%' }] },
      },
      country: {
        id: 'country',
        extraFormData: { filters: [{ col: 'site', op: 'IN', val: ['US'] }] },
      },
    });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonPayload: expect.objectContaining({
          applied_filters: { competitor: ['%深圳%'], site: ['US'] },
          filter_operators: { competitor: op },
        }),
      }),
    );
    post.mockRestore();
  },
);
