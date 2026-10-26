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
import getFormDataWithExtraFilters, {
  CachedFormDataWithExtraControls,
  GetFormDataWithExtraFiltersArguments,
} from 'src/dashboard/util/charts/getFormDataWithExtraFilters';
import buildPivotQuery from '../../../plugins/plugin-chart-pivot-table/src/plugin/buildQuery';
import { sliceId as chartId } from 'spec/fixtures/mockChartQueries';

// eslint-disable-next-line no-restricted-globals -- TODO: Migrate from describe blocks
describe('getFormDataWithExtraFilters', () => {
  const filterId = 'native-filter-1';
  const mockChart = {
    id: chartId,
    chartAlert: null,
    chartStatus: null,
    chartUpdateEndTime: null,
    chartUpdateStartTime: 1,
    lastRendered: 1,
    latestQueryFormData: {},
    sliceFormData: null,
    queryController: null,
    queriesResponse: null,
    triggerQuery: false,
    form_data: {
      viz_type: 'filter_select',
      filters: [
        {
          col: 'country_name',
          op: 'IN',
          val: ['United States'],
        },
      ],
      datasource: '123',
      url_params: {},
    },
  };
  const mockArgs: GetFormDataWithExtraFiltersArguments = {
    chartConfiguration: {},
    chart: mockChart,
    filters: {
      region: ['Spain'],
      color: ['pink', 'purple'],
    },
    sliceId: chartId,
    nativeFilters: {},
    dataMask: {
      [filterId]: {
        id: filterId,
        extraFormData: {},
        filterState: {},
        ownState: {},
      },
    },
    extraControls: {
      stack: 'Stacked',
    },
    allSliceIds: [chartId],
  };

  test('personal limits override both mixed queries, invalidate cache and restore the saved default', () => {
    const args = {
      ...mockArgs,
      chart: {
        ...mockChart,
        form_data: {
          ...mockChart.form_data,
          viz_type: 'mixed_timeseries',
          row_limit: 10000,
          row_limit_b: 5000,
        },
      },
    };
    const first = getFormDataWithExtraFilters({ ...args, rowLimit: 50 });
    const cached = getFormDataWithExtraFilters({ ...args, rowLimit: 50 });
    expect(first.row_limit).toBe(50);
    expect(first.row_limit_b).toBe(50);
    expect(cached.row_limit).toBe(50);
    expect(
      getFormDataWithExtraFilters({ ...args, rowLimit: 100 }).row_limit,
    ).toBe(100);
    const restored = getFormDataWithExtraFilters(args);
    expect(restored.row_limit).toBe(10000);
    expect(restored.row_limit_b).toBe(5000);
    expect(restored.extra_filters).toEqual(first.extra_filters);
    expect(args.chart.form_data.row_limit).toBe(10000);
  });

  test('personal sort overrides only the private form and invalidates the form cache', () => {
    const args = {
      ...mockArgs,
      sliceId: 987654,
      chart: {
        ...mockChart,
        form_data: {
          ...mockChart.form_data,
          viz_type: 'echarts_timeseries_bar',
          x_axis: 'sku',
          metrics: ['sales'],
          order_desc: true,
        },
      },
    };
    const descending = {
      mode: 'metric' as const,
      field: 'sales',
      direction: 'desc' as const,
    };
    const ascending = { ...descending, direction: 'asc' as const };
    const first = getFormDataWithExtraFilters({
      ...args,
      personalSort: descending,
    });
    expect(first.personal_sort).toEqual(descending);
    expect(
      getFormDataWithExtraFilters({ ...args, personalSort: ascending })
        .personal_sort,
    ).toEqual(ascending);
    expect(first.extra_filters).toEqual(
      getFormDataWithExtraFilters(args).extra_filters,
    );
    expect(getFormDataWithExtraFilters(args).personal_sort).toBeNull();
    expect(args.chart.form_data).not.toHaveProperty('personal_sort');
    expect(args.chart.form_data.order_desc).toBe(true);
  });

  test('should include filters from the passed filters', () => {
    const result = getFormDataWithExtraFilters(mockArgs);
    expect(result.extra_filters).toHaveLength(2);
    expect(result.extra_filters[0]).toEqual({
      col: 'region',
      op: 'IN',
      val: ['Spain'],
    });
    expect(result.extra_filters[1]).toEqual({
      col: 'color',
      op: 'IN',
      val: ['pink', 'purple'],
    });
  });

  test('should compose extra control', () => {
    const result: CachedFormDataWithExtraControls =
      getFormDataWithExtraFilters(mockArgs);
    expect(result.stack).toEqual('Stacked');
  });

  test.each([
    ['pie', {}, {}, []],
    ['big_number_total', {}, {}, []],
    ['mixed_timeseries', { x_axis: 'date' }, {}, ['上一选中区间']],
    ['mixed_timeseries', { x_axis: 'date' }, { time_compare: [] }, []],
    ['pivot_table_v2', { groupbyRows: ['date', 'shop'] }, {}, ['上一选中区间']],
  ])(
    'point selection comparison respects axis and dashboard switch: %s %p %p',
    (vizType, axes, controls, expected) => {
      const result = getFormDataWithExtraFilters({
        ...mockArgs,
        filters: { ...mockArgs.filters },
        chart: {
          ...mockChart,
          form_data: {
            ...mockChart.form_data,
            viz_type: vizType,
            granularity_sqla: 'date',
            ...axes,
          },
        },
        chartConfiguration: {
          [filterId]: {
            id: filterId,
            targets: [{ datasetId: 123, column: { name: 'date' } }],
            scope: { rootPath: ['ROOT_ID'], excluded: [] },
            cascadeParentIds: [],
          },
        } as any,
        dataMask: {
          [filterId]: {
            id: filterId,
            filterState: {},
            ownState: {},
            extraFormData: {
              filters: [
                {
                  col: 'date',
                  op: 'TEMPORAL_RANGE',
                  val: ['2025-04-27 : 2025-05-04', '2026-07-05 : 2026-07-12'],
                },
              ],
              time_compare: ['上一选中区间'],
            },
          },
        },
        extraControls: controls,
      } as any);
      expect(result.time_compare).toEqual(expected);
      expect(result.extra_form_data?.time_compare).toEqual(expected);
      if (vizType === 'mixed_timeseries')
        expect(result).toEqual(
          expect.objectContaining({ time_compare_b: expected }),
        );
      expect(result.extra_form_data?.filters?.[0].val).toHaveLength(2);
    },
  );

  test('lets an explicit dashboard comparison disable override the native filter', () => {
    const result = getFormDataWithExtraFilters({
      ...mockArgs,
      chartConfiguration: {
        [filterId]: {
          id: filterId,
          targets: [{ datasetId: 123, column: { name: 'country_name' } }],
          scope: { rootPath: ['ROOT_ID'], excluded: [] },
          cascadeParentIds: [],
        },
      } as any,
      dataMask: {
        [filterId]: {
          id: filterId,
          extraFormData: { time_compare: '1 week ago' },
          filterState: {},
          ownState: {},
        },
      },
      extraControls: { time_compare: [] },
    });

    expect(result.time_compare).toEqual([]);
    expect(result.extra_form_data).toMatchObject({ time_compare: [] });
  });

  test('keeps the dashboard comparison override after chart customizations merge', () => {
    const customizationId = 'CHART_CUSTOMIZATION-TIME_COMPARE';
    const result = getFormDataWithExtraFilters({
      ...mockArgs,
      chartConfiguration: {
        [filterId]: {
          id: filterId,
          targets: [{ datasetId: 123, column: { name: 'country_name' } }],
          scope: { rootPath: ['ROOT_ID'], excluded: [] },
          cascadeParentIds: [],
        },
      } as any,
      chartCustomizationItems: [{ id: customizationId }] as any,
      dataMask: {
        [filterId]: {
          id: filterId,
          extraFormData: { time_compare: '1 week ago' },
          filterState: {},
          ownState: {},
        },
        [customizationId]: {
          id: customizationId,
          extraFormData: { time_compare: '1 day ago' },
          filterState: {},
          ownState: {},
        },
      },
      extraControls: { time_compare: [] },
    });

    expect(result.time_compare).toEqual([]);
    expect(result.extra_form_data).toMatchObject({ time_compare: [] });
  });
  test('should merge extraFormData from chart customizations', () => {
    const customizationId = 'CHART_CUSTOMIZATION-1';
    const argsWithCustomization: GetFormDataWithExtraFiltersArguments = {
      ...mockArgs,
      dataMask: {
        [customizationId]: {
          id: customizationId,
          extraFormData: {
            time_grain_sqla: 'PT1H',
          },
          filterState: {
            value: ['category1', 'category2'],
          },
          ownState: {},
        },
      },
      chartCustomizationItems: [
        {
          id: customizationId,
          type: 'CHART_CUSTOMIZATION' as any,
          name: 'Time Grain Customization',
          filterType: 'chart_customization_time_grain',
          targets: [
            {
              datasetId: 123,
              column: { name: 'time_column' },
            },
          ],
          scope: {
            rootPath: [],
            excluded: [],
          },
          chartsInScope: [chartId],
          defaultDataMask: {},
          controlValues: {},
        },
      ],
    };

    const result = getFormDataWithExtraFilters(argsWithCustomization);
    expect((result as any).time_grain_sqla).toEqual('PT1H');
  });

  test('should merge both filters and customization extraFormData', () => {
    const customizationId = 'CHART_CUSTOMIZATION-1';
    const argsWithBoth: GetFormDataWithExtraFiltersArguments = {
      ...mockArgs,
      chartConfiguration: {
        [filterId]: {
          id: filterId,
          targets: [
            {
              datasetId: 123,
              column: { name: 'country_name' },
            },
          ],
          scope: { rootPath: ['ROOT_ID'], excluded: [] },
          cascadeParentIds: [],
        },
      } as any,
      dataMask: {
        [filterId]: {
          id: filterId,
          extraFormData: {
            filters: [
              {
                col: 'country_name',
                op: 'IN',
                val: ['United States'],
              },
            ],
          },
          filterState: {},
          ownState: {},
        },
        [customizationId]: {
          id: customizationId,
          extraFormData: {
            time_grain_sqla: 'PT1H',
          },
          filterState: {
            value: ['category1'],
          },
          ownState: {},
        },
      },
      chartCustomizationItems: [
        {
          id: customizationId,
          type: 'CHART_CUSTOMIZATION' as any,
          name: 'Time Grain Customization',
          filterType: 'chart_customization_time_grain',
          targets: [
            {
              datasetId: 123,
              column: { name: 'time_column' },
            },
          ],
          scope: {
            rootPath: [],
            excluded: [],
          },
          chartsInScope: [chartId],
          defaultDataMask: {},
          controlValues: {},
        },
      ],
    };

    const result = getFormDataWithExtraFilters(argsWithBoth);
    expect((result as any).time_grain_sqla).toEqual('PT1H');
    expect(result.extra_form_data).toBeDefined();
  });
});

test('late temporal metadata rebuilds the cached month form into a BASE_AXIS query', () => {
  const id = 7550901;
  const dateId = 'NATIVE_DATE_HYDRATION';
  const form = {
    datasource: '98__table',
    viz_type: 'pivot_table_v2',
    groupbyRows: ['earliest_ship_date', 'department_label'],
    groupbyColumns: [],
    metrics: [
      { expressionType: 'SQL', sqlExpression: 'SUM(profit)', label: 'profit' },
    ],
    time_grain_sqla: 'P1D',
    row_limit: 2000,
    temporal_columns_lookup: {},
  };
  const args = {
    chartConfiguration: {},
    chart: { id, form_data: form },
    sliceId: id,
    filters: {},
    nativeFilters: {
      [dateId]: {
        id: dateId,
        filterType: 'filter_custom_time',
        chartsInScope: [id],
      },
    },
    allSliceIds: [id],
    dataMask: {
      [dateId]: {
        id: dateId,
        filterState: { grain: 'month', value: 'this_month' },
        extraFormData: {
          time_grain_sqla: 'P1M',
          filters: [
            {
              col: 'earliest_ship_date',
              op: 'TEMPORAL_RANGE',
              val: '2026-10-01 : 2026-11-01',
            },
          ],
        },
      },
    },
    extraControls: {},
  } as unknown as GetFormDataWithExtraFiltersArguments;
  const cold = getFormDataWithExtraFilters(args);
  expect(cold.extra_form_data?.time_grain_sqla).toBe('P1M');
  expect(buildPivotQuery(cold as any).queries[0].columns?.[0]).toBe(
    'earliest_ship_date',
  );
  const warm = getFormDataWithExtraFilters({
    ...args,
    chart: {
      id,
      form_data: {
        ...form,
        temporal_columns_lookup: { earliest_ship_date: true },
      },
    },
  } as GetFormDataWithExtraFiltersArguments);
  expect(warm.temporal_columns_lookup).toEqual({ earliest_ship_date: true });
  expect(warm.extra_form_data?.time_grain_sqla).toBe('P1M');
  expect(buildPivotQuery(warm as any).queries[0].columns?.[0]).toEqual(
    expect.objectContaining({
      label: 'earliest_ship_date',
      columnType: 'BASE_AXIS',
      timeGrain: 'P1M',
    }),
  );
});
