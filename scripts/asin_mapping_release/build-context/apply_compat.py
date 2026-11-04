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
"""Apply only the committed compatibility change to the immutable runtime base."""

import hashlib
import json
from pathlib import Path

manifest = json.loads(
    Path("/app/.mapping-template-build/patch-manifest.json").read_text()
)
p = Path("/app/superset/jinja_context.py")
s = p.read_text()
assert hashlib.sha256(s.encode()).hexdigest() == manifest["expected_before_sha256"]
assert s.count(manifest["before"]) == 1
s = s.replace(manifest["before"], manifest["after"])
assert hashlib.sha256(s.encode()).hexdigest() == manifest["expected_after_sha256"]
compile(s, str(p), "exec")
p.write_text(s)
