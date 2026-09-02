import {
  getProfitComparisonRanges,
  getProfitDataEndDate,
  getProfitFiscalYearRange,
  getProfitPresetRange,
} from './profitDateRanges';

describe('profitDateRanges', () => {
  const now = new Date('2026-07-02T10:00:00+08:00');

  it('caps the profit data calendar at T-2', () => {
    expect(getProfitDataEndDate(now)).toBe('2026-06-30');
  });

  it('uses the profit data month for 本月 instead of the real calendar month', () => {
    expect(getProfitPresetRange('this_month', now)).toEqual({
      timeRange: '2026-06-01 : 2026-07-01',
      label: '本月',
    });
  });

  it('uses the profit data year through the available data day for 本年', () => {
    expect(getProfitPresetRange('this_year', now)).toEqual({
      timeRange: '2026-01-01 : 2026-07-01',
      label: '本年',
    });
  });

  it('uses April 1 through March 30 for 本财年', () => {
    expect(getProfitPresetRange('this_fiscal_year', now)).toEqual({
      timeRange: '2026-04-01 : 2027-03-31',
      label: '本财年',
    });
  });

  it('keeps January and March in the previous fiscal-year start', () => {
    expect(
      getProfitPresetRange(
        'this_fiscal_year',
        new Date('2026-02-02T10:00:00+08:00'),
      ),
    ).toEqual({
      timeRange: '2025-04-01 : 2026-03-31',
      label: '本财年',
    });
  });

  it('builds a selectable historical fiscal year range', () => {
    expect(getProfitFiscalYearRange(2025)).toEqual({
      timeRange: '2025-04-01 : 2026-03-31',
      label: '2025财年',
    });
  });

  it('builds a continuous range across selected fiscal years', () => {
    expect(getProfitFiscalYearRange(2024, 2025)).toEqual({
      timeRange: '2024-04-01 : 2026-03-31',
      label: '2024-2025财年',
    });
  });

  it('builds recent ranges ending on the available profit day inclusively', () => {
    expect(getProfitPresetRange('last_7d', now)).toEqual({
      timeRange: '2026-06-24 : 2026-07-01',
      label: '最近7天',
    });
  });

  it('computes previous-window and prior-year ranges for a selected 5 day range', () => {
    expect(getProfitComparisonRanges('2026-06-26 : 2026-07-01')).toEqual({
      previousRange: '2026-06-21 : 2026-06-26',
      yearRange: '2025-06-26 : 2025-07-01',
    });
  });

  it('returns null comparison ranges for relative Superset time ranges', () => {
    expect(getProfitComparisonRanges('Last 7 days')).toBeNull();
  });
});
