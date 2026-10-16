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
import { t } from '@apache-superset/core/translation';
import { AnnotationType, Behavior } from '@superset-ui/core';
import {
  EchartsTimeseriesChartProps,
  EchartsTimeseriesFormData,
  EchartsTimeseriesSeriesType,
  OrientationType,
} from '../../types';
import { EchartsChartPlugin } from '../../../types';
import { buildBarQuery, transformBarMatrix } from './matrix';
import controlPanel from './controlPanel';
import transformProps from '../../transformProps';
import thumbnail from './images/thumbnail.png';
import thumbnailDark from './images/thumbnail-dark.png';
import example1 from './images/Bar1.png';
import example1Dark from './images/Bar1-dark.png';
import example2 from './images/Bar2.png';
import example2Dark from './images/Bar2-dark.png';
import example3 from './images/Bar3.png';
import example3Dark from './images/Bar3-dark.png';

export const barTransformProps = (chartProps: EchartsTimeseriesChartProps) => {
  const yAxis = chartProps.formData.yAxisDimension;
  const props = {
    ...chartProps,
    rawFormData: {
      ...chartProps.rawFormData,
      ...(yAxis && { groupby: [yAxis] }),
    },
    formData: {
      ...chartProps.formData,
      seriesType: EchartsTimeseriesSeriesType.Bar,
      ...(yAxis && {
        groupby: [yAxis],
        orientation: OrientationType.Vertical,
        stack: false,
        annotationLayers: [],
        forecastEnabled: false,
        colorByPrimaryAxis: false,
      }),
    },
  };
  const transformed = transformProps(props);
  return yAxis ? transformBarMatrix(chartProps, transformed) : transformed;
};

export default class EchartsTimeseriesBarChartPlugin extends EchartsChartPlugin<
  EchartsTimeseriesFormData,
  EchartsTimeseriesChartProps
> {
  constructor() {
    super({
      buildQuery: buildBarQuery,
      controlPanel,
      loadChart: () => import('../../EchartsTimeseries'),
      metadata: {
        behaviors: [
          Behavior.InteractiveChart,
          Behavior.DrillToDetail,
          Behavior.DrillBy,
        ],
        category: t('Evolution'),
        credits: ['https://echarts.apache.org'],
        description: t(
          'Bar Charts are used to show metrics as a series of bars.',
        ),
        exampleGallery: [
          { url: example1, urlDark: example1Dark },
          { url: example2, urlDark: example2Dark },
          { url: example3, urlDark: example3Dark },
        ],
        supportedAnnotationTypes: [
          AnnotationType.Event,
          AnnotationType.Formula,
          AnnotationType.Interval,
          AnnotationType.Timeseries,
        ],
        name: t('Bar Chart'),
        tags: [
          t('ECharts'),
          t('Predictive'),
          t('Advanced-Analytics'),
          t('Time'),
          t('Transformable'),
          t('Stacked'),
          t('Bar'),
          t('Featured'),
        ],
        thumbnail,
        thumbnailDark,
      },
      transformProps: barTransformProps,
    });
  }
}
