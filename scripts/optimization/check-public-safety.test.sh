#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
scanner="$repo_root/scripts/optimization/check-public-safety.sh"

if [[ ! -x "$scanner" ]]; then
  echo "FAIL: public safety scanner is missing or not executable" >&2
  exit 1
fi

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

git -C "$tmp_dir" init -q
git -C "$tmp_dir" config user.name "Safety Test"
git -C "$tmp_dir" config user.email "safety@example.invalid"
printf '%s\n' '# safe repository' > "$tmp_dir/README.md"
printf '%s%s\n' 'SQLALCHEMY_DATABASE_URI="postgresql://upstream:' \
  'example@example.invalid/database"' > "$tmp_dir/upstream-example.py"
git -C "$tmp_dir" add README.md upstream-example.py
git -C "$tmp_dir" commit -qm "test: initialize safe repository"
base_ref=$(git -C "$tmp_dir" rev-parse HEAD)

(
  cd "$tmp_dir"
  GITLEAKS_BASE_REF="$base_ref" "$scanner"
)

printf '%s%s\n' 'SQLALCHEMY_DATABASE_URI="postgresql://user:' \
  'password@example.invalid/database"' > "$tmp_dir/leak.py"
git -C "$tmp_dir" add leak.py

set +e
credential_output=$(
  cd "$tmp_dir"
  GITLEAKS_BASE_REF="$base_ref" "$scanner" 2>&1
)
credential_status=$?
set -e

if ((credential_status == 0)); then
  echo "FAIL: scanner accepted a tracked credential" >&2
  exit 1
fi
if [[ "$credential_output" != *"credential-shaped"* ]]; then
  echo "FAIL: credential rejection had an unexpected cause" >&2
  echo "$credential_output" >&2
  exit 1
fi

git -C "$tmp_dir" rm -q --cached leak.py
rm "$tmp_dir/leak.py"
printf '%s\n' 'EXAMPLE_ONLY=true' > "$tmp_dir/.env"
git -C "$tmp_dir" add -f .env

set +e
path_output=$(
  cd "$tmp_dir"
  GITLEAKS_BASE_REF="$base_ref" "$scanner" 2>&1
)
path_status=$?
set -e

if ((path_status == 0)); then
  echo "FAIL: scanner accepted a forbidden tracked path" >&2
  exit 1
fi
if [[ "$path_output" != *"private or generated path"* ]]; then
  echo "FAIL: private-path rejection had an unexpected cause" >&2
  echo "$path_output" >&2
  exit 1
fi

echo "PASS: public safety scanner rejects credentials and private paths"
