import { PivotData, naturalSort } from '../../src/react-pivottable/utilities';
import {
  createCustomPeriodAggregator,
  unpivotCustomPeriodData,
  PERIOD_KEY,
  PERIOD_COLUMNS,
  validateCustomPeriodMetrics,
  getPeriodOperation,
} from '../../src/plugin/customPeriodComparison';

const formatter = (value: number) => String(value);
const aggregate = (
  operation: string,
  records: Record<string, unknown>[],
  ratio = false,
) => {
  const agg = createCustomPeriodAggregator(formatter, ratio)(
    null,
    [],
    [operation],
  );
  records.forEach(record => agg.push(record));
  return agg;
};

test('aggregates both periods before calculating the total percent', () => {
  const records = [
    { __periodCurrent: 20, __periodComparison: 10 },
    { __periodCurrent: 180, __periodComparison: 90 },
  ];
  expect(aggregate('变化率', records).value()).toBe(1);
  expect(aggregate('差额', records).value()).toBe(100);
  expect(aggregate('当前值', records).value()).toBe(200);
});

test('keeps missing sides null and does not count zero as missing', () => {
  expect(
    aggregate('对比值', [
      { __periodCurrent: 0, __periodComparison: null },
    ]).value(),
  ).toBeNull();
  expect(
    aggregate('当前值', [
      { __periodCurrent: 0, __periodComparison: null },
    ]).value(),
  ).toBe(0);
  expect(
    aggregate('变化率', [
      { __periodCurrent: 10, __periodComparison: 0 },
    ]).value(),
  ).toBeNull();
  expect(
    aggregate('变化率', [
      { __periodCurrent: -50, __periodComparison: -100 },
    ]).value(),
  ).toBe(0.5);
});

test('recalculates each period ratio from components at totals', () => {
  const records = [
    {
      __periodCurrentNum: 10,
      __periodCurrentDen: 100,
      __periodComparisonNum: 20,
      __periodComparisonDen: 100,
    },
    {
      __periodCurrentNum: 90,
      __periodCurrentDen: 300,
      __periodComparisonNum: 40,
      __periodComparisonDen: 200,
    },
  ];
  expect(aggregate('当前值', records, true).value()).toBe(0.25);
  expect(aggregate('对比值', records, true).value()).toBe(0.2);
  expect(aggregate('变化率', records, true).value()).toBeCloseTo(0.25);
});

test('does not sum unlike comparison columns into a meaningless total', () => {
  expect(
    createCustomPeriodAggregator(formatter)(null, [], []).value(),
  ).toBeNull();
});

test('unpivot retains missing rows and original metric identity under four subcolumns', () => {
  const records = unpivotCustomPeriodData(
    [{ shop: 'A', sales: 10, sales__custom_period: null }],
    ['sales'],
    {},
    'Metric',
  );
  expect(records).toHaveLength(4);
  expect(records.map(record => record[PERIOD_KEY])).toEqual(PERIOD_COLUMNS);
  expect(records.every(record => record.Metric === 'sales')).toBe(true);
  expect(records[0].__periodComparison).toBeNull();
});

test('refuses non-additive and unknown saved metrics instead of guessing totals', () => {
  expect(() =>
    validateCustomPeriodMetrics(
      ['avg_sales'],
      {},
      [{ metric_name: 'avg_sales', expression: 'AVG(sales)' }],
      'Sum',
    ),
  ).toThrow(/不可加/);
  expect(() => validateCustomPeriodMetrics(['unknown'], {}, [], 'Sum')).toThrow(
    /定义/,
  );
  expect(() =>
    validateCustomPeriodMetrics(
      ['sales'],
      {},
      [{ metric_name: 'sales', expression: 'SUM(sales)' }],
      'Average',
    ),
  ).toThrow(/Sum/);
  expect(() =>
    validateCustomPeriodMetrics(
      ['sales'],
      {},
      [{ metric_name: 'sales', expression: 'SUM(sales)' }],
      'Sum',
    ),
  ).not.toThrow();
});

test('accepts ratio components and formats rate differences in percentage points', () => {
  expect(() =>
    validateCustomPeriodMetrics(
      ['rate'],
      {
        rate: {
          pivotRatioNumerator: 'SUM(profit)',
          pivotRatioDenominator: 'SUM(sales)',
        },
      },
      [],
      'Sum',
    ),
  ).not.toThrow();
  const agg = createCustomPeriodAggregator(
    formatter,
    false,
    false,
    true,
  )(null, [], ['差额']);
  agg.push({ __periodCurrent: 0.12, __periodComparison: 0.1 });
  expect(agg.format(agg.value())).toBe('+2.0 个百分点');
});

test('actual PivotData keeps four subcolumns, correct totals, and numeric period order', () => {
  const pivot = new PivotData({
    data: unpivotCustomPeriodData(
      [
        { shop: 'A', sales: 20, sales__custom_period: 10 },
        { shop: 'B', sales: 180, sales__custom_period: 90 },
      ],
      ['sales'],
      {},
      'Metric',
    ),
    rows: ['shop'],
    cols: ['Metric', PERIOD_KEY],
    vals: ['value'],
    aggregatorName: 'Custom period',
    aggregatorsFactory: () => ({
      'Custom period': () => createCustomPeriodAggregator(formatter),
    }),
    customAggregatorNames: { Metric: { sales: 'Custom period' } },
    defaultFormatter: formatter,
  });
  expect(pivot.getAggregator([], ['sales', '变化率']).value()).toBe(1);
  expect(pivot.getAggregator(['A'], ['sales', '当前值']).value()).toBe(20);
  expect(pivot.getAggregator([], []).value()).toBeNull();
  expect(['第14天 · x / y', '第2天 · x / y'].sort(naturalSort)).toEqual([
    '第2天 · x / y',
    '第14天 · x / y',
  ]);
});

test('preserves per-cell AUTO currency tracking for current and difference', () => {
  const currencyFormatter = (
    value: number,
    agg?: { getCurrencies: () => string[] },
  ) => `${agg?.getCurrencies().join(',')} ${value}`;
  const agg = createCustomPeriodAggregator(currencyFormatter)(
    null,
    [],
    ['当前值'],
  );
  agg.push({
    __periodCurrent: 10,
    __periodComparison: 9,
    __currencyColumn: 'currency',
    currency: 'USD',
  });
  expect(agg.format(agg.value())).toBe('USD 10');
});

test('operation is taken from its own dimension, not another business value', () => {
  expect(
    getPeriodOperation(
      ['shop'],
      ['变化率'],
      ['Metric', PERIOD_KEY],
      ['sales', '当前值'],
    ),
  ).toBe('当前值');
  expect(
    getPeriodOperation(['shop'], ['变化率'], ['Metric'], ['sales']),
  ).toBeUndefined();
});

test.each([
  "SUM(CASE WHEN status = 'paid' THEN COALESCE(sales, 0) ELSE 0 END)",
  'sum(coalesce(sales, 0))',
  "SUM(CASE WHEN tag = 'a)''b' THEN sales ELSE 0 END)",
  'COUNT(CASE WHEN sales > 0 THEN 1 END)',
  'SUM("营业额")',
])('accepts a complete additive outer aggregate: %s', expression => {
  expect(() =>
    validateCustomPeriodMetrics(
      ['sales'],
      {},
      [{ metric_name: 'sales', expression }],
      'Sum',
    ),
  ).not.toThrow();
});

test.each([
  'SUM(a) / SUM(b)',
  'COUNT(DISTINCT customer)',
  'SUM(a) + SUM(b)',
  'AVG(a)',
  'SUM(COALESCE(a, 0)',
  "SUM('unterminated)",
  'SUM(a) OVER (PARTITION BY shop)',
  'COUNT(/* comment */ DISTINCT customer)',
])('rejects incomplete, distinct, or compound aggregates: %s', expression => {
  expect(() =>
    validateCustomPeriodMetrics(
      ['sales'],
      {},
      [{ metric_name: 'sales', expression }],
      'Sum',
    ),
  ).toThrow(
    '自定义期间对比：sales 是不可加指标，请配置分子分母或使用 SUM/COUNT。',
  );
});

test('absolute expense ratios take absolute value after summing signed components', () => {
  const agg = createCustomPeriodAggregator(formatter, true, true)(
    null,
    [],
    ['当前值'],
  );
  agg.push({ __periodCurrentNum: -10, __periodCurrentDen: 100 });
  agg.push({ __periodCurrentNum: 2, __periodCurrentDen: 100 });
  expect(agg.value()).toBe(0.04);
});

test('a null saved metric expression fails with a clear missing-definition message', () => {
  expect(() =>
    validateCustomPeriodMetrics(
      ['sales'],
      {},
      [{ metric_name: 'sales', expression: null }],
      'Sum',
    ),
  ).toThrow(/定义/);
});
