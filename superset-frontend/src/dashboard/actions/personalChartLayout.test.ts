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
  getDashboardChartTemplates,
  isNotFoundError,
  putDashboardChartTemplate,
  setDashboardChartTemplateDefault,
} from './personalChartLayout';

test('recognizes SupersetClient not-found errors', () => {
  expect(isNotFoundError({ status: 404 })).toBe(true);
  expect(isNotFoundError({ response: { status: 404 } })).toBe(true);
  expect(isNotFoundError({ status: 500 })).toBe(false);
});

test('uses the scoped template endpoints for get, save, and default', async () => {
  const layout = {
    ordered_metric_ids: ['sales'],
    hidden_metric_ids: [],
    version: 1,
  };
  const template = {
    slot: 2,
    name: 'Finance',
    is_default: false,
    layout,
  };
  const getSpy = jest
    .spyOn(SupersetClient, 'get')
    .mockResolvedValue({ json: { result: { '611': [template] } } } as never);
  const putSpy = jest
    .spyOn(SupersetClient, 'put')
    .mockResolvedValue({ json: { result: template } } as never);
  const postSpy = jest.spyOn(SupersetClient, 'post').mockResolvedValue({
    json: { result: { ...template, is_default: true } },
  } as never);

  await expect(getDashboardChartTemplates(88)).resolves.toEqual({
    '611': [template],
  });
  await expect(
    putDashboardChartTemplate(88, 611, 2, 'Finance', layout),
  ).resolves.toEqual(template);
  await expect(setDashboardChartTemplateDefault(88, 611, 2)).resolves.toEqual({
    ...template,
    is_default: true,
  });

  expect(getSpy).toHaveBeenCalledWith({
    endpoint: '/api/v1/dashboard/88/chart_templates',
  });
  expect(putSpy).toHaveBeenCalledWith({
    endpoint: '/api/v1/dashboard/88/chart_templates/611/2',
    jsonPayload: { name: 'Finance', layout },
  });
  expect(postSpy).toHaveBeenCalledWith({
    endpoint: '/api/v1/dashboard/88/chart_templates/611/2/default',
  });
});
