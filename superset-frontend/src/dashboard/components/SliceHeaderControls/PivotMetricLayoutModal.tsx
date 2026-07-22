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
  disableToggle: boolean;
  onToggle: (id: string) => void;
};

const SortableMetricRow = ({
  id,
  label,
  checked,
  disableToggle,
  onToggle,
}: SortableMetricRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

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
    </Row>
  );
};

interface PivotMetricLayoutModalProps {
  show: boolean;
  metrics: QueryFormMetric[];
  initialLayout?: PersonalChartLayout;
  templates: PersonalChartTemplate[];
  activeSlot: 1 | 2 | 3 | null;
  isSaving?: boolean;
  onHide: () => void;
  onApply: (layout: PersonalChartLayout | null, slot: 1 | 2 | 3 | null) => void;
  onSaveTemplate: (
    slot: 1 | 2 | 3,
    name: string,
    layout: PersonalChartLayout,
  ) => Promise<void> | void;
  onSetDefault: (slot: 1 | 2 | 3) => Promise<void> | void;
  onDeleteTemplate: (slot: 1 | 2 | 3) => Promise<void> | void;
}

export default function PivotMetricLayoutModal({
  show,
  metrics,
  initialLayout,
  templates,
  activeSlot,
  isSaving = false,
  onHide,
  onApply,
  onSaveTemplate,
  onSetDefault,
  onDeleteTemplate,
}: PivotMetricLayoutModalProps) {
  /*
   * 功能审计（可重写规格）：透视表个人列模板编辑弹窗
   * - 功能目的与触发方式：用户从透视表“自定义列”打开后调整列顺序/显隐，并选择使用、保存、设默认或删除三格个人模板。
   * - 输入契约：metrics 是当前图表指标；templates 是当前用户、dashboard、chart 的已持久化 slot；initialLayout 是当前会话布局。
   * - 输出契约：使用系统默认或模板只回调 onApply；保存、设默认、删除通过父组件回调发起服务端写入；关闭不产生草稿写入。
   * - 处理流程：模板区固定显示在指标列表之前，打开时由 initialLayout 生成内存草稿；拖动/勾选仅更新草稿；保存到选定 slot 成功后应用草稿；使用模板立即应用后关闭。
   * - 业务规则：系统默认不删除模板也不清除 is_default；非默认模板使用不修改默认；删除默认后不补选；失败保留当前草稿和会话视图。
   * - 状态与副作用：组件 state 仅保存打开期间草稿、目标 slot 和名称；网络/Redux 副作用由父图表处理。
   * - 外部依赖：metricLayout 的 identity/reconcile 规则、父组件模板 API 回调、dnd-kit。
   * - 异常与边界：至少保留一个可见指标；空 slot 可新建；关闭、取消和离开图表均丢弃未保存草稿。
   * - 不变量与约束：不将草稿写入服务端；应用历史模板时不自动展示新增指标，编辑并保存时必须将新增指标追加到排序且保持隐藏；不以点击模板改变默认。
   * - 验证方式：前端类型检查及模板 API 单测；服务器实机验收三 slot 保存、跨刷新恢复、默认和系统默认语义。
   */
  const metricDescriptors = useMemo(
    () => buildMetricDescriptors(metrics),
    [metrics],
  );
  const [orderedMetricIds, setOrderedMetricIds] = useState<string[]>([]);
  const [hiddenMetricIds, setHiddenMetricIds] = useState<string[]>([]);
  const [saveSlot, setSaveSlot] = useState<1 | 2 | 3 | null>(null);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (!show) {
      return;
    }
    const reconciled = reconcileMetricLayout(metricDescriptors, initialLayout, {
      includeMissingMetrics: true,
    });
    setOrderedMetricIds(reconciled.orderedMetricIds);
    setHiddenMetricIds(reconciled.hiddenMetricIds);
    const selected = templates.find(template => template.slot === activeSlot);
    setSaveSlot(activeSlot);
    setTemplateName(selected?.name || t('模板 1'));
  }, [show, initialLayout, metricDescriptors, templates, activeSlot]);

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
      onApply(nextLayout, saveSlot);
      onHide();
    } catch {
      // The owning chart displays the server error; preserve this local draft.
    }
  };

  const handleUseSystemDefault = () => {
    onApply(null, null);
    onHide();
  };

  const handleUseTemplate = (template: PersonalChartTemplate) => {
    onApply(template.layout, template.slot);
    onHide();
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
      if (template.slot === activeSlot) {
        onApply(null, null);
      }
    } catch {
      // The owning chart displays the server error; do not alter the session view.
    }
  };

  /* The modal draft is intentionally local: close/cancel/leave never writes it. */
  const handleDiscard = () => {
    onHide();
  };

  /* Kept explicit so a system-default view never clears a personal default slot. */
  const handleReset = () => {
    handleUseSystemDefault();
  };

  return (
    <Modal
      show={show}
      title={t('Customize columns')}
      onHide={onHide}
      responsive
      footer={
        <>
          <Button onClick={handleReset} disabled={isSaving}>
            {t('恢复系统默认')}
          </Button>
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
          '拖动可调整指标顺序，取消勾选可隐藏指标。修改内容仅是草稿，保存到模板后才会生效。',
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
          <strong>{t('个人模板')}</strong>
          <br />
          {t('使用模板只影响当前会话；可将当前草稿保存到三个个人模板之一。')}
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
                  onClick={() => handleUseTemplate(template)}
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedMetricIds}
          strategy={verticalListSortingStrategy}
        >
          <List>
            {orderedMetrics.map(metric => (
              <SortableMetricRow
                key={metric!.id}
                id={metric!.id}
                label={metric!.label}
                checked={!hiddenMetricIds.includes(metric!.id)}
                disableToggle={
                  !hiddenMetricIds.includes(metric!.id) &&
                  visibleMetricCount <= 1
                }
                onToggle={handleToggle}
              />
            ))}
          </List>
        </SortableContext>
      </DndContext>
    </Modal>
  );
}
