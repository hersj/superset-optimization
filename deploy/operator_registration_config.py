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
import runpy
import sys

# 原配置路径保留在各服务既有 docker 挂载内，不替换原文件。
_previous = runpy.run_path("/app/docker/pythonpath_dev/superset_config.py")
globals().update({key: value for key, value in _previous.items() if key.isupper()})
sys.path.insert(0, "/app/operator-registration")
from operator_registration import install  # noqa: E402

SELLERFOX_OPERATOR_DATABASE = "sellerfox_sync"
SELLERFOX_OPERATOR_ROLES = ("用户运营", "LT试点-直杆LED1-EU")
_previous_mutator = globals().get("FLASK_APP_MUTATOR")


def FLASK_APP_MUTATOR(app):  # noqa: N802 -- Superset 固定配置接口名称。
    """复用原配置的扩展钩子，新增提交后运营登记。"""
    if _previous_mutator:
        _previous_mutator(app)
    install(app)


# 复用已配置的 Celery broker/worker/beat，不新增服务。
CELERY_CONFIG.beat_schedule["sellerfox-operator-registration"] = {  # noqa: F821
    "task": "sellerfox.register_operators",
    "schedule": 300.0,
}
