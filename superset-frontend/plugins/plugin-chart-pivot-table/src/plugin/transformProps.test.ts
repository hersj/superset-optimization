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
import { GenericDataType } from '@apache-superset/core/common';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

test('formats date-only row dimensions with a Chinese weekday', () => {
  const transformed = transformProps({
    width: 400,
    height: 300,
    formData: {
      dateFormat: '%Y-%m-%d（%a）',
      groupbyRows: ['配送日期'],
      groupbyColumns: [],
      metrics: [],
    },
    rawFormData: {},
    queriesData: [
      {
        data: [{ 配送日期: '2026-08-02' }],
        colnames: ['配送日期'],
        coltypes: [GenericDataType.Temporal],
      },
    ],
    hooks: {},
    filterState: {},
    datasource: {},
  } as any) as any;

  expect(transformed.dateFormatters.配送日期('2026-08-02')).toBe(
    '2026-08-02（周日）',
  );
});

test('offers the Chinese weekday date format', () => {
  const config = controlPanel as any;
  const dateFormatControl =
    config.controlPanelSections[2].controlSetRows[2][0].config;

  expect(dateFormatControl.choices).toContainEqual([
    '%Y-%m-%d（%a）',
    'YYYY-MM-DD（周几）',
  ]);
});
