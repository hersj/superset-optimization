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
"""Offline checks for the bounded mapping template release entrypoints."""


# Standalone checks use only the standard library; no Superset app is initialized.
# ruff: noqa: PT009, PT027, TID251

import copy
import hashlib
import json
import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
RELEASE = ROOT / "scripts/asin_mapping_release"
REVISION = "a" * 40
TARGET = "sha256:" + "b" * 64
BASES = {
    "web": "sha256:8e88825cc2875a3dc62a3b88db155aace485f3ab5f54711c52de22a99c5ff217",
    "worker": "sha256:d814f90b59fb9b77408ffe99460516192f1276f275947a259f842e780e6e1ea5",
}


class MappingReleaseTest(unittest.TestCase):
    def exercise(self, kind: str, mismatch: str | None = None) -> None:
        """Simulate Docker responses without starting processes or reading secrets."""
        container = "superset_app" if kind == "web" else "superset_worker"
        service = "superset" if kind == "web" else "superset-worker"
        image = "superset-" + kind + ":asin-mapping-template-" + REVISION[:10]
        environment = ["SELLERFOX_ORIGINAL_CONFIG_PATH=/config", "EXAMPLE=fixture"]
        config = {
            "Env": environment,
            "User": "superset" if kind == "web" else "",
            "Cmd": ["bootstrap", kind],
            "Labels": {"com.docker.compose.project.config_files": "/base.yml"},
        }
        active: dict[str, Any] = {
            name: {
                "Id": name + "-before",
                "Image": BASES["web" if name == "superset_app" else "worker"],
                "Config": copy.deepcopy(config),
                "State": {"Pid": 90000000 + index},
                "Mounts": [
                    {
                        "Type": "volume",
                        "Name": "lab_home",
                        "Destination": "/home",
                        "RW": True,
                    }
                ],
            }
            for index, name in enumerate(
                ["superset_app", "superset_worker", "superset_worker_beat"]
            )
        }
        initial = copy.deepcopy(active)
        if mismatch == "base":
            active[container]["Image"] = "sha256:unexpected"
        candidate = {
            "Id": TARGET,
            "Config": {
                "Env": environment,
                "User": "root" if mismatch == "user" else config["User"],
                "Labels": {"org.opencontainers.image.revision": REVISION},
            },
        }
        compose = {
            "services": {
                service: {
                    "image": image,
                    "environment": {
                        "EXAMPLE": "changed" if mismatch == "environment" else "fixture"
                    },
                    "command": config["Cmd"],
                    "volumes": [
                        {"type": "volume", "source": "home", "target": "/home"}
                    ],
                }
            },
            "volumes": {"home": {"name": "lab_home"}},
        }

        def output(command: list[str], **_kwargs: object) -> str:
            if command[:2] == ["docker", "inspect"]:
                name = command[2]
                value = active.get(name)
                if value is None:
                    value = candidate if name == image else {"Id": BASES[kind]}
                return json.dumps([value])
            if command[:2] == ["docker", "ps"]:
                return "\n".join(active)
            self.assertEqual(command[-3:], ["config", "--format", "json"])
            return json.dumps(compose)

        def switch(command: list[str], **_kwargs: object) -> None:
            self.assertEqual(
                command[-6:],
                ["up", "-d", "--no-deps", "--no-build", "--force-recreate", service],
            )
            active[container]["Id"] += "-after"
            active[container]["Image"] = TARGET
            active[container]["State"]["Pid"] += 100

        with tempfile.TemporaryDirectory() as directory:
            arguments = [
                str(RELEASE / "deploy.py"),
                REVISION,
                TARGET,
                "--release-dir",
                directory,
                "--service",
                kind,
                "--switch",
            ]
            with (
                patch.object(sys, "argv", arguments),
                patch("subprocess.check_output", side_effect=output),
                patch("subprocess.run", side_effect=switch) as mutation,
            ):
                if mismatch:
                    with self.assertRaises(AssertionError):
                        runpy.run_path(str(RELEASE / "deploy.py"), run_name="__main__")
                    mutation.assert_not_called()
                    return
                runpy.run_path(str(RELEASE / "deploy.py"), run_name="__main__")
                mutation.assert_called_once()
            self.assertEqual(active[container]["Image"], TARGET)
            for name in active:
                if name != container:
                    self.assertEqual(active[name], initial[name])
            receipt = Path(directory) / "deployment" / kind
            self.assertTrue((receipt / "before.json").exists())
            self.assertTrue((receipt / "after.json").exists())
            self.assertTrue((receipt / "rollback-command.json").exists())

    def test_switch_web_and_worker_independently(self) -> None:
        for kind in BASES:
            with self.subTest(service=kind):
                self.exercise(kind)

    def test_reject_changed_runtime_without_mutation(self) -> None:
        self.exercise("web", "base")

    def test_reject_changed_environment_without_mutation(self) -> None:
        self.exercise("worker", "environment")

    def test_reject_runtime_user_change_without_mutation(self) -> None:
        self.exercise("web", "user")

    def test_build_keeps_service_base_and_disables_network(self) -> None:
        manifest = json.loads(
            (RELEASE / "build-context/patch-manifest.json").read_text()
        )
        for kind, digest in BASES.items():

            def output(
                command: list[str],
                expected_digest: str = digest,
                expected_user: str = "superset" if kind == "web" else "",
                **_kwargs: object,
            ) -> str:
                if command[0] == "git":
                    return REVISION if "rev-parse" in command else manifest["after"]
                if command[1] == "run":
                    return json.dumps(
                        {"jinja_sha256": manifest["expected_after_sha256"]}
                    )
                if command[1] == "inspect":
                    return json.dumps([{"Image": expected_digest}])
                return json.dumps(
                    [
                        {
                            "Id": TARGET
                            if ":asin-mapping-template-" in command[-1]
                            else expected_digest,
                            "Config": {"User": expected_user or "root"}
                            if ":asin-mapping-template-" in command[-1]
                            else {"User": expected_user},
                        }
                    ]
                )

            with tempfile.TemporaryDirectory() as directory:
                arguments = [
                    str(RELEASE / "build_image.py"),
                    "--revision",
                    REVISION,
                    "--repo",
                    str(ROOT),
                    "--release-dir",
                    directory,
                    "--service",
                    kind,
                ]
                with (
                    patch.object(sys, "argv", arguments),
                    patch("subprocess.check_output", side_effect=output),
                    patch("subprocess.run") as commands,
                ):
                    runpy.run_path(str(RELEASE / "build_image.py"), run_name="__main__")
                build = commands.call_args_list[-1].args[0]
                self.assertEqual(build[:4], ["docker", "build", "--network", "none"])
                self.assertIn("BASE_DIGEST=" + digest, build)
                self.assertIn(
                    "RUNTIME_USER=" + ("superset" if kind == "web" else "root"), build
                )
                receipt = json.loads(
                    (Path(directory) / ("image-" + kind + "-receipt.json")).read_text()
                )
                self.assertEqual(receipt["base_image"], digest)
                self.assertEqual(
                    receipt["runtime_user"], "superset" if kind == "web" else "root"
                )
                self.assertFalse(receipt["switched"])
                service = "superset" if kind == "web" else "superset-worker"
                self.assertIn(
                    "  " + service + ":",
                    (Path(directory) / (kind + ".compose.yml")).read_text(),
                )

    def test_patch_preserves_overlay_and_rejects_changed_source(self) -> None:
        manifest = json.loads(
            (RELEASE / "build-context/patch-manifest.json").read_text()
        )
        fixture = "# runtime overlay\n" + manifest["before"] + ":\n    pass\n"
        expected = fixture.replace(manifest["before"], manifest["after"])
        manifest["expected_before_sha256"] = hashlib.sha256(
            fixture.encode()
        ).hexdigest()
        manifest["expected_after_sha256"] = hashlib.sha256(
            expected.encode()
        ).hexdigest()
        code = compile(
            (RELEASE / "build-context/apply_compat.py").read_text(),
            "apply_compat.py",
            "exec",
        )
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "jinja_context.py"
            metadata = Path(directory) / "manifest.json"
            source.write_text(fixture)
            metadata.write_text(json.dumps(manifest))
            paths = {
                "/app/.mapping-template-build/patch-manifest.json": metadata,
                "/app/superset/jinja_context.py": source,
            }
            with patch("pathlib.Path", side_effect=paths.__getitem__):
                exec(code, {})  # noqa: S102 - execute the committed build script only
            self.assertEqual(source.read_text(), expected)
            source.write_text("# changed source\n")
            with patch("pathlib.Path", side_effect=paths.__getitem__):
                with self.assertRaises(AssertionError):
                    exec(code, {})  # noqa: S102 - execute the committed build script only
            self.assertEqual(source.read_text(), "# changed source\n")


if __name__ == "__main__":
    unittest.main()
