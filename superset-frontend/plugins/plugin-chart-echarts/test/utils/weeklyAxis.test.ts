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
  EChartsOption,
  BarSeriesOption,
  XAXisComponentOption,
} from 'echarts';
import { alignWeeklyAxis } from '../../src/utils/weeklyAxis';
import type GlobalModel from 'echarts/types/src/model/Global';
import { getXAxisFormatter } from '../../src/utils/formatters';

const dates = Array.from(
  { length: 13 },
  (_, i) => Date.UTC(2026, 5, 7) + i * 604800000,
);
const data = dates.map((date, i) => [date, i + 1]);
const original: EChartsOption = {
  animation: false,
  xAxis: {
    type: 'time',
    axisLabel: {
      formatter: getXAxisFormatter('smart_date', 'P1W_SUN'),
      interval: 0,
    } as XAXisComponentOption['axisLabel'] & { interval: number },
  },
  yAxis: { type: 'value' },
  dataZoom: [{ type: 'slider', start: 0, end: 100 }],
  series: [
    { type: 'bar', data },
    { type: 'line', data: data.slice(1) },
  ],
};

test('weekly ticks follow the actual sorted dates; original tooltip/drill values survive and zoom works', () => {
  const output = alignWeeklyAxis(original, 'P1W_SUN') as EChartsOption;
  expect(output).toMatchObject({ xAxis: { data: dates.map(String) } });
  expect(
    (output.series as BarSeriesOption[])[0].data?.map(row =>
      (row as number[]).slice(0, 2),
    ),
  ).toEqual(data);
  expect((original.series as BarSeriesOption[])[0].data).toBe(data);
  const chart = init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 1300,
    height: 500,
  });
  try {
    chart.setOption(output);
    const svg = chart.renderToSVGString();
    for (let week = 24; week <= 36; week += 1) {
      expect(svg.match(new RegExp(`2026年第${week}周`, 'g'))).toHaveLength(1);
    }
    // 在真实 ECharts 坐标系核对全部柱/折线日期；稀疏 B 查询不能平移到错误的周。
    const pixels = dates.map(
      date => chart.convertToPixel({ xAxisIndex: 0 }, String(date)) as number,
    );
    const model = (chart as unknown as { getModel(): GlobalModel }).getModel();
    const bars = model.getSeriesByIndex(0).getData();
    const linePoints = model.getSeriesByIndex(1).getData().getLayout('points');
    pixels.forEach((pixel, i) => {
      const bar = bars.getItemLayout(i);
      expect(bar.x + bar.width / 2).toBeCloseTo(pixel, 3);
      if (i > 0) expect(linePoints[(i - 1) * 2]).toBeCloseTo(pixel, 3);
    });
    expect(
      pixels.every(
        (pixel, i) => Number.isFinite(pixel) && (!i || pixel > pixels[i - 1]),
      ),
    ).toBe(true);
    chart.dispatchAction({ type: 'dataZoom', start: 25, end: 75 });
    const zoomed = chart.renderToSVGString();
    expect(zoomed).not.toContain('2026年第24周');
    expect(zoomed).toContain('2026年第30周');
  } finally {
    chart.dispose();
  }
});

test('disjoint or unsorted query dates use the chronological union without merging same-label dates', () => {
  const options = {
    ...original,
    series: [
      { type: 'bar', data: [data[2], data[0]] },
      { type: 'line', data: [data[1]] },
    ],
  };
  const output = alignWeeklyAxis(options, 'P1W_SUN');
  expect(output).toMatchObject({
    xAxis: { data: dates.slice(0, 3).map(String) },
  });
  expect(alignWeeklyAxis(original, 'P1D')).toBe(original);
  expect(alignWeeklyAxis(original, 'P1M')).toBe(original);
  expect(alignWeeklyAxis(original)).toBe(original);
  const annotated = {
    ...original,
    series: [{ type: 'line', data, markLine: { data: [] } }],
  };
  expect(alignWeeklyAxis(annotated, 'P1W_SUN')).toBe(annotated);
});

test('horizontal and negative-value data-item styles keep their original metric and timestamp', () => {
  const item = { value: [-5, dates[0]], label: { position: 'left' } };
  const horizontal = {
    ...original,
    xAxis: original.yAxis,
    yAxis: original.xAxis,
    series: [{ type: 'bar', data: [item] }],
  };
  const result = alignWeeklyAxis(horizontal, 'P1W_SUN', true);
  expect(result).toMatchObject({
    yAxis: { data: [String(dates[0])] },
    series: [
      {
        encode: { x: 0, y: 2 },
        data: [{ ...item, value: [-5, dates[0], String(dates[0])] }],
      },
    ],
  });
  expect(item.value).toEqual([-5, dates[0]]);
});
