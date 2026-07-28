import { t } from '@apache-superset/core/translation';
import { Behavior, ChartMetadata, ChartPlugin } from '@superset-ui/core';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

/**
 * 功能审计（可重写规格）：自定义时间筛选器时间列绑定
 * - 功能目的与触发方式：编辑原生筛选器时选择数据集和时间列，运行时由日期预设或日历触发过滤。
 * - 输入契约：一个 temporal 数据集列与半开时间范围。
 * - 输出契约：按该列写入 TEMPORAL_RANGE，且筛选器始终显示可操作控件。
 * - 处理流程：配置层保存 target，运行层读取 groupby 并更新 DataMask。
 * - 业务规则：候选查询为空不等于日期控件无效。
 * - 状态与副作用：仅更新当前 dashboard 会话，不直接写业务数据。
 * - 外部依赖：原生筛选器目标列、QueryContext 与 ChartMetadata。
 * - 异常与边界：空候选时不显示“无结果”替代日期控件。
 * - 不变量与约束：只允许单个时间列；其他筛选器空结果行为不变。
 * - 验证方式：Jest 覆盖 metadata、绑定列 DataMask；Dashboard 44 实机验证。
 */
export default class CustomTimeFilterPlugin extends ChartPlugin {
  constructor() {
    const metadata = new ChartMetadata({
      name: t('Custom Time Filter'),
      description: t('Time filter with presets, date range picker, and time grain selector'),
      behaviors: [Behavior.InteractiveChart, Behavior.NativeFilter],
      tags: [t('Experimental')],
      enableNoResults: false,
      datasourceCount: 1,
    });
    super({
      controlPanel,
      loadChart: () => import('./CustomTimeFilterPlugin'),
      metadata,
      transformProps,
    });
  }
}
