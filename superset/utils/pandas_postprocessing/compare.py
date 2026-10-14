# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
import re
from typing import Optional

import pandas as pd
from flask_babel import gettext as _
from pandas import DataFrame

from superset.constants import PandasPostprocessingCompare
from superset.exceptions import InvalidPostProcessingError
from superset.utils.core import TIME_COMPARISON
from superset.utils.pandas_postprocessing.utils import validate_column_args
from superset.utils.selected_time_ranges import PREVIOUS_SELECTED_PERIOD


@validate_column_args("source_columns", "compare_columns")
def compare(  # pylint: disable=too-many-arguments
    df: DataFrame,
    source_columns: list[str],
    compare_columns: list[str],
    compare_type: PandasPostprocessingCompare,
    drop_original_columns: Optional[bool] = False,
    precision: Optional[int] = 4,
) -> DataFrame:
    """
    Calculate column-by-column changing for select columns.

    :param df: DataFrame on which the compare will be based.
    :param source_columns: Main query columns
    :param compare_columns: Columns being compared
    :param compare_type: Type of compare. Choice of `absolute`, `percentage` or `ratio`
    :param drop_original_columns: Whether to remove the source columns and
           compare columns.
    :param precision: Round a change rate to a variable number of decimal places.
    :return: DataFrame with compared columns.
    :raises InvalidPostProcessingError: If the request in incorrect.

    Explicit date-range comparisons preserve missing values, use an absolute
    baseline for percentage change, and leave relative-offset behavior unchanged.
    """
    if len(source_columns) != len(compare_columns):
        raise InvalidPostProcessingError(
            _("`compare_columns` must have the same length as `source_columns`.")
        )
    if compare_type not in tuple(PandasPostprocessingCompare):
        raise InvalidPostProcessingError(
            _("`compare_type` must be `difference`, `percentage` or `ratio`")
        )
    if len(source_columns) == 0:
        return df

    for s_col, c_col in zip(source_columns, compare_columns, strict=False):
        s_df = df.loc[:, [s_col]]
        s_df.rename(columns={s_col: "__intermediate"}, inplace=True)
        c_df = df.loc[:, [c_col]]
        c_df.rename(columns={c_col: "__intermediate"}, inplace=True)
        is_date_range = bool(
            re.search(r"__\d{4}-\d{2}-\d{2}\s*:\s*\d{4}-\d{2}-\d{2}$", str(c_col))
        )
        if (
            PREVIOUS_SELECTED_PERIOD in str(c_col) or is_date_range
        ) and compare_type != PandasPostprocessingCompare.DIFF:
            c_df = c_df.mask(c_df == 0)
        if compare_type == PandasPostprocessingCompare.DIFF:
            diff_df = s_df - c_df
        elif compare_type == PandasPostprocessingCompare.PCT:
            denominator = c_df.abs() if is_date_range else c_df
            diff_df = ((s_df - c_df) / denominator).astype(float).round(precision)
        else:
            # compare_type == "ratio"
            diff_df = (s_df / c_df).astype(float).round(precision)

        diff_df.rename(
            columns={
                "__intermediate": TIME_COMPARISON.join([compare_type, s_col, c_col])
            },
            inplace=True,
        )
        df = pd.concat([df, diff_df], axis=1)

    if drop_original_columns:
        level = (
            0
            if isinstance(df.columns, pd.MultiIndex) and df.columns.nlevels > 1
            else None
        )
        df = df.drop(source_columns + compare_columns, axis=1, level=level)
    return df
