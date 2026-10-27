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
import { ChartProps, QueryFormData } from '@superset-ui/core';
import { supersetTheme } from '@apache-superset/core/theme';
import { render } from 'spec/helpers/testing-library';
import PivotTableChart from '../src/PivotTableChart';
import transformProps from '../src/plugin/transformProps';
import { PivotTable } from '../src/react-pivottable';
import { MetricsLayoutEnum, PivotTableProps } from '../src/types';

jest.mock('../src/react-pivottable/PivotTable', () => jest.fn(() => null));

type Formatter = (
  value: number | null | undefined,
  aggregator?: { getCurrencies: () => string[] },
) => string;

const currencyModes = [
  { name: 'number', currencyFormat: undefined },
  {
    name: 'fixed currency',
    currencyFormat: { symbol: 'USD', symbolPosition: 'prefix' },
  },
  {
    name: 'AUTO cell currency',
    currencyFormat: { symbol: 'AUTO', symbolPosition: 'prefix' },
    currencies: ['USD'],
  },
  {
    name: 'AUTO mixed currencies',
    currencyFormat: { symbol: 'AUTO', symbolPosition: 'prefix' },
    currencies: ['USD', 'EUR'],
  },
  {
    name: 'AUTO fallback currency',
    currencyFormat: { symbol: 'AUTO', symbolPosition: 'prefix' },
    detectedCurrency: 'EUR',
  },
  {
    name: 'AUTO neutral fallback',
    currencyFormat: { symbol: 'AUTO', symbolPosition: 'prefix' },
  },
];

test.each(currencyModes)(
  '$name preserves numbers and only replaces NULL when configured',
  ({ currencyFormat, currencies, detectedCurrency }) => {
    const chartProps = new ChartProps<QueryFormData>({
      width: 800,
      height: 600,
      formData: {
        viz_type: 'pivot_table_v2',
        datasource: '',
        groupby_rows: ['shop'],
        groupby_columns: [],
        metrics: ['amount', 'rate'],
        metrics_layout: MetricsLayoutEnum.COLUMNS,
        aggregate_function: 'Sum',
        value_format: '.2f',
        currency_format: currencyFormat,
        column_config: {
          rate: { d3NumberFormat: '.1%', pivotAggregateFunction: 'Maximum' },
        },
        pivot_number_format_rules: [
          { axis: 'column', field: 'Metric', value: 'rate', format: '.1%' },
        ],
      },
      queriesData: [
        {
          data: [{ shop: 'A', amount: 100, rate: null }],
          colnames: ['shop', 'amount', 'rate'],
          coltypes: [1, 0, 0],
          detected_currency: detectedCurrency,
        },
      ],
      datasource: {},
      theme: supersetTheme,
    });
    const props = transformProps(chartProps) as PivotTableProps;
    const { rerender } = render(<PivotTableChart {...props} />);
    const legacy = jest.mocked(PivotTable).mock.calls.at(-1)![0];
    const legacyDefault = legacy.defaultFormatter as Formatter;
    const legacyMetric = (
      legacy.customFormatters as Record<string, Record<string, Formatter>>
    ).Metric.rate;
    const aggregator = currencies
      ? { getCurrencies: () => currencies }
      : undefined;
    const values = [null, undefined, 0, 0.125, -10, NaN, Infinity];
    const previousDefault = values.map(value =>
      legacyDefault(value, aggregator),
    );
    const previousMetric = values.map(value => legacyMetric(value, aggregator));

    rerender(<PivotTableChart {...props} pivotNullValue="—" />);
    const configured = jest.mocked(PivotTable).mock.calls.at(-1)![0];
    const defaultFormatter = configured.defaultFormatter as Formatter;
    const metricFormatter = (
      configured.customFormatters as Record<string, Record<string, Formatter>>
    ).Metric.rate;
    expect(values.map(value => defaultFormatter(value, aggregator))).toEqual([
      '—',
      '—',
      ...previousDefault.slice(2),
    ]);
    expect(values.map(value => metricFormatter(value, aggregator))).toEqual([
      '—',
      '—',
      ...previousMetric.slice(2),
    ]);
    expect(configured.customAggregatorNames).toEqual(
      legacy.customAggregatorNames,
    );
    expect(configured.tableOptions).toEqual(legacy.tableOptions);

    rerender(<PivotTableChart {...props} />);
    const restored = jest.mocked(PivotTable).mock.calls.at(-1)![0];
    expect(
      values.map(value =>
        (restored.defaultFormatter as Formatter)(value, aggregator),
      ),
    ).toEqual(previousDefault);
  },
);
