FROM superset-superset:table-columns-21164494

ARG REVISION
ARG MANIFEST_SHA256
COPY superset/commands/dashboard/chart_layouts.py /app/superset/commands/dashboard/chart_layouts.py
COPY superset/daos/dashboard_chart_layout.py /app/superset/daos/dashboard_chart_layout.py
COPY superset/dashboards/api.py /app/superset/dashboards/api.py
COPY superset/dashboards/schemas.py /app/superset/dashboards/schemas.py
COPY superset/models/dashboard_chart_layout.py /app/superset/models/dashboard_chart_layout.py
COPY superset/migrations/versions/2026-09-23_08-00_a5b6c7d8e9f0_add_dashboard_pivot_layouts.py /app/superset/migrations/versions/2026-09-23_08-00_a5b6c7d8e9f0_add_dashboard_pivot_layouts.py
COPY superset/migrations/versions/2026-09-23_08-00_a5b6c7d8e9f0_add_dashboard_pivot_layouts.py /app/.venv/lib/python3.11/site-packages/superset/migrations/versions/2026-09-23_08-00_a5b6c7d8e9f0_add_dashboard_pivot_layouts.py
COPY superset/static/assets/ /app/superset/static/assets/
COPY superset/static/service-worker.js /app/superset/static/service-worker.js

RUN set -eu; \
    test -s /app/superset/static/assets/manifest.json; \
    test "$(sha256sum /app/superset/static/assets/manifest.json | cut -d ' ' -f 1)" = "$MANIFEST_SHA256"; \
    test "$(sha256sum /app/superset/translations/zh/LC_MESSAGES/messages.json | cut -d ' ' -f 1)" = "729c585de1e59ce16cc1b62bb42ef98efb3cca5fa5da20ba27f14d77029a5f07"; \
    test "$(sha256sum /app/superset/translations/zh/LC_MESSAGES/messages.mo | cut -d ' ' -f 1)" = "1ea0df9858ed123cad140602d6ad914aaca2bceb0d78463489eb93343e39e99f"; \
    grep -q 'time_ranges=payload.get("time_ranges")' /app/superset/dashboards/api.py; \
    grep -q 'self._time_ranges = time_ranges' /app/superset/commands/dashboard/cascade_filter_options.py; \
    PYTHONPYCACHEPREFIX=/tmp/pivot-pycache /app/.venv/bin/python -m py_compile /app/superset/commands/dashboard/chart_layouts.py /app/superset/daos/dashboard_chart_layout.py /app/superset/dashboards/api.py /app/superset/dashboards/schemas.py /app/superset/models/dashboard_chart_layout.py /app/superset/migrations/versions/2026-09-23_08-00_a5b6c7d8e9f0_add_dashboard_pivot_layouts.py

LABEL org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.base.digest="sha256:ffd677502d133ebf11d74b832f0ebdd686dc6507d3c6a2d47710ce3fa3b80659" \
      org.opencontainers.image.overlay.kind="pivot-columns-frontend-backend"
