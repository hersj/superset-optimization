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
"""Build an immutable template-only image after the source change is merged."""


# ruff: noqa: S603, S607

import argparse
import json
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("--revision", required=True)
p.add_argument("--repo", required=True)
p.add_argument("--service", choices=["web", "worker"], default="web")
p.add_argument("--release-dir", type=Path, required=True)
a = p.parse_args()
context = Path(__file__).parent / "build-context"
root = a.release_dir
root.mkdir(parents=True, exist_ok=True)


def run(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True).strip()


assert len(a.revision) == 40
assert all(c in "0123456789abcdef" for c in a.revision)
subprocess.run(
    [
        "git",
        "-C",
        a.repo,
        "merge-base",
        "--is-ancestor",
        "a1e34d6f236d08c8a34de6287c840e10975458da",
        a.revision,
    ],
    check=True,
)
assert run(["git", "-C", a.repo, "rev-parse", "origin/master"]) == a.revision
source = run(["git", "-C", a.repo, "show", a.revision + ":superset/jinja_context.py"])
assert 'if flt.get("operator") == FilterOperator.TEMPORAL_RANGE' in source
base = {
    "web": (
        "superset_app",
        "superset-web:pivot-template-sync-44fffd41c3",
        "sha256:8e88825cc2875a3dc62a3b88db155aace485f3ab5f54711c52de22a99c5ff217",
    ),
    "worker": (
        "superset_worker",
        "superset-web:selected-time-calendar-6395153dc8",
        "sha256:d814f90b59fb9b77408ffe99460516192f1276f275947a259f842e780e6e1ea5",
    ),
}[a.service]
container, tag, digest = base
assert json.loads(run(["docker", "inspect", container]))[0]["Image"] == digest, (
    "Active base changed; refresh before building"
)
assert json.loads(run(["docker", "image", "inspect", tag]))[0]["Id"] == digest
image = "superset-" + a.service + ":asin-mapping-template-" + a.revision[:10]
subprocess.run(
    [
        "docker",
        "build",
        "--network",
        "none",
        "--pull=false",
        "--build-arg",
        "BASE_IMAGE=" + tag,
        "--build-arg",
        "BASE_DIGEST=" + digest,
        "--build-arg",
        "RELEASE_REVISION=" + a.revision,
        "-t",
        image,
        str(context),
    ],
    check=True,
)
imageid = json.loads(run(["docker", "image", "inspect", image]))[0]["Id"]
job = (
    "import pathlib,hashlib,json; "
    "print(json.dumps({'jinja_sha256':hashlib.sha256("
    "pathlib.Path('/app/superset/jinja_context.py').read_bytes()).hexdigest()}))"
)
checked = json.loads(
    run(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--entrypoint",
            "python",
            imageid,
            "-c",
            job,
        ]
    )
)
manifest = json.loads((context / "patch-manifest.json").read_text())
assert checked["jinja_sha256"] == manifest["expected_after_sha256"]
receipt = {
    "image": image,
    "digest": imageid,
    "base_image": digest,
    "revision": a.revision,
    "template_source_commit": manifest["source_commit"],
    "verification": checked,
    "switched": False,
}
(root / ("image-" + a.service + "-receipt.json")).write_text(
    json.dumps(receipt, indent=2) + "\n"
)
print(json.dumps(receipt))

service = "superset" if a.service == "web" else "superset-worker"
(root / (a.service + ".compose.yml")).write_text(
    "services:\n  " + service + ":\n    image: " + image + "\n"
)
