import buildQuery from './buildQuery';

jest.mock('@superset-ui/core', () => ({
  buildQueryContext: jest.fn((formData, queryBuilder) => ({
    datasource: formData.datasource,
    queries: queryBuilder({
      metrics: [formData.metric],
      time_range: formData.time_range || formData.extraFormData?.time_range,
      filters: [],
    }),
  })),
}));

describe('BigNumberTotal buildQuery', () => {
  const baseFormData = {
    datasource: '98__table',
    viz_type: 'big_number_total',
    metric: 'gross_profit',
  } as any;

  it('adds previous-window and prior-year queries by default for absolute time ranges', () => {
    const queryContext = buildQuery({
      ...baseFormData,
      time_range: '2026-06-26 : 2026-07-01',
    });

    expect(queryContext.queries).toHaveLength(3);
    expect(queryContext.queries.map((query: any) => query.time_range)).toEqual([
      '2026-06-26 : 2026-07-01',
      '2026-06-21 : 2026-06-26',
      '2025-06-26 : 2025-07-01',
    ]);
  });

  it('keeps a single query when comparison is disabled', () => {
    const queryContext = buildQuery({
      ...baseFormData,
      comparison_enabled: false,
      time_range: '2026-06-26 : 2026-07-01',
    });

    expect(queryContext.queries).toHaveLength(1);
    expect(queryContext.queries[0].time_range).toBe('2026-06-26 : 2026-07-01');
  });

  it('adds only selected comparison modes', () => {
    const queryContext = buildQuery({
      ...baseFormData,
      comparison_modes: ['year'],
      time_range: '2026-06-26 : 2026-07-01',
    });

    expect(queryContext.queries.map((query: any) => query.time_range)).toEqual([
      '2026-06-26 : 2026-07-01',
      '2025-06-26 : 2025-07-01',
    ]);
  });

  it('uses dashboard native filter time range from extraFormData', () => {
    const queryContext = buildQuery({
      ...baseFormData,
      extraFormData: {
        time_range: '2026-06-01 : 2026-07-01',
      },
    });

    expect(queryContext.queries).toHaveLength(3);
    expect(queryContext.queries.map((query: any) => query.time_range)).toEqual([
      '2026-06-01 : 2026-07-01',
      '2026-05-02 : 2026-06-01',
      '2025-06-01 : 2025-07-01',
    ]);
  });

  it('keeps a single query for relative ranges', () => {
    const queryContext = buildQuery({
      ...baseFormData,
      time_range: 'Last 7 days',
    });

    expect(queryContext.queries).toHaveLength(1);
    expect(queryContext.queries[0].time_range).toBe('Last 7 days');
  });
});
