import unittest
from pathlib import Path

from babel.messages.pofile import read_po

from build_zh import build_catalog, catalog_to_json


class ZhCatalogQualityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        po_path = Path("superset/translations/zh/LC_MESSAGES/messages.po")
        with po_path.open("rb") as handle:
            source = read_po(handle)
        catalog, _ = build_catalog(source)
        cls.entries = catalog_to_json(catalog)["locale_data"]["superset"]

    def test_no_empty_translations_are_served(self):
        empty = [
            key
            for key, value in self.entries.items()
            if key and any(text == "" for text in value)
        ]
        self.assertEqual([], empty[:30], f"{len(empty)} empty translations remain")

    def test_known_machine_translations_are_not_served(self):
        serialized = "\n".join(
            text for key, value in self.entries.items() if key for text in value
        )
        for term in [
            "甲板",
            "车把",
            "红衣主教",
            "公制类型",
            "阿斯频率",
            "汽车",
            "螺栓",
            "价值观",
            "远期价值",
            "显示价值",
            "总价值",
            "价值聚合",
            "价值和百分比",
            "价值差异",
            "旋转时间",
            "自由文本",
            "SQL工具箱",
            "筛选选择",
        ]:
            self.assertNotIn(term, serialized)

    def test_advanced_analytics_time_shift_copy_is_translated(self):
        expected = {
            "Time shift": "时间偏移",
            "Compare results with other time periods.": "与其他时间段的结果进行比较。",
            "Overlay one or more timeseries from a relative time period. Expects relative time deltas in natural language (example: 24 hours, 7 days, 52 weeks, 365 days). Free text is supported.": "叠加一个或多个相对时间段的时间序列。请输入自然语言形式的相对时间差，例如：24 小时、7 天、52 周、365 天。支持自由输入。",
            "Overlay results from a relative time period. Expects relative time deltas in natural language (example:  24 hours, 7 days, 52 weeks, 365 days). Free text is supported. Use \"Inherit range from time filters\" to shift the comparison time range by the same length as your time range and use \"Custom\" to set a custom comparison range.": "叠加相对时间段的结果。请输入自然语言形式的相对时间差，例如：24 小时、7 天、52 周、365 天。支持自由输入。使用“从时间筛选器继承范围”可按当前时间范围的相同长度平移对比时间范围；使用“自定义”可设置自定义对比范围。",
        }
        for key, translation in expected.items():
            self.assertEqual([translation], self.entries.get(key), key)

    def test_known_machine_translation_keys_have_precise_copy(self):
        expected = {
            "deck.gl Contour": "deck.gl 等高线",
            "deck.gl Geojson": "deck.gl GeoJSON",
            "Handlebars Template": "Handlebars 模板",
            "Write a handlebars template to render the data": "编写用于渲染数据的 Handlebars 模板",
            "cardinal": "深红色",
            "mean": "平均值",
            "metric type icon": "指标类型图标",
            "auto": "自动",
            "bolt": "闪电",
        }
        for key, translation in expected.items():
            self.assertEqual([translation], self.entries.get(key), key)


if __name__ == "__main__":
    unittest.main()
