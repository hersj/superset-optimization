from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from build_zh import translated_value


def test_settings_menu_user_entries_have_explicit_overrides() -> None:
    assert translated_value("Theme", "") == "主题"
    assert translated_value("Themes", "") == "主题"
    assert translated_value("Users", "") == "用户"
    assert translated_value("List Users", "") == "用户列表"
    assert translated_value("List Groups", "") == "用户组列表"
    assert translated_value("List Roles", "") == "角色列表"
    assert translated_value("Cell layout & styling", "") == "单元格布局和样式"
    assert translated_value("Column Configuration", "") == "列配置"
    assert translated_value("Currency format", "") == "货币格式"
    assert translated_value("Dimensions", "") == "维度"
    assert translated_value("Enable Matrixify", "") == "启用矩阵化"
    assert translated_value("Sparkline", "") == "迷你趋势图"
    assert translated_value("Y-axis bounds", "") == "Y 轴范围"
    assert translated_value("Auto-detect", "") == "自动检测"
    assert translated_value("Click to add new layer", "") == "点击添加新图层"
    assert translated_value("Dimension", "") == "维度"
    assert translated_value("Dimension values", "") == "维度值"
    assert translated_value("Invalid color", "") == "无效颜色"
    assert translated_value("Matrixify", "") == "矩阵化"
    assert translated_value("No results", "") == "无结果"
    assert translated_value("Percentage change", "") == "百分比变化"
    assert translated_value("Select a dimension", "") == "选择维度"
    assert translated_value("Show cell bars", "") == "显示单元格条形图"
    assert translated_value("Swap dataset", "") == "切换数据集"
    assert translated_value("Tooltip contents", "") == "提示内容"
    assert translated_value("Chart properties updated", "") == "图表属性已更新"
    assert translated_value("Current Zoom", "") == "当前缩放"
    assert translated_value("Drag to reorder", "") == "拖动以重新排序"
    assert translated_value("Formatting column", "") == "格式化列"
    assert translated_value("Formatting object", "") == "格式化对象"
    assert translated_value("Select column name", "") == "选择列名"
    assert translated_value("Select object name", "") == "选择对象名称"
    assert translated_value("Dataset imported", "") == "数据集已导入"
    assert translated_value("Duplicate", "") == "复制"
    assert translated_value("Cache timeout must be a number", "") == "缓存超时时间必须是数字"
    assert translated_value("Chart name is required", "") == "图表名称为必填项"
    assert translated_value(
        "Configure caching and performance settings",
        "",
    ) == "配置缓存和性能设置"
    assert translated_value("Copy permalink to clipboard", "") == "复制永久链接到剪贴板"
    assert translated_value("Export screenshot (jpeg)", "") == "导出截图（JPEG）"
    assert translated_value("Export to .CSV", "") == "导出为 .CSV"
    assert translated_value("Export to .JSON", "") == "导出为 .JSON"
    assert translated_value("Export to Excel", "") == "导出为 Excel"
    assert translated_value("Export to Pivoted Excel", "") == "导出为数据透视 Excel"
    assert translated_value(
        "Falling back to CSV; Excel export library not available.",
        "",
    ) == "Excel 导出库不可用，已回退为 CSV。"
    assert translated_value(
        "This chart is managed externally, and can't be edited in Superset",
        "",
    ) == "此图表由外部管理，无法在 Superset 中编辑"
    assert translated_value("No samples were returned for this dataset", "") == "此数据集未返回示例数据"
    assert translated_value("Not added to any dashboard", "") == "未添加到任何看板"
    assert translated_value("Not available", "") == "不可用"
    assert translated_value("Save changes to your chart?", "") == "保存对图表的更改？"
    assert translated_value("Your chart is not up to date", "") == "你的图表不是最新的"
    assert translated_value("There was an issue duplicating the dataset.", "") == "复制数据集时出现问题"
    assert translated_value(
        "There was an issue duplicating the selected datasets: %s",
        "",
    ) == "复制所选数据集时出现问题：%s"
    assert translated_value(
        "There was an issue exporting the selected datasets",
        "",
    ) == "导出所选数据集时出现问题"
    assert translated_value("Virtual", "") == "虚拟"
    assert translated_value(
        "A list of tags that have been applied to this chart.",
        "",
    ) == "已应用到此图表的标签列表。"
    assert translated_value(
        "Duration (in seconds) of the caching timeout for this chart. Set to -1 to bypass the cache. Note this defaults to the dataset's timeout if undefined.",
        "",
    ) == "此图表缓存超时的持续时间（秒）。设置为 -1 可绕过缓存。请注意，如未定义，则默认使用数据集的超时设置。"
    assert translated_value("Dataset Name", "") == "数据集名称"
    assert translated_value("Chart title", "") == "图表标题"
    assert translated_value("Chart width", "") == "图表宽度"
    assert translated_value("Chart height", "") == "图表高度"


def test_cli_can_write_corrected_po_output(tmp_path: Path) -> None:
    po_path = tmp_path / "messages.po"
    json_path = tmp_path / "messages.json"
    mo_path = tmp_path / "messages.mo"

    po_path.write_text(
        """
msgid ""
msgstr ""
"Project-Id-Version: superset\\n"
"Language: zh\\n"
"Plural-Forms: nplurals=1; plural=0;\\n"

msgid "List Users"
msgstr "数字"

msgid "List Groups"
msgstr "数字"

msgid "List Roles"
msgstr ""

msgid "Theme"
msgstr "时间"

msgid "Themes"
msgstr "时间"

msgid "Users"
msgstr "序列"

msgid "Cell layout & styling"
msgstr ""

msgid "Column Configuration"
msgstr ""

msgid "Currency format"
msgstr ""

msgid "Dimensions"
msgstr ""

msgid "Enable Matrixify"
msgstr ""

msgid "Sparkline"
msgstr ""

msgid "Y-axis bounds"
msgstr ""

msgid "Auto-detect"
msgstr ""

msgid "Click to add new layer"
msgstr ""

msgid "Dimension"
msgstr ""

msgid "Dimension values"
msgstr ""

msgid "Invalid color"
msgstr ""

msgid "Matrixify"
msgstr ""

msgid "No results"
msgstr ""

msgid "Percentage change"
msgstr ""

msgid "Select a dimension"
msgstr ""

msgid "Show cell bars"
msgstr ""

msgid "Swap dataset"
msgstr ""

msgid "Tooltip contents"
msgstr ""

msgid "Chart properties updated"
msgstr ""

msgid "Current Zoom"
msgstr ""

msgid "Drag to reorder"
msgstr ""

msgid "Dataset imported"
msgstr ""

msgid "Duplicate"
msgstr ""

msgid "Export to Excel"
msgstr ""

msgid "Save changes to your chart?"
msgstr ""

msgid "Virtual"
msgstr ""
""".strip()
        + "\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).resolve().parents[1] / "build_zh.py"),
            "--po",
            str(po_path),
            "--po-out",
            str(po_path),
            "--json",
            str(json_path),
            "--mo",
            str(mo_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout

    rebuilt_po = po_path.read_text(encoding="utf-8")
    assert 'msgid "Theme"\nmsgstr "主题"' in rebuilt_po
    assert 'msgid "Themes"\nmsgstr "主题"' in rebuilt_po
    assert 'msgid "Users"\nmsgstr "用户"' in rebuilt_po
    assert 'msgid "Cell layout & styling"\nmsgstr "单元格布局和样式"' in rebuilt_po
    assert 'msgid "Column Configuration"\nmsgstr "列配置"' in rebuilt_po
    assert 'msgid "Currency format"\nmsgstr "货币格式"' in rebuilt_po
    assert 'msgid "Dimensions"\nmsgstr "维度"' in rebuilt_po
    assert 'msgid "Enable Matrixify"\nmsgstr "启用矩阵化"' in rebuilt_po
    assert 'msgid "Sparkline"\nmsgstr "迷你趋势图"' in rebuilt_po
    assert 'msgid "Y-axis bounds"\nmsgstr "Y 轴范围"' in rebuilt_po
    assert 'msgid "Auto-detect"\nmsgstr "自动检测"' in rebuilt_po
    assert 'msgid "Click to add new layer"\nmsgstr "点击添加新图层"' in rebuilt_po
    assert 'msgid "Dimension"\nmsgstr "维度"' in rebuilt_po
    assert 'msgid "Dimension values"\nmsgstr "维度值"' in rebuilt_po
    assert 'msgid "Invalid color"\nmsgstr "无效颜色"' in rebuilt_po
    assert 'msgid "Matrixify"\nmsgstr "矩阵化"' in rebuilt_po
    assert 'msgid "No results"\nmsgstr "无结果"' in rebuilt_po
    assert 'msgid "Percentage change"\nmsgstr "百分比变化"' in rebuilt_po
    assert 'msgid "Select a dimension"\nmsgstr "选择维度"' in rebuilt_po
    assert 'msgid "Show cell bars"\nmsgstr "显示单元格条形图"' in rebuilt_po
    assert 'msgid "Swap dataset"\nmsgstr "切换数据集"' in rebuilt_po
    assert 'msgid "Tooltip contents"\nmsgstr "提示内容"' in rebuilt_po
    assert 'msgid "Chart properties updated"\nmsgstr "图表属性已更新"' in rebuilt_po
    assert 'msgid "Current Zoom"\nmsgstr "当前缩放"' in rebuilt_po
    assert 'msgid "Drag to reorder"\nmsgstr "拖动以重新排序"' in rebuilt_po
    assert 'msgid "Dataset imported"\nmsgstr "数据集已导入"' in rebuilt_po
    assert 'msgid "Duplicate"\nmsgstr "复制"' in rebuilt_po
    assert 'msgid "Export to Excel"\nmsgstr "导出为 Excel"' in rebuilt_po
    assert 'msgid "Save changes to your chart?"\nmsgstr "保存对图表的更改？"' in rebuilt_po
    assert 'msgid "Virtual"\nmsgstr "虚拟"' in rebuilt_po
    assert 'msgid "List Users"\nmsgstr "用户列表"' in rebuilt_po
    assert 'msgid "List Groups"\nmsgstr "用户组列表"' in rebuilt_po
    assert 'msgid "List Roles"\nmsgstr "角色列表"' in rebuilt_po


def test_cli_injects_override_only_keys_missing_from_source_po(tmp_path: Path) -> None:
    po_path = tmp_path / "messages.po"
    json_path = tmp_path / "messages.json"
    mo_path = tmp_path / "messages.mo"

    po_path.write_text(
        """
msgid ""
msgstr ""
"Project-Id-Version: superset\\n"
"Language: zh\\n"
"Plural-Forms: nplurals=1; plural=0;\\n"

msgid "Theme"
msgstr "时间"
""".strip()
        + "\n",
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            str(Path(__file__).resolve().parents[1] / "build_zh.py"),
            "--po",
            str(po_path),
            "--po-out",
            str(po_path),
            "--json",
            str(json_path),
            "--mo",
            str(mo_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout

    rebuilt_po = po_path.read_text(encoding="utf-8")
    rebuilt_json = json_path.read_text(encoding="utf-8")

    assert 'msgid "Current Zoom"\nmsgstr "当前缩放"' in rebuilt_po
    assert 'msgid "Drag to reorder"\nmsgstr "拖动以重新排序"' in rebuilt_po
    assert 'msgid "Formatting column"\nmsgstr "格式化列"' in rebuilt_po
    assert 'msgid "Select column name"\nmsgstr "选择列名"' in rebuilt_po
    assert '"Current Zoom"' in rebuilt_json
    assert '"Drag to reorder"' in rebuilt_json
    assert '"Formatting column"' in rebuilt_json
    assert '"Select column name"' in rebuilt_json
