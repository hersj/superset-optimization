from datetime import datetime

import pandas as pd
import pytest

from superset.common.query_object import QueryObject
from superset.exceptions import QueryObjectValidationError
from superset.models.helpers import ExploreMixin
from superset.utils.core import _update_existing_temporal_filter, TIME_COMPARISON
from superset.utils.selected_time_ranges import (
    parse_selected_time_ranges,
    PREVIOUS_SELECTED_PERIOD,
    selected_period_starts,
)

RANGES = [
    "2025-04-27 : 2025-05-04",
    "2026-07-05 : 2026-07-12",
    "2026-08-02 : 2026-08-09",
]


@pytest.mark.parametrize(
    "value",
    [
        None,
        {},
        [None],
        ["No filter"],
        ["2026-02-30 : 2026-03-01"],
        ["2026-3-1 : 2026-03-02"],
        ["2026-03-02 : 2026-03-01"],
    ],
)
def test_invalid_ranges_fail_closed(value):
    with pytest.raises(ValueError):
        parse_selected_time_ranges(value)


def test_order_and_missing_periods_are_from_selection_not_rows():
    parsed = parse_selected_time_ranges([RANGES[2], RANGES[0], RANGES[1], RANGES[0]])
    assert selected_period_starts(parsed, "P1W_SUN") == [
        datetime(2025, 4, 27),
        datetime(2026, 7, 5),
        datetime(2026, 8, 2),
    ]
    assert parse_selected_time_ranges([]) == []
    assert parse_selected_time_ranges(
        ["2026-01-01 : 2026-01-10", "2026-01-05 : 2026-01-12"]
    ) == [(datetime(2026, 1, 1), datetime(2026, 1, 12))]


@pytest.mark.parametrize(
    "grain,expected",
    [
        ("P1D", datetime(2026, 2, 10)),
        ("P1W", datetime(2026, 2, 9)),
        ("P1W_SUN", datetime(2026, 2, 8)),
        ("P1M", datetime(2026, 2, 1)),
        ("P3M", datetime(2026, 1, 1)),
        ("P1Y", datetime(2026, 1, 1)),
        ("P1Y_FISCAL", datetime(2025, 4, 1)),
    ],
)
def test_grain_floor(grain, expected):
    assert selected_period_starts(
        parse_selected_time_ranges(["2026-02-10 : 2026-02-11"]), grain
    ) == [expected]


def test_comparison_preserves_series_and_does_not_skip_missing_predecessor():
    query = QueryObject(
        columns=[
            {
                "sqlExpression": "date",
                "label": "date",
                "expressionType": "SQL",
                "columnType": "BASE_AXIS",
                "timeGrain": "P1W_SUN",
            },
            "shop",
        ],
        metrics=["profit"],
        filters=[{"col": "date", "op": "TEMPORAL_RANGE", "val": RANGES}],
        time_offsets=[PREVIOUS_SELECTED_PERIOD],
        row_limit=100,
    )
    df = pd.DataFrame(
        {
            "date": pd.to_datetime(
                ["2026-08-02", "2025-04-27", "2026-07-05", "2025-04-27", "2026-08-02"]
            ),
            "shop": ["A", "A", "A", "B", "B"],
            "profit": [30, 10, 20, 100, 300],
        }
    )
    actual = ExploreMixin._compare_selected_periods(
        df, query, ["profit"], ["date", "shop"]
    )
    previous = actual[TIME_COMPARISON.join(["profit", PREVIOUS_SELECTED_PERIOD])]
    assert previous.iloc[0] == 20
    assert previous.iloc[2] == 10
    assert (
        pd.isna(previous.iloc[1])
        and pd.isna(previous.iloc[3])
        and pd.isna(previous.iloc[4])
    )
    query.row_limit = 5
    with pytest.raises(QueryObjectValidationError, match="untruncated"):
        ExploreMixin._compare_selected_periods(df, query, ["profit"], ["date", "shop"])


def test_global_envelope_cannot_overwrite_point_filter():
    flt = {"expressionType": "SIMPLE", "subject": "date", "comparator": RANGES}
    _update_existing_temporal_filter(
        flt, "wrong_date", "2025-04-27 : 2026-08-09", False
    )
    assert flt["subject"] == "date" and flt["comparator"] == RANGES
