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
  ChartDataResponseResult,
  ChartProps,
  DataRecord,
  ensureIsArray,
  getColumnLabel,
  QueryFormColumn,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import { supersetTheme } from '@apache-superset/core/theme';
import type { SeriesOption } from 'echarts';
import { barTransformProps } from '../../../src/Timeseries/Regular/Bar';
import mixedTransformProps from '../../../src/MixedTimeseries/transformProps';
import { DEFAULT_FORM_DATA as BAR_DEFAULTS } from '../../../src/Timeseries/constants';
import { DEFAULT_FORM_DATA as MIXED_DEFAULTS } from '../../../src/MixedTimeseries/types';
import type { EchartsMixedTimeseriesProps } from '../../../src/MixedTimeseries/types';
import type { EchartsTimeseriesChartProps } from '../../../src/Timeseries/types';
import fixture from './fixtures/dashboardConfigurations.json';

type DashboardConfiguration = {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  metrics: string[];
  metrics_b: string[];
};
const configurations = fixture.charts as DashboardConfiguration[];
const fullSkus = [
  'TL-极简圆12-1-11-圆柱-燕麦麻-触摸-1C3-1S-M66-D15-2307',
  'TL-极简圆12-1-11-圆柱-燕麦麻-触摸-2C3-1S-M66-D15-2307',
];
const columnLabel = (column: unknown) =>
  getColumnLabel(column as QueryFormColumn);

// Metadata is real; rows are deterministic synthetic pivot results, never live queries.
function queryData(
  configuration: DashboardConfiguration,
  secondary: boolean,
): ChartDataResponseResult {
  const { config } = configuration;
  const axis = columnLabel(config.x_axis);
  const temporal = /(?:biz_day|ship_date|snapshot_month|run_date|start_time)$/.test(axis);
  const metrics = secondary ? configuration.metrics_b : configuration.metrics;
  const groups = ensureIsArray(
    (secondary ? config.groupby_b : config.groupby) as QueryFormColumn[],
  );
  const offsets = ensureIsArray(
    (secondary ? config.time_compare_b : config.time_compare) as string[],
  );
  const groupValues = groups.length
    ? [0, 1].map(index =>
        groups.map(group =>
          /sku/i.test(columnLabel(group))
            ? fullSkus[index]
            : `${columnLabel(group)}-${index === 0 ? 'A' : 'B'}`,
        ),
      )
    : [[]];
  const labelMap: Record<string, string[]> = { [axis]: [axis] };
  const data: DataRecord[] = Array.from({ length: 3 }, (_, rowIndex) => {
    const row: DataRecord = {
      [axis]: temporal
        ? Date.UTC(2026, rowIndex + 5, 1)
        : /sku/i.test(axis)
          ? `${fullSkus[rowIndex % 2]}-${rowIndex}`
          : `${axis}-${rowIndex + 1}`,
    };
    metrics.forEach((metric, metricIndex) => {
      groupValues.forEach((values, groupIndex) => {
        const labels = [metric, ...values];
        const name = labels.join(', ');
        labelMap[name] = labels;
        const value = (metricIndex + 1) * 100 + groupIndex + 1;
        const aliasedSku = /简称/.test(axis) && groups.some(group => /sku/i.test(columnLabel(group)));
        row[name] = rowIndex === 2 || (aliasedSku && groupIndex !== rowIndex % 2)
          ? null
          : rowIndex === 1 ? -value : value;
        offsets.forEach(offset => {
          const comparisonLabels = [metric, offset, ...values];
          const comparisonName =
            metrics.length === 1 && groups.length === 0
              ? offset
              : values.length
                ? comparisonLabels.join(', ')
                : `${metric}__${offset}`;
          labelMap[comparisonName] =
            comparisonName === offset ? [offset] : comparisonLabels;
          row[comparisonName] = row[name] == null ? null : value * 0.8;
        });
      });
    });
    return row;
  });
  const colnames = Object.keys(data[0]);
  return {
    annotation_data: null,
    cache_key: null,
    cache_timeout: null,
    cached_dttm: null,
    queried_dttm: null,
    error: null,
    is_cached: false,
    query: '',
    rowcount: data.length,
    sql_rowcount: data.length,
    stacktrace: null,
    status: 'success',
    from_dttm: null,
    to_dttm: null,
    data,
    colnames,
    coltypes: colnames.map(name =>
      name === axis
        ? temporal
          ? GenericDataType.Temporal
          : GenericDataType.String
        : GenericDataType.Numeric,
    ),
    label_map: labelMap,
  } as ChartDataResponseResult;
}

function transformConfiguration(configuration: DashboardConfiguration, width: number) {
  const mixed = configuration.type === 'mixed_timeseries';
  const queriesData = [
    queryData(configuration, false),
    ...(mixed ? [queryData(configuration, true)] : []),
  ];
  const chartProps = new ChartProps({
    width,
    height: 480,
    theme: supersetTheme,
    datasource: { verboseMap: {}, columnFormats: {}, currencyFormats: {} },
    formData: {
      ...(mixed ? MIXED_DEFAULTS : BAR_DEFAULTS),
      ...configuration.config,
      metrics: configuration.metrics,
      metrics_b: configuration.metrics_b,
      datasource: 'synthetic__table',
      viz_type: configuration.type,
      slice_id: configuration.id,
      annotationLayers: [],
      forecastEnabled: false,
      time_grain_sqla: 'P1M',
    },
    queriesData,
  });
  const before = JSON.stringify(chartProps.queriesData.map(query => query.data));
  const transformed = mixed
    ? mixedTransformProps(chartProps as EchartsMixedTimeseriesProps)
    : barTransformProps(chartProps as EchartsTimeseriesChartProps);
  expect(JSON.stringify(chartProps.queriesData.map(query => query.data))).toBe(before);
  return transformed;
}

function expectFiniteGeometry(value: unknown) {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
  } else if (Array.isArray(value)) {
    value.forEach(expectFiniteGeometry);
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(expectFiniteGeometry);
  }
}

test('the read-only inventory covers 68 in-use charts, including matrix, ASIN, stack and mixed cases', () => {
  expect(configurations).toHaveLength(68);
  expect(configurations.filter(chart => chart.type === 'mixed_timeseries')).toHaveLength(21);
  expect(configurations.find(chart => chart.id === 726)?.config.y_axis_dimension).toBe('competitor');
  expect(configurations.find(chart => chart.id === 857)?.metrics).toHaveLength(43);
  expect(configurations.find(chart => chart.id === 847)?.metrics).toHaveLength(19);
  expect(configurations.find(chart => chart.id === 857)?.config.x_axis).toBe('asin');
  const sales = configurations.find(chart => chart.id === 839)!;
  expect(queryData(sales, false).data[0]).toHaveProperty('1 month ago');
  expect(configurations.some(chart => chart.config.x_axis === 'shop_name')).toBe(true);
});

test.each(
  configurations.flatMap(configuration =>
    [360, 1200].map(width => [configuration.id, configuration.name, width, configuration] as const),
  ),
)('saved chart %s (%s) transforms at %ipx without invalid geometry or source mutation', (_id, _name, width, configuration) => {
  const result = transformConfiguration(configuration, width);
  const options = result.echartOptions;
  const series = ensureIsArray(options.series as SeriesOption[]);
  expect(series.length).toBeGreaterThan(0);
  expectFiniteGeometry(options);
  expect(JSON.stringify(options)).not.toContain('NaN');
  expect(result.width).toBe(width);
  expect(result.height).toBe(480);
  [...configuration.metrics, ...configuration.metrics_b].forEach(metric => {
    expect(series.some(entry => String(entry.name).includes(metric))).toBe(true);
  });
  if ('minCategoryHeight' in result && result.minCategoryHeight !== undefined) {
    expect(result.minCategoryHeight).toBeGreaterThan(0);
    if ([845, 846, 847, 857].includes(configuration.id)) {
      expect(result.minCategoryHeight).toBeLessThanOrEqual(160);
    }
  }
  if (configuration.config.y_axis_dimension) {
    expect(series.every(entry => entry.type === 'custom')).toBe(true);
    expect(result).toHaveProperty('matrixDimensions');
  }
});
