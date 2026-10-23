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
import { useRef, useState, ReactNode, Ref } from 'react';
import { createPortal } from 'react-dom';
import { styled } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import {
  Button,
  Checkbox,
  Input,
  RawAntdSelect as Select,
  type RefSelectProps,
} from '@superset-ui/core/components';
import type { SelectFilterMatchMode } from '../../utils';
import type { SelectValue } from './types';

type Option = { value: string | number | null; label: ReactNode };
type Props = {
  column: string;
  mode: SelectFilterMatchMode;
  allowFuzzyMatch?: boolean;
  matchModeContainer?: HTMLElement | null;
  keyword: string;
  value: SelectValue;
  options: Option[];
  multiple: boolean;
  loading: boolean;
  disabled: boolean;
  inputRef?: Ref<RefSelectProps>;
  onModeChange: (mode: SelectFilterMatchMode) => void;
  onKeywordChange: (value: string, committed: boolean) => void;
  onChange: (value: SelectValue) => void;
  onActiveChange: (open: boolean) => void;
  onClear?: () => void;
};

const Field = styled.div`
  width: 100%;
  min-width: 0;
  position: relative;
  .match-empty-clear {
    position: absolute;
    inset-inline-end: 28px;
    top: 50%;
    transform: translateY(-50%);
    padding: 0;
  }
  .match-selected {
    width: 100%;
  }
  .ant-select-selection-overflow-item:not(
    .ant-select-selection-overflow-item-rest
  ) {
    max-width: calc(100% - 60px);
  }
  .ant-select-selection-item-content {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .match-selected .ant-select-clear {
    opacity: 1;
  }
`;
const MatchMode = styled(Button)`
  padding-inline: 0;
  color: ${({ theme }) => theme.colorTextSecondary};
  font-weight: normal;
  &[aria-pressed='true'] {
    color: ${({ theme }) => theme.colorPrimary};
    font-weight: ${({ theme }) => theme.fontWeightStrong};
  }
`;
const Options = styled.div`
  max-width: calc(100vw - 48px);
  .match-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding-block: 4px;
  }
  .match-actions span {
    margin-left: auto;
    white-space: nowrap;
  }
  .match-options {
    max-height: 280px;
    overflow-y: auto;
  }
  .match-option {
    display: flex;
    padding: 6px 0;
    overflow-wrap: anywhere;
  }
`;

export default function InlineMatchSelect({
  column,
  mode,
  allowFuzzyMatch = true,
  matchModeContainer,
  keyword,
  value,
  options,
  multiple,
  loading,
  disabled,
  inputRef,
  onModeChange,
  onKeywordChange,
  onChange,
  onActiveChange,
  onClear,
}: Props) {
  const field = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const clearing = useRef(false);
  const [isComposing, setIsComposing] = useState(false);
  const [open, setOpen] = useState(false);
  const [popupWidth, setPopupWidth] = useState(220);
  const selected = value ?? [];
  const visible = options
    .filter(option =>
      String(option.label ?? option.value ?? '')
        .toLocaleLowerCase()
        .includes(keyword.trim().toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(selected.includes(b.value)) - Number(selected.includes(a.value)),
    );
  const busy = loading || isComposing;
  const active = (next: boolean) => {
    setOpen(next);
    if (next)
      setPopupWidth(
        Math.max(
          180,
          (field.current?.getBoundingClientRect().width ?? 244) - 24,
        ),
      );
    onActiveChange(next);
  };
  const change = (next: SelectValue) => onChange(next?.length ? next : null);
  const toggle = (option: Option, checked: boolean) => {
    change(
      checked
        ? multiple
          ? [...selected.filter(value => value !== option.value), option.value]
          : [option.value]
        : selected.filter(value => value !== option.value),
    );
    if (!multiple) active(false);
  };
  const selectedVisible = visible.filter(option =>
    selected.includes(option.value),
  );
  const modeToggle = allowFuzzyMatch ? (
    <MatchMode
      buttonStyle="link"
      buttonSize="xsmall"
      showMarginRight={false}
      aria-label={`${t('匹配方式')}：${column}`}
      aria-pressed={mode === 'contains'}
      disabled={disabled}
      onClick={event => {
        event.stopPropagation();
        onModeChange(mode === 'contains' ? 'exact' : 'contains');
      }}
    >
      {mode === 'contains' ? t('模糊') : t('精确')}
    </MatchMode>
  ) : null;
  return (
    <Field ref={field}>
      {matchModeContainer && createPortal(modeToggle, matchModeContainer)}
      <Select
        ref={inputRef}
        className="match-selected"
        aria-label={`${t('搜索选项')}：${column}`}
        mode={multiple ? 'multiple' : undefined}
        value={multiple ? selected : selected[0]}
        options={options}
        disabled={disabled}
        showSearch={false}
        allowClear={{
          clearIcon: <span aria-label={`${t('清空选择')}：${column}`}>×</span>,
        }}
        maxTagCount="responsive"
        maxTagPlaceholder={omitted => `+${omitted.length} …`}
        placeholder={t('请选择')}
        prefix={matchModeContainer ? undefined : modeToggle}
        open={open}
        onOpenChange={active}
        onClear={() => {
          clearing.current = true;
          onClear?.();
          if (!onClear) change(null);
        }}
        onChange={values => {
          if (clearing.current) {
            clearing.current = false;
            return;
          }
          change(
            Array.isArray(values)
              ? values
              : values === undefined
                ? null
                : [values],
          );
        }}
        popupRender={() => (
          <Options
            style={{ width: popupWidth }}
            aria-label={`${t('匹配选项')}：${column}`}
          >
            <Input
              value={keyword}
              aria-label={`${t('搜索名称')}：${column}`}
              placeholder={t('搜索名称')}
              allowClear
              disabled={disabled}
              onFocus={() => onActiveChange(true)}
              onChange={event =>
                onKeywordChange(event.target.value, !composing.current)
              }
              onCompositionStart={() => {
                composing.current = true;
                setIsComposing(true);
              }}
              onCompositionEnd={event => {
                composing.current = false;
                setIsComposing(false);
                onKeywordChange(event.currentTarget.value, true);
              }}
              onKeyDown={event => {
                event.stopPropagation();
                if (event.key === 'Escape' && !composing.current) active(false);
              }}
            />
            {multiple && (
              <div className="match-actions">
                <Button
                  buttonStyle="link"
                  buttonSize="xsmall"
                  showMarginRight={false}
                  aria-label={t('全选当前结果')}
                  disabled={
                    disabled ||
                    busy ||
                    !visible.some(option => !selected.includes(option.value))
                  }
                  onClick={() =>
                    change([
                      ...selected,
                      ...visible
                        .filter(option => !selected.includes(option.value))
                        .map(option => option.value),
                    ])
                  }
                >
                  {t('全选')}
                </Button>
                <Button
                  buttonStyle="link"
                  buttonSize="xsmall"
                  showMarginRight={false}
                  disabled={disabled || busy || !selectedVisible.length}
                  onClick={() =>
                    change(
                      selected.filter(
                        value =>
                          !visible.some(option => option.value === value),
                      ),
                    )
                  }
                >
                  {t('取消全选')}
                </Button>
                <span>
                  {selectedVisible.length}/{visible.length}
                </span>
              </div>
            )}
            <div className="match-options">
              {busy ? (
                <div role="status">{t('正在加载…')}</div>
              ) : visible.length ? (
                visible.map(option => (
                  <Checkbox
                    className="match-option"
                    key={JSON.stringify(option.value)}
                    checked={selected.includes(option.value)}
                    disabled={disabled}
                    onChange={event => toggle(option, event.target.checked)}
                  >
                    {option.label}
                  </Checkbox>
                ))
              ) : (
                <div role="status">{t('无匹配项')}</div>
              )}
            </div>
          </Options>
        )}
      />
      {!selected.length && keyword && (
        <Button
          className="match-empty-clear"
          buttonStyle="link"
          buttonSize="xsmall"
          showMarginRight={false}
          disabled={disabled}
          aria-label={`${t('清空选择')}：${column}`}
          onClick={() => {
            if (onClear) onClear();
            else {
              onKeywordChange('', true);
              change(null);
            }
          }}
        >
          ×
        </Button>
      )}
    </Field>
  );
}
