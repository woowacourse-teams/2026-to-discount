# 겹쳐 쓰는 쿠폰(tier_mode/cap) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 요기요처럼 쿠폰 두 장을 겹쳐 쓰는 오퍼를 표현하고, 카드 대표 금액을 API 도메인이 구간에서 계산하게 한다.

**Architecture:** 원장 레코드에 `tier_mode`("exclusive" 기본 / "cumulative")를 두고, 정률 tier의 상한액을 `amount`에서 `cap`으로 분리한다. API는 `cumulative`일 때만 `DiscountLadder`로 문턱별 누적 사다리를 세워 최저 문턱 값을 대표로 쓴다. `exclusive`는 기존 동작 그대로.

**Tech Stack:** Python 3.14 + pytest (tracker), Java 17 + Spring Boot + JUnit 5 (api)

## Global Constraints

- 설계 원본: [2026-08-13-cumulative-coupons-design.md](../specs/2026-08-13-cumulative-coupons-design.md). 판단 근거는 [ADR-019](../../decisions/ADR-019-cumulative-tiers-and-domain-judged-amount.md) / [api ADR-010](../../../../delivery-discount-api/docs/decisions/ADR-010-domain-judges-representative-amount.md).
- 두 레포 모두 브랜치 `feat/cumulative-coupons`에서 작업한다. 이미 만들어져 있고 설계 문서 커밋이 올라가 있다.
- **ADR-018**: 개발은 로컬 원본 레포에서만. 모노레포(`woowacourse-teams/2026-to-discount`)에는 이 작업 범위에서 옮기지 않는다 — 브랜치가 main에 머지된 뒤에 별도로 옮긴다.
- `tier_mode` 기본값은 `"exclusive"`. 기존 원장 레코드는 이 필드가 없고, 없으면 `exclusive`로 본다. **기존 export 170건 산출이 한 건도 바뀌면 안 된다**(커피앳웍스 1건 제외).
- 정률 금액은 **원 단위 내림**(`int(min_order * percent / 100)`). 올림 금지.
- `percent`와 `cap`은 동반 필수. 한쪽만 있으면 거부.
- `tier_mode == "cumulative"`면 `qualifier`는 반드시 `"최소"`.
- Java 레코드에 필드를 더하면 기존 생성자 호출부가 전부 깨진다. `DiscountTier` 4곳, `OfferRecord` 5곳 — 전부 `BrandComparisonServiceTest` 안에 있다.
- `tierMode`는 Java에서 `String`이고 **null 허용**이다. tracker가 필드를 안 실어 보내는 동안에도 reload가 깨지면 안 된다 — null은 `exclusive`로 본다.
- 커밋 메시지는 한국어, 프로젝트 관례를 따른다(무엇을·왜, 실측 근거 포함).

---

### Task 1: schema에 `cap` 검증 규칙

**Files:**
- Modify: `schema.py` (tracker) — `validate_tiers` 67-87행
- Test: `tests/test_schema.py` (tracker)

**Interfaces:**
- Consumes: 없음
- Produces: `validate_tiers`가 `cap` 규칙을 강제한다. Task 4의 원장 마이그레이션이 이 규칙을 통과해야 한다.

- [ ] **Step 1: Write the failing tests**

`tests/test_schema.py` 끝에 붙인다. 파일 상단 `BASE` 딕셔너리를 그대로 쓴다.

```python
def test_validate_tiers_requires_cap_with_percent():
    # 정률 tier의 amount는 "이 문턱에서 실제 받는 금액"이고 상한은 cap이다.
    # percent만 있고 cap이 없으면 amount가 무슨 뜻인지 알 수 없다(ADR-019).
    with pytest.raises(ValueError, match="cap"):
        validate_record(dict(BASE, tiers=[
            {"min_order": 25000, "amount": 1250, "percent": 5},
        ]))


def test_validate_tiers_rejects_cap_without_percent():
    # 정액 tier에 상한은 뜻이 없다.
    with pytest.raises(ValueError, match="cap"):
        validate_record(dict(BASE, tiers=[
            {"min_order": 17000, "amount": 4000, "cap": 5000},
        ]))


def test_validate_tiers_rejects_amount_over_cap():
    with pytest.raises(ValueError, match="cap"):
        validate_record(dict(BASE, tiers=[
            {"min_order": 25000, "amount": 4000, "percent": 5, "cap": 3000},
        ]))


def test_validate_tiers_keeps_percent_with_cap():
    # 요기요 굽네치킨 실측(2026-07-31): 25,000원 이상 5%, 최대 3,000원.
    # 25,000 x 5% = 1,250이 그 문턱에서 실제 받는 금액이고 3,000은 상한.
    record = validate_record(dict(BASE, tiers=[
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]))
    assert record["tiers"][0]["cap"] == 3000
    assert record["tiers"][0]["amount"] == 1250
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/Users/soldesk/IdeaProjects/delivery-discount-tracker
python -m pytest tests/test_schema.py -k cap -v
```

Expected: `test_validate_tiers_requires_cap_with_percent`, `test_validate_tiers_rejects_cap_without_percent`, `test_validate_tiers_rejects_amount_over_cap` 3건 FAIL (`DID NOT RAISE ValueError`). `test_validate_tiers_keeps_percent_with_cap`은 통과할 수도 있다 — 아직 cap을 검사하지 않아 그냥 통과한다.

- [ ] **Step 3: Write minimal implementation**

`schema.py`의 `validate_tiers` 안, `percent` 검사 바로 뒤에 넣는다.

```python
        if "percent" in tier and not (isinstance(tier["percent"], (int, float)) and 0 < tier["percent"] <= 100):
            raise ValueError(f"tier percent must be in (0, 100]: {tier!r}")
        # 정률 tier의 amount는 "이 문턱에서 실제 받는 금액"이고, 상한은 cap이
        # 따로 든다. 예전엔 amount가 상한을 겸했는데 같은 필드가 정액 tier에선
        # 받는 금액, 정률 tier에선 상한을 뜻해 실제로 오독을 낳았다(ADR-019).
        if ("percent" in tier) != ("cap" in tier):
            raise ValueError(f"tier percent and cap must come together: {tier!r}")
        if "cap" in tier and tier["amount"] is not None and tier["amount"] > tier["cap"]:
            raise ValueError(f"tier amount must not exceed cap: {tier!r}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_schema.py -v
```

Expected: 전부 PASS. **기존 `test_validate_record_keeps_percent_tier`와 `test_validate_record_rejects_percent_out_of_range`가 깨진다** — 둘 다 `cap` 없이 `percent`만 넣는다. 다음 스텝에서 고친다.

- [ ] **Step 5: Fix the two pre-existing tests that used the old shape**

`tests/test_schema.py`에서 아래 두 테스트를 통째로 교체한다.

```python
def test_validate_record_keeps_percent_tier():
    # 요기요 실측(굽네치킨, 2026-07-31): 25,000원 이상 주문 시 5%,
    # 최대 3,000원 할인. amount는 그 문턱에서 실제 받는 금액(25,000 x 5%),
    # 상한 3,000원은 cap이다(ADR-019).
    record = validate_record(dict(BASE, tiers=[
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]))
    assert record["tiers"][0] == {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000}


def test_validate_record_rejects_percent_out_of_range():
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[
            {"min_order": 25000, "amount": 1250, "percent": 0, "cap": 3000}]))
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[
            {"min_order": 25000, "amount": 1250, "percent": 101, "cap": 3000}]))
```

- [ ] **Step 6: Run the whole tracker suite**

```bash
python -m pytest tests/ -q
```

Expected: 전부 PASS.

- [ ] **Step 7: Commit**

```bash
git add schema.py tests/test_schema.py
git commit -F - <<'EOF'
feat: 정률 tier의 상한액을 cap으로 분리한다

정률 tier의 amount가 상한액을 겸하고 있었다. 정액 tier에선 "받는 금액",
정률 tier에선 "최대로 받을 금액"이라 같은 필드가 두 뜻을 가졌고, 설계를
논의하는 중에 실제로 25,000원 주문의 할인을 7,000원으로 오독했다.

amount는 이제 어느 tier에서든 "이 문턱에서 실제 받는 금액"이다. percent와
cap은 동반 필수로 묶어 한쪽만 있는 모양을 막는다(ADR-019).
EOF
```

---

### Task 2: schema에 `tier_mode` 추가

**Files:**
- Modify: `schema.py` (tracker) — `DEFAULTS` 20-64행, `validate_record` 90-112행
- Test: `tests/test_schema.py` (tracker)

**Interfaces:**
- Consumes: Task 1의 `cap` 규칙
- Produces: 레코드에 `tier_mode` 키가 항상 존재한다(기본 `"exclusive"`). Task 3의 export, Task 4의 마이그레이션이 이 값을 쓴다.

- [ ] **Step 1: Write the failing tests**

```python
def test_validate_record_tier_mode_defaults_to_exclusive():
    record = validate_record(dict(BASE))
    assert record["tier_mode"] == "exclusive"


def test_validate_record_rejects_unknown_tier_mode():
    with pytest.raises(ValueError, match="tier_mode"):
        validate_record(dict(BASE, tier_mode="stacked"))


def test_validate_record_keeps_cumulative_tier_mode():
    # 요기요 굽네치킨 실측(2026-07-31): 고정 메뉴할인과 정률 쿠폰을
    # 겹쳐 쓸 수 있다.
    record = validate_record(dict(BASE, tier_mode="cumulative", qualifier="최소", tiers=[
        {"min_order": 17000, "amount": 4000},
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]))
    assert record["tier_mode"] == "cumulative"


def test_validate_record_rejects_cumulative_with_single_tier():
    # 겹칠 상대가 없으면 cumulative가 뜻을 갖지 않는다.
    with pytest.raises(ValueError, match="cumulative"):
        validate_record(dict(BASE, tier_mode="cumulative", qualifier="최소", tiers=[
            {"min_order": 17000, "amount": 4000},
        ]))


def test_validate_record_rejects_cumulative_without_minimum_qualifier():
    # cumulative의 대표값은 사다리 최저 문턱이라 "최소" 표기여야 한다.
    # 도메인이 qualifier를 덮어쓰는 대신 여기서 강제한다(ADR-019).
    with pytest.raises(ValueError, match="qualifier"):
        validate_record(dict(BASE, tier_mode="cumulative", qualifier="최대", tiers=[
            {"min_order": 17000, "amount": 4000},
            {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
        ]))
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_schema.py -k tier_mode -v
```

Expected: 5건 전부 FAIL (`KeyError: 'tier_mode'` 또는 `DID NOT RAISE`).

- [ ] **Step 3: Write minimal implementation**

`schema.py` 상단, `ALLOWED_CHANNELS` 아래에 추가:

```python
# 한 레코드의 tiers를 어떻게 읽을지. "exclusive"는 문턱마다 택일(지금까지의
# 해석), "cumulative"는 문턱을 넘을수록 쿠폰이 겹친다(요기요 2단 실측,
# 굽네치킨 2026-07-31). tier마다 플래그를 달지 않고 레코드 레벨로 둔 이유는
# 읽는 쪽이 tier를 하나씩 살피지 않고 한 번에 갈래를 정하게 하려는 것이다.
ALLOWED_TIER_MODES = {"exclusive", "cumulative"}
```

`DEFAULTS`에 추가(`"tiers": None,` 바로 위):

```python
    "tier_mode": "exclusive",
```

`validate_record`의 `validate_tiers(normalized["tiers"])` 앞에 추가:

```python
    if normalized["tier_mode"] not in ALLOWED_TIER_MODES:
        raise ValueError(f"invalid tier_mode: {normalized['tier_mode']!r}")
    if normalized["tier_mode"] == "cumulative":
        if not normalized["tiers"] or len(normalized["tiers"]) < 2:
            raise ValueError(f"cumulative needs at least two tiers: {normalized['tiers']!r}")
        if normalized["qualifier"] != "최소":
            raise ValueError(
                f"cumulative record must use qualifier '최소': {normalized['qualifier']!r}")
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/ -q
```

Expected: 전부 PASS. 기존 테스트는 `tier_mode`를 안 넣으므로 기본값 `exclusive`로 통과한다.

- [ ] **Step 5: Commit**

```bash
git add schema.py tests/test_schema.py
git commit -F - <<'EOF'
feat: 겹쳐 쓰는 쿠폰을 tier_mode로 표현한다

요기요는 고정 메뉴할인과 정률 쿠폰을 겹쳐 쓸 수 있는데(굽네치킨 실측,
2026-07-31) tiers가 "구간별 택일"로 정의돼 있어 둘 중 하나만 잡혔다.

레코드 레벨 tier_mode로 갈래를 표시한다. 기본값이 exclusive라 기존 원장은
한 줄도 안 고친다. cumulative는 tier 2개 이상 + qualifier "최소"를 강제한다
— 대표값이 사다리 최저 문턱이라 "최소" 표기여야 하고, 이걸 검증으로 막으면
도메인이 qualifier를 두 번 판정하지 않아도 된다(ADR-019).
EOF
```

---

### Task 3: export가 `tier_mode`와 `cap`을 내보낸다

**Files:**
- Modify: `export_data.py` (tracker) — `FIELDS` 7-26행, `camel_tiers` 33-53행
- Test: `tests/test_export_data.py` (tracker)

**Interfaces:**
- Consumes: Task 2의 `tier_mode` 기본값
- Produces: export.json 항목에 `tierMode`, tier에 `cap`이 실린다. Task 5-8의 API가 이 이름으로 읽는다.

- [ ] **Step 1: Write the failing tests**

`tests/test_export_data.py` 끝에 붙인다. 파일 상단 `RECORDS`를 그대로 쓴다.

```python
def test_build_export_carries_tier_mode():
    records = [dict(RECORDS[1], tier_mode="cumulative", tiers=[
        {"min_order": 17000, "amount": 4000},
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ])]
    item = build_export(records)[0]
    assert item["tierMode"] == "cumulative"


def test_build_export_defaults_tier_mode_to_exclusive():
    # 기존 원장 레코드는 이 필드가 없다 — 없으면 exclusive다.
    item = build_export(RECORDS)[0]
    assert item["tierMode"] == "exclusive"


def test_camel_tiers_carries_cap():
    # 정률 tier의 상한액(ADR-019). 정액 tier에는 붙지 않는다.
    out = camel_tiers([
        {"min_order": 17000, "amount": 4000},
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ])
    assert out == [
        {"minOrder": 17000, "amount": 4000},
        {"minOrder": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_export_data.py -k "tier_mode or cap" -v
```

Expected: `test_build_export_carries_tier_mode`·`test_build_export_defaults_tier_mode_to_exclusive`는 `KeyError: 'tierMode'`, `test_camel_tiers_carries_cap`은 `cap` 누락으로 FAIL.

- [ ] **Step 3: Write minimal implementation**

`export_data.py`의 `FIELDS` 리스트, `("tiers", "tiers"),` 바로 위에 추가:

```python
    # tiers를 택일로 읽을지 누적으로 읽을지(ADR-019). 원장에 없으면
    # store가 기본값 exclusive를 채우지만, 원장을 직접 손으로 고친 줄에는
    # 키 자체가 없을 수 있어 build_export에서 한 번 더 기본값을 준다.
    ("tier_mode", "tierMode"),
```

`camel_tiers`의 필드 전달 튜플에 `cap`을 추가한다:

```python
        for snake, camel in (("percent", "percent"), ("channel", "channel"),
                             ("sold_out", "soldOut"), ("expires_at", "expiresAt"),
                             ("cap", "cap")):
```

`build_export`의 항목 생성부에서 `tier_mode` 기본값을 보장한다:

```python
        item = {camel: record.get(snake) for snake, camel in FIELDS}
        item["tierMode"] = record.get("tier_mode") or "exclusive"
        item["tiers"] = camel_tiers(record.get("tiers"))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/ -q
```

Expected: 전부 PASS. **기존 `test_build_export_carries_percent_tier`가 깨진다** — 옛 모양(`amount`가 상한)을 단언한다. 다음 스텝에서 고친다.

- [ ] **Step 5: Fix the pre-existing percent test**

`tests/test_export_data.py`의 `test_build_export_carries_percent_tier`를 통째로 교체한다.

```python
def test_build_export_carries_percent_tier():
    # 요기요 실측(굽네치킨, 2026-07-31): 정률 tier는 percent와 cap이 같이
    # 살아남아야 한다. amount는 그 문턱에서 실제 받는 금액(25,000 x 5%),
    # cap은 상한(60,000원 주문에서야 닿는다) — ADR-019.
    records = [dict(RECORDS[1], tiers=[
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
        {"min_order": 17000, "amount": 4000},
    ])]
    item = build_export(records)[0]
    assert item["tiers"] == [
        {"minOrder": 25000, "amount": 1250, "percent": 5, "cap": 3000},
        {"minOrder": 17000, "amount": 4000},
    ]
```

- [ ] **Step 6: Verify existing export output is unchanged**

`tier_mode`가 새로 붙는 것 말고 기존 170건의 값이 안 바뀌는지 실제 원장으로 확인한다.

```bash
python - <<'EOF'
import json
from export_data import build_export, read_records, LOG_PATH
before = json.load(open('data/export.json', encoding='utf-8'))
after = build_export(read_records(LOG_PATH), '2026-08-10')
assert len(before) == len(after), (len(before), len(after))
for b, a in zip(before, after):
    a2 = {k: v for k, v in a.items() if k != 'tierMode'}
    assert b == a2, (b['brand'], b['platform'])
    assert a['tierMode'] == 'exclusive'
print(f'{len(after)}건 모두 tierMode만 추가되고 나머지 값 동일')
EOF
```

Expected: `170건 모두 tierMode만 추가되고 나머지 값 동일`

- [ ] **Step 7: Commit**

```bash
git add export_data.py tests/test_export_data.py
git commit -F - <<'EOF'
feat: export가 tierMode와 tier의 cap을 내보낸다

원장의 tier_mode/cap이 export.json까지 흘러가야 API가 사다리를 계산할 수
있다. tier_mode가 없는 기존 레코드는 exclusive로 채운다 — 원장 170건의
산출이 tierMode 추가 말고는 한 값도 안 바뀌는 걸 확인했다.
EOF
```

---

### Task 4: 원장 7건 마이그레이션 + 교차검증 테스트

**Files:**
- Create: `tests/test_ledger_consistency.py` (tracker)
- Modify: `export_data.py` (tracker) — `ladder_floor` 함수 추가
- Modify: `data/log.jsonl` (tracker) — 7개 줄
- Modify: `data/export.json` (tracker) — 재생성

**Interfaces:**
- Consumes: Task 1-3의 검증·export 규칙
- Produces: `ladder_floor(tiers) -> int | None` — 사다리 최저 문턱 값. Task 6의 Java `DiscountLadder.floorAmount()`와 **같은 값을 내야 한다**(굽네치킨 4000, 25,000문턱 5250을 양쪽 테스트가 같은 숫자로 고정한다).

- [ ] **Step 1: Write the failing tests**

`tests/test_ledger_consistency.py`를 새로 만든다.

```python
"""원장이 스스로 모순되지 않는지 본다.

cumulative 레코드의 대표값(amount)은 사다리 최저 문턱과 같아야 한다.
API가 그 값을 계산해서 내려주므로, 원장 쪽 숫자가 어긋나 있으면 화면과
원장이 다른 말을 하게 된다. 사람이 손으로 더하다 틀리는 걸 여기서 잡는다.
"""
import json
from pathlib import Path

from export_data import ladder_floor
from schema import validate_record

LOG_PATH = Path(__file__).parent.parent / "data" / "log.jsonl"


def read_log():
    with open(LOG_PATH, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def test_ladder_floor_of_yogiyo_two_step_coupon():
    # 굽네치킨 실측(2026-07-31): 17,000원 이상 4,000원 고정 메뉴할인 +
    # 25,000원 이상 5%(상한 3,000)의 정률 쿠폰을 겹쳐 쓴다.
    #   17,000원 주문 -> 4,000
    #   25,000원 주문 -> 4,000 + 1,250 = 5,250
    # 대표값은 최저 문턱인 4,000이다(ADR-019).
    tiers = [
        {"min_order": 17000, "amount": 4000},
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]
    assert ladder_floor(tiers) == 4000


def test_ladder_floor_ignores_tier_order():
    tiers = [
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
        {"min_order": 17000, "amount": 4000},
    ]
    assert ladder_floor(tiers) == 4000


def test_ladder_floor_treats_missing_min_order_as_no_threshold():
    # min_order가 없으면 문턱이 없다는 뜻이라 가장 낮은 칸이다.
    tiers = [
        {"min_order": None, "amount": 2000},
        {"min_order": 18000, "amount": 3000},
    ]
    assert ladder_floor(tiers) == 2000


def test_every_cumulative_record_amount_matches_its_ladder_floor():
    mismatched = []
    for record in read_log():
        if record.get("tier_mode") != "cumulative":
            continue
        floor = ladder_floor(record["tiers"])
        if record["amount"] != floor:
            mismatched.append(
                f"{record['brand']}/{record['platform']}: "
                f"amount={record['amount']} != 사다리 최저 {floor}")
    assert not mismatched, "\n".join(mismatched)


def test_every_ledger_record_passes_current_schema():
    # 마이그레이션이 스키마를 어기지 않았는지. cap 동반 필수, cumulative의
    # tier 2개·qualifier "최소"가 전부 여기서 걸린다.
    for record in read_log():
        validate_record(dict(record))


def test_percent_tier_amount_is_the_floored_threshold_share():
    # 정률 tier의 amount는 정의상 min_order x percent를 원 단위로 내린 값이다
    # (25,000 x 5% = 1,250). 올림으로 과대 표시하지 않는다 — ADR-019.
    # 스키마로 강제하지 않고 여기서 보는 이유: min_order가 없는 정률 쿠폰이
    # 나오면 이 관계가 성립하지 않는데, 그런 사례가 아직 없어 규칙으로
    # 굳히기엔 이르다.
    wrong = []
    for record in read_log():
        for tier in record.get("tiers") or []:
            if "percent" not in tier or tier.get("min_order") is None:
                continue
            expected = int(tier["min_order"] * tier["percent"] / 100)
            if tier["amount"] != expected:
                wrong.append(
                    f"{record['brand']}/{record['platform']}: "
                    f"amount={tier['amount']} != {expected} "
                    f"({tier['min_order']} x {tier['percent']}%)")
    assert not wrong, "\n".join(wrong)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_ledger_consistency.py -v
```

Expected: `ImportError: cannot import name 'ladder_floor'`로 전부 FAIL.

- [ ] **Step 3: Implement `ladder_floor`**

`export_data.py`의 `camel_tiers` 아래에 추가한다.

```python
def ladder_floor(tiers: list[dict]) -> int | None:
    """겹쳐 쓰는 쿠폰의 사다리에서 가장 낮은 칸의 금액.

    문턱을 낮은 순으로 훑으며 그 문턱에서 자격이 되는 tier를 전부 더한다.
    가장 낮은 문턱의 합이 곧 "적어도 이만큼은 받는다"는 보장 바닥값이고,
    카드에 뜨는 대표 금액이다(ADR-019, ADR-014의 보장 바닥값 원칙).

    각 tier의 amount는 이미 "그 문턱에서 실제 받는 금액"이라 여기서 정률을
    다시 계산하지 않는다 — 문턱을 넘어 더 시키면 정률분이 cap까지 늘지만,
    대표값은 최저 문턱 기준이므로 그 계산이 필요 없다.

    API `DiscountLadder.floorAmount()`와 같은 값을 내야 한다. 두 레이어가
    다른 규칙을 쓰면 어느 쪽을 거치느냐로 화면 금액이 갈린다(ADR-016).
    """
    if not tiers:
        return None
    thresholds = sorted({t.get("min_order") or 0 for t in tiers})
    floor = thresholds[0]
    return sum(t["amount"] for t in tiers
               if (t.get("min_order") or 0) <= floor and t.get("amount") is not None)
```

- [ ] **Step 4: Run the ladder tests**

```bash
python -m pytest tests/test_ledger_consistency.py -v
```

Expected: `ladder_floor` 3건 PASS. `test_every_cumulative_record_amount_matches_its_ladder_floor`는 아직 cumulative 레코드가 없어 PASS(공집합). `test_every_ledger_record_passes_current_schema`는 **FAIL** — 원장의 정률 tier 7건이 `cap` 없이 `percent`만 갖고 있다.

- [ ] **Step 5: Migrate the seven ledger records**

원장 `data/log.jsonl`의 7줄을 고친다. 줄 번호는 0-based 인덱스 기준
109·110·111·119·122·215·278이다. 아래 스크립트로 정확히 처리한다.

```bash
python - <<'EOF'
import json
from pathlib import Path

LOG = Path("data/log.jsonl")
lines = LOG.read_text(encoding="utf-8").splitlines()

# 요기요 2단 6건: 정률 tier의 amount를 문턱 실수령액으로 내리고 기존
# amount를 cap으로 옮긴다. tier_mode=cumulative, qualifier="최소".
# 배민 커피앳웍스 1건: 단일 tier라 exclusive 그대로. 대표값 5,000 -> 1,800
# (5,000은 10% 상한이라 50,000원어치를 시켜야 받는 값이다).
CUMULATIVE = {"굽네치킨", "푸라닭", "BHC치킨", "계근상", "뚜레쥬르", "인생아구찜"}

changed = 0
for i, line in enumerate(lines):
    record = json.loads(line)
    tiers = record.get("tiers")
    if not tiers or not any("percent" in t for t in tiers):
        continue

    for tier in tiers:
        if "percent" not in tier or "cap" in tier:
            continue
        tier["cap"] = tier["amount"]
        tier["amount"] = int((tier.get("min_order") or 0) * tier["percent"] / 100)

    if record["brand"] in CUMULATIVE:
        record["tier_mode"] = "cumulative"
        record["qualifier"] = "최소"
    else:
        # 커피앳웍스: 단일 정률 tier라 대표값이 곧 그 tier의 실수령액이다.
        record["amount"] = tiers[0]["amount"]

    lines[i] = json.dumps(record, ensure_ascii=False)
    changed += 1
    print(f"{i}: {record['brand']}/{record['platform']} amount={record['amount']} "
          f"tier_mode={record.get('tier_mode', 'exclusive')}")

LOG.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"{changed}건 수정")
EOF
```

Expected 출력 (7건, 이 값과 다르면 멈추고 확인할 것):

```
109: 굽네치킨/yogiyo amount=4000 tier_mode=cumulative
110: 푸라닭/yogiyo amount=3000 tier_mode=cumulative
111: BHC치킨/yogiyo amount=3000 tier_mode=cumulative
119: 계근상/yogiyo amount=5000 tier_mode=cumulative
122: 뚜레쥬르/yogiyo amount=4000 tier_mode=cumulative
215: 인생아구찜/yogiyo amount=3000 tier_mode=cumulative
278: 커피앳웍스/baemin amount=1800 tier_mode=exclusive
7건 수정
```

- [ ] **Step 6: Run the consistency tests**

```bash
python -m pytest tests/test_ledger_consistency.py -v
```

Expected: 전부 PASS. 특히 `test_every_cumulative_record_amount_matches_its_ladder_floor`가 이제 요기요 6건을 실제로 검사한다.

- [ ] **Step 7: Regenerate export.json and check the blast radius**

```bash
python export_data.py
```

Expected: `export.json 170건(제외 ...), brands-sorted.txt ...개` — 건수는 그대로 170이다.

바뀐 게 커피앳웍스 하나뿐인지 확인한다.

```bash
python - <<'EOF'
import json, subprocess
old = json.loads(subprocess.run(
    ["git", "show", "HEAD:data/export.json"],
    capture_output=True, text=True, encoding="utf-8").stdout)
new = json.load(open("data/export.json", encoding="utf-8"))
ok = {(x["platform"], x["brand"]): x for x in old}
nk = {(x["platform"], x["brand"]): x for x in new}
assert ok.keys() == nk.keys(), (ok.keys() ^ nk.keys())
for k in ok:
    o = {f: v for f, v in ok[k].items() if f != "tierMode"}
    n = {f: v for f, v in nk[k].items() if f != "tierMode"}
    if o != n:
        print(k, {f: (o.get(f), n.get(f)) for f in set(o) | set(n) if o.get(f) != n.get(f)})
EOF
```

Expected: 출력이 커피앳웍스 한 줄뿐.

```
('baemin', '커피앳웍스') {'amount': (5000, 1800), 'tiers': ([{...'amount': 5000, 'percent': 10}], [{...'amount': 1800, 'percent': 10, 'cap': 5000}])}
```

요기요 6건은 2026-08-10 스윕에 안 잡혀 export에 없으므로 안 나오는 게 정상이다.

- [ ] **Step 8: Run the whole suite**

```bash
python -m pytest tests/ -q
```

Expected: 전부 PASS.

- [ ] **Step 9: Commit**

```bash
git add schema.py export_data.py tests/ data/log.jsonl data/export.json
git commit -F - <<'EOF'
feat: 정률 tier 7건에 cap 분리, 요기요 2단 6건을 cumulative로

원장의 정률 tier 7개가 amount에 상한액을 담고 있었다. amount를 문턱
실수령액(min_order x percent, 원 단위 내림)으로 내리고 상한은 cap으로
옮긴다.

요기요 6건(굽네치킨·푸라닭·BHC치킨·계근상·뚜레쥬르·인생아구찜)은 고정
메뉴할인과 정률 쿠폰을 겹쳐 쓰므로 tier_mode=cumulative, qualifier="최소".

화면에 보이는 변화는 배민 커피앳웍스 하나 — 5,000원에서 1,800원으로
내려간다. 5,000원은 10% 상한이라 50,000원어치를 시켜야 받는 값이었고,
액면만 보고 갔다가 1,800원만 받으면 그게 곧 신뢰 상실이다(ADR-014).
요기요 6건은 08-10 스윕에 안 잡혀 export에 없어 화면 영향이 없다.

원장이 스스로 모순되지 않는지 보는 test_ledger_consistency를 추가했다 —
cumulative 레코드의 amount가 사다리 최저 문턱과 같아야 하고, 원장 전체가
현재 스키마를 통과해야 한다.
EOF
```

---

### Task 5: api `DiscountTier`에 `cap` 추가

**Files:**
- Modify: `src/main/java/com/discounttracker/offer/DiscountTier.java` (api)
- Modify: `src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java` (api) — 248·383·387행의 생성자 호출
- Test: `src/test/java/com/discounttracker/offer/OfferRepositoryTest.java` (api)

**Interfaces:**
- Consumes: Task 3이 내보내는 export.json의 `tiers[].cap`
- Produces: `DiscountTier(Integer minOrder, Integer amount, Integer percent, Integer cap, String channel, Boolean soldOut, String expiresAt)` — Task 6·7이 이 생성자를 쓴다.

- [ ] **Step 1: Write the failing test**

`OfferRepositoryTest.java`에 추가한다. 이 파일은 `repositoryFor(String json)` 헬퍼로 JSON 문자열에서 레포지토리를 만든다 — 그 관례를 그대로 쓴다(새 import 불필요).

```java
    @Test
    void readsCapOnPercentTier() {
        // 요기요 굽네치킨 실측(2026-07-31): amount는 그 문턱에서 실제 받는
        // 금액(25,000 x 5% = 1,250)이고 cap이 상한 3,000원이다(ADR-019).
        OfferRepository repo = repositoryFor("""
            [{"platform":"yogiyo","brand":"굽네치킨","amount":4000,"qualifier":"최소",
              "needsReview":false,"offerType":"discount","section":null,
              "rawText":"최소 4,000원","capturedAt":"2026-07-31T10:00:00+09:00",
              "screenshotPath":"x.jpg",
              "tiers":[{"minOrder":17000,"amount":4000},
                       {"minOrder":25000,"amount":1250,"percent":5,"cap":3000}]}]
            """);
        DiscountTier percentTier = repo.findAll().get(0).tiers().get(1);
        assertEquals(1250, percentTier.amount());
        assertEquals(5, percentTier.percent());
        assertEquals(3000, percentTier.cap());
    }

    @Test
    void capIsNullOnFixedTier() {
        OfferRepository repo = repositoryFor("""
            [{"platform":"yogiyo","brand":"굽네치킨","amount":4000,"qualifier":null,
              "needsReview":false,"offerType":"discount","section":null,
              "rawText":"4,000원","capturedAt":"2026-07-31T10:00:00+09:00",
              "screenshotPath":"x.jpg","tiers":[{"minOrder":17000,"amount":4000}]}]
            """);
        assertNull(repo.findAll().get(0).tiers().get(0).cap());
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/Users/soldesk/IdeaProjects/delivery-discount-api
./gradlew test --tests '*OfferRepositoryTest.readsCapOnPercentTier'
```

Expected: 컴파일 실패 — `cannot find symbol: method cap()`.

- [ ] **Step 3: Add the field**

`DiscountTier.java`의 record 선언을 바꾸고, javadoc의 `percent` 문단을 정정한다.

```java
 * <p>{@code percent}는 정률+상한 할인(예: "5%, 최대 3,000원")일 때만 채워지고,
 * 그때 {@code cap}이 그 상한액을 든다. {@code amount}는 어느 tier에서든
 * <b>이 문턱에서 실제 받는 금액</b>이다 — 정률이면 {@code minOrder × percent}를
 * 원 단위로 내린 값이고, {@code cap}에는 문턱보다 훨씬 큰 주문에서야 닿는다
 * (굽네치킨 요기요: 25,000원에 1,250원, 3,000원 상한은 60,000원 주문). 예전엔
 * {@code amount}가 상한을 겸해 정액 tier와 뜻이 달랐고 실제로 오독을 낳았다
 * (ADR-019).
```

```java
public record DiscountTier(Integer minOrder, Integer amount, Integer percent, Integer cap,
                           String channel, Boolean soldOut, String expiresAt) {
}
```

- [ ] **Step 4: Fix the broken constructor call sites**

`BrandComparisonServiceTest.java` 3곳에 `null`을 하나씩 넣는다(`percent` 뒤, `channel` 앞).

248행:
```java
                "x.jpg", 15000, List.of(new DiscountTier(15000, 3000, null, null, null, null, null)), "1일 1회",
```

383행:
```java
    private DiscountTier tier(Integer minOrder, Integer amount, String expiresAt) {
        return new DiscountTier(minOrder, amount, null, null, null, null, expiresAt);
    }
```

387행:
```java
    private DiscountTier soldOutTier(Integer minOrder, Integer amount) {
        return new DiscountTier(minOrder, amount, null, null, null, true, null);
    }
```

- [ ] **Step 5: Run the whole api suite**

```bash
./gradlew test
```

Expected: 전부 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/discounttracker/offer/DiscountTier.java src/test/java/
git commit -F - <<'EOF'
feat: DiscountTier에 cap 추가

정률 tier의 amount가 상한액을 겸하고 있었다. amount는 이제 어느 tier에서든
"이 문턱에서 실제 받는 금액"이고 상한은 cap이 든다(tracker ADR-019).
EOF
```

---

### Task 6: `DiscountLadder` 신설

**Files:**
- Create: `src/main/java/com/discounttracker/offer/DiscountLadder.java` (api)
- Test: `src/test/java/com/discounttracker/offer/DiscountLadderTest.java` (api)

**Interfaces:**
- Consumes: Task 5의 `DiscountTier`
- Produces: `DiscountLadder.of(List<DiscountTier> tiers)` → `DiscountLadder`, `Integer floorAmount()`. Task 7의 `OfferRecord.amountAsOf`가 호출한다.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/discounttracker/offer/DiscountLadderTest.java`를 새로 만든다.

```java
package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class DiscountLadderTest {

    private DiscountTier fixed(Integer minOrder, Integer amount) {
        return new DiscountTier(minOrder, amount, null, null, null, null, null);
    }

    private DiscountTier percent(Integer minOrder, Integer amount, Integer pct, Integer cap) {
        return new DiscountTier(minOrder, amount, pct, cap, null, null, null);
    }

    @Test
    void floorIsTheSumAtTheLowestThreshold() {
        // 요기요 굽네치킨 실측(2026-07-31): 17,000원 이상 4,000원 고정
        // 메뉴할인 + 25,000원 이상 5%(상한 3,000)를 겹쳐 쓴다.
        //   17,000원 주문 -> 4,000
        //   25,000원 주문 -> 4,000 + 1,250 = 5,250
        // 대표값은 최저 문턱인 4,000이다.
        DiscountLadder ladder = DiscountLadder.of(List.of(
                fixed(17000, 4000),
                percent(25000, 1250, 5, 3000)));
        assertEquals(4000, ladder.floorAmount());
    }

    @Test
    void ladderAccumulatesAtEachThreshold() {
        DiscountLadder ladder = DiscountLadder.of(List.of(
                fixed(17000, 4000),
                percent(25000, 1250, 5, 3000)));
        assertEquals(List.of(4000, 5250), ladder.rungs().stream().map(DiscountLadder.Rung::amount).toList());
    }

    @Test
    void tierOrderDoesNotMatter() {
        DiscountLadder ladder = DiscountLadder.of(List.of(
                percent(25000, 1250, 5, 3000),
                fixed(17000, 4000)));
        assertEquals(4000, ladder.floorAmount());
    }

    @Test
    void missingMinOrderCountsAsNoThreshold() {
        DiscountLadder ladder = DiscountLadder.of(List.of(
                fixed(null, 2000),
                fixed(18000, 3000)));
        assertEquals(2000, ladder.floorAmount());
    }

    @Test
    void singleTierLadderIsThatTier() {
        assertEquals(4000, DiscountLadder.of(List.of(fixed(17000, 4000))).floorAmount());
    }

    @Test
    void emptyLadderHasNoFloor() {
        assertNull(DiscountLadder.of(List.of()).floorAmount());
    }

    @Test
    void tiersWithoutAmountAreSkipped() {
        // 금액을 못 읽은 구간은 더할 게 없다. 0으로 치면 사다리가 낮아진다.
        DiscountLadder ladder = DiscountLadder.of(List.of(
                fixed(17000, null),
                fixed(17000, 4000)));
        assertEquals(4000, ladder.floorAmount());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./gradlew test --tests '*DiscountLadderTest'
```

Expected: 컴파일 실패 — `cannot find symbol: class DiscountLadder`.

- [ ] **Step 3: Write the implementation**

`src/main/java/com/discounttracker/offer/DiscountLadder.java`:

```java
package com.discounttracker.offer;

import java.util.Comparator;
import java.util.List;

/**
 * 겹쳐 쓰는 쿠폰의 문턱별 누적 금액 — "얼마 이상 시키면 얼마 받는가"의 사다리.
 *
 * <p>요기요는 브랜드 하나에 쿠폰을 두 장 걸고 둘을 겹쳐 쓸 수 있다(굽네치킨
 * 실측 2026-07-31: 17,000원 이상 4,000원 고정 메뉴할인 + 25,000원 이상
 * 5%·상한 3,000원). 문턱을 낮은 순으로 훑으며 그 문턱에서 자격이 되는 구간을
 * 전부 더하면 사다리가 나온다.
 *
 * <pre>
 *   17,000원 이상 -> 4,000
 *   25,000원 이상 -> 4,000 + 1,250 = 5,250
 * </pre>
 *
 * <p>{@link #floorAmount()}가 카드에 뜨는 대표 금액이다. 가장 낮은 진입
 * 장벽에서 보장되는 금액이라 이보다 적게 받는 경우가 없다 — 높은 문턱값을
 * 대표로 쓰면 그 아래를 시키는 사용자에게 과대 표시가 된다(ADR-019,
 * tracker ADR-014의 보장 바닥값 원칙).
 *
 * <p>각 구간의 {@link DiscountTier#amount()}는 이미 "그 문턱에서 실제 받는
 * 금액"이라 여기서 정률을 다시 계산하지 않는다. 문턱을 넘어 더 시키면
 * 정률분이 {@link DiscountTier#cap()}까지 늘지만, 대표값은 최저 문턱 기준이라
 * 그 계산이 필요 없다.
 *
 * <p>tracker의 {@code export_data.ladder_floor()}와 같은 값을 내야 한다.
 * 두 레이어가 다른 규칙을 쓰면 어느 쪽을 거치느냐로 화면 금액이 갈린다
 * (ADR-016). 양쪽 테스트가 굽네치킨의 4,000·5,250을 같은 숫자로 고정한다.
 */
public record DiscountLadder(List<Rung> rungs) {

    /** 사다리 한 칸 — {@code minOrder}원 이상 시키면 {@code amount}원. */
    public record Rung(int minOrder, int amount) {
    }

    /**
     * 구간 목록에서 사다리를 세운다. 만료·품절 구간은 부르는 쪽이 미리
     * 걸러서 넘긴다({@link OfferRecord#liveTiers}).
     */
    public static DiscountLadder of(List<DiscountTier> tiers) {
        List<Integer> thresholds = tiers.stream()
                .map(DiscountLadder::thresholdOf)
                .distinct()
                .sorted()
                .toList();

        List<Rung> rungs = thresholds.stream()
                .map(threshold -> new Rung(threshold, sumAt(tiers, threshold)))
                .sorted(Comparator.comparingInt(Rung::minOrder))
                .toList();

        return new DiscountLadder(rungs);
    }

    /** 가장 낮은 칸의 금액. 구간이 없으면 {@code null}. */
    public Integer floorAmount() {
        return rungs.isEmpty() ? null : rungs.get(0).amount();
    }

    private static int thresholdOf(DiscountTier tier) {
        return tier.minOrder() == null ? 0 : tier.minOrder();
    }

    private static int sumAt(List<DiscountTier> tiers, int threshold) {
        return tiers.stream()
                .filter(t -> thresholdOf(t) <= threshold)
                .filter(t -> t.amount() != null)
                .mapToInt(DiscountTier::amount)
                .sum();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./gradlew test --tests '*DiscountLadderTest'
```

Expected: 7건 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/discounttracker/offer/DiscountLadder.java src/test/java/com/discounttracker/offer/DiscountLadderTest.java
git commit -F - <<'EOF'
feat: 겹쳐 쓰는 쿠폰의 사다리를 계산하는 DiscountLadder

문턱을 낮은 순으로 훑으며 그 문턱에서 자격이 되는 구간을 전부 더한다.
가장 낮은 칸이 카드 대표 금액이다 — 이보다 적게 받는 경우가 없다.

OfferRecord가 이미 만료 판정으로 무거워 별도 타입으로 뺐다. tracker의
export_data.ladder_floor()와 같은 값을 내야 하고, 양쪽 테스트가 굽네치킨의
4,000·5,250을 같은 숫자로 고정한다(ADR-016).
EOF
```

---

### Task 7: `OfferRecord`에 `tierMode` 추가하고 `amountAsOf`를 갈래 짓는다

**Files:**
- Modify: `src/main/java/com/discounttracker/offer/OfferRecord.java` (api)
- Modify: `src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java` (api) — 59·66·246·294·392행의 생성자 호출
- Test: `src/test/java/com/discounttracker/offer/OfferRecordTest.java` (api, 없으면 생성)

**Interfaces:**
- Consumes: Task 6의 `DiscountLadder.of(...).floorAmount()`
- Produces: `OfferRecord`가 `String tierMode`를 갖고 `boolean isCumulative()`를 노출한다. `amountAsOf(today)`가 cumulative면 사다리 최저값을 돌려준다. Task 8의 `Offer`가 `tierMode()`를 읽는다.

- [ ] **Step 1: Write the failing test**

`src/test/java/com/discounttracker/offer/OfferRecordTest.java`를 만든다(이미 있으면 메서드만 추가).

```java
package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OfferRecordTest {

    private static final LocalDate TODAY = LocalDate.parse("2026-08-13");

    private OfferRecord record(Integer amount, String tierMode, List<DiscountTier> tiers) {
        return new OfferRecord("yogiyo", "굽네치킨", amount, "최소", false,
                "discount", null, "최소 4,000원", "2026-07-31T10:00:00+09:00",
                "x.jpg", null, tierMode, tiers, null, null, null, false);
    }

    private DiscountTier fixed(Integer minOrder, Integer amount) {
        return new DiscountTier(minOrder, amount, null, null, null, null, null);
    }

    private DiscountTier percent(Integer minOrder, Integer amount, Integer pct, Integer cap) {
        return new DiscountTier(minOrder, amount, pct, cap, null, null, null);
    }

    @Test
    void nullTierModeIsExclusive() {
        // tracker가 tier_mode를 실어 보내기 전의 export.json에는 이 필드가
        // 아예 없다. 없으면 지금까지의 해석(택일)이다.
        assertFalse(record(4000, null, null).isCumulative());
    }

    @Test
    void cumulativeAmountComesFromTheLadderFloor() {
        // 굽네치킨: 사다리는 17,000원에 4,000 / 25,000원에 5,250이고
        // 대표값은 최저 문턱인 4,000이다.
        OfferRecord r = record(4000, "cumulative", List.of(
                fixed(17000, 4000),
                percent(25000, 1250, 5, 3000)));
        assertTrue(r.isCumulative());
        assertEquals(4000, r.amountAsOf(TODAY));
    }

    @Test
    void cumulativeIgnoresTheLedgerAmountWhenItDisagrees() {
        // 원장 값이 어긋나 있어도 화면에는 계산값이 나간다. 어긋남 자체는
        // tracker의 test_ledger_consistency가 잡는다.
        OfferRecord r = record(9999, "cumulative", List.of(
                fixed(17000, 4000),
                percent(25000, 1250, 5, 3000)));
        assertEquals(4000, r.amountAsOf(TODAY));
    }

    @Test
    void cumulativeSkipsExpiredTiers() {
        // 만료된 구간은 사다리에 안 들어간다. 17,000원 칸이 끝났으면
        // 남은 건 25,000원 칸뿐이고 대표값도 그쪽이 된다.
        OfferRecord r = new OfferRecord("yogiyo", "굽네치킨", 4000, "최소", false,
                "discount", null, "최소 4,000원", "2026-07-31T10:00:00+09:00",
                "x.jpg", null, "cumulative", List.of(
                        new DiscountTier(17000, 4000, null, null, null, null, "2026-08-01"),
                        new DiscountTier(25000, 1250, 5, 3000, null, null, null)),
                null, null, null, false);
        assertEquals(1250, r.amountAsOf(TODAY));
    }

    @Test
    void cumulativeSkipsSoldOutTiers() {
        // 품절 구간은 못 받는 금액이라 더하면 안 된다. liveTiers는 만료만
        // 거르므로(상세 패널이 품절 구간도 보여줘야 한다) 합산 전에 한 번 더
        // 거른다 — 쿠팡이츠 메가MGC커피 실측과 같은 이유.
        OfferRecord r = new OfferRecord("yogiyo", "굽네치킨", 4000, "최소", false,
                "discount", null, "최소 4,000원", "2026-07-31T10:00:00+09:00",
                "x.jpg", null, "cumulative", List.of(
                        new DiscountTier(17000, 4000, null, null, null, null, null),
                        new DiscountTier(17000, 9999, null, null, null, true, null)),
                null, null, null, false);
        assertEquals(4000, r.amountAsOf(TODAY));
    }

    @Test
    void exclusiveKeepsTheExistingLoweringRule() {
        // exclusive는 아무것도 안 바뀐다 — 원장 대표값을 쓰되 살아 있는
        // 구간이 전부 그보다 작으면 그만큼 내린다.
        OfferRecord r = record(9000, "exclusive", List.of(fixed(17000, 5000)));
        assertEquals(5000, r.amountAsOf(TODAY));
    }

    @Test
    void exclusiveDoesNotRaiseTheLedgerAmount() {
        // 올리지는 않는다 — 품절·멤버십 조건이 구간에 안 실려 있어
        // 구간만 보고 올리면 일반 사용자가 못 받는 금액이 뜰 수 있다.
        OfferRecord r = record(4000, "exclusive", List.of(fixed(17000, 9000)));
        assertEquals(4000, r.amountAsOf(TODAY));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./gradlew test --tests '*OfferRecordTest'
```

Expected: 컴파일 실패 — 생성자 인자 개수 불일치, `cannot find symbol: method isCumulative()`.

- [ ] **Step 3: Add the field and branch**

`OfferRecord.java`의 record 선언에서 `List<DiscountTier> tiers` **바로 앞**에 넣는다.

```java
        Integer minOrderAmount,
        // 이 레코드의 tiers를 택일로 볼지 누적으로 볼지. "cumulative"면
        // 쿠폰 여러 장을 겹쳐 쓴다는 뜻이라 대표값을 사다리에서 계산한다
        // (tracker ADR-019). null 허용이다 — tracker가 이 필드를 실어
        // 보내기 전의 export.json에는 키 자체가 없고, 없으면 지금까지의
        // 해석(택일)이다.
        String tierMode,
        List<DiscountTier> tiers,
```

`status()` 위에 헬퍼를 추가한다.

```java
    /** 쿠폰을 겹쳐 쓰는 오퍼인가. 모르면(null) 아니다 — 지금까지의 해석이 택일이다. */
    public boolean isCumulative() {
        return "cumulative".equals(tierMode);
    }

    /**
     * 오늘 실제로 받을 수 있는 구간 — 만료된 것과 품절된 것을 뺀 나머지.
     *
     * <p>{@link #liveTiers}는 만료만 본다. 상세 패널에는 품절 구간도
     * "품절"이라고 보여줘야 하기 때문이다. 반면 금액을 더할 때는 품절 구간을
     * 빼야 한다 — 못 받는 금액을 더하면 카드가 실제보다 큰 값을 말한다
     * (쿠팡이츠 메가MGC커피 실측: 20,000원 구간이 품절이라 대표값이 6,000원).
     */
    private List<DiscountTier> claimableTiers(LocalDate today) {
        return liveTiers(today).stream()
                .filter(t -> !Boolean.TRUE.equals(t.soldOut()))
                .toList();
    }
```

`amountAsOf`를 갈래 짓는다. 기존 javadoc은 그대로 두고 앞에 문단 하나와 분기만 더한다.

```java
     * <p><b>겹쳐 쓰는 오퍼는 다르다.</b> {@code tierMode}가 {@code "cumulative"}면
     * 대표값을 사다리에서 계산한다({@link DiscountLadder}). 겹친다는 사실이
     * 데이터에 실려 있어 계산에 필요한 정보가 전부 있으므로, 아래의 "올리지
     * 않는다"가 적용되지 않는다(ADR-010).
     */
    public Integer amountAsOf(LocalDate today) {
        if (isCumulative()) {
            Integer floor = DiscountLadder.of(claimableTiers(today)).floorAmount();
            return floor != null ? floor : amount;
        }
        if (tiers == null || tiers.isEmpty() || amount == null) {
            return amount;
        }
        Integer live = liveTiers(today).stream()
                .filter(t -> !Boolean.TRUE.equals(t.soldOut()) && t.amount() != null)
                .map(DiscountTier::amount)
                .max(Integer::compareTo)
                .orElse(null);
        return live != null && live < amount ? live : amount;
    }
```

- [ ] **Step 4: Fix the broken constructor call sites**

`BrandComparisonServiceTest.java` 5곳에 `null`(또는 `"exclusive"`)을 `minOrderAmount` 뒤, `tiers` 앞에 넣는다.

59행 (`rec`):
```java
        return new OfferRecord(platform, brand, amount, qualifier, needsReview,
                "discount", null, amount == null ? "" : amount + "원",
                "2026-07-27T14:20:00+09:00", "path.jpg", null, null, null, null, null, null, false);
```

66행 (`recWithConditions`):
```java
        return new OfferRecord(platform, brand, amount, null, needsReview,
                "discount", null, amount == null ? "" : amount + "원",
                "2026-07-29T18:00:00+09:00", "path2.jpg", minOrder, null, null, conditions, null, null, false);
```

246행 (`carriesDetailFieldsThroughToOffer`):
```java
        OfferRecord detailed = new OfferRecord("yogiyo", "굽네치킨", 7000, "최대", true,
                "discount", null, "최대 7,000원 할인", "2026-07-27T14:25:00+09:00",
                "x.jpg", 15000, null, List.of(new DiscountTier(15000, 3000, null, null, null, null, null)), "1일 1회",
                "2026-08-31", "선착순 품절", true);
```

294행과 392행(`recWithTiers`)도 같은 자리에 `null`을 하나 넣는다. 각 호출부의 인자 개수가 **17개**가 되어야 한다.

- [ ] **Step 5: Run the whole api suite**

```bash
./gradlew test
```

Expected: 전부 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/discounttracker/offer/OfferRecord.java src/test/java/
git commit -F - <<'EOF'
feat: cumulative 오퍼의 대표값을 사다리에서 계산한다

amountAsOf는 "내리기만 하고 올리지 않는다"였다. 근거는 품절·멤버십 조건이
구간에 안 실려 있어 재계산이 위험하다는 것이었고 exclusive에는 그대로
유효하다.

cumulative는 겹친다는 사실이 tier_mode로 데이터에 실려 있어 계산에 필요한
정보가 전부 있다. 이 경우만 DiscountLadder로 사다리를 세워 최저 문턱 값을
쓴다. 만료 구간은 liveTiers가 먼저 거른다.

tierMode는 null 허용이다 — tracker가 필드를 실어 보내기 전의 export.json에는
키가 없고, 없으면 지금까지의 해석(택일)이다(ADR-010).
EOF
```

---

### Task 8: `Offer`가 `tierMode`를 응답에 실어 보낸다

**Files:**
- Modify: `src/main/java/com/discounttracker/offer/Offer.java` (api)
- Test: `src/test/java/com/discounttracker/web/BrandControllerTest.java` (api)
- Test: `src/test/java/com/discounttracker/comparison/BrandComparisonServiceTest.java` (api)

**Interfaces:**
- Consumes: Task 7의 `OfferRecord.tierMode()`
- Produces: `/api/brands` 응답의 각 offer에 `tierMode`가 들어간다. 프론트가 `tierMode == "cumulative" && tiers.length > 1`로 `+α` 표시를 판단한다.

- [ ] **Step 1: Write the failing tests**

`BrandControllerTest.java`의 계약 테스트에 키 존재 단언을 추가한다. 48행 근처 `hasKey("tiers")` 옆에 같은 모양으로 붙인다.

```java
           .andExpect(jsonPath("$[0].offers[0]", org.hamcrest.Matchers.hasKey("tierMode")))
```

`BrandComparisonServiceTest.java`에 값이 흘러가는지 보는 테스트를 추가한다.

```java
    @Test
    void carriesTierModeThroughToOffer() {
        // 프론트가 "겹치는 쿠폰이 더 있다"(+a 표시)를 판단하는 근거라
        // 응답까지 그대로 나가야 한다.
        OfferRecord cumulative = new OfferRecord("yogiyo", "굽네치킨", 4000, "최소", false,
                "discount", null, "최소 4,000원", "2026-07-31T10:00:00+09:00",
                "x.jpg", null, "cumulative", List.of(
                        new DiscountTier(17000, 4000, null, null, null, null, null),
                        new DiscountTier(25000, 1250, 5, 3000, null, null, null)),
                null, null, null, false);
        Offer offer = serviceWith(List.of(cumulative), "brands: {}")
                .compare().get(0).offers().get(0);
        assertEquals("cumulative", offer.tierMode());
        assertEquals(4000, offer.amount());
        assertEquals(3000, offer.tiers().get(1).cap());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./gradlew test --tests '*BrandComparisonServiceTest.carriesTierModeThroughToOffer' --tests '*BrandControllerTest'
```

Expected: 컴파일 실패 — `cannot find symbol: method tierMode()`.

- [ ] **Step 3: Add the field**

`Offer.java`의 record 선언에서 `List<DiscountTier> tiers` 앞에 넣고, `from`과 `withDetailFrom`의 생성자 호출을 맞춘다.

```java
public record Offer(String platform, Integer amount, String qualifier,
                    @JsonIgnore OfferStatus status,
                    String rawText, @JsonIgnore String screenshotPath, String capturedAt,
                    Integer minOrderAmount, String tierMode, List<DiscountTier> tiers,
                    String conditions, String expiresAt, String badge, boolean soldOut) {

    public static Offer from(OfferRecord r, LocalDate today) {
        return new Offer(r.platform(), r.amountAsOf(today), r.qualifier(),
                r.status(), r.rawText(), r.screenshotPath(), r.capturedAt(),
                r.minOrderAmount(), r.tierMode(), r.liveTiers(today), r.conditions(),
                r.expiresAt(), r.badge(), Boolean.TRUE.equals(r.soldOut()));
    }
```

`withDetailFrom`의 마지막 `new Offer(...)`도 같은 자리에 `tierMode`를 넣는다. **병합 대상이 아니다** — 겹침 여부는 이긴 쪽 자신의 구간 구성에 매인 값이라 진 쪽에서 옮겨 붙이면 안 된다(`soldOut`과 같은 이유).

```java
        return new Offer(platform, amount, qualifier, status, rawText, screenshotPath, capturedAt,
                mergedMinOrder, tierMode, mergedTiers, mergedConditions, mergedExpiresAt,
                mergedBadge, soldOut);
```

- [ ] **Step 4: Run the whole api suite**

```bash
./gradlew test
```

Expected: 전부 PASS.

- [ ] **Step 5: Verify the response shape end to end**

```bash
./gradlew bootRun &
sleep 25
curl -s http://localhost:8080/api/brands | python -c "
import json, sys
d = json.load(sys.stdin)
offers = [o for b in d for o in b['offers']]
print('offers:', len(offers))
print('offer keys:', sorted(offers[0].keys()))
print('tierMode 분포:', {m: sum(1 for o in offers if o.get('tierMode') == m)
                         for m in {o.get('tierMode') for o in offers}})
caps = [t for o in offers if o.get('tiers') for t in o['tiers'] if t.get('cap')]
print('cap 실린 tier:', caps)
"
kill %1
```

Expected: `offer keys`에 `tierMode`가 있고, 로컬 픽스처(6건짜리 합성 데이터)에는 cumulative가 없으므로 전부 `exclusive`로 나온다. 실데이터 확인은 배포 후에 한다.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/discounttracker/offer/Offer.java src/test/java/
git commit -F - <<'EOF'
feat: 응답에 tierMode를 실어 보낸다

프론트가 "겹치는 쿠폰이 더 있다"(+a 표시)를 판단하는 근거다. 대표값은
최저 문턱이라 정률 쿠폰이 칩 숫자에 안 드러나므로, 그 사실을 프론트가
알 수 있어야 한다(ADR-019).

중복 정리 시 병합하지 않는다 — 겹침 여부는 이긴 쪽 자신의 구간 구성에
매인 값이라 진 쪽에서 옮겨 붙이면 관계없는 레코드가 잘못 누적으로 보인다
(soldOut과 같은 이유).
EOF
```

---

## 배포 순서

**API를 먼저 배포하고 tracker 데이터를 나중에** 올린다. tracker 워크플로가 API 워크플로보다 먼저 끝나는 문제가 이미 있었다(2026-08-03 badge 추가 때 재현). 지금은 `FAIL_ON_UNKNOWN_PROPERTIES=false`라 역순이어도 reload가 깨지진 않고 `cap`·`tierMode`만 잠시 안 보인다.

두 브랜치를 각자 main에 머지한 뒤:

1. api `feat/cumulative-coupons` → main 머지, push (self-hosted 워크플로가 빌드·재시작)
2. tracker `feat/cumulative-coupons` → main 머지, push (export.json 복사 + reload)
3. 배포 확인:
   ```bash
   curl -s https://bebeggars.duckdns.org/api/brands | python -c "
   import json, sys
   brands = json.load(sys.stdin)
   offers = [o for b in brands for o in b['offers']]
   print('tierMode 키 있음:', 'tierMode' in offers[0])
   coffee = next((o for b in brands if b['name'] == '커피앳웍스'
                  for o in b['offers'] if o['platform'] == 'baemin'), None)
   print('커피앳웍스 배민:', coffee['amount'] if coffee else '없음', '(1800이어야 함)')
   print('cap 실린 tier:', [t for o in offers if o.get('tiers')
                            for t in o['tiers'] if t.get('cap')])
   "
   ```
   커피앳웍스가 `1800`으로 나오고 `cap` 실린 tier가 하나 보이면 정상이다.

## 이 계획이 끝난 뒤 남는 것 (범위 밖)

- **모노레포 반영** — ADR-018의 "양쪽" 파일(`schema.py`, `export_data.py`, `tests/`, `docs/`, `data/`)과 api `src/`를 모노레포로 옮긴다. main 머지 후 별도 작업.
- **프론트** — `+α` 표시, 토글 상세 배치. web 세션 소관.
- **요기요 상세 재수집** — 지금 export의 요기요 22건은 전부 목록 캡처라 겹침 정보가 없다. 이 계획은 그 수집분이 들어올 자리를 만드는 것이고, 실제 수집은 화면을 보며 tracker가 한다.
- **랜덤박스** — `amount: null` + `needs_review`로 남는다. 별도 타입이 필요하다.
