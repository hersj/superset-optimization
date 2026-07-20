#!/usr/bin/env python3
"""Rebuild Superset zh language packs with fuzzy translations disabled.

The source of truth remains messages.po. Fuzzy entries are blanked unless an
explicit override is provided here. Blank JSON entries make the frontend fall
back to English, which is safer than shipping incorrect machine guesses.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from babel.messages.catalog import Catalog
from babel.messages.mofile import read_mo, write_mo
from babel.messages.pofile import read_po, write_po


KEEP_FUZZY_OVERRIDES = {
    "OR": "或者",
    "AND": "并且",
    "all": "全部",
    "max": "最大值",
    "min": "最小值",
    "Auto": "自动",
    "save": "保存",
    "name": "名称",
    "close": "关闭",
    "Count": "计数",
    "Total": "总计",
    "Reset": "重置",
    "Stack": "堆叠",
    "Values": "值",
    "X-axis": "X 轴",
    "Y-axis": "Y 轴",
    "Port": "端口",
    "Find": "查找",
    "Grid": "网格",
    "Expand": "展开",
    "Meters": "米",
    "Purple": "紫色",
    "Weight": "权重",
    "Dashed": "虚线",
    "Dotted": "点线",
    "Filled": "填充",
    "Cached": "已缓存",
}


FIXED_OVERRIDES = {
    # Fuzzy mistranslations from the plan.
    "to": "至",
    "Lat": "纬度",
    "Lon": "经度",
    "New": "新建",
    "SSL": "SSL",
    "List": "列表",
    "Page": "页",
    "True": "真",
    "False": "假",
    "Email": "邮箱",
    "Layer": "图层",
    "Layers": "图层",
    "Local": "本地",
    "Paste": "粘贴",
    "Retry": "重试",
    "Theme": "主题",
    "Themes": "主题",
    "theme": "主题",
    "Unpin": "取消固定",
    "Users": "用户",
    "Extent": "范围",
    "Queued": "排队中",
    "Slider": "滑块",
    "Stream": "流",
    "System": "系统",
    "Equals": "等于",
    "Inside": "内部",
    "Hidden": "隐藏",
    "Unhide": "取消隐藏",
    "Assist": "辅助",
    "Blanks": "空白",
    "unset": "未设置",
    "Dttm": "时间戳",
    # Confirmed hard mistranslations and business-impacting strings.
    "Select a database": "选择数据库",
    "Select a tab": "选择标签页",
    "Big Number": "大数字",
    "Add folder": "新建文件夹",
    "Add or edit display controls": "添加或编辑显示控件",
    "Don't refresh": "不刷新",
    "Referrer": "来源",
    "Client Secret": "客户端密钥",
    "Enter the user's first name": "输入用户的名字",
    "CSV file downloaded successfully": "CSV 文件下载成功。",
    "Dashboard exported successfully": "看板导出成功。",
    "Dashboard exported as example successfully": "看板已成功导出为示例。",
    "The screenshot has been downloaded.": "截图已下载。",
    "PDF download failed, please refresh and try again.": "PDF 下载失败，请刷新后重试。",
    "Download to client": "下载到客户端",
    "Export Current View": "导出当前视图",
    "Export All Data": "导出全部数据",
    "Data Export Options": "数据导出选项",
    "Excel Export": "Excel 导出",
    "Excel XML Export": "Excel XML 导出",
    "CSV Export": "CSV 导出",
    "Import Error": "导入错误",
    "Import themes": "导入主题",
    "Error importing theme.": "导入主题时出错。",
    "Create Tag": "创建标签",
    "Create a new Tag": "创建新标签",
    # Common Superset terminology.
    "Metric": "指标",
    "Metrics": "指标",
    "metric": "指标",
    "Columns and metrics": "列和指标",
    "<new metric>": "新指标",
    "<new column>": "新列",
    "Add dataset columns here to group the pivot table columns.": "在此添加数据集列，用于对透视表列分组。",
    # Users, roles, permissions, and account settings.
    "Add User": "新增用户",
    "Delete User?": "删除用户？",
    "Delete user": "删除用户",
    "Are you sure you want to delete the selected users?": "确定要删除选中的用户吗？",
    "List Users": "用户列表",
    "List Groups": "用户组列表",
    "List Roles": "角色列表",
    "Enter the user's password": "输入用户密码",
    "Enter the user's first name": "输入用户的名字",
    "Enter the user's last name": "输入用户的姓氏",
    "Add Role": "新增角色",
    "Edit Role": "编辑角色",
    "Delete Role?": "删除角色？",
    "Delete role": "删除角色",
    "Duplicate role": "复制角色",
    "Are you sure you want to delete the selected roles?": "确定要删除选中的角色吗？",
    "Add Group": "新增组",
    "Edit Group": "编辑组",
    "Account": "账户",
    "Access & ownership": "访问权限和所有权",
    "Access token": "访问令牌",
    "Last login": "上次登录",
    "Login count": "登录次数",
    "Confirm Password": "确认密码",
    "Confirm password": "确认密码",
    "Please enter a valid email": "请输入有效的邮箱",
    "Please enter your email": "请输入邮箱",
    "Email is required": "邮箱为必填项",
    "Email link": "邮件链接",
    "Add CC Recipients": "添加抄送收件人",
    "Add BCC Recipients": "添加密送收件人",
    "%s recipients": "%s 个收件人",
    # Dashboard, chart, dataset, and database workflow.
    "A new chart and dashboard will be created.": "将创建一个新图表和看板。",
    "A new chart will be created.": "将创建一个新图表。",
    "A new dashboard will be created.": "将创建一个新看板。",
    "Add the name of the chart": "添加图表名称",
    "Add the name of the dashboard": "添加看板名称",
    "Basic information about the chart": "图表基本信息",
    "Affected Charts": "受影响的图表",
    "Affected Dashboards": "受影响的看板",
    "Add a dataset": "新增数据集",
    "Create a dataset": "创建数据集",
    "Create and explore dataset": "创建并探索数据集",
    "Create dataset": "创建数据集",
    "An error occurred while overwriting the dataset": "覆盖数据集时发生错误",
    "Are you sure you want to overwrite this dataset?": "确定要覆盖此数据集吗？",
    "Select a database table.": "选择数据库表。",
    "Select a database table and create dataset": "选择数据库表并创建数据集",
    "Database Connections": "数据库连接",
    "Database connected": "数据库已连接",
    "Could not connect to database: \"%(database)s\"": "无法连接到数据库：\"%(database)s\"",
    "Could not load database driver for: %(engine)s": "无法加载数据库驱动：%(engine)s",
    "Copy the name of the database you are trying to connect to.": "复制要连接的数据库名称。",
    "Choose one of the available databases on the left panel.": "从左侧面板选择一个可用数据库。",
    "Allow file uploads to database": "允许上传文件到数据库",
    # Filters, alerts, reports, SQL, and actions.
    "Add filter": "新增筛选条件",
    "Add cross-filter": "新增交叉筛选",
    "Add or edit filters and controls": "添加或编辑筛选器和控件",
    "Click on \"Add or edit filters and controls\" option in Settings to create new dashboard filters": "在设置中点击“添加或编辑筛选器和控件”来创建新的看板筛选器",
    "Always filter main datetime column": "始终筛选主时间列",
    "Applied filters (%d)": "已应用筛选器 (%d)",
    "Applied filters (%s)": "已应用筛选器 (%s)",
    "Applied filters: %s": "已应用筛选器：%s",
    "Applied cross-filters (%d)": "已应用交叉筛选 (%d)",
    "Format SQL": "格式化 SQL",
    "Format SQL query": "格式化 SQL 查询",
    "Invalid SQL: %(error)s": "SQL 无效：%(error)s",
    "No SQL query found": "未找到 SQL 查询",
    "Open SQL Lab in a new tab": "在新标签页打开 SQL Lab",
    "Open in SQL lab": "在 SQL Lab 中打开",
    "Error executing query. ": "执行查询时出错。",
    "An error occurred while formatting SQL": "格式化 SQL 时发生错误",
    "Add alert": "新增告警",
    "Alert": "告警",
    "Alert contents": "告警内容",
    "Alert is active": "告警已启用",
    "An alert named \"%(name)s\" already exists": "名为 \"%(name)s\" 的告警已存在",
    "An error occurred when running alert query": "运行告警查询时发生错误",
    "Add report": "新增报告",
    "Edit report": "编辑报告",
    "Enter report name": "输入报告名称",
    "Manage email report": "管理邮件报告",
    "Schedule a new email report": "计划新的邮件报告",
    "Set up an email report": "设置邮件报告",
    # Explore/chart settings and control labels. These are highly visible in
    # the chart editor and many upstream fuzzy strings are unrelated guesses.
    "FIT DATA": "适配数据",
    "Icon URL": "图标 URL",
    "Icon size": "图标大小",
    "Icon size unit": "图标大小单位",
    "Elevation": "高度",
    "Subtitle": "副标题",
    "Template": "模板",
    "Time Lag": "时间滞后",
    "Time lag": "时间滞后",
    "Time ratio": "时间比率",
    "Time Ratio": "时间比率",
    "Attribution": "归属说明",
    "Current": "当前",
    "Current day": "今天",
    "Current week": "本周",
    "Current month": "本月",
    "Current quarter": "本季度",
    "Current year": "今年",
    "Chart type": "图表类型",
    "Chart Type": "图表类型",
    "Chart size": "图表大小",
    "Save chart": "保存图表",
    "Update chart": "更新图表",
    "Zoom level": "缩放级别",
    "Show X-axis": "显示 X 轴",
    "Show Y-axis": "显示 Y 轴",
    "Label size": "标签大小",
    "Label size unit": "标签大小单位",
    "Label color": "标签颜色",
    "Label Template": "标签模板",
    "Label Contents": "标签内容",
    "Label threshold": "标签阈值",
    "Point Size": "点大小",
    "Point size": "点大小",
    "Point Color": "点颜色",
    "Point Radius": "点半径",
    "Point Radius Unit": "点半径单位",
    "Total color": "总计颜色",
    "Border color": "边框颜色",
    "Border width": "边框宽度",
    "Source Color": "源颜色",
    "Target Color": "目标颜色",
    "Base exponent": "底数指数",
    "Corner Radius": "圆角半径",
    "Outer Radius": "外半径",
    "Inner Radius": "内半径",
    "Actual value": "实际值",
    "Actual Values": "实际值",
    "Actual values": "实际值",
    "Actual range for comparison": "用于比较的实际范围",
    "Enable icons": "启用图标",
    "Split number": "分割段数",
    "Service version": "服务版本",
    "Series settings": "系列设置",
    "General settings": "通用设置",
    "Column Settings": "列设置",
    "Geometry Column": "几何列",
    "Temporal X-Axis": "时间 X 轴",
    "View in SQL Lab": "在 SQL Lab 中查看",
    "Select values": "选择值",
    "Sort Series By": "按系列排序",
    "Sort by data": "按数据排序",
    "Sort rows by": "按行排序",
    "Sort columns by": "按列排序",
    "Linear palette": "线性调色板",
    "Comparison suffix": "比较后缀",
    "Display type icon": "显示类型图标",
    "Visual formatting": "视觉格式",
    "Choose numbers between %(min)s and %(max)s": "请选择 %(min)s 到 %(max)s 之间的数字",
    "Numbers must be within %(min)s and %(max)s": "数字必须在 %(min)s 到 %(max)s 之间",
    "Min value cannot be greater than max value": "最小值不能大于最大值",
    "Min value should be smaller or equal to max value": "最小值应小于或等于最大值",
    "Max value": "最大值",
    "Min value": "最小值",
    "Maximum": "最大值",
    "Minimum": "最小值",
    "Main": "主项",
    "Resize": "调整大小",
    "Points": "点",
    "Simple": "简单",
    "Shape": "形状",
    "Donut": "环形图",
    "beta": "测试版",
    "Area": "面积",
    "Last": "最后",
    "Saved": "已保存",
    "Parent": "父级",
    "Primary Metric": "主指标",
    "Secondary Metric": "次指标",
    "Primary": "主轴",
    "Secondary": "副轴",
    "Chart Source": "图表来源",
    "Chart properties": "图表属性",
    "Chart Options": "图表选项",
    "Chart options": "图表选项",
    "Certification and additional settings": "认证和附加设置",
    "Configuration": "配置",
    "Customize": "自定义",
    "Customize Metrics": "自定义指标",
    "Customize columns": "自定义列",
    "Further customize how to display each metric": "进一步自定义每个指标的显示方式",
    "Further customize how to display each column": "进一步自定义每列的显示方式",
    "Map Options": "地图选项",
    "Color by": "按颜色区分",
    "Color metric": "颜色指标",
    "Color scheme": "配色方案",
    "Color bounds": "颜色范围",
    "Color Steps": "色阶",
    "Color breakpoints": "颜色断点",
    "Fixed color": "固定颜色",
    "Increase color": "增加颜色",
    "Decrease color": "减少颜色",
    "Increase label": "增加标签",
    "Decrease label": "减少标签",
    "Range filter": "范围筛选器",
    "Range labels": "范围标签",
    "Show Range Filter": "显示范围筛选器",
    "Search box": "搜索框",
    "Dynamically search all filter values": "动态搜索所有筛选值",
    "Select first filter value by default": "默认选择第一个筛选值",
    "User must select a value before applying the filter": "用户必须先选择值才能应用筛选器",
    "No filter": "无筛选",
    "begins with": "开头为",
    "ends with": "结尾为",
    "containing": "包含",
    "not containing": "不包含",
    "Select operator": "选择运算符",
    "Select subject": "选择字段",
    "Select column": "选择列",
    "Select filter": "选择筛选器",
    "Select scheme": "选择方案",
    "Select dimension": "选择维度",
    "Select chart type": "选择图表类型",
    "Choose chart type": "选择图表类型",
    "Select chart": "选择图表",
    "Select charts": "选择图表",
    "Add Layer": "新增图层",
    "Hide layer": "隐藏图层",
    "Hide Layer": "隐藏图层",
    "Layer Name": "图层名称",
    "Layer type": "图层类型",
    "Layer title": "图层标题",
    "Insert Layer URL": "插入图层 URL",
    "Annotation layer": "注释层",
    "Annotation layers": "注释层",
    "Annotation source": "注释来源",
    "Annotation layer description columns": "注释层描述列",
    "Choose the source of your annotations": "选择注释来源",
    "Configure the basics of your Annotation Layer.": "配置注释层基础信息。",
    "Configure your how you overlay is displayed here.": "在此配置叠加层的显示方式。",
    "Add an annotation layer": "新增注释层",
    "Event time column": "事件时间列",
    "Time column": "时间列",
    "Time filter": "时间筛选器",
    "Time Format": "时间格式",
    "Date Time Format": "日期时间格式",
    "Date format": "日期格式",
    "Formatted date": "格式化日期",
    "formatted": "已格式化",
    "Time granularity": "时间粒度",
    "Time grain": "时间粒度",
    "Timestamp format": "时间戳格式",
    "Show Timestamp": "显示时间戳",
    "No time columns": "没有时间列",
    "Not Time Series": "非时间序列",
    "Include time": "包含时间",
    "Ignore time": "忽略时间",
    "Shift start date": "移动开始日期",
    "Advanced analytics Query A": "高级分析：查询 A",
    "Advanced analytics Query B": "高级分析：查询 B",
    "Advanced analytics post processing": "高级分析后处理",
    "Time comparison": "时间比较",
    "Time Comparison": "时间比较",
    "Compare results with other time periods.": "与其他时间段的结果进行比较。",
    "Based on granularity, number of time periods to compare against": "根据时间粒度，选择要对比的周期数量",
    "Overlay one or more timeseries from a relative time period. Expects relative time deltas in natural language (example:  24 hours, 7 days, 52 weeks, 365 days). Free text is supported.": "叠加一个或多个相对时间段的时间序列。请输入自然语言形式的相对时间差，例如：24 小时、7 天、52 周、365 天。支持自由输入。",
    "Start (inclusive)": "开始（包含）",
    "End (exclusive)": "结束（不包含）",
    "Start y-axis at 0": "Y 轴从 0 开始",
    "Start y-axis at zero. Uncheck to start y-axis at minimum value in the data.": "Y 轴从 0 开始。取消勾选则从数据最小值开始。",
    "Axis Format": "坐标轴格式",
    "Axis Bounds": "坐标轴范围",
    "Y 2 bounds": "Y2 轴范围",
    "Y Axis 2 Bounds": "Y2 轴范围",
    "X Tick Layout": "X 轴刻度布局",
    "The way the ticks are laid out on the X-axis": "X 轴刻度的布局方式",
    "Reduce X ticks": "减少 X 轴刻度",
    "Truncate X Axis": "截断 X 轴",
    "Truncate Y Axis": "截断 Y 轴",
    "Minor ticks": "次级刻度",
    "Show minor ticks on axes.": "在坐标轴上显示次级刻度。",
    "Whether to show the split lines on the axis": "是否显示坐标轴分割线",
    "Whether to show minor ticks on the axis": "是否在坐标轴上显示次级刻度",
    "Whether to display the type icon (#, Δ, %)": "是否显示类型图标（#、Δ、%）",
    "Whether to display the total value in the tooltip": "是否在提示中显示总计值",
    "Whether to display the numerical values within the cells": "是否在单元格中显示数值",
    "The font size of the point labels": "点标签的字体大小",
    "The background color of the charts.": "图表背景色。",
    "The number of bins for the histogram": "直方图的分箱数量",
    "Whether to show as Nightingale chart.": "是否显示为南丁格尔玫瑰图。",
    "Choose a chart for displaying on the map": "选择要在地图上显示的图表",
    "Chart was saved but could not be added to the selected tab.": "图表已保存，但无法添加到选中的标签页。",
}


EXTERNAL_OVERRIDES_PATH = Path(__file__).with_name("zh_overrides.json")


def load_external_overrides(path: Path = EXTERNAL_OVERRIDES_PATH) -> dict[str, str]:
    if not path.exists():
        return {}

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")

    overrides: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str) or not isinstance(value, str) or not value:
            raise ValueError(f"{path} contains an invalid override for {key!r}")
        overrides[key] = value
    return overrides


OVERRIDES = {
    **KEEP_FUZZY_OVERRIDES,
    **FIXED_OVERRIDES,
    **load_external_overrides(),
}


TERM_REPLACEMENTS = {
    "过滤": "筛选",
    "仪表板": "看板",
}

FUZZY_POLICY = "blank"


def normalize_terms(value: str | tuple[str, ...]) -> str | tuple[str, ...]:
    def normalize_one(text: str) -> str:
        for old, new in TERM_REPLACEMENTS.items():
            text = text.replace(old, new)
        return text

    if isinstance(value, tuple):
        return tuple(normalize_one(part) for part in value)
    return normalize_one(value)


def message_string(message_id: str | tuple[str, ...], value: str | tuple[str, ...]) -> str | tuple[str, ...]:
    if isinstance(message_id, tuple) and isinstance(value, str):
        return tuple(value for _ in message_id)
    return value


def translated_value(message_id: str | tuple[str, ...], string: str | tuple[str, ...]) -> str | tuple[str, ...]:
    key = message_id[0] if isinstance(message_id, tuple) else message_id
    if key in OVERRIDES:
        return message_string(message_id, OVERRIDES[key])
    return normalize_terms(string)


def build_catalog(source: Catalog) -> tuple[Catalog, dict[str, int]]:
    output = Catalog(
        locale=source.locale,
        domain=source.domain,
        header_comment=source.header_comment,
        project=source.project,
        version=source.version,
        copyright_holder=source.copyright_holder,
        msgid_bugs_address=source.msgid_bugs_address,
        creation_date=source.creation_date,
        revision_date=source.revision_date,
        last_translator=source.last_translator,
        language_team=source.language_team,
        charset=source.charset,
        fuzzy=False,
    )
    output.mime_headers = list(source.mime_headers)

    stats = {
        "total": 0,
        "non_fuzzy_kept": 0,
        "fuzzy_blank": 0,
        "fuzzy_kept": 0,
        "override_applied": 0,
        "empty": 0,
    }

    for message in source:
        if not message.id:
            continue

        stats["total"] += 1
        key = message.id[0] if isinstance(message.id, tuple) else message.id
        is_fuzzy = "fuzzy" in message.flags
        has_override = key in OVERRIDES

        if has_override:
            string = message_string(message.id, normalize_terms(OVERRIDES[key]))
            stats["override_applied"] += 1
        elif is_fuzzy and FUZZY_POLICY == "blank":
            string = tuple("" for _ in message.id) if isinstance(message.id, tuple) else ""
            stats["fuzzy_blank"] += 1
        elif is_fuzzy:
            string = normalize_terms(message.string or "")
            if string:
                stats["fuzzy_kept"] += 1
            else:
                stats["empty"] += 1
        else:
            string = translated_value(message.id, message.string or "")
            if string:
                stats["non_fuzzy_kept"] += 1
            else:
                stats["empty"] += 1

        output.add(
            message.id,
            string,
            locations=message.locations,
            auto_comments=message.auto_comments,
            user_comments=message.user_comments,
            previous_id=message.previous_id,
            lineno=message.lineno,
            context=message.context,
        )

    return output, stats


def catalog_to_json(catalog: Catalog) -> dict[str, object]:
    plural_forms = catalog.plural_forms or "nplurals=1; plural=0;"
    if not plural_forms.endswith(";"):
        plural_forms = f"{plural_forms};"

    messages: dict[str, object] = {
        "": {
            "domain": "superset",
            "plural_forms": plural_forms,
            "lang": str(catalog.locale or "zh"),
        }
    }

    for message in catalog:
        if not message.id:
            continue
        key = message.id[0] if isinstance(message.id, tuple) else message.id
        string = message.string
        if isinstance(string, tuple):
            messages[key] = list(string)
        else:
            messages[key] = [string or ""]

    return {"domain": "superset", "locale_data": {"superset": messages}}


def validate(json_path: Path, mo_path: Path, expected_count: int) -> dict[str, object]:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    entries = data["locale_data"]["superset"]

    with mo_path.open("rb") as handle:
        mo_catalog = read_mo(handle)
    mo_count = sum(1 for message in mo_catalog if message.id)

    serialized = json.dumps(data, ensure_ascii=False)
    forbidden_terms = [term for term in TERM_REPLACEMENTS if term in serialized]
    double_terms = [term for term in ("筛选器器", "图表表") if term in serialized]

    samples = {
        "Theme": entries.get("Theme"),
        "Users": entries.get("Users"),
        "List Users": entries.get("List Users"),
        "List Groups": entries.get("List Groups"),
        "List Roles": entries.get("List Roles"),
        "Select a database": entries.get("Select a database"),
        "Client Secret": entries.get("Client Secret"),
        "Enter the user's first name": entries.get("Enter the user's first name"),
        "CSV file downloaded successfully": entries.get("CSV file downloaded successfully"),
        "Big Number": entries.get("Big Number"),
    }

    return {
        "json_entries": len(entries) - 1,
        "mo_entries": mo_count,
        "expected_entries": expected_count,
        "forbidden_terms": forbidden_terms,
        "double_terms": double_terms,
        "samples": samples,
    }


def main() -> None:
    global FUZZY_POLICY

    parser = argparse.ArgumentParser()
    parser.add_argument("--po", required=True, type=Path)
    parser.add_argument("--po-out", type=Path)
    parser.add_argument("--json", required=True, type=Path)
    parser.add_argument("--mo", required=True, type=Path)
    parser.add_argument("--fuzzy-policy", choices=("blank", "keep"), default="blank")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    FUZZY_POLICY = args.fuzzy_policy

    with args.po.open("rb") as handle:
        source = read_po(handle)

    rebuilt, stats = build_catalog(source)
    json_data = catalog_to_json(rebuilt)

    if not args.dry_run:
        if args.po_out:
            with args.po_out.open("wb") as handle:
                write_po(handle, rebuilt, sort_output=False)
        args.json.write_text(
            json.dumps(json_data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        with args.mo.open("wb") as handle:
            write_mo(handle, rebuilt)
        validation = validate(args.json, args.mo, stats["total"])
    else:
        validation = {"dry_run": True}

    print(json.dumps({"stats": stats, "validation": validation}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
