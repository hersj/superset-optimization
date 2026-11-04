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

ARG BASE_IMAGE=superset-web:pivot-template-sync-44fffd41c3
FROM ${BASE_IMAGE}
ARG RELEASE_REVISION
ARG BASE_DIGEST
ARG RUNTIME_USER=root
LABEL org.opencontainers.image.revision="${RELEASE_REVISION}"
LABEL org.opencontainers.image.authors="hersj (Codex assisted)"
LABEL org.opencontainers.image.description="Handle SQL filters when resolving ASIN mapping time ranges"
LABEL org.opencontainers.image.base.digest="${BASE_DIGEST}"
LABEL org.opencontainers.image.overlay.kind="asin-mapping-template-compat"
LABEL org.opencontainers.image.template.source.revision="a1e34d6f236d08c8a34de6287c840e10975458da"
USER root
COPY apply_compat.py patch-manifest.json /app/.mapping-template-build/
RUN python /app/.mapping-template-build/apply_compat.py && rm -r /app/.mapping-template-build
USER ${RUNTIME_USER}
