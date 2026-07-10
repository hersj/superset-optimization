#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: run the public safety scanner inside a Git repository" >&2
  exit 2
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: rg is required for the public safety scan" >&2
  exit 2
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "ERROR: gitleaks is required for the public safety scan" >&2
  exit 2
fi

base_ref=${GITLEAKS_BASE_REF:-cc066b3576}
candidate_files=()

add_candidate() {
  local candidate=$1
  local existing

  [[ -f "$candidate" ]] || return 0
  for existing in "${candidate_files[@]-}"; do
    [[ -n "$existing" ]] || continue
    [[ "$existing" == "$candidate" ]] && return 0
  done
  candidate_files+=("$candidate")
}

if git cat-file -e "${base_ref}^{commit}" 2>/dev/null; then
  while IFS= read -r -d '' path; do
    add_candidate "$path"
  done < <(git diff --name-only -z "${base_ref}..HEAD")
  while IFS= read -r -d '' path; do
    add_candidate "$path"
  done < <(git diff --cached --name-only -z)
  while IFS= read -r -d '' path; do
    add_candidate "$path"
  done < <(git diff --name-only -z)
else
  while IFS= read -r -d '' path; do
    add_candidate "$path"
  done < <(git ls-files -z)
fi

credential_pattern="SQLALCHEMY_DATABASE_URI\\s*=\\s*[\"']|SECRET_KEY\\s*=\\s*[\"']|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@"

if ((${#candidate_files[@]} > 0)) && \
  printf '%s\0' "${candidate_files[@]}" | xargs -0 rg -n -- "$credential_pattern"; then
  echo "ERROR: tracked files contain a credential-shaped value" >&2
  exit 1
fi

if [[ -n "${PRIVATE_DEPLOYMENT_HOST_PATTERN:-}" ]] && \
  printf '%s\0' "${candidate_files[@]}" | \
    xargs -0 rg -n -- "${PRIVATE_DEPLOYMENT_HOST_PATTERN}"; then
  echo "ERROR: tracked files contain the private deployment host" >&2
  exit 1
fi

forbidden_path_pattern='(^|/)(\.env([^/]*|$)|[^/]*\.bak[^/]*|[^/]*\.orig[^/]*|build_superset[^/]*\.log)$'
if ((${#candidate_files[@]} > 0)) && \
  printf '%s\n' "${candidate_files[@]}" | rg -n -- "$forbidden_path_pattern"; then
  echo "ERROR: repository tracks a private or generated path" >&2
  exit 1
fi

if git cat-file -e "${base_ref}^{commit}" 2>/dev/null; then
  gitleaks git . --redact --no-banner --log-opts="${base_ref}..HEAD"
else
  gitleaks dir . --redact --no-banner
fi

echo "Public safety scan passed"
