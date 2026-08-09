"""원장을 브랜드 할인 카드가 쓸 수 있는 형태로 내보낸다.

용어는 `docs/GLOSSARY.md` — 여기서 "브랜드 할인 카드"는 **우리 서비스
화면의 카드**이고, 배달앱 화면 안의 카드가 아니다.

원장은 관측 기록이라 지나간 것도 남긴다(append-only). 하지만 화면에
띄울 수 있는 것은 **지금 실제로 받을 수 있는 것뿐**이다. 그 경계를
`is_live()`가 긋는다 — 저장은 하되 내보내지는 않는다.
"""
import json
from datetime import date
from pathlib import Path

from store import read_records, latest_per_brand

# export.json 항목에 담을 필드: (원장 snake_case 키, export camelCase 키)
FIELDS = [
    ("platform", "platform"),
    ("brand", "brand"),
    ("amount", "amount"),
    ("qualifier", "qualifier"),
    ("needs_review", "needsReview"),
    ("offer_type", "offerType"),
    ("section", "section"),
    ("raw_text", "rawText"),
    ("captured_at", "capturedAt"),
    ("screenshot_path", "screenshotPath"),
    # 상세 조건. 아직 대부분 None이지만, 채워지는 대로 프론트 상세 패널에
    # 그대로 뜬다 — 스키마를 먼저 뚫어놔야 수집이 반영될 데가 생긴다.
    ("min_order_amount", "minOrderAmount"),
    ("tiers", "tiers"),
    ("conditions", "conditions"),
    ("expires_at", "expiresAt"),
    ("badge", "badge"),
    ("sold_out", "soldOut"),
]

LOG_PATH = Path(__file__).parent / "data" / "log.jsonl"
EXPORT_PATH = Path(__file__).parent / "data" / "export.json"
BRANDS_PATH = Path(__file__).parent / "data" / "brands-sorted.txt"


def camel_tiers(tiers):
    """구간 할인도 export에선 camelCase — 원장은 snake_case를 유지한다.

    percent(정률+상한 할인, 예: 요기요 "25,000원 이상 5%, 최대 3,000원")
    가 있는 항목만 그 필드를 옮긴다 — 정액 tier는 그대로 amount만. channel
    (배달/포장/매장식사별 별개 쿠폰, 예: 땡겨요 바른치킨)·sold_out(품절
    티어, 예: 쿠팡이츠 메가MGC커피)·expires_at(구간별 만료일, 예: 배민
    청년피자의 일반 08-30 / 배민클럽 08-31)도 있으면 옮긴다.
    """
    if not tiers:
        return None
    out = []
    for t in tiers:
        item = {"minOrder": t["min_order"], "amount": t["amount"]}
        for snake, camel in (("percent", "percent"), ("channel", "channel"),
                             ("sold_out", "soldOut"), ("expires_at", "expiresAt")):
            if snake in t:
                item[camel] = t[snake]
        out.append(item)
    return out


def is_live(record: dict, today: str) -> bool:
    """지금 브랜드 할인 카드에 띄울 수 있는 값인가.

    원장에는 남기되 내보내지 않는 것이 둘이다.

    - **만료**: 종료일이 지난 쿠폰. 카드에 뜨면 사용자가 앱에 갔다가
      없는 할인을 찾게 된다.
    - **미관측**: 금액을 못 읽은 관측. 카드의 본문이 금액이라 띄울 게
      없고, 비교 화면에서 다른 앱 금액과 나란히 놓이면 "0원"처럼
      읽힌다.

    둘 다 지우지 않는다 — 관측했다는 사실 자체가 근거이므로 원장에는
    그대로 남고, 여기서만 걸러진다. 만료는 다음 관측에서 되살아날 수
    있고(같은 브랜드가 새 쿠폰을 내면 새 레코드가 이긴다), 미관측은
    나중에 상세를 확인해 채우면 그때부터 나간다.

    이 걸름이 없어서 2026-08-09 기준 export 135건에 만료 7건과 금액
    없는 5건이 섞여 있었다.

    **구간이 있으면 구간이 판정 단위다** — 하나라도 살아 있으면 살아
    있다. 레코드 종료일만 보면 청년피자 땡겨요처럼 하루짜리 쿠폰이
    끝났을 때 같은 레코드의 상시 쿠폰까지 통째로 내려간다(2026-08-06
    실측). API `OfferRecord.isExpired`와 같은 규칙이어야 한다 — 두
    레이어가 다르면 어느 쪽을 거치느냐로 결과가 갈린다(ADR-016).
    """
    if record.get("amount") is None:
        return False

    tiers = record.get("tiers")
    if tiers:
        return any(not _is_past(_tier_expiry(t, record), today) for t in tiers)
    return not _is_past(record.get("expires_at"), today)


def _tier_expiry(tier: dict, record: dict) -> str | None:
    """구간 종료일. 비어 있으면 레코드 종료일을 따른다.

    구간별 종료일은 "이 구간만 따로 끝날 때" 채우는 값이라, 비어 있다는
    건 이 구간이 쿠폰 전체와 같은 날 끝난다는 뜻이다.
    """
    return tier.get("expires_at") or record.get("expires_at")


def _is_past(expires_at: str | None, today: str) -> bool:
    """종료일 당일까지는 쓸 수 있다 — "~2026.08.31 사용가능"은 그날을 포함한다."""
    return bool(expires_at) and expires_at < today


def build_export(records: list[dict], today: str | None = None) -> list[dict]:
    today = today or date.today().isoformat()
    latest = latest_per_brand(records)
    out = []
    for record in latest.values():
        if not is_live(record, today):
            continue
        item = {camel: record.get(snake) for snake, camel in FIELDS}
        item["tiers"] = camel_tiers(record.get("tiers"))
        out.append(item)
    return out


def sorted_brand_names(records: list[dict]) -> list[str]:
    return sorted({r["brand"] for r in records})


def main() -> int:
    records = read_records(LOG_PATH)
    exported = build_export(records)
    names = sorted_brand_names(records)

    EXPORT_PATH.write_text(
        json.dumps(exported, ensure_ascii=False, indent=1), encoding="utf-8",
    )
    BRANDS_PATH.write_text("\n".join(names) + "\n", encoding="utf-8")

    # 걸러낸 수를 같이 찍는다 — 조용히 줄어들면 사고인지 정상인지 모른다.
    held_back = len(latest_per_brand(records)) - len(exported)
    print(f"export.json {len(exported)}건(제외 {held_back}건: 만료·미관측), "
          f"brands-sorted.txt {len(names)}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
