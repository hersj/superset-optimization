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
  userEvent,
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
  allowFuzzyMatch = true,
}: {
  loading?: boolean;
  multiple?: boolean;
  allowFuzzyMatch?: boolean;
}) {
  const [value, setValue] = useState<SelectValue>(['北美-US']);
  const [keyword, setKeyword] = useState('华南');
  const [mode, setMode] = useState<'contains' | 'exact'>('contains');
  return (
    <InlineMatchSelect
      column="shop"
      mode={mode}
      allowFuzzyMatch={allowFuzzyMatch}
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
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '搜索选项：shop' }));
  return { view, panel: await screen.findByLabelText('匹配选项：shop') };
}

test('one pointer click opens names and outside click closes them', async () => {
  render(<Harness />);
  const input = screen.getByRole('combobox', { name: '搜索选项：shop' });
  await userEvent.click(input);
  await waitFor(() =>
    expect(screen.getByText('华南-US', { exact: true })).toBeVisible(),
  );
  await userEvent.click(document.body);
  await waitFor(() =>
    expect(
      screen.queryByRole('checkbox', { name: '华南-US' }),
    ).not.toBeInTheDocument(),
  );
});

test('keyboard opens the native field and Escape closes the options', async () => {
  render(<Harness />);
  const field = screen.getByRole('combobox', { name: '搜索选项：shop' });
  fireEvent.keyDown(field, { key: 'ArrowDown', keyCode: 40 });
  expect(
    await screen.findByRole('checkbox', { name: '华南-US' }),
  ).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  await waitFor(() => expect(field).toHaveAttribute('aria-expanded', 'false'));
});

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
  expect(changed).toHaveBeenLastCalledWith(['北美-US']);
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

test('one click switches the current exact or fuzzy label without a menu', async () => {
  const { panel } = await open();
  const mode = screen.getByRole('button', { name: '匹配方式：shop' });
  expect(mode).toHaveTextContent('模糊');
  expect(mode).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(mode);
  expect(mode).toHaveAttribute('aria-pressed', 'false');
  expect(mode).toHaveTextContent('精确');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  fireEvent.click(mode);
  expect(mode).toHaveAttribute('aria-pressed', 'true');
  expect(mode).toHaveTextContent('模糊');
  expect(changed).not.toHaveBeenCalled();
  for (const button of [
    screen.getByRole('button', { name: '匹配方式：shop' }),
    within(panel).getByRole('button', { name: '全选当前结果' }),
    within(panel).getByRole('button', { name: '取消全选' }),
  ])
    expect(button).toHaveClass('superset-button-link');
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

test('disabling contains mode keeps the same checkboxes and bulk actions', async () => {
  const { panel } = await open({ allowFuzzyMatch: false });
  expect(screen.queryByLabelText('匹配方式：shop')).not.toBeInTheDocument();
  expect(screen.queryByText('精确')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '匹配方式：shop' }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button', { name: '全选当前结果' }));
  expect(changed).toHaveBeenLastCalledWith([
    '北美-US',
    '华南-US',
    '华南-CA',
    '华南-UK',
  ]);
  fireEvent.click(within(panel).getByRole('button', { name: '取消全选' }));
  expect(changed).toHaveBeenLastCalledWith(['北美-US']);
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
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('button', { name: '全选当前结果' }));
  expect(changed).toHaveBeenLastCalledWith([0, null]);
});

test('selected names remain inside the field and clear resets both keyword and selection', async () => {
  const clear = jest.fn();
  const { container } = render(
    <InlineMatchSelect
      column="shop"
      mode="exact"
      keyword="华南"
      value={['北美-US', '华南-US']}
      options={options}
      multiple
      loading={false}
      disabled={false}
      onChange={changed}
      onClear={clear}
      onKeywordChange={searched}
      onModeChange={jest.fn()}
      onActiveChange={jest.fn()}
    />,
  );
  expect(
    container.querySelector('.ant-select-selection-overflow'),
  ).toBeInTheDocument();
  expect(container.querySelector('.match-summary')).not.toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('清空选择：shop'));
  expect(clear).toHaveBeenCalledTimes(1);
  expect(searched).not.toHaveBeenCalled();
  await waitFor(() => expect(changed).not.toHaveBeenCalled());
});
