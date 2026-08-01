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


def _prefer(current: dict, incoming: dict) -> dict:
    """같은 (앱, 브랜드)에 레코드가 둘 이상이면 남길 쪽을 고른다.

    확정(금액 있고 needs_review 아님)이 보류를 이기고, 같은 등급이면 더
    최근에 캡처한 쪽이 남는다(같은 시각이면 금액 큰 쪽 — 주로 테스트처럼
    인위적으로 같은 시각을 넣은 경우에만 걸린다). 진 쪽의 상세
    (min_order_amount, tiers, conditions)는 이긴 쪽에 그 값이 비어 있고
    `_same_coupon`이 참일 때만 옮겨 붙인다. API 쪽 Offer.preferredOver /
    withDetailFrom과 같은 규칙이다 — 두 레이어가 다른 규칙을 쓰면 어느
    쪽을 거치느냐에 따라 결과가 달라지는 버그가 생긴다(ADR-016).
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
        for field in ("min_order_amount", "tiers", "conditions"):
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
