import {
  ControlPanelConfig,
  sharedControls,
} from '@superset-ui/chart-controls';
import { t } from '@apache-superset/core/translation';
import { DEFAULT_PRESETS, TIME_GRAIN_OPTIONS } from './types';

const config: ControlPanelConfig = {
  // 功能审计（可重写规格）：自定义时间筛选器的时间列与日期边界配置
  // - 功能目的与触发方式：配置原生 filter_custom_time 时，由用户选择该筛选器作用的数据集时间列。
  // - 输入契约：数据集由原生筛选器配置选择；groupby 只能选择一个可筛选的时间列，calendarStartDate 为 YYYY-MM-DD，留空时使用 2022-01-01。
  // - 输出契约：保存配置后生成 targets.datasetId/column.name 及当前筛选器自己的 calendarStartDate，运行时按该列产生 TEMPORAL_RANGE 过滤。
  // - 处理流程：配置面板先加载数据集，再展示时间列和最早日期；日历、月份、季度、年度和财年控件按该日期隐藏更早的可选项。
  // - 业务规则：只允许 GenericDataType.Temporal 列；起始日期之前的日期或完整时间单位不展示，不同自定义筛选器的起始日期互不影响；不改变既有预设、周日到周六周定义或粒度值。
  // - 状态与副作用：仅写入原生筛选器配置和 DataMask，不新增数据库、缓存或服务端状态。
  // - 外部依赖：复用原生筛选器 DatasetSelect/ColumnSelect 及既有 QueryContext 数据链路。
  // - 异常与边界：没有绑定列时发送旧的全局 time_range，便于旧 dashboard 平滑升级；绑定后不再猜测 created_at；非法起始日期回退 2022-01-01。
  // - 不变量与约束：单数据集、单时间列；每个自定义筛选器只影响自己的日期选项和过滤范围。
  // - 验证方式：CustomTimeFilterPlugin.test.tsx 验证绑定列输出 TEMPORAL_RANGE、默认和自定义起始日期边界，原有用例验证未绑定兼容行为。
  controlPanelSections: [
    {
      label: t('Query'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'dataLagDays',
            config: {
              type: 'SelectControl',
              label: t('数据可用日期'),
              default: 2,
              choices: [
                [2, '利润数据：T-2'],
                [0, '当日数据：T（BSR）'],
              ],
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'groupby',
            config: {
              ...sharedControls.groupby,
              label: t('Time Column'),
              required: true,
            },
          },
        ],
      ],
    },
    {
      label: t('UI Configuration'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'enableCustomComparison',
            config: {
              type: 'CheckboxControl',
              label: '允许自定义期间对比',
              default: false,
              description:
                '在原生作用范围选择聚合表格和透视表，分别比较完整期间总量；不自动日均。',
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'enablePresets',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Preset Buttons'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'enableCustomRange',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Custom Range Picker'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'enableTimeGrain',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Time Grain Selector'),
              default: true,
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'defaultPreset',
            config: {
              type: 'SelectControl',
              label: t('Default Preset'),
              default: 'last_7d',
              choices: DEFAULT_PRESETS.map(p => [p.key, p.label]),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'defaultGrain',
            config: {
              type: 'SelectControl',
              label: t('Default Time Grain'),
              default: 'day',
              choices: TIME_GRAIN_OPTIONS.map(g => [g.key, g.label]),
              renderTrigger: true,
            },
          },
        ],
        [
          {
            name: 'calendarStartDate',
            config: {
              type: 'TextControl',
              label: t('Earliest Selectable Date'),
              default: '2022-01-01',
              description: t(
                'Dates before this date are hidden. Use YYYY-MM-DD.',
              ),
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
  controlOverrides: {
    groupby: {
      multi: false,
    },
  },
};

export default config;
