import json
from collections import defaultdict
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


def _is_confirmed(record: dict) -> bool:
    return record.get("amount") is not None and not record.get("needs_review", False)


def _amount_or_zero(record: dict) -> int:
    return record.get("amount") or 0


def _same_coupon(winner: dict, loser: dict) -> bool:
    """상세를 옮겨 붙여도 되는 사이인지 — 금액이 다르면 다른 쿠폰일 수 있다.

    API `Offer.withDetailFrom`의 `sameCoupon` 가드를 그대로 옮긴 것
    (2026-07-31, 훌랄라참숯바베큐치킨 실측: 확정 5,000원 오퍼에 다른
    needs_review 12,100원 오퍼의 메뉴 한정 조건이 그대로 붙어, 5,000원
    오퍼가 그 메뉴로 한정된 것처럼 잘못 보였다). 어느 한쪽이라도 금액을
    모르면(자동 매칭 실패로 amount만 비운 경우) "다르다"고 단정할 근거가
    없으므로 병합을 막지 않는다.
    """
    return winner.get("amount") is None or loser.get("amount") is None \
        or winner["amount"] == loser["amount"]


# 진 쪽에서 끌어올 수 있는 필드. **화면 어디에 찍히는 값인지**로 가른다.
#
#   상세를 열어야 보이는 값(최소주문금액, 구간, 조건)은 목록 캡처에 없는
#   것이 정상이다. 없다고 "없어졌다"고 읽으면 안 되므로 끌어온다.
#
#   badge는 목록 카드에 금액과 나란히 찍힌다. 최신 캡처가 그 카드를 보고도
#   badge를 안 적었으면 그건 "못 봤다"가 아니라 "없어졌다"이다. 그래서
#   병합하지 않는다 — 2026-08-22에 청년피자 땡겨요가 이 때문에 막혔다.
#   08-05·08-06 backfill 레코드가 07-31 스크린샷을 그대로 가리키면서
#   원문에 없는 "포장 +1,000"을 달고 있었고, 08-17 자동 전수 캡처가 같은
#   카드를 보고 badge 없이 기록했는데도 그 값이 되살아났다.
#
# expires_at은 남긴다. 목록에 찍히긴 하지만 빼면 23건이 만료일을 잃고
# 추정(ADR-023)으로 떨어진다 — 그 판단은 따로 해야 한다.
#
# 이 목록은 API의 Offer.withDetailFrom과 **글자까지 같아야 한다**(ADR-016).
# 두 레이어가 다르면 어느 쪽을 거치느냐에 따라 결과가 달라진다.
MERGEABLE_DETAIL = ("min_order_amount", "tiers", "conditions", "expires_at")


def _prefer(current: dict, incoming: dict) -> dict:
    """같은 (앱, 브랜드)에 레코드가 둘 이상이면 남길 쪽을 고른다.

    확정(금액 있고 needs_review 아님)이 보류를 이기고, 같은 등급이면 더
    최근에 캡처한 쪽이 남는다(같은 시각이면 금액 큰 쪽 — 주로 테스트처럼
    인위적으로 같은 시각을 넣은 경우에만 걸린다). 진 쪽의 상세
    (min_order_amount, tiers, conditions)는 이긴 쪽에 그 값이 비어 있고
    `_same_coupon`이 참일 때만 옮겨 붙인다. API 쪽 Offer.preferredOver /
    withDetailFrom과 같은 규칙이다 — 두 레이어가 다른 규칙을 쓰면 어느
    쪽을 거치느냐에 따라 결과가 달라지는 버그가 생긴다(ADR-016).

    amount 비교 없이 무조건 옮겨 붙이면 서로 다른 쿠폰의 상세가 섞인다:
    훌랄라참숯바베큐치킨 실측(2026-07-31)에서 땡겨요의 확정 5,000원
    오퍼(전체 메뉴)에 다른 needs_review 12,100원 오퍼(순살 참숯구이
    한정 쿠폰)의 조건 문구가 붙어, 5,000원 오퍼가 그 메뉴로 한정된 것처럼
    잘못 보였다. 반대로 진 쪽 amount를 아예 모르는 경우까지 "금액이
    다르다"고 막으면 상세를 확인하려 시도했다는 사실 자체가 사라진다 —
    꾸브라꼬숯불치킨 실측(2026-07-31)에서 실제로 이렇게 막혀 원문이
    사라졌었다.
    """
    current_confirmed = _is_confirmed(current)
    incoming_confirmed = _is_confirmed(incoming)
    if current_confirmed != incoming_confirmed:
        winner, loser = (current, incoming) if current_confirmed else (incoming, current)
    elif current["captured_at"] == incoming["captured_at"]:
        current_wins = _amount_or_zero(current) >= _amount_or_zero(incoming)
        winner, loser = (current, incoming) if current_wins else (incoming, current)
    elif current["captured_at"] >= incoming["captured_at"]:
        winner, loser = current, incoming
    else:
        winner, loser = incoming, current

    merged = dict(winner)
    if _same_coupon(winner, loser):
        # 목록 근거는 MERGEABLE_DETAIL 위 주석에 있다.
        for field in MERGEABLE_DETAIL:
            if merged.get(field) is None and loser.get(field) is not None:
                merged[field] = loser[field]
    return merged


def latest_per_brand(records: list[dict]) -> dict:
    latest: dict = {}
    for record in records:
        key = (record["platform"], record["brand"])
        current = latest.get(key)
        latest[key] = record if current is None else _prefer(current, record)
    return latest


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
