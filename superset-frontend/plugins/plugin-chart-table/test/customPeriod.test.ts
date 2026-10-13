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
import { QueryMode, VizType, DataRecord } from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import buildQuery from '../src/buildQuery';
import transformProps from '../src/transformProps';
import fixtures from './testData';
import { TableChartFormData, TableChartProps } from '../src/types';

const period = {
  currentTimeRange: '2026-10-01 : 2026-10-14',
  comparisonTimeRange: '2026-08-05 : 2026-08-18',
  timeColumn: 'date',
};
const formData: TableChartFormData = {
  datasource: '11__table',
  viz_type: VizType.Table,
  query_mode: QueryMode.Aggregate,
  metrics: ['sales'],
  groupby: ['shop'],
  row_limit: 10,
  show_totals: true,
  time_range: period.currentTimeRange,
  time_compare: ['1 month ago'],
  comparison_type: 'values',
  extra_form_data: { custom_form_data: { custom_period_comparison: period } },
};
function chart(
  current: DataRecord[],
  comparison: DataRecord[],
  options: Partial<TableChartFormData> = {},
): TableChartProps {
  const [result] = fixtures.basic.queriesData;
  return {
    ...fixtures.basic,
    rawFormData: { ...formData, ...options },
    queriesData: [
      {
        ...result,
        colnames: ['shop', 'sales'],
        coltypes: [GenericDataType.String, GenericDataType.Numeric],
        data: current,
      },
      {
        ...result,
        colnames: ['sales'],
        coltypes: [GenericDataType.Numeric],
        data: [{ sales: 100.25 }],
      },
      {
        ...result,
        colnames: ['shop', 'sales'],
        coltypes: [GenericDataType.String, GenericDataType.Numeric],
        data: comparison,
      },
      {
        ...result,
        colnames: ['sales'],
        coltypes: [GenericDataType.Numeric],
        data: [{ sales: 80.1 }],
      },
    ],
  };
}
test('custom periods duplicate aggregate and totals queries without offsets', () => {
  const { queries } = buildQuery(formData);
  expect(queries).toHaveLength(4);
  expect(queries.map(query => query.time_offsets)).toEqual([[], [], [], []]);
  expect(queries.map(query => query.time_range)).toEqual([
    period.currentTimeRange,
    period.currentTimeRange,
    period.comparisonTimeRange,
    period.comparisonTimeRange,
  ]);
  expect(queries[0].row_limit).toBe(11);
  expect(queries[2].row_limit).toBe(11);
  expect(queries[1].columns).toEqual([]);
  expect(queries[3].columns).toEqual([]);
});
test.each([
  [{ query_mode: QueryMode.Raw }, 'aggregate'],
  [{ server_pagination: true }, 'pagination'],
  [{ result_format: 'csv' }, 'download'],
])('custom periods reject incompatible query modes %j', (options, message) => {
  expect(() => buildQuery({ ...formData, ...options })).toThrow(message);
});
test('custom comparison preserves missing and zero values and decimal totals', () => {
  const output = transformProps(
    chart(
      [
        { shop: 'A', sales: 13.25 },
        { shop: 'Zero', sales: 0 },
      ],
      [
        { shop: 'A', sales: 10.1 },
        { shop: 'B', sales: -5 },
        { shop: 'Zero', sales: 0 },
      ],
    ),
  );
  expect(output.isUsingTimeComparison).toBe(true);
  expect(output.columns.map(column => column.key)).toEqual([
    'shop',
    'Main sales',
    '# sales',
    '△ sales',
    '% sales',
  ]);
  expect(output.data.find(row => row.shop === 'A')?.['△ sales']).toBeCloseTo(
    3.15,
  );
  expect(output.data.find(row => row.shop === 'B')).toMatchObject({
    'Main sales': null,
    '# sales': -5,
    '△ sales': null,
    '% sales': null,
  });
  expect(output.data.find(row => row.shop === 'Zero')?.['% sales']).toBeNull();
  expect(output.totals?.['Main sales']).toBe(100.25);
  expect(output.totals?.['# sales']).toBe(80.1);
  expect(output.totals?.['△ sales']).toBeCloseTo(20.15);
});
test('custom periods fail clearly when either result is truncated', () => {
  expect(() =>
    transformProps(
      chart(
        Array.from({ length: 11 }, (_, i) => ({ shop: String(i), sales: i })),
        [],
      ),
    ),
  ).toThrow('row limit');
});
test('custom date dimensions align by period position and stay strings', () => {
  const props = chart(
    [{ date: '2026-10-01', sales: 13 }],
    [{ date: '2026-08-05', sales: 10 }],
    {
      groupby: ['date'],
      time_grain_sqla: 'P1D',
      temporal_columns_lookup: { date: true },
    },
  );
  [0, 2].forEach(i => {
    props.queriesData[i].colnames = ['date', 'sales'];
    props.queriesData[i].coltypes = [
      GenericDataType.Temporal,
      GenericDataType.Numeric,
    ];
  });
  const output = transformProps(props);
  expect(output.data).toHaveLength(1);
  expect(typeof output.data[0].date).toBe('string');
  expect(output.data[0].date).toContain('2026-10-01');
  expect(output.data[0].date).toContain('2026-08-05');
  expect(output.columns[0].dataType).toBe(GenericDataType.String);
});
test('percentage rate differences display percentage points while growth remains relative', () => {
  const props = chart(
    [{ shop: 'A', sales: 0.12 }],
    [{ shop: 'A', sales: 0.1 }],
  );
  props.datasource.columnFormats = { sales: '.1%' };
  const output = transformProps(props);
  const difference = output.columns.find(column => column.key === '△ sales');
  expect(difference?.formatter?.(0.02)).toContain('2.0');
  expect(difference?.formatter?.(0.02)).toContain('pp');
  expect(output.data[0]['% sales']).toBeCloseTo(0.2);
});

test('each contribution denominator and aggregate totals use its own period', () => {
  const props = chart(
    [{ shop: 'A', sales: 20, '%sales': 1 }],
    [{ shop: 'A', sales: 10, '%sales': 1 }],
    {
      metrics: [],
      percent_metrics: ['sales'],
      percent_metric_calculation: 'all_records',
    },
  );
  const [result] = fixtures.basic.queriesData;
  props.queriesData = [
    props.queriesData[0],
    { ...result, data: [{ sales: 100 }] },
    props.queriesData[1],
    props.queriesData[2],
    { ...result, data: [{ sales: 200 }] },
    props.queriesData[3],
  ];
  props.queriesData[0].colnames.push('%sales');
  props.queriesData[0].coltypes.push(GenericDataType.Numeric);
  props.queriesData[3].colnames.push('%sales');
  props.queriesData[3].coltypes.push(GenericDataType.Numeric);
  const output = transformProps(props);
  expect(output.data[0]['Main %sales']).toBe(0.2);
  expect(output.data[0]['# %sales']).toBe(0.05);
  expect(output.data[0]['△ %sales']).toBeCloseTo(0.15);
  expect(output.totals?.['Main %sales']).toBe(1);
  expect(output.totals?.['# %sales']).toBe(1);
});

test('custom growth formatter remains a percentage when currency columns use decimal formats', () => {
  const props = chart(
    [{ shop: 'A', sales: 120 }],
    [{ shop: 'A', sales: 100 }],
    { column_config: { sales: { d3NumberFormat: '.2f' } } },
  );
  const output = transformProps(props);
  const growth = output.columns.find(column => column.key === '% sales');
  expect(growth?.formatter?.(0.2)).toContain('%');
});

test('custom period comparison rejects nonnumeric metrics rather than showing one side', () => {
  expect(() =>
    transformProps(
      chart([{ shop: 'A', sales: 'text' }], [{ shop: 'A', sales: 'other' }]),
    ),
  ).toThrow('numeric metrics');
});

test.each<Partial<TableChartFormData>>([
  { row_offset: 5 },
  { series_limit: 3 },
  { limit: 2 },
])(
  'custom periods reject independently truncated query options %j',
  options => {
    expect(() => buildQuery({ ...formData, ...options })).toThrow(
      'row offsets or series limits',
    );
  },
);

test('custom periods accept explicit zero offsets and series limits', () => {
  expect(
    buildQuery({ ...formData, row_offset: 0, series_limit: 0, limit: 0 })
      .queries,
  ).toHaveLength(4);
});

test('original comparison retains configured offsets and series limits', () => {
  const { queries } = buildQuery({
    ...formData,
    extra_form_data: {},
    row_offset: 5,
    series_limit: 3,
  });
  expect(queries[0].row_offset).toBe(5);
  expect(queries[0].series_limit).toBe(3);
});
