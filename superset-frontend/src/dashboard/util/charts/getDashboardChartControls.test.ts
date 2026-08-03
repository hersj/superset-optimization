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
  getDashboardChartExtraControls,
  DashboardChartControls,
} from './getDashboardChartControls';

describe('getDashboardChartExtraControls', () => {
  const controls: DashboardChartControls = {
    timeCompareEnabled: false,
    showValueEnabled: false,
  };

  test('disables time comparison and numeric labels for mixed timeseries', () => {
    expect(
      getDashboardChartExtraControls(controls, {
        viz_type: 'mixed_timeseries',
        time_compare: ['1 week ago'],
        time_compare_b: ['1 year ago'],
        show_value: true,
        show_valueB: true,
      }),
    ).toEqual({
      time_compare: [],
      time_compare_b: [],
      show_value: false,
      show_valueB: false,
    });
  });

  test('keeps the chart time comparison when the dashboard switch is on', () => {
    expect(
      getDashboardChartExtraControls(
        { timeCompareEnabled: true, showValueEnabled: true },
        { viz_type: 'line', time_compare: ['1 year ago'] },
      ),
    ).toEqual({ show_value: true });
  });
});
