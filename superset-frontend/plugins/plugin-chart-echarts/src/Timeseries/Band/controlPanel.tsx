/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.
 */
import { t } from '@apache-superset/core/translation';
import {
  ControlPanelConfig,
  ControlPanelsContainerProps,
  ControlSubSectionHeader,
  D3_TIME_FORMAT_DOCS,
  getStandardizedControls,
  sections,
  sharedControls,
} from '@superset-ui/chart-controls';
import { DEFAULT_FORM_DATA, TIME_SERIES_DESCRIPTION_TEXT } from '../constants';
import {
  legendSection,
  showValueControl,
  richTooltipSection,
  seriesOrderSection,
  xAxisLabelRotation,
  xAxisLabelInterval,
  truncateXAxis,
  xAxisBounds,
  minorTicks,
  forceMaxInterval,
} from '../../controls';

const {
  logAxis,
  markerSize,
  minorSplitLine,
  opacity,
  rowLimit,
  truncateYAxis,
  yAxisBounds,
} = DEFAULT_FORM_DATA;

const config: ControlPanelConfig = {
  controlPanelSections: [
    sections.echartsTimeSeriesQueryWithXAxisSort,
    sections.advancedAnalyticsControls,
    sections.annotationsAndLayersControls,
    sections.titleControls,
    {
      label: t('Chart Options'),
      expanded: true,
      controlSetRows: [
        ...seriesOrderSection,
        ['color_scheme'],
        [
          {
            name: 'opacity',
            config: {
              type: 'SliderControl',
              label: t('Band opacity'),
              renderTrigger: true,
              min: 0,
              max: 1,
              step: 0.05,
              default: 0.2,
              description: t('Opacity of the shaded band area.'),
            },
          },
        ],
        [showValueControl],
        [minorTicks],
        ['zoomable'],
        ...legendSection,
        [<ControlSubSectionHeader>{t('X Axis')}</ControlSubSectionHeader>],
        [
          {
            name: 'x_axis_time_format',
            config: {
              ...sharedControls.x_axis_time_format,
              default: 'smart_date',
              description: `${D3_TIME_FORMAT_DOCS}. ${TIME_SERIES_DESCRIPTION_TEXT}`,
            },
          },
        ],
        [xAxisLabelRotation],
        [xAxisLabelInterval],
        [forceMaxInterval],
        ...richTooltipSection,
        [<ControlSubSectionHeader>{t('Y Axis')}</ControlSubSectionHeader>],
        ['y_axis_format'],
        ['currency_format'],
        [
          {
            name: 'logAxis',
            config: {
              type: 'CheckboxControl',
              label: t('Logarithmic y-axis'),
              renderTrigger: true,
              default: logAxis,
              description: t('Logarithmic y-axis'),
            },
          },
        ],
        [
          {
            name: 'minorSplitLine',
            config: {
              type: 'CheckboxControl',
              label: t('Minor Split Line'),
              renderTrigger: true,
              default: minorSplitLine,
              description: t('Draw split lines for minor y-axis ticks'),
            },
          },
        ],
        [truncateXAxis],
        [xAxisBounds],
        [
          {
            name: 'truncateYAxis',
            config: {
              type: 'CheckboxControl',
              label: t('Truncate Y Axis'),
              default: truncateYAxis,
              renderTrigger: true,
              description: t('Truncate Y Axis.'),
            },
          },
        ],
        [
          {
            name: 'y_axis_bounds',
            config: {
              type: 'BoundsControl',
              label: t('Y Axis Bounds'),
              renderTrigger: true,
              default: yAxisBounds,
              description: t('Bounds for the Y-axis.'),
              visibility: ({ controls }: ControlPanelsContainerProps) =>
                Boolean(controls?.truncateYAxis?.value),
            },
          },
        ],
        ['echart_options'],
      ],
    },
  ],
  controlOverrides: {
    row_limit: {
      default: rowLimit,
    },
  },
  formDataOverrides: formData => ({
    ...formData,
    metrics: getStandardizedControls().popAllMetrics(),
    groupby: getStandardizedControls().popAllColumns(),
  }),
};

export default config;
