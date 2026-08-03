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
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { Switch } from '@superset-ui/core/components';
import type {
  DashboardChartControls as DashboardChartControlsState,
  RootState,
} from 'src/dashboard/types';
import { setDashboardChartControls } from 'src/dashboard/actions/dashboardState';
import {
  DEFAULT_DASHBOARD_CHART_CONTROLS,
  persistDashboardChartControls,
} from 'src/dashboard/util/charts/getDashboardChartControls';

const Controls = styled.div`
  ${({ theme }) => `
    display: flex;
    align-items: center;
    gap: ${theme.sizeUnit * 3}px;
    margin-left: ${theme.sizeUnit * 2}px;
    white-space: nowrap;
  `}
`;

const Control = styled.label`
  ${({ theme }) => `
    display: inline-flex;
    align-items: center;
    gap: ${theme.sizeUnit}px;
    color: ${theme.colorTextSecondary};
    font-size: ${theme.fontSizeSM}px;
    cursor: pointer;
  `}
`;

/**
 * 功能审计（可重写规格）：看板级图表显示开关
 * - 功能目的与触发方式：为看板查看者提供两个不修改图表配置的开关；查看模式下由看板 Header 渲染，用户切换 Switch 时触发 Redux action。
 * - 输入契约：读取当前用户 ID 和 Redux 会话中的 dashboardChartControls；看板 hydrate 已恢复用户偏好，首次进入且没有用户偏好时两个开关默认开启。开关值为布尔值。
 * - 输出契约：切换后更新当前看板会话状态并保存当前用户偏好，所有图表重新使用对应的额外 formData；不改变图表实体、看板 metadata 或保存按钮状态。
 * - 处理流程：展示 hydrate 后的“和过去对比”和“数字显示” -> 单项合并更新状态并写入偏好；具体字段覆盖由 getDashboardChartExtraControls 负责。
 * - 业务规则：关闭“和过去对比”会清空图表已有 time_compare；开启时保留图表自己的时间偏移，不自动选择新的偏移。数字显示开关统一覆盖 show_value，混合时序同时覆盖 Query B。
 * - 状态与副作用：写 Redux 内存状态和当前用户浏览器 localStorage；切换会通过图表现有查询链路触发重新计算/请求，不调用看板保存接口。
 * - 外部依赖：依赖 Redux dashboardState/user/dashboardInfo、localStorage、现有 Header 和图表 formData 合并链路，以及 Superset Switch 组件。
 * - 异常与边界：访客无用户 ID 时不持久化；localStorage 不可用或数据格式错误时使用默认值；不支持这些 formData 字段的图表忽略额外字段。
 * - 不变量与约束：偏好只按用户 ID 隔离，不得跨用户泄漏；不得新增服务、数据表或后台任务；两个开关互不覆盖对方状态。
 * - 验证方式：Header 组件测试验证恢复、保存和用户隔离；getDashboardChartExtraControls 单元测试和看板页面手动切换验证图表行为。
 */
const DashboardChartControls = (): JSX.Element => {
  const dispatch = useDispatch();
  const userId = useSelector<RootState, number | undefined>(
    state => state.user?.userId,
  );
  const controls = useSelector<RootState, DashboardChartControlsState>(
    state =>
      state.dashboardState.dashboardChartControls ||
      DEFAULT_DASHBOARD_CHART_CONTROLS,
  );

  const handleChange = useCallback(
    (name: keyof DashboardChartControlsState, value: boolean) => {
      const nextControls = {
        ...controls,
        [name]: value,
      };
      persistDashboardChartControls(userId, nextControls);
      dispatch(setDashboardChartControls(nextControls));
    },
    [controls, dispatch, userId],
  );

  return (
    <Controls data-test="dashboard-chart-controls">
      <Control data-test="dashboard-time-compare-control">
        <Switch
          size="small"
          checked={controls.timeCompareEnabled}
          onChange={value => handleChange('timeCompareEnabled', value)}
          aria-label={t('Time comparison')}
        />
        <span>{t('Time comparison')}</span>
      </Control>
      <Control data-test="dashboard-show-value-control">
        <Switch
          size="small"
          checked={controls.showValueEnabled}
          onChange={value => handleChange('showValueEnabled', value)}
          aria-label={t('Show Values')}
        />
        <span>{t('Show Values')}</span>
      </Control>
    </Controls>
  );
};

export default DashboardChartControls;
