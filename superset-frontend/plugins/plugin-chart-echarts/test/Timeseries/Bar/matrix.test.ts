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
  init,
  CustomSeriesOption,
  CustomSeriesRenderItem,
  EChartsOption,
} from 'echarts';
import {
  ChartDataResponseResult,
  ChartProps,
  DataRecord,
  VizType,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import { barTransformProps } from '../../../src/Timeseries/Regular/Bar';
import { buildBarQuery } from '../../../src/Timeseries/Regular/Bar/matrix';
import buildQuery from '../../../src/Timeseries/buildQuery';
import { DEFAULT_FORM_DATA } from '../../../src/Timeseries/constants';
import {
  EchartsTimeseriesChartProps,
  EchartsTimeseriesFormData,
  MatrixBarDatum,
  OrientationType,
} from '../../../src/Timeseries/types';
import { createEchartsTimeseriesTestChartProps } from '../../helpers';

function props(
  formData: Partial<EchartsTimeseriesFormData> = {},
  data: DataRecord[] = [
    { month: 'Sep', 'sales, A': 100, 'sales, B': -100 },
    { month: 'Oct', 'sales, A': 200, 'sales, B': null },
  ],
  labelMap: Record<string, string[]> = {
    'sales, A': ['sales', 'A'],
    'sales, B': ['sales', 'B'],
  },
) {
  const query: ChartDataResponseResult & {
    label_map: Record<string, string[]>;
  } = {
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
    colnames: Object.keys(data[0] ?? {}),
    coltypes: Object.keys(data[0] ?? {}).map(key =>
      key === (formData.x_axis ?? 'month')
        ? GenericDataType.String
        : GenericDataType.Numeric,
    ),
    label_map: labelMap,
  };
  return createEchartsTimeseriesTestChartProps<
    EchartsTimeseriesFormData,
    EchartsTimeseriesChartProps
  >({
    defaultFormData: DEFAULT_FORM_DATA,
    defaultVizType: VizType.Bar,
    formData: {
      x_axis: 'month',
      yAxisDimension: 'shop',
      metrics: ['sales'],
      showValue: true,
      yAxisFormat: '.0f',
      ...formData,
    },
    queriesData: [query],
  });
}

function matrixSeries(result: ReturnType<typeof barTransformProps>) {
  return result.echartOptions.series as CustomSeriesOption[];
}

function rectangle(series: CustomSeriesOption, value: number) {
  const render = series.renderItem as CustomSeriesRenderItem;
  const api = {
    value: (index: number) => (index === 2 ? value : 0),
    coord: () => [50, 50],
    size: () => [100, 100],
    visual: () => 'blue',
  } as unknown as Parameters<CustomSeriesRenderItem>[1];
  const group = render({} as Parameters<CustomSeriesRenderItem>[0], api) as {
    children: {
      type: string;
      shape: { x: number; y: number; width: number; height: number };
    }[];
  };
  return group.children.find(child => child.type === 'rect')!.shape;
}

test('bar query groups by both categorical axes in one query and leaves normal bars unchanged', () => {
  const form = {
    datasource: '3__table',
    viz_type: VizType.Bar,
    x_axis: 'month',
    metrics: ['sales'],
    groupby: ['old_dimension'],
  };
  expect(buildBarQuery(form)).toEqual(buildQuery(form));
  const { queries } = buildBarQuery({ ...form, y_axis_dimension: 'shop' });
  expect(queries).toHaveLength(1);
  expect(queries[0].columns).toEqual([
    expect.objectContaining({ label: 'month', sqlExpression: 'month' }),
    'shop',
  ]);
  expect(queries[0].metrics).toEqual(['sales']);
  expect(queries[0].post_processing).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: 'pivot',
        options: expect.objectContaining({
          index: ['month'],
          columns: ['shop'],
        }),
      }),
    ]),
  );
  expect(() => buildBarQuery({ ...form, y_axis_dimension: 'month' })).toThrow(
    /不同维度/,
  );
});

test('the existing bar plugin renders two categorical axes with small bars at their intersections', () => {
  const result = barTransformProps(props());
  expect(result.echartOptions.xAxis).toMatchObject({
    type: 'category',
    data: ['Sep', 'Oct'],
  });
  expect(result.echartOptions.yAxis).toMatchObject({
    type: 'category',
    data: expect.arrayContaining(['A', 'B']),
  });
  expect(result.matrixDimensions).toEqual(['month', 'shop']);
  const data = matrixSeries(result).flatMap(
    series => series.data as MatrixBarDatum[],
  );
  expect(data).toHaveLength(3);
  expect(data).toEqual(
    expect.arrayContaining([
      {
        value: [
          0,
          (result.echartOptions.yAxis as { data: string[] }).data.indexOf('A'),
          100,
        ],
        dimensionValues: ['Sep', 'A'],
      },
    ]),
  );
  expect(
    data.some(
      datum =>
        datum.dimensionValues[0] === 'Oct' && datum.dimensionValues[1] === 'B',
    ),
  ).toBe(false);
  const chart = init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 800,
    height: 600,
  });
  const context = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(null);
  try {
    chart.setOption({
      ...result.echartOptions,
      animation: false,
    } as EChartsOption);
    const svg = chart.renderToSVGString();
    expect(svg).toContain('Sep');
    expect(svg).toContain('100');
    expect(svg).toContain('-100');
  } finally {
    chart.dispose();
    context.mockRestore();
  }
});

test.each([OrientationType.Vertical, OrientationType.Horizontal])(
  'signed bars share a zero-anchored scale in %s orientation',
  orientation => {
    const result = barTransformProps(props({ orientation }));
    const [series] = matrixSeries(result);
    const positive = rectangle(series, 200),
      negative = rectangle(series, -100);
    const horizontal = orientation === OrientationType.Horizontal;
    const size = horizontal ? 'width' : 'height';
    const position = horizontal ? 'x' : 'y';
    const before = horizontal ? negative : positive;
    const after = horizontal ? positive : negative;
    expect(positive[size]).toBeCloseTo(negative[size] * 2);
    expect(after[position]).toBeCloseTo(before[position] + before[size]);
  },
);

test('multiple metrics retain independent scales and formats', () => {
  const result = barTransformProps(
    props(
      { metrics: ['sales', 'units'] },
      [
        {
          month: 'Sep',
          'sales, A': 100,
          'sales, B': 200,
          'units, A': 1,
          'units, B': 2,
        },
      ],
      {
        'sales, A': ['sales', 'A'],
        'sales, B': ['sales', 'B'],
        'units, A': ['units', 'A'],
        'units, B': ['units', 'B'],
      },
    ),
  );
  const series = matrixSeries(result);
  expect(
    rectangle(series.find(s => s.name === 'sales, A')!, 100).height,
  ).toBeCloseTo(rectangle(series.find(s => s.name === 'units, A')!, 1).height);
});

test('zero values stay zero and non-finite or missing values do not become bars', () => {
  const result = barTransformProps(
    props({}, [
      { month: 'Sep', 'sales, A': 0, 'sales, B': null },
      { month: 'Oct', 'sales, A': Infinity, 'sales, B': NaN },
    ]),
  );
  const data = matrixSeries(result).flatMap(
    series => series.data as MatrixBarDatum[],
  );
  expect(data.map(datum => datum.value[2])).toEqual([0]);
  expect(rectangle(matrixSeries(result)[0], 0).height).toBe(0);
});

test('clearing the Y dimension restores ordinary bar series', () => {
  const result = barTransformProps(props({ yAxisDimension: undefined }));
  expect(result.matrixDimensions).toBeUndefined();
  expect(
    (result.echartOptions.series as { type: string }[]).every(
      series => series.type === 'bar',
    ),
  ).toBe(true);
});

test('the saved second-axis field is recognized through real ChartProps normalization', () => {
  const sample = props();
  const chartProps = new ChartProps({
    width: 800,
    height: 600,
    theme: sample.theme,
    datasource: sample.datasource,
    queriesData: sample.queriesData,
    formData: {
      ...DEFAULT_FORM_DATA,
      datasource: '3__table',
      viz_type: VizType.Bar,
      x_axis: 'month',
      y_axis_dimension: 'shop',
      metrics: ['sales'],
    },
  });
  expect(
    barTransformProps({
      ...chartProps,
      formData: chartProps.formData as EchartsTimeseriesFormData,
    }).matrixDimensions,
  ).toEqual(['month', 'shop']);
});

test('swapping the selected dimensions changes the chart axes and raw drill-down values', () => {
  const result = barTransformProps(
    props(
      { x_axis: 'shop', yAxisDimension: 'month' },
      [
        { shop: 'A', 'sales, Sep': 100 },
        { shop: 'B', 'sales, Sep': 200 },
      ],
      { 'sales, Sep': ['sales', 'Sep'] },
    ),
  );
  expect(result.echartOptions.xAxis).toMatchObject({ data: ['A', 'B'] });
  expect(result.echartOptions.yAxis).toMatchObject({ data: ['Sep'] });
  expect(result.matrixDimensions).toEqual(['shop', 'month']);
  expect(
    (matrixSeries(result)[0].data as MatrixBarDatum[])[0].dimensionValues,
  ).toEqual(['A', 'Sep']);
});

test('matrix queries and legends retain a configured time comparison', () => {
  const offset = '1 month ago';
  const { queries } = buildBarQuery({
    datasource: '3__table',
    viz_type: VizType.Bar,
    x_axis: 'month',
    y_axis_dimension: 'shop',
    metrics: ['sales'],
    time_compare: [offset],
    comparison_type: 'values',
  });
  expect(queries).toHaveLength(1);
  expect(queries[0].time_offsets).toEqual([offset]);
  const result = barTransformProps(
    props(
      { time_compare: [offset], timeCompare: [offset] },
      [{ month: 'Sep', 'sales, A': 100, 'sales, 1 month ago, A': 80 }],
      {
        'sales, A': ['sales', 'A'],
        'sales, 1 month ago, A': ['sales', offset, 'A'],
      },
    ),
  );
  expect(matrixSeries(result)).toHaveLength(2);
  expect(result.legendGroups?.kinds['sales, 1 month ago, A']).toBe(
    'comparison',
  );
  expect(
    (matrixSeries(result)[1].data as MatrixBarDatum[])[0].dimensionValues,
  ).toEqual(['Sep', 'A']);
});

test('empty query data produces an empty matrix without fabricated zero bars', () => {
  const result = barTransformProps(props({}, [], {}));
  expect(matrixSeries(result)).toEqual([]);
  expect(result.echartOptions.xAxis).toMatchObject({ data: [] });
});

test('finite values near numeric limits still produce finite bar geometry', () => {
  const result = barTransformProps(
    props({}, [{ month: 'Sep', 'sales, A': 1e308, 'sales, B': -1e308 }]),
  );
  const shape = rectangle(matrixSeries(result)[0], 1e308);
  expect(Object.values(shape).every(Number.isFinite)).toBe(true);
});
