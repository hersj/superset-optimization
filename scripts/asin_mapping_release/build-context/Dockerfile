ARG BASE_IMAGE=superset-web:pivot-template-sync-44fffd41c3
FROM ${BASE_IMAGE}
ARG RELEASE_REVISION
ARG BASE_DIGEST
LABEL org.opencontainers.image.revision="${RELEASE_REVISION}"
LABEL org.opencontainers.image.authors="hersj (Codex assisted)"
LABEL org.opencontainers.image.description="Handle SQL filters when resolving ASIN mapping time ranges"
LABEL org.opencontainers.image.base.digest="${BASE_DIGEST}"
LABEL org.opencontainers.image.overlay.kind="asin-mapping-template-compat"
LABEL org.opencontainers.image.template.source.revision="a1e34d6f236d08c8a34de6287c840e10975458da"
COPY apply_compat.py patch-manifest.json /app/.mapping-template-build/
RUN python /app/.mapping-template-build/apply_compat.py && rm -r /app/.mapping-template-build
