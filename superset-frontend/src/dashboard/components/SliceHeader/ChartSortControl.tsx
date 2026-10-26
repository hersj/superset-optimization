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
import { useMemo, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import {
  getPersonalSortOptions,
  type PersonalChartSort,
  type QueryFormData,
  type DataRecord,
} from '@superset-ui/core';
import {
  Button,
  Icons,
  Input,
  Popover,
  Radio,
  Select,
  Tooltip,
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

const Panel = styled.div`
  width: 300px;
  max-width: calc(100vw - 40px);
`;
const Row = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 0;
`;
const List = styled.div`
  max-height: 260px;
  overflow-y: auto;
`;
const Name = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export function getSortCategoryValues(
  data: DataRecord[],
  field: string,
): string[] {
  return [
    ...new Set(
      data.flatMap(row => {
        const value = row[field];
        return value === null ||
          value === undefined ||
          typeof value === 'object'
          ? []
          : [String(value)];
      }),
    ),
  ];
}

function SortableCategory({
  value,
  index,
  count,
  move,
}: {
  value: string;
  index: number;
  count: number;
  move: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: value });
  return (
    <Row
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Button
        buttonStyle="link"
        buttonSize="small"
        aria-label={t('拖动 %s', value)}
        {...attributes}
        {...listeners}
      >
        <Icons.HolderOutlined />
      </Button>
      <Tooltip title={value}>
        <Name>{value}</Name>
      </Tooltip>
      <Button
        buttonSize="small"
        disabled={index === 0}
        aria-label={t('上移 %s', value)}
        onClick={() => move(index, index - 1)}
      >
        ↑
      </Button>
      <Button
        buttonSize="small"
        disabled={index === count - 1}
        aria-label={t('下移 %s', value)}
        onClick={() => move(index, index + 1)}
      >
        ↓
      </Button>
    </Row>
  );
}

export default function ChartSortControl({
  value,
  formData,
  data = [],
  disabled,
  saving,
  error,
  onChange,
}: {
  value?: PersonalChartSort | null;
  formData: QueryFormData;
  data?: DataRecord[];
  disabled?: boolean;
  saving?: boolean;
  error?: boolean;
  onChange: (sort: PersonalChartSort | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const options = useMemo(() => getPersonalSortOptions(formData), [formData]);
  const mode =
    value?.mode ??
    (options.some(option => option.kind === 'metric') ? 'metric' : 'name');
  const fields = options.filter(
    option => option.kind === (mode === 'metric' ? 'metric' : 'name'),
  );
  const selected = options.find(
    option =>
      option.value === value?.field &&
      option.kind === (mode === 'metric' ? 'metric' : 'name'),
  );
  const field = value?.field ?? fields[0]?.value ?? '';
  const direction = value?.direction ?? 'desc';
  const candidates = useMemo(
    () => getSortCategoryValues(data, field),
    [data, field],
  );
  const customOrder = value?.customOrder ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  if (!options.length) return null;
  const label = value
    ? mode === 'custom'
      ? t('自定义')
      : (selected?.label ?? t('默认'))
    : t('默认');
  const change = (patch: Partial<PersonalChartSort>) =>
    onChange({ mode, field, direction, ...value, ...patch });
  const changeMode = (nextMode: PersonalChartSort['mode']) => {
    const first = options.find(
      option => option.kind === (nextMode === 'metric' ? 'metric' : 'name'),
    );
    if (!first) return;
    const nextField =
      fields.some(option => option.value === field) &&
      (nextMode === 'metric') === (mode === 'metric')
        ? field
        : first.value;
    onChange({
      mode: nextMode,
      field: nextField,
      direction,
      ...(nextMode === 'custom'
        ? { customOrder: getSortCategoryValues(data, nextField).slice(0, 100) }
        : {}),
    });
    setSearch('');
  };
  const move = (from: number, to: number) =>
    change({ customOrder: arrayMove(customOrder, from, to) });
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id)
      move(
        customOrder.indexOf(String(active.id)),
        customOrder.indexOf(String(over.id)),
      );
  };
  const content = (
    <Panel aria-label={t('个人排序面板')}>
      <Radio.Group
        size="small"
        value={mode}
        onChange={e => changeMode(e.target.value)}
        optionType="button"
        options={[
          {
            label: t('按指标'),
            value: 'metric',
            disabled: !options.some(option => option.kind === 'metric'),
          },
          {
            label: t('按名称'),
            value: 'name',
            disabled: !options.some(option => option.kind === 'name'),
          },
          {
            label: t('自定义'),
            value: 'custom',
            disabled: !options.some(option => option.kind === 'name'),
          },
        ]}
      />
      <Row>
        <Select
          aria-label={t('排序字段')}
          style={{ width: '100%' }}
          value={field || undefined}
          onChange={next =>
            change({
              field: next,
              customOrder:
                mode === 'custom'
                  ? getSortCategoryValues(data, next).slice(0, 100)
                  : undefined,
              columnValues: undefined,
            })
          }
          options={fields.map(option => ({
            value: option.value,
            label: option.label + (option.query ? ` (${option.query})` : ''),
          }))}
        />
      </Row>
      {mode !== 'custom' && (
        <Radio.Group
          size="small"
          value={direction}
          onChange={e => change({ direction: e.target.value })}
          optionType="button"
          options={[
            { label: t('↑ 升序'), value: 'asc' },
            { label: t('↓ 降序'), value: 'desc' },
          ]}
        />
      )}
      {mode === 'custom' && (
        <>
          <Select
            mode="multiple"
            maxTagCount={1}
            aria-label={t('选择置顶项')}
            placeholder={t('选择置顶项')}
            style={{ width: '100%' }}
            value={customOrder}
            options={[...new Set([...customOrder, ...candidates])].map(
              name => ({ value: name, label: name }),
            )}
            onChange={order => change({ customOrder: order })}
          />
          <Input
            aria-label={t('搜索自定义顺序')}
            placeholder={t('搜索自定义顺序')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginTop: 8 }}
          />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={dragEnd}
          >
            <SortableContext
              items={customOrder}
              strategy={verticalListSortingStrategy}
            >
              <List>
                {customOrder.map(
                  (name, index) =>
                    name
                      .toLocaleLowerCase()
                      .includes(search.toLocaleLowerCase()) && (
                      <SortableCategory
                        key={name}
                        value={name}
                        index={index}
                        count={customOrder.length}
                        move={move}
                      />
                    ),
                )}
              </List>
            </SortableContext>
          </DndContext>
        </>
      )}
      {value?.columnValues?.length ? (
        <Row>{value.columnValues.join(' / ')}</Row>
      ) : null}
      <Row>
        <span role="status" style={{ flex: 1 }}>
          {error
            ? t('尚未保存，请重试')
            : saving
              ? t('正在保存')
              : t('自动记住 · 仅自己可见')}
        </span>
        <Button
          buttonStyle="link"
          buttonSize="small"
          onClick={() => onChange(null)}
        >
          {t('恢复默认')}
        </Button>
      </Row>
    </Panel>
  );
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      content={content}
    >
      <Button
        buttonSize="small"
        disabled={disabled}
        aria-label={t('排序：%s', label)}
        style={{ marginRight: 4 }}
      >
        <Icons.SortAscendingOutlined />
        {t('排序：%s', label)}
        {value && mode !== 'custom' ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
      </Button>
    </Popover>
  );
}
