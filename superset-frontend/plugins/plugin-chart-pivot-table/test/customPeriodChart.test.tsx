import {
  fireEvent,
  render,
  screen,
  within,
} from 'spec/helpers/testing-library';
import PivotTableChart from '../src/PivotTableChart';
import { MetricsLayoutEnum, type PivotTableProps } from '../src/types';

const props = {
  data: [
    { shop: 'A', sales: 20, sales__custom_period: 10 },
    { shop: 'B', sales: 180, sales__custom_period: 90 },
  ],
  groupbyRows: ['shop'],
  groupbyColumns: [],
  metrics: ['sales'],
  height: 600,
  width: 800,
  tableRenderer: 'Table With Subtotal',
  aggregateFunction: 'Sum',
  colOrder: 'key_a_to_z',
  rowOrder: 'key_a_to_z',
  transposePivot: false,
  combineMetric: true,
  metricsLayout: MetricsLayoutEnum.COLUMNS,
  rowSubtotalPosition: false,
  colSubtotalPosition: false,
  colTotals: true,
  rowTotals: true,
  colSubTotals: true,
  rowSubTotals: true,
  valueFormat: '.0f',
  columnFormats: {},
  currencyFormats: {},
  verboseMap: {},
  metricAggregateFunctions: {},
  metricColorFormatters: [],
  dateFormatters: {},
  setDataMask: jest.fn(),
  customPeriodComparison: true,
  pivotNumberFormatRules: [
    { axis: 'row', field: 'shop', value: 'A', format: '.0f' },
  ],
} as unknown as PivotTableProps;

test('renders current/comparison/difference/percent beneath the original metric', () => {
  render(
    <PivotTableChart
      {...props}
      metricColorFormatters={
        [
          {
            column: 'sales',
            getColorFromValue: (value: unknown) =>
              typeof value === 'number' && value > 0 ? '#ff0000' : undefined,
          },
        ] as PivotTableProps['metricColorFormatters']
      }
    />,
  );
  ['sales', '当前值', '对比值', '差额', '变化率'].forEach(label => {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });
  expect(screen.getAllByText('+100').length).toBeGreaterThan(0);
  expect(screen.getAllByText('+100.0%').length).toBeGreaterThan(0);
  const row = screen.getByText('A').closest('tr')!;
  expect(within(row).getByText('+100.0%')).toBeInTheDocument();
  expect(within(row).getByText('+10')).toBeInTheDocument();
  const cells = row.querySelectorAll('td');
  expect(cells[0].style.backgroundColor).not.toBe('');
  expect(cells[2].style.backgroundColor).toBe('');
  expect(cells[3].style.backgroundColor).toBe('');
});

test('aligned date headers cannot produce a filter or drill-by on a synthetic date label', () => {
  const onContextMenu = jest.fn();
  const label = '第1天 · 2026-10-01 / 2026-08-05';
  render(
    <PivotTableChart
      {...props}
      groupbyRows={['shop', 'day']}
      data={[{ shop: 'A', day: label, sales: 20, sales__custom_period: 10 }]}
      customPeriodTemporalDimensions={['day']}
      onContextMenu={onContextMenu}
    />,
  );
  const dateHeader = screen.getByText(label);
  fireEvent.contextMenu(dateHeader);
  expect(onContextMenu).not.toHaveBeenCalled();
  fireEvent.contextMenu(dateHeader.closest('tr')!.querySelector('td')!);
  expect(onContextMenu).toHaveBeenCalled();
  const [call] = onContextMenu.mock.calls;
  const [, , context] = call;
  expect(context.drillBy).toBeUndefined();
  expect(context.crossFilter).toBeUndefined();
  expect(
    context.drillToDetail.every(
      (filter: { col: string }) => filter.col !== 'day',
    ),
  ).toBe(true);
});

test('business dimension headers retain their filter and drill-by behavior', () => {
  const onContextMenu = jest.fn();
  render(
    <PivotTableChart
      {...props}
      onContextMenu={onContextMenu}
      emitCrossFilters
    />,
  );
  fireEvent.contextMenu(screen.getByText('A'));
  const [call] = onContextMenu.mock.calls;
  const [, , context] = call;
  expect(context.drillBy.filters).toEqual([
    { col: 'shop', op: '==', val: 'A' },
  ]);
  expect(context.crossFilter.dataMask.extraFormData.filters).toEqual([
    { col: 'shop', op: 'IN', val: ['A'] },
  ]);
});
