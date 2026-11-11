#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

ARG BASE_IMAGE=superset-web:dashboard-perf-4bcedffa41
FROM ${BASE_IMAGE}
ARG RELEASE_REVISION
ARG BASE_DIGEST
ARG RUNTIME_USER=root
LABEL org.opencontainers.image.revision="${RELEASE_REVISION}"
LABEL org.opencontainers.image.authors="hersj (Codex assisted)"
LABEL org.opencontainers.image.description="Bound heavy V3 time filters without replacing frontend resources"
LABEL org.opencontainers.image.base.digest="${BASE_DIGEST}"
LABEL org.opencontainers.image.overlay.kind="bounded-v3-time-filter"
LABEL org.opencontainers.image.template.source.revision="d7b004c2991be634e94915fa933f0198a90073ac"
USER root
COPY apply_compat.py patch-manifest.json bounded-v3-dataset.sql /app/.mapping-template-build/
RUN python /app/.mapping-template-build/apply_compat.py \
 && mv /app/.mapping-template-build/bounded-v3-dataset.sql /app/.bounded-v3-dataset.sql \
 && rm -r /app/.mapping-template-build
USER ${RUNTIME_USER}
