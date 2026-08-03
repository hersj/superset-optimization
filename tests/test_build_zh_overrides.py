import unittest

from build_zh import OVERRIDES


class BuildZhOverrideTest(unittest.TestCase):
    def test_chart_axis_minor_ticks_use_axis_term(self):
        self.assertEqual(OVERRIDES["Minor ticks"], "次级刻度")
        self.assertEqual(OVERRIDES["Show minor ticks on axes."], "在坐标轴上显示次级刻度。")
        self.assertEqual(
            OVERRIDES["Whether to show minor ticks on the axis"],
            "是否在坐标轴上显示次级刻度",
        )

    def test_mixed_timeseries_advanced_analytics_sections_are_translated(self):
        self.assertEqual(OVERRIDES["Advanced analytics Query A"], "高级分析：查询 A")
        self.assertEqual(OVERRIDES["Advanced analytics Query B"], "高级分析：查询 B")
        self.assertEqual(OVERRIDES["Advanced analytics post processing"], "高级分析后处理")

    def test_advanced_analytics_time_shift_help_is_translated(self):
        self.assertEqual(
            OVERRIDES[
            "Overlay one or more timeseries from a relative time period. "
            "Expects relative time deltas in natural language "
            "(example:  24 hours, 7 days, 52 weeks, 365 days). "
            "Free text is supported."
            ],
            "叠加一个或多个相对时间段的时间序列。请输入自然语言形式的相对时间差，例如：24 小时、7 天、52 周、365 天。支持自由输入。",
        )
        self.assertEqual(
            OVERRIDES["Compare results with other time periods."],
            "与其他时间段的结果进行比较。",
        )

    def test_dashboard_chart_controls_are_translated(self):
        self.assertEqual(OVERRIDES["Time comparison"], "和过去对比")
        self.assertEqual(OVERRIDES["Show Values"], "数字显示")


if __name__ == "__main__":
    unittest.main()
