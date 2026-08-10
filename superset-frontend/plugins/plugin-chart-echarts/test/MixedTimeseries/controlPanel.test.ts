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
import controlPanel from '../../src/MixedTimeseries/controlPanel';

jest.mock('@superset-ui/chart-controls', () => {
  const actual = jest.requireActual('@superset-ui/chart-controls');
  return {
    ...actual,
    getStandardizedControls: jest.fn(() => ({
      controls: { columns: [], metrics: [] },
      popAllColumns: jest.fn(() => []),
      popAllMetrics: jest.fn(() => []),
    })),
  };
});

const getControl = (controlName: string) => {
  for (const section of controlPanel.controlPanelSections) {
    for (const row of section.controlSetRows ?? []) {
      for (const control of row) {
        if (
          typeof control === 'object' &&
          control !== null &&
          'name' in control &&
          control.name === controlName
        ) {
          return control;
        }
      }
    }
  }
  return null;
};

test('provides an automatic secondary y-axis bounds control', () => {
  expect(getControl('truncateYAxisSecondary')).toMatchObject({
    name: 'truncateYAxisSecondary',
    config: {
      type: 'CheckboxControl',
      default: false,
      renderTrigger: true,
    },
  });
});
