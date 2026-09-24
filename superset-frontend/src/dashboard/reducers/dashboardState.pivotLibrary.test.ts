import reducer from './dashboardState';
import {
  setPivotTemplateLibrary,
  type PivotTemplateLibrary,
} from '../actions/personalChartLayout';

test('library updates do not change applied charts; initial defaults are chart-specific', () => {
  const old = {
    version: 1,
    ordered_metric_ids: ['sales'],
    hidden_metric_ids: [],
  };
  const newer = { ...old, frozen_column_key: 'sales' };
  const state = {
    sliceIds: [1, 2],
    personalChartLayouts: { '1': old, '2': old },
  };
  const library: PivotTemplateLibrary = {
    version: 2,
    templates: [{ slot: 1, name: 'new', is_default: false, layout: newer }],
    defaults: { '1': newer },
    legacy_layout: null,
  };
  expect(
    reducer(state, setPivotTemplateLibrary(library)).personalChartLayouts,
  ).toEqual(state.personalChartLayouts);
  const initialized = reducer(state, setPivotTemplateLibrary(library, true));
  expect(initialized.personalChartLayouts?.['1']).toEqual(newer);
  expect(initialized.personalChartLayouts?.['2']).toEqual(old);
  expect(state.personalChartLayouts['1']).toEqual(old);
});
