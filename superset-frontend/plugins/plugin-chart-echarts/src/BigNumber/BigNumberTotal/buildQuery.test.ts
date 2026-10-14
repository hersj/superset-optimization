import buildQuery from './buildQuery';

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  buildQueryContext: jest.fn((formData, queryBuilder) => ({
    datasource: formData.datasource,
    queries: queryBuilder({
      metrics: [formData.metric],
      time_range: formData.time_range || formData.extraFormData?.time_range,
      filters: formData.filters || [],
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

const customPeriod = {
  currentTimeRange: '2026-10-01 : 2026-10-14',
  comparisonTimeRange: '2026-08-05 : 2026-09-05',
  timeColumn: 'ds',
};
const customExtra = {
  custom_form_data: { custom_period_comparison: customPeriod },
};

test('custom dashboard period uses exact A/B aggregates despite saved comparison disabled', () => {
  const metric = {
    expressionType: 'SQL' as const,
    aggregate: null,
    column: null,
    hasCustomLabel: true,
    optionName: 'rate',
    sqlExpression: 'SUM(profit) / NULLIF(SUM(sales), 0)',
    label: 'rate',
  };
  const result = buildQuery({
    datasource: '98__table',
    viz_type: 'big_number_total',
    metric,
    comparison_enabled: false,
    time_range: 'Last 7 days',
    extra_form_data: customExtra,
    filters: [
      { col: 'ds', op: 'TEMPORAL_RANGE', val: customPeriod.currentTimeRange },
      { col: 'shop', op: '==', val: 'A' },
    ],
  });
  expect(result.queries).toHaveLength(2);
  expect(result.queries.map(query => query.time_range)).toEqual([
    customPeriod.currentTimeRange,
    customPeriod.comparisonTimeRange,
  ]);
  result.queries.forEach(query => {
    expect(query.metrics).toEqual([metric]);
    expect(query.columns).toEqual([]);
    expect(query.is_timeseries).toBe(false);
    expect(query.post_processing).toEqual([]);
    expect(query.time_offsets).toEqual([]);
    expect(query.filters?.find(filter => filter.col === 'shop')?.val).toBe('A');
  });
  expect(
    result.queries[1].filters?.find(filter => filter.col === 'ds')?.val,
  ).toBe(customPeriod.comparisonTimeRange);
});

test('reads normalized extraFormData custom period', () => {
  const result = buildQuery({
    datasource: '1__table',
    viz_type: 'big_number_total',
    metric: 'profit',
    extraFormData: customExtra,
  });
  expect(result.queries).toHaveLength(2);
  expect(result.queries[result.queries.length - 1].time_range).toBe(
    customPeriod.comparisonTimeRange,
  );
});
