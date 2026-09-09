/* eslint-disable camelcase */
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
 * specific language governing permissions and limitationsxw
 * under the License.
 */
import { PostProcessingResample } from '@superset-ui/core';
import { PostProcessingFactory } from './types';

/* eslint-disable @typescript-eslint/no-unused-vars */
export const resampleOperator: PostProcessingFactory<PostProcessingResample> = (
  formData,
  queryObject,
) => {
  // 点选模式不能通过补齐日期生成未选择的空档；保持查询实际返回的周期。
  if (
    queryObject.filters?.some(
      filter => filter.op === 'TEMPORAL_RANGE' && Array.isArray(filter.val),
    )
  ) {
    return undefined;
  }
  const resampleZeroFill = formData.resample_method === 'zerofill';
  const resampleMethod = resampleZeroFill ? 'asfreq' : formData.resample_method;
  const resampleRule = formData.resample_rule;
  if (resampleMethod && resampleRule) {
    return {
      operation: 'resample',
      options: {
        method: resampleMethod,
        rule: resampleRule,
        fill_value: resampleZeroFill ? 0 : null,
      },
    };
  }
  return undefined;
};
