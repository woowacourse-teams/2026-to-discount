# 요기요 순회 안전구역 스와이프 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `capture/yogiyo.py`의 스와이프 시작점이 하단 내비게이션 바 영역
안이라 스크롤이 안 걸리던 버그를 고치고, 실기(SM-G885S, 시리얼
`e7f06aaf`)에서 브랜드 상세 데이터(최소주문금액/쿠폰 조건) 파싱
성공까지 검증한다.

**Architecture:** 스와이프 시작 y좌표를 항상 내비바 위(`nav_top` 미만)로
고정하는 계산으로 바꾼다(카드가 어디 있든). 순회 구조 자체(목록 스캔 →
상세 진입 → 쿠폰받기 → 뒤로가기)는 그대로 둔다.

**Tech Stack:** Python 3, `adb` (uiautomator 뷰트리 덤프 기반 자동화),
pytest.

## Global Constraints

- 기기별 좌표를 코드에 박아두지 않는다 — 항상 뷰 트리에서 실측한다
  (이 레포 전반 원칙, `capture/baemin.py`·`capture/ddangyo.py`와 동일).
- 스와이프 시작점(`y_start`)은 항상 내비바 상단(`_nav_bar_top()`의 반환값)
  **미만**이어야 한다 — 이번 버그의 근본 원인이자 이 플랜의 핵심 불변식.
- `SCROLL_DURATION_MS`는 400(probe 실험에서 실제로 성공한 값). 900처럼
  검증 안 된 값을 쓰지 않는다.
- 실기 디바이스 시리얼은 `e7f06aaf`(USB) 또는 `192.168.3.124:5555`(wifi,
  끊길 수 있음 — 안 되면 `adb devices -l`로 재확인 후 USB 시리얼 사용).
- 원장(`data/log.jsonl`)에는 아무것도 쓰지 않는다 — 이 플랜은 수집
  파이프라인 고치기+검증까지다. 원장 반영은 범위 밖(사람이 나중에
  승인 후 진행).

---

### Task 1: 스와이프 시작점을 내비바 위로 고정

**Files:**
- Modify: `capture/yogiyo.py` (`_scroll_target_into_safe_zone`,
  `_scroll_by_visible_brands`, `SCROLL_DURATION_MS`)
- Test: `tests/capture/test_yogiyo.py`

**Interfaces:**
- Consumes: 기존 `_nav_bar_top(xml) -> int | None`(이미 있음, 내비바
  컨테이너 상단 y), `find_node_bounds`, `swipe_up(serial, x, y_start,
  y_end, duration_ms)`(이미 있음).
- Produces: `_scroll_target_into_safe_zone(serial, brand, attempts=3) ->
  str | None`(시그니처 안 바뀜, 내부 계산만 바뀜), `_scroll_by_visible_
  brands(serial, xml, brands) -> None`(시그니처 안 바뀜).

- [ ] **Step 1: 실패하는 테스트부터 — 스와이프 시작점이 내비바 아래로
      내려가면 안 된다는 불변식**

`tests/capture/test_yogiyo.py`에서 기존
`test_scroll_target_into_safe_zone_lifts_card_hidden_by_nav_bar`를 아래로
교체한다(현재 이 테스트는 `y_start=1920`을 그대로 기대하는데, 1920은
`_NAV_XML`의 내비바 컨테이너 `y1=1791`보다 크다 — 지금 코드의 버그를
테스트가 그대로 긍정하고 있었다):

```python
def test_scroll_target_into_safe_zone_starts_swipe_above_nav_bar(monkeypatch):
    # 실기(2026-07-31): 스와이프 시작점이 내비바 영역(y=1791~2094) 안에
    # 있으면(예: 카드 중심 y=1920) 손가락이 내비바를 짚어 스크롤 자체가
    # 안 걸렸다 — 몇 번을 재시도해도 카드가 그대로였다. 시작점은 항상
    # 내비바 위여야 한다.
    import capture.yogiyo as mod

    monkeypatch.setattr(mod, "dump_ui", lambda serial: _NAV_XML)
    monkeypatch.setattr(mod, "find_node_bounds", lambda xml, text: (279, 1896, 387, 1944))
    swipes = []
    monkeypatch.setattr(mod, "swipe_up",
                        lambda serial, x, y_start, y_end, duration_ms: swipes.append((x, y_start, y_end, duration_ms)))
    monkeypatch.setattr(mod.time, "sleep", lambda s: None)

    mod._scroll_target_into_safe_zone("serial", "푸라닭", attempts=1)

    assert len(swipes) == 1
    x, y_start, y_end, duration = swipes[0]
    nav_top = 1791  # _NAV_XML의 내비바 컨테이너 y1
    assert y_start < nav_top, f"스와이프 시작점({y_start})이 내비바({nav_top}) 안에 있다"
    assert y_end < y_start
    assert duration == mod.SCROLL_DURATION_MS
```

기존 `test_scroll_target_into_safe_zone_lifts_card_hidden_by_nav_bar`는
이걸로 대체한다(같은 실기 사실을 검증하되, 이번엔 올바른 불변식으로).
`test_scroll_target_into_safe_zone_returns_none_when_target_scrolled_away`와
`test_scroll_target_into_safe_zone_leaves_visible_card_alone`은 그대로
둔다.

`_scroll_by_visible_brands`용 테스트도 같은 불변식으로 하나 추가한다
(이 함수는 지금 `_NAV_XML`을 안 쓰므로, 브랜드 bounds 중 하나가 내비바
안에 걸치는 상황을 만든다):

```python
def test_scroll_by_visible_brands_starts_swipe_above_nav_bar(monkeypatch):
    # _scroll_target_into_safe_zone과 같은 버그가 배치 스크롤에도 있었다
    # — 맨 아래 브랜드 카드 하단(bottom[3])이 내비바 안일 수 있다.
    import capture.yogiyo as mod

    xml = _NAV_XML  # 내비바 컨테이너 [0,1791][1080,2094] 포함
    bounds_by_brand = {
        "굽네치킨": (100, 500, 900, 900),
        "BHC치킨": (100, 1850, 900, 1950),  # 내비바(1791~) 안에 걸침
    }
    monkeypatch.setattr(mod, "find_node_bounds", lambda xml, text: bounds_by_brand[text])
    swipes = []
    monkeypatch.setattr(mod, "swipe_up",
                        lambda serial, x, y_start, y_end, duration_ms: swipes.append((x, y_start, y_end, duration_ms)))

    mod._scroll_by_visible_brands("serial", xml, ["굽네치킨", "BHC치킨"])

    assert len(swipes) == 1
    _, y_start, y_end, duration = swipes[0]
    assert y_start < 1791
    assert duration == mod.SCROLL_DURATION_MS
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `python -m pytest tests/capture/test_yogiyo.py -k "starts_swipe_above_nav_bar" -v`
Expected: 둘 다 FAIL (`y_start`가 내비바 안이라서, 또는 아직 함수가
`duration_ms` 없이 `swipe_up`을 호출해서 시그니처 불일치로 TypeError)

- [ ] **Step 3: `_scroll_target_into_safe_zone` 수정**

`capture/yogiyo.py`에서 `_scroll_target_into_safe_zone` 함수 본문을
아래로 교체한다:

```python
def _scroll_target_into_safe_zone(serial: str, brand: str, attempts: int = 3) -> str | None:
    """브랜드 카드가 하단 내비게이션 바에 가려져 있으면 위로 끌어올린다.

    실기 확인(푸라닭, 2026-07-31): 뷰 트리엔 브랜드 카드 bounds가 멀쩡히
    나오는데도 그 좌표를 탭하면 아무 반응이 없었다(3번 재시도해도 동일).
    1차 원인은 내비바가 터치를 가로채는 것이었지만, 그걸 피하려던 첫
    번째 수정(카드 중심에서 위로 끌기)도 여전히 실패했다 — **스와이프
    시작점 자체가 내비바 영역 안**이었기 때문이다(카드 중심이 이미
    내비바 안에 있으면, 거기서 손가락을 떼는 게 아니라 거기서 손가락을
    **내려놓는** 것부터가 내비바를 짚는 셈이다). probe 실험
    (`scratch_probe_yogiyo.py`)에서 유일하게 성공한 방법은 내비바
    밖(y=1200)에서 시작한 스크롤이었다 — 그 방식으로 통일한다.

    그래서 스와이프는 **항상 내비바 위(margin만큼 여유를 둔 지점)에서
    시작**해서, 목표를 그만큼 끌어올리는 데 필요한 거리만큼 위로 끈다.
    내비바 위치도 좌표를 박지 않고 뷰 트리에서 실측한다(`_nav_bar_top`).

    스와이프는 느리게(SCROLL_DURATION_MS) 한다 — 빠르면 플링(관성
    스크롤)으로 처리돼 의도한 거리보다 훨씬 많이 흘러간다.

    스크롤 뒤에도 대상이 여전히 안 보이거나 아직 가려져 있으면 남은
    횟수만큼 다시 시도한다. 끝내 안전 영역으로 못 올리면 `None`을 준다 —
    호출부가 추측으로 탭하지 않고 실패로 남기게 한다.
    """
    margin = 40  # 내비바 바로 위 여백 — 경계에 너무 붙지 않게
    for _ in range(attempts):
        xml = dump_ui(serial)
        try:
            target = find_node_bounds(xml, text=brand)
        except RuntimeError:
            return None  # 화면에서 사라졌다(스크롤이 지나쳤다) — 호출부가 판단한다
        nav_top = _nav_bar_top(xml)
        if nav_top is None or target[3] < nav_top:
            return xml  # 내비바 위쪽이라 안 가려진다 — 그대로 둔다

        target_center_y = (target[1] + target[3]) // 2
        safe_center_y = nav_top // 2  # 내비바 위 영역의 한가운데
        dy = target_center_y - safe_center_y  # 끌어올려야 할 거리

        start_y = nav_top - margin  # 항상 내비바 밖에서 시작
        end_y = max(start_y - dy, 0)
        x = (target[0] + target[2]) // 2
        swipe_up(serial, x=x, y_start=start_y, y_end=end_y,
                 duration_ms=SCROLL_DURATION_MS)
        time.sleep(1)
    return None
```

- [ ] **Step 4: `_scroll_by_visible_brands` 수정**

같은 파일에서 `_scroll_by_visible_brands` 함수 본문을 교체한다:

```python
def _scroll_by_visible_brands(serial: str, xml: str, brands: list[str]) -> None:
    """화면에 이미 보이는 브랜드들의 실측 위치로 스크롤 거리를 잡는다.

    기기별 좌표를 박아두지 않는다(이 레포 전반의 원칙 — 배민 `_scroll_
    to_top`/땡겨요 `sweep_all_cards`와 같은 이유). 화면 맨 위 브랜드의
    상단부터 맨 아래 브랜드의 하단까지를 스와이프 거리로 삼는다 — 지금
    보이는 카드들이 전부 화면 밖으로 밀려나야 다음 배치가 새로 나온다.

    스와이프 시작점(`y_start`)은 항상 내비바 위여야 한다(`_scroll_
    target_into_safe_zone`과 같은 이유 — 내비바 안에서 손가락을 떼면
    스크롤 자체가 안 걸린다) — 맨 아래 브랜드가 내비바에 걸쳐 있으면
    시작점을 내비바 바로 위로 당긴다.

    브랜드를 하나도 못 찾았으면(빈 화면 등) 아무것도 안 한다 — 다음
    루프에서 다시 시도한다.
    """
    if not brands:
        return
    top = find_node_bounds(xml, text=brands[0])
    bottom = find_node_bounds(xml, text=brands[-1])
    nav_top = _nav_bar_top(xml)
    y_start = bottom[3]
    if nav_top is not None and y_start >= nav_top:
        y_start = nav_top - 40
    x = (top[0] + top[2]) // 2
    swipe_up(serial, x=x, y_start=y_start, y_end=top[1],
             duration_ms=SCROLL_DURATION_MS)
```

- [ ] **Step 5: `SCROLL_DURATION_MS` 값을 400으로**

`capture/yogiyo.py` 상단의 상수를:

```python
SCROLL_DURATION_MS = 400
```

(현재 900 — probe 실험에서 실제로 성공한 값 400으로 되돌린다. 플링
방지 목적 자체는 유지, 값만 검증된 것으로 교체.)

- [ ] **Step 6: 테스트 재실행, 전체 스위트 통과 확인**

Run: `python -m pytest tests/capture -q`
Expected: 전부 PASS (Step 1의 새 테스트 포함, 기존 테스트 중 옛 불변식을
가정하던 것들도 이미 Step 1에서 같이 고쳤으므로 통과해야 한다)

- [ ] **Step 7: 커밋**

```bash
git add capture/yogiyo.py tests/capture/test_yogiyo.py
git commit -m "fix: 요기요 스크롤 시작점을 항상 내비바 위로 고정

카드 중심에서 위로 끄는 방식은 카드가 내비바 영역 안에 있으면 시작점
자체가 내비바를 짚어 스크롤이 안 걸렸다(실기 확인, 푸라닭). 시작점을
내비바 위(margin 40px)로 고정하고 필요한 거리만큼 끌어올리는 방식으로
바꿨다. SCROLL_DURATION_MS도 probe에서 검증된 400으로 되돌렸다."
```

---

### Task 2: 실기 반복 검증 — 데이터 파싱 성공까지

**Files:** 없음(코드 변경 없음 — 실기 디바이스에서 `capture/yogiyo.py`를
그대로 실행하며 관찰). 문제가 발견되면 `capture/yogiyo.py` 및
`tests/capture/test_yogiyo.py`를 필요한 만큼 수정한다.

**Interfaces:**
- Consumes: Task 1이 만든 `open_discount_tab(serial)`,
  `sweep_brand_coupons(serial, out_dir, date_str, max_brands) -> dict[str,
  dict]`(기존 시그니처, 안 바뀜).
- Produces: 실기 검증 결과 요약(성공/실패 브랜드 수, 남은 이슈) — 코드
  산출물은 없다.

**이 태스크는 TDD 스텝이 아니라 반복 디버깅 루프다.** 정확히 무엇이
막힐지 미리 알 수 없으므로, 아래 절차와 "허용된 변주 범위"만 정해두고
실제 판단은 실행하며 한다.

- [ ] **Step 1: 디바이스 확인**

```bash
adb devices -l
```
`e7f06aaf`(USB)가 `device` 상태로 보여야 한다. 안 보이면
`192.168.3.124:5555`로 `adb connect` 시도, 그래도 안 되면 STOP하고
사람에게 알린다(디바이스 문제는 코드로 못 고친다).

- [ ] **Step 2: 요기요 앱을 브랜드 혜택 목록으로 진입**

```bash
cd "C:\Users\soldesk\IdeaProjects\delivery-discount-tracker\.claude\worktrees\brand-detail-collection"
python -c "
from capture.yogiyo import open_discount_tab
open_discount_tab('e7f06aaf')
print('list opened')
"
```
Expected: `list opened` 출력, 예외 없음.

- [ ] **Step 3: 8개 브랜드 sweep 실행, 결과 관찰**

```bash
python -c "
from pathlib import Path
from capture.yogiyo import sweep_brand_coupons
res = sweep_brand_coupons('e7f06aaf', Path('ref/delivery/detail'), '2026-07-31', max_brands=8)
ok = sum(1 for r in res.values() if r.get('terms') or r.get('coupon'))
print(f'=== {ok}/{len(res)} 성공 ===')
for brand, r in res.items():
    print(brand, '->', r)
"
```

- [ ] **Step 4: 판정**

- **`terms` 또는 `coupon`이 채워진 브랜드가 1건 이상이면 "데이터 파싱
  성공"** — 최소 목표는 달성. 8/8을 목표로 계속 개선을 시도해도 되지만
  필수는 아니다.
- 전부 다시 실패하면 Step 5(변주)로.

- [ ] **Step 5: 실패 시 원인 재확인 + 허용된 변주**

실패한 브랜드가 있으면, `screenshot(serial).save(...)`와 `dump_ui`로
그 시점 화면을 찍어서 원인을 먼저 확인한다(추측으로 코드부터 고치지
않는다 — 이번 플랜의 원인 규명도 전부 이 방식으로 찾았다). 원인에 따라
아래 변주 중 필요한 것만 적용:

- `margin`(40) 값 조정 — 여전히 내비바를 스치면 80~100으로.
- `attempts`(3) 상향 — 일시적 애니메이션 겹침으로 보이면 5까지.
- 스크롤 직후 "정말 내비바 위로 올라왔는지" 재확인 스텝 추가(현재는
  스크롤하고 바로 재시도 탭 — 그 사이에 `dump_ui`로 목표 bounds가
  `nav_top` 아래로 내려갔는지 다시 확인하는 방어 추가 가능).
- 배치 스크롤(`_scroll_by_visible_brands`) 폭이 한 번에 너무 많은/적은
  브랜드를 넘기면, 카드 1~2개 단위로 더 세밀하게 스크롤하도록 조정.
- `SCROLL_DURATION_MS`를 400 근방에서 미세 조정(300~600 사이).
- 매 변경마다: 코드 수정 → 해당 유닛 테스트 추가/수정 →
  `pytest tests/capture -q` 통과 확인 → 실기 재실행 → 커밋(작은 단위로
  자주 — 이 플랜의 Global Constraints와 별개로, 실기 디버깅 세션 자체가
  이미 여러 커밋으로 쌓여온 이 레포의 관례를 따른다).

- [ ] **Step 6: 중단 조건**

**같은 원인/실패 메시지가 6번 넘게 반복되면 즉시 멈추고 사람에게
보고한다** — 무엇을 시도했는지, 어떤 화면/뷰트리를 확인했는지, 다음
방향 후보(TAB 포커스 순회 등 이 플랜이 다루지 않은 대안)를 요약해서.
다른 원인으로 실패가 바뀌면(예: "내비바 겹침" 실패가 사라지고 "화면
전환 타이밍" 실패로 바뀌면) 그건 진전이므로 카운트를 0부터 다시 센다 —
정확히 같은 원인이 반복될 때만 카운트한다.

- [ ] **Step 7: 결과 요약**

성공/실패 브랜드 수, 마지막으로 적용된 코드 상태, 발견한 새로운 실기
사실(있다면 `capture/yogiyo.py`의 관련 docstring에 이미 반영했는지
확인)을 정리해서 보고한다. 코드 변경이 있었다면 이미 Step 5에서 커밋
완료된 상태여야 한다.
