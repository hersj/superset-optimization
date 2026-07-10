import { getBigNumberComparisonRanges } from './comparisonRanges';

describe('getBigNumberComparisonRanges', () => {
  it('computes previous same-length and prior-year ranges for a 5 day selection', () => {
    expect(getBigNumberComparisonRanges('2026-06-26 : 2026-07-01')).toEqual({
      previousRange: '2026-06-21 : 2026-06-26',
      yearRange: '2025-06-26 : 2025-07-01',
    });
  });

  it('computes previous same-length and prior-year ranges for 本月 at T-2 month end', () => {
    expect(getBigNumberComparisonRanges('2026-06-01 : 2026-07-01')).toEqual({
      previousRange: '2026-05-02 : 2026-06-01',
      yearRange: '2025-06-01 : 2025-07-01',
    });
  });

  it('computes previous same-length and prior-year ranges for 本年 through available day', () => {
    expect(getBigNumberComparisonRanges('2026-01-01 : 2026-07-01')).toEqual({
      previousRange: '2025-07-04 : 2026-01-01',
      yearRange: '2025-01-01 : 2025-07-01',
    });
  });

  it('does not enable default comparison for relative or malformed ranges', () => {
    expect(getBigNumberComparisonRanges('Last 7 days')).toBeNull();
    expect(getBigNumberComparisonRanges('2026-06-01')).toBeNull();
  });
});
