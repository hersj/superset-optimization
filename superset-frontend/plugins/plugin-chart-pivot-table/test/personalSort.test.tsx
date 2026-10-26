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
import { fireEvent, render, waitFor } from 'spec/helpers/testing-library';
import type { PersonalChartSort } from '@superset-ui/core';
import PivotTableChart from '../src/PivotTableChart';
import { MetricsLayoutEnum, type PivotTableProps } from '../src/types';

const metricSort: PersonalChartSort = {
  mode: 'metric',
  field: 'sales',
  direction: 'desc',
};
const props = {
  data: [
    { shop: 'A', sales: 20, sales__custom_period: 500 },
    { shop: 'B', sales: 180, sales__custom_period: 10 },
  ],
  groupbyRows: ['shop'],
  groupbyColumns: [],
  metrics: ['sales'],
  height: 600,
  width: 800,
  tableRenderer: 'Table With Subtotal',
  aggregateFunction: 'Sum',
  colOrder: 'key_a_to_z',
  rowOrder: 'key_a_to_z',
  transposePivot: false,
  combineMetric: true,
  metricsLayout: MetricsLayoutEnum.COLUMNS,
  rowSubtotalPosition: false,
  colSubtotalPosition: false,
  colTotals: true,
  rowTotals: true,
  colSubTotals: false,
  rowSubTotals: false,
  valueFormat: '.0f',
  columnFormats: {},
  currencyFormats: {},
  verboseMap: {},
  metricAggregateFunctions: {},
  metricColorFormatters: [],
  dateFormatters: {},
  setDataMask: jest.fn(),
  customPeriodComparison: true,
  personalSort: metricSort,
  freezeMetricIds: { sales: 'sales' },
} as unknown as PivotTableProps;

const rowLabels = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody .pvtRowLabel')].map(
    cell => cell.textContent,
  );

test('pivot uses current metric values and reapplies the same preference to refreshed data', () => {
  const { container, rerender } = render(<PivotTableChart {...props} />);
  expect(rowLabels(container)).toEqual(['B', 'A']);
  rerender(
    <PivotTableChart
      {...props}
      data={[
        { shop: 'A', sales: 300, sales__custom_period: 5 },
        { shop: 'B', sales: 10, sales__custom_period: 999 },
      ]}
    />,
  );
  expect(rowLabels(container)).toEqual(['A', 'B']);
  expect(container.querySelector('.pvtRowTotals')).not.toBeNull();
});

test('pivot sorts negative and missing current metrics without treating null as zero', () => {
  const { container } = render(
    <PivotTableChart
      {...props}
      data={[
        { shop: 'A', sales: null },
        { shop: 'B', sales: -5 },
        { shop: 'C', sales: 10 },
      ]}
    />,
  );
  expect(rowLabels(container)).toEqual(['C', 'B', 'A']);
});

test('pivot honors a stable raw dimension order independently of short labels', () => {
  const { container, rerender } = render(
    <PivotTableChart
      {...props}
      personalSort={{
        mode: 'name',
        field: 'shop',
        direction: 'desc',
      }}
    />,
  );
  expect(rowLabels(container)).toEqual(['B', 'A']);
  rerender(
    <PivotTableChart
      {...props}
      personalSort={{
        mode: 'custom',
        field: 'shop',
        direction: 'asc',
        customOrder: ['B', 'A'],
      }}
      dimensionLabelOverrides={{ shop: '店铺' }}
    />,
  );
  expect(rowLabels(container)).toEqual(['B', 'A']);
});

test('pivot metric sorting distinguishes a specific original column from all-column totals', () => {
  const configured = {
    ...props,
    groupbyColumns: ['country'],
    data: [
      { shop: 'A', country: 'US', sales: 10 },
      { shop: 'A', country: 'DE', sales: 200 },
      { shop: 'B', country: 'US', sales: 50 },
      { shop: 'B', country: 'DE', sales: 1 },
    ],
  };
  const { container, rerender } = render(
    <PivotTableChart {...configured} />,
  );
  expect(rowLabels(container)).toEqual(['A', 'B']);
  rerender(
    <PivotTableChart
      {...configured}
      personalSort={{ ...metricSort, columnValues: ['US'] }}
    />,
  );
  expect(rowLabels(container)).toEqual(['B', 'A']);
});

test('pivot header emits stable metric identity and raw column context', async () => {
  const setDataMask = jest.fn();
  const { container } = render(
    <PivotTableChart
      {...props}
      personalSort={null}
      ownState={{ searchText: 'keep' }}
      setDataMask={setDataMask}
    />,
  );
  const sort = container.querySelector<SVGElement>(
    'thead [role="columnheader"] svg',
  )!;
  expect(sort).not.toBeNull();
  fireEvent.click(sort);
  await waitFor(() =>
    expect(setDataMask).toHaveBeenCalledWith({
      ownState: {
        searchText: 'keep',
        personalSort: {
          mode: 'metric',
          field: 'sales',
          direction: 'asc',
          columnValues: [],
        },
      },
    }),
  );
});
