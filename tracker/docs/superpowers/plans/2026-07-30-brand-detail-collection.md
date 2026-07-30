# 브랜드별 쿠폰 상세 수집 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배민·땡겨요 브랜드관에서 브랜드별 쿠폰 상세 화면을 자동으로 열어
캡처하는 함수를 만든다 — 최소주문금액·중복쿠폰 판독의 원본 이미지를
사람이 일일이 탭하지 않고 모은다.

**Architecture:** `capture/common.py`에 화면 판별 없이 쓸 수 있는 저수준
헬퍼(뷰 트리에서 접두어로 노드 찾기, 큰 클릭 가능 블록 목록화, 중앙 탭,
뒤로가기+검증)를 추가한다. 그 위에 배민은 브랜드명으로 타겟팅
(`capture/baemin.py`), 땡겨요는 전수 순회(`capture/ddangyo.py`, 신규)로
갈라 쌓는다. 우선순위 브랜드 목록은 원장에서 매번 다시 뽑는다
(`store.py`). 산출물은 스크린샷까지 — 판독(비전)은 기존처럼 별도.

**Tech Stack:** Python, `adb` CLI, Pillow(PIL) — 기존 `capture/` 패키지와
동일. 새 의존성 없음.

## Global Constraints

- 기기 없이도 `python -m pytest`가 통과해야 한다 — adb를 실제로 부르는
  코드는 전부 monkeypatch로 목업한다(`tests/capture/test_common.py` 기존
  패턴 그대로 따름).
- 좌표를 하드코딩하지 않는다 — 뷰 트리(`dump_ui`/`find_node_bounds`류)로
  찾는다. 기존 `capture/common.py`·`capture/baemin.py`의 원칙(ADR-009,
  ADR-011 근거) 그대로 유지.
- 이 파이프라인은 캡처까지만 한다. 브랜드 식별·금액 판독·원장 기록은
  기존 수동 흐름(비전이 이미지를 읽고 `tracker.py append-record`) 그대로
  — 이번 작업으로 그 경로를 바꾸지 않는다.
- 쿠팡이츠·요기요는 이번 범위 밖. 캐러셀(다중 쿠폰) 자동 스와이프도
  범위 밖 — 보이는 것만 캡처.

---

## Task 1: `find_node_bounds_by_text_prefix` — 접두어로 노드 찾기

배민 카드는 `text="훌랄라참숯바베큐치킨, 가까운 가게 있음, ..."`처럼
브랜드명 뒤에 부가 설명이 줄줄이 붙어 있어 정확히 일치시킬 수 없다.
기존 `find_node_bounds`는 완전 일치만 지원하므로 접두어 검색이 필요하다.

**Files:**
- Modify: `capture/common.py` (파일 끝에 함수 추가)
- Test: `tests/capture/test_common.py` (파일 끝에 테스트 추가)

**Interfaces:**
- Produces: `find_node_bounds_by_text_prefix(xml: str, prefix: str) -> tuple[int, int, int, int]` — 못 찾으면 `RuntimeError`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/capture/test_common.py` 끝에 추가:

```python
def test_find_node_bounds_by_text_prefix():
    from capture.common import find_node_bounds_by_text_prefix
    xml = (
        '<?xml version="1.0"?><hierarchy>'
        '<node class="android.widget.Button" text="훌랄라참숯바베큐치킨, 가까운 가게 있음, 12,100원 브랜드 할인"'
        ' clickable="true" bounds="[36,766][1042,1354]" />'
        '<node class="android.widget.Button" text="피자헛, 최대 11,000원 할인"'
        ' clickable="true" bounds="[36,1400][1042,1988]" />'
        '</hierarchy>'
    )
    assert find_node_bounds_by_text_prefix(xml, "훌랄라참숯바베큐치킨, ") == (36, 766, 1042, 1354)
    assert find_node_bounds_by_text_prefix(xml, "피자헛, ") == (36, 1400, 1042, 1988)


def test_find_node_bounds_by_text_prefix_raises_when_absent():
    from capture.common import find_node_bounds_by_text_prefix
    xml = '<?xml version="1.0"?><hierarchy></hierarchy>'
    with pytest.raises(RuntimeError):
        find_node_bounds_by_text_prefix(xml, "없는 브랜드, ")
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `python -m pytest tests/capture/test_common.py -k text_prefix -v`
Expected: FAIL — `ImportError` 또는 `cannot import name 'find_node_bounds_by_text_prefix'`

- [ ] **Step 3: 최소 구현 작성**

`capture/common.py` 파일 끝(`scroll_capture` 함수 뒤)에 추가:

```python
def find_node_bounds_by_text_prefix(xml: str, prefix: str) -> tuple[int, int, int, int]:
    """text 속성이 prefix로 시작하는 첫 노드의 bounds.

    카드 전체 설명이 "브랜드명, 부가설명..." 식으로 한 text 속성에 다
    이어져 있어 find_node_bounds의 완전 일치로는 못 잡는다.
    """
    marker = f'text="{prefix}'
    for node in NODE_RE.findall(xml):
        if marker in node:
            bounds = BOUNDS_RE.search(node)
            if bounds:
                return tuple(int(v) for v in bounds.groups())
    raise RuntimeError(f"뷰 트리에서 '{prefix}'로 시작하는 노드를 찾지 못했다")
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest tests/capture/test_common.py -k text_prefix -v`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git add capture/common.py tests/capture/test_common.py
git commit -m "feat: 뷰 트리에서 텍스트 접두어로 노드 찾는 헬퍼 추가"
```

---

## Task 2: `find_card_bounds` — 카드형 클릭 가능 블록 목록화

땡겨요 카드는 텍스트가 전혀 없다(실측 확인). 대신 `clickable="true"
focusable="false"`이고 충분히 큰 블록이 카드다 — 실기에서 잰 실제 값:
카테고리 아이콘은 `[13,73][118,178]`(105×105), 브랜드 카드는
`[49,336][1029,687]`(980×351) 등. 최소 크기로 걸러 카드만 남긴다.

**Files:**
- Modify: `capture/common.py`
- Test: `tests/capture/test_common.py`

**Interfaces:**
- Produces: `find_card_bounds(xml: str, min_width: int = 400, min_height: int = 200) -> list[tuple[int, int, int, int]]` — 문서 순서(=화면에 위에서 아래로 뜨는 순서) 그대로 반환

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_find_card_bounds_filters_by_size():
    from capture.common import find_card_bounds
    # 실기(땡겨요 브랜드관)에서 실측한 값 축약 — 카테고리 아이콘(작음,
    # focusable=true)과 브랜드 카드(큼, focusable=false)가 섞여 있다.
    xml = (
        '<?xml version="1.0"?><hierarchy>'
        '<node clickable="true" focusable="true" bounds="[13,73][118,178]" />'
        '<node clickable="true" focusable="false" bounds="[49,336][1029,687]" />'
        '<node clickable="true" focusable="false" bounds="[49,714][1029,1068]" />'
        '<node clickable="false" focusable="false" bounds="[0,0][1080,50]" />'
        '</hierarchy>'
    )
    assert find_card_bounds(xml) == [(49, 336, 1029, 687), (49, 714, 1029, 1068)]


def test_find_card_bounds_returns_empty_when_none_match():
    from capture.common import find_card_bounds
    xml = '<?xml version="1.0"?><hierarchy><node clickable="false" bounds="[0,0][10,10]" /></hierarchy>'
    assert find_card_bounds(xml) == []
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `python -m pytest tests/capture/test_common.py -k card_bounds -v`
Expected: FAIL — `ImportError`

- [ ] **Step 3: 최소 구현 작성**

`capture/common.py`에 추가:

```python
def find_card_bounds(xml: str, min_width: int = 400, min_height: int = 200) -> list[tuple[int, int, int, int]]:
    """clickable하고 충분히 큰 블록들을 화면에 뜨는 순서 그대로 준다.

    브랜드명 텍스트가 아예 없는 화면(땡겨요)에서 "카드가 몇 개 어디에
    있는지"만으로 순회하기 위한 것 — 어떤 브랜드인지는 모른다.
    min_width/min_height는 카테고리 아이콘 같은 작은 클릭 요소를 걸러내는
    임계값이다(실기 실측: 아이콘 105×105, 카드 980×351 이상).
    """
    cards = []
    for node in NODE_RE.findall(xml):
        if 'clickable="true"' not in node or 'focusable="false"' not in node:
            continue
        bounds = BOUNDS_RE.search(node)
        if not bounds:
            continue
        x1, y1, x2, y2 = (int(v) for v in bounds.groups())
        if (x2 - x1) >= min_width and (y2 - y1) >= min_height:
            cards.append((x1, y1, x2, y2))
    return cards
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest tests/capture/test_common.py -k card_bounds -v`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git add capture/common.py tests/capture/test_common.py
git commit -m "feat: 텍스트 없는 화면에서 카드형 블록 목록화하는 헬퍼 추가"
```

---

## Task 3: `tap_center` — bounds 중앙 탭

**Files:**
- Modify: `capture/common.py`
- Test: `tests/capture/test_common.py`

**Interfaces:**
- Produces: `tap_center(serial: str, bounds: tuple[int, int, int, int]) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_tap_center_taps_bounds_midpoint(monkeypatch):
    from capture.common import tap_center
    calls = []
    monkeypatch.setattr(
        "capture.common.run_adb",
        lambda serial, *args: calls.append((serial, args)),
    )
    tap_center("e7f06aaf", (36, 766, 1042, 1354))
    assert calls == [("e7f06aaf", ("shell", "input", "tap", "539", "1060"))]
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `python -m pytest tests/capture/test_common.py -k tap_center -v`
Expected: FAIL — `ImportError`

- [ ] **Step 3: 최소 구현 작성**

```python
def tap_center(serial: str, bounds: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = bounds
    run_adb(serial, "shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
```

주의: `run_adb`는 `*args`를 받아 `str(a)`로 안 바꾸고 그대로 `subprocess`에
넘긴다(`capture/common.py` 12번째 줄 `run_adb` 정의 참고) — 탭 좌표를
문자열로 미리 바꿔서 넘겨야 한다(위 구현처럼 `str(...)`).

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest tests/capture/test_common.py -k tap_center -v`
Expected: PASS (1 passed)

- [ ] **Step 5: 커밋**

```bash
git add capture/common.py tests/capture/test_common.py
git commit -m "feat: bounds 중앙을 탭하는 헬퍼 추가"
```

---

## Task 4: `go_back_and_verify` — 뒤로가기 + 리스트 화면 복귀 검증

수동 세션에서 실제로 겪은 사고(뒤로가기 직후 화면 전환이 덜 끝난 상태에서
다음 카드를 눌러 직전 상세로 재진입) 재발 방지. `expected_marker`
텍스트가 `dump_ui`에 다시 보일 때까지 재시도하고, 끝내 안 보이면 예외를
던져 파이프라인을 멈춘다(조용히 잘못된 상태로 계속 진행하지 않는다).

**Files:**
- Modify: `capture/common.py`
- Test: `tests/capture/test_common.py`

**Interfaces:**
- Consumes: `run_adb(serial, *args)`, `dump_ui(serial)` (같은 모듈 내 함수)
- Produces: `go_back_and_verify(serial: str, expected_marker: str, retries: int = 3, wait_s: float = 1.5) -> None` — 실패 시 `RuntimeError`

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_go_back_and_verify_succeeds_when_marker_reappears(monkeypatch):
    from capture.common import go_back_and_verify
    back_calls = []
    monkeypatch.setattr(
        "capture.common.run_adb",
        lambda serial, *args: back_calls.append(args),
    )
    monkeypatch.setattr("capture.common.dump_ui", lambda serial: "...오늘 땡길만한 브랜드...")
    monkeypatch.setattr("capture.common.time.sleep", lambda s: None)

    go_back_and_verify("e7f06aaf", "오늘 땡길만한 브랜드")

    assert back_calls == [("shell", "input", "keyevent", "KEYCODE_BACK")]


def test_go_back_and_verify_retries_then_raises(monkeypatch):
    from capture.common import go_back_and_verify
    monkeypatch.setattr("capture.common.run_adb", lambda serial, *args: None)
    monkeypatch.setattr("capture.common.dump_ui", lambda serial: "...엉뚱한 화면...")
    monkeypatch.setattr("capture.common.time.sleep", lambda s: None)

    with pytest.raises(RuntimeError, match="오늘 땡길만한 브랜드"):
        go_back_and_verify("e7f06aaf", "오늘 땡길만한 브랜드", retries=3)


def test_go_back_and_verify_recovers_after_first_failed_attempt(monkeypatch):
    from capture.common import go_back_and_verify
    screens = iter(["...엉뚱한 화면...", "...오늘 땡길만한 브랜드..."])
    monkeypatch.setattr("capture.common.run_adb", lambda serial, *args: None)
    monkeypatch.setattr("capture.common.dump_ui", lambda serial: next(screens))
    monkeypatch.setattr("capture.common.time.sleep", lambda s: None)

    go_back_and_verify("e7f06aaf", "오늘 땡길만한 브랜드", retries=3)  # 예외 없이 통과해야 한다
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `python -m pytest tests/capture/test_common.py -k go_back_and_verify -v`
Expected: FAIL — `ImportError`

- [ ] **Step 3: 최소 구현 작성**

```python
def go_back_and_verify(serial: str, expected_marker: str, retries: int = 3, wait_s: float = 1.5) -> None:
    """뒤로가기 후 expected_marker가 다시 보일 때까지 재시도한다.

    뒤로가기 직후 화면 전환이 덜 끝난 상태에서 바로 다음 조작을 하면
    직전 상세 화면으로 다시 들어가는 경우가 있었다(수동 캡처 세션에서
    실제로 겪음 — docs/plans/2026-07-29-offer-detail-collection.md).
    끝내 안 보이면 조용히 넘어가지 않고 던진다 — 잘못된 화면에서 다음
    카드를 계속 탭하면 엉뚱한 캡처가 쌓인다.
    """
    for _ in range(retries):
        run_adb(serial, "shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(wait_s)
        if expected_marker in dump_ui(serial):
            return
    raise RuntimeError(f"뒤로가기 검증 실패: {expected_marker!r}가 다시 보이지 않는다")
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest tests/capture/test_common.py -k go_back_and_verify -v`
Expected: PASS (3 passed)

- [ ] **Step 5: 커밋**

```bash
git add capture/common.py tests/capture/test_common.py
git commit -m "feat: 뒤로가기 후 리스트 화면 복귀를 검증하는 헬퍼 추가"
```

---

## Task 5: `store.multi_platform_brands` — 우선순위 브랜드 산출

앱 2개 이상에 걸친 브랜드를 원장에서 뽑는다. 하드코딩한 목록이 아니라
매번 다시 계산 — 원장이 바뀌면 우선순위도 같이 바뀐다.

**Files:**
- Modify: `store.py`
- Test: `tests/test_store.py`

**Interfaces:**
- Produces: `multi_platform_brands(records: list[dict], min_platforms: int = 2) -> dict[str, set[str]]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_store.py` 끝에 추가(기존 임포트 스타일은 파일 상단 확인 후
맞춰 쓸 것 — 보통 `from store import ...`):

```python
def test_multi_platform_brands_filters_by_count():
    from store import multi_platform_brands
    records = [
        {"platform": "baemin", "brand": "피자헛"},
        {"platform": "ddangyo", "brand": "피자헛"},
        {"platform": "coupangeats", "brand": "피자헛"},
        {"platform": "baemin", "brand": "단독브랜드"},
    ]
    result = multi_platform_brands(records)
    assert result == {"피자헛": {"baemin", "ddangyo", "coupangeats"}}


def test_multi_platform_brands_respects_min_platforms():
    from store import multi_platform_brands
    records = [
        {"platform": "baemin", "brand": "A"},
        {"platform": "ddangyo", "brand": "A"},
        {"platform": "yogiyo", "brand": "A"},
    ]
    assert multi_platform_brands(records, min_platforms=3) == {"A": {"baemin", "ddangyo", "yogiyo"}}
    assert multi_platform_brands(records, min_platforms=4) == {}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `python -m pytest tests/test_store.py -k multi_platform -v`
Expected: FAIL — `ImportError`

- [ ] **Step 3: 최소 구현 작성**

`store.py` 상단 import에 `from collections import defaultdict` 추가하고,
파일 끝에:

```python
def multi_platform_brands(records: list[dict], min_platforms: int = 2) -> dict[str, set[str]]:
    """브랜드별로 걸친 플랫폼 집합. min_platforms개 이상만 돌려준다.

    상세 수집 우선순위 산출용 — "앱 여러 개에 걸린 브랜드"가 비교가
    실제로 일어나는 지점이라 여기부터 채운다
    (docs/superpowers/specs/2026-07-30-brand-detail-collection-design.md).
    """
    by_brand: dict[str, set[str]] = defaultdict(set)
    for record in records:
        by_brand[record["brand"]].add(record["platform"])
    return {brand: platforms for brand, platforms in by_brand.items() if len(platforms) >= min_platforms}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest tests/test_store.py -k multi_platform -v`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git add store.py tests/test_store.py
git commit -m "feat: 앱 2개 이상 걸린 브랜드를 원장에서 뽑는 함수 추가"
```

---

## Task 6: `capture/baemin.py` — 브랜드 타겟팅 상세 수집

Task 1-4의 헬퍼로 배민 브랜드관에서 지정한 브랜드들의 상세 화면을 찾아
캡처한다. 못 찾으면 스크롤하며 재시도하고, 그래도 없으면 스킵(전체를
막지 않는다).

**Files:**
- Modify: `capture/baemin.py`
- Test: `tests/capture/test_baemin.py` (신규 파일)

**Interfaces:**
- Consumes: `dump_ui`, `find_node_bounds_by_text_prefix`, `tap_center`, `go_back_and_verify`, `swipe_up`, `screenshot`(모두 `capture.common`)
- Produces: `collect_brand_details(serial: str, out_dir: Path, brands: list[str], date_str: str) -> dict[str, Path | None]` — 브랜드명 -> 저장 경로(못 찾았으면 `None`)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/capture/test_baemin.py` 새로 작성:

```python
from pathlib import Path
from unittest.mock import MagicMock

from PIL import Image


def test_collect_brand_details_finds_and_captures_visible_brand(monkeypatch, tmp_path):
    import capture.baemin as baemin_mod

    xml_with_brand = (
        '<?xml version="1.0"?><hierarchy>'
        '<node class="android.widget.Button" text="훌랄라참숯바베큐치킨, 가까운 가게 있음"'
        ' clickable="true" bounds="[36,766][1042,1354]" />'
        '</hierarchy>'
    )
    monkeypatch.setattr(baemin_mod, "dump_ui", lambda serial: xml_with_brand)
    monkeypatch.setattr(baemin_mod, "screenshot", lambda serial: Image.new("RGB", (10, 10)))
    monkeypatch.setattr(baemin_mod, "tap_center", MagicMock())
    monkeypatch.setattr(baemin_mod, "go_back_and_verify", MagicMock())
    monkeypatch.setattr(baemin_mod, "swipe_up", MagicMock())
    monkeypatch.setattr(baemin_mod.time, "sleep", lambda s: None)

    result = baemin_mod.collect_brand_details(
        "e7f06aaf", tmp_path, ["훌랄라참숯바베큐치킨"], "2026-07-30",
    )

    expected_path = tmp_path / "baemin_2026-07-30_훌랄라참숯바베큐치킨.png"
    assert result == {"훌랄라참숯바베큐치킨": expected_path}
    assert expected_path.exists()
    baemin_mod.go_back_and_verify.assert_called_once_with("e7f06aaf", baemin_mod.DETAIL_LIST_MARKER)


def test_collect_brand_details_scrolls_when_not_immediately_visible(monkeypatch, tmp_path):
    import capture.baemin as baemin_mod

    xml_empty = '<?xml version="1.0"?><hierarchy></hierarchy>'
    xml_with_brand = (
        '<?xml version="1.0"?><hierarchy>'
        '<node class="android.widget.Button" text="피자헛, 최대 11,000원 할인"'
        ' clickable="true" bounds="[36,1400][1042,1988]" />'
        '</hierarchy>'
    )
    screens = iter([xml_empty, xml_empty, xml_with_brand])
    monkeypatch.setattr(baemin_mod, "dump_ui", lambda serial: next(screens))
    monkeypatch.setattr(baemin_mod, "screenshot", lambda serial: Image.new("RGB", (10, 10)))
    monkeypatch.setattr(baemin_mod, "tap_center", MagicMock())
    monkeypatch.setattr(baemin_mod, "go_back_and_verify", MagicMock())
    swipe_mock = MagicMock()
    monkeypatch.setattr(baemin_mod, "swipe_up", swipe_mock)
    monkeypatch.setattr(baemin_mod.time, "sleep", lambda s: None)

    result = baemin_mod.collect_brand_details("e7f06aaf", tmp_path, ["피자헛"], "2026-07-30")

    assert result["피자헛"] == tmp_path / "baemin_2026-07-30_피자헛.png"
    assert swipe_mock.call_count == 2  # 2번 스크롤한 뒤에야 찾음


def test_collect_brand_details_skips_brand_not_found_after_max_scrolls(monkeypatch, tmp_path):
    import capture.baemin as baemin_mod

    xml_empty = '<?xml version="1.0"?><hierarchy></hierarchy>'
    monkeypatch.setattr(baemin_mod, "dump_ui", lambda serial: xml_empty)
    monkeypatch.setattr(baemin_mod, "screenshot", MagicMock())
    monkeypatch.setattr(baemin_mod, "tap_center", MagicMock())
    monkeypatch.setattr(baemin_mod, "go_back_and_verify", MagicMock())
    monkeypatch.setattr(baemin_mod, "swipe_up", MagicMock())
    monkeypatch.setattr(baemin_mod.time, "sleep", lambda s: None)

    result = baemin_mod.collect_brand_details("e7f06aaf", tmp_path, ["없는브랜드"], "2026-07-30")

    assert result == {"없는브랜드": None}
    baemin_mod.tap_center.assert_not_called()
    baemin_mod.go_back_and_verify.assert_not_called()
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `python -m pytest tests/capture/test_baemin.py -v`
Expected: FAIL — `AttributeError: module 'capture.baemin' has no attribute 'collect_brand_details'`

- [ ] **Step 3: 최소 구현 작성**

`capture/baemin.py` 상단 import 블록을 아래로 교체(기존
`from capture.common import (...)` 줄을 확장):

```python
from capture.common import (
    current_activity, dump_ui, find_node_bounds, find_node_bounds_by_text_prefix,
    go_back_and_verify, run_adb, screenshot, scroll_capture, swipe_up,
    tap_center, wait_for_activity,
)
```

파일 끝(`capture()` 함수 뒤)에 추가:

```python
DETAIL_LIST_MARKER = "배달의민족 브랜드관"
BRAND_SEARCH_MAX_SCROLLS = 5
BRAND_SWIPE_X = 540
BRAND_SWIPE_Y_START = 1800
BRAND_SWIPE_Y_END = 700


def _find_brand_card(serial: str, brand: str) -> tuple[int, int, int, int] | None:
    """brand 카드를 찾을 때까지 스크롤하며 찾는다. 끝내 없으면 None."""
    for attempt in range(BRAND_SEARCH_MAX_SCROLLS + 1):
        xml = dump_ui(serial)
        try:
            return find_node_bounds_by_text_prefix(xml, f"{brand}, ")
        except RuntimeError:
            if attempt == BRAND_SEARCH_MAX_SCROLLS:
                return None
            swipe_up(serial, BRAND_SWIPE_X, BRAND_SWIPE_Y_START, BRAND_SWIPE_Y_END)
    return None


def collect_brand_details(
    serial: str, out_dir: Path, brands: list[str], date_str: str,
) -> dict[str, Path | None]:
    """지정한 브랜드들의 쿠폰 상세 화면을 찾아 캡처한다.

    브랜드관이 이미 열려 있다고 가정한다(진입은 open_brand_lounge()로
    별도 호출). 못 찾은 브랜드는 건너뛰고 결과에 None으로 남긴다 — 하나
    못 찾았다고 나머지까지 멈추지 않는다.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, Path | None] = {}

    for brand in brands:
        bounds = _find_brand_card(serial, brand)
        if bounds is None:
            results[brand] = None
            continue

        tap_center(serial, bounds)
        time.sleep(2)  # 상세 웹뷰 로딩

        image = screenshot(serial)
        path = out_dir / f"baemin_{date_str}_{brand}.png"
        image.save(path)
        results[brand] = path

        go_back_and_verify(serial, DETAIL_LIST_MARKER)

    return results
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest tests/capture/test_baemin.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: 전체 스위트 통과 확인(기존 테스트 안 깨졌는지)**

Run: `python -m pytest -v`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add capture/baemin.py tests/capture/test_baemin.py
git commit -m "feat: 배민 브랜드관에서 지정 브랜드 상세 화면 캡처"
```

---

## Task 7: `capture/ddangyo.py` — 전수 순회 상세 수집 (신규 파일)

브랜드명을 모르니 화면에 보이는 카드를 항상 맨 위(0번)부터 하나씩
탭·캡처·뒤로가기하고, 그 카드 높이만큼 스크롤해 다음 카드를 맨 위로
올린다. 스크롤해도 카드 배치가 그대로면(더 안 내려가면) 바닥으로 보고
멈춘다.

**Files:**
- Create: `capture/ddangyo.py`
- Test: `tests/capture/test_ddangyo.py` (신규 파일)

**Interfaces:**
- Consumes: `dump_ui`, `find_card_bounds`, `tap_center`, `go_back_and_verify`, `swipe_up`, `screenshot`, `run_adb`(모두 `capture.common`)
- Produces: `sweep_all_cards(serial: str, out_dir: Path, date_str: str) -> list[Path]`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/capture/test_ddangyo.py` 새로 작성:

```python
from unittest.mock import MagicMock

from PIL import Image


def test_sweep_all_cards_processes_until_scroll_stops_changing(monkeypatch, tmp_path):
    import capture.ddangyo as ddangyo_mod

    # 카드 2장짜리 화면이 스크롤해도 안 바뀐다(=2장이 전부, 바닥).
    xml_two_cards = (
        '<?xml version="1.0"?><hierarchy>'
        '<node clickable="true" focusable="false" bounds="[49,336][1029,687]" />'
        '<node clickable="true" focusable="false" bounds="[49,714][1029,1068]" />'
        '</hierarchy>'
    )
    monkeypatch.setattr(ddangyo_mod, "dump_ui", lambda serial: xml_two_cards)
    monkeypatch.setattr(ddangyo_mod, "screenshot", lambda serial: Image.new("RGB", (10, 10)))
    monkeypatch.setattr(ddangyo_mod, "tap_center", MagicMock())
    monkeypatch.setattr(ddangyo_mod, "go_back_and_verify", MagicMock())
    monkeypatch.setattr(ddangyo_mod, "swipe_up", MagicMock())
    monkeypatch.setattr(ddangyo_mod.time, "sleep", lambda s: None)

    result = ddangyo_mod.sweep_all_cards("e7f06aaf", tmp_path, "2026-07-30")

    # 첫 루프에서 카드[0]을 캡처하고, 스크롤해도 화면이 똑같으니(바닥) 멈춘다
    assert result == [tmp_path / "ddangyo_2026-07-30_00.png"]
    assert (tmp_path / "ddangyo_2026-07-30_00.png").exists()
    ddangyo_mod.tap_center.assert_called_once_with("e7f06aaf", (49, 336, 1029, 687))


def test_sweep_all_cards_advances_when_scroll_reveals_new_card(monkeypatch, tmp_path):
    import capture.ddangyo as ddangyo_mod

    screen_a = (
        '<?xml version="1.0"?><hierarchy>'
        '<node clickable="true" focusable="false" bounds="[49,336][1029,687]" />'
        '<node clickable="true" focusable="false" bounds="[49,714][1029,1068]" />'
        '</hierarchy>'
    )
    # 스크롤 후: 카드1은 위로 올라가 사라지고 새 카드2가 아래 나타남 —
    # bounds 집합이 이전과 달라지므로 "더 내려간다"고 판단해야 한다.
    screen_b = (
        '<?xml version="1.0"?><hierarchy>'
        '<node clickable="true" focusable="false" bounds="[49,336][1029,687]" />'
        '<node clickable="true" focusable="false" bounds="[49,714][1029,1068]" />'
        '<node clickable="true" focusable="false" bounds="[49,1096][1029,1450]" />'
        '</hierarchy>'
    )
    # 두 번째 바깥 루프에서 screen_b가 그대로 반복되면(더 안 바뀌면) 멈춘다.
    screens = iter([screen_a, screen_b, screen_b, screen_b])
    monkeypatch.setattr(ddangyo_mod, "dump_ui", lambda serial: next(screens))
    monkeypatch.setattr(ddangyo_mod, "screenshot", lambda serial: Image.new("RGB", (10, 10)))
    monkeypatch.setattr(ddangyo_mod, "tap_center", MagicMock())
    monkeypatch.setattr(ddangyo_mod, "go_back_and_verify", MagicMock())
    monkeypatch.setattr(ddangyo_mod, "swipe_up", MagicMock())
    monkeypatch.setattr(ddangyo_mod.time, "sleep", lambda s: None)

    result = ddangyo_mod.sweep_all_cards("e7f06aaf", tmp_path, "2026-07-30")

    assert len(result) == 2  # screen_a 카드[0] 한 번, screen_b 카드[0] 한 번, 그다음 멈춤


def test_sweep_all_cards_stops_when_no_cards_found(monkeypatch, tmp_path):
    import capture.ddangyo as ddangyo_mod

    monkeypatch.setattr(ddangyo_mod, "dump_ui", lambda serial: '<?xml version="1.0"?><hierarchy></hierarchy>')
    monkeypatch.setattr(ddangyo_mod, "screenshot", MagicMock())
    monkeypatch.setattr(ddangyo_mod, "tap_center", MagicMock())
    monkeypatch.setattr(ddangyo_mod, "go_back_and_verify", MagicMock())
    monkeypatch.setattr(ddangyo_mod, "swipe_up", MagicMock())
    monkeypatch.setattr(ddangyo_mod.time, "sleep", lambda s: None)

    result = ddangyo_mod.sweep_all_cards("e7f06aaf", tmp_path, "2026-07-30")

    assert result == []
    ddangyo_mod.tap_center.assert_not_called()
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `python -m pytest tests/capture/test_ddangyo.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'capture.ddangyo'`

- [ ] **Step 3: 최소 구현 작성**

`capture/ddangyo.py` 새로 작성:

```python
"""땡겨요 `오늘 땡길만한 브랜드` 목록 전수 순회.

카드가 100% 이미지 배너라 뷰 트리에 브랜드명 텍스트가 전혀 없다(실기
조사, 2026-07-30 —
docs/superpowers/specs/2026-07-30-brand-detail-collection-design.md).
그래서 baemin.py처럼 이름으로 찾지 않고, 화면에 보이는 카드를 맨 위부터
순서대로 전부 열어 캡처한다. 브랜드가 무엇인지는 캡처된 이미지를 나중에
비전이 읽을 때 알게 된다.

진입 딥링크가 없다 — 브랜드관 화면이 이미 열려 있다고 가정한다
(docs/plans/2026-07-29-offer-detail-collection.md).
"""
import time
from pathlib import Path

from capture.common import (
    dump_ui, find_card_bounds, go_back_and_verify, screenshot, swipe_up,
    tap_center,
)

LIST_MARKER = "오늘 땡길만한 브랜드"
MIN_CARD_WIDTH = 400
MIN_CARD_HEIGHT = 200
SWIPE_X = 540
MAX_CARDS = 60


def sweep_all_cards(serial: str, out_dir: Path, date_str: str) -> list[Path]:
    """리스트에 보이는 카드를 맨 위부터 순서대로 전부 캡처한다.

    매 반복: 지금 맨 위 카드를 탭 -> 캡처 -> 뒤로가기(검증 포함) ->
    그 카드 높이만큼 스크롤해 다음 카드를 맨 위로 올린다. 스크롤 전후
    카드 배치가 똑같으면(더 안 내려간다) 바닥이라 보고 멈춘다.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []

    for index in range(MAX_CARDS):
        xml = dump_ui(serial)
        cards = find_card_bounds(xml, min_width=MIN_CARD_WIDTH, min_height=MIN_CARD_HEIGHT)
        if not cards:
            break

        top = cards[0]
        tap_center(serial, top)
        time.sleep(2)  # 상세 화면 로딩

        image = screenshot(serial)
        path = out_dir / f"ddangyo_{date_str}_{index:02d}.png"
        image.save(path)
        saved.append(path)

        go_back_and_verify(serial, LIST_MARKER)

        swipe_up(serial, SWIPE_X, top[3], top[1])
        after = find_card_bounds(dump_ui(serial), min_width=MIN_CARD_WIDTH, min_height=MIN_CARD_HEIGHT)
        if after == cards:
            break  # 스크롤이 안 먹었다 = 바닥

    return saved
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `python -m pytest tests/capture/test_ddangyo.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: 전체 스위트 통과 확인**

Run: `python -m pytest -v`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add capture/ddangyo.py tests/capture/test_ddangyo.py
git commit -m "feat: 땡겨요 브랜드관 전수 순회 상세 캡처 추가"
```

---

## Task 8: 실기 검증 + 문서화

지금까지는 전부 목업 테스트다. 실제 기기에서 한 번 돌려서 진짜 되는지
확인하고, 실측 상수를 기존 `device-setup.md` 표 형식에 맞춰 남긴다(기기
바뀌면 다시 재야 하는 값들이므로).

**Files:**
- Modify: `docs/setup/device-setup.md`

**Interfaces:**
- Consumes: Task 6의 `collect_brand_details`, Task 7의 `sweep_all_cards`, Task 5의 `multi_platform_brands`

- [ ] **Step 1: 실기로 배민 타겟 수집 실행**

`adb devices -l`로 serial 확인 후, 배민 브랜드관이 열려 있는 상태에서:

```python
from pathlib import Path
from store import read_records, multi_platform_brands

records = read_records(Path("data/log.jsonl"))
targets = multi_platform_brands(records)
baemin_brands = [b for b, platforms in targets.items() if "baemin" in platforms]
print(baemin_brands)  # 8개 나와야 한다

from capture.baemin import collect_brand_details
result = collect_brand_details("<SERIAL>", Path("ref/delivery/detail"), baemin_brands, "2026-07-30")
print(result)
```

**검증**: `result`의 8개 브랜드 전부(또는 화면에 없는 브랜드 제외) 경로가
찍히고, 스킵된 게 있으면 왜인지 확인(오탈자·화면에 없음 등). 저장된
PNG들을 열어 실제로 각 브랜드의 쿠폰 상세 화면인지(리스트 화면이나
엉뚱한 브랜드가 아닌지) 육안 확인.

- [ ] **Step 2: 실기로 땡겨요 전수 수집 실행**

땡겨요 브랜드관이 열려 있는 상태에서:

```python
from capture.ddangyo import sweep_all_cards
paths = sweep_all_cards("<SERIAL>", Path("ref/delivery/detail"), "2026-07-30")
print(len(paths), paths)
```

**검증**: 저장된 이미지 수가 실제 화면에서 눈으로 센 브랜드 수와
맞는지(중복·누락 없이) 확인. 마지막 몇 장이 실제로 리스트 끝의
브랜드들인지 확인(중간에 멈추지 않았는지).

- [ ] **Step 3: 실측치를 device-setup.md에 기록**

`docs/setup/device-setup.md`의 "앱별 실측 상수" 절 아래에 새 소절 추가
(기존 배민 표 형식 그대로 따를 것):

```markdown
### 브랜드 상세 캡처(공용) — `capture/common.py`

| 상수 | 값 | 비고 |
|---|---|---|
| `find_card_bounds` 기본 임계값 | min_width=400, min_height=200 | 땡겨요 카테고리 아이콘(105×105)과 브랜드 카드(980×351)를 가르는 값 |

### 배민 상세 — `capture/baemin.py`

| 상수 | 값 |
|---|---|
| `DETAIL_LIST_MARKER` | `"배달의민족 브랜드관"` |
| `BRAND_SWIPE_X/Y_START/Y_END` | 540 / 1800 / 700 |

### 땡겨요 상세 — `capture/ddangyo.py`

| 상수 | 값 |
|---|---|
| `LIST_MARKER` | `"오늘 땡길만한 브랜드"` |
| `SWIPE_X` | 540 |

진입 딥링크가 없어 브랜드관 화면을 사람이 미리 띄워둬야 한다
(`docs/plans/2026-07-29-offer-detail-collection.md` 참고).
```

실기에서 실제로 쓴 값과 다르면(예: 기기 해상도가 달라 SWIPE 좌표를
조정했다면) 실제 쓴 값으로 고쳐서 기록할 것 — 문서는 항상 실측치를
반영해야 한다(기존 `device-setup.md`의 원칙).

- [ ] **Step 4: 커밋**

```bash
git add docs/setup/device-setup.md
git commit -m "docs: 브랜드 상세 캡처 실측 상수 기록"
```

---

## Self-Review 결과

- **스펙 커버리지**: 설계 문서의 아키텍처(공용 헬퍼 + 플랫폼별 순회),
  배민 타겟팅, 땡겨요 전수 순회, 뒤로가기 검증, 우선순위 산출 쿼리, 출력
  경로(`ref/delivery/detail/`)까지 Task 1-8이 전부 다룬다. "캐러셀
  자동화 안 함"·"판독은 비전이 별도로"는 애초에 코드에 손 안 대는
  항목이라 별도 태스크 없음(설계 문서의 명시적 제외 그대로 유지).
- **플레이스홀더**: 없음 — 전 태스크에 실제 테스트 코드·구현 코드 포함.
- **타입/시그니처 일관성**: `collect_brand_details`/`sweep_all_cards`
  모두 `(serial: str, out_dir: Path, ..., date_str: str)` 순서를
  맞췄고, 공용 헬퍼 이름(`tap_center`, `go_back_and_verify`,
  `find_card_bounds`, `find_node_bounds_by_text_prefix`)을 Task 6-7에서
  동일하게 참조.
