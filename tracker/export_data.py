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
    # tiers를 택일로 읽을지 누적으로 읽을지(ADR-019). 원장에 없으면
    # store가 기본값 exclusive를 채우지만, 원장을 직접 손으로 고친 줄에는
    # 키 자체가 없을 수 있어 build_export에서 한 번 더 기본값을 준다.
    ("tier_mode", "tierMode"),
    ("tiers", "tiers"),
    ("conditions", "conditions"),
    ("expires_at", "expiresAt"),
    ("badge", "badge"),
    ("sold_out", "soldOut"),
]

LOG_PATH = Path(__file__).parent / "data" / "log.jsonl"
EXPORT_PATH = Path(__file__).parent / "data" / "export.json"
BRANDS_PATH = Path(__file__).parent / "data" / "brands-sorted.txt"

# 이번 수집에 안 보이면 끝난 것으로 보는 앱.
#
# 원래 배민만이었다 — 배민 화면엔 종료일이 없으니 "안 보이면 끝"이 유일한
# 판정이고, 종료일이 오는 앱은 한 번 수집한 쿠폰이 몇 주씩 유효하니
# 안 보였다는 이유로 내리면 멀쩡한 오퍼가 사라진다는 논리였다.
#
# 실제로는 그 반대가 문제였다(2026-08-10): 지난주 수집분이 계속 살아남아
# 이미 끝난 프로모션이 화면에 떴고, 종료일 없는 옛 레코드가 특히 그랬다.
# 프로모션은 4개 앱 모두 월요일 00시에 통째로 갈린다 — 이번 수집에
# 없으면 끝난 것으로 본다.
#
# 지우지는 않는다. 그때 그랬다는 관측은 원장에 남고 export에서만 빠진다.
SWEEP_SCOPED_PLATFORMS = {"baemin", "coupangeats", "yogiyo", "ddangyo"}


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
                             ("sold_out", "soldOut"), ("expires_at", "expiresAt"),
                             ("cap", "cap")):
            if snake in t:
                item[camel] = t[snake]
        out.append(item)
    return out


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


# 목록을 처음부터 끝까지 훑었다고 볼 최소 건수. 이보다 적으면 한두 건
# 손으로 넣은 것이지 전수 수집이 아니다.
#
# 2026-08-10에 손으로 넣은 땡겨요 5건이 "오늘 수집함"으로 잡혔고, 그
# 바람에 오늘 다시 안 본 종료일 없는 브랜드 6개(파리바게뜨·굽네치킨·
# 해두리치킨·머니머니·BBQ·훌랄라참숯바베큐치킨)가 끝난 것으로 밀렸다.
# 아직 하는 프로모션인데 링크째 화면에서 사라졌다.
MIN_SWEEP_RECORDS = 10


def latest_sweep_dates(records: list[dict]) -> dict[str, str]:
    """앱별 가장 최근 **전수 수집** 날짜(YYYY-MM-DD).

    "이번 수집에 안 보였다"로 오퍼를 내리려면 그 수집이 실제로 목록을 다
    훑은 것이어야 한다. 손으로 몇 건 넣은 날은 수집일로 치지 않는다 —
    안 그러면 그날 안 건드린 브랜드가 통째로 끝난 것으로 밀린다.
    """
    per_day: dict[tuple[str, str], int] = {}
    for record in records:
        key = (record["platform"], record["captured_at"][:10])
        per_day[key] = per_day.get(key, 0) + 1

    latest: dict[str, str] = {}
    for (platform, day), count in per_day.items():
        if count < MIN_SWEEP_RECORDS:
            continue
        if day > latest.get(platform, ""):
            latest[platform] = day
    return latest


def has_expiry(record: dict) -> bool:
    """이 오퍼가 스스로 종료일을 들고 있는가(구간별 종료일 포함)."""
    if record.get("expires_at"):
        return True
    return any(t.get("expires_at") for t in record.get("tiers") or [])


def is_stale_sweep(record: dict, sweeps: dict[str, str]) -> bool:
    """지난 수집 때만 보였고 종료일도 없는 오퍼인가.

    종료일이 없으면 만료를 날짜로 판정할 수 없고, **이번 수집에 안 보였다는
    사실**이 곧 끝났다는 뜻이다 — 프로모션이 월요일 00시에 통째로 갈린다
    (2026-08-10 확인: 배민 브랜드관·배짱할인 모두 브랜드가 거의 전부
    교체됐다).

    **종료일이 있으면 그 날짜를 믿는다.** 앱이 직접 알려준 값이라 이쪽이
    더 정확하다 — 이번 수집에 안 보였다는 이유로 내리면 아직 살아 있는
    쿠폰이 사라진다(2026-08-10에 실제로 그렇게 70건을 날렸다). 만료
    판정은 `is_live`가 종료일로 한다.

    지우지는 않는다. 그때 그랬다는 관측은 원장에 남고 여기서만 빠진다.
    """
    if record["platform"] not in SWEEP_SCOPED_PLATFORMS:
        return False
    if has_expiry(record):
        return False
    return record["captured_at"][:10] < sweeps.get(record["platform"], "")


def build_export(records: list[dict], today: str | None = None) -> list[dict]:
    today = today or date.today().isoformat()
    sweeps = latest_sweep_dates(records)
    latest = latest_per_brand(records)
    out = []
    for record in latest.values():
        if not is_live(record, today) or is_stale_sweep(record, sweeps):
            continue
        item = {camel: record.get(snake) for snake, camel in FIELDS}
        item["tierMode"] = record.get("tier_mode") or "exclusive"
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
    print(f"export.json {len(exported)}건(제외 {held_back}건: 만료·미관측·지난수집), "
          f"brands-sorted.txt {len(names)}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
