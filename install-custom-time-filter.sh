#!/bin/bash
set -e

# ============================================
#  Superset 自定义时间筛选插件 - 一键安装脚本
#  功能：时间范围 + 时间粒度（含财年季度 4月起始）
# ============================================

CONTAINER="superset-superset-1"
FILTERS_DIR="/app/superset-frontend/src/filters/components"
PLUGIN_DIR="${FILTERS_DIR}/CustomTime"
CONFIG_FILE="/app/docker/pythonpath_dev/superset_config.py"

echo "=========================================="
echo "  安装自定义时间筛选插件"
echo "  (含财年季度: Q1=4-6月, Q4=1-3月)"
echo "=========================================="

# ── 1. 检查容器是否运行 ──
echo ""
echo "[1/7] 检查容器状态..."
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "❌ 容器 ${CONTAINER} 未运行，请先启动 Superset"
  exit 1
fi
echo "✅ 容器 ${CONTAINER} 运行中"

# ── 2. 创建插件目录 ──
echo ""
echo "[2/7] 创建插件目录..."
docker exec ${CONTAINER} mkdir -p ${PLUGIN_DIR}
echo "✅ 目录创建完成"

# ── 3. 写入插件源码文件 ──
echo ""
echo "[3/7] 写入插件源码文件..."

# --- types.ts ---
docker exec ${CONTAINER} bash -c "cat > ${PLUGIN_DIR}/types.ts" << 'FILEOF'
import { QueryFormData, SetDataMaskHook, FilterState } from '@superset-ui/core';

export interface TimePreset {
  label: string;
  key: string;
  duration: string;
}

export interface TimeGrainOption {
  label: string;
  key: string;
  value: string;
}

export interface CustomTimeFilterFormData extends QueryFormData {
  defaultPreset?: string;
  defaultGrain?: string;
  enableCustomRange?: boolean;
  enablePresets?: boolean;
  enableTimeGrain?: boolean;
}

export const DEFAULT_PRESETS: TimePreset[] = [
  { label: 'Today',        key: 'today',      duration: 'today' },
  { label: 'Yesterday',    key: 'yesterday',  duration: 'yesterday' },
  { label: 'Last 7 days',  key: 'last_7d',    duration: 'Last 7 days' },
  { label: 'Last 30 days', key: 'last_30d',   duration: 'Last 30 days' },
  { label: 'Last 90 days', key: 'last_90d',   duration: 'Last 90 days' },
  { label: 'This month',   key: 'this_month',  duration: 'previous calendar month' },
  { label: 'This year',    key: 'this_year',   duration: 'previous calendar year' },
];

export const TIME_GRAIN_OPTIONS: TimeGrainOption[] = [
  { label: 'Day',              key: 'day',     value: 'P1D' },
  { label: 'Week',             key: 'week',    value: 'P1W' },
  { label: 'Month',            key: 'month',   value: 'P1M' },
  { label: 'Quarter (fiscal)', key: 'quarter', value: 'P3M_FISCAL' },
  { label: 'Year',             key: 'year',    value: 'P1Y' },
];
FILEOF
echo "  ✓ types.ts"

# --- controlPanel.ts ---
docker exec ${CONTAINER} bash -c "cat > ${PLUGIN_DIR}/controlPanel.ts" << 'FILEOF'
import { ControlPanelConfig, sections } from '@superset-ui/chart-controls';
import { t } from '@superset-ui/core';
import { DEFAULT_PRESETS, TIME_GRAIN_OPTIONS } from './types';

const controlPanel: ControlPanelConfig = {
  controlPanelSections: [
    { ...sections.legacyRegularTime },
    {
      label: t('Filter Settings'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'enablePresets',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Preset Buttons'),
              description: t('Show quick-select preset buttons'),
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
              description: t('Allow picking a custom date range'),
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
              description: t('Allow selecting time granularity (Day/Week/Month/Quarter/Year)'),
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
              description: t('Default time range on dashboard load'),
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
              description: t('Default time granularity on dashboard load'),
              default: 'day',
              choices: TIME_GRAIN_OPTIONS.map(g => [g.key, g.label]),
              renderTrigger: true,
            },
          },
        ],
      ],
    },
  ],
};

export default controlPanel;
FILEOF
echo "  ✓ controlPanel.ts"

# --- transformProps.ts ---
docker exec ${CONTAINER} bash -c "cat > ${PLUGIN_DIR}/transformProps.ts" << 'FILEOF'
import { ChartProps } from '@superset-ui/core';

export default function transformProps(chartProps: ChartProps) {
  const { height, width, formData, queriesData, filterState, hooks } = chartProps;
  const { setDataMask = () => {} } = hooks;

  return {
    height,
    width,
    formData,
    data: queriesData?.[0]?.data || [],
    filterState: filterState || {},
    setDataMask,
  };
}
FILEOF
echo "  ✓ transformProps.ts"

# --- CustomTimeFilterPlugin.tsx ---
docker exec ${CONTAINER} bash -c "cat > ${PLUGIN_DIR}/CustomTimeFilterPlugin.tsx" << 'FILEOF'
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { styled, t } from '@superset-ui/core';
import { DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { DEFAULT_PRESETS, TIME_GRAIN_OPTIONS, TimePreset, TimeGrainOption } from './types';

const { RangePicker } = DatePicker;

/* ── Styled Components ── */

const FilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 0;
  width: 100%;
`;

const SectionLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.grayscale.dark1};
  margin-bottom: -4px;
`;

const PresetsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

interface BtnActiveProps {
  isActive: boolean;
}

const PresetButton = styled.button<BtnActiveProps>`
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  border: 1px solid
    ${({ isActive, theme }) =>
      isActive ? theme.colors.primary.base : theme.colors.grayscale.light2};
  background: ${({ isActive, theme }) =>
    isActive ? theme.colors.primary.base : 'transparent'};
  color: ${({ isActive, theme }) =>
    isActive ? '#fff' : theme.colors.grayscale.dark1};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.base};
    background: ${({ isActive, theme }) =>
      isActive ? theme.colors.primary.dark1 : theme.colors.primary.light4};
  }
`;

const GrainButton = styled.button<BtnActiveProps>`
  padding: 4px 14px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  font-weight: ${({ isActive }) => (isActive ? 600 : 400)};
  border: 1px solid
    ${({ isActive, theme }) =>
      isActive ? theme.colors.primary.base : theme.colors.grayscale.light2};
  background: ${({ isActive, theme }) =>
    isActive ? theme.colors.primary.light4 : 'transparent'};
  color: ${({ isActive, theme }) =>
    isActive ? theme.colors.primary.dark1 : theme.colors.grayscale.dark1};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.base};
    color: ${({ theme }) => theme.colors.primary.dark1};
  }
`;

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.grayscale.light2};
  margin: 2px 0;
`;

const RangeLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.grayscale.base};
`;

const StatusBar = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
`;

const StatusTag = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.grayscale.base};
  padding: 2px 8px;
  background: ${({ theme }) => theme.colors.grayscale.light4};
  border-radius: 4px;
  display: inline-block;
`;

/* ── Component ── */

export default function CustomTimeFilterPlugin(props: any) {
  const { formData, filterState, setDataMask, width } = props;

  const {
    defaultPreset = 'last_7d',
    defaultGrain = 'day',
    enablePresets = true,
    enableCustomRange = true,
    enableTimeGrain = true,
  } = formData || {};

  const presets: TimePreset[] = DEFAULT_PRESETS;
  const grainOptions: TimeGrainOption[] = TIME_GRAIN_OPTIONS;

  /* ── State ── */
  const [activePreset, setActivePreset] = useState<string | null>(
    filterState?.value ?? defaultPreset,
  );
  const [activeGrain, setActiveGrain] = useState<string>(
    filterState?.grain ?? defaultGrain,
  );
  const [customRange, setCustomRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  /* ── setDataMask: 同时传递 time_range + time_grain_sqla ── */
  const applyFilter = useCallback(
    (timeRange: string, grainKey: string, presetKey?: string) => {
      const grainOption = grainOptions.find(
        (g: TimeGrainOption) => g.key === grainKey,
      );
      const grainValue = grainOption?.value || 'P1D';
      const grainLabel = grainOption?.label || 'Day';

      const rangeLabel = presetKey
        ? presets.find((p: TimePreset) => p.key === presetKey)?.label || timeRange
        : timeRange;

      setDataMask({
        extraFormData: {
          time_range: timeRange,
          time_grain_sqla: grainValue,
        },
        filterState: {
          value: presetKey || timeRange,
          grain: grainKey,
          label: rangeLabel + ' | ' + grainLabel,
        },
      });
    },
    [setDataMask, presets, grainOptions],
  );

  /* ── 获取当前 timeRange ── */
  const getCurrentTimeRange = useCallback((): string => {
    if (activePreset) {
      const preset = presets.find((p: TimePreset) => p.key === activePreset);
      return preset?.duration || 'Last 7 days';
    }
    if (customRange && customRange[0] && customRange[1]) {
      return customRange[0].format('YYYY-MM-DD') + ' : ' + customRange[1].format('YYYY-MM-DD');
    }
    return 'Last 7 days';
  }, [activePreset, customRange, presets]);

  /* ── 初始化 ── */
  useEffect(() => {
    if (!filterState?.value) {
      const preset = presets.find((p: TimePreset) => p.key === defaultPreset);
      if (preset) {
        applyFilter(preset.duration, defaultGrain, preset.key);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 点击预设 ── */
  const handlePresetClick = useCallback(
    (preset: TimePreset) => {
      setActivePreset(preset.key);
      setCustomRange(null);
      applyFilter(preset.duration, activeGrain, preset.key);
    },
    [applyFilter, activeGrain],
  );

  /* ── 自定义日期范围 ── */
  const handleRangeChange = useCallback(
    (dates: [Dayjs | null, Dayjs | null] | null) => {
      setCustomRange(dates);
      if (dates && dates[0] && dates[1]) {
        setActivePreset(null);
        const timeRange = dates[0].format('YYYY-MM-DD') + ' : ' + dates[1].format('YYYY-MM-DD');
        applyFilter(timeRange, activeGrain);
      }
    },
    [applyFilter, activeGrain],
  );

  /* ── 切换时间粒度 ── */
  const handleGrainClick = useCallback(
    (grain: TimeGrainOption) => {
      setActiveGrain(grain.key);
      const timeRange = getCurrentTimeRange();
      applyFilter(timeRange, grain.key, activePreset || undefined);
    },
    [applyFilter, getCurrentTimeRange, activePreset],
  );

  /* ── 状态标签 ── */
  const currentRangeLabel = useMemo(() => {
    if (activePreset) {
      return presets.find((p: TimePreset) => p.key === activePreset)?.label || activePreset;
    }
    if (customRange && customRange[0] && customRange[1]) {
      return customRange[0].format('YYYY-MM-DD') + ' ~ ' + customRange[1].format('YYYY-MM-DD');
    }
    return t('Not selected');
  }, [activePreset, customRange, presets]);

  const currentGrainLabel = useMemo(() => {
    return grainOptions.find((g: TimeGrainOption) => g.key === activeGrain)?.label || 'Day';
  }, [activeGrain, grainOptions]);

  return (
    <FilterContainer style={{ maxWidth: width }}>
      {/* ── 时间范围 ── */}
      {enablePresets && (
        <>
          <SectionLabel>{t('Time range')}</SectionLabel>
          <PresetsRow>
            {presets.map((preset: TimePreset) => (
              <PresetButton
                key={preset.key}
                isActive={activePreset === preset.key}
                onClick={() => handlePresetClick(preset)}
              >
                {preset.label}
              </PresetButton>
            ))}
          </PresetsRow>
        </>
      )}

      {/* ── 自定义日期范围 ── */}
      {enableCustomRange && (
        <>
          {enablePresets && <Divider />}
          <RangeLabel>{t('Custom range')}</RangeLabel>
          <RangePicker
            value={customRange}
            onChange={handleRangeChange as any}
            format="YYYY-MM-DD"
            style={{ width: '100%' }}
            allowClear
            placeholder={[t('Start date'), t('End date')]}
          />
        </>
      )}

      {/* ── 时间粒度 ── */}
      {enableTimeGrain && (
        <>
          <Divider />
          <SectionLabel>{t('Time grain')}</SectionLabel>
          <PresetsRow>
            {grainOptions.map((grain: TimeGrainOption) => (
              <GrainButton
                key={grain.key}
                isActive={activeGrain === grain.key}
                onClick={() => handleGrainClick(grain)}
              >
                {grain.label}
              </GrainButton>
            ))}
          </PresetsRow>
        </>
      )}

      {/* ── 状态 ── */}
      <StatusBar>
        <StatusTag>{t('Range')}: {currentRangeLabel}</StatusTag>
        {enableTimeGrain && (
          <StatusTag>{t('Grain')}: {currentGrainLabel}</StatusTag>
        )}
      </StatusBar>
    </FilterContainer>
  );
}
FILEOF
echo "  ✓ CustomTimeFilterPlugin.tsx"

# --- index.ts ---
docker exec ${CONTAINER} bash -c "cat > ${PLUGIN_DIR}/index.ts" << 'FILEOF'
import { t, ChartMetadata, ChartPlugin, Behavior } from '@superset-ui/core';
import controlPanel from './controlPanel';
import transformProps from './transformProps';

export default class CustomTimeFilterPlugin extends ChartPlugin {
  constructor() {
    super({
      metadata: new ChartMetadata({
        name: t('Custom Time Filter'),
        description: t(
          'Time filter with presets, date range picker, and time grain selector '
          + '(Day/Week/Month/Fiscal Quarter/Year).',
        ),
        behaviors: [Behavior.NativeFilter],
        tags: ['filter', 'time', 'custom'],
      }),
      loadChart: () => import('./CustomTimeFilterPlugin'),
      controlPanel,
      transformProps,
    });
  }
}
FILEOF
echo "  ✓ index.ts"

echo "✅ 所有插件源码写入完成"

# ── 4. 修改 components/index.ts ──
echo ""
echo "[4/7] 修改 components/index.ts 添加导出..."

docker exec ${CONTAINER} bash -c "
  INDEX_FILE='${FILTERS_DIR}/index.ts'
  if grep -q 'CustomTimeFilterPlugin' \${INDEX_FILE}; then
    echo '  ⏭ 已存在，跳过'
  else
    echo \"export { default as CustomTimeFilterPlugin } from './CustomTime';\" >> \${INDEX_FILE}
    echo '  ✓ 已添加导出'
  fi
"

# ── 5. 修改 constants.ts ──
echo ""
echo "[5/7] 修改 constants.ts 添加枚举值..."

docker exec ${CONTAINER} bash -c "
  CONST_FILE='/app/superset-frontend/src/constants.ts'
  if grep -q 'CustomTime' \${CONST_FILE}; then
    echo '  ⏭ 已存在，跳过'
  else
    sed -i \"/TimeGrain = 'filter_timegrain'/a\\  CustomTime = 'filter_custom_time',\" \${CONST_FILE}
    echo '  ✓ 已添加 CustomTime 枚举值'
  fi
"

# ── 6. 修改 MainPreset.ts ──
echo ""
echo "[6/7] 修改 MainPreset.ts 注册插件..."

docker exec ${CONTAINER} bash -c "
  PRESET_FILE='/app/superset-frontend/src/visualizations/presets/MainPreset.ts'
  if grep -q 'CustomTimeFilterPlugin' \${PRESET_FILE}; then
    echo '  ⏭ 已存在，跳过'
  else
    sed -i \"s/TimeGrainFilterPlugin,/TimeGrainFilterPlugin,\n  CustomTimeFilterPlugin,/\" \${PRESET_FILE}

    sed -i '/key: FilterPlugins.TimeGrain/,/}),/{
      /}),/a\\        new CustomTimeFilterPlugin().configure({\n          key: FilterPlugins.CustomTime,\n        }),
    }' \${PRESET_FILE}

    echo '  ✓ 已注册插件'
  fi
"

# ── 7. 修改 superset_config.py（添加财年季度 time grain） ──
echo ""
echo "[7/7] 修改 superset_config.py 添加财年季度..."

docker exec ${CONTAINER} bash -c "
  CONFIG='${CONFIG_FILE}'
  if grep -q 'P3M_FISCAL' \${CONFIG}; then
    echo '  ⏭ 已存在，跳过'
  else
    cat >> \${CONFIG} << 'PYEOF'

# ============================================
# 自定义时间粒度：财年季度（4月起始）
# Q1: 4-6月, Q2: 7-9月, Q3: 10-12月, Q4: 次年1-3月
# ============================================
TIME_GRAIN_ADDONS = {
    'P3M_FISCAL': 'Fiscal Quarter (Apr start)',
}

TIME_GRAIN_FUNCTIONS = {
    'postgresql': {
        'P3M_FISCAL': \"DATE_TRUNC('quarter', {col} - INTERVAL '3 months') + INTERVAL '3 months'\",
    },
}
PYEOF
    echo '  ✓ 已添加财年季度配置'
  fi
"

echo ""
echo "=========================================="
echo "  ✅ 全部安装完成！"
echo "=========================================="
echo ""
echo "财年季度逻辑说明："
echo "  原理: 先把日期减3个月，按自然季度截断，再加回3个月"
echo "  效果: 4月→Q1起点, 7月→Q2起点, 10月→Q3起点, 1月→Q4起点"
echo ""
echo "接下来两步："
echo ""
echo "  ① 重新构建前端（5-15 分钟）："
echo "     docker exec -it ${CONTAINER} bash"
echo "     cd /app/superset-frontend"
echo "     npm run build"
echo ""
echo "  ② 重启容器（使后端配置生效）："
echo "     docker restart ${CONTAINER}"
echo ""
echo "⚠️  确保 Docker 内存 >= 4GB，避免构建 OOM"
echo "=========================================="
