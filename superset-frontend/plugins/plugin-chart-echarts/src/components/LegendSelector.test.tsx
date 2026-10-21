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
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from 'spec/helpers/testing-library';
import type { LegendState } from '@superset-ui/core';
import type { EChartsType } from 'echarts/core';
import LegendSelector from './LegendSelector';
import {
  buildLegendGroupMetadata,
  getLegendStateChange,
  resolveLegendState,
} from '../utils/series';

jest.mock(
  'react-error-boundary',
  () => ({
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
    withErrorBoundary: (component: unknown) => component,
  }),
  { virtual: true },
);
jest.mock('react-js-cron', () => ({ __esModule: true, default: () => null }), {
  virtual: true,
});

const names = Array.from({ length: 160 }, (_, i) => `费用指标${i}`);
const groups = buildLegendGroupMetadata(
  names.map(name => ({ name, currentLabel: name })),
);
const changed = jest.fn();
const dispatchAction = jest.fn();
const echartRef = {
  current: {
    getEchartInstance: () => ({ dispatchAction }) as unknown as EChartsType,
  },
};
function Harness() {
  const [selected, setSelected] = useState<LegendState>({});
  return (
    <LegendSelector
      options={{
        legend: { data: names, selected: resolveLegendState(selected, groups) },
      }}
      groups={groups}
      echartRef={echartRef}
      onChange={payload => {
        const next = getLegendStateChange(payload.selected, groups);
        changed(next);
        setSelected(next);
      }}
    />
  );
}
beforeEach(() => {
  changed.mockClear();
  dispatchAction.mockClear();
});
async function openPanel() {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: '指标选择（160/160）' }));
  return screen.findByLabelText('指标选择面板');
}
test('searches every legend page, toggles immediately and isolates the full chart', async () => {
  const panel = await openPanel();
  fireEvent.change(within(panel).getByRole('textbox'), {
    target: { value: '费用指标159' },
  });
  expect(within(panel).getAllByRole('checkbox')).toHaveLength(1);
  fireEvent.click(within(panel).getByRole('checkbox', { name: '费用指标159' }));
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      'current:费用指标159': false,
      'current:费用指标0': true,
    }),
  );
  fireEvent.click(
    within(panel).getByRole('button', { name: '仅看此项：费用指标159' }),
  );
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      'current:费用指标159': true,
      'current:费用指标0': false,
    }),
  );
  expect(
    screen.getByRole('button', { name: '指标选择（1/160）' }),
  ).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: '反选全部' }));
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      'current:费用指标159': false,
      'current:费用指标0': true,
    }),
  );
  expect(
    screen.getByRole('button', { name: '指标选择（159/160）' }),
  ).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: '显示全部' }));
  expect(Object.values(changed.mock.calls.at(-1)![0]).every(Boolean)).toBe(
    true,
  );
  fireEvent.change(within(panel).getByRole('textbox'), {
    target: { value: '不存在' },
  });
  expect(within(panel).getByRole('status')).toHaveTextContent('没有匹配的指标');
});
test('hover only highlights and closing restores emphasis without changing selection', async () => {
  const panel = await openPanel();
  fireEvent.change(within(panel).getByRole('textbox'), {
    target: { value: '费用指标0' },
  });
  const row = within(panel)
    .getByRole('checkbox', { name: '费用指标0' })
    .closest('.legend-row')!;
  fireEvent.mouseEnter(row);
  expect(dispatchAction).toHaveBeenLastCalledWith({
    type: 'highlight',
    batch: [{ seriesName: '费用指标0' }],
  });
  fireEvent.mouseLeave(row);
  expect(dispatchAction).toHaveBeenLastCalledWith({
    type: 'downplay',
    batch: [{ seriesName: '费用指标0' }],
  });
  fireEvent.click(screen.getByRole('button', { name: '指标选择（160/160）' }));
  await waitFor(() =>
    expect(dispatchAction).toHaveBeenLastCalledWith({ type: 'downplay' }),
  );
  expect(changed).not.toHaveBeenCalled();
});
test('duplicate labels remain independently addressable', async () => {
  render(
    <LegendSelector
      options={{
        legend: {
          data: ['Query A:费用', 'Query B:费用'],
          selected: { 'Query A:费用': true, 'Query B:费用': false },
        },
      }}
      groups={{
        groups: {},
        labels: { 'Query A:费用': '费用', 'Query B:费用': '费用' },
        kinds: {},
        parents: {},
        stateKeys: {},
      }}
      onChange={changed}
      echartRef={echartRef}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '指标选择（1/2）' }));
  expect(
    await screen.findByRole('checkbox', { name: '费用（Query A:费用）' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: '费用（Query B:费用）' }),
  ).not.toBeChecked();
});
