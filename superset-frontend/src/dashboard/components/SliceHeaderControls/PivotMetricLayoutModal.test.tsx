import {
  render,
  screen,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import PivotMetricLayoutModal from './PivotMetricLayoutModal';

const layout = {
  version: 1,
  ordered_metric_ids: ['sales', 'profit'],
  hidden_metric_ids: [],
  frozen_column_key: 'sales',
};
const templates = [
  { slot: 1 as const, name: '利润布局', is_default: false, layout },
];
function setup(extra = {}) {
  const callbacks = {
    onHide: jest.fn(),
    onApply: jest.fn(),
    onSaveTemplate: jest.fn().mockResolvedValue(undefined),
    onSetDefault: jest.fn().mockResolvedValue(undefined),
    onDeleteTemplate: jest.fn().mockResolvedValue(undefined),
  };
  render(
    <PivotMetricLayoutModal
      show
      metrics={['sales', 'profit']}
      templates={templates}
      activeSlot={1}
      initialLayout={layout}
      {...callbacks}
      {...extra}
    />,
  );
  return callbacks;
}
beforeEach(() => {
  const chart = document.createElement('div');
  chart.id = 'chart-id-undefined';
  chart.innerHTML =
    '<table class="pvtTable"><thead><tr><th data-pivot-freeze-key="date">Date</th><th data-pivot-freeze-key="sales" data-pivot-metric-id="sales">Sales</th><th data-pivot-freeze-key="profit" data-pivot-metric-id="profit">Profit</th></tr></thead></table>';
  document.body.appendChild(chart);
});
afterEach(() => document.getElementById('chart-id-undefined')?.remove());

test('library save stores named boundary but never applies to this or other charts', async () => {
  const callbacks = setup();
  expect(
    screen.queryByRole('checkbox', { name: '同步本看板透视图' }),
  ).not.toBeInTheDocument();
  userEvent.selectOptions(
    screen.getByRole('combobox', { name: '冻结到哪一列' }),
    'profit',
  );
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(callbacks.onSaveTemplate).toHaveBeenCalledWith(1, '利润布局', {
      ...layout,
      frozen_column_key: 'profit',
      frozen_column_count: 0,
    }),
  );
  expect(callbacks.onApply).not.toHaveBeenCalled();
  expect(callbacks.onHide).not.toHaveBeenCalled();
});
test('use and default are separate actions', async () => {
  const callbacks = setup();
  userEvent.click(screen.getByRole('button', { name: '设为默认' }));
  await waitFor(() => expect(callbacks.onSetDefault).toHaveBeenCalledWith(1));
  expect(callbacks.onApply).not.toHaveBeenCalled();
  userEvent.click(screen.getByRole('button', { name: /^使\s*用$/ }));
  expect(callbacks.onApply).toHaveBeenCalledWith(layout, 1);
});
test('delete does not reset the applied layout snapshot', async () => {
  const callbacks = setup();
  userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() =>
    expect(callbacks.onDeleteTemplate).toHaveBeenCalledWith(1),
  );
  expect(callbacks.onApply).not.toHaveBeenCalled();
});
test('failed save keeps draft and cancel writes nothing else', async () => {
  const onSaveTemplate = jest.fn().mockRejectedValue(new Error('offline'));
  const callbacks = setup({ onSaveTemplate });
  userEvent.selectOptions(
    screen.getByRole('combobox', { name: '冻结到哪一列' }),
    'date',
  );
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSaveTemplate).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('combobox', { name: '冻结到哪一列' })).toHaveValue(
    'date',
  );
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(callbacks.onApply).not.toHaveBeenCalled();
});
test('unresolved historical numeric setting is preserved on save', async () => {
  const callbacks = setup({
    initialLayout: {
      ...layout,
      frozen_column_key: undefined,
      frozen_column_count: 9,
    },
  });
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(callbacks.onSaveTemplate).toHaveBeenCalledWith(1, '利润布局', {
      version: 1,
      ordered_metric_ids: ['sales', 'profit'],
      hidden_metric_ids: [],
      frozen_column_count: 9,
    }),
  );
});
test('old per-chart templates remain available without overwriting the library', () => {
  const callbacks = setup({ legacyTemplates: templates });
  userEvent.click(screen.getByText('旧图表模板（保留）'));
  userEvent.click(screen.getByRole('button', { name: '使用旧模板' }));
  expect(callbacks.onApply).toHaveBeenCalledWith(layout, null);
  expect(callbacks.onSaveTemplate).not.toHaveBeenCalled();
});

test('use closes only after the layout has been persisted', async () => {
  let finish!: () => void;
  const onApply = jest.fn(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
  );
  const callbacks = setup({ onApply });
  userEvent.click(screen.getByRole('button', { name: /^使\s*用$/ }));
  expect(onApply).toHaveBeenCalledWith(layout, 1);
  expect(callbacks.onHide).not.toHaveBeenCalled();
  finish();
  await waitFor(() => expect(callbacks.onHide).toHaveBeenCalledTimes(1));
});

test('failed use keeps the modal open and preserves its draft', async () => {
  const onApply = jest.fn().mockRejectedValue(new Error('offline'));
  const callbacks = setup({ onApply });
  userEvent.selectOptions(
    screen.getByRole('combobox', { name: '冻结到哪一列' }),
    'profit',
  );
  userEvent.click(screen.getByRole('button', { name: /^使\s*用$/ }));
  await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  expect(callbacks.onHide).not.toHaveBeenCalled();
  expect(screen.getByRole('combobox', { name: '冻结到哪一列' })).toHaveValue(
    'profit',
  );
});

test('restoring system defaults uses the same persistence path', async () => {
  const onApply = jest.fn().mockResolvedValue(undefined);
  const callbacks = setup({ onApply });
  userEvent.click(screen.getByRole('button', { name: '恢复系统默认' }));
  await waitFor(() => expect(callbacks.onHide).toHaveBeenCalledTimes(1));
  expect(onApply).toHaveBeenCalledWith(null, null);
  expect(callbacks.onSaveTemplate).not.toHaveBeenCalled();
});
