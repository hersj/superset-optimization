/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 */
import dashboardStateReducer from './dashboardState';
import type { PersonalChartTemplate } from '../actions/personalChartLayout';
import {
  setDashboardPivotLayout,
  setPersonalChartTemplateActiveSlot,
  upsertPersonalChartTemplate,
} from '../actions/personalChartLayout';

test('dashboard-shared layout can be enabled and cleared without deleting chart templates', () => {
  const template = {
    version: 1,
    ordered_metric_ids: ['sales'],
    hidden_metric_ids: [],
    frozen_column_count: 2,
  };
  const original = { personalChartLayouts: { '611': template } };
  const enabled = dashboardStateReducer(
    original,
    setDashboardPivotLayout(template),
  );
  const disabled = dashboardStateReducer(
    enabled,
    setDashboardPivotLayout(null),
  );
  expect(enabled.dashboardPivotLayout).toEqual(template);
  expect(disabled.dashboardPivotLayout).toBeNull();
  expect(disabled.personalChartLayouts?.['611']).toEqual(template);
});

test('default-template upsert does not mutate the previous template objects', () => {
  const existing: PersonalChartTemplate = {
    slot: 1,
    name: '模板 1',
    is_default: true,
    layout: {
      version: 1,
      ordered_metric_ids: ['sales'],
      hidden_metric_ids: [],
    },
  };
  const state: Parameters<typeof dashboardStateReducer>[0] = {
    personalChartTemplates: { '611': [existing] },
  };
  const next = dashboardStateReducer(
    state,
    upsertPersonalChartTemplate(611, {
      ...existing,
      slot: 2,
      name: '模板 2',
      is_default: true,
    }),
  );

  expect(existing.is_default).toBe(true);
  const templates = next.personalChartTemplates;
  expect(templates).toBeDefined();
  if (!templates) {
    throw new Error('personal chart templates should be present');
  }
  const chartTemplates = templates['611'];
  expect(chartTemplates).toBeDefined();
  if (!chartTemplates) {
    throw new Error('chart templates should be present');
  }
  expect(chartTemplates[0]).not.toBe(existing);
  expect(chartTemplates.map(item => item.is_default)).toEqual([false, true]);
});

test('active template slot is session-only and system default clears it', () => {
  const selected = dashboardStateReducer(
    {},
    setPersonalChartTemplateActiveSlot(611, 2),
  );
  const systemDefault = dashboardStateReducer(
    selected,
    setPersonalChartTemplateActiveSlot(611, null),
  );

  expect(selected.personalChartTemplateActiveSlots?.['611']).toBe(2);
  expect(systemDefault.personalChartTemplateActiveSlots?.['611']).toBeNull();
});
