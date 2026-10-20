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
import { render, screen, userEvent } from 'spec/helpers/testing-library';
import ChartRowLimitControl from './ChartRowLimitControl';

test('limits choices to the configured maximum and offers restoring the chart default', async () => {
  const onChange = jest.fn();
  render(<ChartRowLimitControl defaultValue={10000} onChange={onChange} />, {
    useRedux: true,
    initialState: {
      dashboardInfo: { common: { conf: { SQL_MAX_ROW: 500 } } },
    },
  });
  await userEvent.click(screen.getByRole('combobox'));
  expect(
    screen.getAllByRole('option').map(option => option.textContent),
  ).toEqual([
    '行限制：默认 (10000)',
    '行限制：10',
    '行限制：50',
    '行限制：100',
    '行限制：250',
    '行限制：500',
  ]);
  expect(screen.queryByText('行限制：1000')).not.toBeInTheDocument();
  await userEvent.click(screen.getByText('行限制：100'));
  expect(onChange).toHaveBeenLastCalledWith(100);
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(screen.getByText('行限制：默认 (10000)'));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test('disables changes until preferences have loaded or while saving', () => {
  render(
    <ChartRowLimitControl defaultValue={10000} disabled onChange={jest.fn()} />,
    {
      useRedux: true,
      initialState: { dashboardInfo: { common: { conf: {} } } },
    },
  );
  expect(screen.getByRole('combobox')).toBeDisabled();
});
