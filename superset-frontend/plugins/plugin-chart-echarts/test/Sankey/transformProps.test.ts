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
import { init, EChartsOption, SankeySeriesOption } from 'echarts';
import { CallbackDataParams } from 'echarts/types/src/util/types';
import { ChartProps, DataRecord } from '@superset-ui/core';
import { supersetTheme } from '@apache-superset/core/theme';
import transformProps from '../../src/Sankey/transformProps';
import { SankeyChartProps } from '../../src/Sankey/types';

function transform(data: DataRecord[]) {
  return transformProps(
    new ChartProps({
      width: 800,
      height: 600,
      theme: supersetTheme,
      formData: {
        datasource: '1__table',
        viz_type: 'sankey_v2',
        source: 'spu',
        target: 'competitor',
        metric: 'sales',
      },
      queriesData: [{ data }],
    }) as SankeyChartProps,
  );
}

test.each(
  [
    [{ spu: null, competitor: null, sales: 54576981 }],
    [{ spu: 'A', competitor: 'A', sales: 10 }],
    [
      { spu: 'A', competitor: 'B', sales: 10 },
      { spu: 'B', competitor: 'A', sales: 20 },
    ],
  ].map(data => ({ data })),
)(
  'cyclic labels render without dropping or changing flow values: %j',
  ({ data }) => {
    const result = transform(data);
    const series = result.echartOptions.series as SankeySeriesOption;
    expect(series.links?.map(link => link.value)).toEqual(
      data.map(row => row.sales),
    );
    expect(series.links?.every(link => link.source !== link.target)).toBe(true);
    const context = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    const chart = init(null, undefined, {
      renderer: 'svg',
      ssr: true,
      width: 800,
      height: 600,
    });
    try {
      expect(() =>
        chart.setOption(result.echartOptions as EChartsOption),
      ).not.toThrow();
      const svg = chart.renderToSVGString();
      expect(svg).toContain('<path');
      expect(svg).not.toContain('[&quot;source&quot;');
    } finally {
      chart.dispose();
      context.mockRestore();
    }
  },
);

test('acyclic multi-stage graphs keep shared intermediate nodes and all connections', () => {
  const series = transform([
    { spu: 'A', competitor: 'B', sales: 10 },
    { spu: 'B', competitor: 'C', sales: 10 },
    { spu: 'A', competitor: 'B', sales: 5 },
  ]).echartOptions.series as SankeySeriesOption;
  expect(
    series.data?.map(node => (typeof node === 'string' ? node : node.name)),
  ).toEqual(['A', 'B', 'C']);
  expect(series.links).toEqual([
    { source: 'A', target: 'B', value: 10 },
    { source: 'B', target: 'C', value: 10 },
    { source: 'A', target: 'B', value: 5 },
  ]);
});

test('split node labels and tooltips show original names and correct per-role percentages', () => {
  const result = transform([
    { spu: 'A', competitor: 'A', sales: 10 },
    { spu: 'A', competitor: 'B', sales: 30 },
  ]);
  const series = result.echartOptions.series as SankeySeriesOption;
  const links = series.links!;
  const formatter = (
    result.echartOptions.tooltip as {
      formatter: (params: CallbackDataParams) => string;
    }
  ).formatter;
  const text = formatter({
    name: 'internal',
    value: 10,
    data: links[0],
  } as CallbackDataParams);
  expect(text).toContain('A &gt; A');
  expect(text).toContain('25.00%');
  expect(text).toContain('100.00%');
  expect(text).not.toContain('source');
  const node = series.data![0] as {
    name: string;
    label: { formatter: () => string };
  };
  expect(node.label.formatter()).toBe('A');
});

test('empty data has no fabricated nodes or links', () => {
  expect(transform([]).echartOptions.series).toMatchObject({
    data: [],
    links: [],
  });
});
