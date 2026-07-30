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


def _prefer(current: dict, incoming: dict) -> dict:
    """같은 (앱, 브랜드)에 레코드가 둘 이상이면 남길 쪽을 고른다.

    확정(금액 있고 needs_review 아님)이 보류를 이기고, 같은 등급이면 더
    최근에 캡처한 쪽이 남는다. 진 쪽의 상세(min_order_amount, tiers,
    conditions)는 이긴 쪽에 그 값이 비어 있을 때만 옮겨 붙인다 — 예를 들어
    이미 확정된 금액을 재확인하며 조건만 새로 캡처한(needs_review) 기록을
    통째로 버리면, 그 조건을 모은 수고가 사라진다. API 쪽
    Offer.preferredOver와 같은 규칙이다.
    """
    current_confirmed = _is_confirmed(current)
    incoming_confirmed = _is_confirmed(incoming)
    if current_confirmed != incoming_confirmed:
        winner, loser = (current, incoming) if current_confirmed else (incoming, current)
    elif current["captured_at"] >= incoming["captured_at"]:
        winner, loser = current, incoming
    else:
        winner, loser = incoming, current

    merged = dict(winner)
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
