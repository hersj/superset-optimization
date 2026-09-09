/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */
import { render, screen, userEvent } from 'spec/helpers/testing-library';
import CustomTimeFilterPlugin from './CustomTimeFilterPlugin';
import { useState } from 'react';

const january = '2026-01-01 : 2026-02-01';
const march = '2026-03-01 : 2026-04-01';

function mountPointFilter(
  selectionMode = 'continuous',
  selectedRanges = [january],
) {
  const setDataMask = jest.fn();
  const envelope =
    selectionMode === 'points' && selectedRanges.length > 1
      ? '2026-01-01 : 2026-04-01'
      : january;
  const props = {
    formData: {
      groupby: ['event_date'],
      defaultGrain: 'month',
      enableCustomRange: true,
    },
    filterState: {
      value: envelope,
      grain: 'month',
      selectionMode,
      selectedRanges,
    },
    ownState: { activePreset: null, activeGrain: 'month', lastRange: envelope },
    setDataMask,
    width: 320,
  };
  render(<CustomTimeFilterPlugin {...props} />);
  const expand = screen.queryByText(/展开/);
  if (expand) userEvent.click(expand);
  return setDataMask;
}

beforeEach(() =>
  jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z')),
);
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('controlled mask updates and restored new envelopes never fill gaps', () => {
  const writes = jest.fn();
  function ControlledFilter() {
    const [mask, setMask] = useState<any>({
      filterState: {
        value: january,
        grain: 'month',
        selectionMode: 'continuous',
      },
      ownState: {
        activeGrain: 'month',
        lastRange: january,
        activePreset: null,
      },
    });
    return (
      <>
        <button
          type="button"
          onClick={() =>
            setMask({
              filterState: {
                value: '2025-01-01 : 2026-04-01',
                grain: 'month',
                selectionMode: 'points',
                selectedRanges: ['2025-01-01 : 2025-02-01', march],
              },
              ownState: mask.ownState,
            })
          }
        >
          restore selection
        </button>
        <CustomTimeFilterPlugin
          formData={{ groupby: ['event_date'], enableCustomRange: true }}
          {...mask}
          setDataMask={(value: any) => {
            writes(value);
            setMask(value);
          }}
          width={320}
        />
      </>
    );
  }
  render(<ControlledFilter />);
  const expand = screen.queryByText(/展开/);
  if (expand) userEvent.click(expand);
  userEvent.click(screen.getByRole('button', { name: '点选区间' }));
  userEvent.click(screen.getByRole('button', { name: '2026-03' }));
  expect(writes.mock.calls.at(-1)[0].extraFormData.filters[0].val).toEqual([
    january,
    march,
  ]);
  writes.mockClear();
  userEvent.click(screen.getByRole('button', { name: 'restore selection' }));
  expect(writes).toHaveBeenCalled();
  for (const [mask] of writes.mock.calls) {
    expect(mask.extraFormData.filters[0].val).toEqual([
      '2025-01-01 : 2025-02-01',
      march,
    ]);
  }
});

test('starts continuous, preserves range in point mode and toggles isolated months', () => {
  const setDataMask = mountPointFilter();
  expect(screen.getByRole('button', { name: '连续区间' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  userEvent.click(screen.getByRole('button', { name: '点选区间' }));
  userEvent.click(screen.getByRole('button', { name: '2026-03' }));
  expect(setDataMask.mock.calls.at(-1)[0].extraFormData).toMatchObject({
    filters: [
      { col: 'event_date', op: 'TEMPORAL_RANGE', val: [january, march] },
    ],
    time_compare: ['上一选中区间'],
  });
  expect(screen.getByRole('button', { name: '2026-02' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  userEvent.click(screen.getByRole('button', { name: '2026-01' }));
  userEvent.click(screen.getByRole('button', { name: '2026-03' }));
  expect(setDataMask.mock.calls.at(-1)[0].extraFormData.filters).toEqual([
    { col: 'event_date', op: 'TEMPORAL_RANGE', val: [] },
  ]);
});

test('requires confirmation before filling gaps and cancel does not query', () => {
  const setDataMask = mountPointFilter('points', [january, march]);
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  setDataMask.mockClear();
  userEvent.click(screen.getByRole('button', { name: '连续区间' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(setDataMask).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '点选区间' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  confirm.mockReturnValue(true);
  userEvent.click(screen.getByRole('button', { name: '连续区间' }));
  expect(setDataMask.mock.calls.at(-1)[0].extraFormData.filters).toEqual([
    { col: 'event_date', op: 'TEMPORAL_RANGE', val: '2026-01-01 : 2026-04-01' },
  ]);
});

test('point fiscal years preserve existing April 1 to March 30 boundaries without selecting the middle year', () => {
  const setDataMask = mountPointFilter('points', []);
  userEvent.click(screen.getByRole('button', { name: '按财年' }));
  userEvent.click(screen.getByRole('button', { name: /前十二年/ }));
  userEvent.click(screen.getByRole('button', { name: '2025财年' }));
  userEvent.click(screen.getByRole('button', { name: '2023财年' }));
  expect(setDataMask.mock.calls.at(-1)[0].extraFormData).toMatchObject({
    time_grain_sqla: 'P1Y_FISCAL',
    filters: [
      {
        col: 'event_date',
        op: 'TEMPORAL_RANGE',
        val: ['2023-04-01 : 2024-03-31', '2025-04-01 : 2026-03-31'],
      },
    ],
  });
  expect(screen.getByRole('button', { name: '2024财年' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
