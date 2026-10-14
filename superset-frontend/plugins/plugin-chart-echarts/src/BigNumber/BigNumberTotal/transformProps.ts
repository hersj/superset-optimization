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
  ColorFormatters,
  getColorFormatters,
  Metric,
} from '@superset-ui/chart-controls';
import {
  getMetricLabel,
  extractTimegrain,
  QueryFormData,
  getValueFormatter,
  formatCustomPeriodComparisonLabel,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import { BigNumberTotalChartProps, BigNumberVizProps } from '../types';
import { getDateFormatter, getOriginalLabel, parseMetricValue } from '../utils';
import { Refs } from '../../types';
import {
  formatBigNumberPeriodComparison,
  parseBigNumberPeriodValue,
  getBigNumberCustomPeriod,
} from '../customComparison';

type ComparisonMode = 'previous' | 'year';
type ComparisonDisplay = 'percent' | 'delta_percent';

const DEFAULT_COMPARISON_MODES: ComparisonMode[] = ['previous', 'year'];
const COMPARISON_LABELS: Record<ComparisonMode, string> = {
  previous: '环比',
  year: '同比',
};

function getFormDataValue<T>(
  formData: QueryFormData,
  snakeKey: string,
  camelKey: string,
): T | undefined {
  const values = formData as Record<string, T | undefined>;
  return values[snakeKey] ?? values[camelKey];
}

function getComparisonModes(formData: QueryFormData): ComparisonMode[] {
  const rawModes = getFormDataValue<ComparisonMode | ComparisonMode[]>(
    formData,
    'comparison_modes',
    'comparisonModes',
  );
  if (rawModes === undefined) {
    return DEFAULT_COMPARISON_MODES;
  }
  const modes = Array.isArray(rawModes) ? rawModes : [rawModes];
  return modes.filter(
    (mode): mode is ComparisonMode => mode === 'previous' || mode === 'year',
  );
}

function isComparisonEnabled(formData: QueryFormData): boolean {
  return (
    getFormDataValue<boolean>(
      formData,
      'comparison_enabled',
      'comparisonEnabled',
    ) !== false
  );
}

function getComparisonDisplay(formData: QueryFormData): ComparisonDisplay {
  const display = getFormDataValue<ComparisonDisplay>(
    formData,
    'comparison_display',
    'comparisonDisplay',
  );
  return display === 'delta_percent' ? 'delta_percent' : 'percent';
}

function formatPercentChange(current: number, baseline: number): string {
  let change: number;
  if (baseline === 0 && current === 0) {
    change = 0;
  } else if (baseline === 0) {
    change = current > 0 ? 1 : -1;
  } else {
    change = (current - baseline) / Math.abs(baseline);
  }
  const percent = change * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

function formatDelta(
  current: number,
  baseline: number,
  formatter: (value: number) => string,
): string {
  const delta = current - baseline;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatter(delta)}`;
}

function getComparisonText(
  current: number | null,
  comparisonValues: Partial<Record<ComparisonMode, number | null>>,
  modes: ComparisonMode[],
  display: ComparisonDisplay,
  formatter: (value: number) => string,
): string {
  if (current === null) {
    return '';
  }

  return modes
    .map(mode => {
      const baseline = comparisonValues[mode];
      if (baseline === null || baseline === undefined) {
        return null;
      }
      const percentText = formatPercentChange(current, baseline);
      if (display === 'delta_percent') {
        return `${COMPARISON_LABELS[mode]} ${formatDelta(
          current,
          baseline,
          formatter,
        )} (${percentText})`;
      }
      return `${COMPARISON_LABELS[mode]} ${percentText}`;
    })
    .filter((label): label is string => Boolean(label))
    .join(' | ');
}

export default function transformProps(
  chartProps: BigNumberTotalChartProps,
): BigNumberVizProps {
  const {
    width,
    height,
    queriesData,
    formData,
    rawFormData,
    hooks,
    datasource: {
      currencyFormats = {},
      columnFormats = {},
      currencyCodeColumn,
    },
    theme,
  } = chartProps;
  const {
    metricNameFontSize,
    headerFontSize,
    metric = 'value',
    subtitle,
    subtitleFontSize,
    forceTimestampFormatting,
    timeFormat,
    yAxisFormat,
    conditionalFormatting,
    currencyFormat,
    subheader,
    subheaderFontSize,
  } = formData;
  const refs: Refs = {};
  const {
    data = [],
    coltypes = [],
    detected_currency: detectedCurrency,
  } = queriesData[0] || {};
  const granularity = extractTimegrain(rawFormData as QueryFormData);
  const metrics = chartProps.datasource?.metrics || [];
  const originalLabel = getOriginalLabel(metric, metrics);
  const metricName = getMetricLabel(metric);
  const showMetricName = chartProps.rawFormData?.show_metric_name ?? false;
  const formattedSubtitle = subtitle?.trim() ? subtitle : subheader || '';
  const formattedSubtitleFontSize = subtitle?.trim()
    ? (subtitleFontSize ?? 1)
    : (subheaderFontSize ?? 1);
  const bigNumber =
    data.length === 0 ? null : parseMetricValue(data[0][metricName]);

  let metricEntry: Metric | undefined;
  if (chartProps.datasource?.metrics) {
    metricEntry = chartProps.datasource.metrics.find(
      metricItem => metricItem.metric_name === metric,
    );
  }

  const formatTime = getDateFormatter(
    timeFormat,
    granularity,
    metricEntry?.d3format,
  );

  const numberFormatter = getValueFormatter(
    metric,
    currencyFormats,
    columnFormats,
    metricEntry?.d3format || yAxisFormat,
    currencyFormat,
    undefined,
    data,
    currencyCodeColumn,
    detectedCurrency,
  );

  const headerFormatter =
    coltypes[0] === GenericDataType.Temporal ||
    coltypes[0] === GenericDataType.String ||
    forceTimestampFormatting
      ? formatTime
      : numberFormatter;

  const customPeriod = getBigNumberCustomPeriod(formData, rawFormData);
  const comparisonModes = getComparisonModes(formData as QueryFormData);
  const comparisonValues = comparisonModes.reduce<
    Partial<Record<ComparisonMode, number | null>>
  >((acc, mode, index) => {
    const comparisonData = queriesData[index + 1]?.data;
    acc[mode] = comparisonData?.length
      ? parseMetricValue(comparisonData[0][metricName])
      : null;
    return acc;
  }, {});
  const comparisonText = customPeriod
    ? formatBigNumberPeriodComparison(
        bigNumber,
        parseBigNumberPeriodValue(queriesData[1]?.data?.[0]?.[metricName]),
        numberFormatter,
      )
    : isComparisonEnabled(formData as QueryFormData)
      ? getComparisonText(
          typeof bigNumber === 'number' ? bigNumber : null,
          comparisonValues,
          comparisonModes,
          getComparisonDisplay(formData as QueryFormData),
          numberFormatter,
        )
      : '';

  const { onContextMenu } = hooks;

  const defaultColorFormatters = [] as ColorFormatters;

  const colorThresholdFormatters =
    getColorFormatters(conditionalFormatting, data, theme, false) ??
    defaultColorFormatters;
  return {
    width,
    height,
    bigNumber,
    headerFormatter,
    headerFontSize,
    subheader: comparisonText || subheader || '',
    subheaderFontSize,
    subtitleFontSize: formattedSubtitleFontSize,
    subtitle: customPeriod
      ? [formatCustomPeriodComparisonLabel(customPeriod), formattedSubtitle]
          .filter(Boolean)
          .join(' | ')
      : formattedSubtitle,
    onContextMenu,
    refs,
    colorThresholdFormatters,
    metricName: originalLabel,
    showMetricName,
    metricNameFontSize,
  };
}
