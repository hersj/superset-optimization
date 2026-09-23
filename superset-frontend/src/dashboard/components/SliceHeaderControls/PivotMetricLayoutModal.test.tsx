import {
  render,
  screen,
  userEvent,
  waitFor,
} from 'spec/helpers/testing-library';
import PivotMetricLayoutModal from './PivotMetricLayoutModal';

test('saves a frozen left-column count as a personal dashboard layout', async () => {
  const onSaveDashboardLayout = jest.fn().mockResolvedValue(undefined);
  render(
    <PivotMetricLayoutModal
      show
      metrics={['sales', 'profit']}
      templates={[]}
      activeSlot={null}
      onHide={jest.fn()}
      onApply={jest.fn()}
      onSaveTemplate={jest.fn()}
      onSetDefault={jest.fn()}
      onDeleteTemplate={jest.fn()}
      onSaveDashboardLayout={onSaveDashboardLayout}
    />,
  );

  const count = screen.getByRole('spinbutton', { name: '冻结左侧列数' });
  userEvent.clear(count);
  userEvent.type(count, '2');
  userEvent.click(screen.getByRole('button', { name: '应用到本看板' }));

  await waitFor(() =>
    expect(onSaveDashboardLayout).toHaveBeenCalledWith({
      ordered_metric_ids: ['sales', 'profit'],
      hidden_metric_ids: [],
      frozen_column_count: 2,
      version: 1,
    }),
  );
});

test('disabling dashboard sharing restores individual chart templates', async () => {
  const onDisableDashboardLayout = jest.fn().mockResolvedValue(undefined);
  render(
    <PivotMetricLayoutModal
      show
      metrics={['sales']}
      initialLayout={{
        version: 1,
        ordered_metric_ids: ['sales'],
        hidden_metric_ids: [],
      }}
      dashboardSharedLayout={{
        version: 1,
        ordered_metric_ids: ['sales'],
        hidden_metric_ids: [],
      }}
      templates={[]}
      activeSlot={null}
      onHide={jest.fn()}
      onApply={jest.fn()}
      onSaveTemplate={jest.fn()}
      onSetDefault={jest.fn()}
      onDeleteTemplate={jest.fn()}
      onDisableDashboardLayout={onDisableDashboardLayout}
    />,
  );

  userEvent.click(
    screen.getByRole('button', { name: '停用共享，恢复各图表布局' }),
  );
  await waitFor(() =>
    expect(onDisableDashboardLayout).toHaveBeenCalledTimes(1),
  );
  expect(
    screen.queryByRole('button', { name: '恢复系统默认' }),
  ).not.toBeInTheDocument();
});
