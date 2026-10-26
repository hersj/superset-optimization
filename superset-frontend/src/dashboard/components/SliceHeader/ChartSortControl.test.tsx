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
import { useState } from 'react';
import { type PersonalChartSort } from '@superset-ui/core';
import {
  render,
  screen,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import ChartSortControl, { getSortCategoryValues } from './ChartSortControl';
const formData = {
  datasource: '1__table',
  viz_type: 'echarts_timeseries_bar',
  x_axis: 'sku',
  metrics: ['sales'],
};
test('changes order immediately and restores the chart default', async () => {
  const onChange = jest.fn();
  render(
    <ChartSortControl
      value={{ mode: 'metric', field: 'sales', direction: 'desc' }}
      formData={formData}
      data={[
        { sku: 'SKU-a', sales: 2 },
        { sku: 'SKU-b', sales: 1 },
      ]}
      onChange={onChange}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: '排序：sales' }));
  await userEvent.click(screen.getByText('↑ 升序'));
  expect(onChange).toHaveBeenLastCalledWith({
    mode: 'metric',
    field: 'sales',
    direction: 'asc',
  });
  await userEvent.click(screen.getByText('自定义'));
  expect(onChange).toHaveBeenLastCalledWith({
    mode: 'custom',
    field: 'sku',
    direction: 'desc',
    customOrder: ['SKU-a', 'SKU-b'],
  });
  await userEvent.click(screen.getByText('恢复默认'));
  expect(onChange).toHaveBeenLastCalledWith(null);
});
test('uses full original names without conflating visually similar SKUs', () => {
  expect(
    getSortCategoryValues(
      [
        { sku: '长名称-01-A' },
        { sku: '长名称-01-B' },
        { sku: '长名称-01-A' },
        { sku: null },
      ],
      'sku',
    ),
  ).toEqual(['长名称-01-A', '长名称-01-B']);
});
test('does not display sorting for number cards', () => {
  render(
    <ChartSortControl
      formData={{ ...formData, viz_type: 'big_number_total' }}
      onChange={jest.fn()}
    />,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('controlled custom mode renders real drag handles and reorders immediately', async () => {
  const Controlled = () => {
    const [value, setValue] = useState<PersonalChartSort | null>(null);
    return (
      <ChartSortControl
        value={value}
        formData={formData}
        data={[
          { sku: 'SKU-a', sales: 2 },
          { sku: 'SKU-b', sales: 1 },
        ]}
        onChange={setValue}
      />
    );
  };
  render(<Controlled />);
  await userEvent.click(screen.getByRole('button', { name: '排序：默认' }));
  await userEvent.click(screen.getByText('自定义', { exact: true }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '拖动 SKU-a' })).toBeVisible(),
  );
  await userEvent.click(screen.getByRole('button', { name: '上移 SKU-b' }));
  expect(screen.getByRole('button', { name: '上移 SKU-b' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '下移 SKU-a' })).toBeDisabled();
});
