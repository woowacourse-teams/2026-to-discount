# 요기요 브랜드 혜택 목록 순회 — 안전 구역 스와이프 수정 + 실기 반복 검증

작성일: 2026-07-31 · 상태: 설계 승인, 이번 세션 내 실행까지 완료 목표

## 왜 필요한가

`capture/yogiyo.py`의 `sweep_brand_coupons`가 실기(SM-G885S)에서 8개
브랜드 전부 실패(0/8)했다. probe 실험(`scratch_probe_yogiyo.py`, 4가지
탭 방법 비교)과 상세 화면 clickable 노드 전수 조사로 근본 원인을
확정했다:

1. **스와이프 시작점이 하단 내비게이션 바 위에 있으면 스크롤 자체가
   안 걸린다.** `_scroll_target_into_safe_zone`이 "카드 중심(예:
   y=1920)에서 위로 끌기"를 하는데, 이 y가 이미 내비바 영역
   (y≈1791~2094) 안이라 손가락이 내비바를 짚어버린다. probe에서
   성공한 유일한 방법(#4, "화면 중앙으로 스크롤 후 탭")은 시작점을
   y=1200(내비바 밖)으로 뒀었다 — 지금 코드와의 유일한 실질 차이다.
2. `_scroll_by_visible_brands`(배치 스크롤)에도 같은 결함이 있다 —
   `y_start=bottom[3]`(맨 아래 브랜드 카드의 하단)이 내비바 안일 수
   있다.
3. 브랜드 상세 화면엔 공유/링크 버튼이 없다(clickable 노드 전수 확인,
   2026-07-31) — 요기요는 브랜드별 딥링크를 못 쓴다는 기존 결론을
   재확인. 이 설계는 목록 순회 접근을 유지한다.
4. 내비바는 **목록 화면에만** 있다. 상세 화면에는 없다 — 이 수정은
   목록 순회(스크롤) 지점에만 해당한다.

## 범위

`capture/yogiyo.py`의 스와이프 시작점 계산 두 곳을 고친다. 순회
구조(목록 스캔 → 브랜드별 상세 진입 → 쿠폰받기 → 뒤로가기)나 딥링크
재조사, TAB 포커스 순회 같은 대안은 이번엔 안 건드린다 — 원인이 이미
좁혀졌고, 최소 수정으로 될 가능성이 높다.

**이번 세션 한정 지시(사용자, 2026-07-31)**: 최소 수정에서 시작하되,
실기 검증 중 막히면 재시도 로직·여유값·스크롤 폭 등 변주를 자유롭게
추가해 데이터 파싱 성공까지 밀어붙인다. 단, **같은 실패가 6회 넘게
반복되면 멈추고 사용자에게 보고**한다 — 다른 실패로 바뀌면(예: A
버그를 고쳤더니 B 버그가 나오면) 카운트는 리셋된다.

## 수정 내용

### 1. `_scroll_target_into_safe_zone` — 스와이프 시작점을 내비바 위로 고정

```python
def _scroll_target_into_safe_zone(serial, brand, attempts=3):
    for _ in range(attempts):
        xml = dump_ui(serial)
        try:
            target = find_node_bounds(xml, text=brand)
        except RuntimeError:
            return None
        nav_top = _nav_bar_top(xml)
        if nav_top is None or target[3] < nav_top:
            return xml

        margin = 40  # 내비바 바로 위 여백 — 경계에 너무 붙지 않게
        start_y = nav_top - margin
        dy = ((target[1] + target[3]) // 2) - (nav_top // 2)  # 끌어올릴 거리
        end_y = max(start_y - dy, 0)
        x = (target[0] + target[2]) // 2
        swipe_up(serial, x=x, y_start=start_y, y_end=end_y,
                 duration_ms=SCROLL_DURATION_MS)
        time.sleep(1)
    return None
```

핵심 불변식(테스트로 고정): **`y_start`는 항상 `nav_top` 미만이어야
한다.** 목표가 이미 안전 구역이면 스와이프 자체를 안 한다(기존과 동일).

### 2. `_scroll_by_visible_brands` — 배치 스크롤도 동일 제약

```python
def _scroll_by_visible_brands(serial, xml, brands):
    if not brands:
        return
    top = find_node_bounds(xml, text=brands[0])
    bottom = find_node_bounds(xml, text=brands[-1])
    nav_top = _nav_bar_top(xml)
    x = (top[0] + top[2]) // 2
    y_start = min(bottom[3], nav_top - 40) if nav_top else bottom[3]
    swipe_up(serial, x=x, y_start=y_start, y_end=top[1],
             duration_ms=SCROLL_DURATION_MS)
```

### 3. `SCROLL_DURATION_MS`: 900 → 400

900은 검증 없이 넣은 값이었다. probe #4가 실제로 성공했을 때 쓴 값이
400이므로 검증된 쪽으로 되돌린다. (플링 방지 자체는 여전히 유효한
이유이므로 상수는 유지하고 값만 되돌린다.)

## 실기 검증 및 변주 여지

1. 위 수정 적용 후 8개 브랜드로 `sweep_brand_coupons` 재실행.
2. 실패가 남으면 원인을 스크린샷/뷰트리로 재확인하고, 다음 중 필요한
   것을 시도한다(순서 무관, 필요한 것만):
   - `margin`(40) 값 조정 — 너무 붙어서 여전히 내비바를 스치는 경우
   - `attempts`(3) 상향 — 일시적 애니메이션 겹침으로 인한 실패
   - 스크롤 후 "정말 안전 구역으로 올라왔는지" 재확인 스텝 추가
   - 배치 스크롤 폭이 한 번에 너무 많은/적은 브랜드를 넘기면 카드 1~2개
     단위로 더 세밀하게 스크롤
3. **같은 실패 메시지/원인이 6번 넘게 반복되면 멈추고 보고한다.**
   다른 원인으로 바뀌면 카운트를 0부터 다시 센다.

## 검증 기준

- `pytest`: 새/기존 테스트 전부 통과, 스와이프 시작점이 내비바 위라는
  불변식을 단언하는 테스트 포함.
- 실기: 8개 브랜드 sweep에서 최소 1건 이상 `terms` 또는 `coupon` 파싱
  성공(즉 "데이터 파싱 성공"을 실제로 눈으로 확인) — 이상적으로는
  8/8 근접.

## 다루지 않는 것

- TAB 포커스 순회, 딥링크 재조사, 순회 구조 자체의 재설계 — 원인이
  스와이프 시작점 하나로 좁혀졌으므로 이번엔 안 건드린다. 최소 수정
  +변주로도 6회 연속 같은 실패가 나면 이런 대안을 그때 다시 고려한다.
