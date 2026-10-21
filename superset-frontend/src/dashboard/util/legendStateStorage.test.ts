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
import {
  legendStorageKey,
  readLegendState,
  writeLegendState,
} from './legendStateStorage';

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});
test('remembers false and stable logical keys across reloads and isolates user/dashboard/chart', () => {
  const key = legendStorageKey(1, 85, 812);
  const state = {
    'current:配送费': false,
    '配送费,LED5-CA': false,
    'current:佣金': true,
  };
  writeLegendState(key, state);
  expect(readLegendState(key)).toEqual(state);
  for (const other of [
    legendStorageKey(2, 85, 812),
    legendStorageKey(1, 86, 812),
    legendStorageKey(1, 85, 813),
    legendStorageKey(undefined, 85, 812),
  ])
    expect(readLegendState(other)).toBeUndefined();
});
test.each(['null', '[]', '{"metric":"false"}', '{', '123'])(
  'ignores invalid stored state %s',
  value => {
    localStorage.setItem('invalid', value);
    expect(readLegendState('invalid')).toBeUndefined();
  },
);
test('blocked or full storage does not prevent selection', () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(readLegendState('key')).toBeUndefined();
  expect(() => writeLegendState('key', { metric: false })).not.toThrow();
});
