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
import { act, render } from 'spec/helpers/testing-library';
import { getNumberFormatter } from '@superset-ui/core';
import BigNumberViz from './BigNumberViz';
import { formatBigNumberPeriodComparison } from './customComparison';

jest.mock('../components/Echart', () => () => null);

function element(container: HTMLElement, selector: string) {
  const node = container.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
function pixels(value: string) {
  return parseFloat(value) || 0;
}

test('custom comparison fits the actual 161.5 by 92 content budget without shrinking below readable font size', () => {
  jest.useFakeTimers();
  try {
    const formatter = getNumberFormatter('$,.2f');
    const { container } = render(
      <BigNumberViz
        width={161.5}
        height={92}
        bigNumber={13000}
        showMetricName={false}
        headerFormatter={formatter}
        headerFontSize={0.35}
        subheader={formatBigNumberPeriodComparison(13000, 31000, formatter)}
        subheaderFontSize={0.25}
        subtitle="两期均7天"
        subtitleFontSize={0.125}
        subtitleTooltip="当前：2026-09-01 ～ 2026-09-07；对比：2026-08-05 ～ 2026-08-11；两期均7天"
        refs={{}}
      />,
    );
    act(() => jest.runOnlyPendingTimers());
    const text = element(container, '.text-container');
    const header = element(container, '.header-line');
    const summary = element(container, '.subheader-line');
    const rows = Array.from(
      summary.querySelectorAll<HTMLElement>('.comparison-stat-line'),
    );
    expect(rows.map(row => row.textContent)).toEqual([
      `对比值 ${formatter(31000)}`,
      `差额 ${formatter(-18000)}`,
      '变化率 -58.1%',
    ]);
    expect(rows).toHaveLength(3);
    expect(text.style.width).toBe('100%');
    expect(summary.style.width).toBe('100%');
    expect(summary.style.flexShrink).toBe('0');
    expect(pixels(header.style.fontSize)).toBeGreaterThanOrEqual(12);
    expect(pixels(header.style.fontSize)).toBeLessThanOrEqual(28);
    expect(header.style.lineHeight).toBe('32px');
    expect(pixels(header.style.lineHeight)).toBeGreaterThanOrEqual(
      pixels(header.style.fontSize),
    );
    expect(pixels(summary.style.fontSize)).toBe(12);
    rows.forEach(row => {
      expect(row.style.whiteSpace).toBe('nowrap');
      expect(row.style.lineHeight).toBe('16px');
    });
    [header, summary].forEach(node => {
      expect(pixels(node.style.margin)).toBe(0);
      expect(pixels(node.style.padding)).toBe(0);
      expect(node.style.overflow).not.toBe('hidden');
      expect(node.style.textOverflow).not.toBe('ellipsis');
    });
    const occupied =
      pixels(header.style.height) +
      pixels(summary.style.height) +
      pixels(text.style.gap);
    expect(occupied).toBe(84);
    expect(occupied).toBeLessThanOrEqual(92);
    expect(pixels(summary.style.height)).toBe(rows.length * 16);
    expect(container.querySelector('.subtitle-line')).toBeNull();
    expect(summary.title).toContain('2026-08-05');
    expect(summary.title).toContain('2026-09-07');
  } finally {
    jest.useRealTimers();
  }
});

test('custom metric name and timestamp retain their rows within a larger chosen text budget', () => {
  const { container } = render(
    <BigNumberViz
      width={161.5}
      height={128}
      bigNumber={100}
      showMetricName
      metricName="毛利润"
      showTimestamp
      timestamp={1785859200000}
      subheader="对比值 80\n差额 +20\n变化率 +25.0%"
      subtitle="两期均7天"
      subtitleTooltip="完整期间详情"
      refs={{}}
    />,
  );
  const text = element(container, '.text-container');
  const rows = [
    '.metric-name',
    '.kicker',
    '.header-line',
    '.subheader-line',
  ].map(selector => element(container, selector));
  expect(rows[0]).toHaveTextContent('毛利润');
  expect(rows[1].textContent).not.toBe('');
  const occupied =
    rows.reduce((height, row) => height + pixels(row.style.height), 0) +
    pixels(text.style.gap) * (rows.length - 1);
  expect(occupied).toBeLessThanOrEqual(128);
  expect(container.querySelector('.subtitle-line')).toBeNull();
});

test('ordinary non-custom big numbers keep their saved subtitle and proportional formatting', () => {
  const { container } = render(
    <BigNumberViz
      width={161.5}
      height={92}
      bigNumber={100}
      showMetricName={false}
      subheader="用户副标题"
      subtitle="保留原有说明"
      refs={{}}
    />,
  );
  expect(element(container, '.subtitle-line')).toHaveTextContent(
    '保留原有说明',
  );
  expect(container.querySelector('.custom-period-comparison')).toBeNull();
  expect(container.querySelector('.comparison-stat-line')).toBeNull();
});

test('large custom cards retain a responsive main value instead of a universal 28px cap', () => {
  const { container } = render(
    <BigNumberViz
      width={640}
      height={300}
      bigNumber={13000}
      showMetricName={false}
      headerFontSize={0.35}
      subheader="对比值 31000\n差额 -18000\n变化率 -58.1%"
      subtitleTooltip="完整期间详情"
      refs={{}}
    />,
  );
  const header = element(container, '.header-line');
  expect(pixels(header.style.fontSize)).toBeGreaterThan(28);
  expect(pixels(header.style.height)).toBe(105);
});
