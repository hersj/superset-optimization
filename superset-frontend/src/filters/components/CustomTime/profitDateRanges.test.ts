import {
  getProfitComparisonRanges,
  getProfitDataEndDate,
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
