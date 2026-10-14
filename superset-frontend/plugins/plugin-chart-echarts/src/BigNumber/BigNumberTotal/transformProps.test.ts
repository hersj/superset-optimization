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

import { GenericDataType } from '@apache-superset/core/common';
import { getColorFormatters } from '@superset-ui/chart-controls';
import { BigNumberTotalChartProps } from '../types';
import transformProps from './transformProps';

jest.mock('@superset-ui/chart-controls', () => ({
  getColorFormatters: jest.fn(),
}));

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  GenericDataType: { Temporal: 2, String: 1 },
  getMetricLabel: jest.fn(metric => metric),
  extractTimegrain: jest.fn(() => 'P1D'),
  getValueFormatter: jest.fn(() => (v: any) => `$${v}`),
}));

jest.mock('../utils', () => ({
  getDateFormatter: jest.fn(() => (v: any) => `${v}pm`),
  parseMetricValue: jest.fn(val => (val == null ? null : Number(val))),
  getOriginalLabel: jest.fn((metric, metrics) => {
    console.log(metrics);
    return metric;
  }),
}));

describe('BigNumberTotal transformProps', () => {
  const onContextMenu = jest.fn();
  const baseFormData = {
    headerFontSize: 20,
    metric: 'value',
    subheader: 'sub header text',
    subheaderFontSize: 14,
    forceTimestampFormatting: false,
    timeFormat: 'YYYY-MM-DD',
    yAxisFormat: 'SMART_NUMBER',
    conditionalFormatting: [{ color: 'red', op: '>', value: 0 }],
    currencyFormat: { symbol: '$', symbolPosition: 'prefix' },
  };

  const baseDatasource = {
    currencyFormats: { value: '$0,0.00' },
    columnFormats: { value: '$0,0.00' },
    metrics: [{ metric_name: 'value', d3format: '.2f' }],
  };

  const baseHooks = { onContextMenu };

  const baseRawFormData = { dummy: 'raw' };

  test('should return null bigNumber when no data is provided', () => {
    const chartProps = {
      width: 400,
      height: 300,
      queriesData: [{ data: [], coltypes: [] }],
      formData: baseFormData,
      rawFormData: baseRawFormData,
      hooks: baseHooks,
      datasource: baseDatasource,
    };

    const result = transformProps(
      chartProps as unknown as BigNumberTotalChartProps,
    );
    expect(result.bigNumber).toBeNull();
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(result.subtitle).toBe(baseFormData.subheader);
    expect(result.onContextMenu).toBe(onContextMenu);
    expect(result.refs).toEqual({});
    // headerFormatter should be set even if there's no data
    expect(typeof result.headerFormatter).toBe('function');
    // colorThresholdFormatters fallback to empty array when getColorFormatters returns falsy
    expect(result.colorThresholdFormatters).toEqual([]);
  });
  test('should convert subheader to subtitle', () => {
    const chartProps = {
      width: 400,
      height: 300,
      queriesData: [{ data: [], coltypes: [] }],
      formData: { ...baseFormData, subheader: 'test' },
      rawFormData: baseRawFormData,
      hooks: baseHooks,
      datasource: baseDatasource,
    };
    const result = transformProps(
      chartProps as unknown as BigNumberTotalChartProps,
    );
    expect(result.subtitle).toBe('test');
  });

  const baseChartProps = {
    width: 400,
    height: 300,
    queriesData: [{ data: [], coltypes: [] }],
    rawFormData: { dummy: 'raw' },
    hooks: { onContextMenu: jest.fn() },
    datasource: {
      currencyFormats: { value: '$0,0.00' },
      columnFormats: { value: '$0,0.00' },
      metrics: [{ metric_name: 'value', d3format: '.2f' }],
    },
  };

  test('uses subtitle font size when subtitle is provided', () => {
    const result = transformProps({
      ...baseChartProps,
      formData: {
        subtitle: 'Subtitle wins',
        subheader: 'Fallback subheader',
        subtitleFontSize: 0.4,
        subheaderFontSize: 0.99,
        metric: 'value',
        headerFontSize: 0.3,
        yAxisFormat: 'SMART_NUMBER',
        timeFormat: 'smart_date',
      },
    } as unknown as BigNumberTotalChartProps);

    expect(result.subtitle).toBe('Subtitle wins');
    expect(result.subtitleFontSize).toBe(0.4);
  });

  test('should compute bigNumber using parseMetricValue when data exists', () => {
    const chartProps = {
      width: 500,
      height: 400,
      queriesData: [
        { data: [{ value: '456' }], coltypes: [GenericDataType.String] },
      ],
      formData: { ...baseFormData, forceTimestampFormatting: false },
      rawFormData: baseRawFormData,
      hooks: baseHooks,
      datasource: baseDatasource,
      sortBy: 'value',
    };

    const result = transformProps(
      chartProps as unknown as BigNumberTotalChartProps,
    );
    // parseMetricValue converts '456' to number 456 by our mock
    expect(result.bigNumber).toEqual(456);
  });

  test('should use formatTime as headerFormatter for Temporal or String types or forced formatting', () => {
    // Case 1: Temporal type
    const chartPropsTemporal = {
      width: 600,
      height: 450,
      queriesData: [
        { data: [{ value: '789' }], coltypes: [GenericDataType.Temporal] },
      ],
      formData: { ...baseFormData, forceTimestampFormatting: false },
      rawFormData: baseRawFormData,
      hooks: baseHooks,
      datasource: baseDatasource,
    };

    const resultTemporal = transformProps(
      chartPropsTemporal as unknown as BigNumberTotalChartProps,
    );
    expect(resultTemporal.headerFormatter(5)).toBe('5pm');

    // Case 2: String type regardless of forcing formatting
    const chartPropsString = {
      width: 600,
      height: 450,
      queriesData: [
        { data: [{ value: '789' }], coltypes: [GenericDataType.String] },
      ],
      formData: { ...baseFormData, forceTimestampFormatting: false },
      rawFormData: baseRawFormData,
      hooks: baseHooks,
      datasource: baseDatasource,
    };

    const resultString = transformProps(
      chartPropsString as unknown as BigNumberTotalChartProps,
    );
    expect(resultString.headerFormatter(5)).toBe('5pm');

    // Case 3: Forced timestamp formatting
    const chartPropsForced = {
      width: 600,
      height: 450,
      queriesData: [{ data: [{ value: '789' }], coltypes: [0] }], // non-temporal/non-string
      formData: { ...baseFormData, forceTimestampFormatting: true },
      rawFormData: baseRawFormData,
      hooks: baseHooks,
      datasource: baseDatasource,
    };

    const resultForced = transformProps(
      chartPropsForced as unknown as BigNumberTotalChartProps,
    );
    expect(resultForced.headerFormatter(5)).toBe('5pm');
  });

  test('should use numberFormatter as headerFormatter when not Temporal/String and no forced formatting', () => {
    const chartProps = {
      width: 700,
      height: 500,
      queriesData: [{ data: [{ value: '321' }], coltypes: [0] }], // non-temporal/non-string
      formData: { ...baseFormData, forceTimestampFormatting: false },
      rawFormData: baseRawFormData,
      hooks: baseHooks,
      datasource: baseDatasource,
    };

    const result = transformProps(
      chartProps as unknown as BigNumberTotalChartProps,
    );
    expect(result.headerFormatter(500)).toBe('$500');
  });

  test('should propagate colorThresholdFormatters from getColorFormatters', () => {
    // Override the getColorFormatters mock to return specific value
    const mockFormatters = [{ formatter: 'red' }];
    (getColorFormatters as jest.Mock).mockReturnValueOnce(mockFormatters);

    const chartProps = {
      width: 800,
      height: 600,
      queriesData: [
        { data: [{ value: '100' }], coltypes: [GenericDataType.Temporal] },
      ],
      formData: baseFormData,
      rawFormData: baseRawFormData,
      hooks: baseHooks,
      datasource: baseDatasource,
    };

    const result = transformProps(
      chartProps as unknown as BigNumberTotalChartProps,
    );
    expect(result.colorThresholdFormatters).toEqual(mockFormatters);
  });

  test('adds default period and year comparisons when comparison query results exist', () => {
    const result = transformProps({
      ...baseChartProps,
      queriesData: [
        { data: [{ value: '100' }], coltypes: [0] },
        { data: [{ value: '80' }], coltypes: [0] },
        { data: [{ value: '50' }], coltypes: [0] },
      ],
      formData: baseFormData,
    } as unknown as BigNumberTotalChartProps);

    expect(result.bigNumber).toBe(100);
    expect(result.subheader).toBe('环比 +25.0% | 同比 +100.0%');
  });

  test('renders only configured year comparison', () => {
    const result = transformProps({
      ...baseChartProps,
      queriesData: [
        { data: [{ value: '100' }], coltypes: [0] },
        { data: [{ value: '50' }], coltypes: [0] },
      ],
      formData: { ...baseFormData, comparisonModes: ['year'] },
    } as unknown as BigNumberTotalChartProps);

    expect(result.subheader).toBe('同比 +100.0%');
  });

  test('preserves configured subheader when comparison is disabled', () => {
    const result = transformProps({
      ...baseChartProps,
      queriesData: [{ data: [{ value: '100' }], coltypes: [0] }],
      formData: {
        ...baseFormData,
        comparisonEnabled: false,
        subheader: 'Manual subheader',
      },
    } as unknown as BigNumberTotalChartProps);

    expect(result.subheader).toBe('Manual subheader');
  });

  test('preserves configured subheader when comparison query results are absent', () => {
    const result = transformProps({
      ...baseChartProps,
      queriesData: [{ data: [{ value: '100' }], coltypes: [0] }],
      formData: baseFormData,
    } as unknown as BigNumberTotalChartProps);

    expect(result.bigNumber).toBe(100);
    expect(result.subheader).toBe(baseFormData.subheader);
  });
});

const customPeriod = {
  currentTimeRange: '2026-10-01 : 2026-10-14',
  comparisonTimeRange: '2026-08-05 : 2026-09-05',
  timeColumn: 'ds',
};
const customExtra = {
  custom_form_data: { custom_period_comparison: customPeriod },
};

test.each([
  { a: 13000, b: 31000, delta: '$-18000', rate: '-58.1%' },
  { a: -50, b: -100, delta: '+$50', rate: '+50.0%' },
  { a: 50, b: 0, delta: '+$50', rate: '—' },
  { a: 0, b: 0, delta: '$0', rate: '—' },
  { a: 50, b: null, delta: '—', rate: '—' },
  { a: null, b: 100, delta: '—', rate: '—' },
])(
  'custom total card compares full periods: $a / $b',
  ({ a, b, delta, rate }) => {
    const result = transformProps({
      width: 400,
      height: 300,
      formData: { metric: 'value', comparisonEnabled: false },
      rawFormData: {
        datasource: '1__table',
        viz_type: 'big_number_total',
        extra_form_data: customExtra,
      },
      queriesData: [
        { data: [{ value: a }], coltypes: [] },
        { data: [{ value: b }] },
      ],
      hooks: {},
      datasource: {},
    } as unknown as BigNumberTotalChartProps);
    expect(result.bigNumber).toBe(a);
    expect(result.subheader).toContain(`对比值 ${b === null ? '—' : `$${b}`}`);
    expect(result.subheader).toContain(`差额 ${delta}`);
    expect(result.subheader).toContain(`变化率 ${rate}`);
    expect(result.subtitle).toContain('13 天');
    expect(result.subtitle).toContain('31 天');
    expect(result.subtitle).toContain('期间长度不同');
  },
);

test.each([false, true])(
  'normalized custom period respects raw OFF precedence: %s',
  off => {
    const result = transformProps({
      width: 400,
      height: 300,
      formData: {
        metric: 'value',
        comparisonEnabled: false,
        extraFormData: customExtra,
      },
      rawFormData: off
        ? {
            extra_form_data: {
              custom_form_data: { custom_period_comparison: null },
            },
          }
        : {},
      queriesData: [
        { data: [{ value: 100 }], coltypes: [] },
        { data: [{ value: 50 }] },
      ],
      hooks: {},
      datasource: {},
    } as unknown as BigNumberTotalChartProps);
    expect(result.subheader.includes('变化率 +100.0%')).toBe(!off);
    expect(result.subheader.length === 0).toBe(off);
  },
);

test('custom total card parses both period values through the existing metric parser', () => {
  const result = transformProps({
    width: 400,
    height: 300,
    formData: { metric: 'value', comparisonEnabled: false },
    rawFormData: { extra_form_data: customExtra },
    queriesData: [
      { data: [{ value: '13000' }], coltypes: [] },
      { data: [{ value: '31000' }] },
    ],
    hooks: {},
    datasource: {},
  } as unknown as BigNumberTotalChartProps);
  expect(result.bigNumber).toBe(13000);
  expect(result.subheader).toContain('对比值 $31000');
  expect(result.subheader).toContain('差额 $-18000');
  expect(result.subheader).toContain('变化率 -58.1%');
});
