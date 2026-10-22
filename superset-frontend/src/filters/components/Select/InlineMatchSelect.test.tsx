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
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from 'spec/helpers/testing-library';
import InlineMatchSelect from './InlineMatchSelect';
import type { SelectValue } from './types';

const options = [
  { label: '华南-US', value: '华南-US' },
  { label: '华南-CA', value: '华南-CA' },
  { label: '华南-UK', value: '华南-UK' },
  { label: '北美-US', value: '北美-US' },
];
const changed = jest.fn();
const searched = jest.fn();
function Harness({
  loading = false,
  multiple = true,
}: {
  loading?: boolean;
  multiple?: boolean;
}) {
  const [value, setValue] = useState<SelectValue>(['北美-US']);
  const [keyword, setKeyword] = useState('华南');
  const [mode, setMode] = useState<'contains' | 'exact'>('contains');
  return (
    <InlineMatchSelect
      column="shop"
      mode={mode}
      keyword={keyword}
      value={value}
      options={options}
      multiple={multiple}
      loading={loading}
      disabled={false}
      onModeChange={setMode}
      onKeywordChange={(value, committed) => {
        setKeyword(value);
        searched(value, committed);
      }}
      onChange={value => {
        changed(value);
        setValue(value);
      }}
      onActiveChange={jest.fn()}
    />
  );
}
beforeEach(() => {
  changed.mockClear();
  searched.mockClear();
});
async function open(props = {}) {
  const view = render(<Harness {...props} />);
  fireEvent.focus(screen.getByRole('textbox', { name: '搜索选项：shop' }));
  return { view, panel: await screen.findByLabelText('匹配选项：shop') };
}

test('checkboxes and both bulk actions only change current matching values', async () => {
  const { panel } = await open();
  expect(within(panel).getAllByRole('checkbox')).toHaveLength(3);
  fireEvent.click(within(panel).getByRole('checkbox', { name: '华南-US' }));
  expect(changed).toHaveBeenLastCalledWith(['北美-US', '华南-US']);
  fireEvent.click(within(panel).getByRole('button', { name: '全选当前结果' }));
  expect(changed).toHaveBeenLastCalledWith([
    '北美-US',
    '华南-US',
    '华南-CA',
    '华南-UK',
  ]);
  fireEvent.click(within(panel).getByRole('button', { name: '取消全选' }));
  expect(changed).toHaveBeenLastCalledWith(['北美-US']);
  expect(
    within(panel).getByRole('button', { name: '取消全选' }),
  ).toBeDisabled();
  expect(screen.getByText('北美-US')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '北美' } });
  expect(
    within(panel).getByRole('checkbox', { name: '北美-US' }),
  ).toBeChecked();
  fireEvent.click(within(panel).getByRole('button', { name: '取消全选' }));
  expect(changed).toHaveBeenLastCalledWith(null);
});

test('composition never emits committed pinyin and stale options cannot be selected', async () => {
  const { panel, view } = await open();
  const input = screen.getByRole('textbox');
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'huanan' } });
  expect(searched).toHaveBeenLastCalledWith('huanan', false);
  expect(
    within(panel).getByRole('button', { name: '全选当前结果' }),
  ).toBeDisabled();
  fireEvent.change(input, { target: { value: '华南' } });
  fireEvent.compositionEnd(input, { data: '华南' });
  expect(searched).toHaveBeenLastCalledWith('华南', true);
  view.rerender(<Harness loading />);
  expect(within(panel).getByRole('status')).toHaveTextContent('正在加载');
  expect(
    within(panel).getByRole('button', { name: '全选当前结果' }),
  ).toBeDisabled();
  expect(within(panel).queryByRole('checkbox')).not.toBeInTheDocument();
});

test('mode menu stays inside the field and preserves selections', async () => {
  const { panel } = await open();
  fireEvent.click(screen.getByRole('button', { name: '匹配方式：shop' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '精确' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '匹配方式：shop' }),
    ).toHaveTextContent('精确'),
  );
  expect(changed).not.toHaveBeenCalled();
  expect(within(panel).getAllByRole('checkbox')).toHaveLength(3);
});

test('single-selection filters do not offer batch selection and close on choose', async () => {
  const { panel } = await open({ multiple: false });
  expect(
    within(panel).queryByRole('button', { name: '全选当前结果' }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('checkbox', { name: '华南-US' }));
  expect(changed).toHaveBeenLastCalledWith(['华南-US']);
});

test('bulk selection supports null and zero values without string coercion', async () => {
  render(
    <InlineMatchSelect
      column="test"
      mode="contains"
      keyword=""
      value={[]}
      options={[
        { value: 0, label: '零' },
        { value: null, label: '空值' },
      ]}
      multiple
      loading={false}
      disabled={false}
      onChange={changed}
      onKeywordChange={searched}
      onModeChange={jest.fn()}
      onActiveChange={jest.fn()}
    />,
  );
  fireEvent.focus(screen.getByRole('textbox'));
  fireEvent.click(await screen.findByRole('button', { name: '全选当前结果' }));
  expect(changed).toHaveBeenLastCalledWith([0, null]);
});
