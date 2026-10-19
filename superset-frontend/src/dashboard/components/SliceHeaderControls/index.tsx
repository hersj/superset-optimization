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
  MouseEvent,
  Key,
  KeyboardEvent,
  useState,
  useRef,
  RefObject,
} from 'react';

import { isEqual } from 'lodash';
import { RouteComponentProps, useHistory } from 'react-router-dom';
import { extendedDayjs } from '@superset-ui/core/utils/dates';
import { t } from '@apache-superset/core/translation';
import {
  Behavior,
  isFeatureEnabled,
  FeatureFlag,
  getChartMetadataRegistry,
  VizType,
  BinaryQueryObjectFilterClause,
  QueryFormData,
} from '@superset-ui/core';
import { css, useTheme, styled } from '@apache-superset/core/theme';
import { useSelector } from 'react-redux';
import { Menu, MenuItem } from '@superset-ui/core/components/Menu';
import type {
  PersonalChartLayout,
  PersonalChartTemplateSelection,
} from 'src/dashboard/actions/personalChartLayout';
import {
  NoAnimationDropdown,
  Tooltip,
  Button,
  ModalTrigger,
} from '@superset-ui/core/components';
import { useShareMenuItems } from 'src/dashboard/components/menu/ShareMenuItems';
import downloadAsImage from 'src/utils/downloadAsImage';
import { getSliceHeaderTooltip } from 'src/dashboard/util/getSliceHeaderTooltip';
import { Icons } from '@superset-ui/core/components/Icons';
import ViewQueryModal from 'src/explore/components/controls/ViewQueryModal';
import { ResultsPaneOnDashboard } from 'src/explore/components/DataTablesPane';
import { useDrillDetailMenuItems } from 'src/components/Chart/useDrillDetailMenuItems';
import { LOG_ACTIONS_CHART_DOWNLOAD_AS_IMAGE } from 'src/logger/LogUtils';
import { MenuKeys, RootState } from 'src/dashboard/types';
import DrillDetailModal from 'src/components/Chart/DrillDetail/DrillDetailModal';
import { usePermissions } from 'src/hooks/usePermissions';
import { useDatasetDrillInfo } from 'src/hooks/apiResources/datasets';
import { ResourceStatus } from 'src/hooks/apiResources/apiResources';
import { useCrossFiltersScopingModal } from '../nativeFilters/FilterBar/CrossFilters/ScopingModal/useCrossFiltersScopingModal';
import { ViewResultsModalTrigger } from './ViewResultsModalTrigger';
import PivotMetricLayoutModal from './PivotMetricLayoutModal';

const RefreshTooltip = styled.div`
  ${({ theme }) => css`
    height: auto;
    margin: ${theme.sizeUnit}px 0;
    color: ${theme.colorTextLabel};
    line-height: 21px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
  `}
`;

const getScreenshotNodeSelector = (chartId: string | number) =>
  `.dashboard-chart-id-${chartId}`;

const VerticalDotsTrigger = () => {
  const theme = useTheme();
  return (
    <Icons.EllipsisOutlined
      css={css`
        transform: rotate(90deg);
        &:hover {
          cursor: pointer;
        }
      `}
      iconSize="xl"
      iconColor={theme.colorTextLabel}
      className="dot"
    />
  );
};

export interface SliceHeaderControlsProps {
  slice: {
    description: string;
    viz_type: string;
    slice_name: string;
    slice_id: number;
    slice_description: string;
    datasource: string;
  };

  defaultOpen?: boolean;
  componentId: string;
  dashboardId: number;
  chartStatus: string;
  isCached: boolean[];
  cachedDttm: string[] | null;
  queriedDttm?: string | null;
  isExpanded?: boolean;
  updatedDttm: number | null;
  isFullSize?: boolean;
  isDescriptionExpanded?: boolean;
  formData: QueryFormData;
  exploreUrl: string;

  forceRefresh: (sliceId: number, dashboardId: number) => void;
  logExploreChart?: (sliceId: number) => void;
  logEvent?: (eventName: string, eventData?: object) => void;
  toggleExpandSlice?: (sliceId: number) => void;
  exportCSV?: (sliceId: number) => void;
  exportPivotCSV?: (sliceId: number) => void;
  exportFullCSV?: (sliceId: number) => void;
  exportXLSX?: (sliceId: number) => void;
  exportFullXLSX?: (sliceId: number) => void;
  handleToggleFullSize: () => void;
  exportPivotExcel?: (tableSelector: string, sliceName: string) => void;

  addDangerToast: (message: string) => void;
  addSuccessToast: (message: string) => void;

  supersetCanExplore?: boolean;
  supersetCanShare?: boolean;
  supersetCanCSV?: boolean;

  crossFiltersEnabled?: boolean;
  personalChartLayout?: PersonalChartLayout;
  dashboardPivotLayout?: PersonalChartLayout | null;
  personalChartTemplates?: import('src/dashboard/actions/personalChartLayout').PersonalChartTemplate[];
  legacyChartTemplates?: import('src/dashboard/actions/personalChartLayout').PersonalChartTemplate[];
  personalChartTemplateActiveSlot?: PersonalChartTemplateSelection;
  onApplyPersonalChartLayout?: (
    layout: PersonalChartLayout | null,
    slot: 1 | 2 | 3 | null,
  ) => Promise<void> | void;
  onSavePersonalChartTemplate?: (
    slot: 1 | 2 | 3,
    name: string,
    layout: PersonalChartLayout,
  ) => Promise<void> | void;
  onSetPersonalChartTemplateDefault?: (slot: 1 | 2 | 3) => Promise<void> | void;
  onSaveDashboardPivotLayout?: (
    layout: PersonalChartLayout,
  ) => Promise<void> | void;
  onDisableDashboardPivotLayout?: () => Promise<void> | void;
  onDeletePersonalChartTemplate?: (slot: 1 | 2 | 3) => Promise<void> | void;
  isSavingPersonalChartLayout?: boolean;
}
type SliceHeaderControlsPropsWithRouter = SliceHeaderControlsProps &
  RouteComponentProps;

const dropdownIconsStyles = css`
  &&.anticon > .anticon:first-child {
    margin-right: 0;
    vertical-align: 0;
  }
`;

const SliceHeaderControls = (
  props: SliceHeaderControlsPropsWithRouter | SliceHeaderControlsProps,
) => {
  const [drillModalIsOpen, setDrillModalIsOpen] = useState(false);
  const [showPivotMetricLayoutModal, setShowPivotMetricLayoutModal] =
    useState(false);
  // setting openKeys undefined falls back to uncontrolled behaviour
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [openScopingModal, scopingModal] = useCrossFiltersScopingModal(
    props.slice.slice_id,
  );
  const history = useHistory();

  const queryMenuRef: RefObject<any> = useRef(null);
  const resultsMenuRef: RefObject<any> = useRef(null);

  const [modalFilters, setFilters] = useState<BinaryQueryObjectFilterClause[]>(
    [],
  );
  const theme = useTheme();

  const canEditCrossFilters =
    useSelector<RootState, boolean>(
      ({ dashboardInfo }) => dashboardInfo.dash_edit_perm,
    ) &&
    getChartMetadataRegistry()
      .get(props.slice.viz_type)
      ?.behaviors?.includes(Behavior.InteractiveChart);
  const canExplore = props.supersetCanExplore;
  const { canDrillToDetail, canViewQuery, canViewTable } = usePermissions();

  const datasetResource = useDatasetDrillInfo(
    props.slice.datasource,
    props.dashboardId,
    props.formData,
    !canDrillToDetail,
  );

  const datasetWithVerboseMap =
    datasetResource.status === ResourceStatus.Complete
      ? datasetResource.result
      : undefined;

  const refreshChart = () => {
    if (props.updatedDttm) {
      props.forceRefresh(props.slice.slice_id, props.dashboardId);
    }
  };

  const handleMenuClick = ({
    key,
    domEvent,
  }: {
    key: Key;
    domEvent: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>;
  }) => {
    switch (key) {
      case MenuKeys.ForceRefresh:
        refreshChart();
        props.addSuccessToast(t('Data refreshed'));
        break;
      case MenuKeys.ToggleChartDescription:
        // eslint-disable-next-line no-unused-expressions
        props.toggleExpandSlice?.(props.slice.slice_id);
        break;
      case MenuKeys.ExploreChart:
        // eslint-disable-next-line no-unused-expressions
        props.logExploreChart?.(props.slice.slice_id);
        if (domEvent.metaKey || domEvent.ctrlKey) {
          domEvent.preventDefault();
          window.open(props.exploreUrl, '_blank');
        } else {
          history.push(props.exploreUrl);
        }
        break;
      case 'duplicate_chart': {
        /*
         * 功能审计（可重写规格）：从看板复制图表
         * - 功能目的与触发方式：有图表编辑权限的用户在图表“更多”菜单点击“复制图表”。
         * - 输入契约：使用当前图表的 exploreUrl；该 URL 必须保留原图表、看板上下文和筛选参数。
         * - 输出契约：打开原图表的探索页并显示另存为弹窗，原图表不被修改。
         * - 处理流程：追加 duplicate_chart=1 标记；普通打开使用当前窗口，Ctrl/Cmd 点击使用新窗口。
         * - 业务规则：复制始终走既有 Save as 创建流程，不能走覆盖保存；用户确认保存前不创建新图表。
         * - 状态与副作用：仅改变浏览器导航状态；最终保存复用既有创建图表接口和权限校验。
         * - 外部依赖：依赖探索页、SaveModal 和现有 chart create API。
         * - 异常与边界：URL 无查询参数时仍可追加标记；取消弹窗或保存失败不影响原图表。
         * - 不变量与约束：不新增数据库字段、接口或持久化状态，不绕过现有权限。
         * - 验证方式：菜单测试断言追加标记；SaveModal 测试断言强制 saveas 和副本名称。
         */
        const duplicateUrl = new URL(props.exploreUrl, window.location.origin);
        duplicateUrl.searchParams.set('duplicate_chart', '1');
        const targetUrl = `${duplicateUrl.pathname}${duplicateUrl.search}${duplicateUrl.hash}`;
        if (domEvent.metaKey || domEvent.ctrlKey) {
          domEvent.preventDefault();
          window.open(targetUrl, '_blank');
        } else {
          history.push(targetUrl);
        }
        break;
      }
      case MenuKeys.ExportCsv:
        // eslint-disable-next-line no-unused-expressions
        props.exportCSV?.(props.slice.slice_id);
        break;
      case MenuKeys.ExportPivotCsv:
        // eslint-disable-next-line no-unused-expressions
        props.exportPivotCSV?.(props.slice.slice_id);
        break;
      case MenuKeys.Fullscreen:
        props.handleToggleFullSize();
        break;
      case MenuKeys.ExportFullCsv:
        // eslint-disable-next-line no-unused-expressions
        props.exportFullCSV?.(props.slice.slice_id);
        break;
      case MenuKeys.ExportFullXlsx:
        // eslint-disable-next-line no-unused-expressions
        props.exportFullXLSX?.(props.slice.slice_id);
        break;
      case MenuKeys.ExportXlsx:
        // eslint-disable-next-line no-unused-expressions
        props.exportXLSX?.(props.slice.slice_id);
        break;
      case MenuKeys.DownloadAsImage: {
        // menu closes with a delay, we need to hide it manually,
        // so that we don't capture it on the screenshot
        const menu = document.querySelector(
          '.ant-dropdown:not(.ant-dropdown-hidden)',
        ) as HTMLElement;
        if (menu) {
          menu.style.visibility = 'hidden';
        }
        downloadAsImage(
          getScreenshotNodeSelector(props.slice.slice_id),
          props.slice.slice_name,
          true,
          theme,
        )(domEvent).then(() => {
          if (menu) {
            menu.style.visibility = 'visible';
          }
        });
        props.logEvent?.(LOG_ACTIONS_CHART_DOWNLOAD_AS_IMAGE, {
          chartId: props.slice.slice_id,
        });
        break;
      }
      case MenuKeys.ExportPivotXlsx: {
        const sliceSelector = `#chart-id-${props.slice.slice_id}`;
        props.exportPivotExcel?.(
          `${sliceSelector} .pvtTable`,
          props.slice.slice_name,
        );
        break;
      }
      case MenuKeys.CrossFilterScoping: {
        openScopingModal();
        break;
      }
      case MenuKeys.CustomizePivotColumns: {
        setShowPivotMetricLayoutModal(true);
        break;
      }
      case MenuKeys.ViewResults: {
        if (resultsMenuRef.current && !resultsMenuRef.current.showModal) {
          resultsMenuRef.current.open(domEvent);
        }
        break;
      }
      case MenuKeys.DrillToDetail: {
        setDrillModalIsOpen(!drillModalIsOpen);
        break;
      }
      case MenuKeys.ViewQuery: {
        if (queryMenuRef.current && !queryMenuRef.current.showModal) {
          queryMenuRef.current.open(domEvent);
        }
        break;
      }
      default:
        break;
    }
    setIsDropdownVisible(false);
  };

  const {
    componentId,
    dashboardId,
    slice,
    isFullSize,
    cachedDttm = [],
    queriedDttm = null,
    updatedDttm = null,
    addSuccessToast = () => {},
    addDangerToast = () => {},
    supersetCanShare = false,
    isCached = [],
  } = props;
  const isTable = slice.viz_type === VizType.Table;
  const isPivotTable = slice.viz_type === VizType.PivotTable;
  const canCustomizePivotColumns = isPivotTable;
  /*
   * 功能审计（可重写规格）：透视表标题栏个人列模板快捷切换
   * - 功能目的与触发方式：仅在 pivot_table_v2 图表标题栏提供当前用户模板的可见选择入口。
   * - 输入契约：模板、激活 slot 和应用回调均来自当前 dashboard/chart 的既有 Redux 状态与回调。
   * - 输出契约：选择模板或系统默认会保存当前用户的当前图表布局，不写共享看板配置。
   * - 处理流程：显示当前激活模板；菜单选择精确模板 slot 或系统默认后调用既有 onApply 回调。
   * - 业务规则：切换只保存当前图表快照，不修改模板内容或其他图表。
   * - 状态与副作用：应用回调持久化成功后更新显示，失败保留旧布局并提示错误。
   * - 异常与边界：无模板时仍可选择系统默认；非透视图不渲染入口。
   * - 验证方式：SliceHeaderControls 组件测试覆盖显示当前模板和切换另一模板。
   */
  const personalChartTemplates = props.personalChartTemplates || [];
  const activePersonalChartTemplate = personalChartTemplates.find(
    template =>
      template.slot === props.personalChartTemplateActiveSlot &&
      isEqual(
        { frozen_column_count: 0, ...template.layout },
        { frozen_column_count: 0, ...props.personalChartLayout },
      ),
  );
  const activePersonalChartTemplateName = props.dashboardPivotLayout
    ? t('本看板共享')
    : activePersonalChartTemplate?.name ||
      (props.personalChartTemplateActiveSlot === 'system-default' ||
      !props.personalChartLayout
        ? t('系统默认')
        : t('自定义布局'));
  const personalTemplateMenuItems: MenuItem[] = props.dashboardPivotLayout
    ? [{ key: 'dashboard-shared', label: t('本看板共享（在自定义列中停用）') }]
    : [
        { key: 'system-default', label: t('系统默认') },
        ...personalChartTemplates.map(template => ({
          key: ['personal-template', template.slot].join('-'),
          label: template.name,
        })),
      ];
  const applyPersonalTemplate = async (key: Key) => {
    if (props.dashboardPivotLayout) return;
    try {
      if (key === 'system-default') {
        await props.onApplyPersonalChartLayout?.(null, null);
        return;
      }
      const template = personalChartTemplates.find(
        item => ['personal-template', item.slot].join('-') === key,
      );
      if (template) {
        await props.onApplyPersonalChartLayout?.(
          template.layout,
          template.slot,
        );
      }
    } catch {
      // The owning chart displays the save error and retains the previous layout.
    }
  };

  const cachedWhen = (cachedDttm || []).map(itemCachedDttm =>
    (extendedDayjs.utc(itemCachedDttm) as any).fromNow(),
  );
  const updatedWhen = updatedDttm
    ? (extendedDayjs.utc(updatedDttm) as any).fromNow()
    : '';
  const getCachedTitle = (itemCached: boolean) => {
    if (itemCached) {
      return t('Cached %s', cachedWhen);
    }
    if (updatedWhen) {
      return t('Fetched %s', updatedWhen);
    }
    return '';
  };
  const refreshTooltipData = [...new Set(isCached.map(getCachedTitle) || '')];
  // If all queries have same cache time we can unit them to one
  const refreshTooltip = refreshTooltipData.map((item, index) => (
    <div key={`tooltip-${index}`}>
      {refreshTooltipData.length > 1
        ? t('Query %s: %s', index + 1, item)
        : item}
    </div>
  ));

  const queriedLabel = queriedDttm
    ? extendedDayjs.utc(queriedDttm).local().format('L LTS')
    : null;
  const fullscreenLabel = isFullSize
    ? t('Exit fullscreen')
    : t('Enter fullscreen');

  // @z-index-below-dashboard-header (100) - 1 = 99 for !isFullSize and 101 for isFullSize
  const dropdownOverlayStyle = {
    zIndex: isFullSize ? 101 : 99,
    animationDuration: '0s',
  };

  const newMenuItems: MenuItem[] = [
    {
      key: MenuKeys.ForceRefresh,
      label: (
        <Tooltip
          title={queriedLabel ? `${t('Last queried at')}: ${queriedLabel}` : ''}
          overlayStyle={{ maxWidth: 'none' }}
        >
          <div>
            {t('Force refresh')}
            <RefreshTooltip data-test="dashboard-slice-refresh-tooltip">
              {refreshTooltip}
            </RefreshTooltip>
          </div>
        </Tooltip>
      ),
      disabled: props.chartStatus === 'loading',
      style: { height: 'auto', lineHeight: 'initial' },
      'data-test': 'refresh-chart-menu-item', // Typescript hack to get around MenuItem type
    } as any,
    {
      key: MenuKeys.Fullscreen,
      label: fullscreenLabel,
    },
    {
      type: 'divider',
    },
  ];

  if (slice.description) {
    newMenuItems.push({
      key: MenuKeys.ToggleChartDescription,
      label: props.isDescriptionExpanded
        ? t('Hide chart description')
        : t('Show chart description'),
    });
  }

  if (canExplore) {
    newMenuItems.push({
      key: MenuKeys.ExploreChart,
      label: (
        <Tooltip title={getSliceHeaderTooltip(props.slice.slice_name)}>
          {t('Edit chart')}
        </Tooltip>
      ),
      'data-test-edit-chart-name': slice.slice_name,
    } as any);
    newMenuItems.push({
      key: 'duplicate_chart',
      label: t('复制图表'),
    });
  }

  if (canEditCrossFilters) {
    newMenuItems.push({
      key: MenuKeys.CrossFilterScoping,
      label: t('Cross-filtering scoping'),
    });
  }

  if (canExplore || canEditCrossFilters) {
    newMenuItems.push({ type: 'divider' });
  }

  if (canCustomizePivotColumns) {
    newMenuItems.push({
      key: MenuKeys.CustomizePivotColumns,
      label: t('Customize columns'),
    });
    newMenuItems.push({ type: 'divider' });
  }

  if (canExplore || canViewQuery) {
    newMenuItems.push({
      key: MenuKeys.ViewQuery,
      label: (
        <ModalTrigger
          triggerNode={
            <div data-test="view-query-menu-item">{t('View query')}</div>
          }
          modalTitle={t('View query')}
          modalBody={<ViewQueryModal latestQueryFormData={props.formData} />}
          draggable
          resizable
          responsive
          ref={queryMenuRef}
        />
      ),
    });
  }

  if (canExplore || canViewTable) {
    newMenuItems.push({
      key: MenuKeys.ViewResults,
      label: (
        <ViewResultsModalTrigger
          canExplore={props.supersetCanExplore}
          exploreUrl={props.exploreUrl}
          triggerNode={
            <div data-test="view-query-menu-item">{t('View as table')}</div>
          }
          modalRef={resultsMenuRef}
          modalTitle={t('Chart Data: %s', slice.slice_name)}
          modalBody={
            <ResultsPaneOnDashboard
              queryFormData={props.formData}
              queryForce={false}
              dataSize={20}
              isRequest
              isVisible
              canDownload={!!props.supersetCanCSV}
              columnDisplayNames={datasetWithVerboseMap?.verbose_map}
            />
          }
        />
      ),
    });
  }

  const drillDetailMenuItems = useDrillDetailMenuItems({
    formData: props.formData,
    filters: modalFilters,
    setFilters,
    setShowModal: setDrillModalIsOpen,
    key: MenuKeys.DrillToDetail,
  });

  const shareMenuItems = useShareMenuItems({
    dashboardId,
    dashboardComponentId: componentId,
    copyMenuItemTitle: t('Copy permalink to clipboard'),
    emailMenuItemTitle: t('Share chart by email'),
    emailSubject: t('Superset chart'),
    emailBody: t('Check out this chart: '),
    addSuccessToast,
    addDangerToast,
    title: t('Share'),
    latestQueryFormData: props.formData,
    maxWidth: `${theme.sizeUnit * 100}px`,
  });

  if (isFeatureEnabled(FeatureFlag.DrillToDetail) && canDrillToDetail) {
    newMenuItems.push(...drillDetailMenuItems);
  }

  if (slice.description || canExplore) {
    newMenuItems.push({ type: 'divider' });
  }

  if (supersetCanShare) {
    newMenuItems.push(shareMenuItems);
  }

  if (props.supersetCanCSV) {
    newMenuItems.push({
      type: 'submenu',
      key: MenuKeys.Download,
      label: t('Download'),
      children: [
        {
          key: MenuKeys.ExportCsv,
          label: t('Export to .CSV'),
          icon: <Icons.FileOutlined css={dropdownIconsStyles} />,
        },
        ...(isPivotTable
          ? [
              {
                key: MenuKeys.ExportPivotCsv,
                label: t('Export to Pivoted .CSV'),
                icon: <Icons.FileOutlined css={dropdownIconsStyles} />,
              },
              {
                key: MenuKeys.ExportPivotXlsx,
                label: t('Export to Pivoted Excel'),
                icon: <Icons.FileOutlined css={dropdownIconsStyles} />,
              },
            ]
          : []),
        {
          key: MenuKeys.ExportXlsx,
          label: t('Export to Excel'),
          icon: <Icons.FileOutlined css={dropdownIconsStyles} />,
        },
        ...(isFeatureEnabled(FeatureFlag.AllowFullCsvExport) &&
        props.supersetCanCSV &&
        isTable
          ? [
              {
                key: MenuKeys.ExportFullCsv,
                label: t('Export to full .CSV'),
                icon: <Icons.FileOutlined css={dropdownIconsStyles} />,
              },
              {
                key: MenuKeys.ExportFullXlsx,
                label: t('Export to full Excel'),
                icon: <Icons.FileOutlined css={dropdownIconsStyles} />,
              },
            ]
          : []),
        {
          key: MenuKeys.DownloadAsImage,
          label: t('Download as image'),
          icon: <Icons.FileImageOutlined css={dropdownIconsStyles} />,
        },
      ],
    });
  }

  return (
    <>
      {isFullSize && (
        <Icons.FullscreenExitOutlined
          style={{ fontSize: 22 }}
          onClick={() => {
            props.handleToggleFullSize();
          }}
        />
      )}
      {canCustomizePivotColumns && (
        <NoAnimationDropdown
          popupRender={() => (
            <Menu
              selectable
              selectedKeys={[
                props.dashboardPivotLayout
                  ? 'dashboard-shared'
                  : activePersonalChartTemplate
                    ? [
                        'personal-template',
                        activePersonalChartTemplate.slot,
                      ].join('-')
                    : 'system-default',
              ]}
              onClick={({ key }) => applyPersonalTemplate(key)}
              items={personalTemplateMenuItems}
            />
          )}
          overlayStyle={dropdownOverlayStyle}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            buttonStyle="link"
            aria-label={t('列模板：%(template)s', {
              template: activePersonalChartTemplateName,
            })}
            title={activePersonalChartTemplateName}
            disabled={props.isSavingPersonalChartLayout}
          >
            {t('列模板：%(template)s', {
              template: activePersonalChartTemplateName,
            })}
          </Button>
        </NoAnimationDropdown>
      )}
      <NoAnimationDropdown
        popupRender={() => (
          <Menu
            onClick={handleMenuClick}
            data-test={`slice_${slice.slice_id}-menu`}
            id={`slice_${slice.slice_id}-menu`}
            selectable={false}
            items={newMenuItems}
          />
        )}
        overlayStyle={dropdownOverlayStyle}
        trigger={['click']}
        placement="bottomRight"
        open={isDropdownVisible}
        onOpenChange={visible => setIsDropdownVisible(visible)}
      >
        <Button
          id={`slice_${slice.slice_id}-controls`}
          buttonStyle="link"
          aria-label={t('More Options')}
          aria-haspopup="true"
          css={theme => css`
            padding: ${theme.sizeUnit * 2}px;
            padding-right: 0px;
          `}
        >
          <VerticalDotsTrigger />
        </Button>
      </NoAnimationDropdown>
      <DrillDetailModal
        formData={props.formData}
        initialFilters={[]}
        onHideModal={() => {
          setDrillModalIsOpen(false);
        }}
        chartId={slice.slice_id}
        showModal={drillModalIsOpen}
        dataset={datasetWithVerboseMap}
      />

      {canCustomizePivotColumns && (
        <PivotMetricLayoutModal
          show={showPivotMetricLayoutModal}
          chartId={slice.slice_id}
          metrics={props.formData.metrics || []}
          initialLayout={props.personalChartLayout}
          dashboardSharedLayout={props.dashboardPivotLayout}
          templates={props.personalChartTemplates || []}
          legacyTemplates={props.legacyChartTemplates || []}
          activeSlot={
            typeof props.personalChartTemplateActiveSlot === 'number'
              ? props.personalChartTemplateActiveSlot
              : null
          }
          isSaving={props.isSavingPersonalChartLayout}
          onHide={() => setShowPivotMetricLayoutModal(false)}
          onApply={(layout, slot) =>
            props.onApplyPersonalChartLayout?.(layout, slot)
          }
          onSaveTemplate={(slot, name, layout) =>
            props.onSavePersonalChartTemplate?.(slot, name, layout)
          }
          onSaveDashboardLayout={layout =>
            props.onSaveDashboardPivotLayout?.(layout)
          }
          onDisableDashboardLayout={() =>
            props.onDisableDashboardPivotLayout?.()
          }
          onSetDefault={slot => props.onSetPersonalChartTemplateDefault?.(slot)}
          onDeleteTemplate={slot => props.onDeletePersonalChartTemplate?.(slot)}
        />
      )}

      {canEditCrossFilters && scopingModal}
    </>
  );
};

export default SliceHeaderControls;
