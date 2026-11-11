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
"""Switch only the selected Compose service, preserving its environment and mounts."""


# ruff: noqa: S603

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

BASE = "sha256:2c14b5b0e6dfff91f1dd9fa5ab3ffca77742a178267b0e72652ba56f94b94222"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("revision")
parser.add_argument("target")
parser.add_argument("--release-dir", type=Path, required=True)
parser.add_argument("--service", choices=["web", "worker"], default="web")
parser.add_argument("--switch", action="store_true")
args = parser.parse_args()
revision = args.revision
TARGET = args.target
container, service, base_tag, BASE = {
    "web": (
        "superset_app",
        "superset",
        "superset-web:bounded-v3-400ac78fb0",
        BASE,
    ),
    "worker": (
        "superset_worker",
        "superset-worker",
        "superset-worker:bounded-v3-400ac78fb0",
        "sha256:df5a7616241a41f96e610f756481213242aeb86b379724078a7d50aaad149d6b",
    ),
}[args.service]
assert len(revision) == 40
assert all(c in "0123456789abcdef" for c in revision)
assert TARGET.startswith("sha256:")
assert len(TARGET) == 71
short = revision[:10]
image = "superset-" + args.service + ":bounded-v3-" + short
RELEASE = args.release_dir
ROOT = RELEASE / "deployment" / args.service
ROOT.mkdir(parents=True, exist_ok=True)


def run(args: list[str]) -> str:
    return subprocess.check_output(args, text=True)


def inspect(name: str) -> dict[str, Any]:
    return json.loads(run(["docker", "inspect", name]))[0]


web = inspect(container)
assert web["Image"] == BASE, "Production image changed; stop for recheck"
files = inspect("superset_app")["Config"]["Labels"][
    "com.docker.compose.project.config_files"
].split(",")
env = os.environ.copy()
current_env = dict(v.split("=", 1) for v in web["Config"]["Env"])
env.update(
    SELLERFOX_ORIGINAL_CONFIG_PATH=current_env["SELLERFOX_ORIGINAL_CONFIG_PATH"],
    OPERATOR_REGISTRATION_RELEASE="/superset/releases/operator-erp-line-20260908",
    PIVOT_RELEASE_IMAGE="sha256:665232bf0b8fe15931ae70eae584016ae7f7997abe082f2e389ef3d9f4e3cd9a",
)
cmd = ["docker", "compose", "-p", "superset"]
for file in files:
    cmd += ["-f", file]
cmd += ["-f", str(RELEASE / (args.service + ".compose.yml"))]
cfg = json.loads(
    subprocess.check_output(cmd + ["config", "--format", "json"], env=env, text=True)
)
configured_service = cfg["services"][service]
assert configured_service["image"] == image, (
    "Compose must reference the verified target image"
)
configured_env = {
    k: str(v) for k, v in configured_service.get("environment", {}).items()
}
# 镜像自身环境由固定基线继承，Compose 明确覆盖的环境必须保持一致。
different = [k for k, v in configured_env.items() if current_env.get(k) != v]
assert not different, "Environment mismatch keys: " + ",".join(different)
candidate_config = inspect(image)["Config"]
current_user = web["Config"].get("User") or "root"
configured_user = str(
    configured_service.get("user") or candidate_config.get("User") or "root"
)
assert configured_user == current_user, "Runtime user must remain unchanged"
merged_env = dict(v.split("=", 1) for v in candidate_config["Env"]) | configured_env
assert merged_env == current_env, "Full environment must remain unchanged"
assert configured_service["command"] == web["Config"]["Cmd"], (
    "Service command must remain unchanged"
)
expected = {}
for v in configured_service["volumes"]:
    source = v["source"]
    if v["type"] == "volume":
        source = cfg["volumes"][source]["name"]
    expected[v["target"]] = (v["type"], source, not v.get("read_only", False))
actual = {
    v["Destination"]: (
        v["Type"],
        v.get("Name") if v["Type"] == "volume" else v["Source"],
        v["RW"],
    )
    for v in web["Mounts"]
}
assert expected == actual, "Mount mismatch; stop"
names = run(["docker", "ps", "--format", "{{.Names}}"]).splitlines()
before = {
    n: {k: inspect(n)[k] for k in ("Id", "Image")} | {"Pid": inspect(n)["State"]["Pid"]}
    for n in names
}
if (ROOT / "before.json").exists():
    assert json.loads((ROOT / "before.json").read_text()) == before, (
        "Runtime changed since preflight"
    )
else:
    (ROOT / "before.json").write_text(json.dumps(before, indent=2))
assert inspect(base_tag)["Id"] == BASE
rollback = "services:\n  " + service + ":\n    image: " + base_tag + "\n"
(ROOT / "rollback.compose.yml").write_text(rollback)
assert inspect(image)["Id"] == TARGET
assert (
    inspect(image)["Config"]["Labels"]["org.opencontainers.image.revision"] == revision
)
(ROOT / "compose-command.json").write_text(
    json.dumps(
        {
            "command": cmd,
            "environment_keys_verified": sorted(configured_env),
            "mounts_verified": True,
            "runtime_user_verified": current_user,
            "base_image": BASE,
            "target_image": TARGET,
            "revision": revision,
        },
        indent=2,
    )
)
(ROOT / "rollback-command.json").write_text(
    json.dumps(
        cmd
        + [
            "-f",
            str(ROOT / "rollback.compose.yml"),
            "up",
            "-d",
            "--no-deps",
            "--no-build",
            "--force-recreate",
            service,
        ],
        indent=2,
    )
)
print(
    json.dumps(
        {"preflight": "passed", "container": before[container], "only_service": service}
    ),
    flush=True,
)
if not args.switch:
    sys.exit(0)
subprocess.run(
    cmd + ["up", "-d", "--no-deps", "--no-build", "--force-recreate", service],
    env=env,
    check=True,
)
after = {
    n: {k: inspect(n)[k] for k in ("Id", "Image")} | {"Pid": inspect(n)["State"]["Pid"]}
    for n in names
}
for n in names:
    if n != container:
        assert before[n] == after[n], "Unexpected service change: " + n
assert (inspect(container)["Config"].get("User") or "root") == current_user
assert after[container]["Image"] == TARGET
assert before[container]["Pid"] != after[container]["Pid"]
assert not Path("/proc/" + str(before[container]["Pid"])).exists(), (
    "Old service PID still present"
)
(ROOT / "after.json").write_text(json.dumps(after, indent=2))
print(
    json.dumps({"switched": after[container], "other_services_unchanged": True}),
    flush=True,
)
