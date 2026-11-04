<!--
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
-->

# ASIN mapping template compatibility release

This entrypoint builds the committed one-line `get_time_filter` fix on each
service's verified current image. It preserves the existing selected-time-range
backend and all frontend overlays. Only the build step uses root to patch the
root-owned template; the resulting image restores the base image runtime user. Web and worker have separate base images;
beat does not compile chart templates and is unchanged.

After this branch is merged and the server checkout has fetched `origin/master`,
set `revision` to that merged SHA and `release` to
`/superset/releases/asin-mapping-template-<first 10 characters of SHA>`.
Run from the merged server checkout:

```sh
python scripts/asin_mapping_release/build_image.py --revision "$revision" --repo "$PWD" --release-dir "$release" --service web
python scripts/asin_mapping_release/build_image.py --revision "$revision" --repo "$PWD" --release-dir "$release" --service worker
```

Use each resulting `image-<service>-receipt.json` digest for the corresponding
preflight. The command writes deployment receipts and a rollback Compose override
but changes no running service until `--switch` is included:

```sh
python scripts/asin_mapping_release/deploy.py "$revision" "$web_digest" --release-dir "$release" --service web
python scripts/asin_mapping_release/deploy.py "$revision" "$web_digest" --release-dir "$release" --service web --switch
python scripts/asin_mapping_release/deploy.py "$revision" "$worker_digest" --release-dir "$release" --service worker
python scripts/asin_mapping_release/deploy.py "$revision" "$worker_digest" --release-dir "$release" --service worker --switch
```

The existing complete Compose chain is read from the current Web container.
Only the named service is recreated; environment, runtime user, command and mounts must match.
The script checks the old PID exited, verifies the new image and PID, and checks
all other containers remain unchanged. The worker must finish its active tasks
before its switch. Do not treat a successful switch as business acceptance:
verify the real affected chart requests, CSVs, current authorization and async
chart execution, then inspect relevant error logs.

The rollback command list and override are saved under
`deployment/<service>/rollback-command.json` and `rollback.compose.yml`.
Use the same Compose environment established by `deploy.py`; no credentials are
saved in these receipts. Rollback changes the service image only. The separately
captured private BI metadata preimage and inverse SQL handle configuration rollback.
