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
import { render, screen, userEvent, fireEvent } from 'spec/helpers/testing-library';
import CustomTimeFilterPlugin from './CustomTimeFilterPlugin';

const baseProps = {
  formData: {
    defaultPreset: 'last_7d',
    defaultGrain: 'day',
    enablePresets: true,
    enableCustomRange: true,
    enableTimeGrain: true,
  },
  filterState: {},
  ownState: {},
  setDataMask: jest.fn(),
  width: 320,
};

/**
 * Helper to expand the filter from collapsed state.
 * Call this at the start of tests that need full controls.
 */
function expandFilter() {
  const trigger = screen.queryByText(/展开/);
  if (trigger) trigger.click();
}


describe('CustomTimeFilterPlugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the restored custom range when changing time grain', () => {
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{
          value: '2026-01-01 : 2026-02-01',
          grain: 'month',
          label: '自定义范围 | 月',
        }}
        ownState={{
          activePreset: null,
          activeGrain: 'month',
          lastRange: '2026-01-01 : 2026-02-01',
          startMonth: '2026-01',
          endMonth: '2026-01',
        }}
      />,
    );

      expandFilter();
    userEvent.click(screen.getByRole('button', { name: '按年' }));

    expect(setDataMask).toHaveBeenLastCalledWith({
      extraFormData: {
        time_range: '2026-01-01 : 2026-02-01',
        time_grain_sqla: 'P1Y',
      },
      filterState: {
        value: '2026-01-01 : 2026-02-01',
        grain: 'year',
        label: '自定义范围 | 年',
      },
      ownState: expect.objectContaining({
        activePreset: null,
        activeGrain: 'year',
        lastRange: '2026-01-01 : 2026-02-01',
        startMonth: '2026-01',
        endMonth: '2026-01',
      }),
    });
  });

  it('writes the selected time column instead of a global time range', () => {
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        formData={{ ...baseProps.formData, groupby: ['year_month'] }}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{}}
      />,
    );

    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: expect.objectContaining({
          filters: [
            { col: 'year_month', op: 'TEMPORAL_RANGE', val: expect.any(String) },
          ],
          time_grain_sqla: 'P1D',
        }),
      }),
    );
    expect(setDataMask.mock.calls.at(-1)[0].extraFormData.time_range).toBeUndefined();
  });

  it('applies the default preset against the T-2 profit data calendar and stores comparison ranges', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{}}
      />,
    );

    expect(setDataMask).toHaveBeenLastCalledWith({
      extraFormData: {
        time_range: '2026-06-24 : 2026-07-01',
        time_grain_sqla: 'P1D',
      },
      filterState: {
        value: 'last_7d',
        grain: 'day',
        label: '最近7天 | 日',
      },
      ownState: expect.objectContaining({
        activePreset: 'last_7d',
        activeGrain: 'day',
        lastRange: '2026-06-24 : 2026-07-01',
        profitDataEndDate: '2026-06-30',
        comparison: {
          previousRange: '2026-06-17 : 2026-06-24',
          yearRange: '2025-06-24 : 2025-07-01',
        },
      }),
    });
    jest.useRealTimers();
  });

  it('uses the T-2 profit data month when clicking 本月', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{}}
      />,
    );

    setDataMask.mockClear();
    expandFilter();
    userEvent.click(screen.getByRole('button', { name: '本月' }));

    expect(setDataMask).toHaveBeenLastCalledWith({
      extraFormData: {
        time_range: '2026-06-01 : 2026-07-01',
        time_grain_sqla: 'P1D',
      },
      filterState: {
        value: 'this_month',
        grain: 'day',
        label: '本月 | 日',
      },
      ownState: expect.objectContaining({
        activePreset: 'this_month',
        activeGrain: 'day',
        lastRange: '2026-06-01 : 2026-07-01',
        profitDataEndDate: '2026-06-30',
        comparison: {
          previousRange: '2026-05-02 : 2026-06-01',
          yearRange: '2025-06-01 : 2025-07-01',
        },
      }),
    });
    expect(screen.queryByRole('button', { name: '今天' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '昨天' })).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('selects the current fiscal year from the preset row', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{}}
      />,
    );

    setDataMask.mockClear();
    expandFilter();
    userEvent.click(screen.getByRole('button', { name: '本财年' }));

    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          time_range: '2026-04-01 : 2027-03-31',
          time_grain_sqla: 'P1D',
        },
        filterState: {
          value: 'this_fiscal_year',
          grain: 'day',
          label: '本财年 | 日',
        },
      }),
    );
    expect(screen.getByTestId('custom-time-filter')).toHaveTextContent('本财年 | 日');
    jest.useRealTimers();
  });

  it('selects a historical fiscal year without changing the display grain', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{}}
      />,
    );

    setDataMask.mockClear();
    expandFilter();
    userEvent.click(screen.getByRole('button', { name: '选择财年' }));
    expect(screen.getByTestId('custom-time-fiscal-year-grid')).toBeInTheDocument();

    userEvent.click(screen.getByRole('button', { name: '前十二年财年' }));
    userEvent.click(screen.getByRole('button', { name: '2025财年' }));

    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: {
          time_range: '2025-04-01 : 2026-03-31',
          time_grain_sqla: 'P1D',
        },
        filterState: {
          value: '2025-04-01 : 2026-03-31',
          grain: 'day',
          label: '2025财年 | 日',
        },
        ownState: expect.objectContaining({
          activePreset: null,
          fiscalYear: 2025,
          activeGrain: 'day',
          lastRange: '2025-04-01 : 2026-03-31',
        }),
      }),
    );
    expect(screen.getByTestId('custom-time-filter')).toHaveTextContent('2025财年 | 日');
    jest.useRealTimers();
  });


  it('renders an adaptive single-calendar panel for day grain', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        filterState={{}}
        ownState={{}}
      />,
    );

    expandFilter();
    expect(screen.getByRole('button', { name: '按天' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按周' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按季' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按年' })).toBeInTheDocument();
    expect(screen.getByText('2026 年 6 月')).toBeInTheDocument();
    expect(screen.queryByText('2026 年 7 月')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '今天' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '昨天' })).not.toBeInTheDocument();
    jest.useRealTimers();
  });


  test('shows 60 months of history and no months after the data cutoff', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        filterState={{}}
        ownState={{}}
      />,
    );

    expandFilter();

    expect(screen.getByRole('option', { name: '2021-06' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2026-06' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '2026-07' })).not.toBeInTheDocument();

    jest.useRealTimers();
  });


  it('selects one day first, then completes a right-open day range', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{}}
      />,
    );

    expandFilter();
    setDataMask.mockClear();

    userEvent.click(screen.getByRole('button', { name: '2026-06-20' }));
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: expect.objectContaining({
          time_range: '2026-06-20 : 2026-06-21',
        }),
        ownState: expect.objectContaining({
          startDate: '2026-06-20',
          endDate: '2026-06-20',
        }),
      })
    );

    setDataMask.mockClear();
    userEvent.click(screen.getByRole('button', { name: '2026-06-25' }));
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: expect.objectContaining({
          time_range: '2026-06-20 : 2026-06-26',
        }),
        ownState: expect.objectContaining({
          startDate: '2026-06-20',
          endDate: '2026-06-25',
        }),
      })
    );
    jest.useRealTimers();
  });

  it('starts a new day selection after a completed range', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{
          startDate: '2026-06-20',
          endDate: '2026-06-25',
          activePreset: null,
          lastRange: '2026-06-20 : 2026-06-26',
        }}
      />,
    );

    expandFilter();
    setDataMask.mockClear();

    userEvent.click(screen.getByRole('button', { name: '2026-06-10' }));
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: expect.objectContaining({
          time_range: '2026-06-10 : 2026-06-11',
        }),
        ownState: expect.objectContaining({
          startDate: '2026-06-10',
          endDate: '2026-06-10',
        }),
      })
    );
    jest.useRealTimers();
  });

  it('normalizes reversed day range clicks', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{}}
      />,
    );

    expandFilter();
    setDataMask.mockClear();

    userEvent.click(screen.getByRole('button', { name: '2026-06-25' }));
    userEvent.click(screen.getByRole('button', { name: '2026-06-20' }));
    expect(setDataMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraFormData: expect.objectContaining({
          time_range: '2026-06-20 : 2026-06-26',
        }),
        ownState: expect.objectContaining({
          startDate: '2026-06-20',
          endDate: '2026-06-25',
        }),
      })
    );
    jest.useRealTimers();
  });



  it("adapts layout to narrow container width without overflow", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-02T10:00:00+08:00"));

    const { container } = render(
      <CustomTimeFilterPlugin
        {...baseProps}
        width={350}
        filterState={{}}
        ownState={{}}
      />,
    );

    // Container must not force a minimum width
    const containerDiv = container.firstChild as HTMLElement;
    const containerStyle = containerDiv.style || getComputedStyle(containerDiv);
    // minWidth should not be a large fixed value like 720px
    const minW = containerStyle.minWidth;
    expect(minW === "" || minW === "0px" || parseInt(minW, 10) < 400).toBe(true);

    // Shell grid should use responsive columns, not force 420px panel min
    const shell = containerDiv.firstChild as HTMLElement;
    const shellStyle = shell.style || getComputedStyle(shell);
    expect(shellStyle.display).not.toBe("");
    // Grid template columns should adapt
    expect(shell.style.gridTemplateColumns || "").not.toContain("420");

    // All grain buttons should still be visible
    expandFilter();
    expect(screen.getByText("\u6309\u5929")).toBeInTheDocument();
    expect(screen.getByText("\u6309\u5e74")).toBeInTheDocument();

    jest.useRealTimers();
  });


  it("renders collapsed by default with summary line only", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-02T10:00:00+08:00"));

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        filterState={{}}
        ownState={{}}
      />,
    );

    // Summary line should be visible (shows current preset + grain)
    expect(screen.getByText(/最近7天/)).toBeInTheDocument();
    expect(screen.getByText(/日/)).toBeInTheDocument();

    // Expand trigger should be present
    const expandTrigger = screen.getByText(/展开/);
    expect(expandTrigger).toBeInTheDocument();

    // Calendar and grain buttons should NOT be visible in collapsed state
    expect(screen.queryByRole("button", { name: "2026-06-20" })).toBeNull();
    // Full preset list buttons should not be rendered
    expect(screen.queryByRole("button", { name: "最近30天" })).toBeNull();

    jest.useRealTimers();
  });

  it("expands to show full controls when clicking expand trigger", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-02T10:00:00+08:00"));

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        filterState={{}}
        ownState={{}}
      />,
    );

    // Click expand
    const expandTrigger = screen.getByText(/展开/);
    expandTrigger.click();

    // Full controls should now be visible
    expect(screen.getByRole("button", { name: "按年" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本月" })).toBeInTheDocument();
    expect(screen.getByText("2026 年 6 月")).toBeInTheDocument();

    // Collapse trigger should appear
    expect(screen.getByText(/收起/)).toBeInTheDocument();

    jest.useRealTimers();
  });


  it("navigates calendar to previous month when clicking back arrow", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-02T10:00:00+08:00"));

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        filterState={{}}
        ownState={{}}
      />,
    );

    expandFilter();

    // Initially should show a single month to fit the filter popover width.
    expect(screen.getByText("2026 年 6 月")).toBeInTheDocument();
    expect(screen.queryByText("2026 年 7 月")).toBeNull();

    // Click previous month arrow
    const prevBtn = screen.getByText(/上个月/);
    userEvent.click(prevBtn);

    // Should now show May 2026 only
    expect(screen.getByText("2026 年 5 月")).toBeInTheDocument();
    expect(screen.queryByText("2026 年 6 月")).toBeNull();

    jest.useRealTimers();
  });



  it('resets to single day when clicking lo-end of reversed saved range', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{}}
        ownState={{
          activePreset: null,
          activeGrain: 'day',
          startDate: '2026-06-16',
          endDate: '2026-06-02',
          lastRange: '2026-06-02 : 2026-06-16',
        }}
      />,
    );

    expandFilter();
    setDataMask.mockClear();

    // Click 06-02 (lo end of reversed range) -> should reset to 06-02->06-02
    userEvent.click(screen.getByRole('button', { name: '2026-06-02' }));
    const lastCall = setDataMask.mock.calls[setDataMask.mock.calls.length - 1][0];
    expect(lastCall.extraFormData.time_range).toBe('2026-06-02 : 2026-06-03');
    expect(lastCall.ownState.startDate).toBe('2026-06-02');
    expect(lastCall.ownState.endDate).toBe('2026-06-02');
    jest.useRealTimers();
  });

  it('month jump selector does not produce NaN when choosing 2025 month', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        filterState={{}}
        ownState={{}}
      />,
    );

    expandFilter();

    const monthSelect = screen.getByLabelText('快速跳转月份');
    // Select a 2025 month option
    const option = Array.from((monthSelect as HTMLSelectElement).options).find(
      o => o.value.startsWith('2025')
    );
    expect(option).toBeDefined();
    if (option) {
      fireEvent.change(monthSelect, { target: { value: option.value } });
    }

    // After selection, calendar should show valid months, not NaN
    expect(screen.queryByText(/NaN/)).toBeNull();
    jest.useRealTimers();
  });















  it('renders a month-grid calendar and selects whole months in month grain', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{ grain: 'month' }}
        ownState={{ activeGrain: 'month' }}
      />,
    );

    expandFilter();
    setDataMask.mockClear();

    expect(screen.getByText('2026年')).toBeInTheDocument();
    expect(screen.getByTestId('custom-time-month-grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    });
    expect(screen.getByRole('button', { name: '2026-06' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2026-06-15' })).toBeNull();

    userEvent.click(screen.getByRole('button', { name: '2026-06' }));

    const call = setDataMask.mock.calls[setDataMask.mock.calls.length - 1][0];
    expect(call.filterState.grain).toBe('month');
    // Whole month of June: right-open range
    expect(call.extraFormData.time_range).toBe('2026-06-01 : 2026-07-01');
    expect(call.ownState.startMonth).toBe('2026-06');
    expect(call.ownState.endMonth).toBe('2026-06');
    jest.useRealTimers();
  });

  it('renders a quarter-grid calendar and selects whole fiscal quarters in quarter grain', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{ grain: 'quarter' }}
        ownState={{ activeGrain: 'quarter' }}
      />,
    );

    expandFilter();
    setDataMask.mockClear();

    expect(screen.getByText('2026年')).toBeInTheDocument();
    expect(screen.getByTestId('custom-time-quarter-grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    });
    expect(screen.getByRole('button', { name: '2026 Q1 (4-6月)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2026-06-15' })).toBeNull();

    userEvent.click(screen.getByRole('button', { name: '2026 Q1 (4-6月)' }));

    const call = setDataMask.mock.calls[setDataMask.mock.calls.length - 1][0];
    expect(call.filterState.grain).toBe('quarter');
    // Q1 2026: April 1 to July 1 (right-open)
    expect(call.extraFormData.time_range).toBe('2026-04-01 : 2026-07-01');
    expect(call.ownState.qStartYear).toBe(2026);
    expect(call.ownState.qStartQ).toBe(1);
    expect(call.ownState.qEndYear).toBe(2026);
    expect(call.ownState.qEndQ).toBe(1);
    jest.useRealTimers();
  });

  it('renders a year-grid calendar and selects whole years in year grain', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-02T10:00:00+08:00'));
    const setDataMask = jest.fn();

    render(
      <CustomTimeFilterPlugin
        {...baseProps}
        setDataMask={setDataMask}
        filterState={{ grain: 'year' }}
        ownState={{ activeGrain: 'year' }}
      />,
    );

    expandFilter();
    setDataMask.mockClear();

    expect(screen.getByText('2026 - 2037')).toBeInTheDocument();
    expect(screen.getByTestId('custom-time-year-grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    });
    expect(screen.getByRole('button', { name: '2026年' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2026-06-10' })).toBeNull();

    userEvent.click(screen.getByRole('button', { name: '2026年' }));

    const call = setDataMask.mock.calls[setDataMask.mock.calls.length - 1][0];
    expect(call.filterState.grain).toBe('year');
    // Full year: 2026-01-01 to 2027-01-01 (right-open)
    expect(call.extraFormData.time_range).toBe('2026-01-01 : 2027-01-01');
    expect(call.ownState.startYear).toBe(2026);
    expect(call.ownState.endYear).toBe(2026);
    jest.useRealTimers();
  });

});
