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
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useEffect, useMemo, useState } from 'react';
import type { QueryFormMetric } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { css, styled } from '@apache-superset/core/theme';
import {
  readPivotFreezeColumns,
  type PivotFreezeColumn,
} from '../../../../plugins/plugin-chart-pivot-table/src/react-pivottable/freezePivotColumns';
import {
  Button,
  Checkbox,
  Icons,
  Input,
  Modal,
} from '@superset-ui/core/components';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  PersonalChartLayout,
  PersonalChartTemplate,
} from 'src/dashboard/actions/personalChartLayout';
import {
  buildMetricDescriptors,
  type MetricMovePosition,
  moveMetricId,
  PIVOT_METRIC_LAYOUT_VERSION,
  reconcileMetricLayout,
} from '../../../../plugins/plugin-chart-pivot-table/src/metricLayout';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
  max-height: 420px;
  overflow-y: auto;
`;

const Row = styled.div<{ isDragging: boolean }>`
  ${({ theme, isDragging }) => css`
    display: flex;
    align-items: center;
    gap: ${theme.sizeUnit * 2}px;
    padding: ${theme.sizeUnit * 3}px;
    border: 1px solid ${theme.colorBorder};
    border-radius: ${theme.borderRadius}px;
    background: ${isDragging
      ? theme.colorFillSecondary
      : theme.colorBgContainer};
  `}
`;

const DragHandle = styled.button`
  ${({ theme }) => css`
    border: 0;
    background: transparent;
    color: ${theme.colorTextLabel};
    cursor: grab;
    padding: 0;
    display: inline-flex;
    align-items: center;
  `}
`;

const MetricLabel = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

const Description = styled.div`
  ${({ theme }) => css`
    margin-bottom: ${theme.sizeUnit * 3}px;
    color: ${theme.colorTextSecondary};
  `}
`;

const TemplateRow = styled.div`
  ${({ theme }) => css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    gap: ${theme.sizeUnit * 2}px;
    align-items: center;
    margin-bottom: ${theme.sizeUnit * 2}px;
  `}
`;

const TemplateSection = styled.div`
  ${({ theme }) => css`
    border-bottom: 1px solid ${theme.colorBorder};
    margin-bottom: ${theme.sizeUnit * 4}px;
    padding-bottom: ${theme.sizeUnit * 3}px;
  `}
`;

type SortableMetricRowProps = {
  id: string;
  label: string;
  checked: boolean;
  isFirst: boolean;
  isLast: boolean;
  disableToggle: boolean;
  disableReorder: boolean;
  onToggle: (id: string) => void;
  onMove: (id: string, position: MetricMovePosition) => void;
};

const SortableMetricRow = ({
  id,
  label,
  checked,
  isFirst,
  isLast,
  disableToggle,
  disableReorder,
  onToggle,
  onMove,
}: SortableMetricRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: disableReorder });

  return (
    <Row
      ref={setNodeRef}
      isDragging={isDragging}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <DragHandle
        type="button"
        aria-label={t('Drag to reorder metric')}
        disabled={disableReorder}
        {...attributes}
        {...listeners}
      >
        <Icons.MenuOutlined />
      </DragHandle>
      <Checkbox
        checked={checked}
        disabled={disableToggle}
        onChange={() => onToggle(id)}
      />
      <MetricLabel title={label}>{label}</MetricLabel>
      <Button
        buttonStyle="link"
        aria-label={t('Move metric to first')}
        disabled={isFirst || disableReorder}
        onClick={() => onMove(id, 'first')}
      >
        {t('置顶')}
      </Button>
      <Button
        buttonStyle="link"
        aria-label={t('Move metric up')}
        disabled={isFirst || disableReorder}
        onClick={() => onMove(id, 'up')}
      >
        {t('上移')}
      </Button>
      <Button
        buttonStyle="link"
        aria-label={t('Move metric down')}
        disabled={isLast || disableReorder}
        onClick={() => onMove(id, 'down')}
      >
        {t('下移')}
      </Button>
      <Button
        buttonStyle="link"
        aria-label={t('Move metric to last')}
        disabled={isLast || disableReorder}
        onClick={() => onMove(id, 'last')}
      >
        {t('置底')}
      </Button>
    </Row>
  );
};

interface PivotMetricLayoutModalProps {
  show: boolean;
  chartId?: number;
  metrics: QueryFormMetric[];
  initialLayout?: PersonalChartLayout;
  dashboardSharedLayout?: PersonalChartLayout | null;
  templates: PersonalChartTemplate[];
  legacyTemplates?: PersonalChartTemplate[];
  activeSlot: 1 | 2 | 3 | null;
  isSaving?: boolean;
  onHide: () => void;
  onApply: (
    layout: PersonalChartLayout | null,
    slot: 1 | 2 | 3 | null,
  ) => Promise<void> | void;
  onSaveTemplate: (
    slot: 1 | 2 | 3,
    name: string,
    layout: PersonalChartLayout,
  ) => Promise<void> | void;
  onSetDefault: (slot: 1 | 2 | 3) => Promise<void> | void;
  onDeleteTemplate: (slot: 1 | 2 | 3) => Promise<void> | void;
  onSaveDashboardLayout?: (layout: PersonalChartLayout) => Promise<void> | void;
  onDisableDashboardLayout?: () => Promise<void> | void;
}

export default function PivotMetricLayoutModal({
  show,
  chartId,
  metrics,
  initialLayout,
  dashboardSharedLayout,
  templates,
  legacyTemplates = [],
  activeSlot,
  isSaving = false,
  onHide,
  onApply,
  onSaveTemplate,
  onSetDefault,
  onDeleteTemplate,
}: PivotMetricLayoutModalProps) {
  /*
   * 同一用户、同一看板共用三个模板；保存只更新库，使用会记住当前图表布局。
   * 默认布局保存独立快照，更新/删除源模板不覆盖已应用布局。
   * 草稿仅在弹窗内；取消不写入，保存失败保留草稿。旧图表模板只读保留。
   * 冻结保存稳定列标识，旧数字配置仅在能解析实际表头时转换。
   */
  const metricDescriptors = useMemo(
    () => buildMetricDescriptors(metrics),
    [metrics],
  );
  const [orderedMetricIds, setOrderedMetricIds] = useState<string[]>([]);
  const [hiddenMetricIds, setHiddenMetricIds] = useState<string[]>([]);
  const [frozenColumnKey, setFrozenColumnKey] = useState<
    string | null | undefined
  >(null);
  const [freezeColumns, setFreezeColumns] = useState<PivotFreezeColumn[]>([]);
  const [search, setSearch] = useState('');
  const [saveSlot, setSaveSlot] = useState<1 | 2 | 3 | null>(null);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (!show) {
      return;
    }
    const reconciled = reconcileMetricLayout(metricDescriptors, initialLayout, {
      includeMissingMetrics: true,
      includeMissingMetricsVisible: true,
    });
    setOrderedMetricIds(reconciled.orderedMetricIds);
    setHiddenMetricIds(reconciled.hiddenMetricIds);
    const table = document.querySelector<HTMLTableElement>(
      `#chart-id-${chartId} .pvtTable`,
    );
    const columns = table ? readPivotFreezeColumns(table) : [];
    setFreezeColumns(columns);
    setFrozenColumnKey(
      initialLayout?.frozen_column_key !== undefined
        ? initialLayout.frozen_column_key
        : columns.find(
            column => column.count === initialLayout?.frozen_column_count,
          )?.key || (initialLayout?.frozen_column_count ? undefined : null),
    );
    setSearch('');
    const selected = templates.find(template => template.slot === activeSlot);
    const nextSlot =
      activeSlot ||
      ([1, 2, 3] as const).find(slot =>
        templates.every(template => template.slot !== slot),
      ) ||
      null;
    setSaveSlot(nextSlot);
    setTemplateName(
      selected?.name ||
        (nextSlot ? t('模板 %(slot)s', { slot: nextSlot }) : ''),
    );
  }, [
    show,
    chartId,
    initialLayout,
    dashboardSharedLayout,
    metricDescriptors,
    templates,
    activeSlot,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const orderedMetrics = useMemo(() => {
    const metricsById = new Map(
      metricDescriptors.map(metric => [metric.id, metric]),
    );
    return orderedMetricIds
      .map(metricId => metricsById.get(metricId))
      .filter(Boolean);
  }, [metricDescriptors, orderedMetricIds]);

  const visibleMetricCount = orderedMetricIds.filter(
    metricId => !hiddenMetricIds.includes(metricId),
  ).length;
  const matchingMetrics = orderedMetrics.filter(metric =>
    metric?.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const availableFreezeColumns = freezeColumns.filter(
    column =>
      (!column.metricId || !hiddenMetricIds.includes(column.metricId)) &&
      freezeColumns.filter(other => other.key === column.key).length === 1,
  );

  const setMatchingVisibility = (visible: boolean) => {
    const matchingIds = new Set(matchingMetrics.map(metric => metric!.id));
    setHiddenMetricIds(current => {
      const next = visible
        ? current.filter(id => !matchingIds.has(id))
        : [...new Set([...current, ...matchingIds])];
      return next.length < orderedMetricIds.length ? next : current;
    });
  };

  const handleToggle = (metricId: string) => {
    setHiddenMetricIds(currentHiddenMetricIds => {
      if (currentHiddenMetricIds.includes(metricId)) {
        return currentHiddenMetricIds.filter(id => id !== metricId);
      }
      if (visibleMetricCount <= 1) {
        return currentHiddenMetricIds;
      }
      return [...currentHiddenMetricIds, metricId];
    });
  };

  const handleMove = (metricId: string, position: MetricMovePosition) => {
    setOrderedMetricIds(currentMetricIds =>
      moveMetricId(currentMetricIds, metricId, position),
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    setOrderedMetricIds(currentOrderedMetricIds => {
      const oldIndex = currentOrderedMetricIds.indexOf(String(active.id));
      const newIndex = currentOrderedMetricIds.indexOf(String(over.id));
      return arrayMove(currentOrderedMetricIds, oldIndex, newIndex);
    });
  };

  const draftLayout = (): PersonalChartLayout => ({
    ordered_metric_ids: orderedMetricIds,
    hidden_metric_ids: hiddenMetricIds,
    frozen_column_count:
      frozenColumnKey === undefined
        ? initialLayout?.frozen_column_count || 0
        : 0,
    ...(frozenColumnKey !== undefined
      ? { frozen_column_key: frozenColumnKey }
      : {}),
    version: PIVOT_METRIC_LAYOUT_VERSION,
  });

  const canPersistTemplate = metricDescriptors.every(
    metric => metric.canPersist,
  );

  const chooseSlot = (slot: 1 | 2 | 3) => {
    const template = templates.find(item => item.slot === slot);
    setSaveSlot(slot);
    setTemplateName(template?.name || t('模板 %(slot)s', { slot }));
  };

  const handleSave = async () => {
    if (!saveSlot || !canPersistTemplate) {
      return;
    }
    const nextLayout = draftLayout();
    try {
      await onSaveTemplate(
        saveSlot,
        templateName.trim() || t('模板 %(slot)s', { slot: saveSlot }),
        nextLayout,
      );
    } catch {
      // The owning chart displays the server error; preserve this local draft.
    }
  };

  const handleApply = async (
    layout: PersonalChartLayout | null,
    slot: 1 | 2 | 3 | null,
  ) => {
    try {
      await onApply(layout, slot);
      onHide();
    } catch {
      // The owning chart reports the error; keep the dialog and current layout.
    }
  };

  const handleSetDefault = async (template: PersonalChartTemplate) => {
    try {
      await onSetDefault(template.slot);
    } catch {
      // The owning chart displays the server error; do not alter the session view.
    }
  };

  const handleDelete = async (template: PersonalChartTemplate) => {
    try {
      await onDeleteTemplate(template.slot);
      if (template.slot === saveSlot) {
        setTemplateName(t('模板 %(slot)s', { slot: saveSlot }));
      }
    } catch {
      // The owning chart displays the server error; do not alter the session view.
    }
  };

  /* The modal draft is intentionally local: close/cancel/leave never writes it. */
  const handleDiscard = () => {
    onHide();
  };

  /* Remember the system-default snapshot while preserving saved templates. */
  const handleReset = async () => {
    await handleApply(null, null);
  };

  return (
    <Modal
      show={show}
      title={t('Customize columns')}
      onHide={onHide}
      responsive
      footer={
        <>
          {!dashboardSharedLayout && (
            <Button onClick={handleReset} disabled={isSaving}>
              {t('恢复系统默认')}
            </Button>
          )}
          <Button onClick={handleDiscard} disabled={isSaving}>
            {t('Cancel')}
          </Button>
          <Button
            buttonStyle="primary"
            onClick={handleSave}
            loading={isSaving}
            disabled={!saveSlot || !canPersistTemplate}
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <Description>
        {t(
          '拖动或使用置顶、上移、下移、置底可调整指标顺序；取消勾选可隐藏指标。修改内容仅是草稿；保存更新模板库，点击使用后会记住当前图表布局，刷新后自动恢复。',
        )}
      </Description>
      <label>
        {t('冻结到哪一列')}
        <select
          aria-label={t('冻结到哪一列')}
          value={
            frozenColumnKey === undefined ? '__legacy__' : frozenColumnKey || ''
          }
          disabled={isSaving}
          onChange={event => setFrozenColumnKey(event.target.value || null)}
        >
          <option value="">{t('不冻结')}</option>
          {frozenColumnKey === undefined && (
            <option value="__legacy__" disabled>
              {t('保留原冻结设置（请选择列名以更新）')}
            </option>
          )}
          {availableFreezeColumns.map(column => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
          {frozenColumnKey &&
            !availableFreezeColumns.some(
              column => column.key === frozenColumnKey,
            ) && (
              <option value={frozenColumnKey}>
                {t('原冻结边界列当前不存在（不冻结）')}
              </option>
            )}
        </select>
      </label>
      <Description>
        {t(
          '冻结所选列及其左侧可见列；排序和模板切换后跟随该列。隐藏或缺少边界列时不冻结。',
        )}
      </Description>
      {!canPersistTemplate && (
        <Description>
          {t(
            '当前指标存在重复或缺少稳定标识，仍可查看和调整，但不能保存为个人模板。',
          )}
        </Description>
      )}
      <TemplateSection>
        <Description>
          <strong>{t('本看板个人模板库（最多3个）')}</strong>
          <br />
          {t(
            '同看板透视图共用，仅本人可见。保存只更新模板库；点击使用后会应用并记住当前图表布局，设为默认也只影响当前图表。',
          )}
        </Description>
        {([1, 2, 3] as const).map(slot => {
          const template = templates.find(item => item.slot === slot);
          return (
            <TemplateRow key={slot}>
              <Input
                aria-label={t('模板 %(slot)s 名称', { slot })}
                value={
                  saveSlot === slot
                    ? templateName
                    : template?.name || t('模板 %(slot)s', { slot })
                }
                onFocus={() => chooseSlot(slot)}
                onChange={event => {
                  chooseSlot(slot);
                  setTemplateName(event.target.value);
                }}
                disabled={isSaving}
              />
              {template && (
                <Button
                  onClick={() => handleApply(template.layout, template.slot)}
                  disabled={isSaving}
                >
                  {t('使用')}
                </Button>
              )}
              {template && (
                <Button
                  onClick={() => handleSetDefault(template)}
                  disabled={isSaving}
                >
                  {template.is_default ? t('默认') : t('设为默认')}
                </Button>
              )}
              {template && (
                <Button
                  onClick={() => handleDelete(template)}
                  disabled={isSaving}
                >
                  {t('Delete')}
                </Button>
              )}
            </TemplateRow>
          );
        })}
      </TemplateSection>
      {legacyTemplates.length > 0 && (
        <details>
          <summary>{t('旧图表模板（保留）')}</summary>
          {legacyTemplates.map(template => (
            <div key={template.slot}>
              {template.name}
              <Button
                onClick={() => handleApply(template.layout, null)}
                disabled={isSaving}
              >
                {t('使用旧模板')}
              </Button>
            </div>
          ))}
          <Description>
            {t('旧模板不会删除；使用后可重新打开，将布局保存到共享模板库。')}
          </Description>
        </details>
      )}
      <Input
        aria-label={t('搜索指标列')}
        placeholder={t('搜索指标列')}
        value={search}
        onChange={event => setSearch(event.target.value)}
      />
      <Button onClick={() => setMatchingVisibility(true)}>
        {t('显示匹配列')}
      </Button>
      <Button onClick={() => setMatchingVisibility(false)}>
        {t('隐藏匹配列')}
      </Button>
      {search.trim() && (
        <Description>{t('清空搜索后可调整列顺序。')}</Description>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={matchingMetrics.map(metric => metric!.id)}
          strategy={verticalListSortingStrategy}
        >
          <List>
            {matchingMetrics.map(metric => (
              <SortableMetricRow
                key={metric!.id}
                id={metric!.id}
                label={metric!.label}
                checked={!hiddenMetricIds.includes(metric!.id)}
                isFirst={orderedMetricIds.indexOf(metric!.id) === 0}
                isLast={
                  orderedMetricIds.indexOf(metric!.id) ===
                  orderedMetrics.length - 1
                }
                disableToggle={
                  !hiddenMetricIds.includes(metric!.id) &&
                  visibleMetricCount <= 1
                }
                disableReorder={Boolean(search.trim())}
                onToggle={handleToggle}
                onMove={handleMove}
              />
            ))}
          </List>
        </SortableContext>
      </DndContext>
    </Modal>
  );
}
