# Superset Explore And DatasetList Zh Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the remaining user-visible untranslated or blank Chinese strings used by Superset `Explore` and `DatasetList`, then rebuild and deploy the active `zh` language pack on the configured deployment host.

**Architecture:** Keep the fix in the shared translation source chain by extending the local `build_zh.py` overrides and regenerating remote `messages.po/json/mo`. Do not change frontend component logic or server-side business behavior. Verify through targeted regression tests and the live `/superset/language_pack/zh/` endpoint.

**Tech Stack:** Python 3, Babel PO/MO handling, Superset frontend translation packs, Docker, SSH

---

### Task 1: Lock the regression surface

**Files:**
- Modify: `archive/sellerfox/translation/test_build_zh_overrides.py`
- Read: `archive/sellerfox/translation/build_zh.py`

- [ ] **Step 1: Add failing assertions for the selected runtime-visible keys**

Add assertions covering representative `Explore` and `DatasetList` keys that are currently blank or missing in the active pack, for example:

```python
assert translated_value("Chart properties updated", "") == "图表属性已更新"
assert translated_value("Current Zoom", "") == "当前缩放级别"
assert translated_value("Drag to reorder", "") == "拖动以重新排序"
assert translated_value("Duplicate", "") == "复制"
assert translated_value("Dataset imported", "") == "数据集已导入"
```

- [ ] **Step 2: Run the targeted regression test and confirm it fails**

Run:

```bash
python -m pytest archive/sellerfox/translation/test_build_zh_overrides.py -q
```

Expected: the new assertions fail because `build_zh.py` does not yet define those overrides.

### Task 2: Implement the translation overrides

**Files:**
- Modify: `archive/sellerfox/translation/build_zh.py`
- Test: `archive/sellerfox/translation/test_build_zh_overrides.py`

- [ ] **Step 1: Add explicit overrides only for runtime-visible `Explore` and `DatasetList` strings**

Extend `FIXED_OVERRIDES` with the curated keys from the approved scope, such as:

```python
"Chart properties updated": "图表属性已更新",
"Current Zoom": "当前缩放级别",
"Drag to reorder": "拖动以重新排序",
"Formatting column": "格式化列",
"Formatting object": "格式化对象",
"Select column name": "选择列名",
"Select object name": "选择对象名称",
"Duplicate": "复制",
"Dataset imported": "数据集已导入",
```

Exclude protocol codes, test fixtures, and enum-like values.

- [ ] **Step 2: Re-run the targeted regression test and confirm it passes**

Run:

```bash
python -m pytest archive/sellerfox/translation/test_build_zh_overrides.py -q
```

Expected: the updated assertions pass.

### Task 3: Rebuild and deploy the remote zh language pack

**Files:**
- Copy: `archive/sellerfox/translation/build_zh.py`
- Remote target: `${SUPERSET_HOST}`
- Remote container path: `superset-superset-1:/tmp/build_zh.py`

- [ ] **Step 1: Copy the updated rebuild script to the remote host and container**

Run:

```bash
scp archive/sellerfox/translation/build_zh.py "${SUPERSET_HOST}:/tmp/build_zh.py"
ssh -T "${SUPERSET_HOST}" "docker cp /tmp/build_zh.py superset-superset-1:/tmp/build_zh.py"
```

- [ ] **Step 2: Regenerate the active zh artifacts in the Superset container**

Run:

```bash
ssh -T "${SUPERSET_HOST}" \
  "docker exec superset-superset-1 /app/.venv/bin/python /tmp/build_zh.py \
    --po /app/superset/translations/zh/LC_MESSAGES/messages.po \
    --po-out /app/superset/translations/zh/LC_MESSAGES/messages.po \
    --json /app/superset/translations/zh/LC_MESSAGES/messages.json \
    --mo /app/superset/translations/zh/LC_MESSAGES/messages.mo"
```

- [ ] **Step 3: Restart only the Superset web container**

Run:

```bash
ssh -T "${SUPERSET_HOST}" "docker restart superset-superset-1"
```

### Task 4: Verify live behavior through the language-pack endpoint

**Files:**
- Remote active pack: `superset/translations/zh/LC_MESSAGES/messages.json`

- [ ] **Step 1: Wait for container health**

Run:

```bash
ssh -T "${SUPERSET_HOST}" \
  "docker inspect -f '{{.State.Health.Status}}' superset-superset-1"
```

Expected: `healthy`

- [ ] **Step 2: Check representative keys from the live endpoint**

Run:

```bash
ssh -T "${SUPERSET_HOST}" "python3 - <<'PY'
import json, urllib.request
obj = json.load(urllib.request.urlopen('http://127.0.0.1:8088/superset/language_pack/zh/'))
locale = obj['locale_data']['superset']
for key in [
    'Chart properties updated',
    'Current Zoom',
    'Drag to reorder',
    'Duplicate',
    'Dataset imported',
]:
    print(f'{key} => {locale.get(key)}')
PY"
```

Expected: every selected key resolves to the intended Chinese value.

- [ ] **Step 3: Report any remaining non-language-pack outliers separately**

If a user later reports untranslated text that does not map to these `t(...)` keys, treat it as a separate source-path issue instead of extending this patch blindly.
