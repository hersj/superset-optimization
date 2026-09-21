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
import { useTheme } from '@apache-superset/core/theme';
import { GenericDataType } from '@apache-superset/core/common';
import {
  COLUMN_NAME_ALIASES,
  ControlComponentProps,
} from '@superset-ui/chart-controls';
import { Icons } from '@superset-ui/core/components';
import ColumnConfigItem from './ColumnConfigItem';
import {
  ColumnConfigInfo,
  ColumnConfig,
  ColumnConfigFormLayout,
} from './types';
import { DEFAULT_CONFIG_FORM_LAYOUT } from './constants';
import ControlHeader from '../../ControlHeader';

export type ColumnConfigControlProps<T extends ColumnConfig> =
  ControlComponentProps<Record<string, T>> & {
    columnsPropsObject?: {
      colnames: string[];
      coltypes: GenericDataType[];
      childColumnMap?: Record<string, boolean>;
      timeComparisonColumnMap?: Record<string, boolean>;
    };
    configFormLayout?: ColumnConfigFormLayout;
    appliedColumnNames?: string[];
    enableColumnManager?: boolean;
    width?: number | string;
    height?: number | string;
  };

/**
 * Max number of columns to show by default.
 */
const MAX_NUM_COLS = 10;

/**
 * Add per-column config to queried results.
 */
export default function ColumnConfigControl<T extends ColumnConfig>({
  columnsPropsObject,
  appliedColumnNames = [],
  value,
  onChange,
  configFormLayout = DEFAULT_CONFIG_FORM_LAYOUT,
  width,
  height,
  enableColumnManager = false,
  ...props
}: ColumnConfigControlProps<T>) {
  const { colnames: _colnames, coltypes: _coltypes } = columnsPropsObject || {};
  let colnames: string[] = [];
  let coltypes: GenericDataType[] = [];
  if (appliedColumnNames.length === 0) {
    colnames = [...(_colnames || [])];
    coltypes = _coltypes || [];
  } else {
    const appliedCol = new Set(appliedColumnNames);
    _colnames?.forEach((col, idx) => {
      if (appliedCol.has(col)) {
        colnames.push(col);
        coltypes.push(_coltypes?.[idx] as GenericDataType);
      }
    });
  }
  const theme = useTheme();
  const configFor = (key: string): ColumnConfig =>
    value?.[key] ||
    (enableColumnManager &&
      key.startsWith('Main ') &&
      value?.[`主项 ${key.slice(5)}`]) ||
    {};
  if (enableColumnManager) {
    const types = Object.fromEntries(
      colnames.map((col, index) => [col, coltypes[index]]),
    );
    colnames.sort(
      (a, b) =>
        Number(configFor(a).displayOrder ?? Number.MAX_SAFE_INTEGER) -
        Number(configFor(b).displayOrder ?? Number.MAX_SAFE_INTEGER),
    );
    coltypes = colnames.map(col => types[col]);
  }

  const columnConfigs = useMemo(() => {
    const configs: Record<string, ColumnConfigInfo> = {};
    colnames?.forEach((col, idx) => {
      configs[col] = {
        name:
          enableColumnManager && col.startsWith('Main ')
            ? `${t('Main')} ${col.slice(5)}`
            : COLUMN_NAME_ALIASES[col] || col,
        type: coltypes?.[idx],
        config: configFor(col),
        isChildColumn: columnsPropsObject?.childColumnMap?.[col] ?? false,
        isTimeComparisonColumn:
          columnsPropsObject?.timeComparisonColumnMap?.[col] ?? false,
      };
    });
    return configs;
  }, [value, colnames, coltypes, columnsPropsObject?.childColumnMap]);

  const [showAllColumns, setShowAllColumns] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string>();

  const getColumnInfo = (col: string) => columnConfigs[col] || {};

  const setColumnConfig = (col: string, config: T) => {
    if (onChange) {
      onChange({
        ...value,
        [col]: config,
      });
    }
  };

  if (!colnames || colnames.length === 0) return null;

  const moveColumn = (from: string, to: string) => {
    const order = colnames.filter(col => col !== from);
    order.splice(colnames.indexOf(to), 0, from);
    onChange?.({
      ...value,
      ...Object.fromEntries(
        order.map((col, displayOrder) => [
          col,
          { ...configFor(col), displayOrder },
        ]),
      ),
    } as Record<string, T>);
  };
  const needShowMoreButton =
    !enableColumnManager && colnames.length > MAX_NUM_COLS + 2;
  const cols =
    needShowMoreButton && !showAllColumns
      ? colnames.slice(0, MAX_NUM_COLS)
      : colnames.filter(
          col =>
            !enableColumnManager ||
            `${col} ${configFor(col).customColumnName || ''}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        );

  return (
    <>
      <ControlHeader {...props} />
      {enableColumnManager && (
        <>
          <input
            aria-label="搜索列"
            placeholder="搜索列"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
          <label>
            <input
              type="checkbox"
              aria-label="选择搜索结果"
              checked={
                cols.length > 0 && cols.every(col => selected.includes(col))
              }
              onChange={e => setSelected(e.target.checked ? cols : [])}
            />
            选择搜索结果
          </label>
          <select
            aria-label="批量数字格式"
            value=""
            disabled={!selected.length}
            onChange={e => {
              const format = e.target.value;
              const updates = selected.filter(
                col =>
                  coltypes[colnames.indexOf(col)] === GenericDataType.Numeric,
              );
              onChange?.({
                ...value,
                ...Object.fromEntries(
                  updates.map(col => [
                    col,
                    {
                      ...configFor(col),
                      d3NumberFormat: format,
                      d3SmallNumberFormat: format,
                    },
                  ]),
                ),
              } as Record<string, T>);
            }}
          >
            <option value="">批量设置数字格式</option>
            <option value="CN_WANYI">自动万/亿</option>
            <option value="CN_WAN">万</option>
            <option value=",.2f">千分位，两位小数</option>
            <option value=".2%">百分比</option>
          </select>
        </>
      )}
      <div
        css={{
          border: `1px solid ${theme.colorBorder}`,
          borderRadius: theme.borderRadius,
          ...(enableColumnManager && { maxHeight: 400, overflowY: 'auto' }),
        }}
      >
        {cols.map(key => {
          const col = getColumnInfo(key);
          return (
            <div
              key={key}
              draggable={enableColumnManager}
              onDragStart={() => setDragging(key)}
              onDragEnd={() => setDragging(undefined)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (dragging && dragging !== key) moveColumn(dragging, key);
                setDragging(undefined);
              }}
            >
              {enableColumnManager && (
                <div>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${key}`}
                    checked={selected.includes(key)}
                    onChange={e =>
                      setSelected(
                        e.target.checked
                          ? [...selected, key]
                          : selected.filter(k => k !== key),
                      )
                    }
                  />
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`显示 ${key}`}
                      checked={col.config.visible !== false}
                      onChange={e =>
                        setColumnConfig(key, {
                          ...col.config,
                          visible: e.target.checked,
                        } as T)
                      }
                    />
                    显示
                  </label>
                  <button
                    type="button"
                    aria-label={`上移 ${key}`}
                    disabled={colnames.indexOf(key) === 0}
                    onClick={() =>
                      moveColumn(key, colnames[colnames.indexOf(key) - 1])
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`下移 ${key}`}
                    disabled={colnames.indexOf(key) === colnames.length - 1}
                    onClick={() =>
                      moveColumn(key, colnames[colnames.indexOf(key) + 1])
                    }
                  >
                    ↓
                  </button>
                </div>
              )}
              <ColumnConfigItem
                column={col}
                onChange={config => setColumnConfig(key, config as T)}
                configFormLayout={
                  col.isTimeComparisonColumn
                    ? ({
                        [col.type ?? GenericDataType.String]: [
                          {
                            tab: 'General',
                            children: [
                              ['customColumnName'],
                              ['displayTypeIcon'],
                              ['visible'],
                            ],
                          },
                          ...(configFormLayout?.[
                            col.type ?? GenericDataType.String
                          ] ?? []),
                        ],
                      } as ColumnConfigFormLayout)
                    : configFormLayout
                }
                width={width}
                height={height}
              />
            </div>
          );
        })}
        {needShowMoreButton && (
          <div
            role="button"
            tabIndex={-1}
            css={{
              padding: theme.sizeUnit * 2,
              textAlign: 'center',
              cursor: 'pointer',
              fontSize: theme.fontSizeXS,
              color: theme.colorTextLabel,
              ':hover': {
                backgroundColor: theme.colorFillContentHover,
              },
            }}
            onClick={() => setShowAllColumns(!showAllColumns)}
          >
            {showAllColumns ? (
              <>
                <Icons.UpOutlined /> &nbsp; {t('Show less columns')}
              </>
            ) : (
              <>
                <Icons.DownOutlined /> &nbsp; {t('Show all columns')}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
