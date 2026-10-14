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
  ComparisonType,
  CurrencyFormatter,
  getNumberFormatter,
  NumberFormatter,
} from '@superset-ui/core';
import {
  formatCustomPeriodTooltip,
  getCustomTimeUnitFormatter,
  getCustomTimeControlledFormatter,
  formatCustomPeriodLegendLabel,
} from '../../src/utils/customPeriodTooltip';

const offset = '2026-08-05 : 2026-08-08';
const timestamp = Date.parse('2026-09-01T00:00:00+08:00');
const input = {
  period: {
    currentTimeRange: '2026-09-01 : 2026-09-04',
    comparisonTimeRange: offset,
  },
  params: [
    {
      seriesId: '销售额',
      marker: '<span style="color:#12abef;"></span>',
      value: [timestamp, 100],
    },
    { seriesId: `销售额__${offset}`, value: [timestamp, 80] },
  ],
  series: [
    {
      id: '销售额',
      name: '销售额',
      data: [[timestamp, 100]],
      itemStyle: { color: '#12abef' },
    },
    {
      id: `销售额__${offset}`,
      name: `销售额__${offset}`,
      data: [[timestamp, 80]],
      itemStyle: { color: '#12abef' },
    },
  ],
  formatterForSeries: () => getNumberFormatter(',.0f'),
};
function render(
  overrides: Partial<Parameters<typeof formatCustomPeriodTooltip>[0]> = {},
) {
  const element = document.createElement('div');
  element.innerHTML = formatCustomPeriodTooltip({ ...input, ...overrides });
  return element;
}

test('pairs A/B into one metric row with marker, formatted values and inclusive period footer', () => {
  const element = render();
  expect(
    [...element.querySelectorAll('thead th')].map(cell => cell.textContent),
  ).toEqual(['指标', '当前2026-09-01', '对比2026-08-05']);
  expect(
    [...element.querySelectorAll('tbody td')].map(cell => cell.textContent),
  ).toEqual(['销售额', '100', '80']);
  expect(element.querySelector('tbody span')).not.toBeNull();
  expect(element.textContent).toContain('2026-09-03');
  expect(element.textContent).toContain('2026-08-07');
  expect(element.innerHTML).not.toContain(offset);
  expect(
    element.querySelector('table')?.nextElementSibling?.children,
  ).toHaveLength(3);
  expect(
    element.querySelector('table')?.nextElementSibling?.children[0].textContent,
  ).toContain('当前：');
  expect(
    element.querySelector('table')?.nextElementSibling?.children[1].textContent,
  ).toContain('对比：');
  expect(
    element.querySelector('table')?.nextElementSibling?.children[2].textContent,
  ).toContain('完整期间总量');
});

test('keeps every metric format and highlights the paired row when B is hovered', () => {
  const element = render({
    params: [
      ...input.params,
      { seriesId: '毛利率', value: [timestamp, 0.2] },
      { seriesId: `毛利率__${offset}`, value: [timestamp, 0.1] },
    ],
    formatterForSeries: key =>
      getNumberFormatter(key.startsWith('毛利率') ? '.1%' : ',.0f'),
    focusedSeries: `毛利率__${offset}`,
  });
  expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(element.textContent).toContain('20.0%');
  expect(element.textContent).toContain('10.0%');
  expect(
    element.querySelectorAll('tbody tr')[1].getAttribute('style'),
  ).toContain('font-weight:700');
});

test('item hover recovers only its paired metric from the same bucket', () => {
  const element = render({ params: [input.params[1]], itemTooltip: true });
  expect(
    [...element.querySelectorAll('tbody td')].map(cell => cell.textContent),
  ).toEqual(['销售额', '100', '80']);
});

test('horizontal item hover pairs values using the horizontal axis indices', () => {
  const element = render({
    params: [{ seriesId: '销售额', value: [100, timestamp] }],
    series: [{ id: `销售额__${offset}`, data: [{ value: [80, timestamp] }] }],
    itemTooltip: true,
    xIndex: 1,
    yIndex: 0,
  });
  expect(
    [...element.querySelectorAll('tbody td')].map(cell => cell.textContent),
  ).toEqual(['销售额', '100', '80']);
});

test('hidden comparison is not recovered by item hover', () => {
  const element = render({
    params: [input.params[0]],
    itemTooltip: true,
    legendState: { [`销售额__${offset}`]: false },
  });
  expect(
    [...element.querySelectorAll('tbody td')].map(cell => cell.textContent),
  ).toEqual(['销售额', '100', '—']);
});

test('hidden current metrics are excluded even if supplied by a stale axis event', () => {
  const element = render({
    legendState: { 销售额: false, [`销售额__${offset}`]: false },
  });
  expect(element.querySelectorAll('tbody tr')).toHaveLength(0);
});

test('missing B remains a dash rather than zero', () => {
  const element = render({
    params: [
      input.params[0],
      { seriesId: `销售额__${offset}`, value: [timestamp, null] },
    ],
  });
  expect(
    [...element.querySelectorAll('tbody td')].map(cell => cell.textContent),
  ).toEqual(['销售额', '100', '—']);
});

test('escapes metric labels and formatter output while preserving the color marker', () => {
  const label = '<img src=x onerror="alert(1)">';
  const element = render({
    params: [
      {
        seriesId: label,
        marker: '<span style="color:#12abef;"></span>',
        value: [timestamp, 100],
      },
    ],
    formatterForSeries: () => getNumberFormatter(',.0f'),
  });
  expect(element.querySelector('img')).toBeNull();
  expect(element.querySelector('tbody td')?.textContent).toBe(label);
  expect(element.querySelector('tbody span')).not.toBeNull();
});

test.each([
  [
    'P1D',
    '2026-09-01 : 2026-09-04',
    offset,
    '2026-09-02',
    '2026-09-02',
    '2026-08-06',
  ],
  [
    'P1M',
    '2026-07-01 : 2026-10-01',
    '2026-04-01 : 2026-07-02',
    '2026-09-01',
    '2026年9月',
    '2026年6月',
  ],
  [
    'P3M',
    '2026-07-01 : 2027-01-01',
    '2026-04-01 : 2026-10-01',
    '2026-10-01',
    '2026年10–12月',
    '2026年7–9月',
  ],
  [
    'P1Y',
    '2026-01-01 : 2027-01-01',
    '2024-01-01 : 2025-01-01',
    '2026-01-01',
    '2026年',
    '2024年',
  ],
  [
    'P1Y_FISCAL',
    '2026-04-01 : 2027-03-31',
    '2023-04-01 : 2024-03-31',
    '2026-04-01',
    '2026财年',
    '2023财年',
  ],
  [
    'P3M_FISCAL',
    '2026-01-01 : 2026-04-01',
    '2025-07-01 : 2025-10-01',
    '2026-01-01',
    '2026年1–3月',
    '2025年7–9月',
  ],
  [
    'P1M',
    '2026-01-31 : 2026-03-31',
    '2024-02-29 : 2024-04-30',
    '2026-02-01',
    '2026年2月',
    '2024年3月',
  ],
])(
  'shows separate business bucket units for %s without assuming equal day counts',
  (grain, current, comparison, date, currentLabel, comparisonLabel) => {
    const x = Date.parse(`${date}T00:00:00+08:00`);
    const element = render({
      timeGrain: grain,
      period: { currentTimeRange: current, comparisonTimeRange: comparison },
      params: [
        { seriesId: '销售额', value: [x, 100] },
        { seriesId: `销售额__${comparison}`, value: [x, 80] },
      ],
    });
    const headers = element.querySelectorAll('thead th');
    expect(headers[1].textContent).toContain(currentLabel);
    expect(headers[2].textContent).toContain(comparisonLabel);
    expect(element.innerHTML).not.toContain(comparison);
  },
);

test.each([
  [ComparisonType.Values, '对比'],
  [ComparisonType.Difference, '差额'],
  [ComparisonType.Percentage, '变化率'],
  [ComparisonType.Ratio, '比值'],
])(
  'labels %s offset values correctly and does not synthesize missing A',
  (style, label) => {
    const element = render({
      params: [input.params[1]],
      comparisonTypeForSeries: () => style,
    });
    expect(element.querySelectorAll('thead th')[2].textContent).toContain(
      label,
    );
    expect(
      [...element.querySelectorAll('tbody td')].map(cell => cell.textContent),
    ).toEqual([
      '销售额',
      '—',
      style === ComparisonType.Percentage ? '8,000.00%' : '80',
    ]);
  },
);

test('category axes compare complete periods without parsing a shop as a date', () => {
  const element = render({
    temporalAxis: false,
    params: [{ seriesId: '销售额', value: ['SW1-UK', 100] }],
  });
  expect(element.textContent).toContain('SW1-UK');
  expect(element.querySelectorAll('thead th')[1].textContent).toBe('当前整期');
});

test('focused metric selection keeps its A/B pair and excludes other metrics', () => {
  const element = render({
    params: [...input.params, { seriesId: '毛利率', value: [timestamp, 0.2] }],
    selectedSeries: `销售额__${offset}`,
  });
  expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(element.textContent).not.toContain('毛利率');
});

test('formatter output is escaped as text rather than interpreted as HTML', () => {
  const unsafe = '<img src=x onerror="alert(1)">';
  const formatter = new NumberFormatter({
    id: 'unsafe-test',
    formatFunc: () => unsafe,
  });
  const element = render({ formatterForSeries: () => formatter });
  expect(element.querySelector('img')).toBeNull();
  expect(element.querySelectorAll('tbody td')[1].textContent).toBe(unsafe);
});

test('mixed comparison styles state the derived type in its cell without labeling it as raw B', () => {
  const element = render({
    params: [
      ...input.params,
      { seriesId: '毛利率', value: [timestamp, 0.2] },
      { seriesId: `毛利率__${offset}`, value: [timestamp, 0.1] },
    ],
    formatterForSeries: key =>
      getNumberFormatter(key.startsWith('毛利率') ? '.1%' : ',.0f'),
    comparisonTypeForSeries: key =>
      key.startsWith('毛利率')
        ? ComparisonType.Percentage
        : ComparisonType.Values,
  });
  expect(element.querySelectorAll('thead th')[2].textContent).toContain(
    '对比结果',
  );
  expect(element.querySelectorAll('tbody tr')[1].textContent).toContain(
    '变化率 10.0%',
  );
});

test('fiscal period footer preserves the March31 exclusive boundary and actual unequal days', () => {
  const current = '2026-04-01 : 2027-03-31';
  const comparison = '2023-04-01 : 2024-03-31';
  const x = Date.parse('2026-04-01T00:00:00+08:00');
  const element = render({
    timeGrain: 'P1Y_FISCAL',
    period: { currentTimeRange: current, comparisonTimeRange: comparison },
    params: [
      { seriesId: '销售额', value: [x, 100] },
      { seriesId: `销售额__${comparison}`, value: [x, 80] },
    ],
  });
  expect(element.textContent).toContain('2027-03-30');
  expect(element.textContent).toContain('2024-03-30');
  expect(element.textContent).toContain('期间长度不同');
});

test.each([
  [ComparisonType.Percentage, 0.1, '10.00%'],
  [ComparisonType.Ratio, 1.25, '1.25'],
])(
  'formats %s derived values as dimensionless numbers, never currency',
  (style, value, expected) => {
    const currency = new CurrencyFormatter({
      d3Format: ',.2f',
      currency: { symbol: 'USD', symbolPosition: 'prefix' },
    });
    const element = render({
      params: [
        input.params[0],
        { seriesId: `销售额__${offset}`, value: [timestamp, value] },
      ],
      formatterForSeries: () => currency,
      comparisonTypeForSeries: () => style,
    });
    expect(element.querySelectorAll('tbody td')[1].textContent).toBe(
      '$ 100.00',
    );
    expect(element.querySelectorAll('tbody td')[2].textContent).toBe(expected);
  },
);

test('preserves an explicitly configured numeric percent precision', () => {
  const element = render({
    params: [
      input.params[0],
      { seriesId: `销售额__${offset}`, value: [timestamp, 0.1] },
    ],
    formatterForSeries: () => getNumberFormatter('.1%'),
    comparisonTypeForSeries: () => ComparisonType.Percentage,
  });
  expect(element.querySelectorAll('tbody td')[2].textContent).toBe('10.0%');
});

test.each([ComparisonType.Values, ComparisonType.Difference])(
  '%s comparison retains the original currency formatter',
  style => {
    const currency = new CurrencyFormatter({
      d3Format: ',.2f',
      currency: { symbol: 'USD', symbolPosition: 'prefix' },
    });
    const element = render({
      formatterForSeries: () => currency,
      comparisonTypeForSeries: () => style,
    });
    expect(element.querySelectorAll('tbody td')[2].textContent).toBe('$ 80.00');
  },
);

test('controlled date formatter requires the CustomTime grain/comparison co-marker', () => {
  expect(
    getCustomTimeControlledFormatter({ time_grain_sqla: 'P1M' }),
  ).toBeUndefined();
  expect(
    getCustomTimeControlledFormatter({ time_compare: [] }),
  ).toBeUndefined();
  const formatter = getCustomTimeControlledFormatter({
    time_grain_sqla: 'P1M',
    time_compare: [],
  });
  expect(formatter?.(Date.parse('2026-12-31T16:00:00Z'))).toBe('2027年1月');
});

test('quarter span displays both years across November to January in UTC+8', () => {
  expect(
    getCustomTimeUnitFormatter('P3M')(Date.parse('2026-11-14T16:00:00Z')),
  ).toBe('2026年11月–2027年1月');
  expect(
    getCustomTimeUnitFormatter('P3M_FISCAL')(
      Date.parse('2026-12-31T16:00:00Z'),
    ),
  ).toBe('2027年1–3月');
});

test.each([
  ['2026-08-05 : 2026-08-12', '对比 2026-08-05 ～ 08-11'],
  ['2026-12-28 : 2027-01-04', '对比 2026-12-28 ～ 2027-01-03'],
  ['2024-02-29 : 2024-03-01', '对比 2024-02-29'],
])(
  'legend %s uses the inclusive final day and keeps cross-year context',
  (range, label) => {
    expect(
      formatCustomPeriodLegendLabel({
        ...input.period,
        comparisonTimeRange: range,
      }),
    ).toBe(label);
  },
);

test('custom tooltip explicitly keeps readable text on its white background', () => {
  const element = render();
  expect(element.firstElementChild?.getAttribute('style')).toContain(
    'background-color:#fff',
  );
  expect(element.firstElementChild?.getAttribute('style')).toContain(
    'color:#1f2937',
  );
});
