import { getDimensionLabelOverrides } from './dimensionLabelConfig';

test('keeps only non-empty custom dimension labels', () => {
  expect(
    getDimensionLabelOverrides({
      earliest_ship_date: { customColumnName: '发货日期' },
      lt: { customColumnName: ' LT ' },
      country: { customColumnName: '' },
      shop_name: {},
      invalid: '平台',
    }),
  ).toEqual({
    earliest_ship_date: '发货日期',
    lt: 'LT',
  });
});
