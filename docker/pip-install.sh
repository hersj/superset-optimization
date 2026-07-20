#!/usr/bin/env bash

# Force Docker build apt sources to China mirrors
if [ -f /etc/apt/sources.list.d/debian.sources ]; then
  sed -i 's|http://deb.debian.org/debian-security|http://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources || true
  sed -i 's|http://deb.debian.org/debian|http://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources || true
  sed -i 's|https://deb.debian.org/debian-security|http://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources || true
  sed -i 's|https://deb.debian.org/debian|http://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources || true
fi

if [ -f /etc/apt/sources.list ]; then
  sed -i 's|http://deb.debian.org/debian-security|http://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list || true
  sed -i 's|http://deb.debian.org/debian|http://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list || true
  sed -i 's|https://deb.debian.org/debian-security|http://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list || true
  sed -i 's|https://deb.debian.org/debian|http://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list || true
fi

echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries || true
echo 'Acquire::http::Timeout "30";' >> /etc/apt/apt.conf.d/80-retries || true
echo 'Acquire::https::Timeout "30";' >> /etc/apt/apt.conf.d/80-retries || true

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
set -euo pipefail

# Default flag
REQUIRES_BUILD_ESSENTIAL=false
USE_CACHE=true

# Filter arguments
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --requires-build-essential)
      REQUIRES_BUILD_ESSENTIAL=true
      ;;
    --no-cache)
      USE_CACHE=false
      ;;
    *)
      ARGS+=("$arg")
      ;;
  esac
done

# Install build-essential if required
if ${REQUIRES_BUILD_ESSENTIAL}; then
  echo "Installing build-essential for package builds..."
  apt-get update -qq \
    && apt-get install -yqq --no-install-recommends build-essential
fi

# Choose whether to use pip cache
if ${USE_CACHE}; then
  echo "Using pip cache..."
  uv pip install "${ARGS[@]}"
else
  echo "Disabling pip cache..."
  uv pip install --no-cache-dir "${ARGS[@]}"
fi

# Remove build-essential if it was installed
if ${REQUIRES_BUILD_ESSENTIAL}; then
  echo "Removing build-essential to keep the image lean..."
  apt-get autoremove -yqq --purge build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*
fi

echo "Python packages installed successfully."
