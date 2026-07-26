# Phase 1 구현 계획 — 배달앱 브랜드할인 추적기

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배민·쿠팡이츠·땡겨요 3개 앱의 브랜드할인 페이지를 캡처→판독→저장→대시보드까지 잇는 1차 파이프라인을 완성한다.

**Architecture:** `capture(platform)`가 앱별 화면에서 롱스크롤 이미지를 만들고, Claude가 그 이미지를 비전으로 읽어 표준 레코드를 만들며, `store`가 JSONL에 append하고, `dashboard`가 정적 HTML을 재생성한다. 계층 간 계약은 "롱스크롤 이미지"와 "표준 레코드" 두 개뿐이다.

**Tech Stack:** Python 3.11+, Pillow(이미지 스티칭), pytest, Android SDK `emulator` + `adb` CLI(서브프로세스 호출)

## Global Constraints

- 언어는 Python, ADB는 `adb` CLI를 서브프로세스로 호출한다 (`ADR-001`). ddmlib 등 라이브러리 직접 연동 금지.
- 에뮬레이터는 Android SDK `emulator`(헤드리스)만 사용한다. BlueStacks 금지 (`ADR-002`).
- 화면 판독에 선택자(resource-id/텍스트 매칭)나 좌표 고정 파싱을 사용하지 않는다. 판독은 항상 비전이 수행한다 (`ADR-003`). 단, **화면 진입까지의 고정 탭 경로**와 **`current_activity()`를 통한 헬스체크**는 판독이 아니므로 이 제약의 예외다.
- `qualifier`(최대/최소)는 `amount`와 별도 필드로 유지하고 절대 병합하지 않는다 (`ADR-004`).
- 표준 레코드 스키마는 `docs/specs/2026-07-26-design.md` §5를 그대로 따른다. 필드를 추가하는 것은 허용되나 기존 필드명/의미를 바꾸지 않는다.
- 자동 캡처와 수동 캡처의 산출물은 물리적으로 동일해야 한다 — 대상 페이지의 롱스크롤 이미지 1장 (`ADR-008`). 캡처 함수의 반환 타입은 항상 이 계약을 만족해야 한다.
- 1차 범위는 각 앱의 메인 할인 페이지까지다. 하위 프로모션 페이지(`보러 가기` 이하)는 다루지 않는다 (`ADR-005`).
- 모든 타임스탬프는 `YYYY-MM-DDTHH:MM:SS+09:00` 형식(KST, ISO8601)으로 통일한다.
- 커밋 메시지는 한글로 작성한다 (기존 저장소 관례).

---

## 파일 구조

```
delivery-discount-tracker/
  config/
    target.json              # 대상 주소, 활성 플랫폼별 capture_mode
  config.py                  # load_target_config()
  schema.py                  # validate_record(), 허용값 상수
  store.py                   # append_record(), read_records(), latest_per_brand()
  dashboard.py                # render_dashboard(), write_dashboard()
  dashboard.html              # 생성물 (gitignore)
  tracker.py                  # CLI: append-record / render-dashboard
  capture/
    __init__.py
    common.py                 # adb 래퍼, current_activity(), stitch_frames(), scroll_capture()
    baemin.py                 # capture() -> 롱스크롤 이미지 경로
    coupangeats.py
    ddangyo.py
  parse/
    CONTRACT.md               # 비전 판독 계약(스키마, qualifier 주의사항, 예시)
    manual_template.csv       # 반자동 입력 서식
  data/
    log.jsonl                 # append-only 원장 (gitignore, .gitkeep으로 디렉터리만 유지)
  captures/                   # 캡처 산출물 (gitignore, .gitkeep)
  tests/
    conftest.py
    test_config.py
    test_schema.py
    test_store.py
    test_dashboard.py
    test_tracker.py
    capture/
      test_common.py
```

---

### Task 1: 개발 환경 — Android SDK 헤드리스 에뮬레이터

**Files:**
- Create: `docs/setup/emulator-setup.md`

**Interfaces:**
- Produces: 이후 모든 capture 작업이 전제하는 `adb devices`로 보이는 헤드리스 AVD 1개

- [ ] **Step 1: 사전 확인**

Run: `java -version` (Android SDK cmdline-tools는 JDK 필요)
Expected: JDK 17 이상 출력. 없으면 설치 필요 — 이 단계에서 중단하고 사용자에게 확인.

- [ ] **Step 2: Android SDK cmdline-tools 다운로드 안내 문서 작성**

`docs/setup/emulator-setup.md`에 아래 절차를 그대로 기록한다 (실행은 사용자 승인 후):

```markdown
# 헤드리스 Android 에뮬레이터 설정

1. cmdline-tools 다운로드 (사용자 승인 필요 — 대용량 다운로드)
   https://developer.android.com/studio#command-tools 에서
   "Command line tools only" 받아 `%LOCALAPPDATA%\Android\sdk\cmdline-tools\latest`에 압축 해제

2. 시스템 이미지 + AVD 생성
   sdkmanager --install "platform-tools" "emulator" "system-images;android-34;google_apis;x86_64"
   avdmanager create avd -n discount-tracker -k "system-images;android-34;google_apis;x86_64" -d pixel_6

3. 헤드리스 기동
   emulator -avd discount-tracker -no-window -no-audio -gpu swiftshader_indirect

4. 확인
   adb devices
   # emulator-5554   device 가 보여야 함
```

- [ ] **Step 3: 검증**

Run: `adb devices`
Expected: `emulator-5554	device` (또는 유사한 serial) 한 줄 출력. 안 보이면 Step 2의 emulator 기동 로그를 확인.

- [ ] **Step 4: 커밋**

```bash
cd D:/Dev/delivery-discount-tracker
git add docs/setup/emulator-setup.md
git commit -m "docs: 헤드리스 에뮬레이터 설정 절차 기록"
```

---

### Task 2: 설정 로더 (`config.py`)

**Files:**
- Create: `config/target.json`
- Create: `config.py`
- Test: `tests/test_config.py`

**Interfaces:**
- Produces: `load_target_config(path: pathlib.Path) -> dict` — `{"target_address": str, "platforms": {platform_name: {"capture_mode": "auto"|"manual"}}}`. `ValueError`(필수 키 누락/capture_mode 값 오류) 또는 `FileNotFoundError`(파일 없음)를 던진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_config.py`:
```python
import json
import pytest
from config import load_target_config


def test_load_target_config_valid(tmp_path):
    config_path = tmp_path / "target.json"
    config_path.write_text(
        json.dumps({
            "target_address": "서울특별시 강남구 역삼동 858 강남역",
            "platforms": {"baemin": {"capture_mode": "auto"}},
        }, ensure_ascii=False),
        encoding="utf-8",
    )
    config = load_target_config(config_path)
    assert config["target_address"] == "서울특별시 강남구 역삼동 858 강남역"
    assert config["platforms"]["baemin"]["capture_mode"] == "auto"


def test_load_target_config_missing_required_key(tmp_path):
    config_path = tmp_path / "target.json"
    config_path.write_text(json.dumps({"platforms": {}}), encoding="utf-8")
    with pytest.raises(ValueError):
        load_target_config(config_path)


def test_load_target_config_invalid_capture_mode(tmp_path):
    config_path = tmp_path / "target.json"
    config_path.write_text(
        json.dumps({
            "target_address": "x",
            "platforms": {"baemin": {"capture_mode": "sometimes"}},
        }),
        encoding="utf-8",
    )
    with pytest.raises(ValueError):
        load_target_config(config_path)


def test_load_target_config_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_target_config(tmp_path / "does-not-exist.json")
```

- [ ] **Step 2: 실패 확인**

Run: `pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'config'`

- [ ] **Step 3: 최소 구현**

`config.py`:
```python
import json
from pathlib import Path

REQUIRED_KEYS = {"target_address", "platforms"}
ALLOWED_CAPTURE_MODES = {"auto", "manual"}


def load_target_config(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"config not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        config = json.load(f)

    missing = REQUIRED_KEYS - config.keys()
    if missing:
        raise ValueError(f"target config missing keys: {sorted(missing)}")

    for platform, settings in config["platforms"].items():
        mode = settings.get("capture_mode")
        if mode not in ALLOWED_CAPTURE_MODES:
            raise ValueError(
                f"platform '{platform}' has invalid capture_mode: {mode!r}"
            )

    return config
```

- [ ] **Step 4: 통과 확인**

Run: `pytest tests/test_config.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: 실제 설정 파일 작성**

`config/target.json`:
```json
{
  "target_address": "서울특별시 강남구 역삼동 858 강남역",
  "platforms": {
    "baemin": {"capture_mode": "auto"},
    "coupangeats": {"capture_mode": "auto"},
    "ddangyo": {"capture_mode": "auto"}
  }
}
```

- [ ] **Step 6: 커밋**

```bash
git add config.py config/target.json tests/test_config.py
git commit -m "feat: 대상 설정 로더 추가"
```

---

### Task 3: 표준 레코드 스키마 (`schema.py`)

**Files:**
- Create: `schema.py`
- Test: `tests/test_schema.py`

**Interfaces:**
- Produces: `validate_record(record: dict) -> dict` — 필수 필드 검증 후 선택 필드 기본값을 채운 정규화된 dict를 반환. 유효하지 않으면 `ValueError`.
  - 필수: `platform, brand, raw_text, captured_at, target_address, capture_mode, screenshot_path`
  - 선택(기본값): `page=None, section=None, qualifier=None, amount=None, unit="KRW", scope="brand", offer_type="discount", needs_review=False`
- Consumes: 없음 (최하위 계층)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_schema.py`:
```python
import pytest
from schema import validate_record

BASE = {
    "platform": "coupangeats",
    "brand": "반올림피자",
    "raw_text": "최소 4,000원",
    "captured_at": "2026-07-26T11:20:00+09:00",
    "target_address": "서울특별시 강남구 역삼동 858 강남역",
    "capture_mode": "manual",
    "screenshot_path": "captures/coupangeats/20260726-1120/full.png",
}


def test_validate_record_fills_defaults():
    record = validate_record(dict(BASE))
    assert record["qualifier"] is None
    assert record["amount"] is None
    assert record["unit"] == "KRW"
    assert record["scope"] == "brand"
    assert record["offer_type"] == "discount"
    assert record["needs_review"] is False


def test_validate_record_missing_required_field():
    incomplete = dict(BASE)
    del incomplete["brand"]
    with pytest.raises(ValueError):
        validate_record(incomplete)


def test_validate_record_rejects_unknown_platform():
    bad = dict(BASE, platform="unknown-app")
    with pytest.raises(ValueError):
        validate_record(bad)


def test_validate_record_rejects_invalid_qualifier():
    bad = dict(BASE, qualifier="대략")
    with pytest.raises(ValueError):
        validate_record(bad)


def test_validate_record_preserves_qualifier_distinction():
    # 반올림피자 = 최소, 노랑통닭 = 최대. 서로 다른 값으로 남아야 한다.
    min_record = validate_record(dict(BASE, qualifier="최소", amount=4000))
    max_record = validate_record(dict(
        BASE, brand="노랑통닭", qualifier="최대", amount=7000,
        raw_text="최대 7천원 할인",
    ))
    assert min_record["qualifier"] == "최소"
    assert max_record["qualifier"] == "최대"
    assert min_record["amount"] != max_record["amount"]
```

- [ ] **Step 2: 실패 확인**

Run: `pytest tests/test_schema.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'schema'`

- [ ] **Step 3: 최소 구현**

`schema.py`:
```python
ALLOWED_PLATFORMS = {"baemin", "coupangeats", "yogiyo", "ddangyo", "specialdelivery"}
ALLOWED_QUALIFIERS = {None, "최대", "최소"}
ALLOWED_SCOPES = {"brand", "store"}
ALLOWED_OFFER_TYPES = {"discount", "gift", "coupon", "unknown"}
ALLOWED_CAPTURE_MODES = {"auto", "manual"}

REQUIRED_FIELDS = (
    "platform", "brand", "raw_text", "captured_at",
    "target_address", "capture_mode", "screenshot_path",
)

DEFAULTS = {
    "page": None,
    "section": None,
    "qualifier": None,
    "amount": None,
    "unit": "KRW",
    "scope": "brand",
    "offer_type": "discount",
    "needs_review": False,
}


def validate_record(record: dict) -> dict:
    missing = [f for f in REQUIRED_FIELDS if f not in record]
    if missing:
        raise ValueError(f"record missing required fields: {missing}")

    if record["platform"] not in ALLOWED_PLATFORMS:
        raise ValueError(f"unknown platform: {record['platform']!r}")

    if record["capture_mode"] not in ALLOWED_CAPTURE_MODES:
        raise ValueError(f"invalid capture_mode: {record['capture_mode']!r}")

    normalized = dict(DEFAULTS)
    normalized.update(record)

    if normalized["qualifier"] not in ALLOWED_QUALIFIERS:
        raise ValueError(f"invalid qualifier: {normalized['qualifier']!r}")
    if normalized["scope"] not in ALLOWED_SCOPES:
        raise ValueError(f"invalid scope: {normalized['scope']!r}")
    if normalized["offer_type"] not in ALLOWED_OFFER_TYPES:
        raise ValueError(f"invalid offer_type: {normalized['offer_type']!r}")

    return normalized
```

- [ ] **Step 4: 통과 확인**

Run: `pytest tests/test_schema.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add schema.py tests/test_schema.py
git commit -m "feat: 표준 레코드 스키마 검증 추가"
```

---

### Task 4: append-only 저장소 (`store.py`)

**Files:**
- Create: `store.py`
- Test: `tests/test_store.py`

**Interfaces:**
- Consumes: `schema.validate_record(record: dict) -> dict`
- Produces:
  - `append_record(record: dict, log_path: Path) -> dict`
  - `read_records(log_path: Path) -> list[dict]`
  - `latest_per_brand(records: list[dict]) -> dict[tuple[str, str], dict]` — 키는 `(platform, brand)`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_store.py`:
```python
import json
import pytest
from store import append_record, read_records, latest_per_brand

BASE = {
    "platform": "baemin",
    "brand": "피자헛",
    "raw_text": "10,000원 브랜드 할인",
    "captured_at": "2026-07-26T11:22:00+09:00",
    "target_address": "서울특별시 강남구 역삼동 858 강남역",
    "capture_mode": "manual",
    "screenshot_path": "captures/baemin/20260726-1122/full.png",
    "amount": 10000,
}


def test_append_and_read_round_trip(tmp_path):
    log_path = tmp_path / "log.jsonl"
    append_record(dict(BASE), log_path)
    records = read_records(log_path)
    assert len(records) == 1
    assert records[0]["brand"] == "피자헛"


def test_read_records_missing_file_returns_empty_list(tmp_path):
    assert read_records(tmp_path / "no-such-file.jsonl") == []


def test_append_record_rejects_invalid_without_writing(tmp_path):
    log_path = tmp_path / "log.jsonl"
    invalid = dict(BASE)
    del invalid["brand"]
    with pytest.raises(ValueError):
        append_record(invalid, log_path)
    assert not log_path.exists()


def test_latest_per_brand_picks_most_recent():
    older = dict(BASE, captured_at="2026-07-19T09:00:00+09:00", amount=8000,
                 raw_text="8,000원 브랜드 할인")
    newer = dict(BASE, captured_at="2026-07-26T09:00:00+09:00", amount=10000,
                 raw_text="10,000원 브랜드 할인")
    latest = latest_per_brand([older, newer])
    assert latest[("baemin", "피자헛")]["amount"] == 10000
```

- [ ] **Step 2: 실패 확인**

Run: `pytest tests/test_store.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'store'`

- [ ] **Step 3: 최소 구현**

`store.py`:
```python
import json
from pathlib import Path

from schema import validate_record


def append_record(record: dict, log_path: Path) -> dict:
    normalized = validate_record(record)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(normalized, ensure_ascii=False) + "\n")
    return normalized


def read_records(log_path: Path) -> list[dict]:
    if not log_path.exists():
        return []
    records = []
    with open(log_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def latest_per_brand(records: list[dict]) -> dict:
    latest: dict = {}
    for record in records:
        key = (record["platform"], record["brand"])
        current = latest.get(key)
        if current is None or record["captured_at"] > current["captured_at"]:
            latest[key] = record
    return latest
```

- [ ] **Step 4: 통과 확인**

Run: `pytest tests/test_store.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add store.py tests/test_store.py
git commit -m "feat: append-only 레코드 저장소 추가"
```

---

### Task 5: 대시보드 렌더러 (`dashboard.py`)

**Files:**
- Create: `dashboard.py`
- Test: `tests/test_dashboard.py`

**Interfaces:**
- Consumes: `store.latest_per_brand(records: list[dict]) -> dict[tuple[str, str], dict]`
- Produces: `render_dashboard(records: list[dict]) -> str`, `write_dashboard(records: list[dict], out_path: Path) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_dashboard.py`:
```python
from dashboard import render_dashboard, write_dashboard

MIN_RECORD = {
    "platform": "coupangeats", "brand": "반올림피자",
    "qualifier": "최소", "amount": 4000,
    "raw_text": "최소 4,000원", "captured_at": "2026-07-26T11:20:00+09:00",
    "target_address": "서울특별시 강남구 역삼동 858 강남역",
    "capture_mode": "manual",
    "screenshot_path": "captures/coupangeats/20260726-1120/full.png",
}

MAX_RECORD = {
    "platform": "coupangeats", "brand": "노랑통닭",
    "qualifier": "최대", "amount": 7000,
    "raw_text": "최대 7천원 할인", "captured_at": "2026-07-26T11:20:00+09:00",
    "target_address": "서울특별시 강남구 역삼동 858 강남역",
    "capture_mode": "manual",
    "screenshot_path": "captures/coupangeats/20260726-1120/full.png",
}

REVIEW_RECORD = {
    "platform": "ddangyo", "brand": "BBQ",
    "qualifier": None, "amount": None,
    "raw_text": "한정판 굿즈 증정! +4천원 쿠폰까지!",
    "captured_at": "2026-07-26T11:24:00+09:00",
    "target_address": "서울특별시 강남구 역삼동 858 강남역",
    "capture_mode": "manual",
    "screenshot_path": "captures/ddangyo/20260726-1124/full.png",
    "offer_type": "gift", "needs_review": True,
}


def test_render_dashboard_preserves_qualifier_distinction():
    html = render_dashboard([MIN_RECORD, MAX_RECORD])
    assert "최소 4,000원" in html
    assert "최대 7,000원" in html


def test_render_dashboard_flags_needs_review():
    html = render_dashboard([REVIEW_RECORD])
    assert "needs-review" in html
    assert "한정판 굿즈 증정" in html


def test_write_dashboard_creates_file(tmp_path):
    out_path = tmp_path / "dashboard.html"
    write_dashboard([MIN_RECORD], out_path)
    assert out_path.exists()
    assert "반올림피자" in out_path.read_text(encoding="utf-8")
```

- [ ] **Step 2: 실패 확인**

Run: `pytest tests/test_dashboard.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dashboard'`

- [ ] **Step 3: 최소 구현**

`dashboard.py`:
```python
from pathlib import Path

from store import latest_per_brand


def _format_amount(record: dict) -> str:
    amount = record.get("amount")
    if amount is None:
        return record["raw_text"]
    qualifier = record.get("qualifier") or ""
    return f"{qualifier} {amount:,}원".strip()


def render_dashboard(records: list[dict]) -> str:
    latest = latest_per_brand(records)
    rows = []
    for (platform, brand), record in sorted(latest.items()):
        review_class = ' class="needs-review"' if record.get("needs_review") else ""
        rows.append(
            f"<tr{review_class}>"
            f"<td>{platform}</td><td>{brand}</td>"
            f"<td>{_format_amount(record)}</td>"
            f"<td>{record['raw_text']}</td>"
            f"<td>{record['captured_at']}</td>"
            f"</tr>"
        )
    body = "\n".join(rows)
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        "<title>배달앱 브랜드할인 대시보드</title></head><body>"
        "<table><thead><tr>"
        "<th>플랫폼</th><th>브랜드</th><th>할인</th><th>원문</th><th>수집시각</th>"
        f"</tr></thead><tbody>{body}</tbody></table>"
        "</body></html>"
    )


def write_dashboard(records: list[dict], out_path: Path) -> None:
    html = render_dashboard(records)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
```

- [ ] **Step 4: 통과 확인**

Run: `pytest tests/test_dashboard.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add dashboard.py tests/test_dashboard.py
git commit -m "feat: 정적 대시보드 렌더러 추가"
```

---

### Task 6: CLI 진입점 (`tracker.py`)

**Files:**
- Create: `tracker.py`
- Test: `tests/test_tracker.py`

**Interfaces:**
- Consumes: `store.append_record`, `store.read_records`, `dashboard.write_dashboard`
- Produces: `cmd_append_record(record_json: str) -> dict`, `cmd_render_dashboard() -> Path`, CLI 서브커맨드 `append-record`, `render-dashboard`
- 모듈 전역 `LOG_PATH`, `DASHBOARD_PATH` (테스트에서 monkeypatch로 교체 가능해야 함 — 함수 본문에서 매 호출 시 전역을 참조해야 하며 기본 인자로 캡처하면 안 됨)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_tracker.py`:
```python
import json
import subprocess
import sys

import tracker


def test_cmd_append_record_writes_valid_line(tmp_path, monkeypatch):
    monkeypatch.setattr(tracker, "LOG_PATH", tmp_path / "log.jsonl")
    record = {
        "platform": "baemin", "brand": "피자헛",
        "raw_text": "10,000원 브랜드 할인",
        "captured_at": "2026-07-26T11:22:00+09:00",
        "target_address": "서울특별시 강남구 역삼동 858 강남역",
        "capture_mode": "manual",
        "screenshot_path": "captures/baemin/20260726-1122/full.png",
        "amount": 10000,
    }
    tracker.cmd_append_record(json.dumps(record, ensure_ascii=False))
    lines = tracker.LOG_PATH.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["brand"] == "피자헛"


def test_cmd_render_dashboard_writes_html(tmp_path, monkeypatch):
    monkeypatch.setattr(tracker, "LOG_PATH", tmp_path / "log.jsonl")
    monkeypatch.setattr(tracker, "DASHBOARD_PATH", tmp_path / "dashboard.html")
    record = {
        "platform": "baemin", "brand": "피자헛",
        "raw_text": "10,000원 브랜드 할인",
        "captured_at": "2026-07-26T11:22:00+09:00",
        "target_address": "서울특별시 강남구 역삼동 858 강남역",
        "capture_mode": "manual",
        "screenshot_path": "captures/baemin/20260726-1122/full.png",
        "amount": 10000,
    }
    tracker.cmd_append_record(json.dumps(record, ensure_ascii=False))
    result_path = tracker.cmd_render_dashboard()
    assert result_path.exists()
    assert "피자헛" in result_path.read_text(encoding="utf-8")


def test_cli_invocation_smoke(tmp_path):
    env_record = {
        "platform": "baemin", "brand": "피자헛",
        "raw_text": "10,000원 브랜드 할인",
        "captured_at": "2026-07-26T11:22:00+09:00",
        "target_address": "서울특별시 강남구 역삼동 858 강남역",
        "capture_mode": "manual",
        "screenshot_path": "captures/baemin/20260726-1122/full.png",
        "amount": 10000,
    }
    result = subprocess.run(
        [sys.executable, "tracker.py", "append-record", json.dumps(env_record, ensure_ascii=False)],
        capture_output=True, text=True, cwd=tmp_path.parent.parent,
    )
    assert result.returncode == 0
```

- [ ] **Step 2: 실패 확인**

Run: `pytest tests/test_tracker.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tracker'`

- [ ] **Step 3: 최소 구현**

`tracker.py`:
```python
import argparse
import json
import sys
from pathlib import Path

from store import append_record, read_records
from dashboard import write_dashboard

LOG_PATH = Path(__file__).parent / "data" / "log.jsonl"
DASHBOARD_PATH = Path(__file__).parent / "dashboard.html"


def cmd_append_record(record_json: str) -> dict:
    record = json.loads(record_json)
    return append_record(record, LOG_PATH)


def cmd_render_dashboard() -> Path:
    records = read_records(LOG_PATH)
    write_dashboard(records, DASHBOARD_PATH)
    return DASHBOARD_PATH


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="tracker")
    subparsers = parser.add_subparsers(dest="command", required=True)

    append_parser = subparsers.add_parser("append-record")
    append_parser.add_argument("record_json")

    subparsers.add_parser("render-dashboard")

    args = parser.parse_args(argv)

    if args.command == "append-record":
        cmd_append_record(args.record_json)
    elif args.command == "render-dashboard":
        path = cmd_render_dashboard()
        print(f"dashboard written to {path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 통과 확인**

Run: `pytest tests/test_tracker.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add tracker.py tests/test_tracker.py
git commit -m "feat: tracker CLI 진입점 추가 (append-record, render-dashboard)"
```

---

### Task 7: 캡처 공통 헬퍼 (`capture/common.py`)

**Files:**
- Create: `capture/__init__.py` (빈 파일)
- Create: `capture/common.py`
- Test: `tests/capture/test_common.py`

**Interfaces:**
- Produces:
  - `run_adb(serial: str, *args: str) -> bytes`
  - `screenshot(serial: str) -> PIL.Image.Image`
  - `swipe_up(serial: str, x: int, y_start: int, y_end: int, duration_ms: int = 300) -> None`
  - `current_activity(serial: str) -> str`
  - `stitch_frames(frames: list[PIL.Image.Image], overlap_px: int) -> PIL.Image.Image`
  - `scroll_capture(serial, tap_x, swipe_y_start, swipe_y_end, overlap_px, max_frames=30) -> PIL.Image.Image`
- **주의**: `screenshot`/`swipe_up`/`current_activity`/`scroll_capture`는 실제 기기가 있어야 동작한다. 이 태스크의 자동 테스트는 `run_adb`를 monkeypatch로 대체해 순수 로직(파싱, 스티칭)만 검증한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/capture/test_common.py`:
```python
from PIL import Image

from capture.common import current_activity, stitch_frames


def test_current_activity_parses_dumpsys_output(monkeypatch):
    sample_output = (
        b"WINDOW MANAGER FOCUS\n"
        b"  mCurrentFocus=Window{a1b2c3d4 u0 com.baemin.presentation/"
        b"com.baemin.presentation.brand.BrandActivity}\n"
    )
    monkeypatch.setattr(
        "capture.common.run_adb",
        lambda serial, *args: sample_output,
    )
    activity = current_activity("emulator-5554")
    assert activity == "com.baemin.presentation/com.baemin.presentation.brand.BrandActivity"


def test_current_activity_raises_when_unparseable(monkeypatch):
    monkeypatch.setattr("capture.common.run_adb", lambda serial, *args: b"no match here")
    import pytest
    with pytest.raises(RuntimeError):
        current_activity("emulator-5554")


def test_stitch_frames_concatenates_with_overlap_trim():
    frame1 = Image.new("RGB", (100, 300), "red")
    frame2 = Image.new("RGB", (100, 300), "blue")
    stitched = stitch_frames([frame1, frame2], overlap_px=50)
    assert stitched.size == (100, 300 + (300 - 50))
    assert stitched.getpixel((50, 10)) == (255, 0, 0)
    assert stitched.getpixel((50, 290)) == (0, 0, 255)


def test_stitch_frames_single_frame_passthrough():
    frame = Image.new("RGB", (100, 300), "green")
    stitched = stitch_frames([frame], overlap_px=50)
    assert stitched.size == (100, 300)
```

- [ ] **Step 2: 실패 확인**

Run: `pytest tests/capture/test_common.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'capture'`

- [ ] **Step 3: 최소 구현**

`capture/__init__.py`: (빈 파일)

`capture/common.py`:
```python
import re
import subprocess
import time
from io import BytesIO

from PIL import Image

ACTIVITY_RE = re.compile(r"mCurrentFocus=Window\{[^ ]+ [^ ]+ ([^\}]+)\}")


def run_adb(serial: str, *args: str) -> bytes:
    result = subprocess.run(
        ["adb", "-s", serial, *args], capture_output=True, check=True
    )
    return result.stdout


def screenshot(serial: str) -> Image.Image:
    raw = run_adb(serial, "exec-out", "screencap", "-p")
    return Image.open(BytesIO(raw)).convert("RGB")


def swipe_up(serial: str, x: int, y_start: int, y_end: int, duration_ms: int = 300) -> None:
    run_adb(serial, "shell", "input", "swipe", str(x), str(y_start), str(x), str(y_end), str(duration_ms))
    time.sleep(0.5)


def current_activity(serial: str) -> str:
    output = run_adb(serial, "shell", "dumpsys", "window").decode("utf-8", errors="replace")
    match = ACTIVITY_RE.search(output)
    if not match:
        raise RuntimeError("could not determine current activity from dumpsys window output")
    return match.group(1)


def stitch_frames(frames: list, overlap_px: int) -> Image.Image:
    if not frames:
        raise ValueError("stitch_frames requires at least one frame")

    width = frames[0].width
    total_height = frames[0].height + sum(f.height - overlap_px for f in frames[1:])
    stitched = Image.new("RGB", (width, total_height), "white")
    stitched.paste(frames[0], (0, 0))

    y_offset = frames[0].height
    for frame in frames[1:]:
        cropped = frame.crop((0, overlap_px, frame.width, frame.height))
        stitched.paste(cropped, (0, y_offset))
        y_offset += cropped.height

    return stitched


def _frames_equal(a: Image.Image, b: Image.Image) -> bool:
    return a.tobytes() == b.tobytes()


def scroll_capture(serial: str, tap_x: int, swipe_y_start: int, swipe_y_end: int,
                    overlap_px: int, max_frames: int = 30) -> Image.Image:
    # ponytail: overlap_px는 앱별로 실측 보정하는 캘리브레이션 값이다.
    # 픽셀 단위로 완벽히 정렬되지 않으면 앱별 상수를 조정한다.
    frames = [screenshot(serial)]
    for _ in range(max_frames - 1):
        swipe_up(serial, tap_x, swipe_y_start, swipe_y_end)
        next_frame = screenshot(serial)
        if _frames_equal(next_frame, frames[-1]):
            break
        frames.append(next_frame)
    return stitch_frames(frames, overlap_px)
```

- [ ] **Step 4: 통과 확인**

Run: `pytest tests/capture/test_common.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add capture/__init__.py capture/common.py tests/capture/test_common.py
git commit -m "feat: adb 캡처 공통 헬퍼 추가 (활동 확인, 스티칭)"
```

---

### Task 8: 배달의민족 캡처 (`capture/baemin.py`)

**선행 조건**: Task 1의 에뮬레이터가 떠 있고, 배달의민족 앱이 설치·로그인되어 있어야 한다(사용자가 직접 수행, `docs/specs/2026-07-26-design.md` §8).

**Files:**
- Create: `capture/baemin.py`
- Modify: `docs/setup/emulator-setup.md` (발견한 상수 기록)

**Interfaces:**
- Consumes: `capture.common.{screenshot, swipe_up, current_activity, scroll_capture, run_adb}`
- Produces: `capture(serial: str, out_dir: Path) -> Path` — 롱스크롤 이미지를 `out_dir/full.png`로 저장하고 그 경로를 반환. 목표 화면 진입에 실패하면 `RuntimeError("capture_failed: baemin")`.

- [ ] **Step 1: 대상 화면 진입 경로 실측 (수동, 1회)**

에뮬레이터에서 배달의민족 앱을 열고 `브랜드관 → 오늘의 할인 탭 → 가까운 가게만 보기 체크`까지 수동으로 이동한 뒤:

```bash
adb shell dumpsys window | grep mCurrentFocus
```

출력된 액티비티 이름을 기록한다. 그다음 각 탭 지점에서:

```bash
adb shell screencap -p /sdcard/tap-point.png && adb pull /sdcard/tap-point.png .
```

스크린샷을 열어 눌러야 할 지점의 픽셀 좌표를 읽는다 (배민 앱의 홈 화면 → 검색/혜택 아이콘 → 브랜드관 배너 → 오늘의 할인 탭 → 가까운 가게만 보기 체크박스, 총 4곳).

- [ ] **Step 2: 실측값을 상수로 기록**

`docs/setup/emulator-setup.md`에 아래 형식으로 추가 (실측값으로 채움):

```markdown
## 배달의민족 좌표 (해상도: <adb shell wm size 출력값>)

- BAEMIN_TARGET_ACTIVITY = "<Step 1에서 확인한 값>"
- BAEMIN_HOME_TO_BENEFIT_TAP = (x, y)
- BAEMIN_BRAND_HALL_BANNER_TAP = (x, y)
- BAEMIN_TODAY_DISCOUNT_TAB_TAP = (x, y)
- BAEMIN_NEARBY_ONLY_CHECKBOX_TAP = (x, y)
- BAEMIN_OVERLAP_PX = <스크롤 두 프레임을 비교해 실측한 겹침 픽셀 수>
```

- [ ] **Step 3: 구현**

`capture/baemin.py` (아래 `<...>`는 Step 2에서 기록한 실측값으로 채운다):
```python
from pathlib import Path

from capture.common import current_activity, run_adb, scroll_capture

TARGET_ACTIVITY = "<Step 2에서 기록한 값>"
NAV_TAPS = [
    (0, 0),  # <BAEMIN_HOME_TO_BENEFIT_TAP>
    (0, 0),  # <BAEMIN_BRAND_HALL_BANNER_TAP>
    (0, 0),  # <BAEMIN_TODAY_DISCOUNT_TAB_TAP>
    (0, 0),  # <BAEMIN_NEARBY_ONLY_CHECKBOX_TAP>
]
OVERLAP_PX = 0  # <BAEMIN_OVERLAP_PX>
SCROLL_TAP_X = 0
SCROLL_Y_START = 0
SCROLL_Y_END = 0


def _launch(serial: str) -> None:
    run_adb(serial, "shell", "monkey", "-p", "com.baemin.presentation", "-c",
            "android.intent.category.LAUNCHER", "1")


def _navigate_to_target(serial: str) -> None:
    for x, y in NAV_TAPS:
        run_adb(serial, "shell", "input", "tap", str(x), str(y))


def capture(serial: str, out_dir: Path) -> Path:
    _launch(serial)
    _navigate_to_target(serial)

    if current_activity(serial) != TARGET_ACTIVITY:
        raise RuntimeError("capture_failed: baemin")

    image = scroll_capture(
        serial, SCROLL_TAP_X, SCROLL_Y_START, SCROLL_Y_END, OVERLAP_PX,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "full.png"
    image.save(out_path)
    return out_path
```

- [ ] **Step 4: 실기 검증 (수동)**

Run: `python -c "from pathlib import Path; from capture.baemin import capture; print(capture('emulator-5554', Path('captures/baemin/manual-check')))"`
Expected: `captures/baemin/manual-check/full.png` 생성. 이미지를 열어 `ref/delivery/baemin.jpg`와 같은 형태(브랜드 카드 세로 나열)인지 육안 확인.

- [ ] **Step 5: 커밋**

```bash
git add capture/baemin.py docs/setup/emulator-setup.md
git commit -m "feat: 배달의민족 브랜드관 캡처 구현"
```

---

### Task 9: 쿠팡이츠 캡처 (`capture/coupangeats.py`)

**선행 조건**: 쿠팡이츠 앱 설치·로그인 완료.

**Files:**
- Create: `capture/coupangeats.py`
- Modify: `docs/setup/emulator-setup.md`

**Interfaces:** Task 8과 동일한 형태 — `capture(serial: str, out_dir: Path) -> Path`

- [ ] **Step 1: 대상 화면 진입 경로 실측 (수동)**

Task 8-Step 1과 동일한 절차를 쿠팡이츠 앱의 `와우컬렉션` 화면에 대해 반복한다. 쿠팡이츠는 WebView 기반이므로(`ADR-003` 근거), `current_activity()`는 WebView를 감싼 액티비티 이름까지만 확인 가능함에 유의 — 화면 내부 콘텐츠 검증은 이 단계의 책임이 아니다.

- [ ] **Step 2: 실측값 기록**

`docs/setup/emulator-setup.md`에 `COUPANGEATS_*` 상수 추가 (Task 8-Step 2와 동일 형식).

- [ ] **Step 3: 구현**

`capture/coupangeats.py` — Task 8의 `capture/baemin.py`와 동일한 구조로, 패키지명(`com.coupang.mobile.eats` 등 실제 확인값)과 `NAV_TAPS`, `TARGET_ACTIVITY`, `OVERLAP_PX`만 쿠팡이츠 값으로 교체한다.

```python
from pathlib import Path

from capture.common import current_activity, run_adb, scroll_capture

TARGET_ACTIVITY = "<Step 2에서 기록한 값>"
NAV_TAPS = [
    (0, 0),
    (0, 0),
]
OVERLAP_PX = 0
SCROLL_TAP_X = 0
SCROLL_Y_START = 0
SCROLL_Y_END = 0


def _launch(serial: str) -> None:
    run_adb(serial, "shell", "monkey", "-p", "<실제 패키지명>", "-c",
            "android.intent.category.LAUNCHER", "1")


def _navigate_to_target(serial: str) -> None:
    for x, y in NAV_TAPS:
        run_adb(serial, "shell", "input", "tap", str(x), str(y))


def capture(serial: str, out_dir: Path) -> Path:
    _launch(serial)
    _navigate_to_target(serial)

    if current_activity(serial) != TARGET_ACTIVITY:
        raise RuntimeError("capture_failed: coupangeats")

    image = scroll_capture(
        serial, SCROLL_TAP_X, SCROLL_Y_START, SCROLL_Y_END, OVERLAP_PX,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "full.png"
    image.save(out_path)
    return out_path
```

- [ ] **Step 4: 실기 검증 (수동)**

Task 8-Step 4와 동일 절차. 결과 이미지를 `ref/delivery/coupangeats.jpg`와 비교.

- [ ] **Step 5: 커밋**

```bash
git add capture/coupangeats.py docs/setup/emulator-setup.md
git commit -m "feat: 쿠팡이츠 와우컬렉션 캡처 구현"
```

---

### Task 10: 땡겨요 캡처 (`capture/ddangyo.py`)

**선행 조건**: 땡겨요 앱 설치·로그인 완료.

**Files:**
- Create: `capture/ddangyo.py`
- Modify: `docs/setup/emulator-setup.md`

**Interfaces:** Task 8과 동일한 형태 — `capture(serial: str, out_dir: Path) -> Path`

- [ ] **Step 1~3**: Task 9와 동일한 절차·구조를 `오늘 땡길만한 브랜드` 화면에 적용한다. 파일명은 `capture/ddangyo.py`, 상수는 `DDANGYO_*`.

땡겨요는 화면 전체가 이미지 배너다(`docs/specs/2026-07-26-design.md` §3.1). 캡처 자체는 다른 앱과 동일하지만, **이 앱은 판독 단계에서 저비용 교차검증 수단이 없다**(명세 §6.2) — 판독 정확도 문제가 생기면 반자동 전환 1순위임을 `capture/ddangyo.py` 모듈 docstring에 기록한다:

```python
"""땡겨요 '오늘 땡길만한 브랜드' 캡처.

화면 전체가 이미지 배너라 텍스트 기반 교차검증 수단이 없다.
판독 오류가 잦아지면 ADR-008 절차에 따라 이 플랫폼만 우선 수동 전환한다.
"""
```

- [ ] **Step 4: 실기 검증 (수동)**

Task 8-Step 4와 동일 절차. 결과 이미지를 `ref/delivery/ddangeyo.jpg`와 비교.

- [ ] **Step 5: 커밋**

```bash
git add capture/ddangyo.py docs/setup/emulator-setup.md
git commit -m "feat: 땡겨요 오늘 땡길만한 브랜드 캡처 구현"
```

---

### Task 11: 판독 계약 및 반자동 서식 (`parse/CONTRACT.md`, `parse/manual_template.csv`)

**Files:**
- Create: `parse/CONTRACT.md`
- Create: `parse/manual_template.csv`

**Interfaces:**
- Produces: 판독 수행자(자동=Claude 비전 세션, 수동=사람)가 따라야 할 유일한 문서. 산출물은 항상 Task 3의 `validate_record`가 받아들이는 dict.

- [ ] **Step 1: 판독 계약 작성**

`parse/CONTRACT.md`:
```markdown
# 판독 계약

캡처된 롱스크롤 이미지(`captures/<platform>/<timestamp>/full.png`)를 읽고
아래 스키마의 레코드를 브랜드 카드 하나당 하나씩 만든다. 이 계약은
자동(비전)과 수동(사람) 모두에게 동일하게 적용된다.

## 절차

1. 이미지에서 브랜드 데이터 카드만 추출한다. 순수 프로모션 이미지 타일
   (예: `WOW! 와우 컬렉션`, `이츠셰프컬렉션 보러 가기`)은 브랜드가 아니므로
   레코드를 만들지 않는다.
2. 카드마다 다음을 읽는다: 브랜드명, 섹션 제목(카드가 속한 소제목, 예:
   `인기 브랜드 할인`), 할인 문구 원문.
3. 할인 문구에서 `qualifier`(`최대`/`최소`/없음)와 숫자를 분리한다.
   **주의**: `최대`/`최소`는 큰 숫자 옆에 아주 작게 붙어 있어 놓치기 쉽다.
   반드시 원문을 다시 확인한다.
4. 할인이 아니라 사은품/굿즈 형태면(`ADR-004` 예시: "한정판 굿즈 증정!")
   `amount`를 비워두고 `offer_type: "gift"`, `needs_review: true`로 남긴다.
5. 어떤 형태인지 판단이 서지 않으면 억지로 분류하지 말고
   `offer_type: "unknown"`, `needs_review: true`로 남긴다.

## 출력 레코드 스키마

`docs/specs/2026-07-26-design.md` §5와 동일. 다음 필드는 판독 시점에 채운다:

| 필드 | 채우는 방법 |
|---|---|
| `platform` | 캡처 대상 앱 |
| `page` | 예: `"브랜드관 > 오늘의 할인"` |
| `section` | 화면에 보이는 섹션 제목 그대로 (`ADR-006`) |
| `brand` | 카드의 브랜드명 |
| `qualifier` | `"최대"` / `"최소"` / `null` |
| `amount` | 정수(원). 정액이 아니면 `null` |
| `raw_text` | 할인 문구 원문 그대로 |
| `scope` | 브랜드 카드는 항상 `"brand"` |
| `offer_type` | `"discount"` / `"gift"` / `"coupon"` / `"unknown"` |
| `needs_review` | 애매하면 `true` |
| `captured_at`, `target_address`, `capture_mode`, `screenshot_path` | 캡처 메타데이터에서 그대로 가져옴 |

## 검증된 예시 (회귀 확인용, `ref/delivery/coupangeats.jpg`)

```json
{"platform": "coupangeats", "section": "피자 브랜드 할인", "brand": "반올림피자",
 "qualifier": "최소", "amount": 4000, "raw_text": "최소 4,000원",
 "scope": "brand", "offer_type": "discount", "needs_review": false}
```

```json
{"platform": "ddangyo", "section": "전체", "brand": "BBQ",
 "qualifier": null, "amount": null,
 "raw_text": "BBQ 필릭스 PICK 주문 시, 한정판 굿즈 증정! +4천원 쿠폰까지!",
 "scope": "brand", "offer_type": "gift", "needs_review": true}
```
```

- [ ] **Step 2: 반자동 서식 작성**

`parse/manual_template.csv`:
```csv
platform,page,section,brand,qualifier,amount,raw_text,scope,offer_type,needs_review,target_address,captured_at,capture_mode,screenshot_path
```

- [ ] **Step 3: 계약 검증 — 실물 이미지로 수동 드라이런**

`ref/delivery/coupangeats.jpg`를 열어 계약 절차대로 5개 카드를 직접 판독하고, 위 "검증된 예시"와 일치하는지 확인한다. 이 태스크는 코드가 아니므로 자동 테스트 대신 이 드라이런이 검증 역할을 한다.

- [ ] **Step 4: 커밋**

```bash
git add parse/CONTRACT.md parse/manual_template.csv
git commit -m "docs: 판독 계약 및 반자동 서식 추가"
```

---

### Task 12: 엔드투엔드 통합 및 gitignore 정리

**Files:**
- Create: `.gitignore`
- Create: `captures/.gitkeep`, `data/.gitkeep`
- Modify: `README.md` (실행 방법 절 추가)

**Interfaces:**
- Consumes: Task 2~11 전체
- Produces: 사람이 따라 할 수 있는 "1회 실행" 절차 — 이 프로젝트의 1차 완료 기준

- [ ] **Step 1: gitignore 추가**

`.gitignore`:
```gitignore
data/*.jsonl
!data/.gitkeep
captures/*
!captures/.gitkeep
dashboard.html
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 2: 디렉터리 유지 파일 생성**

```bash
mkdir -p captures data
touch captures/.gitkeep data/.gitkeep
```

- [ ] **Step 3: 전체 테스트 통과 확인**

Run: `pytest -v`
Expected: Task 2~11에서 작성한 모든 테스트 PASS (config 4 + schema 5 + store 4 + dashboard 3 + tracker 3 + capture/common 4 = 23개)

- [ ] **Step 4: README에 실행 절차 추가**

`README.md`에 다음 절을 추가한다 (기존 내용 하단에):

```markdown
## 1회 실행 절차 (수동, 자동 스케줄링 이전 단계)

1. 에뮬레이터 기동: `emulator -avd discount-tracker -no-window -no-audio -gpu swiftshader_indirect`
2. 각 앱 캡처:
   ```bash
   python -c "from pathlib import Path; from capture.baemin import capture; capture('emulator-5554', Path('captures/baemin/latest'))"
   python -c "from pathlib import Path; from capture.coupangeats import capture; capture('emulator-5554', Path('captures/coupangeats/latest'))"
   python -c "from pathlib import Path; from capture.ddangyo import capture; capture('emulator-5554', Path('captures/ddangyo/latest'))"
   ```
3. `parse/CONTRACT.md` 절차대로 각 `captures/<platform>/latest/full.png`를 판독해 레코드 JSON을 만든다 (이 단계는 Claude 세션이 이미지를 직접 읽고 수행한다).
4. 레코드마다: `python tracker.py append-record '<레코드 JSON>'`
5. `python tracker.py render-dashboard`
6. `dashboard.html`을 브라우저로 연다.

특정 앱의 판독 정확도가 불안하면 `config/target.json`에서 해당 플랫폼의
`capture_mode`를 `manual`로 바꾸고, `captures/<platform>/<timestamp>/full.png`에
폰 스크롤 캡처 결과를 직접 넣어준다 (`ADR-008`). 3~6단계는 그대로 적용된다.
```

- [ ] **Step 5: 커밋**

```bash
git add .gitignore captures/.gitkeep data/.gitkeep README.md
git commit -m "chore: gitignore 정리 및 1회 실행 절차 문서화"
```

---

## Self-Review 메모

- **스펙 커버리지**: §3(대상 화면 실측) → Task 8~10, §4(아키텍처) → Task 3~7, §5(스키마) → Task 3, §6(비용 지도) → Task 10 docstring + README, §7(반자동) → Task 12 Step 4 + ADR-008 참조, §8(실행환경) → Task 1, §9(오류 처리) → `current_activity` 헬스체크(Task 7~10), §10(범위) → 배민/쿠팡/땡겨요만 포함, 요기요·배달특급·하위페이지·알림 제외 확인, §11(검증) → 결정론적 부분은 pytest, 판독은 Task 11 Step 3 드라이런.
- **타입 일관성**: `validate_record`가 정의한 필드명(`qualifier`, `amount`, `raw_text`, `needs_review` 등)을 Task 4(store), 5(dashboard), 6(tracker), 11(CONTRACT.md)에서 동일하게 사용하는지 확인함 — 일치.
- **플레이스홀더 스캔**: Task 8~10의 좌표/액티비티명은 실기 없이 결정할 수 없는 값이라 `<...>` 표기로 남겼으나, 각각 정확히 어떤 명령으로 실측하는지 Step 1~2에 완전한 절차를 명시함 — "나중에 채워라"가 아니라 "이 명령을 실행해서 채워라".
