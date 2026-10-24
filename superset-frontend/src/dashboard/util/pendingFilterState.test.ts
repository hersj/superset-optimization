/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  writePendingFilterState,
  readPendingFilterState,
  clearPendingFilterState,
  createFilterStateSaveQueue,
} from './pendingFilterState';

beforeEach(() => localStorage.clear());

test('remembers a cleared keyword before the server debounce finishes', () => {
  const mask = { filter: { filterState: { value: null, searchValue: '' } } };
  writePendingFilterState(1, 87, 'key', JSON.stringify(mask));
  expect(readPendingFilterState(1, 87, 'key')).toEqual(mask);
  expect(readPendingFilterState(2, 87, 'key')).toBeUndefined();
  expect(readPendingFilterState(1, 54, 'key')).toBeUndefined();
  expect(readPendingFilterState(1, 87, 'shared-link')).toBeUndefined();
});

test('an older save cannot discard a newer pending choice', () => {
  writePendingFilterState(1, 87, null, '{"selected":{}}');
  clearPendingFilterState(1, 87, '{}');
  expect(readPendingFilterState(1, 87, null)).toEqual({ selected: {} });
  clearPendingFilterState(1, 87, '{"selected":{}}');
  expect(readPendingFilterState(1, 87, null)).toBeUndefined();
});

test.each(['null', '[]', '"invalid"', '{broken'])(
  'ignores invalid mask %s',
  value => {
    writePendingFilterState(1, 87, null, value);
    expect(readPendingFilterState(1, 87, null)).toBeUndefined();
  },
);

test('storage restrictions do not interrupt filtering', () => {
  const failed = jest
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('blocked');
    });
  expect(() => writePendingFilterState(1, 87, null, '{}')).not.toThrow();
  failed.mockRestore();
});

test('slow saves cannot overwrite a newer choice and intermediate choices are coalesced', async () => {
  let finishFirst: () => void = () => {};
  const first = new Promise<void>(resolve => {
    finishFirst = resolve;
  });
  const saved: string[] = [];
  const save = jest.fn(async (value: string) => {
    if (value === 'A') await first;
    saved.push(value);
  });
  const enqueue = createFilterStateSaveQueue(save);
  const done = enqueue('A');
  await Promise.resolve();
  enqueue('B');
  enqueue('C');
  expect(save).toHaveBeenCalledTimes(1);
  finishFirst();
  await done;
  expect(saved).toEqual(['A', 'C']);
});

test('a failed save does not block a later save', async () => {
  const save = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  const enqueue = createFilterStateSaveQueue(save);
  await expect(enqueue('A')).rejects.toThrow('offline');
  await enqueue('B');
  expect(save.mock.calls.map(([value]) => value)).toEqual(['A', 'B']);
});
