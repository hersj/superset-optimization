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
import { useState } from 'react';
import { ensureIsArray, LegendState } from '@superset-ui/core';
import {
  Button,
  Checkbox,
  Input,
  Popover,
  Tooltip,
} from '@superset-ui/core/components';
import { styled } from '@apache-superset/core/theme';
import type { EChartsCoreOption } from 'echarts/core';
import type { RefObject } from 'react';
import type { EchartsHandler } from '../types';
import { getLegendStateChange, LegendGroupMetadata } from '../utils/series';

const Toolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 32px;
`;
const Panel = styled.div`
  width: min(460px, calc(100vw - 48px));
  .legend-actions {
    display: flex;
    gap: 8px;
    margin: 8px 0;
  }
  .legend-list {
    max-height: 320px;
    overflow-y: auto;
  }
  .legend-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .ant-checkbox-wrapper {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }
`;

type Props = {
  options: EChartsCoreOption;
  groups: LegendGroupMetadata;
  onChange: (payload: { selected: LegendState }) => void;
  echartRef: RefObject<EchartsHandler | null>;
  itemLabel?: string;
  fullLabels?: Record<string, string>;
};

export default function LegendSelector({
  options,
  groups,
  onChange,
  echartRef,
  itemLabel = '指标',
  fullLabels,
}: Props) {
  const [search, setSearch] = useState('');
  const legend = ensureIsArray(options.legend)[0] as
    | {
        show?: boolean;
        data?: Array<string | { name?: string }>;
        selected?: LegendState;
      }
    | undefined;
  const names = (legend?.data ?? [])
    .map(item => (typeof item === 'string' ? item : item.name))
    .filter((name): name is string => Boolean(name));
  if (!names.length || legend?.show === false) return null;
  const selected = Object.fromEntries(
    names.map(name => [
      name,
      legend?.selected?.[groups.stateKeys[name]] ??
        legend?.selected?.[name] ??
        true,
    ]),
  );
  const label = (name: string) => {
    const text = groups.labels[name] ?? name;
    return names.some(
      other => other !== name && (groups.labels[other] ?? other) === text,
    )
      ? `${text}（${groups.offsets?.[name] ?? name}）`
      : text;
  };
  const matches = names.filter(name =>
    `${label(name)} ${fullLabels?.[name] ?? name}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const highlight = (name: string, active: boolean) => {
    echartRef.current?.getEchartInstance()?.dispatchAction({
      type: active ? 'highlight' : 'downplay',
      batch: (groups.groups[name] ?? [name]).map(seriesName => ({
        seriesName,
      })),
    });
  };
  return (
    <Toolbar>
      <Popover
        trigger="click"
        placement="bottomRight"
        onOpenChange={open => {
          setSearch('');
          if (!open)
            echartRef.current
              ?.getEchartInstance()
              ?.dispatchAction({ type: 'downplay' });
        }}
        content={
          <Panel aria-label={`${itemLabel}选择面板`}>
            <Input
              aria-label={`搜索${itemLabel}`}
              placeholder={`搜索${itemLabel}完整名称或尾码`}
              allowClear
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            <div className="legend-actions">
              <Button
                buttonSize="small"
                onClick={() =>
                  onChange({
                    selected: Object.fromEntries(
                      names.map(name => [
                        name,
                        itemLabel === 'SKU' && !matches.includes(name)
                          ? selected[name]
                          : true,
                      ]),
                    ),
                  })
                }
              >
                {itemLabel === 'SKU' ? '全选结果' : '显示全部'}
              </Button>
              {itemLabel === 'SKU' && (
                <Button
                  buttonSize="small"
                  onClick={() =>
                    onChange({
                      selected: {
                        ...selected,
                        ...Object.fromEntries(
                          matches.map(name => [name, false]),
                        ),
                      },
                    })
                  }
                >
                  取消结果
                </Button>
              )}
              <Button
                buttonSize="small"
                onClick={() =>
                  onChange({
                    selected: Object.fromEntries(
                      names.map(name => [
                        name,
                        itemLabel === 'SKU' && !matches.includes(name)
                          ? selected[name]
                          : !selected[name],
                      ]),
                    ),
                  })
                }
              >
                {itemLabel === 'SKU' ? '反选结果' : '反选全部'}
              </Button>
              <span>
                {matches.length} / {names.length}
              </span>
            </div>
            <div className="legend-list">
              {matches.length === 0 && (
                <div role="status">没有匹配的{itemLabel}</div>
              )}
              {matches.map(name => (
                <div
                  className="legend-row"
                  key={name}
                  onMouseEnter={() => highlight(name, true)}
                  onMouseLeave={() => highlight(name, false)}
                >
                  <Checkbox
                    aria-label={fullLabels?.[name]}
                    checked={selected[name]}
                    onChange={event =>
                      onChange({
                        selected: { ...selected, [name]: event.target.checked },
                      })
                    }
                  >
                    <Tooltip title={fullLabels?.[name]}>
                      <span>{label(name)}</span>
                    </Tooltip>
                  </Checkbox>
                  <Button
                    buttonSize="small"
                    aria-label={`仅看此项：${fullLabels?.[name] ?? label(name)}`}
                    onClick={() =>
                      onChange({
                        selected: getLegendStateChange(
                          selected,
                          groups,
                          name,
                          'focus',
                        ),
                      })
                    }
                  >
                    仅看此项
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        }
      >
        <Button buttonSize="small">
          {itemLabel}选择（{Object.values(selected).filter(Boolean).length}/
          {names.length}）
        </Button>
      </Popover>
    </Toolbar>
  );
}
