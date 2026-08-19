"""원장을 브랜드 할인 카드가 쓸 수 있는 형태로 내보낸다.

용어는 `docs/GLOSSARY.md` — 여기서 "브랜드 할인 카드"는 **우리 서비스
화면의 카드**이고, 배달앱 화면 안의 카드가 아니다.

원장은 관측 기록이라 지나간 것도 남긴다(append-only). 하지만 화면에
띄울 수 있는 것은 **지금 실제로 받을 수 있는 것뿐**이다. 그 경계를
`is_live()`가 긋는다 — 저장은 하되 내보내지는 않는다.
"""
import json
from datetime import date, timedelta
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
#
# 요기요는 뺀다. 다른 셋은 주소와 무관하게 브랜드 전체를 보여주지만,
# 요기요 목록은 그 주소 주변 가게만 담는다 — 역삼동에서 훑었더니 고양시에서
# 잡았던 브랜드 18개가 "이번에 안 보였다"로 밀려 화면에서 사라졌다
# (2026-08-16). 한 주소에서 안 보인 것은 끝났다는 증거가 아니다. 요기요는
# 여러 주소의 수집을 합쳐서 보고, 만료는 종료일(is_live)로만 판정한다.
SWEEP_SCOPED_PLATFORMS = {"baemin", "coupangeats", "ddangyo"}


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


def ladder_best(tiers: list[dict]) -> int | None:
    """겹쳐 쓰는 쿠폰의 사다리에서 가장 높은 칸의 금액.

    문턱을 낮은 순으로 훑으며 그 문턱에서 자격이 되는 tier를 전부 더한다.
    가장 높은 문턱의 합이 곧 "쿠폰을 다 겹쳤을 때 받는 금액"이고, 카드에
    뜨는 대표 금액이다.

    처음에는 최저 문턱(보장 바닥값)을 대표로 썼다(ADR-019). 그러면 굽네치킨
    카드가 4,000원으로 떠서, 정률 쿠폰을 겹칠 수 있다는 사실 자체가 화면에서
    사라진다 — 겹침 쿠폰을 따로 모델링한 의미가 없어진다. 대신 사다리
    꼭대기를 쓰고 `qualifier: "최적"` 배지로 "조건을 다 맞췄을 때"임을
    표시한다. 상세를 펼치면 문턱별 사다리가 그대로 보이므로 4,000원만 받는
    구간도 감춰지지 않는다.

    각 tier의 amount는 이미 "그 문턱에서 실제 받는 금액"이라 여기서 정률을
    다시 계산하지 않는다.

    API `DiscountLadder.bestAmount()`와 같은 값을 내야 한다. 두 레이어가
    다른 규칙을 쓰면 어느 쪽을 거치느냐로 화면 금액이 갈린다(ADR-016).
    """
    if not tiers:
        return None
    thresholds = sorted({t.get("min_order") or 0 for t in tiers})
    top = thresholds[-1]
    return sum(t["amount"] for t in tiers
               if (t.get("min_order") or 0) <= top and t.get("amount") is not None)


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


SWEEPS_PATH = Path(__file__).parent / "data" / "sweeps.jsonl"


def latest_sweep_dates(records: list[dict], sweeps_path: Path | None = None) -> dict[str, str]:
    """앱별 가장 최근 **전수 수집** 날짜(YYYY-MM-DD).

    "이번 수집에 안 보였다"로 오퍼를 내리려면 그 수집이 실제로 목록을 다
    훑은 것이어야 한다. 전에는 그날 레코드가 10건을 넘으면 전수 수집으로
    **추정**했는데, 추정이라 양쪽으로 다 틀렸다.

    - 손으로 5건 넣은 날이 수집일로 잡혀 종료일 없는 브랜드 6개가 끝난
      것으로 밀렸다(2026-08-10).
    - 그래서 임계값 10을 세웠더니, 정정 5건을 두 번 넣어 정확히 10건이
      된 날이 다시 수집일로 잡혀 배민 브랜드 69개가 한꺼번에 사라졌다
      (2026-08-16, export 160 -> 91건).

    이제 추정하지 않는다. 수집을 마쳤다는 사실을 `data/sweeps.jsonl`에
    직접 적고 그것만 읽는다. 파일이 없으면 수집일도 없다 — 아무것도
    내리지 않는 쪽이 안전하다(잘못 내리면 살아 있는 프로모션이 사라지고,
    안 내리면 끝난 프로모션이 남을 뿐이다).
    """
    path = sweeps_path or SWEEPS_PATH
    latest: dict[str, str] = {}
    if not path.exists():
        return latest
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        platform, day = entry["platform"], entry["date"]
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


# 종료일을 화면에 안 적어주는 앱의 추정 만료일. 쿠팡이츠가 그렇다 — 168건
# 전부 종료일이 없어 "이번 수집에 안 보였다"만이 유일한 종료 신호였다.
#
# 프로모션은 네 앱 모두 월요일 00시에 통째로 갈린다(2026-08-10 실측).
# 그러니 수집일 다음 월요일이 그 관측이 확실히 유효한 마지막 순간이다.
# 관측이 아니라 추정이므로 원장에는 안 적고 export에서만 붙인다 — 원장은
# 화면에서 본 것만 담는다(ADR-004).
ESTIMATED_EXPIRY_PLATFORMS = {"coupangeats"}


def next_monday(day: str) -> str:
    """`day`(YYYY-MM-DD) 다음 월요일. 그날이 월요일이면 일주일 뒤."""
    d = date.fromisoformat(day)
    return (d + timedelta(days=7 - d.weekday() or 7)).isoformat()


def estimated_expiry(record: dict) -> str | None:
    """앱이 안 알려준 종료일을 수집일 다음 월요일로 추정한다.

    추정이 실제보다 이르면 살아 있는 할인이 하루 이틀 일찍 내려가고, 늦으면
    끝난 할인이 남는다. 월요일 교체가 관측된 규칙이므로 이 경계가 둘 다
    가장 작게 만든다.
    """
    if record["platform"] not in ESTIMATED_EXPIRY_PLATFORMS:
        return None
    if has_expiry(record):
        return None
    return next_monday(record["captured_at"][:10])


def build_export(records: list[dict], today: str | None = None,
                 sweeps: dict[str, str] | None = None) -> list[dict]:
    """수집일(`sweeps`)은 호출부가 넣어준다 — 여기서 파일을 읽지 않는다.

    전에는 레코드 건수로 수집일을 추정했는데, 그 추정이 틀려 두 번
    사고가 났다(latest_sweep_dates 참고). 지금은 사실을 적어둔 파일이
    출처이고, 그 파일을 읽는 건 main()의 몫이다 — 이 함수는 준 것만
    보고 판단한다. 안 주면 수집일이 없는 것으로 본다: 아무것도 안
    내리는 쪽이 잘못 내리는 쪽보다 싸다.
    """
    today = today or date.today().isoformat()
    sweeps = sweeps or {}
    latest = latest_per_brand(records)
    out = []
    for record in latest.values():
        if not is_live(record, today) or is_stale_sweep(record, sweeps):
            continue
        item = {camel: record.get(snake) for snake, camel in FIELDS}
        item["tierMode"] = record.get("tier_mode") or "exclusive"
        item["tiers"] = camel_tiers(record.get("tiers"))
        # 추정 만료일은 원장에 없고 여기서 붙는다. 붙인 사실을 같이 실어
        # 화면이 "예상"임을 말할 수 있게 한다.
        estimated = estimated_expiry(record)
        if estimated:
            item["expiresAt"] = estimated
            item["expiresAtEstimated"] = True
        if not is_live({**record, "expires_at": item["expiresAt"]}, today):
            continue
        out.append(item)
    return out


def sorted_brand_names(records: list[dict]) -> list[str]:
    return sorted({r["brand"] for r in records})


def main() -> int:
    records = read_records(LOG_PATH)
    exported = build_export(records, sweeps=latest_sweep_dates(records))
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
