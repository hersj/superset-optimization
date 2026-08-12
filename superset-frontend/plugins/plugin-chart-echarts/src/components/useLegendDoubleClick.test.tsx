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
import { act, render } from '@testing-library/react';
import { useLegendDoubleClick } from './useLegendDoubleClick';

const legendGroups = {
  groups: {
    毛利润: ['毛利润'],
    配送销售额: ['配送销售额'],
    毛利率: ['毛利率'],
  },
  labels: {
    毛利润: '毛利润',
    配送销售额: '配送销售额',
    毛利率: '毛利率',
  },
  kinds: {
    毛利润: 'current' as const,
    配送销售额: 'current' as const,
    毛利率: 'current' as const,
  },
  parents: {},
  stateKeys: {
    毛利润: 'current:毛利润',
    配送销售额: 'current:配送销售额',
    毛利率: 'current:毛利率',
  },
};

let handleLegendSelect: ReturnType<
  typeof useLegendDoubleClick
>['handleLegendSelect'];

function LegendHarness({
  onLegendStateChanged,
}: {
  onLegendStateChanged: jest.Mock;
}) {
  ({ handleLegendSelect } = useLegendDoubleClick(
    legendGroups,
    onLegendStateChanged,
  ));
  return null;
}

test('restores the prior multi-selection when both legend double-clicks take 400ms', () => {
  jest.useFakeTimers();
  const onLegendStateChanged = jest.fn();
  render(<LegendHarness onLegendStateChanged={onLegendStateChanged} />);

  act(() => {
    handleLegendSelect({
      name: '配送销售额',
      selected: { 毛利润: true, 配送销售额: false, 毛利率: false },
    });
    jest.advanceTimersByTime(400);
  });

  expect(onLegendStateChanged).not.toHaveBeenCalled();

  act(() => {
    handleLegendSelect({
      name: '配送销售额',
      selected: { 毛利润: true, 配送销售额: true, 毛利率: false },
    });
  });

  expect(onLegendStateChanged).toHaveBeenLastCalledWith({
    'current:毛利润': false,
    毛利润: false,
    'current:配送销售额': true,
    配送销售额: true,
    'current:毛利率': false,
    毛利率: false,
  });

  act(() => {
    handleLegendSelect({
      name: '配送销售额',
      selected: { 毛利润: false, 配送销售额: false, 毛利率: false },
    });
    jest.advanceTimersByTime(400);
  });

  expect(onLegendStateChanged).toHaveBeenCalledTimes(1);

  act(() => {
    handleLegendSelect({
      name: '配送销售额',
      selected: { 毛利润: false, 配送销售额: true, 毛利率: false },
    });
  });

  expect(onLegendStateChanged).toHaveBeenLastCalledWith({
    'current:毛利润': true,
    毛利润: true,
    'current:配送销售额': true,
    配送销售额: true,
    'current:毛利率': false,
    毛利率: false,
  });
});
