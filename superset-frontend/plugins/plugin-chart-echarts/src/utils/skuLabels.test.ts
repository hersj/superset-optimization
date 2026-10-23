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
import { ChartProps } from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import type { LegendState } from '@superset-ui/core';
import { supersetTheme } from '@apache-superset/core/theme';
import { buildSkuSelection, expandSkuAliases } from './skuLabels';
import transformProps from '../Timeseries/transformProps';
import { DEFAULT_FORM_DATA } from '../Timeseries/constants';
import {
  EchartsTimeseriesChartProps,
  EchartsTimeseriesSeriesType,
} from '../Timeseries/types';

const a = 'TL-香薰7-1-非常长的中间规格-黑色-02B1-M88-D15-2512';
const b = 'TL-香薰7-1-完全不同的中间规格-白色-02B1-M88-D15-2512';
const c = 'FL-直杆布1-1-简易-细布白-脚踏-06B7-M12-D15-2401';
function props(state: LegendState = {}, field = 'kk_sku') {
  const chart = new ChartProps({
    width: 720,
    height: 500,
    theme: supersetTheme,
    datasource: { verboseMap: {} },
    formData: {
      ...DEFAULT_FORM_DATA,
      datasource: '3__table',
      viz_type: 'echarts_timeseries_bar',
      x_axis: field,
      xAxis: field,
      metrics: ['销售额'],
      groupby: [],
      seriesType: EchartsTimeseriesSeriesType.Bar,
      orientation: 'horizontal',
      colorByPrimaryAxis: true,
      showLegend: true,
    },
    queriesData: [
      {
        data: [
          { [field]: a, 销售额: 10 },
          { [field]: b, 销售额: 20 },
          { [field]: c, 销售额: 30 },
        ],
        colnames: [field, '销售额'],
        coltypes: [GenericDataType.String, GenericDataType.Numeric],
        label_map: { 销售额: ['销售额'] },
      },
    ],
  });
  return { ...chart, legendState: state } as EchartsTimeseriesChartProps;
}

test('short aliases are unique and independent from full-name selection keys', () => {
  const first = buildSkuSelection('kk_sku', [a, b, c]);
  expect(new Set(Object.values(first.labels)).size).toBe(3);
  expect(
    Object.values(first.labels).every(label => !label.startsWith('[')),
  ).toBe(true);
  expect(Object.values(first.labels).join(' ')).toContain('黑色');
  expect(Object.values(first.labels).join(' ')).toContain('白色');
  expect(buildSkuSelection('kk_sku', [c, b, a])).toEqual(first);
  expect(first.names.every(name => name.startsWith('sku:'))).toBe(true);
  expect(first.names.map(key => first.values[key])).toEqual(
    expect.arrayContaining([a, b, c]),
  );
});
test('selection remains attached to full names when result set and alias collisions change', () => {
  const before = buildSkuSelection('kk_sku', [a, b]);
  const key = before.names.find(name => before.values[name] === b)!;
  const state = { [key]: false, 'current:销售额': false };
  const next = buildSkuSelection('kk_sku', [c, b], state);
  expect(next.selected[key]).toBe(false);
  expect(next.selected[next.names.find(name => next.values[name] === c)!]).toBe(
    false,
  );
  expect(
    buildSkuSelection('other_sku', [b], state).selected,
  ).not.toHaveProperty(key);
});
test('places every SKU name above the bar without changing full query keys', () => {
  const chart = props();
  const original = JSON.stringify(chart.queriesData);
  const result = transformProps(chart);
  expect(result.skuSelection?.names).toHaveLength(3);
  expect(result.echartOptions.backgroundColor).toBe(
    supersetTheme.colorBgContainer,
  );
  expect(result.echartOptions.yAxis).toEqual(
    expect.objectContaining({
      triggerEvent: true,
      axisLabel: expect.objectContaining({
        width: 656,
        inside: true,
        align: 'left',
        verticalAlign: 'bottom',
        interval: 0,
        hideOverlap: false,
        overflow: 'break',
        formatter: expect.any(Function),
      }),
      data: expect.arrayContaining([a, b, c]),
    }),
  );
  expect(result.echartOptions.legend).toEqual(
    expect.objectContaining({ show: false }),
  );
  expect(JSON.stringify(chart.queriesData)).toBe(original);
  expect(result.echartOptions.dataZoom).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'matrix-rows',
        yAxisIndex: 0,
        zoomLock: false,
      }),
      expect.objectContaining({ type: 'inside', moveOnMouseWheel: true }),
    ]),
  );
  expect(result.echartOptions.series).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        barMaxWidth: 14,
        labelLayout: expect.any(Function),
      }),
    ]),
  );
});

test('colliding names expose real differing tokens and stay unique across query order', () => {
  const common = 'TL-极简圆12-1-11-圆柱-燕麦麻-水转印木纹-触摸-3D-';
  const variants = ['1C3-1S', '2C3-1S', '1C3-2S'].map(
    code => `${common}${code}-高美-小01B1-01Y-M66-D15-2307`,
  );
  const selected = buildSkuSelection('kk_sku', variants);
  expect(new Set(Object.values(selected.labels)).size).toBe(3);
  expect(Object.values(selected.labels).join(' ')).toContain('1C3');
  expect(Object.values(selected.labels).join(' ')).toContain('2C3');
  expect(
    Object.values(selected.labels).every(label =>
      label.startsWith('TL-极简圆12-1-11\n'),
    ),
  ).toBe(true);
  expect(buildSkuSelection('kk_sku', [...variants].reverse())).toEqual(
    selected,
  );
});

test('multiple metrics reserve space between names and grouped bars', () => {
  const chart = props();
  chart.formData.metrics = ['销售额', '毛利'];
  expect(transformProps(chart).echartOptions.yAxis).toEqual(
    expect.objectContaining({
      axisLabel: expect.objectContaining({ padding: [0, 0, 26, 0] }),
    }),
  );
});

test('many SKU rows use an unlocked readable viewport while non-SKU charts keep their layout', () => {
  const chart = props();
  chart.queriesData[0].data = Array.from({ length: 50 }, (_, i) => ({
    kk_sku: `SKU-${i}`,
    销售额: i - 10,
  }));
  const result = transformProps(chart);
  expect(result.echartOptions.dataZoom).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'matrix-rows',
        show: true,
        zoomLock: false,
        end: 100,
        start: expect.any(Number),
      }),
    ]),
  );
  expect(
    transformProps(props({}, 'shop_name')).echartOptions.yAxis,
  ).not.toEqual(
    expect.objectContaining({
      axisLabel: expect.objectContaining({ inside: true }),
    }),
  );
});
test('selection applies immediately and survives new query objects, empty selection and reload', () => {
  const original = transformProps(props()).skuSelection!;
  const state = Object.fromEntries(
    original.names.map(key => [key, original.values[key] === b]),
  );
  for (const saved of [
    state,
    JSON.parse(JSON.stringify(state)) as LegendState,
  ]) {
    const result = transformProps(props(saved));
    expect(result.skuSelection?.names).toHaveLength(3);
    expect(result.echartOptions.yAxis).toEqual(
      expect.objectContaining({ data: [b] }),
    );
    expect(result.skuSelection?.selected).toEqual(state);
  }
  const none = Object.fromEntries(original.names.map(key => [key, false]));
  expect(transformProps(props(none)).skuSelection?.selected).toEqual(none);
  expect(transformProps(props(none)).echartOptions.yAxis).toEqual(
    expect.objectContaining({ data: [] }),
  );
  expect(transformProps(props({}, 'shop_name')).skuSelection).toBeUndefined();
});

test('legacy short aliases never combine different complete SKU series', () => {
  const rows = [{ SKU简称: 'TL-香薰7-1 · 2512', salesA: 10, salesB: 20 }];
  const before = JSON.stringify(rows);
  const result = expandSkuAliases(rows, 'SKU简称', {
    SKU简称: 'LEFT(kk_sku, 4)',
    kk_sku: 'kk_sku',
    配送数量: 'SUM(shipped_num)',
    salesA: a,
    salesB: b,
  });
  expect(result.data).toEqual([
    { SKU简称: a, salesA: 10, salesB: null },
    { SKU简称: b, salesA: null, salesB: 20 },
  ]);
  expect(result.axisValues).toEqual({
    [a]: 'TL-香薰7-1 · 2512',
    [b]: 'TL-香薰7-1 · 2512',
  });
  expect(JSON.stringify(rows)).toBe(before);
  const chart = props();
  chart.rawFormData.x_axis = {
    expressionType: 'SQL',
    label: 'SKU简称',
    sqlExpression: 'LEFT(kk_sku, 4)',
  };
  chart.formData.xAxis = chart.rawFormData.x_axis;
  chart.formData.groupby = ['kk_sku'];
  chart.queriesData = [
    {
      data: rows,
      colnames: ['SKU简称', 'salesA', 'salesB'],
      coltypes: [
        GenericDataType.String,
        GenericDataType.Numeric,
        GenericDataType.Numeric,
      ],
      label_map: {
        SKU简称: ['LEFT(kk_sku, 4)'],
        kk_sku: ['kk_sku'],
        配送数量: ['SUM(shipped_num)'],
        salesA: ['配送数量', a],
        salesB: ['配送数量', b],
      },
    },
  ];
  const transformed = transformProps(chart);
  expect(transformed.skuSelection!.names).toHaveLength(2);
  expect(Object.values(transformed.skuSelection!.values)).toEqual(
    expect.arrayContaining([a, b]),
  );
  expect(transformed.echartOptions.yAxis).toEqual(
    expect.objectContaining({ data: expect.arrayContaining([a, b]) }),
  );
});
