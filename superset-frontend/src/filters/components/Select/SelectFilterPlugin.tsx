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
/* eslint-disable no-param-reassign */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import {
  AppSection,
  DataMask,
  ensureIsArray,
  ExtraFormData,
  getColumnLabel,
  JsonObject,
  finestTemporalGrainFormatter,
} from '@superset-ui/core';
import { tn } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { GenericDataType } from '@apache-superset/core/common';
import { debounce, isUndefined } from 'lodash';
import { useImmerReducer } from 'use-immer';
import {
  FormItem,
  LabeledValue,
  Select,
  Space,
  Constants,
} from '@superset-ui/core/components';
import {
  hasOption,
  propertyComparator,
} from '@superset-ui/core/components/Select/utils';
import { FilterBarOrientation } from 'src/dashboard/types';
import {
  getDataRecordFormatter,
  getSelectExtraFormData,
  SelectFilterMatchMode,
} from '../../utils';
import { FilterPluginStyle, StatusMessage } from '../common';
import { PluginFilterSelectProps, SelectValue } from './types';
import InlineMatchSelect from './InlineMatchSelect';

type DataMaskAction =
  | { type: 'ownState'; ownState: JsonObject }
  | {
      type: 'filterState';
      extraFormData: ExtraFormData;
      filterState: {
        value: SelectValue;
        label?: string;
        excludeFilterValues?: boolean;
        matchMode?: SelectFilterMatchMode;
        valueSelection?: boolean;
        searchValue?: string;
      };
    };

function reducer(draft: DataMask, action: DataMaskAction) {
  switch (action.type) {
    case 'ownState':
      draft.ownState = {
        ...draft.ownState,
        ...action.ownState,
      };
      return draft;
    case 'filterState':
      if (
        JSON.stringify(draft.extraFormData) !==
        JSON.stringify(action.extraFormData)
      ) {
        draft.extraFormData = action.extraFormData;
      }
      if (
        JSON.stringify(draft.filterState) !== JSON.stringify(action.filterState)
      ) {
        draft.filterState = { ...draft.filterState, ...action.filterState };
      }

      return draft;
    default:
      return draft;
  }
}

const StyledSpace = styled(Space)<{
  inverseSelection: boolean;
  appSection: AppSection;
}>`
  display: flex;
  align-items: center;
  width: 100%;

  .exclude-select {
    width: 80px;
    flex-shrink: 0;
  }

  &.ant-space {
    .ant-space-item {
      width: ${({ inverseSelection }) => (!inverseSelection ? '100%' : 'auto')};
    }
  }
`;

// Keep track of orientation changes outside component with filter ID
const orientationMap = new Map<string, FilterBarOrientation>();

export default function PluginFilterSelect(props: PluginFilterSelectProps) {
  const {
    coltypeMap,
    data,
    filterState,
    formData,
    height,
    isRefreshing,
    width,
    setDataMask,
    setHoveredFilter,
    unsetHoveredFilter,
    setFocusedFilter,
    unsetFocusedFilter,
    setFilterActive,
    appSection,
    showOverflow,
    parentRef,
    inputRef,
    filterBarOrientation,
    clearAllTrigger,
    onClearAllComplete,
    previewSearch,
    matchModeContainer,
  } = props;
  const {
    enableEmptyFilter,
    allowFuzzyMatch,
    creatable,
    multiSelect,
    showSearch,
    inverseSelection,
    defaultToFirstItem,
    searchAllOptions,
  } = formData;

  const groupby = useMemo(
    () => ensureIsArray(formData.groupby).map(getColumnLabel),
    [formData.groupby],
  );
  const [col] = groupby;
  const [initialColtypeMap] = useState(coltypeMap);
  const [search, setSearch] = useState('');
  const prevDataRef = useRef(data);
  const [dataMask, dispatchDataMask] = useImmerReducer(reducer, {
    extraFormData: {},
    filterState,
  });
  const datatype: GenericDataType = coltypeMap[col];
  const matchMode: SelectFilterMatchMode =
    allowFuzzyMatch !== false && filterState.matchMode === 'contains'
      ? 'contains'
      : 'exact';
  const [keyword, setKeyword] = useState(
    String(
      filterState.searchValue ??
        (filterState.matchMode === 'contains' && !filterState.valueSelection
          ? filterState.value?.[0]
          : '') ??
        '',
    ),
  );
  const isComposing = useRef(false);
  const isKeywordFocused = useRef(false);
  useEffect(() => {
    if (clearAllTrigger) {
      setKeyword('');
      isComposing.current = false;
      isKeywordFocused.current = false;
    } else if (!isKeywordFocused.current && !isComposing.current) {
      setKeyword(
        String(
          filterState.searchValue ??
            (matchMode === 'contains' && !filterState.valueSelection
              ? filterState.value?.[0]
              : '') ??
            '',
        ),
      );
    }
  }, [
    filterState.searchValue,
    filterState.value?.[0],
    filterState.valueSelection,
    matchMode,
    clearAllTrigger,
  ]);
  const showValueSelection =
    appSection !== AppSection.FilterConfigModal &&
    (datatype === GenericDataType.String || matchMode === 'contains');
  const labelFormatter = useMemo(
    () =>
      getDataRecordFormatter({
        timeFormatter: finestTemporalGrainFormatter(data.map(el => el[col])),
      }),
    [data, col],
  );
  const [excludeFilterValues, setExcludeFilterValues] = useState(
    isUndefined(filterState?.excludeFilterValues)
      ? true
      : filterState?.excludeFilterValues,
  );

  const prevExcludeFilterValues = useRef(excludeFilterValues);

  const hasOnlyOrientationChanged = useRef(false);

  useEffect(() => {
    // Get previous orientation for this specific filter
    const previousOrientation = orientationMap.get(formData.nativeFilterId);

    // Check if only orientation changed for this filter
    if (
      previousOrientation !== undefined &&
      previousOrientation !== filterBarOrientation
    ) {
      hasOnlyOrientationChanged.current = true;
    } else {
      hasOnlyOrientationChanged.current = false;
    }

    // Update orientation for this filter
    if (filterBarOrientation) {
      orientationMap.set(formData.nativeFilterId, filterBarOrientation);
    }
  }, [filterBarOrientation]);

  const updateDataMask = useCallback(
    (
      values: SelectValue,
      nextMatchMode: SelectFilterMatchMode = matchMode,
      valueSelection = filterState.valueSelection === true,
      searchValue = filterState.searchValue as string | undefined,
    ) => {
      const emptyFilter =
        enableEmptyFilter && !inverseSelection && !values?.length;

      const suffix = inverseSelection && values?.length ? t(' (excluded)') : '';
      const prefix =
        nextMatchMode === 'contains' && !valueSelection
          ? `${t('模糊匹配')}：`
          : '';
      dispatchDataMask({
        type: 'filterState',
        extraFormData: getSelectExtraFormData(
          col,
          values,
          emptyFilter,
          excludeFilterValues && inverseSelection,
          valueSelection ? 'exact' : nextMatchMode,
        ),
        filterState: {
          ...filterState,
          ...(filterState.matchMode || nextMatchMode === 'contains'
            ? { matchMode: nextMatchMode }
            : {}),
          label: values?.length
            ? `${prefix}${(values || [])
                .map(value => labelFormatter(value, datatype))
                .join(', ')}${suffix}`
            : undefined,
          value:
            appSection === AppSection.FilterConfigModal && defaultToFirstItem
              ? undefined
              : values,
          excludeFilterValues,
          ...(valueSelection || nextMatchMode === 'contains'
            ? { valueSelection, searchValue }
            : {}),
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      appSection,
      col,
      datatype,
      defaultToFirstItem,
      dispatchDataMask,
      enableEmptyFilter,
      inverseSelection,
      matchMode,
      excludeFilterValues,
      JSON.stringify(filterState),
      labelFormatter,
    ],
  );

  const isDisabled =
    appSection === AppSection.FilterConfigModal && defaultToFirstItem;

  const onSearch = useMemo(
    () =>
      debounce((search: string) => {
        const value = matchMode === 'contains' && !search.trim() ? '' : search;
        setSearch(value);
        if (searchAllOptions || matchMode === 'contains') {
          dispatchDataMask({
            type: 'ownState',
            ownState: {
              coltypeMap: initialColtypeMap,
              search: value,
              searchMatchMode: matchMode,
            },
          });
        }
      }, Constants.SLOW_DEBOUNCE),
    [dispatchDataMask, initialColtypeMap, searchAllOptions, matchMode],
  );

  useEffect(() => () => onSearch.cancel(), [onSearch]);

  const handleBlur = useCallback(() => {
    unsetFocusedFilter();
    onSearch('');
  }, [onSearch, unsetFocusedFilter]);

  const handleChange = useCallback(
    (value?: SelectValue | number | string) => {
      const values = value === null ? [null] : ensureIsArray(value);

      if (values.length === 0) {
        updateDataMask(null);
      } else {
        updateDataMask(values);
      }
    },
    [updateDataMask, formData.nativeFilterId, clearAllTrigger],
  );

  const placeholderText =
    data.length === 0
      ? t('No data')
      : tn('%s option', '%s options', data.length, data.length);

  const formItemExtra = useMemo(() => {
    if (filterState.validateMessage) {
      return (
        <StatusMessage status={filterState.validateStatus}>
          {filterState.validateMessage}
        </StatusMessage>
      );
    }
    return undefined;
  }, [filterState.validateMessage, filterState.validateStatus]);

  const uniqueOptions = useMemo(() => {
    const allOptions = new Set(data.map(el => el[col]));
    return [...allOptions].map((value: string) => ({
      label: labelFormatter(value, datatype),
      value,
      isNewOption: false,
    }));
  }, [data, datatype, col, labelFormatter]);

  const options = useMemo(() => {
    if (search && !multiSelect && !hasOption(search, uniqueOptions, true)) {
      uniqueOptions.unshift({
        label: search,
        value: search,
        isNewOption: true,
      });
    }
    return uniqueOptions;
  }, [multiSelect, search, uniqueOptions]);

  const sortComparator = useCallback(
    (a: LabeledValue, b: LabeledValue) => {
      // When sortMetric is specified, the backend already sorted the data correctly
      // Don't override the backend's metric-based sorting with frontend alphabetical sorting
      if (formData.sortMetric) {
        return 0; // Preserve the original order from the backend
      }

      // Only apply alphabetical sorting when no sortMetric is specified
      const labelComparator = propertyComparator('label');
      if (formData.sortAscending) {
        return labelComparator(a, b);
      }
      return labelComparator(b, a);
    },
    [formData.sortAscending, formData.sortMetric],
  );

  // Use effect for initialisation for filter plugin
  // this should run only once when filter is configured & saved
  // & shouldnt run when the component is remounted on change of
  // orientation of filter bar
  useEffect(() => {
    // Skip if only orientation changed
    if (hasOnlyOrientationChanged.current) {
      return;
    }

    if (allowFuzzyMatch === false && filterState.matchMode === 'contains') {
      dispatchDataMask({
        type: 'ownState',
        ownState: { search: '', searchMatchMode: 'exact' },
      });
      updateDataMask(
        filterState.valueSelection ? filterState.value : null,
        'exact',
      );
      return;
    }

    // Case 1: Handle disabled state first
    if (isDisabled) {
      updateDataMask(null);
      return;
    }

    if (matchMode === 'contains' || filterState.value !== undefined) {
      // Set the filter state value if it is defined
      updateDataMask(filterState.value);
      return;
    }

    // Handle the default to first Value case
    // Skip default values when clearAllTrigger is active to prevent
    // defaults from being applied during Clear All operation
    if (!clearAllTrigger) {
      if (defaultToFirstItem) {
        // Set to first item if defaultToFirstItem is true
        const firstItem: SelectValue = data[0]
          ? (groupby.map(col => data[0][col]) as string[])
          : null;
        if (firstItem?.[0] !== undefined) {
          updateDataMask(firstItem);
        }
      } else if (formData?.defaultValue) {
        // Handle defalut value case
        updateDataMask(formData.defaultValue);
      }
    }
  }, [
    allowFuzzyMatch,
    isDisabled,
    matchMode,
    enableEmptyFilter,
    defaultToFirstItem,
    formData?.defaultValue,
    data,
    groupby,
    col,
    inverseSelection,
    clearAllTrigger,
  ]);

  useEffect(() => {
    const prev = prevDataRef.current;
    const curr = data;

    const hasDataChanged =
      prev?.length !== curr?.length ||
      prev?.some((row, i) => {
        const prevVal = row[col];
        const currVal = curr[i][col];
        return typeof prevVal === 'bigint' || typeof currVal === 'bigint'
          ? prevVal?.toString() !== currVal?.toString()
          : prevVal !== currVal;
      });

    // If data actually changed (e.g., due to parent filter), reset flag
    if (hasDataChanged) {
      prevDataRef.current = data;
    }
  }, [data, col]);

  useEffect(() => {
    if (filterState.matchMode === 'contains') return;
    if (
      filterState.value?.every((value?: any) =>
        data.some(row => row[col] === value),
      )
    )
      return;

    const firstItem: SelectValue = data[0]
      ? (groupby.map(col => data[0][col]) as string[])
      : null;

    // Skip default value update when clearAllTrigger is active
    if (
      !clearAllTrigger &&
      defaultToFirstItem &&
      Object.keys(formData?.extraFormData || {}).length &&
      filterState.value !== undefined &&
      firstItem !== null &&
      filterState.value !== firstItem
    ) {
      if (firstItem?.[0] !== undefined) {
        updateDataMask(firstItem);
      }
    }
  }, [
    defaultToFirstItem,
    matchMode,
    updateDataMask,
    formData,
    data,
    JSON.stringify(filterState.value),
    clearAllTrigger,
  ]);

  useEffect(() => {
    setDataMask(dataMask);
  }, [JSON.stringify(dataMask)]);

  useEffect(() => {
    if (clearAllTrigger) {
      dispatchDataMask({
        type: 'filterState',
        extraFormData: {},
        filterState: {
          value: undefined,
          label: undefined,
        },
      });

      updateDataMask(null, matchMode, filterState.valueSelection === true, '');
      setKeyword('');
      setSearch('');
      onClearAllComplete?.(formData.nativeFilterId);
    }
  }, [clearAllTrigger, onClearAllComplete, updateDataMask]);

  useEffect(() => {
    if (prevExcludeFilterValues.current !== excludeFilterValues) {
      dispatchDataMask({
        type: 'filterState',
        extraFormData: getSelectExtraFormData(
          col,
          filterState.value,
          !filterState.value?.length,
          excludeFilterValues && inverseSelection,
          filterState.valueSelection ? 'exact' : matchMode,
        ),
        filterState: {
          ...(filterState as {
            value: SelectValue;
            label?: string;
            excludeFilterValues?: boolean;
          }),
          excludeFilterValues,
        },
      });
      prevExcludeFilterValues.current = excludeFilterValues;
    }
  }, [excludeFilterValues]);

  const handleExclusionToggle = (value: string) => {
    setExcludeFilterValues(value === 'true');
  };

  const keywordSelection =
    matchMode === 'contains' && !filterState.valueSelection;
  const matchedValues =
    keywordSelection && filterState.value?.length
      ? uniqueOptions
          .filter(option =>
            String(option.label)
              .toLocaleLowerCase()
              .includes(keyword.trim().toLocaleLowerCase()),
          )
          .map(option => option.value)
      : filterState.value;

  return (
    <FilterPluginStyle height={height} width={width}>
      <FormItem
        validateStatus={filterState.validateStatus}
        extra={formItemExtra}
      >
        <StyledSpace
          appSection={appSection}
          inverseSelection={inverseSelection}
        >
          {appSection !== AppSection.FilterConfigModal && inverseSelection && (
            <Select
              className="exclude-select"
              value={`${excludeFilterValues}`}
              options={[
                { value: 'true', label: t('is not') },
                { value: 'false', label: t('is') },
              ]}
              onChange={handleExclusionToggle}
            />
          )}
          {showValueSelection ? (
            <InlineMatchSelect
              column={col}
              mode={matchMode}
              allowFuzzyMatch={allowFuzzyMatch}
              matchModeContainer={matchModeContainer}
              keyword={keyword}
              value={matchedValues}
              options={[...uniqueOptions].sort(sortComparator)}
              multiple={multiSelect}
              loading={
                isRefreshing ||
                (matchMode === 'contains' &&
                  Boolean(keyword) &&
                  previewSearch !== undefined &&
                  previewSearch !== keyword)
              }
              disabled={isDisabled}
              inputRef={inputRef}
              onActiveChange={active => {
                isKeywordFocused.current = active;
                setFilterActive(active);
                if (active) {
                  setFocusedFilter();
                  onSearch(keyword);
                } else unsetFocusedFilter();
              }}
              onKeywordChange={(value, committed) => {
                setKeyword(value);
                isComposing.current = !committed;
                if (!committed) {
                  onSearch.cancel();
                  return;
                }
                // Keep the keyword predicate so every match is selected beyond the option preview limit.
                if (matchMode === 'contains')
                  updateDataMask(
                    value.trim() ? [value] : null,
                    matchMode,
                    false,
                    value,
                  );
                else updateDataMask(filterState.value, matchMode, true, value);
                onSearch(value);
              }}
              onModeChange={mode => {
                onSearch.cancel();
                dispatchDataMask({
                  type: 'ownState',
                  ownState: {
                    search: mode === 'contains' ? keyword : '',
                    searchMatchMode: mode,
                  },
                });
                if (mode === 'contains' && keyword.trim())
                  updateDataMask([keyword], mode, false, keyword);
                else updateDataMask(matchedValues, mode, true, keyword);
              }}
              onChange={values =>
                updateDataMask(values, matchMode, true, keyword)
              }
              onClear={() => {
                onSearch.cancel();
                setKeyword('');
                isComposing.current = false;
                updateDataMask(null, matchMode, true, '');
                onSearch('');
              }}
            />
          ) : (
            <Select
              name={formData.nativeFilterId}
              allowClear
              allowNewOptions={!searchAllOptions && creatable !== false}
              allowSelectAll={!searchAllOptions}
              value={multiSelect ? filterState.value || [] : filterState.value}
              disabled={isDisabled}
              getPopupContainer={
                showOverflow
                  ? () => (parentRef?.current as HTMLElement) || document.body
                  : (trigger: HTMLElement) =>
                      (trigger?.parentNode as HTMLElement) || document.body
              }
              showSearch={showSearch}
              mode={multiSelect ? 'multiple' : 'single'}
              placeholder={placeholderText}
              onClear={() => onSearch('')}
              onSearch={onSearch}
              onBlur={handleBlur}
              onFocus={setFocusedFilter}
              onMouseEnter={setHoveredFilter}
              onMouseLeave={unsetHoveredFilter}
              // @ts-expect-error
              onChange={handleChange}
              ref={inputRef}
              loading={isRefreshing}
              oneLine={filterBarOrientation === FilterBarOrientation.Horizontal}
              invertSelection={inverseSelection && excludeFilterValues}
              options={options}
              sortComparator={sortComparator}
              onOpenChange={setFilterActive}
              className="select-container"
            />
          )}
        </StyledSpace>
      </FormItem>
    </FilterPluginStyle>
  );
}
