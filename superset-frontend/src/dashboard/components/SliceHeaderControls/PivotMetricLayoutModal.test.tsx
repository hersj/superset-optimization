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

  userEvent.click(screen.getByRole('button', { name: '2列' }));
  userEvent.click(screen.getByRole('checkbox', { name: '同步本看板透视图' }));
  expect(onSaveDashboardLayout).not.toHaveBeenCalled();
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

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

  userEvent.click(screen.getByRole('checkbox', { name: '同步本看板透视图' }));
  expect(onDisableDashboardLayout).not.toHaveBeenCalled();
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(onDisableDashboardLayout).toHaveBeenCalledTimes(1),
  );
  expect(
    screen.queryByRole('button', { name: '恢复系统默认' }),
  ).not.toBeInTheDocument();
});

test('existing sync uses the same save action and preserves drafts on failure', async () => {
  const layout = {
    version: 1,
    ordered_metric_ids: ['sales'],
    hidden_metric_ids: [],
    frozen_column_count: 2,
  };
  const onSaveDashboardLayout = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  const onSaveTemplate = jest.fn();
  const onHide = jest.fn();
  render(
    <PivotMetricLayoutModal
      show
      metrics={['sales']}
      initialLayout={layout}
      dashboardSharedLayout={layout}
      templates={[]}
      activeSlot={null}
      onHide={onHide}
      onApply={jest.fn()}
      onSaveTemplate={onSaveTemplate}
      onSetDefault={jest.fn()}
      onDeleteTemplate={jest.fn()}
      onSaveDashboardLayout={onSaveDashboardLayout}
    />,
  );
  userEvent.click(screen.getByRole('button', { name: '自定义' }));
  const count = screen.getByRole('spinbutton', { name: '冻结左侧列数' });
  userEvent.clear(count);
  userEvent.type(count, '5');
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSaveDashboardLayout).toHaveBeenCalledTimes(1));
  expect(onHide).not.toHaveBeenCalled();
  expect(count).toHaveValue(5);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onHide).toHaveBeenCalledTimes(1));
  expect(onSaveDashboardLayout).toHaveBeenLastCalledWith({
    ...layout,
    frozen_column_count: 5,
  });
  expect(onSaveTemplate).not.toHaveBeenCalled();
});

test('cancel never persists a draft sync choice or freeze count', () => {
  const onSaveDashboardLayout = jest.fn();
  const onSaveTemplate = jest.fn();
  const onHide = jest.fn();
  render(
    <PivotMetricLayoutModal
      show
      metrics={['sales']}
      templates={[]}
      activeSlot={null}
      onHide={onHide}
      onApply={jest.fn()}
      onSaveTemplate={onSaveTemplate}
      onSetDefault={jest.fn()}
      onDeleteTemplate={jest.fn()}
      onSaveDashboardLayout={onSaveDashboardLayout}
    />,
  );
  userEvent.click(screen.getByRole('button', { name: '3列' }));
  userEvent.click(screen.getByRole('checkbox', { name: '同步本看板透视图' }));
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onHide).toHaveBeenCalledTimes(1);
  expect(onSaveDashboardLayout).not.toHaveBeenCalled();
  expect(onSaveTemplate).not.toHaveBeenCalled();
});
