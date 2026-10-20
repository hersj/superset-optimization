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
import reducer from './dashboardState';
import { setChartRowLimit, setChartRowLimits } from '../actions/chartRowLimits';
import { ON_REFRESH, ON_REFRESH_SUCCESS } from '../actions/dashboardState';

test('preserves other charts, columns and filters when changing a limit or refreshing', () => {
  const initial = {
    personalChartLayouts: { 7: { version: 1 } },
    chartRowLimits: { 7: 50, 8: 100 },
  };
  let state = reducer(initial, setChartRowLimit(7, 250));
  state = reducer(state, { type: ON_REFRESH });
  state = reducer(state, { type: ON_REFRESH_SUCCESS });
  expect(state.chartRowLimits).toEqual({ 7: 250, 8: 100 });
  expect(state.personalChartLayouts).toBe(initial.personalChartLayouts);
  expect(reducer(state, setChartRowLimit(7, null)).chartRowLimits).toEqual({
    8: 100,
  });
  expect(reducer(state, setChartRowLimits({ 9: 10 })).chartRowLimits).toEqual({
    9: 10,
  });
});
