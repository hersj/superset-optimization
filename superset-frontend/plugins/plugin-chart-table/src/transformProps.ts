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
import memoizeOne from 'memoize-one';
import { t } from '@apache-superset/core/translation';
import {
  ComparisonType,
  getCustomPeriodComparison,
  mergeCustomPeriodComparisonRows,
  calculatePeriodDifference,
  CUSTOM_PERIOD_SUFFIX,
  CurrencyFormatter,
  Currency,
  DataRecord,
  ensureIsArray,
  extractTimegrain,
  getMetricLabel,
  getPersonalSortOptions,
  normalizePersonalSort,
  getNumberFormatter,
  getTimeFormatter,
  getTimeFormatterForGranularity,
  normalizeCurrency,
  NumberFormats,
  QueryMode,
  SMART_DATE_ID,
  TimeFormats,
  TimeFormatter,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import {
  ColorFormatters,
  ConditionalFormattingConfig,
  getColorFormatters,
  ColorSchemeEnum,
} from '@superset-ui/chart-controls';

import { isEmpty, merge } from 'lodash';
import isEqualColumns from './utils/isEqualColumns';
import DateWithFormatter from './utils/DateWithFormatter';
import {
  BasicColorFormatterType,
  DataColumnMeta,
  TableChartProps,
  TableChartTransformedProps,
  TableColumnConfig,
} from './types';

const { PERCENT_3_POINT } = NumberFormats;
const { DATABASE_DATETIME } = TimeFormats;

function isNumeric(key: string, data: DataRecord[] = []) {
  return data.every(
    x => x[key] === null || x[key] === undefined || typeof x[key] === 'number',
  );
}

const processDataRecords = memoizeOne(function processDataRecords(
  data: DataRecord[] | undefined,
  columns: DataColumnMeta[],
) {
  if (!data?.[0]) {
    return data || [];
  }
  const timeColumns = columns.filter(
    column => column.dataType === GenericDataType.Temporal,
  );

  if (timeColumns.length > 0) {
    return data.map(x => {
      const datum = { ...x };
      timeColumns.forEach(({ key, formatter }) => {
        // Convert datetime with a custom date class so we can use `String(...)`
        // formatted value for global search, and `date.getTime()` for sorting.
        datum[key] = new DateWithFormatter(x[key], {
          formatter: formatter as TimeFormatter,
        });
      });
      return datum;
    });
  }
  return data;
});

// Create a map to store cached values per slice
const sliceCache = new Map<
  number,
  {
    cachedServerLength: number;
    passedColumns?: DataColumnMeta[];
  }
>();

const calculateDifferences = (
  originalValue: number,
  comparisonValue: number,
) => {
  const valueDifference = originalValue - comparisonValue;
  let percentDifferenceNum;
  if (!originalValue && !comparisonValue) {
    percentDifferenceNum = 0;
  } else if (!originalValue || !comparisonValue) {
    percentDifferenceNum = originalValue ? 1 : -1;
  } else {
    percentDifferenceNum =
      (originalValue - comparisonValue) / Math.abs(comparisonValue);
  }
  return { valueDifference, percentDifferenceNum };
};

const processComparisonTotals = (
  comparisonSuffix: string,
  totals?: DataRecord[],
): DataRecord | undefined => {
  if (!totals) {
    return totals;
  }
  const transformedTotals: DataRecord = {};
  totals.map((totalRecord: DataRecord) =>
    Object.keys(totalRecord).forEach(key => {
      if (totalRecord[key] !== undefined && !key.includes(comparisonSuffix)) {
        transformedTotals[`Main ${key}`] =
          parseInt(transformedTotals[`Main ${key}`]?.toString() || '0', 10) +
          parseInt(totalRecord[key]?.toString() || '0', 10);
        transformedTotals[`# ${key}`] =
          parseInt(transformedTotals[`# ${key}`]?.toString() || '0', 10) +
          parseInt(
            totalRecord[`${key}__${comparisonSuffix}`]?.toString() || '0',
            10,
          );
        const { valueDifference, percentDifferenceNum } = calculateDifferences(
          transformedTotals[`Main ${key}`] as number,
          transformedTotals[`# ${key}`] as number,
        );
        transformedTotals[`△ ${key}`] = valueDifference;
        transformedTotals[`% ${key}`] = percentDifferenceNum;
      }
    }),
  );

  return transformedTotals;
};

const processComparisonDataRecords = memoizeOne(
  function processComparisonDataRecords(
    originalData: DataRecord[] | undefined,
    originalColumns: DataColumnMeta[],
    comparisonSuffix: string,
    customPeriod = false,
  ) {
    // Transform data
    return originalData?.map(originalItem => {
      const transformedItem: DataRecord = {};
      originalColumns.forEach(origCol => {
        if (
          (origCol.isMetric || origCol.isPercentMetric) &&
          !origCol.key.includes(comparisonSuffix) &&
          origCol.isNumeric
        ) {
          const originalValue = customPeriod
            ? (originalItem[origCol.key] ?? null)
            : originalItem[origCol.key] || 0;
          const comparisonValue = customPeriod
            ? (originalItem[`${origCol.key}__${comparisonSuffix}`] ?? null)
            : origCol.isMetric
              ? originalItem?.[`${origCol.key}__${comparisonSuffix}`] || 0
              : originalItem[`%${origCol.key.slice(1)}__${comparisonSuffix}`] ||
                0;
          const { valueDifference, percentDifferenceNum } = (
            customPeriod ? calculatePeriodDifference : calculateDifferences
          )(originalValue as number, comparisonValue as number);

          transformedItem[`Main ${origCol.key}`] = originalValue;
          transformedItem[`# ${origCol.key}`] = comparisonValue;
          transformedItem[`△ ${origCol.key}`] = valueDifference;
          transformedItem[`% ${origCol.key}`] = percentDifferenceNum;
        }
      });

      Object.keys(originalItem).forEach(key => {
        const isMetricOrPercentMetric = originalColumns.some(
          col => col.key === key && (col.isMetric || col.isPercentMetric),
        );
        if (!isMetricOrPercentMetric) {
          transformedItem[key] = originalItem[key];
        }
      });

      return transformedItem;
    });
  },
);

const processColumns = memoizeOne(function processColumns(
  props: TableChartProps,
) {
  const {
    datasource: {
      columnFormats,
      currencyFormats,
      verboseMap,
      currencyCodeColumn,
    },
    rawFormData: {
      table_timestamp_format: tableTimestampFormat,
      metrics: metrics_,
      percent_metrics: percentMetrics_,
      column_config: columnConfig = {},
      query_mode: queryMode,
    },
    rawDatasource,
    queriesData,
  } = props;
  const granularity = extractTimegrain(props.rawFormData);
  const {
    data: records,
    colnames,
    coltypes,
    detected_currency: detectedCurrency,
  } = queriesData[0] || {};
  // convert `metrics` and `percentMetrics` to the key names in `data.records`
  const metrics = (metrics_ ?? []).map(getMetricLabel);
  const rawPercentMetrics = (percentMetrics_ ?? []).map(getMetricLabel);
  // column names for percent metrics always starts with a '%' sign.
  const percentMetrics = rawPercentMetrics.map((x: string) => `%${x}`);
  const metricsSet = new Set(metrics);
  const percentMetricsSet = new Set(percentMetrics);
  const rawPercentMetricsSet = new Set(rawPercentMetrics);

  const columns: DataColumnMeta[] = (colnames || [])
    .filter(
      key =>
        // if a metric was only added to percent_metrics, they should not show up in the table.
        !(rawPercentMetricsSet.has(key) && !metricsSet.has(key)),
    )
    .map((key: string, i) => {
      const dataType = coltypes[i];
      const config = columnConfig[key] || {};
      // for the purpose of presentation, only numeric values are treated as metrics
      // because users can also add things like `MAX(str_col)` as a metric.
      const isMetric = metricsSet.has(key) && isNumeric(key, records);
      const isPercentMetric = percentMetricsSet.has(key);
      const label =
        isPercentMetric && verboseMap?.hasOwnProperty(key.replace('%', ''))
          ? `%${verboseMap[key.replace('%', '')]}`
          : verboseMap?.[key] || key;
      const isTime = dataType === GenericDataType.Temporal;
      const isNumber = dataType === GenericDataType.Numeric;
      const savedFormat = columnFormats?.[key];
      const savedCurrency = currencyFormats?.[key];
      const numberFormat = config.d3NumberFormat || savedFormat;
      const currency = config.currencyFormat?.symbol
        ? config.currencyFormat
        : savedCurrency;

      const description =
        rawDatasource.columns?.find((item: any) => item.column_name === key)
          ?.description ??
        rawDatasource.metrics?.find((item: any) => item.metric_name === key)
          ?.description;

      let formatter;

      if (isTime || config.d3TimeFormat) {
        // string types may also apply d3-time format
        // pick adhoc format first, fallback to column level formats defined in
        // datasource
        const customFormat = config.d3TimeFormat || savedFormat;
        const timeFormat = customFormat || tableTimestampFormat;
        // When format is "Adaptive Formatting" (smart_date)
        if (timeFormat === SMART_DATE_ID) {
          if (granularity && queryMode !== QueryMode.Raw) {
            // time column use formats based on granularity
            formatter = getTimeFormatterForGranularity(granularity);
          } else if (customFormat) {
            // other columns respect the column-specific format
            formatter = getTimeFormatter(customFormat);
          } else if (isNumeric(key, records)) {
            // if column is numeric values, it is considered a timestamp64
            formatter = getTimeFormatter(DATABASE_DATETIME);
          } else {
            // if no column-specific format, print cell as is
            formatter = String;
          }
        } else if (timeFormat) {
          formatter = getTimeFormatter(timeFormat);
        }
      } else if (isPercentMetric) {
        // percent metrics have a default format
        formatter = getNumberFormatter(numberFormat || PERCENT_3_POINT);
      } else if (isMetric || (isNumber && (numberFormat || currency))) {
        // Resolve AUTO currency when currency column isn't in query results
        let resolvedCurrency = currency;
        if (
          currency?.symbol === 'AUTO' &&
          detectedCurrency &&
          (!currencyCodeColumn || !colnames?.includes(currencyCodeColumn))
        ) {
          const normalizedCurrency = normalizeCurrency(detectedCurrency);
          if (normalizedCurrency) {
            resolvedCurrency = {
              ...currency,
              symbol: normalizedCurrency,
            };
          }
        }
        formatter = resolvedCurrency?.symbol
          ? new CurrencyFormatter({
              d3Format: numberFormat,
              currency: resolvedCurrency,
            })
          : getNumberFormatter(numberFormat);
      }
      return {
        key,
        label,
        dataType,
        isNumeric: dataType === GenericDataType.Numeric,
        isMetric,
        isPercentMetric,
        formatter,
        config,
        description,
        currencyCodeColumn,
      };
    });
  return [metrics, percentMetrics, columns] as [
    typeof metrics,
    typeof percentMetrics,
    typeof columns,
  ];
}, isEqualColumns);

const getComparisonColConfig = (
  label: string,
  parentColKey: string,
  columnConfig: Record<string, TableColumnConfig>,
) => {
  const comparisonKey = `${label} ${parentColKey}`;
  // Older Chinese configurations persisted the translated label as the key.
  const comparisonColConfig =
    columnConfig[comparisonKey] ||
    (label === 'Main' &&
      (columnConfig[`主项 ${parentColKey}`] ||
        columnConfig[`${t('Main')} ${parentColKey}`])) ||
    {};
  return comparisonColConfig;
};

const getComparisonColFormatter = (
  label: string,
  parentCol: DataColumnMeta,
  columnConfig: Record<string, TableColumnConfig>,
  savedFormat: string | undefined,
  savedCurrency: Currency | undefined,
) => {
  const currentColConfig = getComparisonColConfig(
    label,
    parentCol.key,
    columnConfig,
  );
  const hasCurrency = currentColConfig.currencyFormat?.symbol;
  const currentColNumberFormat =
    // fallback to parent's number format if not set
    currentColConfig.d3NumberFormat || parentCol.config?.d3NumberFormat;
  let { formatter } = parentCol;
  if (label === '%') {
    formatter = getNumberFormatter(currentColNumberFormat || PERCENT_3_POINT);
  } else if (currentColNumberFormat || hasCurrency) {
    const currency = currentColConfig.currencyFormat || savedCurrency;
    const numberFormat = currentColNumberFormat || savedFormat;
    formatter = currency
      ? new CurrencyFormatter({
          d3Format: numberFormat,
          currency,
        })
      : getNumberFormatter(numberFormat);
  }
  return formatter;
};

const processComparisonColumns = (
  columns: DataColumnMeta[],
  props: TableChartProps,
  comparisonSuffix: string,
) =>
  columns.flatMap(col => {
    const {
      datasource: { columnFormats, currencyFormats },
      rawFormData: { column_config: columnConfig = {} },
    } = props;
    const savedFormat = columnFormats?.[col.key];
    const savedCurrency = currencyFormats?.[col.key];
    const originalLabel = col.label;
    if (
      (col.isMetric || col.isPercentMetric) &&
      !col.key.includes(comparisonSuffix) &&
      col.isNumeric
    ) {
      return [
        {
          ...col,
          originalLabel,
          label: t('Main'),
          key: `Main ${col.key}`,
          config: getComparisonColConfig('Main', col.key, columnConfig),
          formatter: getComparisonColFormatter(
            'Main',
            col,
            columnConfig,
            savedFormat,
            savedCurrency,
          ),
        },
        {
          ...col,
          originalLabel,
          label: `#`,
          key: `# ${col.key}`,
          config: getComparisonColConfig(`#`, col.key, columnConfig),
          formatter: getComparisonColFormatter(
            `#`,
            col,
            columnConfig,
            savedFormat,
            savedCurrency,
          ),
        },
        {
          ...col,
          originalLabel,
          label: `△`,
          key: `△ ${col.key}`,
          config: getComparisonColConfig(`△`, col.key, columnConfig),
          formatter: getComparisonColFormatter(
            `△`,
            col,
            columnConfig,
            savedFormat,
            savedCurrency,
          ),
        },
        {
          ...col,
          originalLabel,
          label: `%`,
          key: `% ${col.key}`,
          config: getComparisonColConfig(`%`, col.key, columnConfig),
          formatter: getComparisonColFormatter(
            `%`,
            col,
            columnConfig,
            savedFormat,
            savedCurrency,
          ),
        },
      ];
    }
    if (
      !col.isMetric &&
      !col.isPercentMetric &&
      !col.key.includes(comparisonSuffix)
    ) {
      return [col];
    }
    return [];
  });

/**
 * Automatically set page size based on number of cells.
 */
const getPageSize = (
  pageSize: number | string | null | undefined,
  numRecords: number,
  numColumns: number,
) => {
  if (typeof pageSize === 'number') {
    // NaN is also has typeof === 'number'
    return pageSize || 0;
  }
  if (typeof pageSize === 'string') {
    return Number(pageSize) || 0;
  }
  // when pageSize not set, automatically add pagination if too many records
  return numRecords * numColumns > 5000 ? 200 : 0;
};

const defaultServerPaginationData = {};
const defaultColorFormatters = [] as ColorFormatters;
const transformProps = (
  chartProps: TableChartProps,
): TableChartTransformedProps => {
  const customPeriod = getCustomPeriodComparison(chartProps.rawFormData);
  let customTotals: DataRecord | undefined;
  if (customPeriod) {
    const { rawFormData, queriesData } = chartProps;
    const queryCount = queriesData.length / 2;
    if (!Number.isInteger(queryCount) || !queriesData[queryCount]) {
      throw new Error('Custom period comparison is missing a query result.');
    }
    const [current] = queriesData;
    const comparison = queriesData[queryCount];
    if (
      [current, comparison].some(
        query => query.data.length > Number(rawFormData.row_limit),
      )
    ) {
      throw new Error(
        'Custom period comparison exceeded the row limit; increase the limit or narrow filters.',
      );
    }
    const temporalDimensions = current.colnames.filter(
      (_, index) => current.coltypes[index] === GenericDataType.Temporal,
    );
    const metricNames = [
      ...(rawFormData.metrics ?? []).map(getMetricLabel),
      ...(rawFormData.percent_metrics ?? []).map(
        metric => `%${getMetricLabel(metric)}`,
      ),
    ];
    if (
      [...current.data, ...comparison.data].some(row =>
        metricNames.some(
          metric =>
            row[metric] != null &&
            (typeof row[metric] !== 'number' || !Number.isFinite(row[metric])),
        ),
      )
    ) {
      throw new Error('Custom period comparison requires numeric metrics.');
    }
    const dimensions = current.colnames.filter(
      name =>
        !metricNames.includes(name) &&
        !(rawFormData.percent_metrics ?? []).map(getMetricLabel).includes(name),
    );
    const allRecordsContribution =
      rawFormData.percent_metric_calculation === 'all_records' &&
      !!rawFormData.percent_metrics?.length;
    const contributionData = (
      records: DataRecord[],
      denominator?: DataRecord,
    ) =>
      records.map(row => {
        const result = { ...row };
        (rawFormData.percent_metrics ?? []).forEach(metric => {
          const name = getMetricLabel(metric);
          const value = row[name];
          const total = denominator?.[name];
          if (denominator) {
            result[`%${name}`] =
              typeof value === 'number' &&
              typeof total === 'number' &&
              total !== 0
                ? value / total
                : null;
          }
        });
        return result;
      });
    const data = mergeCustomPeriodComparisonRows(
      allRecordsContribution
        ? contributionData(current.data, queriesData[1]?.data[0])
        : current.data,
      allRecordsContribution
        ? contributionData(
            comparison.data,
            queriesData[queryCount + 1]?.data[0],
          )
        : comparison.data,
      dimensions,
      metricNames,
      customPeriod,
      extractTimegrain(rawFormData),
      temporalDimensions,
    );
    const totalIndex = allRecordsContribution ? 2 : 1;
    if (rawFormData.show_totals && queryCount <= totalIndex) {
      throw new Error('Custom period comparison is missing aggregate totals.');
    }
    if (
      rawFormData.show_totals &&
      queriesData[totalIndex] &&
      queriesData[queryCount + totalIndex]
    ) {
      const mergedTotals = mergeCustomPeriodComparisonRows(
        contributionData(
          queriesData[totalIndex].data,
          queriesData[totalIndex].data[0],
        ),
        contributionData(
          queriesData[queryCount + totalIndex].data,
          queriesData[queryCount + totalIndex].data[0],
        ),
        [],
        metricNames,
        customPeriod,
      );
      [customTotals] = mergedTotals;
    }
    const columnConfig = { ...rawFormData.column_config };
    temporalDimensions.forEach(name => {
      columnConfig[name] = { ...columnConfig[name], d3TimeFormat: undefined };
    });
    chartProps = {
      ...chartProps,
      rawFormData: { ...rawFormData, column_config: columnConfig },
      queriesData: [
        {
          ...current,
          data,
          rowcount: data.length,
          coltypes: current.coltypes.map((type, index) =>
            temporalDimensions.includes(current.colnames[index])
              ? GenericDataType.String
              : type,
          ),
        },
        ...queriesData.slice(1),
      ],
    };
  }
  const {
    height,
    width,
    rawFormData: originalFormData,
    queriesData = [],
    filterState,
    ownState: serverPaginationData,
    hooks: {
      onAddFilter: onChangeFilter,
      setDataMask = () => {},
      setControlValue,
      onContextMenu,
    },
    emitCrossFilters,
    theme,
  } = chartProps;

  const formData = merge(
    {},
    originalFormData,
    originalFormData.extra_form_data,
  );

  const {
    align_pn: alignPositiveNegative = true,
    color_pn: colorPositiveNegative = true,
    show_cell_bars: showCellBars = true,
    include_search: includeSearch = false,
    page_length: pageLength,
    server_pagination: serverPagination = false,
    server_page_length: serverPageLength = 10,
    order_desc: sortDesc = false,
    query_mode: queryMode,
    show_totals: showTotals,
    conditional_formatting: conditionalFormatting,
    allow_rearrange_columns: allowRearrangeColumns,
    allow_render_html: allowRenderHtml,
    time_compare,
    comparison_color_enabled: comparisonColorEnabled = false,
    comparison_color_scheme: comparisonColorScheme = ColorSchemeEnum.Green,
    comparison_type,
    slice_id,
  } = formData;
  const isUsingTimeComparison =
    !!customPeriod ||
    (!isEmpty(time_compare) &&
      queryMode === QueryMode.Aggregate &&
      comparison_type === ComparisonType.Values);

  const calculateBasicStyle = (
    percentDifferenceNum: number,
    colorOption: ColorSchemeEnum,
  ) => {
    if (percentDifferenceNum === 0) {
      return {
        arrow: '',
        arrowColor: '',
        // eslint-disable-next-line theme-colors/no-literal-colors
        backgroundColor: 'rgba(0,0,0,0.2)',
      };
    }
    const isPositive = percentDifferenceNum > 0;
    const arrow = isPositive ? '↑' : '↓';
    const arrowColor =
      colorOption === ColorSchemeEnum.Green
        ? isPositive
          ? ColorSchemeEnum.Green
          : ColorSchemeEnum.Red
        : isPositive
          ? ColorSchemeEnum.Red
          : ColorSchemeEnum.Green;
    const backgroundColor =
      colorOption === ColorSchemeEnum.Green
        ? `rgba(${isPositive ? '0,150,0' : '150,0,0'},0.2)`
        : `rgba(${isPositive ? '150,0,0' : '0,150,0'},0.2)`;

    return { arrow, arrowColor, backgroundColor };
  };

  const nonCustomNorInheritShifts = ensureIsArray(formData.time_compare).filter(
    (shift: string) => shift !== 'custom' && shift !== 'inherit',
  );
  const customOrInheritShifts = ensureIsArray(formData.time_compare).filter(
    (shift: string) => shift === 'custom' || shift === 'inherit',
  );

  let timeOffsets: string[] = [];

  if (isUsingTimeComparison && !isEmpty(nonCustomNorInheritShifts)) {
    timeOffsets = nonCustomNorInheritShifts;
  }

  // Shifts for custom or inherit time comparison
  if (isUsingTimeComparison && !isEmpty(customOrInheritShifts)) {
    if (customOrInheritShifts.includes('custom')) {
      timeOffsets = timeOffsets.concat([formData.start_date_offset]);
    }
    if (customOrInheritShifts.includes('inherit')) {
      timeOffsets = timeOffsets.concat(['inherit']);
    }
  }

  const getBasicColorFormatter = memoizeOne(function getBasicColorFormatter(
    originalData: DataRecord[] | undefined,
    originalColumns: DataColumnMeta[],
    selectedColumns?: ConditionalFormattingConfig[],
  ) {
    // Transform data
    const relevantColumns = selectedColumns
      ? originalColumns.filter(col =>
          selectedColumns.some(scol => scol?.column?.includes(col.key)),
        )
      : originalColumns;

    return originalData?.map(originalItem => {
      const item: { [key: string]: BasicColorFormatterType } = {};
      relevantColumns.forEach(origCol => {
        if (
          (origCol.isMetric || origCol.isPercentMetric) &&
          !origCol.key.includes(
            customPeriod ? CUSTOM_PERIOD_SUFFIX : ensureIsArray(timeOffsets)[0],
          ) &&
          origCol.isNumeric
        ) {
          const originalValue = customPeriod
            ? (originalItem[origCol.key] ?? null)
            : originalItem[origCol.key] || 0;
          const comparisonValue = customPeriod
            ? (originalItem[`${origCol.key}__${CUSTOM_PERIOD_SUFFIX}`] ?? null)
            : origCol.isMetric
              ? originalItem?.[
                  `${origCol.key}__${customPeriod ? CUSTOM_PERIOD_SUFFIX : ensureIsArray(timeOffsets)[0]}`
                ] || 0
              : originalItem[
                  `%${origCol.key.slice(1)}__${customPeriod ? CUSTOM_PERIOD_SUFFIX : ensureIsArray(timeOffsets)[0]}`
                ] || 0;
          const { percentDifferenceNum } = (
            customPeriod ? calculatePeriodDifference : calculateDifferences
          )(originalValue as number, comparisonValue as number);

          if (percentDifferenceNum === null) return;

          if (selectedColumns) {
            selectedColumns.forEach(col => {
              if (col?.column?.includes(origCol.key)) {
                const { arrow, arrowColor, backgroundColor } =
                  calculateBasicStyle(
                    percentDifferenceNum,
                    col.colorScheme || comparisonColorScheme,
                  );
                item[col.column] = {
                  mainArrow: arrow,
                  arrowColor,
                  backgroundColor,
                };
              }
            });
          } else {
            const { arrow, arrowColor, backgroundColor } = calculateBasicStyle(
              percentDifferenceNum,
              comparisonColorScheme,
            );
            item[`${origCol.key}`] = {
              mainArrow: arrow,
              arrowColor,
              backgroundColor,
            };
          }
        }
      });
      return item;
    });
  });

  const getBasicColorFormatterForColumn = (
    originalData: DataRecord[] | undefined,
    originalColumns: DataColumnMeta[],
    conditionalFormatting?: ConditionalFormattingConfig[],
  ) => {
    const selectedColumns = conditionalFormatting?.filter(
      (config: ConditionalFormattingConfig) =>
        config.column &&
        (config.colorScheme === ColorSchemeEnum.Green ||
          config.colorScheme === ColorSchemeEnum.Red),
    );

    return selectedColumns?.length
      ? getBasicColorFormatter(originalData, originalColumns, selectedColumns)
      : undefined;
  };

  const timeGrain = extractTimegrain(formData);

  const comparisonSuffix = customPeriod
    ? CUSTOM_PERIOD_SUFFIX
    : isUsingTimeComparison
      ? ensureIsArray(timeOffsets)[0]
      : '';

  const [metrics, percentMetrics, columns] = processColumns(chartProps);
  let comparisonColumns: DataColumnMeta[] = [];
  if (isUsingTimeComparison) {
    comparisonColumns = processComparisonColumns(
      columns,
      chartProps,
      comparisonSuffix,
    );
    if (customPeriod) {
      const labels: Record<string, string> = {
        Main: t('Current'),
        '#': t('Comparison'),
        '△': t('Difference'),
        '%': t('Percent change'),
      };
      comparisonColumns = comparisonColumns.map(column => {
        const [prefix] = column.key.split(' ');
        if (!labels[prefix] || (!column.isMetric && !column.isPercentMetric))
          return column;
        const parent = columns.find(
          item => column.key === `${prefix} ${item.key}`,
        );
        const format =
          parent?.config?.d3NumberFormat ||
          chartProps.datasource.columnFormats?.[parent?.key || ''];
        return {
          ...column,
          config: {
            ...column.config,
            visible: true,
            customColumnName: labels[prefix],
            displayTypeIcon: false,
          },
          description:
            prefix === 'Main'
              ? customPeriod.currentTimeRange
              : prefix === '#'
                ? customPeriod.comparisonTimeRange
                : column.description,
          formatter:
            prefix === '%'
              ? getNumberFormatter(
                  column.config?.d3NumberFormat?.includes('%')
                    ? column.config.d3NumberFormat
                    : PERCENT_3_POINT,
                )
              : prefix === '△' &&
                  (parent?.isPercentMetric || format?.includes('%'))
                ? (value: number) =>
                    `${getNumberFormatter('.1f')(Number(value) * 100)} pp`
                : column.formatter,
        };
      });
    }
  }

  let baseQuery;
  let countQuery;
  let totalQuery;
  let rowCount;
  if (serverPagination) {
    [baseQuery, countQuery, totalQuery] = queriesData;
    rowCount = (countQuery?.data?.[0]?.rowcount as number) ?? 0;
  } else {
    [baseQuery, totalQuery] = queriesData;
    rowCount = baseQuery?.rowcount ?? 0;
  }
  const data = processDataRecords(baseQuery?.data, columns);
  const comparisonData = processComparisonDataRecords(
    baseQuery?.data,
    columns,
    comparisonSuffix,
    !!customPeriod,
  );
  const totals =
    showTotals && queryMode === QueryMode.Aggregate
      ? isUsingTimeComparison
        ? customPeriod
          ? processComparisonDataRecords(
              customTotals ? [customTotals] : [],
              columns,
              comparisonSuffix,
              true,
            )?.[0]
          : processComparisonTotals(comparisonSuffix, totalQuery?.data)
        : totalQuery?.data[0]
      : undefined;

  const passedData = isUsingTimeComparison ? comparisonData || [] : data;
  const sourceColumns = isUsingTimeComparison ? comparisonColumns : columns;
  const passedColumns = sourceColumns.some(
    col => col.config?.displayOrder !== undefined,
  )
    ? [...sourceColumns].sort(
        (a, b) =>
          (a.config?.displayOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.config?.displayOrder ?? Number.MAX_SAFE_INTEGER),
      )
    : sourceColumns;

  const basicColorFormatters =
    comparisonColorEnabled && getBasicColorFormatter(baseQuery?.data, columns);
  const columnColorFormatters =
    getColorFormatters(conditionalFormatting, passedData, theme) ??
    defaultColorFormatters;

  const basicColorColumnFormatters = getBasicColorFormatterForColumn(
    baseQuery?.data,
    columns,
    conditionalFormatting,
  );

  // Get cached values for this slice
  const cachedValues = sliceCache.get(slice_id);
  let hasServerPageLengthChanged = false;

  if (
    cachedValues?.cachedServerLength !== undefined &&
    cachedValues.cachedServerLength !== serverPageLength
  ) {
    hasServerPageLengthChanged = true;
  }

  // Update cache with new values
  sliceCache.set(slice_id, {
    cachedServerLength: serverPageLength,
    passedColumns:
      Array.isArray(passedColumns) && passedColumns?.length > 0
        ? passedColumns
        : cachedValues?.passedColumns,
  });

  const startDateOffset = chartProps.rawFormData?.start_date_offset;
  return {
    frozenColumns: Number(formData.frozen_columns) || 0,
    onFrozenColumnsChange: setControlValue
      ? (count: number) => setControlValue('frozen_columns', count)
      : undefined,
    height,
    width,
    isRawRecords: queryMode === QueryMode.Raw,
    data: passedData,
    totals,
    columns:
      Array.isArray(passedColumns) && passedColumns?.length > 0
        ? passedColumns
        : cachedValues?.passedColumns || [],
    ...(Object.prototype.hasOwnProperty.call(originalFormData, 'personal_sort')
      ? {
          personalSortEnabled: true,
          personalSort:
            normalizePersonalSort(originalFormData.personal_sort, originalFormData) ??
            null,
        }
      : {}),
    ownState: serverPaginationData,
    sortFields: Object.fromEntries(
      getPersonalSortOptions(originalFormData).flatMap(option =>
        (passedColumns?.length ? passedColumns : cachedValues?.passedColumns ?? []).flatMap(column =>
          column.key === option.label ||
          column.key === option.value ||
          column.key === `Main ${option.label}`
            ? [[column.key, { mode: option.kind, field: option.value }]]
            : [],
        ),
      ),
    ),
    serverPagination,
    metrics,
    percentMetrics,
    serverPaginationData: serverPagination || Object.prototype.hasOwnProperty.call(originalFormData, 'personal_sort')
      ? serverPaginationData
      : defaultServerPaginationData,
    setDataMask,
    alignPositiveNegative,
    colorPositiveNegative,
    showCellBars,
    sortDesc,
    includeSearch,
    rowCount,
    pageSize: serverPagination
      ? serverPaginationData?.pageSize
        ? serverPaginationData?.pageSize
        : serverPageLength
      : getPageSize(pageLength, data.length, columns.length),
    filters: filterState.filters,
    emitCrossFilters: customPeriod ? false : emitCrossFilters,
    onChangeFilter,
    columnColorFormatters,
    timeGrain,
    allowRearrangeColumns,
    allowRenderHtml,
    onContextMenu: customPeriod ? undefined : onContextMenu,
    isUsingTimeComparison,
    customPeriodComparison: customPeriod,
    basicColorFormatters,
    startDateOffset,
    basicColorColumnFormatters,
    hasServerPageLengthChanged,
    serverPageLength,
    slice_id,
  };
};

export default transformProps;
