"""export.json에만 있는 관측을 원장(log.jsonl)으로 되돌린다.

## 왜

원장이 2026-07-29에서 멈춰 있는 동안 수집분이 export.json 직접 편집으로
들어왔다. 실측(2026-08-05): 원장 109건, export 138건, 그중 **110건을 원장이
한 번도 본 적이 없다**. 이 상태로 `export_data.py`를 돌리면 export.json이
원장에서 만들 수 있는 것만 남기고 나머지를 버린다.

방향은 한쪽이다 — export에만 있는 것을 원장으로 흡수한다. 양쪽을 섞으면
같은 (앱, 브랜드)에 값이 다를 때 누가 이기는지 규칙이 없어, 조용히 틀린
값이 채택된다.

## 없는 값을 지어내지 않는다

export.json은 화면에 필요한 16개 필드만 들고 있어서 원장 전용 필드가 빈다.
- `target_address`·`scope`: 기존 109건이 전부 같은 값이라 그대로 쓴다.
- `page`: 화면마다 달라 추정할 근거가 없다 — 비운다.
- `capture_mode`: `backfill`로 남긴다. 화면을 다시 본 게 아니라 파생
  결과에서 되돌린 값이라는 사실이 원장에 남아야 한다.

## 청년피자 배민은 제외한다

`(baemin, 청년피자)`에 레코드가 둘이다 — 일반 4,000원(최소주문 18,900)과
배민클럽 전용 7,500원. 손상이 아니라 같은 화면의 서로 다른 두 쿠폰인데,
`latest_per_brand`가 (앱, 브랜드) 하나만 남기므로 흡수하면 캡처 시각이 같아
금액 큰 쪽이 이겨 4,000원이 사라진다. 멤버십 조건부 쿠폰을 담을 자리가
생길 때까지 export.json에만 둔다(드리프트 1건을 알고 남기는 것이다).
"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).parent
LOG_PATH = BASE / "data" / "log.jsonl"
EXPORT_PATH = BASE / "data" / "export.json"

# export(camelCase) -> 원장(snake_case). export에만 있는 필드는 전부 옮긴다.
FIELD_MAP = {
    "platform": "platform", "brand": "brand", "amount": "amount",
    "qualifier": "qualifier", "needsReview": "needs_review",
    "offerType": "offer_type", "section": "section", "rawText": "raw_text",
    "capturedAt": "captured_at", "screenshotPath": "screenshot_path",
    "minOrderAmount": "min_order_amount", "tiers": "tiers",
    "conditions": "conditions", "expiresAt": "expires_at",
    "badge": "badge", "soldOut": "sold_out",
}

# 기존 109건이 전부 이 값이다 — 같은 기기·같은 주소로 모은 기록이라 그대로 쓴다.
TARGET_ADDRESS = "경기도 성남시 수정구 금토동"

# 원장 스키마에 담을 자리가 없어 흡수를 미루는 건. 값을 지어내거나 스키마를
# 급히 넓히는 대신, 설계가 정해질 때까지 export.json에만 두고 여기 적어둔다
# — 드리프트를 모르고 남기는 것과 알고 남기는 것은 다르다.
#
# 2026-08-06 기준 비어 있다. 두 건 다 스키마를 넓히지 않고 데이터 쪽에서
# 풀었다:
# - (baemin, 청년피자): 일반 4,000원과 배민클럽 7,500원을 레코드 둘이
#   아니라 tiers 둘로 합쳤다. 청년피자 땡겨요가 이미 쓰던 모양이다
#   (tiers + badge로 설명). 헤드라인은 조건 없이 받는 4,000원.
# - (baemin, 열정국밥): qualifier에 "특정 메뉴 할인"이 들어 있었다.
#   ADR-004의 qualifier는 금액 수식어(최대/최소)라 이 값을 담을 자리가
#   아니다. badge 하나로 합쳐("배민클럽 전용, 특정 메뉴") qualifier를
#   비웠다 — 라벨 슬롯을 늘리려고 스키마·API·프론트를 뜯는 것보다 싸고,
#   qualifier가 amount의 상한/하한을 가리킨다는 뜻도 지켜진다.
EXCLUDED: set[tuple[str, str]] = set()


def snake_tiers(tiers):
    if not tiers:
        return None
    out = []
    for t in tiers:
        item = {"min_order": t.get("minOrder"), "amount": t.get("amount")}
        for camel, snake in (("percent", "percent"), ("channel", "channel"),
                             ("soldOut", "sold_out")):
            if camel in t:
                item[snake] = t[camel]
        out.append(item)
    return out


def to_ledger(record: dict) -> dict:
    out = {snake: record.get(camel) for camel, snake in FIELD_MAP.items()}
    out["tiers"] = snake_tiers(record.get("tiers"))
    # export는 soldOut을 null로 실어 나르기도 한다(사람이 직접 편집한 흔적) —
    # 원장 스키마에서는 bool이라 null을 False로 정규화한다.
    out["sold_out"] = bool(out.get("sold_out"))
    out["target_address"] = TARGET_ADDRESS
    out["capture_mode"] = "backfill"
    out["scope"] = "brand"
    out["page"] = None
    return out


# 원장이 이미 아는 관측에 붙은 정정을 되돌릴 때 쓸 시각. 원본 관측 시각을
# 그대로 쓰면 원장의 그 줄과 같은 관측이 되어 흡수 자체가 안 되고, 그렇다고
# 언제 고쳤는지도 모른다 — "이 날짜 기준으로는 이 값이 맞다"는 뜻으로 둔다.
CORRECTED_AT = "2026-08-05T00:00:00+09:00"

# 원장에 없는 필드는 비교 대상이 아니다(export가 안 실어 나르는 값들).
COMPARED = tuple(FIELD_MAP.values())


def _differs(export_record: dict, log_record: dict) -> bool:
    """같은 관측인데 원장과 export의 내용이 다른가.

    export.json에 손으로 붙인 값(만료일·조건)이 원장엔 없는 경우가 있다 —
    관측 키가 같아 "이미 있다"로 건너뛰면 그 값이 영영 원장에 안 들어온다.
    """
    candidate = to_ledger(export_record)
    for field in COMPARED:
        if field == "sold_out":
            continue  # export는 null, 원장은 False — 표기 차이일 뿐이다
        if candidate.get(field) != log_record.get(field):
            return True
    return False


def missing_from_ledger(export_records: list[dict], log_records: list[dict]) -> list[dict]:
    """(새 관측, 기존 관측에 붙은 정정) 둘 다 골라낸다."""
    by_observation = {(r["platform"], r["brand"], r["captured_at"]): r for r in log_records}
    out = []
    for record in export_records:
        if (record["platform"], record["brand"]) in EXCLUDED:
            continue
        known = by_observation.get(
            (record["platform"], record["brand"], record["capturedAt"]))
        if known is None:
            out.append(record)
        elif _differs(record, known):
            out.append(dict(record, capturedAt=CORRECTED_AT))
    return out


def main(argv: list[str]) -> int:
    export_records = json.loads(EXPORT_PATH.read_text(encoding="utf-8"))
    log_records = [json.loads(l) for l in LOG_PATH.read_text(encoding="utf-8").splitlines() if l.strip()]

    missing = missing_from_ledger(export_records, log_records)
    ledger_shaped = [to_ledger(r) for r in missing]

    out_path = Path(argv[1]) if len(argv) > 1 else BASE / "data" / "backfill.json"
    out_path.write_text(json.dumps(ledger_shaped, ensure_ascii=False, indent=2),
                        encoding="utf-8")
    print(f"원장 {len(log_records)}건 · export {len(export_records)}건")
    print(f"흡수 대상 {len(ledger_shaped)}건 -> {out_path}")
    print(f"제외: {sorted(EXCLUDED)}")
    print("다음: python ingest.py <위 파일> --dry-run 으로 판정을 먼저 확인할 것")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
