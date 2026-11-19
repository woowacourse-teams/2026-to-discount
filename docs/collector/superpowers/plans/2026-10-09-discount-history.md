<!-- 원본: tracker docs/superpowers/plans/2026-10-09-discount-history.md — 여기서 고치지 않는다 -->
# 할인 이력과 첫 그래프 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 날짜별 하루 상태를 저장하고, 그것으로 금액 기준 신규 판정(API)과 브랜드 최고 할인 그래프(웹)를 만든다.

**Architecture:** tracker가 반영(8단계) 끝에 `data/daily/<날짜>.json`을 쓰고, 그 파일들을 접은 `data/history.json`을 만든다. API의 `history` 패키지가 이 파일을 읽어 오퍼마다 신규를 판정하고(`Offer.isNew`), `/api/brands/{brand}/history`로 그래프 점을 준다. 웹은 `isNew`를 표시하고 시트 안에 SVG 그래프 하나를 그린다.

**Tech Stack:** Python 3.14 + pytest (tracker), Java 21 + Spring Boot + JUnit 5 (mono/api), React 18 + Vite + node:test (mono/web). 그래프 라이브러리는 넣지 않는다(SVG 직접).

**Spec:** `docs/superpowers/specs/2026-10-09-discount-history-design.md` (구현 순서 1~4까지가 이 계획의 범위)

## Global Constraints

- 운영에 영향이 없어야 한다. 운영 공개 읽기(`GET /api/banners`, `GET /api/brands`)는 허용한다(사용자 2026-10-09). 이 계획의 어떤 단계도 다음을 실행하지 않는다: `reflect_daily.py --apply`, `deploy_export.py --apply`, `collect_trial.ps1`, `banner_routine.py`, 운영 서버 ssh/scp, `POST /api/reload`, mono `main` 푸시, 예약 작업 변경, 폰 조작.
- 작업은 워크트리에서만 한다. tracker `.claude/worktrees/history`(브랜치 `feat/discount-history`), mono는 그 안 `mono/`(브랜치 `feat/discount-history`).
- 웹 확인은 미러 `preview/discount-history` → Vercel 프리뷰, 360px 스크린샷. 그래프 데이터는 Playwright 경로 가로채기로 넣는다(운영 API에 history 엔드포인트가 아직 없다).
- 신규는 금액만 본다. 조건은 보지 않는다.
- 직전 수집일은 플랫폼별이다. `uncollected`, `unknown`, 값을 못 믿는 `withheld`인 날은 건너뛴다.
- 이력이 없으면 판정은 모름(`isNew: null`)이고 푸시는 보내지 않는다.
- 원장(`data/log.jsonl`)은 읽기만 한다.
- 웹에 새 노출 문구는 사용자 승인 없이 넣지 않는다(mono `docs/COPY-STYLE.md`). 그래프는 숫자 축만 쓴다.
- 비밀값, 비밀 파일 이름을 코드와 커밋에 넣지 않는다. mono 커밋 전 tracker 루트에서 `python -m pytest tests/test_mono_no_sensitive_strings.py`.
- `git add`는 파일 이름으로만.
- 파이썬으로 파일을 쓸 때 `newline="\n"`.

## 설계와 다르게 정한 것 (Rulings)

- 배너 오퍼는 공개 읽기 엔드포인트 `GET https://bebeggars.duckdns.org/api/banners`(웹이 매번 부르는 것, 읽기 전용)로 가져와 그날 상태 파일에 `ok` 관측으로 넣는다(사용자 2026-10-09: 운영 영향 없음). 배달 4사(baemin, coupangeats, yogiyo, ddangyo)만, 금액(`amountSpec.wonMax`)이 있는 것만. 지난 날짜 배너는 남은 기록이 없어 복원하지 않는다.
- 설계의 "내보내기의 오퍼 JSON에 `isNew`"는 API 응답 오퍼 JSON으로 읽는다(판정 주체가 API다).
- 6번 규칙(`absent`)은 상태 파일에 줄을 만들지 않고, API가 "플랫폼은 수집됨 + 그 쌍 줄 없음"을 없음으로 읽는다. 매일 모든 브랜드×플랫폼 줄을 쓰지 않으려는 것이다.

## Review Focus

1. 청년피자 사례: 10-08 허브 10,000원 반영, 10-09 쿠폰함 단계 실패 → 10-09 허브 10,000원은 신규가 아니다. (Task 1, Task 4 테스트)
2. 직전 수집일에 그 브랜드가 `absent`면 다음 등장은 신규다. 브랜드가 그 플랫폼 이력에 한 번도 없었어도 플랫폼 이력이 있으면 신규다. (Task 4)
3. `history.json`이 없거나 깨졌을 때 API가 죽지 않고 모든 오퍼 `isNew: null`, 푸시 0건. (Task 5)
4. 주간 전수(월요일)로만 보이는 브랜드가 화~일에 `uncollected`로 남아 그래프가 점선으로 이어지고, 다음 월요일 같은 금액이 신규가 아니다. (Task 1, Task 4)
5. 웹: 이력 요청이 404거나 점이 하나뿐이면 그래프를 그리지 않고 시트는 그대로다. (Task 7)

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `scripts/daily_state.py` (새) | 하루 상태 분류(순수 함수), 상태 파일 쓰기, 지난 날짜 복원, `history.json` 접기 |
| `tests/test_daily_state.py` (새) | 위 함수 테스트 |
| `scripts/reflect_daily.py` | `--apply` 끝에 상태 파일과 `history.json` 생성 |
| `scripts/check_routine.py` | 단계 `8d`: 그날 상태 파일 확인 |
| `scripts/deploy_export.py` | 올릴 파일 목록에 `history.json` 추가(실행은 사람이 출시 때) |
| `mono/api/.../history/*.java` (새) | `DayState`, `WithheldReason`, `BrandDay`, `OfferHistory`, `HistoryRepository`, `HistoryResponse` |
| `mono/api/.../offer/Offer.java` | `isNew` 칸, `withIsNew` |
| `mono/api/.../comparison/BrandComparisonService.java` | 오퍼마다 `isNew` 채움 |
| `mono/api/.../push/NewOfferNotificationService.java` | `seenToday(firstSeenAt)` 대신 `isNew` |
| `mono/api/.../web/BrandController.java` | `GET /api/brands/{brand}/history`, reload에 이력 포함 |
| `mono/web/src/historyChart.js` (새) | 점 목록 → SVG 경로 모델(순수) |
| `mono/web/src/BestHistoryChart.jsx` (새) | 이력 받아 그리기 |
| `mono/web/src/filters.js` | `isUpdated`가 `isNew` 우선 |

---

### Task 0: 워크트리 준비

**Files:** 없음(작업 환경)

- [ ] **Step 1: tracker 워크트리**

```bash
cd /c/Users/Jaewun/_dev/delivery-discount-tracker
git fetch -q origin
git worktree add .claude/worktrees/history -b feat/discount-history origin/main
```

- [ ] **Step 2: mono 워크트리를 그 안에**

```bash
cd /c/Users/Jaewun/_dev/delivery-discount-tracker/mono
git fetch -q origin
git worktree add ../.claude/worktrees/history/mono -b feat/discount-history origin/main
```

- [ ] **Step 3: 확인**

```bash
cd /c/Users/Jaewun/_dev/delivery-discount-tracker/.claude/worktrees/history
python -c "from scripts._env_paths import brands_yml; print(brands_yml())"
```
Expected: `...\.claude\worktrees\history\mono\api\src\main\resources\brands.yml`

```bash
python -m pytest tests -q 2>&1 | tail -1
```
Expected: 전부 통과(로컬 기준 1357개 안팎).

이후 모든 명령은 이 워크트리(`W=.../.claude/worktrees/history`) 안에서 돈다.

---

### Task 1: 하루 상태 분류 (tracker, 순수 함수)

**Files:**
- Create: `scripts/daily_state.py`
- Test: `tests/test_daily_state.py`

**Interfaces:**
- Produces:
  - `classify(day: str, observations: list[dict], export: list[dict], collected: set[str]) -> list[dict]`
    - `observations` 한 줄: `{"platform", "brand", "amount", "outcome"}`, `outcome` ∈ `ok | held_human | rejected | stage_suspect | misread | limited | duplicate_label`
    - `export` 한 줄: export.json 레코드(`platform`, `brand`, `amount` 사용)
    - 돌려주는 한 줄: `{"platform", "brand", "state", "reason"?, "max"?, "seen"?}`, `state` ∈ `published | withheld | uncollected | absent`
  - `STATES`, `TRUSTED_REASONS = {"held_human"}`, `UNTRUSTED_REASONS = {"rejected", "stage_suspect", "misread"}`, `DROP_OUTCOMES = {"limited", "duplicate_label"}`

규칙(설계 "하루 상태" 표를 그대로 옮긴 것):
1. `limited`, `duplicate_label` 관측은 버린다.
2. 그 쌍에 `ok`가 있으면: export에 그 쌍이 있으면 `published`, `max` = ok 금액 최대. export에 없으면(만료로 빠짐) `absent`, `reason: "expired"`.
3. 아니고 `held_human`이 있으면 `withheld`, `reason: "held_human"`, `max` = 그 금액 최대.
4. 아니고 못 믿는 관측이 있으면 `withheld`, `reason` = 첫 사유, `seen` = 금액 최대, `max` 없음.
5. 아니고 export에 있으면 `uncollected`, `max` = export 금액 최대(그날 안 봤지만 화면엔 있음).
6. 아니고 플랫폼이 `collected`에 있으면 `absent`.
7. 그 밖은 `uncollected`.
- 쌍 목록은 관측과 export의 합집합이다. 출력은 `(platform, brand)` 순 정렬.

- [ ] **Step 1: 실패하는 테스트**

```python
# tests/test_daily_state.py
from scripts.daily_state import classify


def _o(platform, brand, amount, outcome="ok"):
    return {"platform": platform, "brand": brand, "amount": amount, "outcome": outcome}


def _e(platform, brand, amount):
    return {"platform": platform, "brand": brand, "amount": amount}


def _by(rows):
    return {(r["platform"], r["brand"]): r for r in rows}


def test_observed_and_exported_is_published_with_max():
    rows = _by(classify("2026-10-09", [_o("coupangeats", "청년피자", 7500), _o("coupangeats", "청년피자", 10000)],
                        [_e("coupangeats", "청년피자", 10000)], {"coupangeats"}))
    assert rows[("coupangeats", "청년피자")] == {"platform": "coupangeats", "brand": "청년피자",
                                              "state": "published", "max": 10000}


def test_failed_source_but_still_exported_is_uncollected_carrying_export_amount():
    # 10-09 쿠폰함 단계 실패: 관측이 없는데 export에는 어제 값이 남아 있다.
    rows = _by(classify("2026-10-09", [], [_e("coupangeats", "꾸브라꼬숯불치킨", 4000)], {"coupangeats"}))
    r = rows[("coupangeats", "꾸브라꼬숯불치킨")]
    assert r["state"] == "uncollected" and r["max"] == 4000


def test_pairs_come_only_from_observations_and_export():
    # 그날 없는 쌍은 파일에 줄이 없다. API가 "그날 그 쌍 줄 없음 + 플랫폼 수집됨"을 없음으로 읽는다(Task 4).
    rows = _by(classify("2026-10-09", [_o("baemin", "BBQ", 3000)], [_e("baemin", "BBQ", 3000)], {"baemin", "yogiyo"}))
    assert set(rows) == {("baemin", "BBQ")}


def test_observed_but_not_exported_is_expired_absent():
    rows = _by(classify("2026-10-09", [_o("baemin", "피자헛", 5000)], [], {"baemin"}))
    assert rows[("baemin", "피자헛")]["state"] == "absent"
    assert rows[("baemin", "피자헛")]["reason"] == "expired"


def test_untrusted_withheld_keeps_seen_not_max():
    rows = _by(classify("2026-10-09", [_o("baemin", "BBQ", 3000, "stage_suspect")], [], {"baemin"}))
    r = rows[("baemin", "BBQ")]
    assert r == {"platform": "baemin", "brand": "BBQ", "state": "withheld", "reason": "stage_suspect", "seen": 3000}


def test_held_human_is_trusted_withheld_with_max():
    rows = _by(classify("2026-10-09", [_o("baemin", "BBQ", 4000, "held_human")], [_e("baemin", "BBQ", 4000)], {"baemin"}))
    assert rows[("baemin", "BBQ")]["state"] == "withheld"
    assert rows[("baemin", "BBQ")]["reason"] == "held_human" and rows[("baemin", "BBQ")]["max"] == 4000


def test_limited_offer_is_dropped_before_classifying():
    rows = _by(classify("2026-10-09", [_o("baemin", "BBQ", 9000, "limited"), _o("baemin", "BBQ", 3000)],
                        [_e("baemin", "BBQ", 3000)], {"baemin"}))
    assert rows[("baemin", "BBQ")]["max"] == 3000


def test_uncollected_platform_with_nothing_exported_is_uncollected_without_amount():
    rows = _by(classify("2026-10-09", [_o("ddangyo", "BBQ", 2000, "rejected")], [], set()))
    assert rows[("ddangyo", "BBQ")]["state"] == "withheld"   # 관측은 있었다(거부)
    rows = _by(classify("2026-10-09", [], [_e("ddangyo", "BBQ", 2000)], set()))
    assert rows[("ddangyo", "BBQ")] == {"platform": "ddangyo", "brand": "BBQ", "state": "uncollected", "max": 2000}
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_daily_state.py -q`
Expected: FAIL `ModuleNotFoundError: No module named 'scripts.daily_state'`

- [ ] **Step 3: 구현**

```python
# scripts/daily_state.py
"""하루 상태(설계 docs/superpowers/specs/2026-10-09-discount-history-design.md).

브랜드와 플랫폼마다 날짜별로 반영, 보류(사유), 미수집, 없음 중 하나를 정한다. 신규 판정과 이력
그래프는 이 상태만 읽는다. "그날 수집이 안 됐다"와 "그날 할인이 없었다"를 가르려고 만든다
(2026-10-09 쿠폰함 단계 실패가 청년피자 10,000원을 거짓 신규로 만들었다).
"""
from __future__ import annotations

STATES = ("published", "withheld", "uncollected", "absent")
TRUSTED_REASONS = {"held_human"}
UNTRUSTED_REASONS = {"rejected", "stage_suspect", "misread"}
DROP_OUTCOMES = {"limited", "duplicate_label"}


def classify(day: str, observations: list[dict], export: list[dict], collected: set[str]) -> list[dict]:
    obs: dict[tuple[str, str], list[dict]] = {}
    for o in observations:
        if o["outcome"] in DROP_OUTCOMES:
            continue
        obs.setdefault((o["platform"], o["brand"]), []).append(o)
    exported: dict[tuple[str, str], int] = {}
    for r in export:
        key = (r["platform"], r["brand"])
        if r.get("amount") is not None:
            exported[key] = max(exported.get(key, 0), r["amount"])
        else:
            exported.setdefault(key, 0)
    out = []
    for key in sorted(set(obs) | set(exported)):
        platform, brand = key
        row = {"platform": platform, "brand": brand}
        mine = obs.get(key, [])
        amounts = lambda kind: [o["amount"] for o in mine if o["outcome"] == kind and o["amount"] is not None]
        ok, human = amounts("ok"), amounts("held_human")
        untrusted = [o for o in mine if o["outcome"] in UNTRUSTED_REASONS]
        if ok:
            if key in exported:
                row.update(state="published", max=max(ok))
            else:
                row.update(state="absent", reason="expired")
        elif human:
            row.update(state="withheld", reason="held_human", max=max(human))
        elif untrusted:
            seen = [o["amount"] for o in untrusted if o["amount"] is not None]
            row.update(state="withheld", reason=untrusted[0]["outcome"])
            if seen:
                row["seen"] = max(seen)
        elif key in exported:
            row.update(state="uncollected", max=exported[key])
        elif platform in collected:
            row.update(state="absent")
        else:
            row.update(state="uncollected")
        out.append(row)
    return out
```

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_daily_state.py -q`
Expected: 8 passed

- [ ] **Step 5: 커밋**

```bash
git add scripts/daily_state.py tests/test_daily_state.py
git commit -m "feat(history): 하루 상태 분류(반영, 보류 사유, 미수집, 없음)"
```

---

### Task 2: 반영 단계에서 상태 파일 쓰기와 일일 판정 확인 (tracker)

**Files:**
- Modify: `scripts/daily_state.py` (`observations_from`, `write_day`)
- Modify: `scripts/reflect_daily.py` (`main`의 `--apply` 블록, `export_data.py` 직후)
- Modify: `scripts/check_routine.py` (`STEPS`에 `8d`, `judge`에 판정 한 줄)
- Test: `tests/test_daily_state.py`, `tests/test_check_routine_daily_state.py` (새)

**Interfaces:**
- Consumes: `classify` (Task 1)
- Produces:
  - `observations_from(decisions: list[tuple[str, str, dict | None]], skipped: dict[str, list[dict]], excluded: list[dict]) -> list[dict]`
    - `decisions`는 reflect `main`의 그 목록. `d["ingest"]`와 `d["duplicate"]`는 `ok`, `d["held"]`는 `held_human`, `d["invalid"]`가 있는 출처(`skipped_all`)의 레코드는 전부 `rejected`.
    - `skipped`: 레코드가 None이었던 출처의 이름 → 그날 캡처 파일을 직접 읽은 레코드(있으면). 전부 `stage_suspect`.
    - `excluded`: 원장에서 그날 `excluded`가 붙은 레코드. `reason`이 `misread`면 `misread`, `limited`나 옛 `targeted`면 `limited`, `duplicate`면 `duplicate_label`.
  - `banner_observations(banners: list[dict], day: str) -> list[dict]`: `/api/banners` 응답에서 그날 걸린(`startsAt`~`endsAt`에 day 포함) 배달 4사 배너를 `{"platform", "brand", "amount": amountSpec.wonMax, "outcome": "ok"}`로. `brand`가 없고 `members`가 있으면 멤버마다 한 줄. 금액 없으면 뺀다. `fetch_banners()`는 요청 실패 시 `[]`와 경고 출력(상태 파일은 그래도 쓴다).
  - `collected_platforms(decisions) -> set[str]`: 레코드가 None이 아니고 `skipped_all`이 아닌 출처의 레코드 플랫폼 합집합.
  - `write_day(day: str, stages: dict[str, str], rows: list[dict], collected: set[str], root: Path) -> Path`: `root/"data"/"daily"/f"{day}.json"`에 `{"date", "builtAt", "stages", "collectedPlatforms", "pairs"}`를 쓴다.
  - 브랜드 이름은 `export_data._canon_brand()`로 접는다(관측과 export 둘 다).

- [ ] **Step 1: 실패하는 테스트 (관측 만들기)**

```python
# tests/test_daily_state.py 에 추가
from scripts.daily_state import collected_platforms, observations_from


def test_observations_from_reflect_decisions():
    ok = {"platform": "coupangeats", "brand": "청년피자", "amount": 10000}
    dup = {"platform": "coupangeats", "brand": "BHC", "amount": 5000}
    held = {"platform": "baemin", "brand": "BBQ", "amount": 4000}
    bad = {"platform": "yogiyo", "brand": "교촌", "amount": 3000}
    decisions = [
        ("쿠팡이츠 허브 고정 쿠폰", "3", {"ingest": [ok], "duplicate": [dup], "held": [], "invalid": [], "skipped_all": False}),
        ("배민 배짱할인", "2", {"ingest": [], "duplicate": [], "held": [held], "invalid": [], "skipped_all": False}),
        ("요기요 쿠폰함", "5y", {"ingest": [], "duplicate": [], "held": [], "invalid": [bad], "skipped_all": True}),
        ("쿠팡이츠 쿠폰함", "5b", None),
    ]
    skipped = {"쿠팡이츠 쿠폰함": [{"platform": "coupangeats", "brand": "피자헛", "amount": 9000}]}
    excluded = [{"platform": "baemin", "brand": "KFC", "amount": 9000, "excluded": {"reason": "targeted"}}]
    got = sorted((o["brand"], o["outcome"]) for o in observations_from(decisions, skipped, excluded))
    assert got == [("BBQ", "held_human"), ("BHC", "ok"), ("KFC", "limited"), ("교촌", "rejected"),
                   ("청년피자", "ok"), ("피자헛", "stage_suspect")]
    assert collected_platforms(decisions) == {"coupangeats", "baemin"}
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_daily_state.py -q`
Expected: FAIL `ImportError: cannot import name 'collected_platforms'`

- [ ] **Step 3: 구현 (daily_state.py에 추가)**

```python
import datetime
import json
from pathlib import Path

_EXCLUSION_TO_OUTCOME = {"misread": "misread", "limited": "limited", "targeted": "limited",
                         "duplicate": "duplicate_label"}


def _canon():
    from export_data import _canon_brand
    return _canon_brand()


def _obs(r: dict, outcome: str, canon: dict) -> dict:
    return {"platform": r["platform"], "brand": canon.get(r["brand"], r["brand"]),
            "amount": r.get("amount"), "outcome": outcome}


def observations_from(decisions, skipped: dict[str, list[dict]], excluded: list[dict]) -> list[dict]:
    canon = _canon()
    out = []
    for name, _step, d in decisions:
        if d is None:
            out += [_obs(r, "stage_suspect", canon) for r in skipped.get(name) or []]
            continue
        if d["skipped_all"]:
            out += [_obs(r, "rejected", canon) for r in d["invalid"] + d["duplicate"]]
            continue
        out += [_obs(r, "ok", canon) for r in d["ingest"] + d["duplicate"]]
        out += [_obs(r, "held_human", canon) for r in d["held"]]
    for r in excluded:
        reason = (r.get("excluded") or {}).get("reason")
        if reason in _EXCLUSION_TO_OUTCOME:
            out.append(_obs(r, _EXCLUSION_TO_OUTCOME[reason], canon))
    return out


def collected_platforms(decisions) -> set[str]:
    return {r["platform"] for _n, _s, d in decisions if d and not d["skipped_all"]
            for r in d["ingest"] + d["duplicate"] + d["held"]}


def write_day(day: str, stages: dict[str, str], rows: list[dict], collected: set[str], root: Path) -> Path:
    path = root / "data" / "daily" / f"{day}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    body = {"date": day, "builtAt": datetime.datetime.now().astimezone().replace(microsecond=0).isoformat(),
            "stages": stages, "collectedPlatforms": sorted(collected), "pairs": rows}
    path.write_text(json.dumps(body, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    return path
```

배너 관측(같은 파일에 추가):

```python
BANNER_APPS = {"baemin", "coupangeats", "yogiyo", "ddangyo"}
BANNERS_URL = "https://bebeggars.duckdns.org/api/banners"   # 공개 읽기 전용(웹이 부르는 것)


def fetch_banners() -> list[dict]:
    import urllib.request
    try:
        with urllib.request.urlopen(BANNERS_URL, timeout=15) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"[suspect] 배너를 못 읽었다 — 배너 관측 없이 쓴다: {exc}", flush=True)
        return []


def banner_observations(banners: list[dict], day: str) -> list[dict]:
    canon = _canon()
    out = []
    for b in banners:
        won = (b.get("amountSpec") or {}).get("wonMax")
        if b.get("platform") not in BANNER_APPS or not won:
            continue
        if not ((b.get("startsAt") or "")[:10] <= day <= (b.get("endsAt") or "")[:10]):
            continue
        names = [b["brand"]] if b.get("brand") else [m.get("brand") for m in b.get("members") or [] if m.get("brand")]
        out += [{"platform": b["platform"], "brand": canon.get(n, n), "amount": won, "outcome": "ok"} for n in names]
    return out
```

테스트(추가):

```python
def test_banner_observations_take_delivery_apps_on_that_day():
    from scripts.daily_state import banner_observations
    banners = [
        {"platform": "baemin", "brand": "홍콩반점0410", "amountSpec": {"wonMax": 6000},
         "startsAt": "2026-10-09T00:00:00", "endsAt": "2026-10-09T23:59:59"},
        {"platform": "own", "brand": "백억커피", "amountSpec": {"wonMax": 10000},
         "startsAt": "2026-09-21T00:00:00", "endsAt": "2026-10-31T23:59:59"},
        {"platform": "coupangeats", "brand": "KFC", "amountSpec": {"wonMax": 7000},
         "startsAt": "2026-10-10T00:00:00", "endsAt": "2026-10-10T23:59:59"},
        {"platform": "yogiyo", "brand": None, "amountSpec": {"wonMax": 5000}, "members": [{"brand": "BBQ"}],
         "startsAt": "2026-10-08T00:00:00", "endsAt": "2026-10-12T23:59:59"},
        {"platform": "ddangyo", "brand": "교촌", "amountSpec": {"percent": 30},
         "startsAt": "2026-10-09T00:00:00", "endsAt": "2026-10-09T23:59:59"},
    ]
    got = sorted((o["platform"], o["brand"], o["amount"]) for o in banner_observations(banners, "2026-10-09"))
    assert got == [("baemin", "홍콩반점0410", 6000), ("yogiyo", "BBQ", 5000)]
```

배너는 export에 없다. `classify`가 "관측 ok인데 export에 없음"을 만료(`absent`)로 보지 않도록, `build_daily_state`는 배너 관측의 쌍을 export 목록에도 `{"platform", "brand", "amount"}`로 더해서 넘긴다(Step 6 코드에 반영).

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_daily_state.py -q`
Expected: 10 passed

- [ ] **Step 5: reflect 연결 테스트 (실패)**

```python
# tests/test_daily_state.py 에 추가
def test_write_day_round_trip(tmp_path):
    from scripts.daily_state import write_day
    p = write_day("2026-10-09", {"5a": "FAIL"}, [{"platform": "baemin", "brand": "BBQ", "state": "absent"}],
                  {"baemin"}, tmp_path)
    body = json.loads(p.read_text(encoding="utf-8"))
    assert body["date"] == "2026-10-09" and body["collectedPlatforms"] == ["baemin"]
    assert body["pairs"][0]["state"] == "absent"


def test_reflect_apply_writes_daily_state_after_export():
    """reflect --apply가 export_data 다음, deploy 전에 상태 파일을 쓴다(소스 순서로 고정)."""
    src = (ROOT / "scripts" / "reflect_daily.py").read_text(encoding="utf-8")
    i_export = src.index('[PYTHON, "export_data.py"]')
    i_daily = src.index("build_daily_state(")
    i_deploy = src.index('"scripts/deploy_export.py"')
    assert i_export < i_daily < i_deploy
```

파일 맨 위에 `import json`과 `from pathlib import Path`, `ROOT = Path(__file__).resolve().parent.parent`를 둔다.

Run: `python -m pytest tests/test_daily_state.py -q`
Expected: FAIL `ValueError: substring not found` (build_daily_state 없음)

- [ ] **Step 6: reflect 연결 구현**

`scripts/daily_state.py`에 추가:

```python
def build_daily_state(day: str, verdicts: dict[str, str], decisions, root: Path) -> Path:
    """reflect --apply가 export 직후 부른다. 손 재반영(`reflect_daily.py --apply --pass 5a --pass 5b`)도 같은 길이다."""
    from scripts.reflect_daily import _load
    skipped_files = {"배민 배짱할인": f"captures/baejjang-weekend-{day}.json",
                     "쿠팡이츠 허브 고정 쿠폰": f"captures/coupangeats-weekly-{day}.json",
                     "쿠팡이츠 쿠폰함": f"captures/coupangeats_couponbox_records_{day}.json"}
    skipped = {name: _load(rel) or [] for name, rel in skipped_files.items()
               if any(n == name and d is None for n, _s, d in decisions)}
    excluded = [r for r in json_lines(root / "data" / "log.jsonl")
                if r.get("excluded") and (r.get("captured_at") or "")[:10] == day]
    export = json.loads((root / "data" / "export.json").read_text(encoding="utf-8"))
    canon = _canon()
    export = [{**r, "brand": canon.get(r["brand"], r["brand"])} for r in export]
    collected = collected_platforms(decisions)
    banner_obs = banner_observations(fetch_banners(), day)
    export += [{"platform": o["platform"], "brand": o["brand"], "amount": o["amount"]} for o in banner_obs]
    rows = classify(day, observations_from(decisions, skipped, excluded) + banner_obs, export, collected)
    return write_day(day, verdicts, rows, collected, root)


def json_lines(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
```

`scripts/reflect_daily.py`의 `main`에서 `subprocess.run([PYTHON, "export_data.py"], cwd=ROOT, check=True)` 바로 다음 줄에:

```python
            from scripts.daily_state import build_daily_state, build_history
            print(f"하루 상태: {build_daily_state(day, verdicts, decisions, ROOT)}")
            print(f"이력: {build_history(ROOT)}")
```

이 Task에서는 위 세 줄 중 **처음 두 줄만** 넣는다(`build_history`는 Task 3에서 만들고 그때 세 번째 줄을 더한다):

```python
            from scripts.daily_state import build_daily_state
            print(f"하루 상태: {build_daily_state(day, verdicts, decisions, ROOT)}")
```

넣을 것이 없어 export를 안 하는 날(`else: deploy_note = "넣을 것이 없어..."`)에도 상태 파일은 써야 한다. 그 `else` 블록 첫 줄에 같은 두 줄을 넣는다.

- [ ] **Step 7: 통과 확인**

Run: `python -m pytest tests/test_daily_state.py -q`
Expected: 12 passed

테스트에서 `build_daily_state`를 부르면 실제 네트워크로 나간다. 그런 테스트를 새로 쓰면 `monkeypatch.setattr(daily_state, "fetch_banners", lambda: [])`로 막는다.

- [ ] **Step 8: 일일 판정 단계 `8d` (실패 테스트)**

```python
# tests/test_check_routine_daily_state.py
from scripts.check_routine import judge_daily_state


def test_missing_daily_file_fails(tmp_path):
    v, why = judge_daily_state("2026-10-09", tmp_path)
    assert v == "FAIL" and "data/daily/2026-10-09.json" in why


def test_daily_file_present_passes(tmp_path):
    (tmp_path / "data" / "daily").mkdir(parents=True)
    (tmp_path / "data" / "daily" / "2026-10-09.json").write_text(
        '{"date":"2026-10-09","pairs":[{"state":"published"}],"collectedPlatforms":["baemin"]}', encoding="utf-8")
    v, why = judge_daily_state("2026-10-09", tmp_path)
    assert v == "PASS" and "1" in why
```

Run: `python -m pytest tests/test_check_routine_daily_state.py -q`
Expected: FAIL `ImportError`

- [ ] **Step 9: 구현**

`scripts/check_routine.py`:

```python
def judge_daily_state(day: str, root: Path) -> tuple[str, str]:
    """하루 상태 파일(설계 2026-10-09). 손 재수집 뒤 reflect를 다시 안 돌리면 여기서 걸린다."""
    p = root / "data" / "daily" / f"{day}.json"
    if not p.exists():
        return "FAIL", f"data/daily/{day}.json 없음 — reflect_daily.py --apply(손 재수집이면 --pass)"
    body = json.loads(p.read_text(encoding="utf-8"))
    return "PASS", f"쌍 {len(body.get('pairs') or [])}개 · 수집 플랫폼 {', '.join(body.get('collectedPlatforms') or [])}"
```

`STEPS` 목록 끝에 `"8d"`를 더하고, `judge()`가 결과 목록을 돌려주기 직전에 `results.append(("8d", *judge_daily_state(day, ROOT)))`를 넣는다(`ROOT`가 없으면 `ROOT = Path(__file__).resolve().parent.parent`).

- [ ] **Step 10: 전체 확인과 커밋**

Run: `python -m pytest tests -q 2>&1 | tail -1`
Expected: 전부 통과. `check_routine` 기존 테스트가 `STEPS` 개수를 세다 깨지면 그 테스트의 기대값에 `8d`를 더한다.

```bash
git add scripts/daily_state.py scripts/reflect_daily.py scripts/check_routine.py tests/test_daily_state.py tests/test_check_routine_daily_state.py
git commit -m "feat(history): 반영 단계가 하루 상태 파일을 쓰고 일일 판정이 확인한다"
```

---

### Task 3: 지난 날짜 복원과 history.json (tracker)

**Files:**
- Modify: `scripts/daily_state.py` (`backfill`, `build_history`, CLI)
- Modify: `scripts/reflect_daily.py` (`build_history` 호출 추가)
- Modify: `scripts/deploy_export.py` (올릴 파일 목록)
- Test: `tests/test_daily_state.py`

**Interfaces:**
- Consumes: `classify`, `write_day` (Task 1, 2)
- Produces:
  - `backfill_day(day: str, ledger: list[dict], export: list[dict], stage_failed: set[str]) -> tuple[list[dict], set[str]]`
    - 그날 원장 관측(`captured_at` 날짜가 day, `excluded` 없음)을 `ok`로, `excluded`는 Task 2 규칙으로 관측을 만들고 `classify`에 넘긴다.
    - `collected` = 그날 관측이 있는 플랫폼 − `stage_failed`가 가리키는 플랫폼은 빼지 않는다(관측이 있으면 수집된 것).
  - `build_history(root: Path) -> Path`: `data/daily/*.json`을 날짜순으로 접어 `data/history.json`에 `{"generatedAt", "days": [{date, platform, brand, state, reason?, max?}], "coverage": [{date, platforms}]}`를 쓴다.
  - CLI: `python scripts/daily_state.py backfill --from 2026-07-27 --to 2026-10-08` / `python scripts/daily_state.py history`

복원 규칙:
- 그날 export는 `git log --format=%H --until="<day> 23:59:59 +0900" -1 -- data/export.json`이 가리키는 커밋의 `data/export.json`. 그런 커밋이 없으면(08-02 전) export는 빈 목록이다.
- 보고서 `reports/routine-<day>.md`가 없으면 파일에 `"unknown": true`를 단다. `uncollected` 줄은 그대로 두고, API가 `unknown` 파일의 `uncollected`를 `UNKNOWN`으로 읽는다(Task 5).
- 복원 파일에는 `"backfilled": true`.
- 이미 있는 상태 파일(반영 단계가 쓴 것)은 덮지 않는다.

- [ ] **Step 1: 실패하는 테스트**

```python
# tests/test_daily_state.py 에 추가
from scripts.daily_state import backfill_day, build_history


def test_backfill_day_uses_that_days_ledger_and_export():
    ledger = [
        {"platform": "coupangeats", "brand": "청년피자", "amount": 10000, "captured_at": "2026-10-08T01:41:38+09:00"},
        {"platform": "coupangeats", "brand": "청년피자", "amount": 7500, "captured_at": "2026-10-07T01:41:38+09:00"},
        {"platform": "baemin", "brand": "KFC", "amount": 9000, "captured_at": "2026-10-08T00:10:00+09:00",
         "excluded": {"reason": "limited"}},
    ]
    export = [{"platform": "coupangeats", "brand": "청년피자", "amount": 10000},
              {"platform": "yogiyo", "brand": "BBQ", "amount": 3000}]
    rows, collected = backfill_day("2026-10-08", ledger, export, set())
    by = {(r["platform"], r["brand"]): r for r in rows}
    assert by[("coupangeats", "청년피자")] == {"platform": "coupangeats", "brand": "청년피자", "state": "published", "max": 10000}
    assert by[("yogiyo", "BBQ")]["state"] == "uncollected"
    assert ("baemin", "KFC") not in by
    assert collected == {"coupangeats", "baemin"}


def test_build_history_folds_daily_files(tmp_path):
    d = tmp_path / "data" / "daily"
    d.mkdir(parents=True)
    for day, state in (("2026-10-08", "published"), ("2026-10-09", "uncollected")):
        (d / f"{day}.json").write_text(json.dumps({
            "date": day, "collectedPlatforms": ["coupangeats"] if state == "published" else [],
            "pairs": [{"platform": "coupangeats", "brand": "청년피자", "state": state, "max": 10000}]}), encoding="utf-8")
    body = json.loads(build_history(tmp_path).read_text(encoding="utf-8"))
    assert [x["date"] for x in body["days"]] == ["2026-10-08", "2026-10-09"]
    assert body["days"][1] == {"date": "2026-10-09", "platform": "coupangeats", "brand": "청년피자",
                               "state": "uncollected", "max": 10000}
    assert body["coverage"] == [{"date": "2026-10-08", "platforms": ["coupangeats"]},
                                {"date": "2026-10-09", "platforms": []}]


def test_build_history_marks_unknown_days(tmp_path):
    d = tmp_path / "data" / "daily"
    d.mkdir(parents=True)
    (d / "2026-08-01.json").write_text(json.dumps({"date": "2026-08-01", "unknown": True, "collectedPlatforms": [],
        "pairs": [{"platform": "baemin", "brand": "BBQ", "state": "uncollected", "max": 3000}]}), encoding="utf-8")
    body = json.loads(build_history(tmp_path).read_text(encoding="utf-8"))
    assert body["days"][0]["state"] == "unknown"
```

- [ ] **Step 2: 실패 확인**

Run: `python -m pytest tests/test_daily_state.py -q`
Expected: FAIL `ImportError: cannot import name 'backfill_day'`

- [ ] **Step 3: 구현**

```python
import subprocess
import sys


def backfill_day(day: str, ledger: list[dict], export: list[dict], stage_failed: set[str]):
    canon = _canon()
    todays = [r for r in ledger if (r.get("captured_at") or "")[:10] == day]
    obs = [_obs(r, "ok", canon) for r in todays if not r.get("excluded")]
    obs += observations_from([], {}, [r for r in todays if r.get("excluded")])
    collected = {r["platform"] for r in todays}
    export = [{**r, "brand": canon.get(r["brand"], r["brand"])} for r in export]
    return classify(day, obs, export, collected), collected


def _export_at(day: str, root: Path) -> list[dict]:
    sha = subprocess.run(["git", "log", "--format=%H", f"--until={day} 23:59:59 +0900", "-1", "--", "data/export.json"],
                         cwd=root, capture_output=True, text=True).stdout.strip()
    if not sha:
        return []
    blob = subprocess.run(["git", "show", f"{sha}:data/export.json"], cwd=root, capture_output=True,
                          text=True, encoding="utf-8").stdout
    return json.loads(blob) if blob.strip() else []


def backfill(start: str, end: str, root: Path) -> list[Path]:
    ledger = json_lines(root / "data" / "log.jsonl")
    out = []
    d, last = datetime.date.fromisoformat(start), datetime.date.fromisoformat(end)
    while d <= last:
        day = d.isoformat()
        path = root / "data" / "daily" / f"{day}.json"
        if not path.exists():
            rows, collected = backfill_day(day, ledger, _export_at(day, root), set())
            p = write_day(day, {}, rows, collected, root)
            body = json.loads(p.read_text(encoding="utf-8"))
            body["backfilled"] = True
            if not (root / "reports" / f"routine-{day}.md").exists():
                body["unknown"] = True
            p.write_text(json.dumps(body, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
            out.append(p)
        d += datetime.timedelta(days=1)
    return out


def build_history(root: Path) -> Path:
    days, coverage = [], []
    for p in sorted((root / "data" / "daily").glob("*.json")):
        body = json.loads(p.read_text(encoding="utf-8"))
        coverage.append({"date": body["date"], "platforms": body.get("collectedPlatforms") or []})
        for r in body.get("pairs") or []:
            row = {"date": body["date"], **{k: r[k] for k in ("platform", "brand", "state", "reason", "max") if k in r}}
            if body.get("unknown") and row["state"] == "uncollected":
                row["state"] = "unknown"
            days.append(row)
    path = root / "data" / "history.json"
    path.write_text(json.dumps({"generatedAt": datetime.datetime.now().astimezone().replace(microsecond=0).isoformat(),
                                "days": days, "coverage": coverage}, ensure_ascii=False) + "\n",
                    encoding="utf-8", newline="\n")
    return path


def main(argv: list[str] | None = None) -> int:
    import argparse
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("backfill")
    b.add_argument("--from", dest="start", required=True)
    b.add_argument("--to", dest="end", required=True)
    sub.add_parser("history")
    args = ap.parse_args(argv)
    if args.cmd == "backfill":
        print(f"복원 {len(backfill(args.start, args.end, ROOT))}일")
    print(f"이력: {build_history(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    sys.exit(main())
```

`ROOT = Path(__file__).resolve().parent.parent`를 모듈 위쪽에 둔다(이미 있으면 그대로).

- [ ] **Step 4: 통과 확인**

Run: `python -m pytest tests/test_daily_state.py -q`
Expected: 15 passed

- [ ] **Step 5: 실제 원장으로 복원해 보기 (워크트리 안, 운영 무관)**

```bash
python scripts/daily_state.py backfill --from 2026-07-27 --to 2026-10-09
python - <<'EOF'
import json
h = json.load(open("data/history.json", encoding="utf-8"))
print(len(h["days"]), "줄,", len(h["coverage"]), "일")
for d in h["days"]:
    if d["brand"] == "청년피자" and d["platform"] == "coupangeats" and d["date"] >= "2026-10-05":
        print(d)
EOF
```
Expected: 75일 안팎, 수천 줄. 청년피자 쿠팡이츠 10-05~10-09가 `published` 10,000원으로 나온다. 결과(줄 수, 청년피자 줄)를 보고서에 적는다.

- [ ] **Step 6: reflect와 배포 목록 연결**

`scripts/reflect_daily.py`: Task 2에서 넣은 두 곳(export 직후, `else` 블록)의 `build_daily_state` 줄 다음에:

```python
            from scripts.daily_state import build_history
            print(f"이력: {build_history(ROOT)}")
```

`scripts/deploy_export.py`: 서버 경로 상수 옆에

```python
REMOTE_HISTORY = os.environ.get(
    "DEPLOY_REMOTE_HISTORY", "<서버>/delivery-discount-api/data/history.json")
```

를 두고, export.json을 올리는 함수가 같은 방식으로 `data/history.json`도 올리게 한다. **이 계획에서는 실행하지 않는다**(출시 단계에서 사람이 한다). 테스트로 목록만 확인한다:

```python
# tests/test_daily_state.py 에 추가
def test_deploy_export_knows_history_path():
    src = (ROOT / "scripts" / "deploy_export.py").read_text(encoding="utf-8")
    assert "REMOTE_HISTORY" in src and "data/history.json" in src
```

- [ ] **Step 7: 전체 확인과 커밋**

Run: `python -m pytest tests -q 2>&1 | tail -1` 그리고 `DISCOUNT_BRANDS_YML=C:/none python -m pytest tests -q 2>&1 | tail -1`
Expected: 둘 다 통과.

```bash
git add scripts/daily_state.py scripts/reflect_daily.py scripts/deploy_export.py tests/test_daily_state.py data/daily data/history.json
git commit -m "feat(history): 지난 날짜 복원과 history.json"
```

---

### Task 4: API 이력 도메인 (mono/api)

**Files:**
- Create: `mono/api/src/main/java/com/discounttracker/history/DayState.java`
- Create: `mono/api/src/main/java/com/discounttracker/history/WithheldReason.java`
- Create: `mono/api/src/main/java/com/discounttracker/history/BrandDay.java`
- Create: `mono/api/src/main/java/com/discounttracker/history/OfferHistory.java`
- Test: `mono/api/src/test/java/com/discounttracker/history/OfferHistoryTest.java`

**Interfaces:**
- Produces:
  - `enum DayState { PUBLISHED, WITHHELD, UNCOLLECTED, ABSENT, UNKNOWN; static DayState of(String) }`
  - `enum WithheldReason { HELD_HUMAN(true), REJECTED(false), STAGE_SUSPECT(false), MISREAD(false), EXPIRED(true); boolean trustsValue(); boolean countsAsCollected(); static WithheldReason of(String) }` (`EXPIRED`는 `ABSENT`의 사유로만 온다)
  - `record BrandDay(LocalDate date, String platform, String brand, DayState state, WithheldReason reason, Integer max)` + `boolean collected()`, `Integer trustedAmount()`
  - `enum Novelty { NEW, NOT_NEW, UNKNOWN; Boolean asBoolean() }` (`OfferHistory` 안 중첩)
  - `OfferHistory(List<BrandDay> days, Map<LocalDate, Set<String>> coverage)`
    - `Novelty novelty(String platform, String brand, int amount, LocalDate today)`
    - `List<Point> bestSeries(String brand, LocalDate from, LocalDate to)` — `record Point(LocalDate date, Integer amount, String line, String reason)`, `line` ∈ `solid | carried | break`
    - `Summary summary(String brand, LocalDate today)` — `record Summary(Integer maxEver, LocalDate maxEverOn, Integer current, Integer daysSinceHigher)`
    - `static OfferHistory empty()`, `boolean isEmpty()`

판정 규칙:
- `novelty`: 이력이 비면 `UNKNOWN`. coverage에서 `today`보다 앞이고 그 플랫폼이 들어 있는 날짜를 최근부터 훑는다. 그날 그 쌍의 `BrandDay`가
  - 없거나 `ABSENT`면 → `NEW`
  - `collected()`이고 `trustedAmount()`가 있으면 → `amount > max`면 `NEW`, 아니면 `NOT_NEW`
  - 그 밖(`UNCOLLECTED`, `UNKNOWN`, 못 믿는 `WITHHELD`)이면 → 더 앞 날짜로
  - coverage가 끝나면 → `UNKNOWN`
- coverage에 플랫폼이 없는 날(그 플랫폼 수집 실패)은 처음부터 건너뛴다.
- `bestSeries`: 날짜마다 그 브랜드의 쌍들 중 `trustedAmount()` 최대가 있으면 `solid`. 없고 `UNCOLLECTED`, `UNKNOWN`, 못 믿는 `WITHHELD`가 있으면 `carried`(금액은 직전 `solid` 금액, 사유는 첫 `WITHHELD` 사유의 소문자 이름). 없고 그 날짜 coverage가 비어 있지 않으면 이전에 `solid`가 있었을 때만 `break`. 첫 `solid` 전 날짜는 빼고, `carried`인데 직전 `solid`가 없으면 뺀다.
- `summary`: 전 기간 `solid` 최대와 그 첫 날짜, `today` 점의 금액(`solid`나 `carried`), `daysSinceHigher` = `today`보다 앞 `solid` 중 금액 ≥ current인 가장 최근 날짜까지 일수(없으면 null).

- [ ] **Step 1: 실패하는 테스트**

```java
// mono/api/src/test/java/com/discounttracker/history/OfferHistoryTest.java
package com.discounttracker.history;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class OfferHistoryTest {

    static LocalDate d(String s) { return LocalDate.parse(s); }

    static BrandDay day(String date, String platform, String brand, DayState s, WithheldReason r, Integer max) {
        return new BrandDay(d(date), platform, brand, s, r, max);
    }

    static Map<LocalDate, Set<String>> cov(String... dateAndPlatforms) {
        Map<LocalDate, Set<String>> m = new TreeMap<>();
        for (String x : dateAndPlatforms) {
            String[] p = x.split("=");
            m.put(d(p[0]), p.length > 1 ? Set.of(p[1].split(",")) : Set.of());
        }
        return m;
    }

    @Test
    void cheongnyeonPizzaCaseIsNotNewAfterAFailedCouponBoxDay() {
        // 10-08 허브 10,000원 반영, 10-09 쿠폰함 실패여도 허브는 반영. 10-09의 10,000원은 신규가 아니다.
        var h = new OfferHistory(List.of(
                day("2026-10-08", "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000),
                day("2026-10-09", "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000)),
                cov("2026-10-08=coupangeats", "2026-10-09=coupangeats"));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("coupangeats", "청년피자", 10000, d("2026-10-09")));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("coupangeats", "청년피자", 7500, d("2026-10-09")));
        assertEquals(OfferHistory.Novelty.NEW, h.novelty("coupangeats", "청년피자", 11000, d("2026-10-09")));
    }

    @Test
    void uncollectedDaysAreSkippedBackToTheLastCollectedDay() {
        // 월요일 전수로만 보이는 브랜드: 화~일 uncollected, 다음 월요일 같은 금액은 신규 아님.
        var h = new OfferHistory(List.of(
                day("2026-10-05", "ddangyo", "BBQ", DayState.PUBLISHED, null, 3000),
                day("2026-10-06", "ddangyo", "BBQ", DayState.UNCOLLECTED, null, 3000),
                day("2026-10-07", "ddangyo", "BBQ", DayState.UNCOLLECTED, null, 3000)),
                cov("2026-10-05=ddangyo", "2026-10-06=ddangyo", "2026-10-07=ddangyo"));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("ddangyo", "BBQ", 3000, d("2026-10-12")));
    }

    @Test
    void absentOnPreviousCollectedDayMakesNextAppearanceNew() {
        var h = new OfferHistory(List.of(
                day("2026-10-07", "baemin", "KFC", DayState.PUBLISHED, null, 5000),
                day("2026-10-08", "baemin", "KFC", DayState.ABSENT, null, null)),
                cov("2026-10-07=baemin", "2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NEW, h.novelty("baemin", "KFC", 5000, d("2026-10-09")));
    }

    @Test
    void brandNeverSeenOnACollectedPlatformIsNew() {
        var h = new OfferHistory(List.of(day("2026-10-08", "baemin", "BBQ", DayState.PUBLISHED, null, 3000)),
                cov("2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NEW, h.novelty("baemin", "노모어피자", 7000, d("2026-10-09")));
    }

    @Test
    void platformFailedDayIsSkippedEvenIfOthersRan() {
        var h = new OfferHistory(List.of(day("2026-10-07", "coupangeats", "KFC", DayState.PUBLISHED, null, 7000)),
                cov("2026-10-07=coupangeats", "2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("coupangeats", "KFC", 7000, d("2026-10-09")));
    }

    @Test
    void emptyHistoryIsUnknown() {
        assertEquals(OfferHistory.Novelty.UNKNOWN, OfferHistory.empty().novelty("baemin", "BBQ", 1, d("2026-10-09")));
        assertNull(OfferHistory.Novelty.UNKNOWN.asBoolean());
    }

    @Test
    void untrustedWithheldIsSkippedTrustedCounts() {
        var h = new OfferHistory(List.of(
                day("2026-10-07", "baemin", "BBQ", DayState.PUBLISHED, null, 3000),
                day("2026-10-08", "baemin", "BBQ", DayState.WITHHELD, WithheldReason.STAGE_SUSPECT, null)),
                cov("2026-10-07=baemin", "2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("baemin", "BBQ", 3000, d("2026-10-09")));
        var h2 = new OfferHistory(List.of(
                day("2026-10-08", "baemin", "BBQ", DayState.WITHHELD, WithheldReason.HELD_HUMAN, 4000)),
                cov("2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NEW, h2.novelty("baemin", "BBQ", 5000, d("2026-10-09")));
    }

    @Test
    void everyWithheldReasonAnswersBothQuestions() {
        for (WithheldReason r : WithheldReason.values()) {
            assertEquals(r.trustsValue(), r.countsAsCollected(), r.name());
        }
    }

    @Test
    void bestSeriesIsPlatformAgnosticMaxWithCarriedAndBreak() {
        var h = new OfferHistory(List.of(
                day("2026-10-05", "baemin", "BBQ", DayState.PUBLISHED, null, 3000),
                day("2026-10-05", "yogiyo", "BBQ", DayState.PUBLISHED, null, 5000),
                day("2026-10-06", "baemin", "BBQ", DayState.UNCOLLECTED, null, 3000),
                day("2026-10-06", "yogiyo", "BBQ", DayState.WITHHELD, WithheldReason.STAGE_SUSPECT, null),
                day("2026-10-07", "baemin", "BBQ", DayState.ABSENT, null, null)),
                cov("2026-10-04=baemin", "2026-10-05=baemin,yogiyo", "2026-10-06=baemin", "2026-10-07=baemin"));
        var s = h.bestSeries("BBQ", d("2026-10-01"), d("2026-10-07"));
        assertEquals(List.of(
                new OfferHistory.Point(d("2026-10-05"), 5000, "solid", null),
                new OfferHistory.Point(d("2026-10-06"), 5000, "carried", "stage_suspect"),
                new OfferHistory.Point(d("2026-10-07"), null, "break", null)), s);
    }

    @Test
    void summaryCountsDaysSinceHigher() {
        var h = new OfferHistory(List.of(
                day("2026-09-23", "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000),
                day("2026-10-01", "coupangeats", "청년피자", DayState.PUBLISHED, null, 7500),
                day("2026-10-09", "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000)),
                cov("2026-09-23=coupangeats", "2026-10-01=coupangeats", "2026-10-09=coupangeats"));
        var sum = h.summary("청년피자", d("2026-10-09"));
        assertEquals(new OfferHistory.Summary(10000, d("2026-09-23"), 10000, 16), sum);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd mono/api && ./gradlew test --tests 'com.discounttracker.history.*' -q`
Expected: 컴파일 실패(`package com.discounttracker.history does not exist`)

- [ ] **Step 3: 구현**

```java
// DayState.java
package com.discounttracker.history;

import java.util.Locale;

/** 하루 상태(설계 2026-10-09). 브랜드와 플랫폼마다 날짜별로 하나다. */
public enum DayState {
    PUBLISHED, WITHHELD, UNCOLLECTED, ABSENT, UNKNOWN;

    public static DayState of(String s) {
        return s == null ? UNKNOWN : valueOf(s.toUpperCase(Locale.ROOT));
    }
}
```

```java
// WithheldReason.java
package com.discounttracker.history;

import java.util.Locale;

/** 보류 사유. 값을 믿을 수 있는 사유만 직전 수집일로 친다(설계 "보류 사유" 표). */
public enum WithheldReason {
    HELD_HUMAN(true), REJECTED(false), STAGE_SUSPECT(false), MISREAD(false), EXPIRED(true);

    private final boolean trusts;

    WithheldReason(boolean trusts) { this.trusts = trusts; }

    public boolean trustsValue() { return trusts; }

    public boolean countsAsCollected() { return trusts; }

    public static WithheldReason of(String s) {
        return s == null ? null : valueOf(s.toUpperCase(Locale.ROOT));
    }

    public String key() { return name().toLowerCase(Locale.ROOT); }
}
```

```java
// BrandDay.java
package com.discounttracker.history;

import java.time.LocalDate;

/** 하루 한 쌍(플랫폼, 브랜드)의 상태와 금액. */
public record BrandDay(LocalDate date, String platform, String brand, DayState state, WithheldReason reason, Integer max) {

    /** 그날 그 쌍을 실제로 봤다고 칠 수 있는가. 직전 수집일 판정에 쓴다. */
    public boolean collected() {
        return switch (state) {
            case PUBLISHED, ABSENT -> true;
            case WITHHELD -> reason != null && reason.countsAsCollected();
            default -> false;
        };
    }

    /** 믿을 수 있는 그날 금액. 없으면 null. */
    public Integer trustedAmount() {
        if (state == DayState.PUBLISHED) return max;
        if (state == DayState.WITHHELD && reason != null && reason.trustsValue()) return max;
        return null;
    }

    boolean untrusted() {
        return state == DayState.UNCOLLECTED || state == DayState.UNKNOWN
                || (state == DayState.WITHHELD && (reason == null || !reason.trustsValue()));
    }
}
```

```java
// OfferHistory.java
package com.discounttracker.history;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** 날짜별 하루 상태 모음. 신규 판정과 최고 할인 그래프가 이것만 읽는다(설계 2026-10-09). */
public final class OfferHistory {

    public enum Novelty {
        NEW, NOT_NEW, UNKNOWN;

        public Boolean asBoolean() { return this == UNKNOWN ? null : this == NEW; }
    }

    public record Point(LocalDate date, Integer amount, String line, String reason) {}

    public record Summary(Integer maxEver, LocalDate maxEverOn, Integer current, Integer daysSinceHigher) {}

    private final Map<String, Map<LocalDate, BrandDay>> byPair = new HashMap<>();
    private final Map<String, NavigableMap<LocalDate, List<BrandDay>>> byBrand = new HashMap<>();
    private final NavigableMap<LocalDate, Set<String>> coverage;

    public OfferHistory(List<BrandDay> days, Map<LocalDate, Set<String>> coverage) {
        this.coverage = new TreeMap<>(coverage);
        for (BrandDay d : days) {
            byPair.computeIfAbsent(d.platform() + "|" + d.brand(), k -> new HashMap<>()).put(d.date(), d);
            byBrand.computeIfAbsent(d.brand(), k -> new TreeMap<>())
                    .computeIfAbsent(d.date(), k -> new ArrayList<>()).add(d);
        }
    }

    public static OfferHistory empty() { return new OfferHistory(List.of(), Map.of()); }

    public boolean isEmpty() { return coverage.isEmpty(); }

    public Novelty novelty(String platform, String brand, int amount, LocalDate today) {
        Map<LocalDate, BrandDay> pair = byPair.getOrDefault(platform + "|" + brand, Map.of());
        for (var e : coverage.headMap(today, false).descendingMap().entrySet()) {
            if (!e.getValue().contains(platform)) continue;
            BrandDay day = pair.get(e.getKey());
            if (day == null || day.state() == DayState.ABSENT) return Novelty.NEW;
            Integer max = day.trustedAmount();
            if (day.collected() && max != null) return amount > max ? Novelty.NEW : Novelty.NOT_NEW;
        }
        return Novelty.UNKNOWN;
    }

    public List<Point> bestSeries(String brand, LocalDate from, LocalDate to) {
        if (coverage.isEmpty()) return List.of();
        NavigableMap<LocalDate, List<BrandDay>> mine = byBrand.getOrDefault(brand, new TreeMap<>());
        List<Point> out = new ArrayList<>();
        Integer lastSolid = null;
        for (var e : coverage.subMap(coverage.firstKey(), true, to, true).entrySet()) {
            LocalDate date = e.getKey();
            List<BrandDay> that = mine.getOrDefault(date, List.of());
            Integer best = that.stream().map(BrandDay::trustedAmount).filter(Objects::nonNull).max(Integer::compare).orElse(null);
            Point p = null;
            if (best != null) {
                lastSolid = best;
                p = new Point(date, best, "solid", null);
            } else if (that.stream().anyMatch(BrandDay::untrusted)) {
                if (lastSolid != null) {
                    String reason = that.stream().filter(d -> d.state() == DayState.WITHHELD && d.reason() != null)
                            .map(d -> d.reason().key()).findFirst().orElse(null);
                    p = new Point(date, lastSolid, "carried", reason);
                }
            } else if (lastSolid != null && !e.getValue().isEmpty()) {
                p = new Point(date, null, "break", null);
            }
            if (p != null && !date.isBefore(from)) out.add(p);
        }
        return out;
    }

    public Summary summary(String brand, LocalDate today) {
        LocalDate first = coverage.isEmpty() ? today : coverage.firstKey();
        List<Point> all = bestSeries(brand, first, today);
        Integer maxEver = null;
        LocalDate maxOn = null;
        for (Point p : all) {
            if ("solid".equals(p.line()) && (maxEver == null || p.amount() > maxEver)) {
                maxEver = p.amount();
                maxOn = p.date();
            }
        }
        Point last = all.isEmpty() ? null : all.get(all.size() - 1);
        Integer current = last != null && last.date().equals(today) ? last.amount() : null;
        Integer since = null;
        if (current != null) {
            for (int i = all.size() - 2; i >= 0; i--) {
                Point p = all.get(i);
                if ("solid".equals(p.line()) && p.amount() >= current) {
                    since = (int) ChronoUnit.DAYS.between(p.date(), today);
                    break;
                }
            }
        }
        return new Summary(maxEver, maxOn, current, since);
    }
}
```

- [ ] **Step 4: 통과 확인**

Run: `./gradlew test --tests 'com.discounttracker.history.*' -q`
Expected: 통과(10 tests)

- [ ] **Step 5: 커밋**

```bash
cd mono
git add api/src/main/java/com/discounttracker/history api/src/test/java/com/discounttracker/history
git commit -m "feat(api): 할인 이력 도메인(하루 상태, 신규 판정, 최고 할인 선)"
```

---

### Task 5: 이력 읽기, 오퍼 isNew, 푸시 교체 (mono/api)

**Files:**
- Create: `mono/api/src/main/java/com/discounttracker/history/HistoryRepository.java`
- Create: `mono/api/src/test/resources/data/history.json` (픽스처)
- Modify: `mono/api/src/main/resources/application.yml` (`discount.history-path`)
- Modify: `mono/api/src/main/java/com/discounttracker/offer/Offer.java` (`isNew` 칸)
- Modify: `mono/api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java`
- Modify: `mono/api/src/main/java/com/discounttracker/push/NewOfferNotificationService.java`
- Modify: `mono/api/src/main/java/com/discounttracker/web/BrandController.java` (reload)
- Modify: `mono/api/src/test/resources/contracts/offer-cases.json` (`offerKeys`에 `isNew`)
- Test: `HistoryRepositoryTest`, `BrandComparisonServiceTest`, `NewOfferNotificationServiceTest`

**Interfaces:**
- Consumes: `OfferHistory`, `BrandDay`, `DayState`, `WithheldReason` (Task 4)
- Produces:
  - `HistoryRepository(@Value("${discount.history-path}") Resource source)`: `OfferHistory current()`, `boolean reload()` (못 읽으면 `OfferHistory.empty()`와 warn 로그, false)
  - `Offer.isNew()` → `Boolean` (JSON `"isNew"`), `Offer withIsNew(Boolean v)`
  - `BrandComparisonService`가 오퍼마다 `offer.withIsNew(history.novelty(platform, brand.name(), amount, today).asBoolean())` (금액 없는 오퍼는 null)

- [ ] **Step 1: 실패하는 테스트 (리포지토리)**

```java
// mono/api/src/test/java/com/discounttracker/history/HistoryRepositoryTest.java
package com.discounttracker.history;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class HistoryRepositoryTest {

    @Test
    void readsDaysAndCoverage() {
        String json = """
                {"generatedAt":"2026-10-09T01:46:10+09:00",
                 "days":[{"date":"2026-10-08","platform":"coupangeats","brand":"청년피자","state":"published","max":10000}],
                 "coverage":[{"date":"2026-10-08","platforms":["coupangeats"]}]}
                """;
        var repo = new HistoryRepository(new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8)));
        assertTrue(repo.reload());
        assertEquals(OfferHistory.Novelty.NOT_NEW,
                repo.current().novelty("coupangeats", "청년피자", 10000, LocalDate.parse("2026-10-09")));
    }

    @Test
    void missingFileGivesEmptyHistoryNotACrash() {
        var repo = new HistoryRepository(new FileSystemResource("C:/none/history.json"));
        assertFalse(repo.reload());
        assertTrue(repo.current().isEmpty());
    }

    @Test
    void brokenFileGivesEmptyHistory() {
        var repo = new HistoryRepository(new ByteArrayResource("{".getBytes(StandardCharsets.UTF_8)));
        assertFalse(repo.reload());
        assertTrue(repo.current().isEmpty());
    }
}
```

Run: `./gradlew test --tests 'com.discounttracker.history.HistoryRepositoryTest' -q`
Expected: 컴파일 실패(`HistoryRepository` 없음)

- [ ] **Step 2: 구현**

```java
// HistoryRepository.java
package com.discounttracker.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.time.LocalDate;
import java.util.*;

/** tracker가 만든 history.json을 들고 있는다. 못 읽으면 빈 이력 — 판정은 모름이 되고 푸시는 안 나간다. */
@Component
public class HistoryRepository {

    private static final Logger log = LoggerFactory.getLogger(HistoryRepository.class);
    private final Resource source;
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile OfferHistory current = OfferHistory.empty();

    public HistoryRepository(@Value("${discount.history-path}") Resource source) {
        this.source = source;
        reload();
    }

    public OfferHistory current() { return current; }

    public boolean reload() {
        if (!source.exists()) {
            log.warn("history.json이 없다 — 신규 판정은 모름으로 둔다. source={}", source);
            current = OfferHistory.empty();
            return false;
        }
        try (InputStream in = source.getInputStream()) {
            JsonNode root = mapper.readTree(in);
            List<BrandDay> days = new ArrayList<>();
            for (JsonNode n : root.path("days")) {
                days.add(new BrandDay(LocalDate.parse(n.get("date").asText()), n.get("platform").asText(),
                        n.get("brand").asText(), DayState.of(n.path("state").asText(null)),
                        WithheldReason.of(n.path("reason").asText(null)),
                        n.hasNonNull("max") ? n.get("max").asInt() : null));
            }
            Map<LocalDate, Set<String>> coverage = new TreeMap<>();
            for (JsonNode n : root.path("coverage")) {
                Set<String> ps = new HashSet<>();
                n.path("platforms").forEach(p -> ps.add(p.asText()));
                coverage.put(LocalDate.parse(n.get("date").asText()), ps);
            }
            current = new OfferHistory(days, coverage);
            log.info("history.json 로드 — {}줄, {}일", days.size(), coverage.size());
            return true;
        } catch (Exception e) {
            log.warn("history.json 읽기 실패 — 신규 판정은 모름으로 둔다. source={}", source, e);
            current = OfferHistory.empty();
            return false;
        }
    }
}
```

`application.yml`의 `discount:` 아래 `export-path` 다음 줄에:

```yaml
  history-path: ${DISCOUNT_HISTORY_PATH:classpath:data/history.json}
```

`mono/api/src/main/resources/data/history.json`에 빈 픽스처를 둔다(classpath 기본값이 존재해야 테스트 컨텍스트가 뜬다):

```json
{"generatedAt": null, "days": [], "coverage": []}
```

Run: `./gradlew test --tests 'com.discounttracker.history.*' -q`
Expected: 통과

- [ ] **Step 3: Offer에 isNew (실패 테스트)**

`BrandComparisonServiceTest`에 추가. 이 클래스의 `serviceWith(...)` 도우미가 새 생성자 인자를 받게 Step 4에서 고친다. 테스트는 이력 `OfferHistory`를 직접 넘기는 도우미 `serviceWithHistory(records, brands, clock, banners, history)`를 쓴다:

```java
    @Test
    void offersCarryNoveltyFromHistory() {
        String brands = """
                brands:
                  청년피자:
                    category: pizza
                """;
        var history = new com.discounttracker.history.OfferHistory(
                List.of(new com.discounttracker.history.BrandDay(java.time.LocalDate.parse("2026-08-19"),
                        "coupangeats", "청년피자", com.discounttracker.history.DayState.PUBLISHED, null, 10000)),
                Map.of(java.time.LocalDate.parse("2026-08-19"), Set.of("coupangeats")));
        var record = OfferRecordFixtures.coupangeats("청년피자", 10000);
        Offer offer = serviceWithHistory(List.of(record), brands, on("2026-08-20"), "", history)
                .compare().get(0).offers().get(0);
        assertEquals(Boolean.FALSE, offer.isNew());
    }

    @Test
    void offersAreUnknownWhenHistoryIsEmpty() {
        String brands = """
                brands:
                  청년피자:
                    category: pizza
                """;
        var record = OfferRecordFixtures.coupangeats("청년피자", 10000);
        Offer offer = serviceWithHistory(List.of(record), brands, on("2026-08-20"), "",
                com.discounttracker.history.OfferHistory.empty()).compare().get(0).offers().get(0);
        assertNull(offer.isNew());
    }
```

이 테스트 파일에 이미 원장 레코드를 만드는 도우미가 있으면(파일에서 `new OfferRecord(` 쓰는 private 메서드를 찾는다) 그것을 쓰고 `OfferRecordFixtures`는 만들지 않는다. 없으면 같은 테스트 패키지에 만든다:

```java
// mono/api/src/test/java/com/discounttracker/comparison/OfferRecordFixtures.java
package com.discounttracker.comparison;

import com.discounttracker.offer.OfferRecord;

final class OfferRecordFixtures {
    static OfferRecord coupangeats(String brand, int amount) {
        return new OfferRecord("coupangeats", brand, amount, null, false, "discount", "위클리 슈퍼딜 > 브랜드 할인",
                amount + "원할인", "2026-08-20T00:13:20+09:00", null, null, "exclusive", null, null,
                "2026-08-23", null, null, "none", false);
    }
}
```

Run: `./gradlew test --tests 'com.discounttracker.comparison.BrandComparisonServiceTest' -q`
Expected: 컴파일 실패(`isNew()`, `serviceWithHistory` 없음)

- [ ] **Step 4: 구현**

`Offer.java`: 레코드 마지막 컴포넌트 `String firstSeenAt` 뒤에 `@JsonProperty("isNew") Boolean isNew`를 더한다. 레코드를 만드는 세 자리(`Offer.from` 68행 부근, 병합 185행 부근, 242행 부근)에 마지막 인자를 더한다: `from`은 `null`, 병합은 `isNew`(이긴 쪽 값), 242행은 `isNew`. 그리고:

```java
    /** 이력이 판정한 신규 여부(설계 2026-10-09). null = 모름. */
    public Offer withIsNew(Boolean v) {
        return new Offer(platform, amount, qualifier, status, rawText, screenshotPath, capturedAt, minOrderAmount,
                tierMode, tiers, conditions, expiresAt, badge, soldOut, link, membership, fromBanner, firstCome,
                certainty, kind, firstSeenAt, v);
    }
```

(필드 이름과 순서는 `Offer.java`의 실제 레코드 헤더를 그대로 따른다. 위 나열은 185행 병합 생성자 호출의 순서다.)

`BrandComparisonService`: 생성자에 `HistoryRepository history`를 받는다. 오퍼 목록을 `BrandComparison`으로 묶기 직전(오퍼 정렬 뒤)에:

```java
        var h = history.current();
        LocalDate today = LocalDate.now(clock);
        offers = offers.stream()
                .map(o -> o.amount() == null ? o
                        : o.withIsNew(h.novelty(o.platform(), brand.name(), o.amount(), today).asBoolean()))
                .toList();
```

(`clock`은 이 서비스가 이미 쓰는 `Clock` 필드다. `today` 변수가 이미 있으면 그것을 쓴다.)

`BrandComparisonServiceTest`의 `serviceWith(...)`는 `HistoryRepository`를 빈 이력으로 넘기게 고치고, 이력을 받는 `serviceWithHistory(...)`를 추가한다. `HistoryRepository`를 테스트에서 쉽게 만들도록 패키지 공개 생성자를 하나 둔다:

```java
    /** 테스트용: 이력을 바로 넣는다. */
    public static HistoryRepository of(OfferHistory h) {
        HistoryRepository r = new HistoryRepository(new org.springframework.core.io.ByteArrayResource(
                "{\"days\":[],\"coverage\":[]}".getBytes()));
        r.current = h;
        return r;
    }
```

Run: `./gradlew test --tests 'com.discounttracker.comparison.*' -q`
Expected: 통과

- [ ] **Step 5: 푸시 교체 (실패 테스트)**

`NewOfferNotificationServiceTest`에 추가(기존 테스트가 `firstSeenAt` 오늘인 오퍼로 후보를 만드는 자리를 찾아 같은 도우미를 쓴다):

```java
    @Test
    void onlyOffersJudgedNewAreCandidates() {
        Offer newOne = offer("coupangeats", 10000).withIsNew(true);
        Offer old = offer("coupangeats", 9000).withIsNew(false);
        Offer unknown = offer("baemin", 12000).withIsNew(null);
        var targets = NewOfferNotificationService.candidates(
                List.of(brand("청년피자", newOne, old), brand("BBQ", unknown)), LocalDate.parse("2026-10-09"));
        assertEquals(List.of("청년피자"), targets.stream().map(DailyOfferNotification.Target::brand).toList());
    }
```

(`offer(...)`, `brand(...)`는 이 테스트 파일의 기존 도우미 이름을 쓴다. 없으면 파일 안 기존 오퍼 생성 코드를 복사해 만든다.)

Run: `./gradlew test --tests 'com.discounttracker.push.*' -q`
Expected: FAIL(지금은 `firstSeenAt` 기준이라 후보가 다르다)

- [ ] **Step 6: 구현**

`NewOfferNotificationService`의 `seenToday(offer.firstSeenAt(), day)` 두 곳(183행, 194행 부근)을 `Boolean.TRUE.equals(offer.isNew())`로 바꾼다. `seenToday` 메서드는 더 쓰이지 않으면 지운다. `Target`의 `firstSeenAt` 칸은 그대로 둔다(알림 문구가 쓰면 유지).

Run: `./gradlew test -q`
Expected: 전체 통과. `firstSeenAt` 오늘을 근거로 후보를 기대하던 기존 푸시 테스트는 그 오퍼에 `.withIsNew(true)`를 붙여 같은 기대를 유지한다.

- [ ] **Step 7: reload와 계약**

`BrandController.reload()`에서 `offers.reload();` 다음 줄에 `boolean historyOk = history.reload();`를 넣고, 응답 `Map.entry` 목록에 `Map.entry("historyOk", historyOk)`를 더한다(생성자에 `HistoryRepository history` 주입).

`api/src/test/resources/contracts/offer-cases.json`의 `offerKeys` 배열에 `"isNew"`를 더한다. 각 케이스의 기대 `offer` JSON에 `"isNew": null`이 필요하면 더한다(`OfferContractTest` 실패 메시지가 가리키는 대로). 웹 `src/offerContract.test.js`가 같은 파일을 읽으므로 Task 7에서 함께 확인한다.

Run: `./gradlew test -q`
Expected: 전체 통과

- [ ] **Step 8: 커밋**

```bash
cd mono
git add api/src/main/java/com/discounttracker/history/HistoryRepository.java api/src/main/resources/application.yml api/src/main/resources/data/history.json api/src/main/java/com/discounttracker/offer/Offer.java api/src/main/java/com/discounttracker/comparison/BrandComparisonService.java api/src/main/java/com/discounttracker/push/NewOfferNotificationService.java api/src/main/java/com/discounttracker/web/BrandController.java api/src/test/resources/contracts/offer-cases.json api/src/test/java
git commit -m "feat(api): 오퍼 신규를 이력으로 판정(isNew)하고 푸시도 그것을 쓴다"
```

---

### Task 6: 이력 API (mono/api)

**Files:**
- Create: `mono/api/src/main/java/com/discounttracker/history/HistoryResponse.java`
- Modify: `mono/api/src/main/java/com/discounttracker/web/BrandController.java`
- Test: `mono/api/src/test/java/com/discounttracker/web/BrandHistoryEndpointTest.java`

**Interfaces:**
- Consumes: `HistoryRepository.current()`, `OfferHistory.bestSeries`, `OfferHistory.summary` (Task 4, 5)
- Produces: `GET /api/brands/{brand}/history?range=1m|3m|all` → `{"brand", "best": [{"date","amount","line","reason"}], "summary": {"maxEver","maxEverOn","current","daysSinceHigher"}}`. 모르는 `range`는 400. 이력에 그 브랜드가 없으면 `best: []`(200).

- [ ] **Step 1: 실패하는 테스트**

```java
// BrandHistoryEndpointTest.java
package com.discounttracker.web;

import com.discounttracker.history.*;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class BrandHistoryEndpointTest {

    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-09T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    HistoryResponse call(String brand, String range) {
        var h = new OfferHistory(List.of(
                new BrandDay(LocalDate.parse("2026-10-08"), "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000),
                new BrandDay(LocalDate.parse("2026-10-09"), "coupangeats", "청년피자", DayState.UNCOLLECTED, null, 10000)),
                Map.of(LocalDate.parse("2026-10-08"), Set.of("coupangeats"), LocalDate.parse("2026-10-09"), Set.of()));
        return HistoryResponse.of(h, brand, range, LocalDate.now(CLOCK));
    }

    @Test
    void returnsBestSeriesAndSummary() {
        var r = call("청년피자", "1m");
        assertEquals("청년피자", r.brand());
        assertEquals(2, r.best().size());
        assertEquals("carried", r.best().get(1).line());
        assertEquals(10000, r.summary().maxEver());
    }

    @Test
    void unknownBrandIsEmptyNotError() {
        assertTrue(call("없는브랜드", "1m").best().isEmpty());
    }

    @Test
    void unknownRangeIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> call("청년피자", "7y"));
    }
}
```

Run: `./gradlew test --tests 'com.discounttracker.web.BrandHistoryEndpointTest' -q`
Expected: 컴파일 실패

- [ ] **Step 2: 구현**

```java
// HistoryResponse.java
package com.discounttracker.history;

import java.time.LocalDate;
import java.util.List;

/** GET /api/brands/{brand}/history 응답. */
public record HistoryResponse(String brand, List<OfferHistory.Point> best, OfferHistory.Summary summary) {

    public static HistoryResponse of(OfferHistory h, String brand, String range, LocalDate today) {
        LocalDate from = switch (range == null ? "1m" : range) {
            case "1m" -> today.minusMonths(1);
            case "3m" -> today.minusMonths(3);
            case "all" -> LocalDate.of(2000, 1, 1);
            default -> throw new IllegalArgumentException("range는 1m, 3m, all 중 하나다: " + range);
        };
        return new HistoryResponse(brand, h.bestSeries(brand, from, today), h.summary(brand, today));
    }
}
```

`BrandController`:

```java
    @GetMapping("/brands/{brand}/history")
    public ResponseEntity<HistoryResponse> history(@PathVariable String brand,
                                                   @RequestParam(defaultValue = "1m") String range) {
        try {
            return ResponseEntity.ok(HistoryResponse.of(history.current(), brand, range, LocalDate.now(clock)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        }
    }
```

(`clock`이 컨트롤러에 없으면 `Clock` 빈을 주입한다. 프로젝트에 `Clock` 빈이 없으면 `ZoneId.of("Asia/Seoul")`로 `LocalDate.now(ZoneId.of("Asia/Seoul"))`.) 필요한 import(`PathVariable`, `RequestParam`, `ResponseEntity`, `LocalDate`)를 더한다.

Run: `./gradlew test -q`
Expected: 전체 통과

- [ ] **Step 3: 로컬 서버로 실제 응답 보기 (운영 무관)**

```bash
cd mono/api
DISCOUNT_EXPORT_PATH=file:../../data/export.json DISCOUNT_HISTORY_PATH=file:../../data/history.json SERVER_PORT=18080 ./gradlew bootRun -q &
sleep 40
curl -s "http://localhost:18080/api/brands/%EC%B2%AD%EB%85%84%ED%94%BC%EC%9E%90/history?range=1m" | head -c 800
curl -s http://localhost:18080/api/brands | python -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for b in d for o in b['offers'] if o.get('isNew')), 'new')"
kill %1
```
Expected: 청년피자 `best`에 10월 점들이 나오고, 신규 수가 10-08 이후 하루 16건 같은 큰 수가 아니라 소수다. 두 숫자를 보고서에 적는다. (`bootRun`이 다른 필수 환경변수를 요구하면 그 오류를 보고서에 적고 이 단계는 건너뛴다. 운영 경로나 비밀 파일을 넣지 않는다.)

- [ ] **Step 4: 커밋**

```bash
cd mono
git add api/src/main/java/com/discounttracker/history/HistoryResponse.java api/src/main/java/com/discounttracker/web/BrandController.java api/src/test/java/com/discounttracker/web/BrandHistoryEndpointTest.java
git commit -m "feat(api): GET /api/brands/{brand}/history — 플랫폼 무관 최고 할인 선"
```

---

### Task 7: 웹 isNew 전환과 최고 할인 그래프 (mono/web)

**Files:**
- Modify: `mono/web/src/filters.js` (`isUpdated`)
- Modify: `mono/web/src/api.js` (`fetchHistory`)
- Create: `mono/web/src/historyChart.js`
- Create: `mono/web/src/historyChart.test.js`
- Create: `mono/web/src/BestHistoryChart.jsx`
- Modify: `mono/web/src/CouponCard.jsx` (시트 본문 끝)
- Modify: `mono/web/src/BrandCard.jsx` (펼친 상세 끝)
- Modify: `mono/web/src/styles/coupon-card.css` (그래프 스타일 몇 줄)
- Test: `mono/web/src/filters.test.js`, `mono/web/src/historyChart.test.js`

**Interfaces:**
- Consumes: `GET /api/brands/{brand}/history` 응답 (Task 6), 오퍼 `isNew` (Task 5)
- Produces:
  - `isUpdated(offer, now)`: `offer.isNew`가 boolean이면 그 값, `undefined`면 지금 규칙(`firstSeenAt` 오늘)
  - `fetchHistory(brand, range = '1m') -> Promise<object|null>` (실패, 404면 null)
  - `chartModel(points, width, height) -> { solid: string[], carried: string[], dots: {x,y,hollow,reason}[], yMax: number } | null` (그릴 점이 2개 미만이면 null)
  - `<BestHistoryChart brand="..."/>`: 모델이 null이면 아무것도 안 그린다

- [ ] **Step 1: 실패하는 테스트 (isNew 우선)**

```js
// src/filters.test.js 에 추가
test('isUpdated prefers server isNew over firstSeenAt', () => {
  const now = Date.parse('2026-10-09T03:00:00Z')
  assert.equal(isUpdated({ isNew: false, firstSeenAt: '2026-10-09T00:10:03+09:00' }, now), false)
  assert.equal(isUpdated({ isNew: true, firstSeenAt: '2026-10-01T00:00:00+09:00' }, now), true)
  assert.equal(isUpdated({ isNew: null, firstSeenAt: '2026-10-09T00:10:03+09:00' }, now), false)
  assert.equal(isUpdated({ firstSeenAt: '2026-10-09T00:10:03+09:00' }, now), true)
})
```

Run: `cd mono/web && node --test src/filters.test.js`
Expected: FAIL(첫 번째 단언)

- [ ] **Step 2: 구현**

`src/filters.js`의 `isUpdated`를:

```js
// 서버가 이력으로 판정한 값(isNew)이 있으면 그것을 따른다(설계 2026-10-09). null = 이력 없음, 신규로 안 친다.
// 칸이 아예 없는 옛 응답만 firstSeenAt 오늘 규칙을 쓴다.
export function isUpdated(offer, now = Date.now()) {
  if (offer && 'isNew' in offer) return offer.isNew === true
  const t = offer?.firstSeenAt ? Date.parse(offer.firstSeenAt) : NaN
  return Number.isFinite(t) && kstDay(t) === kstDay(now)
}
```

Run: `node --test src/filters.test.js`
Expected: 통과

- [ ] **Step 3: 실패하는 테스트 (그래프 모델)**

```js
// src/historyChart.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chartModel } from './historyChart.js'

const P = (date, amount, line, reason) => ({ date, amount, line, reason })

test('solid and carried runs become separate polylines', () => {
  const m = chartModel([P('2026-10-05', 5000, 'solid'), P('2026-10-06', 5000, 'carried', 'stage_suspect'),
    P('2026-10-07', 6000, 'solid')], 300, 100)
  assert.equal(m.solid.length, 2)        // 05-06 구간은 점선이라 실선이 둘로 갈린다
  assert.equal(m.carried.length, 1)
  assert.deepEqual(m.dots.map((d) => d.hollow), [false, true, false])
  assert.equal(m.dots[1].reason, 'stage_suspect')
  assert.equal(m.yMax, 6000)
})

test('break ends the line', () => {
  const m = chartModel([P('2026-10-05', 5000, 'solid'), P('2026-10-06', 5000, 'solid'),
    P('2026-10-07', null, 'break'), P('2026-10-08', 4000, 'solid')], 300, 100)
  assert.equal(m.solid.length, 1)       // 08은 한 점짜리 구간이라 선 없이 점만
  assert.equal(m.dots.length, 3)
})

test('fewer than two drawable points draws nothing', () => {
  assert.equal(chartModel([P('2026-10-05', 5000, 'solid')], 300, 100), null)
  assert.equal(chartModel([], 300, 100), null)
})

test('x spreads by date, y grows upward', () => {
  const m = chartModel([P('2026-10-01', 0, 'solid'), P('2026-10-11', 1000, 'solid')], 100, 50)
  assert.equal(m.dots[0].x < m.dots[1].x, true)
  assert.equal(m.dots[0].y > m.dots[1].y, true)
})
```

`scripts/run-node-tests.mjs`가 `src/*.test.js`를 모두 도는지 확인한다(안 돌면 목록에 더한다).

Run: `node --test src/historyChart.test.js`
Expected: FAIL `Cannot find module './historyChart.js'`

- [ ] **Step 4: 구현**

```js
// src/historyChart.js
// 브랜드 최고 할인 선(설계 2026-10-09). 실선 = 그날 본 값, 점선 = 못 봐서 이어 그린 값, 끊김 = 할인 없음.
const PAD = 6

export function chartModel(points, width, height) {
  const drawable = points.filter((p) => p.amount != null)
  if (drawable.length < 2) return null
  const t0 = Date.parse(points[0].date)
  const span = Math.max(1, Date.parse(points[points.length - 1].date) - t0)
  const yMax = Math.max(...drawable.map((p) => p.amount))
  const x = (p) => PAD + ((Date.parse(p.date) - t0) / span) * (width - 2 * PAD)
  const y = (p) => height - PAD - (yMax === 0 ? 0 : (p.amount / yMax) * (height - 2 * PAD))
  const solid = []
  const carried = []
  let run = null
  let prev = null
  for (const p of points) {
    if (p.line === 'break') { run = null; prev = null; continue }
    const pt = `${x(p).toFixed(1)},${y(p).toFixed(1)}`
    const kind = p.line === 'carried' ? 'carried' : 'solid'
    if (prev && (kind === 'carried' || prev.kind === 'carried')) carried.push(`${prev.pt} ${pt}`)
    if (kind === 'solid' && prev?.kind === 'solid') run.push(pt)
    else if (kind === 'solid') { run = [pt]; solid.push(run) }
    prev = { pt, kind }
  }
  return {
    solid: solid.filter((r) => r.length > 1).map((r) => r.join(' ')),
    carried,
    dots: drawable.map((p) => ({ x: x(p), y: y(p), hollow: p.line === 'carried', reason: p.reason ?? null })),
    yMax,
  }
}
```

Run: `node --test src/historyChart.test.js`
Expected: 4 passed

- [ ] **Step 5: 받아 그리기**

`src/api.js`:

```js
export async function fetchHistory(brand, range = '1m') {
  try {
    const res = await fetch(`${API_BASE}/api/brands/${encodeURIComponent(brand)}/history?range=${range}`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}
```

```jsx
// src/BestHistoryChart.jsx
import { useEffect, useState } from 'react'
import { fetchHistory } from './api.js'
import { chartModel } from './historyChart.js'
import { won } from './OfferChip.jsx'

const W = 300
const H = 96

// 시트가 열릴 때만 받는다. 이력이 없거나 점이 둘 미만이면 아무것도 안 그린다(시트는 그대로).
export default function BestHistoryChart({ brand }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    fetchHistory(brand).then((d) => { if (live) setData(d) })
    return () => { live = false }
  }, [brand])
  const m = data && chartModel(data.best ?? [], W, H)
  if (!m) return null
  return (
    <figure className="hist">
      <svg viewBox={`0 0 ${W} ${H}`} className="hist__svg" role="img" aria-label={`최고 할인 ${won(m.yMax)}`}>
        {m.solid.map((pts, i) => <polyline key={`s${i}`} points={pts} className="hist__solid" />)}
        {m.carried.map((pts, i) => <polyline key={`c${i}`} points={pts} className="hist__carried" />)}
        {m.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="2.5" className={d.hollow ? 'hist__dot hist__dot--hollow' : 'hist__dot'} />)}
      </svg>
    </figure>
  )
}
```

`aria-label`의 "최고 할인"은 새 노출 문구다. **이 단계에서 사용자에게 문구를 묻는다**(COPY-STYLE). 답이 오기 전에는 `aria-label={won(m.yMax)}`로 금액만 둔다. 화면에 보이는 글자는 없다.

`src/styles/coupon-card.css` 끝에:

```css
.hist { margin: 12px 0 0; }
.hist__svg { width: 100%; height: auto; display: block; }
.hist__solid { fill: none; stroke: var(--cc-accent, #e8590c); stroke-width: 2; }
.hist__carried { fill: none; stroke: var(--cc-accent, #e8590c); stroke-width: 2; stroke-dasharray: 4 4; opacity: .6; }
.hist__dot { fill: var(--cc-accent, #e8590c); }
.hist__dot--hollow { fill: #fff; stroke: var(--cc-accent, #e8590c); stroke-width: 1.5; }
```

(`--cc-accent`가 없으면 그 파일이 쓰는 강조색 변수 이름으로 바꾼다.)

`src/CouponCard.jsx` 시트 본문(`<div className="cc-sheet__body">`)의 오퍼 목록 `map(...)` 닫힘 바로 뒤, `</div>` 앞에 `<BestHistoryChart brand={brand.name} />`. 맨 위 import에 `import BestHistoryChart from './BestHistoryChart.jsx'`.

`src/BrandCard.jsx` 184~186행 `brand-detail` 안에서 `sortedOffers.map(...)` 다음 줄에 `{open && <BestHistoryChart brand={brand.name} />}`, import 추가.

- [ ] **Step 6: 전체 테스트와 빌드**

Run: `npm test && npm run build`
Expected: 둘 다 성공. `offerContract.test.js`가 `isNew`를 모른다고 실패하면 Task 5에서 계약 파일에 `isNew`를 더했는지 확인한다(mono 같은 워크트리).

- [ ] **Step 7: 커밋**

```bash
cd mono
git add web/src/filters.js web/src/filters.test.js web/src/api.js web/src/historyChart.js web/src/historyChart.test.js web/src/BestHistoryChart.jsx web/src/CouponCard.jsx web/src/BrandCard.jsx web/src/styles/coupon-card.css
git commit -m "feat(web): 신규는 서버 isNew를 따르고, 시트에 최고 할인 그래프"
```

---

### Task 8: 프리뷰 확인 (운영 무관)

**Files:** 없음(확인만)

- [ ] **Step 1: 미러 프리뷰 브랜치로 올리기**

```bash
cd /c/Users/Jaewun/_dev/delivery-discount-tracker/.claude/worktrees/history/mono
git fetch -q web-mirror
C=$(git commit-tree HEAD:web -p web-mirror/main -m "preview: discount-history")
git push -q -f web-mirror $C:refs/heads/preview/discount-history
```

Vercel `list_deployments`에서 이 sha의 배포를 찾아 주소를 얻는다. 보호 우회 값은 `/c/Users/Jaewun/_dev/vercel_bypass`를 변수로만 읽는다(출력 금지).

- [ ] **Step 2: 360px 스크린샷 (이력 응답은 가로채서 넣는다)**

Playwright WebKit, 뷰포트 360×780. `**/api/brands/*/history*` 요청을 가로채 Task 3 Step 5의 로컬 `data/history.json`으로 만든 청년피자 응답(Task 6 Step 3에서 본 JSON을 파일로 저장)을 돌려준다. 쿠폰 카드 안(`?home=coupon`)에서 청년피자 카드를 눌러 시트를 열고 스크린샷, old 안(`?home=old`)에서 펼쳐 스크린샷. 두 장을 눈으로 본다: 실선, 점선, 빈 점이 보이고 시트가 가로로 넘치지 않는다.

- [ ] **Step 3: 이력 404일 때**

가로채기 없이 같은 화면을 열어 그래프 자리가 비고 시트가 정상인지 스크린샷으로 본다(운영 API에는 아직 엔드포인트가 없어 404).

- [ ] **Step 4: 보고**

사용자에게: 프리뷰 주소, 스크린샷 네 장, Task 3 Step 5 숫자(복원 일수, 줄 수), Task 6 Step 3 숫자(청년피자 점, 신규 수), 그래프 접근성 문구 질문. 출시(아래)는 승인 뒤.

---

## 출시 (이 계획 범위 밖, 승인 뒤 사람이 함께)

1. tracker `feat/discount-history`를 main에 머지하고 `python scripts/daily_state.py backfill --from 2026-07-27 --to <어제>`.
2. 서버에 `DISCOUNT_HISTORY_PATH` 환경변수와 `history.json` 첫 업로드.
3. mono `feat/discount-history`를 main에 머지(API 배포, 웹 배포).
4. 다음 날 00:01 예약 실행 뒤 `check_routine`의 `8d`와 신규 수를 확인.
5. 안정되면 `export_data.apply_first_seen`, `data/offer_seen.json`, 웹 `firstSeenAt` 폴백 제거(별도 계획).
