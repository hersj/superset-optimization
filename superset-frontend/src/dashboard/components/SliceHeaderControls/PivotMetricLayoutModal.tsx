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
import { Button, Checkbox, Icons, Modal } from '@superset-ui/core/components';
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
import type { PersonalChartLayout } from 'src/dashboard/actions/personalChartLayout';
import {
  buildMetricDescriptors,
  isDefaultMetricLayout,
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
    background: ${isDragging ? theme.colorFillSecondary : theme.colorBgContainer};
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
  isSaving?: boolean;
  onHide: () => void;
  onSave: (layout: PersonalChartLayout | null) => Promise<void> | void;
}

export default function PivotMetricLayoutModal({
  show,
  metrics,
  initialLayout,
  isSaving = false,
  onHide,
  onSave,
}: PivotMetricLayoutModalProps) {
  const metricDescriptors = useMemo(() => buildMetricDescriptors(metrics), [metrics]);
  const [orderedMetricIds, setOrderedMetricIds] = useState<string[]>([]);
  const [hiddenMetricIds, setHiddenMetricIds] = useState<string[]>([]);

  useEffect(() => {
    if (!show) {
      return;
    }
    const reconciled = reconcileMetricLayout(metricDescriptors, initialLayout);
    setOrderedMetricIds(reconciled.orderedMetricIds);
    setHiddenMetricIds(reconciled.hiddenMetricIds);
  }, [show, initialLayout, metricDescriptors]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const orderedMetrics = useMemo(() => {
    const metricsById = new Map(metricDescriptors.map(metric => [metric.id, metric]));
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

  const handleSave = async () => {
    const nextLayout: PersonalChartLayout = {
      ordered_metric_ids: orderedMetricIds,
      hidden_metric_ids: hiddenMetricIds,
      version: PIVOT_METRIC_LAYOUT_VERSION,
    };
    await onSave(
      isDefaultMetricLayout(metricDescriptors, nextLayout) ? null : nextLayout,
    );
    onHide();
  };

  const handleReset = async () => {
    await onSave(null);
    onHide();
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
            {t('Reset')}
          </Button>
          <Button onClick={onHide} disabled={isSaving}>
            {t('Cancel')}
          </Button>
          <Button
            buttonStyle="primary"
            onClick={handleSave}
            loading={isSaving}
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <Description>
        {t('Drag to reorder metrics and uncheck metrics you want to hide.')}
      </Description>
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
                  !hiddenMetricIds.includes(metric!.id) && visibleMetricCount <= 1
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
