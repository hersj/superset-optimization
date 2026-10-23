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
  useRef,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useCallback,
  Ref,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { t } from '@apache-superset/core/translation';

import { styled, useTheme } from '@apache-superset/core/theme';
import {
  use,
  init,
  EChartsType,
  EChartsCoreOption,
  registerLocale,
} from 'echarts/core';
import {
  SankeyChart,
  PieChart,
  BarChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  LineChart,
  ScatterChart,
  RadarChart,
  BoxplotChart,
  TreeChart,
  TreemapChart,
  HeatmapChart,
  SunburstChart,
  CustomChart,
} from 'echarts/charts';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import {
  TooltipComponent,
  TitleComponent,
  GridComponent,
  VisualMapComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  GraphicComponent,
  AriaComponent,
  MarkAreaComponent,
  MarkLineComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { EchartsHandler, EchartsProps, EchartsStylesProps } from '../types';
import { DEFAULT_LOCALE } from '../constants';
import { mergeEchartsThemeOverrides } from '../utils/themeOverrides';
import {
  getScrollableChartHeight,
  persistSkuScroll,
  restoreSkuScroll,
  persistMatrixViewport,
  restoreMatrixViewport,
} from '../utils/matrixViewport';

// Define this interface here to avoid creating a dependency back to superset-frontend,
// TODO: to move the type to @superset-ui/core
interface ExplorePageState {
  user?: { userId?: number };
  common?: {
    locale?: string;
  };
  dashboardState?: {
    isRefreshing?: boolean;
  };
}

const Styles = styled.div<EchartsStylesProps>`
  height: ${({ height }) => height};
  width: ${({ width }) => width};
`;

// eslint-disable-next-line react-hooks/rules-of-hooks -- This is ECharts' use function, not a React hook
use([
  CanvasRenderer,
  SVGRenderer,
  BarChart,
  BoxplotChart,
  CustomChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  TreeChart,
  TreemapChart,
  AriaComponent,
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
  TitleComponent,
  VisualMapComponent,
  LabelLayout,
]);

const loadLocale = async (locale: string) => {
  let lang;
  try {
    lang = await import(`echarts/lib/i18n/lang${locale}`);
  } catch {
    // Locale not supported in ECharts
  }
  return lang?.default;
};

function Echart(
  {
    width,
    height,
    echartOptions,
    eventHandlers,
    zrEventHandlers,
    selectedValues = {},
    refs,
    vizType,
    dataZoomStorageKey,
    minCategoryHeight,
  }: EchartsProps,
  ref: Ref<EchartsHandler>,
) {
  const theme = useTheme();
  const divRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollOptions = useRef(echartOptions);
  const scrollReady = useRef(false);
  const [contentHeight, setContentHeight] = useState(height);
  const chartHeight = minCategoryHeight
    ? Math.max(height, contentHeight)
    : height;
  const chartWidth = minCategoryHeight ? Math.max(1, width - 16) : width;
  if (refs) {
    // eslint-disable-next-line no-param-reassign
    refs.divRef = divRef;
  }
  const [didMount, setDidMount] = useState(false);
  const chartRef = useRef<EChartsType>();
  const currentSelection = useMemo(
    () => Object.keys(selectedValues) || [],
    [selectedValues],
  );
  const previousSelection = useRef<string[]>([]);

  useImperativeHandle(ref, () => ({
    getEchartInstance: () => chartRef.current,
  }));

  const locale = useSelector(
    (state: ExplorePageState) => state?.common?.locale ?? DEFAULT_LOCALE,
  ).toUpperCase();
  const userId = useSelector((state: ExplorePageState) => state.user?.userId);
  const viewportKey =
    userId && dataZoomStorageKey
      ? `echarts__matrix_viewport:${JSON.stringify([userId, dataZoomStorageKey])}`
      : undefined;
  const isDashboardRefreshing = useSelector((state: ExplorePageState) =>
    Boolean(state?.dashboardState?.isRefreshing),
  );

  const handleSizeChange = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      if (chartRef.current) {
        chartRef.current.resize({ width, height });
      }
    },
    [],
  );

  useEffect(() => {
    loadLocale(locale).then(localeObj => {
      if (localeObj) {
        registerLocale(locale, localeObj);
      }
      if (!divRef.current) return;
      if (!chartRef.current) {
        chartRef.current = init(divRef.current, null, {
          locale,
          // SVG avoids browser canvas dimension limits for long SKU lists.
          renderer: minCategoryHeight ? 'svg' : 'canvas',
        });
      }
      // did mount
      setDidMount(true);
    });
  }, [locale, minCategoryHeight]);

  useEffect(() => {
    if (didMount) {
      Object.entries(eventHandlers || {}).forEach(([name, handler]) => {
        chartRef.current?.off(name);
        chartRef.current?.on(name, handler);
      });

      Object.entries(zrEventHandlers || {}).forEach(([name, handler]) => {
        chartRef.current?.getZr().off(name);
        chartRef.current?.getZr().on(name, handler);
      });

      const getEchartsTheme = (options: any) => {
        const antdTheme = theme;
        const echartsTheme = {
          textStyle: {
            color: antdTheme.colorText,
            fontFamily: antdTheme.fontFamily,
          },
          title: {
            textStyle: { color: antdTheme.colorText },
          },
          legend: {
            textStyle: { color: antdTheme.colorTextSecondary },
            pageTextStyle: {
              color: antdTheme.colorTextSecondary,
            },
            pageIconColor: antdTheme.colorTextSecondary,
            pageIconInactiveColor: antdTheme.colorTextDisabled,
            inactiveColor: antdTheme.colorTextDisabled,
          },
          tooltip: {
            backgroundColor: antdTheme.colorBgContainer,
            textStyle: { color: antdTheme.colorText },
          },
          axisPointer: {
            lineStyle: { color: antdTheme.colorPrimary },
            label: { color: antdTheme.colorText },
          },
        } as any;
        if (options?.xAxis) {
          echartsTheme.xAxis = {
            axisLine: { lineStyle: { color: antdTheme.colorSplit } },
            axisLabel: { color: antdTheme.colorTextSecondary },
            splitLine: { lineStyle: { color: antdTheme.colorSplit } },
            minorSplitLine: {
              lineStyle: { color: antdTheme.colorBorderSecondary },
            },
          };
        }
        if (options?.yAxis) {
          echartsTheme.yAxis = {
            axisLine: { lineStyle: { color: antdTheme.colorSplit } },
            axisLabel: { color: antdTheme.colorTextSecondary },
            splitLine: { lineStyle: { color: antdTheme.colorSplit } },
            minorSplitLine: {
              lineStyle: { color: antdTheme.colorBorderSecondary },
            },
          };
        }
        return echartsTheme;
      };

      const baseTheme = getEchartsTheme(echartOptions);
      const globalOverrides = theme.echartsOptionsOverrides || {};
      const chartOverrides = vizType
        ? theme.echartsOptionsOverridesByChartType?.[vizType] || {}
        : {};

      // Disable animations during auto-refresh to reduce visual noise
      const animationOverride = isDashboardRefreshing
        ? {
            animation: false,
            animationDuration: 0,
          }
        : {};

      const themedEchartOptions = mergeEchartsThemeOverrides(
        baseTheme,
        echartOptions,
        globalOverrides,
        chartOverrides,
        animationOverride,
      );

      const resizeRows = (options: EChartsCoreOption) => {
        if (minCategoryHeight) {
          const nextHeight = getScrollableChartHeight(
            options,
            height,
            minCategoryHeight,
          );
          scrollReady.current = false;
          scrollOptions.current = options;
          setContentHeight(nextHeight);
          chartRef.current?.resize({ width: chartWidth, height: nextHeight });
        }
      };
      const persistViewport = () => {
        if (chartRef.current) {
          const options = chartRef.current.getOption();
          if (viewportKey) persistMatrixViewport(options, viewportKey);
          resizeRows(options);
        }
      };
      if (viewportKey || minCategoryHeight)
        chartRef.current?.on('datazoom', persistViewport);

      const notMerge = !isDashboardRefreshing;
      if (!notMerge) {
        chartRef.current?.dispatchAction({ type: 'hideTip' });
      }
      /*
       * 功能审计（可重写规格）：看板刷新时 ECharts 选项替换
       * - 功能目的与触发方式：看板右上角显示开关或筛选器触发查询刷新时，更新图表数据、图例和展示参数，同时保留 ChartRenderer 提供的用户图例状态。
       * - 输入契约：themedEchartOptions 是当前查询转换后的完整 ECharts 选项；isDashboardRefreshing 表示看板是否处于批量刷新状态。
       * - 输出契约：非刷新使用完整替换；刷新使用延迟合并但替换 series 和 legend 两个组件，使本轮真实系列、图例项和 selected 映射完整生效。
       * - 处理流程：刷新时先隐藏提示框，再以 replaceMerge 替换数据和图例；非刷新保持原有 notMerge 完整替换路径。
       * - 业务规则：legend.selected 只来自当前图表的 legendState 转换结果；不能让 ECharts 上一轮的 legend.data 或 selected 合并覆盖当前图例选择。
       * - 状态与副作用：只改变当前 ECharts 实例；不写 Redux、看板配置或数据库；矩阵柱图仅在真实 datazoom 事件中记录当前用户的私有视窗，设置选项前恢复。
       * - 外部依赖：依赖 ECharts setOption、ChartRenderer 的 legendState 和看板刷新标记；其他图表继续使用相同刷新策略。
       * - 异常与边界：空 legend 或无系列时按当前选项替换；非看板刷新、探索页渲染和无图例图表不改变原有行为。
       * - 不变量与约束：切换数字显示或时间对比不得恢复旧图例；series、legend、tooltip、颜色和注释配置必须来自同一轮选项。
       * - 验证方式：Echart.test.tsx 断言刷新 setOption 同时 replaceMerge series/legend；标准和混合时序 transform 测试覆盖状态映射。
       */
      const restoredOptions = restoreMatrixViewport(
        themedEchartOptions,
        viewportKey,
      );
      resizeRows(restoredOptions);
      chartRef.current?.setOption(restoredOptions, {
        notMerge,
        replaceMerge: notMerge ? undefined : ['series', 'legend'],
        lazyUpdate: isDashboardRefreshing,
      });
      return () => {
        if (viewportKey || minCategoryHeight)
          chartRef.current?.off('datazoom', persistViewport);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isDashboardRefreshing intentionally excluded to prevent extra setOption calls
  }, [
    didMount,
    echartOptions,
    eventHandlers,
    zrEventHandlers,
    theme,
    vizType,
    viewportKey,
    minCategoryHeight,
    height,
    chartWidth,
  ]);

  useEffect(() => () => chartRef.current?.dispose(), []);

  // highlighting
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.dispatchAction({
      type: 'downplay',
      dataIndex: previousSelection.current.filter(
        value => !currentSelection.includes(value),
      ),
    });
    if (currentSelection.length) {
      chartRef.current.dispatchAction({
        type: 'highlight',
        dataIndex: currentSelection,
      });
    }
    previousSelection.current = currentSelection;
  }, [currentSelection]);

  useLayoutEffect(() => {
    handleSizeChange({ width: chartWidth, height: chartHeight });
  }, [chartWidth, chartHeight, didMount, handleSizeChange]);

  const positionSlider = useCallback(() => {
    if (!minCategoryHeight || !scrollRef.current) return;
    chartRef.current?.setOption(
      {
        dataZoom: [
          {
            id: 'matrix-rows',
            top: scrollRef.current.scrollTop + 12,
            bottom: 'auto',
            height: Math.max(40, height - 40),
          },
        ],
      },
      { silent: true },
    );
  }, [minCategoryHeight, height]);

  useEffect(() => {
    if (!minCategoryHeight || !scrollRef.current || !didMount) return;
    // Ignore the temporary viewport-sized chart during mount or density changes.
    const expectedHeight = getScrollableChartHeight(
      scrollOptions.current,
      height,
      minCategoryHeight,
    );
    if (chartHeight !== expectedHeight) return;
    scrollRef.current.scrollTop = restoreSkuScroll(
      scrollOptions.current,
      chartHeight,
      height,
      viewportKey,
    );
    scrollReady.current = true;
    positionSlider();
  }, [
    viewportKey,
    minCategoryHeight,
    chartHeight,
    height,
    didMount,
    echartOptions,
    positionSlider,
  ]);

  const chart = <Styles ref={divRef} height={chartHeight} width={chartWidth} />;
  return minCategoryHeight ? (
    <div
      ref={scrollRef}
      role="region"
      aria-label={t('SKU排行滚动区域')}
      tabIndex={0}
      style={{
        height,
        width,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarGutter: 'stable',
        overscrollBehavior: 'contain',
      }}
      onScroll={() => {
        positionSlider();
        if (viewportKey && scrollRef.current && scrollReady.current) {
          persistSkuScroll(
            scrollOptions.current,
            chartHeight,
            scrollRef.current.scrollTop,
            viewportKey,
          );
        }
      }}
    >
      {chart}
    </div>
  ) : (
    chart
  );
}

export default forwardRef(Echart);
