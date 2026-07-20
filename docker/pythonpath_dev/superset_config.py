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
#
# This file is included in the final Docker image and SHOULD be overridden when
# deploying the image to prod. Settings configured here are intended for use in local
# development environments. Also note that superset_config_docker.py is imported
# as a final step as a means to override "defaults" configured here
#
import logging
import os
import sys

from celery.schedules import crontab
from flask_caching.backends.filesystemcache import FileSystemCache

logger = logging.getLogger()

DATABASE_DIALECT = os.getenv("DATABASE_DIALECT")
DATABASE_USER = os.getenv("DATABASE_USER")
DATABASE_PASSWORD = os.getenv("DATABASE_PASSWORD")
DATABASE_HOST = os.getenv("DATABASE_HOST")
DATABASE_PORT = os.getenv("DATABASE_PORT")
DATABASE_DB = os.getenv("DATABASE_DB")

EXAMPLES_USER = os.getenv("EXAMPLES_USER")
EXAMPLES_PASSWORD = os.getenv("EXAMPLES_PASSWORD")
EXAMPLES_HOST = os.getenv("EXAMPLES_HOST")
EXAMPLES_PORT = os.getenv("EXAMPLES_PORT")
EXAMPLES_DB = os.getenv("EXAMPLES_DB")

# The SQLAlchemy connection string.
SQLALCHEMY_DATABASE_URI = (
    f"{DATABASE_DIALECT}://"
    f"{DATABASE_USER}:{DATABASE_PASSWORD}@"
    f"{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_DB}"
)

# Use environment variable if set, otherwise construct from components
# This MUST take precedence over any other configuration
SQLALCHEMY_EXAMPLES_URI = os.getenv(
    "SUPERSET__SQLALCHEMY_EXAMPLES_URI",
    (
        f"{DATABASE_DIALECT}://"
        f"{EXAMPLES_USER}:{EXAMPLES_PASSWORD}@"
        f"{EXAMPLES_HOST}:{EXAMPLES_PORT}/{EXAMPLES_DB}"
    ),
)


REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
REDIS_CELERY_DB = os.getenv("REDIS_CELERY_DB", "0")
REDIS_RESULTS_DB = os.getenv("REDIS_RESULTS_DB", "1")

RESULTS_BACKEND = FileSystemCache("/app/superset_home/sqllab")

CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 1800,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_HOST": REDIS_HOST,
    "CACHE_REDIS_PORT": REDIS_PORT,
    "CACHE_REDIS_DB": REDIS_RESULTS_DB,
}
DATA_CACHE_CONFIG = CACHE_CONFIG
THUMBNAIL_CACHE_CONFIG = CACHE_CONFIG


class CeleryConfig:
    broker_url = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_CELERY_DB}"
    imports = (
        "superset.sql_lab",
        "superset.tasks.scheduler",
        "superset.tasks.thumbnails",
        "superset.tasks.cache",
    )
    result_backend = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_RESULTS_DB}"
    worker_prefetch_multiplier = 1
    task_acks_late = False
    beat_schedule = {
        "reports.scheduler": {
            "task": "reports.scheduler",
            "schedule": crontab(minute="*", hour="*"),
        },
        "reports.prune_log": {
            "task": "reports.prune_log",
            "schedule": crontab(minute=10, hour=0),
        },
    }


CELERY_CONFIG = CeleryConfig

FEATURE_FLAGS = {"ALERT_REPORTS": True, "DATASET_FOLDERS": True, "ENABLE_TEMPLATE_PROCESSING": True,}
ALERT_REPORTS_NOTIFICATION_DRY_RUN = True
WEBDRIVER_BASEURL = f"http://superset_app{os.environ.get('SUPERSET_APP_ROOT', '/')}/"  # When using docker compose baseurl should be http://superset_nginx{ENV{BASEPATH}}/  # noqa: E501
# The base URL for the email report hyperlinks.
WEBDRIVER_BASEURL_USER_FRIENDLY = (
    f"http://localhost:8888/{os.environ.get('SUPERSET_APP_ROOT', '/')}/"
)
SQLLAB_CTAS_NO_LIMIT = True

log_level_text = os.getenv("SUPERSET_LOG_LEVEL", "INFO")
LOG_LEVEL = getattr(logging, log_level_text.upper(), logging.INFO)

if os.getenv("CYPRESS_CONFIG") == "true":
    # When running the service as a cypress backend, we need to import the config
    # located @ tests/integration_tests/superset_test_config.py
    base_dir = os.path.dirname(__file__)
    module_folder = os.path.abspath(
        os.path.join(base_dir, "../../tests/integration_tests/")
    )
    sys.path.insert(0, module_folder)
    from superset_test_config import *  # noqa

    sys.path.pop(0)

#
# Optionally import superset_config_docker.py (which will have been included on
# the PYTHONPATH) in order to allow for local settings to be overridden
#
try:
    import superset_config_docker
    from superset_config_docker import *  # noqa: F403

    logger.info(
        "Loaded your Docker configuration at [%s]", superset_config_docker.__file__
    )
except ImportError:
    logger.info("Using default Docker config...")
BABEL_DEFAULT_LOCALE = "zh"
LANGUAGES = {
    "zh": {"flag": "cn", "name": "Chinese"},
    "en": {"flag": "us", "name": "English"},
}
TIME_GRAIN_ADDONS = {
    "P1W_SUN": "一周（周日开始）",
}

TIME_GRAIN_ADDON_EXPRESSIONS = {
    "postgresql": {
        "P1W_SUN": "DATE_TRUNC('week', {col} + INTERVAL '1 day') - INTERVAL '1 day'",
    }
}


# =========================
# Timezone
# =========================
BABEL_DEFAULT_TIMEZONE = "Asia/Shanghai"
SUPERSET_DEFAULT_TIMEZONE = "Asia/Shanghai"
os.environ["TZ"] = "Asia/Shanghai"

try:
    import time
    time.tzset()
except Exception:
    pass
# ============================================
# 自定义时间粒度：财年季度（4月起始）
# Q1: 4-6月, Q2: 7-9月, Q3: 10-12月, Q4: 次年1-3月
# ============================================
TIME_GRAIN_ADDONS = {
    'P3M_FISCAL': 'Fiscal Quarter (Apr start)',
}

TIME_GRAIN_FUNCTIONS = {
    'postgresql': {
        'P3M_FISCAL': "DATE_TRUNC('quarter', {col} - INTERVAL '3 months') + INTERVAL '3 months'",
    },
}

# ============================================
# 自定义时间粒度
# ============================================
TIME_GRAIN_ADDONS = {
    "P3M_FISCAL": "Fiscal Quarter (Apr start)",
    "P1W_SUN": "Week (Sunday start)",
}

TIME_GRAIN_FUNCTIONS = {
    "postgresql": {
        "P3M_FISCAL": "DATE_TRUNC('quarter', {col} - INTERVAL '3 months') + INTERVAL '3 months'",
        "P1W_SUN": "DATE_TRUNC('week', {col} + INTERVAL '1 day') - INTERVAL '1 day'",
    },
}

# ============================================
# 自定义时间粒度
# ============================================
TIME_GRAIN_ADDONS = {
    "P3M_FISCAL": "Fiscal Quarter (Apr start)",
    "P1W_SUN": "Week (Sunday start)",
}

TIME_GRAIN_FUNCTIONS = {
    "postgresql": {
        "P3M_FISCAL": "DATE_TRUNC('quarter', {col} - INTERVAL '3 months') + INTERVAL '3 months'",
        "P1W_SUN": "DATE_TRUNC('week', {col} + INTERVAL '1 day') - INTERVAL '1 day'",
    },
}

# ============================================
# 自定义时间粒度
# ============================================
TIME_GRAIN_ADDONS = {
    "P3M_FISCAL": "Fiscal Quarter (Apr start)",
    "P1W_SUN": "Week (Sunday start)",
}

TIME_GRAIN_ADDON_EXPRESSIONS = {
    "postgresql": {
        "P3M_FISCAL": "DATE_TRUNC('quarter', {col} - INTERVAL '3 months') + INTERVAL '3 months'",
        "P1W_SUN": "DATE_TRUNC('week', {col} + INTERVAL '1 day') - INTERVAL '1 day'",
    },
}

# 默认时间格式（中文友好，纯数字不依赖 locale）
D3_TIME_FORMAT = "%Y-%m-%d"

# Allow img tags in table chart HTML rendering
HTML_SANITIZATION_SCHEMA_EXTENSIONS = {
    "attributes": {
        "img": ["src", "style", "width", "height", "alt"],
    },
    "tags": ["img"],
}

# Allow server images in Content Security Policy
TALISMAN_CONFIG = {
    "content_security_policy": {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:", "http://8.163.67.219"],
        "script-src": ["'self'", "'strict-dynamic'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "data:", "https://fonts.googleapis.com"],
        "connect-src": ["'self'", "https://api.mapbox.com"],
        "worker-src": ["'self'", "blob:"],
        "object-src": "'none'",
    },
    "content_security_policy_nonce_in": ["script-src"],
    "force_https": False,
    "session_cookie_secure": False,
}

# === Cache warm-up (added 2026-06-26) ===
from superset.tasks.types import ExecutorType, FixedExecutor

# Warm as the chart owner, falling back to admin for owner-less charts (e.g. 590)
CACHE_WARMUP_EXECUTORS = [ExecutorType.OWNER, FixedExecutor("admin")]

# The worker must be able to reach the web app to fetch charts; the default
# "superset_app" host is unresolvable inside this compose network.
WEBDRIVER_BASEURL = "http://superset:8088/"

# Periodically pre-run the most-used dashboards so the result cache stays warm
# and first-open is fast (every 30 min).
CeleryConfig.beat_schedule["cache-warmup"] = {
    "task": "cache-warmup",
    "schedule": crontab(minute="*/30"),
    "kwargs": {
        "strategy_name": "top_n_dashboards",
        "top_n": 10,
        "since": "7 days ago",
    },
}
CELERY_CONFIG = CeleryConfig
