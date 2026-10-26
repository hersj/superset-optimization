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
import { SupersetClient } from '@superset-ui/core';
import {
  clearPendingChartSort,
  readPendingChartSorts,
  writePendingChartSort,
  saveQueuedChartSort,
} from './chartSorts';
const sort = {
  mode: 'metric' as const,
  field: 'sales',
  direction: 'desc' as const,
};
afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});
test('private scopes and acknowledgements preserve a newer pending choice', () => {
  writePendingChartSort(1, 2, 3, sort);
  writePendingChartSort(1, 2, 3, { ...sort, direction: 'asc' });
  clearPendingChartSort(1, 2, 3, sort);
  expect(readPendingChartSorts(1, 2)['3']?.direction).toBe('asc');
  expect(readPendingChartSorts(2, 2)).toEqual({});
  expect(readPendingChartSorts(1, 3)).toEqual({});
  clearPendingChartSort(1, 2, 3, { ...sort, direction: 'asc' });
  expect(readPendingChartSorts(1, 2)).toEqual({});
});
test('serializes writes without an older acknowledgement clearing a newer selection', async () => {
  let acknowledge: (() => void) | undefined;
  const put = jest
    .spyOn(SupersetClient, 'put')
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          acknowledge = () => resolve({} as never);
        }),
    )
    .mockResolvedValue({} as never);
  writePendingChartSort(10, 20, 30, sort);
  const first = saveQueuedChartSort(10, 20, 30, sort);
  await Promise.resolve();
  await Promise.resolve();
  writePendingChartSort(10, 20, 30, null);
  const second = saveQueuedChartSort(10, 20, 30, null);
  acknowledge!();
  await first;
  await second;
  expect(put.mock.calls.map(([payload]) => payload.jsonPayload)).toEqual([
    { chart_id: 30, sort },
    { chart_id: 30, sort: null },
  ]);
  expect(readPendingChartSorts(10, 20)).toEqual({});
});
test('failed saves retain the pending choice for a refresh retry', async () => {
  jest.spyOn(SupersetClient, 'put').mockRejectedValue(new Error('offline'));
  writePendingChartSort(11, 20, 30, sort);
  await expect(saveQueuedChartSort(11, 20, 30, sort)).rejects.toThrow(
    'offline',
  );
  expect(readPendingChartSorts(11, 20)['30']).toEqual(sort);
});
