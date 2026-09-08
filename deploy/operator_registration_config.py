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
"""加载现有生产配置，再安装运营登记；不复制或持久化现有凭据。"""

import os
import runpy
import sys
import time
from pathlib import Path
from typing import Any

from flask import Flask

# 原配置路径保留在各服务既有 docker 挂载内，不替换原文件。
_original_path = Path(os.environ["SELLERFOX_ORIGINAL_CONFIG_PATH"]).resolve()
if _original_path == Path(__file__).resolve() or not _original_path.is_file():
    raise ValueError("Invalid original Superset configuration path")
_previous = runpy.run_path(str(_original_path))
globals().update({key: value for key, value in _previous.items() if key.isupper()})
sys.path.insert(0, "/app/operator-registration")
from operator_registration import install  # noqa: E402

SELLERFOX_OPERATOR_DATABASE = "sellerfox_sync"
SELLERFOX_OPERATOR_ROLES = (
    "用户运营",
    "LT试点-直杆LED1-EU",
    "运营试点-整店",
    "运营试点-ASIN",
    "运营试点-商品SKU",
)
_previous_mutator = globals().get("FLASK_APP_MUTATOR")


def FLASK_APP_MUTATOR(app: Flask) -> None:  # noqa: N802
    """复用原配置的扩展钩子，新增提交后运营登记。"""
    if _previous_mutator:
        _previous_mutator(app)
    install(app)


# 复用已配置的 Celery broker/worker/beat，不新增服务。
CELERY_CONFIG: Any = _previous["CELERY_CONFIG"]
CELERY_CONFIG.beat_schedule["sellerfox-operator-registration"] = {
    "task": "sellerfox.register_operators",
    "schedule": 300.0,
}


def operator_scope_epoch() -> int:
    """试点 RLS 缓存最多沿用五分钟，避免日同步后持续返回旧归属结果。"""
    return int(time.time() // 300)


JINJA_CONTEXT_ADDONS = dict(_previous.get("JINJA_CONTEXT_ADDONS", {}))
JINJA_CONTEXT_ADDONS["operator_scope_epoch"] = operator_scope_epoch
