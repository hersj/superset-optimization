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
import { logging } from '@apache-superset/core/utils';
import { getLastFilterValue, saveLastFilterValue } from './keyValue';

describe('last dashboard filter state helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads the current user last filter state for a dashboard', async () => {
    const getSpy = jest.spyOn(SupersetClient, 'get').mockResolvedValue({
      json: {
        value: '{"NATIVE_FILTER-1":{"filterState":{"value":["shop-a"]}}}',
      },
    } as any);

    await expect(getLastFilterValue(51)).resolves.toEqual({
      'NATIVE_FILTER-1': { filterState: { value: ['shop-a'] } },
    });
    expect(getSpy).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/51/last_filter_state',
    });
  });

  it('returns null without logging when no last filter state exists', async () => {
    jest.spyOn(SupersetClient, 'get').mockRejectedValue({ status: 404 });
    const loggingSpy = jest.spyOn(logging, 'error');

    await expect(getLastFilterValue(51)).resolves.toBeNull();
    expect(loggingSpy).not.toHaveBeenCalled();
  });

  it('saves the current user last filter state for a dashboard', async () => {
    const putSpy = jest.spyOn(SupersetClient, 'put').mockResolvedValue({
      json: { message: 'Saved successfully' },
    } as any);

    await expect(saveLastFilterValue(51, '{"foo":"bar"}')).resolves.toBe(
      'Saved successfully',
    );
    expect(putSpy).toHaveBeenCalledWith({
      endpoint: '/api/v1/dashboard/51/last_filter_state',
      jsonPayload: { value: '{"foo":"bar"}' },
    });
  });
});
