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
  getScrollableChartHeight,
  persistMatrixViewport,
  restoreMatrixViewport,
} from './matrixViewport';

const options = {
  dataZoom: [
    {
      id: 'matrix-rows',
      yAxisIndex: 0,
      startValue: 0,
      endValue: 2,
      zoomLock: false,
    },
    { id: 'matrix-rows-inside', yAxisIndex: 0, startValue: 0, endValue: 2 },
    { id: 'time', xAxisIndex: 0, start: 0, end: 100 },
  ],
};

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test('restores both linked row sliders without changing the original or time axis', () => {
  persistMatrixViewport(
    { dataZoom: [{ id: 'matrix-rows', start: 10, end: 40 }] },
    'range',
  );
  const result = restoreMatrixViewport(options, 'range');
  expect(result.dataZoom.slice(0, 2)).toEqual(
    options.dataZoom.slice(0, 2).map(zoom => ({
      ...zoom,
      start: 10,
      end: 40,
      startValue: undefined,
      endValue: undefined,
    })),
  );
  expect(result.dataZoom[2]).toEqual(options.dataZoom[2]);
  expect(options.dataZoom[0].startValue).toBe(0);
});

test.each([
  'bad JSON',
  'null',
  '{}',
  '{"start":-1,"end":50}',
  '{"start":0,"end":101}',
  '{"start":70,"end":20}',
  '{"start":"0","end":10}',
])('ignores invalid saved ranges: %s', value => {
  localStorage.setItem('range', value);
  expect(restoreMatrixViewport(options, 'range')).toBe(options);
});

test('does not apply row preferences to charts without a matrix slider', () => {
  localStorage.setItem('range', '{"start":10,"end":40}');
  const ordinary = { series: [] };
  expect(restoreMatrixViewport(ordinary, 'range')).toBe(ordinary);
  expect(restoreMatrixViewport(options)).toBe(options);
});

test('navigation works if browser storage is unavailable', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(restoreMatrixViewport(options, 'range')).toBe(options);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(() =>
    persistMatrixViewport(
      { dataZoom: [{ id: 'matrix-rows', start: 0, end: 100 }] },
      'range',
    ),
  ).not.toThrow();
});

test.each([10, 50, 100, 1000])(
  'keeps all %s restored SKU rows readable',
  count => {
    const full = {
      yAxis: { data: Array.from({ length: count }, (_, i) => String(i)) },
      grid: { top: 38, bottom: 42 },
      dataZoom: [{ id: 'matrix-rows', start: 0, end: 100 }],
    };
    expect(getScrollableChartHeight(full, 300, 84)).toBe(count * 84 + 80);
  },
);

test('sizes a partial category window with inclusive rounded endpoints', () => {
  const partial = {
    yAxis: { data: Array.from({ length: 100 }, (_, i) => String(i)) },
    dataZoom: [{ id: 'matrix-rows', start: 80, end: 100 }],
  };
  expect(getScrollableChartHeight(partial, 300, 84)).toBe(21 * 84 + 80);
  expect(getScrollableChartHeight({ yAxis: { data: [] } }, 300, 84)).toBe(300);
});
