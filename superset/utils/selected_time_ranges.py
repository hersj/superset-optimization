# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements. See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership. The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License. You may obtain a copy of the License at
# http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied. See the License for the
# specific language governing permissions and limitations
# under the License.

"""点选日期区间的边界契约；不依赖应用启动、用户身份或数据库连接。"""

from datetime import datetime, timedelta
from typing import Any

PREVIOUS_SELECTED_PERIOD = "上一选中区间"


def parse_selected_time_ranges(value: Any) -> list[tuple[datetime, datetime]]:
    """功能审计（可重写规格）：点选时间区间校验。
    - 目的与触发：图表及级联查询编译前校验点选范围，禁止包络/全历史降级。
    - 输入：至多10000个YYYY-MM-DD : YYYY-MM-DD字符串，左闭右开；不解释相对时间。
    - 输出：按起点排序去重并合并重叠的区间；空列表保留为空，调用方必须生成恒假谓词或阻断请求。
    - 流程与规则：检查类型、严格日期格式、正长度，再排序去重；不合并间隔或相邻单位。
    - 副作用与依赖：仅stdlib日期计算，不写状态、缓存、SQL或网络。
    - 异常与约束：非法值抛ValueError，不能丢弃坏项后用其余项查询；时间无隐式时区转换。
    - 验证：test_selected_time_ranges覆盖跨年、排序、重复、空值和非法输入。
    """
    if not isinstance(value, list) or len(value) > 10000:
        raise ValueError(
            "Selected time ranges must be an array of at most 10000 ranges"
        )
    ranges = set()
    for item in value:
        if not isinstance(item, str):
            raise ValueError("Every selected time range must be a string")
        parts = [part.strip() for part in item.split(":")]
        if len(parts) != 2:
            raise ValueError("Selected time range requires two ISO dates")
        try:
            start, end = (datetime.strptime(part, "%Y-%m-%d") for part in parts)
        except ValueError as ex:
            raise ValueError("Selected time range contains an invalid ISO date") from ex
        if [
            start.strftime("%Y-%m-%d"),
            end.strftime("%Y-%m-%d"),
        ] != parts or start >= end:
            raise ValueError("Selected time range must have valid ordered ISO dates")
        ranges.add((start, end))
    # 合并重叠避免反复枚举相同日期；相邻周期仍由粒度生成，不填充空档。
    result: list[tuple[datetime, datetime]] = []
    for start, end in sorted(ranges):
        if result and start < result[-1][1]:
            result[-1] = (result[-1][0], max(result[-1][1], end))
        else:
            result.append((start, end))
    return result


def selected_period_starts(
    ranges: list[tuple[datetime, datetime]], grain: str
) -> list[datetime]:
    """按既有日/周/月/季/年/财年分组生成选中周期；缺数据也不能跳过该周期。"""
    starts: set[datetime] = set()
    months = {"P1M": 1, "P3M": 3, "P3M_FISCAL": 3, "P1Y": 12, "P1Y_FISCAL": 12}.get(
        grain
    )
    days = 7 if grain in {"P1W", "P1W_SUN"} else 1
    for start, end in ranges:
        cursor = start.replace(hour=0, minute=0, second=0, microsecond=0)
        if grain in {"P1W", "P1W_SUN"}:
            cursor -= timedelta(days=(cursor.weekday() + (grain == "P1W_SUN")) % 7)
        elif months:
            if grain == "P1Y_FISCAL":
                cursor = cursor.replace(
                    year=cursor.year - (cursor.month < 4), month=4, day=1
                )
            else:
                cursor = cursor.replace(
                    month=(cursor.month - 1) // months * months + 1, day=1
                )
        elif grain != "P1D":
            raise ValueError("Unsupported selected-period comparison grain")
        while cursor < end:
            starts.add(cursor)
            if len(starts) > 10000:
                raise ValueError("Selected-period comparison exceeds 10000 periods")
            if months:
                month_index = cursor.year * 12 + cursor.month - 1 + months
                cursor = cursor.replace(
                    year=month_index // 12, month=month_index % 12 + 1
                )
            else:
                cursor += timedelta(days=days)
    return sorted(starts)
