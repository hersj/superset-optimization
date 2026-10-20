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
import type { ComposeOption } from 'echarts/core';
import type { SankeySeriesOption } from 'echarts/charts';
import type { CallbackDataParams } from 'echarts/types/src/util/types';
import {
  CategoricalColorNamespace,
  NumberFormats,
  getColumnLabel,
  getMetricLabel,
  getNumberFormatter,
  tooltipHtml,
} from '@superset-ui/core';
import { SankeyChartProps, SankeyTransformedProps } from './types';
import { Refs } from '../types';
import { getDefaultTooltip } from '../utils/tooltip';
import { getPercentFormatter } from '../utils/formatters';

type Link = { source: string; target: string; value: number };
type EChartsOption = ComposeOption<SankeySeriesOption>;

function hasCycle(links: Link[]): boolean {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  links.forEach(({ source, target }) => {
    incoming.set(source, incoming.get(source) ?? 0);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
    const targets = outgoing.get(source) ?? [];
    targets.push(target);
    outgoing.set(source, targets);
  });
  const queue = Array.from(incoming.keys()).filter(name => !incoming.get(name));
  for (let index = 0; index < queue.length; index += 1) {
    (outgoing.get(queue[index]) ?? []).forEach(target => {
      const remaining = incoming.get(target)! - 1;
      incoming.set(target, remaining);
      if (!remaining) queue.push(target);
    });
  }
  return queue.length < incoming.size;
}

export default function transformProps(
  chartProps: SankeyChartProps,
): SankeyTransformedProps {
  const refs: Refs = {};
  const { formData, height, hooks, queriesData, width, theme } = chartProps;
  const { onLegendStateChanged } = hooks;
  const { colorScheme, metric, source, target, sliceId } = formData;
  const { data } = queriesData[0];
  const colorFn = CategoricalColorNamespace.getScale(colorScheme);
  const metricLabel = getMetricLabel(metric);
  const valueFormatter = getNumberFormatter(NumberFormats.FLOAT_2_POINT);
  const percentFormatter = getPercentFormatter(NumberFormats.PERCENT_2_POINT);

  let links: Link[] = [];
  data.forEach(datum => {
    const sourceName = String(datum[getColumnLabel(source)]);
    const targetName = String(datum[getColumnLabel(target)]);
    const value = datum[metricLabel] as number;
    links.push({
      source: sourceName,
      target: targetName,
      value,
    });
  });

  // Cyclic labels represent separate source/target roles; retain every flow.
  const splitRoles = hasCycle(links);
  const nodeLabels = new Map<string, string>();
  links = links.map(({ source, target, value }) => {
    const sourceId = splitRoles ? JSON.stringify(['source', source]) : source;
    const targetId = splitRoles ? JSON.stringify(['target', target]) : target;
    nodeLabels.set(sourceId, source);
    nodeLabels.set(targetId, target);
    return { source: sourceId, target: targetId, value };
  });
  const seriesData: NonNullable<SankeySeriesOption['data']> = Array.from(
    nodeLabels,
    ([name, label]) => ({
      name,
      itemStyle: { color: colorFn(label, sliceId) },
      label: {
        formatter: () => label,
        color: theme.colorText,
        textShadow: theme.colorBgBase,
      },
    }),
  );

  // stores a map with the total values for each node considering the links
  const incomingFlows = new Map<string, number>();
  const outgoingFlows = new Map<string, number>();
  const allNodeNames = new Set<string>();

  links.forEach(link => {
    const { source, target, value } = link;
    allNodeNames.add(source);
    allNodeNames.add(target);
    incomingFlows.set(target, (incomingFlows.get(target) || 0) + value);
    outgoingFlows.set(source, (outgoingFlows.get(source) || 0) + value);
  });

  const nodeValues = new Map<string, number>();

  allNodeNames.forEach(nodeName => {
    const totalIncoming = incomingFlows.get(nodeName) || 0;
    const totalOutgoing = outgoingFlows.get(nodeName) || 0;

    nodeValues.set(nodeName, Math.max(totalIncoming, totalOutgoing));
  });

  const tooltipFormatter = (params: CallbackDataParams) => {
    const { name, data } = params;
    const value = params.value as number;
    const rows = [[metricLabel, valueFormatter.format(value)]];
    const { source, target } = data as Link;
    if (source && target) {
      rows.push([
        `% (${nodeLabels.get(source)})`,
        percentFormatter.format(value / nodeValues.get(source)!),
      ]);
      rows.push([
        `% (${nodeLabels.get(target)})`,
        percentFormatter.format(value / nodeValues.get(target)!),
      ]);
    }
    const title =
      source && target
        ? `${nodeLabels.get(source)} > ${nodeLabels.get(target)}`
        : (nodeLabels.get(name) ?? name);
    return tooltipHtml(rows, title);
  };

  const echartOptions: EChartsOption = {
    series: {
      animation: false,
      data: seriesData,
      lineStyle: {
        color: 'source',
      },
      links,
      type: 'sankey',
    },
    tooltip: {
      ...getDefaultTooltip(refs),
      formatter: tooltipFormatter,
    },
  };

  return {
    refs,
    formData,
    width,
    height,
    echartOptions,
    onLegendStateChanged,
  };
}
