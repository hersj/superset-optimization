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
import {
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { MinusSquareOutlined, PlusSquareOutlined } from '@ant-design/icons';
import { t } from '@apache-superset/core/translation';
import {
  AdhocMetric,
  BinaryQueryObjectFilterClause,
  Currency,
  CurrencyFormatter,
  DataRecordValue,
  FeatureFlag,
  getColumnLabel,
  getNumberFormatter,
  getSelectedText,
  hasMixedCurrencies,
  isAdhocColumn,
  isFeatureEnabled,
  isPhysicalColumn,
  normalizeCurrency,
  NumberFormatter,
} from '@superset-ui/core';
import { styled, useTheme } from '@apache-superset/core/theme';
import {
  aggregatorTemplates,
  naturalSort,
  PivotTable,
  sortAs,
} from './react-pivottable';
import {
  createCustomPeriodAggregator,
  unpivotCustomPeriodData,
  PERIOD_COLUMNS,
  PERIOD_KEY,
} from './plugin/customPeriodComparison';
import {
  FilterType,
  MetricsLayoutEnum,
  PivotTableProps,
  PivotTableStylesProps,
  SelectedFiltersType,
} from './types';
import {
  PIVOT_ABSOLUTE_RATIO_AGGREGATE_FUNCTION,
  PIVOT_RATIO_AGGREGATE_FUNCTION,
  PIVOT_RATIO_DENOMINATOR_FIELD,
  PIVOT_RATIO_NUMERATOR_FIELD,
  unpivotPivotTableData,
} from './plugin/pivotRatioMetrics';

const Styles = styled.div<PivotTableStylesProps>`
  ${({ height, width, margin }) => `
      margin: ${margin}px;
      height: ${height - margin * 2}px;
      width: ${
        typeof width === 'string' ? parseInt(width, 10) : width - margin * 2
      }px;
 `}
`;

const PivotTableWrapper = styled.div`
  ${({ theme }) => `
    height: 100%;
    max-width: inherit;
    overflow: auto;

    /* Chrome/Safari/Edge webkit scrollbar styling */
    &::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    &::-webkit-scrollbar-track {
      background: ${theme.colorFillQuaternary};
    }

    &::-webkit-scrollbar-thumb {
      background: ${theme.colorFillSecondary};
      border-radius: ${theme.borderRadiusSM}px;

      &:hover {
        background: ${theme.colorFillTertiary};
      }
    }

    &::-webkit-scrollbar-corner {
      background: ${theme.colorFillQuaternary};
    }

    /* Firefox scrollbar styling */
    scrollbar-width: thin;
    scrollbar-color: ${theme.colorFillSecondary} ${theme.colorFillQuaternary};
  `}
`;

const METRIC_KEY = t('Metric');
const vals = ['value'];

const StyledPlusSquareOutlined = styled(PlusSquareOutlined)`
  stroke: ${({ theme }) => theme.colorBorderSecondary};
  stroke-width: 16px;
`;

const StyledMinusSquareOutlined = styled(MinusSquareOutlined)`
  stroke: ${({ theme }) => theme.colorBorderSecondary};
  stroke-width: 16px;
`;

/** Aggregator with currency tracking support */
interface CurrencyTrackingAggregator {
  getCurrencies?: () => string[];
}

type BaseFormatter = NumberFormatter | CurrencyFormatter;

/** Create formatter that handles AUTO mode with per-cell currency detection */
const createCurrencyAwareFormatter = (
  baseFormatter: BaseFormatter,
  currencyConfig: Currency | undefined,
  d3Format: string,
  fallbackCurrency?: string,
): ((value: number, aggregator?: CurrencyTrackingAggregator) => string) => {
  const isAutoMode = currencyConfig?.symbol === 'AUTO';

  return (value: number, aggregator?: CurrencyTrackingAggregator): string => {
    // If not AUTO mode, use base formatter directly
    if (!isAutoMode) {
      return baseFormatter(value);
    }

    // AUTO mode: check aggregator for currency tracking
    if (aggregator && typeof aggregator.getCurrencies === 'function') {
      const currencies = aggregator.getCurrencies();

      if (currencies && currencies.length > 0) {
        if (hasMixedCurrencies(currencies)) {
          return getNumberFormatter(d3Format)(value);
        }

        const detectedCurrency = normalizeCurrency(currencies[0]);
        if (detectedCurrency && currencyConfig) {
          const cellFormatter = new CurrencyFormatter({
            currency: {
              symbol: detectedCurrency,
              symbolPosition: currencyConfig.symbolPosition,
            },
            d3Format,
          });
          return cellFormatter(value);
        }
      }
    }

    // Fallback: use detected_currency from API response if available
    if (fallbackCurrency && currencyConfig) {
      const normalizedFallback = normalizeCurrency(fallbackCurrency);
      if (normalizedFallback) {
        const fallbackFormatter = new CurrencyFormatter({
          currency: {
            symbol: normalizedFallback,
            symbolPosition: currencyConfig.symbolPosition,
          },
          d3Format,
        });
        return fallbackFormatter(value);
      }
    }

    // Final fallback to neutral format
    return getNumberFormatter(d3Format)(value);
  };
};

const aggregatorsFactory = (formatter: NumberFormatter) => ({
  Count: aggregatorTemplates.count(formatter),
  'Count Unique Values': aggregatorTemplates.countUnique(formatter),
  'List Unique Values': aggregatorTemplates.listUnique(', ', formatter),
  Sum: aggregatorTemplates.sum(formatter),
  Average: aggregatorTemplates.average(formatter),
  [PIVOT_RATIO_AGGREGATE_FUNCTION]: () =>
    aggregatorTemplates.sumOverSum(formatter)([
      PIVOT_RATIO_NUMERATOR_FIELD,
      PIVOT_RATIO_DENOMINATOR_FIELD,
    ]),
  [PIVOT_ABSOLUTE_RATIO_AGGREGATE_FUNCTION]: () =>
    aggregatorTemplates.sumOverSum(
      formatter,
      true,
    )([PIVOT_RATIO_NUMERATOR_FIELD, PIVOT_RATIO_DENOMINATOR_FIELD]),
  Median: aggregatorTemplates.median(formatter),
  'Sample Variance': aggregatorTemplates.var(1, formatter),
  'Sample Standard Deviation': aggregatorTemplates.stdev(1, formatter),
  Minimum: aggregatorTemplates.min(formatter),
  Maximum: aggregatorTemplates.max(formatter),
  First: aggregatorTemplates.first(formatter),
  Last: aggregatorTemplates.last(formatter),
  'Sum as Fraction of Total': aggregatorTemplates.fractionOf(
    aggregatorTemplates.sum(),
    'total',
    formatter,
  ),
  'Sum as Fraction of Rows': aggregatorTemplates.fractionOf(
    aggregatorTemplates.sum(),
    'row',
    formatter,
  ),
  'Sum as Fraction of Columns': aggregatorTemplates.fractionOf(
    aggregatorTemplates.sum(),
    'col',
    formatter,
  ),
  'Count as Fraction of Total': aggregatorTemplates.fractionOf(
    aggregatorTemplates.count(),
    'total',
    formatter,
  ),
  'Count as Fraction of Rows': aggregatorTemplates.fractionOf(
    aggregatorTemplates.count(),
    'row',
    formatter,
  ),
  'Count as Fraction of Columns': aggregatorTemplates.fractionOf(
    aggregatorTemplates.count(),
    'col',
    formatter,
  ),
});

/* If you change this logic, please update the corresponding Python
 * function (https://github.com/apache/superset/blob/master/superset/charts/post_processing.py),
 * or reach out to @betodealmeida.
 */
export default function PivotTableChart(props: PivotTableProps) {
  const {
    data,
    height,
    width,
    groupbyRows: groupbyRowsRaw,
    groupbyColumns: groupbyColumnsRaw,
    metrics,
    colOrder,
    rowOrder,
    aggregateFunction,
    transposePivot,
    combineMetric,
    rowSubtotalPosition,
    colSubtotalPosition,
    colTotals,
    colSubTotals,
    rowTotals,
    rowSubTotals,
    valueFormat,
    currencyFormat,
    currencyCodeColumn,
    detectedCurrency,
    emitCrossFilters,
    setDataMask,
    selectedFilters,
    verboseMap,
    columnFormats,
    currencyFormats,
    metricAggregateFunctions,
    metricRatioComponents = {},
    customPeriodComparison = false,
    customPeriodComparisonLabel,
    customPeriodTemporalDimensions = [],
    metricsLayout,
    metricColorFormatters,
    dateFormatters,
    onContextMenu,
    timeGrainSqla,
    allowRenderHtml,
    pivotNumberFormatRules,
    dimensionLabelOverrides = {},
    frozenColumnCount = 0,
    frozenColumnKey,
    freezeMetricIds = {},
    personalSort,
    personalSortEnabled = false,
    personalSortOrder,
    ownState = {},
  } = props;

  const theme = useTheme();

  // Base formatter without currency-awareness (for non-AUTO mode or as fallback)
  const baseFormatter = useMemo(
    () =>
      currencyFormat?.symbol && currencyFormat.symbol !== 'AUTO'
        ? new CurrencyFormatter({
            currency: currencyFormat,
            d3Format: valueFormat,
          })
        : getNumberFormatter(valueFormat),
    [valueFormat, currencyFormat],
  );

  // Currency-aware formatter for AUTO mode support
  const defaultFormatter = useMemo(
    () =>
      createCurrencyAwareFormatter(
        baseFormatter,
        currencyFormat,
        valueFormat,
        detectedCurrency ?? undefined,
      ),
    [baseFormatter, currencyFormat, valueFormat, detectedCurrency],
  );
  const customFormatsArray = useMemo(
    () =>
      Array.from(
        new Set([
          ...Object.keys(columnFormats || {}),
          ...Object.keys(currencyFormats || {}),
        ]),
      ).map(metricName => [
        metricName,
        columnFormats[metricName] || valueFormat,
        currencyFormats[metricName] || currencyFormat,
      ]),
    [columnFormats, currencyFormat, currencyFormats, valueFormat],
  );
  const hasCustomMetricFormatters = customFormatsArray.length > 0;
  const metricAggregatorNames = useMemo(() => {
    if (customPeriodComparison) {
      return {
        [METRIC_KEY]: Object.fromEntries(
          metrics.map(metric => {
            const name =
              typeof metric === 'string' ? metric : (metric.label as string);
            return [name, `Custom period: ${name}`];
          }),
        ),
      };
    }
    const aggregateEntries = Object.entries(
      metricAggregateFunctions || {},
    ).filter(([, aggregateName]) => Boolean(aggregateName));
    return aggregateEntries.length
      ? {
          [METRIC_KEY]: Object.fromEntries(aggregateEntries),
        }
      : undefined;
  }, [metricAggregateFunctions, customPeriodComparison, metrics]);
  const metricFormatters = useMemo(
    () =>
      hasCustomMetricFormatters
        ? {
            [METRIC_KEY]: Object.fromEntries(
              customFormatsArray.map(([metric, d3Format, currency]) => {
                // Create base formatter
                const metricBaseFormatter =
                  currency && (currency as Currency).symbol !== 'AUTO'
                    ? new CurrencyFormatter({
                        currency: currency as Currency,
                        d3Format: d3Format as string,
                      })
                    : getNumberFormatter(d3Format as string);

                // Wrap with currency-aware formatter for AUTO mode support
                return [
                  metric,
                  createCurrencyAwareFormatter(
                    metricBaseFormatter,
                    currency as Currency | undefined,
                    d3Format as string,
                    detectedCurrency ?? undefined,
                  ),
                ];
              }),
            ),
          }
        : undefined,
    [customFormatsArray, hasCustomMetricFormatters, detectedCurrency],
  );

  const metricNames = useMemo(
    () =>
      metrics.map((metric: string | AdhocMetric) =>
        typeof metric === 'string' ? metric : (metric.label as string),
      ),
    [metrics],
  );

  const comparisonAggregatorsFactory = useMemo(
    () => (formatter: NumberFormatter) => ({
      ...aggregatorsFactory(formatter),
      'Custom period': () => createCustomPeriodAggregator(formatter),
      ...Object.fromEntries(
        metricNames.map(name => [
          `Custom period: ${name}`,
          () =>
            createCustomPeriodAggregator(
              formatter,
              Boolean(metricRatioComponents[name]),
              metricAggregateFunctions?.[name] ===
                PIVOT_ABSOLUTE_RATIO_AGGREGATE_FUNCTION,
              String(columnFormats[name] || valueFormat).includes('%'),
            ),
        ]),
      ),
    }),
    [
      metricNames,
      metricRatioComponents,
      metricAggregateFunctions,
      columnFormats,
      valueFormat,
    ],
  );

  const unpivotedData = useMemo(
    () =>
      (customPeriodComparison
        ? unpivotCustomPeriodData
        : unpivotPivotTableData)(
        data,
        metricNames,
        metricRatioComponents,
        METRIC_KEY,
        currencyCodeColumn,
      ),
    [
      data,
      metricNames,
      currencyCodeColumn,
      metricRatioComponents,
      customPeriodComparison,
    ],
  );
  const groupbyRows = useMemo(
    () => groupbyRowsRaw.map(getColumnLabel),
    [groupbyRowsRaw],
  );
  const groupbyColumns = useMemo(
    () => groupbyColumnsRaw.map(getColumnLabel),
    [groupbyColumnsRaw],
  );
  const namesMapping = useMemo(
    () => ({ ...verboseMap, ...dimensionLabelOverrides }),
    [dimensionLabelOverrides, verboseMap],
  );

  const sorters = useMemo(
    () => ({
      [METRIC_KEY]: sortAs(metricNames),
      ...(customPeriodComparison
        ? {
            [PERIOD_KEY]: sortAs(PERIOD_COLUMNS),
            ...Object.fromEntries(
              customPeriodTemporalDimensions.map(name => [name, naturalSort]),
            ),
          }
        : {}),
    }),
    [metricNames, customPeriodComparison, customPeriodTemporalDimensions],
  );

  const [rows, cols] = useMemo(() => {
    let [rows_, cols_] = transposePivot
      ? [groupbyColumns, groupbyRows]
      : [groupbyRows, groupbyColumns];

    if (metricsLayout === MetricsLayoutEnum.ROWS) {
      rows_ = combineMetric ? [...rows_, METRIC_KEY] : [METRIC_KEY, ...rows_];
    } else {
      cols_ = combineMetric ? [...cols_, METRIC_KEY] : [METRIC_KEY, ...cols_];
    }
    if (customPeriodComparison) {
      if (metricsLayout === MetricsLayoutEnum.ROWS)
        rows_.splice(rows_.indexOf(METRIC_KEY) + 1, 0, PERIOD_KEY);
      else cols_.splice(cols_.indexOf(METRIC_KEY) + 1, 0, PERIOD_KEY);
    }
    return [rows_, cols_];
  }, [
    combineMetric,
    customPeriodComparison,
    groupbyColumns,
    groupbyRows,
    metricsLayout,
    transposePivot,
  ]);

  const handleChange = useCallback(
    (filters: SelectedFiltersType) => {
      const filterKeys = Object.keys(filters);
      const groupby = [...groupbyRowsRaw, ...groupbyColumnsRaw];
      setDataMask({
        extraFormData: {
          filters:
            filterKeys.length === 0
              ? undefined
              : filterKeys.map(key => {
                  const val = filters?.[key];
                  const col =
                    groupby.find(item => {
                      if (isPhysicalColumn(item)) {
                        return item === key;
                      }
                      if (isAdhocColumn(item)) {
                        return item.label === key;
                      }
                      return false;
                    }) ?? '';
                  if (val === null || val === undefined)
                    return {
                      col,
                      op: 'IS NULL',
                    };
                  return {
                    col,
                    op: 'IN',
                    val: val as (string | number | boolean)[],
                  };
                }),
        },
        filterState: {
          value:
            filters && Object.keys(filters).length
              ? Object.values(filters)
              : null,
          selectedFilters:
            filters && Object.keys(filters).length ? filters : null,
        },
      });
    },
    [groupbyColumnsRaw, groupbyRowsRaw, setDataMask],
  );

  const getCrossFilterDataMask = useCallback(
    (value: { [key: string]: string }) => {
      const isActiveFilterValue = (key: string, val: DataRecordValue) =>
        !!selectedFilters && selectedFilters[key]?.includes(val);

      if (!value) {
        return undefined;
      }

      const [key, val] = Object.entries(value)[0];
      if (
        customPeriodComparison &&
        (key === PERIOD_KEY ||
          key === METRIC_KEY ||
          customPeriodTemporalDimensions.includes(key))
      )
        return undefined;
      let values = { ...selectedFilters };
      if (isActiveFilterValue(key, val)) {
        values = {};
      } else {
        values = { [key]: [val] };
      }

      const filterKeys = Object.keys(values);
      const groupby = [...groupbyRowsRaw, ...groupbyColumnsRaw];
      return {
        dataMask: {
          extraFormData: {
            filters:
              filterKeys.length === 0
                ? undefined
                : filterKeys.map(key => {
                    const val = values?.[key];
                    const col =
                      groupby.find(item => {
                        if (isPhysicalColumn(item)) {
                          return item === key;
                        }
                        if (isAdhocColumn(item)) {
                          return item.label === key;
                        }
                        return false;
                      }) ?? '';
                    if (val === null || val === undefined)
                      return {
                        col,
                        op: 'IS NULL' as const,
                      };
                    return {
                      col,
                      op: 'IN' as const,
                      val: val as (string | number | boolean)[],
                    };
                  }),
          },
          filterState: {
            value:
              values && Object.keys(values).length
                ? Object.values(values)
                : null,
            selectedFilters:
              values && Object.keys(values).length ? values : null,
          },
        },
        isCurrentValueSelected: isActiveFilterValue(key, val),
      };
    },
    [
      groupbyColumnsRaw,
      groupbyRowsRaw,
      selectedFilters,
      customPeriodComparison,
      customPeriodTemporalDimensions,
    ],
  );

  const toggleFilter = useCallback(
    (
      e: ReactMouseEvent,
      value: string,
      filters: FilterType,
      pivotData: Record<string, any>,
      isSubtotal: boolean,
      isGrandTotal: boolean,
    ) => {
      if (isSubtotal || isGrandTotal || !emitCrossFilters) {
        return;
      }

      // allow selecting text in a cell
      if (getSelectedText()) {
        return;
      }

      const isActiveFilterValue = (key: string, val: DataRecordValue) =>
        !!selectedFilters && selectedFilters[key]?.includes(val);

      const filtersCopy = { ...filters };
      delete filtersCopy[METRIC_KEY];
      if (customPeriodComparison) {
        delete filtersCopy[PERIOD_KEY];
        customPeriodTemporalDimensions.forEach(key => {
          delete filtersCopy[key];
        });
      }

      const filtersEntries = Object.entries(filtersCopy);
      if (filtersEntries.length === 0) {
        return;
      }

      const [key, val] = filtersEntries[filtersEntries.length - 1];

      let updatedFilters = { ...selectedFilters };
      // multi select
      // if (selectedFilters && isActiveFilterValue(key, val)) {
      //   updatedFilters[key] = selectedFilters[key].filter((x: DataRecordValue) => x !== val);
      // } else {
      //   updatedFilters[key] = [...(selectedFilters?.[key] || []), val];
      // }
      // single select
      if (selectedFilters && isActiveFilterValue(key, val)) {
        updatedFilters = {};
      } else {
        updatedFilters = {
          [key]: [val],
        };
      }
      if (
        Array.isArray(updatedFilters[key]) &&
        updatedFilters[key].length === 0
      ) {
        delete updatedFilters[key];
      }
      handleChange(updatedFilters);
    },
    [
      emitCrossFilters,
      selectedFilters,
      handleChange,
      customPeriodComparison,
      customPeriodTemporalDimensions,
    ],
  );

  const tableOptions = useMemo(
    () => ({
      clickRowHeaderCallback: toggleFilter,
      clickColumnHeaderCallback: toggleFilter,
      colTotals,
      colSubTotals,
      rowTotals,
      rowSubTotals,
      highlightHeaderCellsOnHover:
        emitCrossFilters ||
        isFeatureEnabled(FeatureFlag.DrillBy) ||
        isFeatureEnabled(FeatureFlag.DrillToDetail),
      highlightedHeaderCells: selectedFilters,
      omittedHighlightHeaderGroups: [
        METRIC_KEY,
        ...(customPeriodComparison
          ? [PERIOD_KEY, ...customPeriodTemporalDimensions]
          : []),
      ],
      cellColorFormatters: { [METRIC_KEY]: metricColorFormatters },
      dateFormatters,
      pivotNumberFormatRules,
      customPeriodComparison,
    }),
    [
      colTotals,
      colSubTotals,
      customPeriodComparison,
      customPeriodTemporalDimensions,
      dateFormatters,
      emitCrossFilters,
      metricColorFormatters,
      pivotNumberFormatRules,
      rowTotals,
      rowSubTotals,
      selectedFilters,
      toggleFilter,
    ],
  );

  const subtotalOptions = useMemo(
    () => ({
      colSubtotalDisplay: { displayOnTop: colSubtotalPosition },
      rowSubtotalDisplay: { displayOnTop: rowSubtotalPosition },
      arrowCollapsed: <StyledPlusSquareOutlined />,
      arrowExpanded: <StyledMinusSquareOutlined />,
    }),
    [colSubtotalPosition, rowSubtotalPosition],
  );

  const handleContextMenu = useCallback(
    (
      e: ReactMouseEvent,
      colKey?: string[],
      rowKey?: string[],
      dataPoint?: { [key: string]: string },
    ) => {
      if (onContextMenu) {
        e.preventDefault();
        e.stopPropagation();
        const drillToDetailFilters: BinaryQueryObjectFilterClause[] = [];
        if (colKey && colKey.length > 1) {
          colKey.forEach((val, i) => {
            const col = cols[i];
            const formatter = dateFormatters[col];
            const formattedVal = formatter?.(Number(val)) || String(val);
            if (
              i > 0 &&
              (!customPeriodComparison ||
                (col !== METRIC_KEY &&
                  col !== PERIOD_KEY &&
                  !customPeriodTemporalDimensions.includes(col)))
            ) {
              drillToDetailFilters.push({
                col,
                op: '==',
                val,
                formattedVal,
                grain: formatter ? timeGrainSqla : undefined,
              });
            }
          });
        }
        if (rowKey) {
          rowKey.forEach((val, i) => {
            const col = rows[i];
            if (
              customPeriodComparison &&
              (col === METRIC_KEY ||
                col === PERIOD_KEY ||
                customPeriodTemporalDimensions.includes(col))
            )
              return;
            const formatter = dateFormatters[col];
            const formattedVal = formatter?.(Number(val)) || String(val);
            drillToDetailFilters.push({
              col,
              op: '==',
              val,
              formattedVal,
              grain: formatter ? timeGrainSqla : undefined,
            });
          });
        }
        const drillDataPoint =
          customPeriodComparison &&
          dataPoint &&
          Object.keys(dataPoint).some(
            col =>
              col === METRIC_KEY ||
              col === PERIOD_KEY ||
              customPeriodTemporalDimensions.includes(col),
          )
            ? undefined
            : dataPoint;
        onContextMenu(e.clientX, e.clientY, {
          drillToDetail: drillToDetailFilters,
          crossFilter: dataPoint
            ? getCrossFilterDataMask(dataPoint)
            : undefined,
          drillBy: drillDataPoint && {
            filters: [
              {
                col: Object.keys(drillDataPoint)[0],
                op: '==',
                val: Object.values(drillDataPoint)[0],
              },
            ],
            groupbyFieldName: rowKey ? 'groupbyRows' : 'groupbyColumns',
          },
        });
      }
    },
    [
      cols,
      dateFormatters,
      getCrossFilterDataMask,
      customPeriodComparison,
      customPeriodTemporalDimensions,
      onContextMenu,
      rows,
      timeGrainSqla,
    ],
  );

  return (
    <Styles height={height} width={width} margin={theme.sizeUnit * 4}>
      <PivotTableWrapper data-personal-sort-scroll="pivot">
        {customPeriodComparison && (
          <div role="note">
            {customPeriodComparisonLabel && (
              <div>{customPeriodComparisonLabel}</div>
            )}
            超过行数限制时不计算对比；四类对比值不互相求和。对齐日期仅用于展示，不参与日期筛选或钻取。
          </div>
        )}
        <PivotTable
          personalSort={personalSort}
          personalSortOrder={personalSortOrder}
          onPersonalSortChange={
            personalSortEnabled
              ? spec => setDataMask({ ownState: { ...ownState, personalSort: spec } })
              : undefined
          }
          frozenColumnCount={frozenColumnCount}
          frozenColumnKey={frozenColumnKey}
          freezeMetricIds={freezeMetricIds}
          freezeMetricAxis={METRIC_KEY}
          data={unpivotedData}
          rows={rows}
          cols={cols}
          aggregatorsFactory={
            customPeriodComparison
              ? comparisonAggregatorsFactory
              : aggregatorsFactory
          }
          defaultFormatter={defaultFormatter}
          customFormatters={metricFormatters}
          customAggregatorNames={metricAggregatorNames}
          aggregatorName={
            customPeriodComparison ? 'Custom period' : aggregateFunction
          }
          vals={vals}
          colOrder={colOrder}
          rowOrder={rowOrder}
          sorters={sorters}
          tableOptions={tableOptions}
          subtotalOptions={subtotalOptions}
          namesMapping={namesMapping}
          onContextMenu={handleContextMenu}
          allowRenderHtml={allowRenderHtml}
        />
      </PivotTableWrapper>
    </Styles>
  );
}
