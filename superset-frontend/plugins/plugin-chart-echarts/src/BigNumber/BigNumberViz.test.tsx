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

jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  computeMaxFontSize: jest.fn(({ maxHeight }: { maxHeight: number }) =>
    Math.min(16, maxHeight),
  ),
}));

jest.mock('../components/Echart', () => () => null);

test('compact custom comparison renders two fitted lines and full period tooltip on a small card', () => {
  jest.useFakeTimers();
  const dimension = jest
    .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return (
        parseFloat(this.style.height) || parseFloat(this.style.fontSize) || 0
      );
    });
  try {
    const { container } = render(
      <BigNumberViz
        width={222}
        height={158}
        bigNumber={13000}
        showMetricName={false}
        headerFormatter={getNumberFormatter()}
        headerFontSize={0.35}
        subheader={'对比值 31000\n差额 -18000 · 变化率 -58.1%'}
        subheaderFontSize={0.25}
        subtitle="当前 13 天 · 对比 31 天（期间长度不同）"
        subtitleFontSize={0.125}
        subtitleTooltip="当前：2026-10-01 ～ 2026-10-13；对比：2026-08-05 ～ 2026-09-04；按完整期间总量比较"
        refs={{}}
      />,
    );
    act(() => {
      jest.runOnlyPendingTimers();
    });
    const summary = container.querySelector<HTMLElement>(
      '.subheader-line:not(.subtitle-line)',
    )!;
    const subtitle = container.querySelector<HTMLElement>('.subtitle-line')!;
    expect(summary.style.whiteSpace).toBe('pre-line');
    expect(summary.textContent?.split('\n')).toHaveLength(2);
    expect(subtitle.title).toContain('2026-08-05');
    expect(
      container.querySelector<HTMLElement>('.superset-legacy-chart-big-number')
        ?.style.overflowY,
    ).not.toBe('auto');
  } finally {
    dimension.mockRestore();
    jest.useRealTimers();
  }
});
