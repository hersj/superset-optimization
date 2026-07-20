/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.
 */
import { t } from '@apache-superset/core/translation';
import { AnnotationType, Behavior } from '@superset-ui/core';
import buildQuery from '../buildQuery';
import controlPanel from './controlPanel';
import transformProps from '../transformProps';
import thumbnail from '../Area/images/thumbnail.png';
import thumbnailDark from '../Area/images/thumbnail-dark.png';
import {
  EchartsTimeseriesChartProps,
  EchartsTimeseriesFormData,
  EchartsTimeseriesSeriesType,
} from '../types';
import { EchartsChartPlugin } from '../../types';

const bandTransformProps = (chartProps: EchartsTimeseriesChartProps) =>
  transformProps({
    ...chartProps,
    formData: {
      ...chartProps.formData,
      area: true,
      stack: 'band',
      seriesType: EchartsTimeseriesSeriesType.Smooth,
      markerEnabled: false,
    },
  });

export default class EchartsBandChartPlugin extends EchartsChartPlugin<
  EchartsTimeseriesFormData,
  EchartsTimeseriesChartProps
> {
  constructor() {
    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('../EchartsTimeseries'),
      metadata: {
        behaviors: [
          Behavior.InteractiveChart,
          Behavior.DrillToDetail,
          Behavior.DrillBy,
        ],
        category: t('Evolution'),
        credits: ['https://echarts.apache.org'],
        description: t(
          'Band chart shows a shaded range between upper and lower bounds with a central trend line.',
        ),
        supportedAnnotationTypes: [
          AnnotationType.Event,
          AnnotationType.Interval,
          AnnotationType.Timeseries,
        ],
        name: t('Band Chart'),
        tags: [t('ECharts'), t('Time'), t('Line'), t('Stacked')],
        thumbnail,
        thumbnailDark,
      },
      transformProps: bandTransformProps,
    });
  }
}
