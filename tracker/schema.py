import re

ALLOWED_PLATFORMS = {"baemin", "coupangeats", "yogiyo", "ddangyo", "specialdelivery"}
EXPIRES_AT_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
ALLOWED_QUALIFIERS = {None, "최대", "최소", "특정메뉴"}
ALLOWED_SCOPES = {"brand", "store"}
ALLOWED_OFFER_TYPES = {"discount", "gift", "coupon", "unknown"}
# backfill: 원장이 아니라 export.json에 먼저 들어갔던 관측을 뒤늦게 원장으로
# 옮긴 것(2026-08-05). 화면을 다시 본 게 아니라 파생 결과에서 되돌린 값이라
# target_address 같은 캡처 맥락 일부를 추정으로 채웠다 — auto/manual과 같은
# 신뢰도로 취급하면 안 되므로 출처를 구분해서 남긴다.
ALLOWED_CAPTURE_MODES = {"auto", "manual", "backfill"}
ALLOWED_CHANNELS = {"배달", "포장", "매장식사"}
# 한 레코드의 tiers를 어떻게 읽을지. "exclusive"는 문턱마다 택일(지금까지의
# 해석), "cumulative"는 문턱을 넘을수록 쿠폰이 겹친다(요기요 2단 실측,
# 굽네치킨 2026-07-31). tier마다 플래그를 달지 않고 레코드 레벨로 둔 이유는
# 읽는 쪽이 tier를 하나씩 살피지 않고 한 번에 갈래를 정하게 하려는 것이다.
ALLOWED_TIER_MODES = {"exclusive", "cumulative"}

REQUIRED_FIELDS = (
    "platform", "brand", "raw_text", "captured_at",
    "target_address", "capture_mode", "screenshot_path",
)

DEFAULTS = {
    "page": None,
    "section": None,
    "qualifier": None,
    "amount": None,
    "unit": "KRW",
    "scope": "brand",
    "offer_type": "discount",
    "needs_review": False,
    # 적용 조건. 목록 화면에는 안 나오고 쿠폰 상세를 열어야 보이는 값이라
    # 아직 대부분 비어 있다. "최대 n원"의 정체가 여기 있다 — tiers가 채워지면
    # 그 최대치가 곧 목록에 뜨는 "최대 n원"이다.
    "min_order_amount": None,   # 최소주문금액(단일 조건)
    # [{"min_order": 15000, "amount": 3000}, ...] — amount는 항상 원(KRW).
    # 정률(%) 할인이면(요기요 실측, 2026-07-31: "25,000원 이상 주문 시
    # 5%, 최대 3,000원 할인") "percent"를 추가하고 amount는 그 상한액
    # (cap)을 그대로 쓴다 — 정액이든 정률+상한이든 "이 구간에서 실제로
    # 최대 얼마 깎이는가"는 amount 하나로 항상 비교·정렬 가능하다.
    # percent 없는 항목은 기존과 같은 순수 정액.
    # 같은 min_order에 amount만 다른 두 항목이 있으면 구간 할인이 아니라
    # 배달/포장/매장식사별로 금액이 다른 채널별 별개 쿠폰이다(땡겨요
    # 바른치킨·도미노피자 실측, 2026-08-01) — 이 경우 "channel"을 채운다.
    #
    # "expires_at"은 그 구간만 따로 끝날 때 채운다. 한 브랜드에 걸린
    # 쿠폰들이 같은 날 끝난다는 보장이 없다 — 청년피자 땡겨요는 상시
    # 5,000원과 하루짜리 청피데이 9,000원이 한 레코드에 같이 있었고,
    # 레코드 종료일만 보고 살아있는 5,000원까지 통째로 내려버렸다
    # (2026-08-06). 비어 있으면 레코드의 expires_at을 따른다.
    "tier_mode": "exclusive",
    "tiers": None,
    "conditions": None,         # 그 외 문구 그대로 (예: "1일 1회, 배달만")
    "expires_at": None,         # 쿠폰 종료일(YYYY-MM-DD). 앱에 "~2026.08.31 사용가능"처럼 날짜만 나온다.
    # 금액 옆에 짧게 붙는 상태 표시(예: "선착순 품절", "선착순"). 목록의
    # 액면 금액이 실제로는 못 받는 상태이거나(재고 소진) 매일 무작위로
    # 바뀌는 경우(와우회원 랜덤박스) 상세를 안 열어봐도 바로 보이게 한다
    # (쿠팡이츠 메가MGC커피·왓더버거·던킨 실측, 2026-08-03). conditions처럼
    # 긴 설명은 아니고 칩에 얹을 한두 단어짜리 라벨만.
    "badge": None,
    # 목록 액면 금액(amount)이 통째로(구간 없이) 재고 소진이면 True.
    # tiers가 있는 경우엔 이 최상위 필드 대신 각 tier의 "sold_out"을
    # 쓴다 — amount/min_order_amount는 항상 지금 실제로 받을 수 있는
    # 값이어야 한다(브랜드 카드엔 품절된 액면가를 대표값으로 보여주지
    # 않는다). badge 문구에 "품절"을 박아 넣는 대신 불리언으로 명확히
    # 표시해 프론트가 문자열 매칭 없이 바로 취소선을 그릴 수 있게 한다.
    "sold_out": False,
}


def validate_tiers(tiers) -> None:
    """구간 할인은 손으로 채우는 값이라, 모양이 틀리면 여기서 잡는다."""
    if tiers is None:
        return
    if not isinstance(tiers, list) or not tiers:
        raise ValueError(f"tiers must be a non-empty list: {tiers!r}")
    for tier in tiers:
        if not isinstance(tier, dict) or "min_order" not in tier or "amount" not in tier:
            raise ValueError(f"tier needs min_order and amount: {tier!r}")
        if "percent" in tier and not (isinstance(tier["percent"], (int, float)) and 0 < tier["percent"] <= 100):
            raise ValueError(f"tier percent must be in (0, 100]: {tier!r}")
        # 정률 tier의 amount는 "이 문턱에서 실제 받는 금액"이고, 상한은 cap이
        # 따로 든다. 예전엔 amount가 상한을 겸했는데 같은 필드가 정액 tier에선
        # 받는 금액, 정률 tier에선 상한을 뜻해 실제로 오독을 낳았다(ADR-019).
        if ("percent" in tier) != ("cap" in tier):
            raise ValueError(f"tier percent and cap must come together: {tier!r}")
        if "cap" in tier and tier["amount"] is not None and tier["amount"] > tier["cap"]:
            raise ValueError(f"tier amount must not exceed cap: {tier!r}")
        if "channel" in tier and tier["channel"] not in ALLOWED_CHANNELS:
            raise ValueError(f"invalid tier channel: {tier!r}")
        if "sold_out" in tier and not isinstance(tier["sold_out"], bool):
            raise ValueError(f"tier sold_out must be bool: {tier!r}")
        # 구간별 만료일. 한 브랜드의 쿠폰들이 같은 날 끝난다는 보장이 없다 —
        # 청년피자 땡겨요는 상시 5,000원과 하루짜리 청피데이 9,000원이 한
        # 레코드에 같이 있었고, 레코드 만료일 하나만 보고 지웠다가 살아있는
        # 5,000원까지 날렸다(2026-08-06). 비면 레코드의 expires_at을 따른다.
        if "expires_at" in tier and not EXPIRES_AT_RE.fullmatch(str(tier["expires_at"])):
            raise ValueError(f"tier expires_at must be YYYY-MM-DD: {tier!r}")


def validate_record(record: dict) -> dict:
    missing = [f for f in REQUIRED_FIELDS if f not in record]
    if missing:
        raise ValueError(f"record missing required fields: {missing}")

    if record["platform"] not in ALLOWED_PLATFORMS:
        raise ValueError(f"unknown platform: {record['platform']!r}")

    if record["capture_mode"] not in ALLOWED_CAPTURE_MODES:
        raise ValueError(f"invalid capture_mode: {record['capture_mode']!r}")

    normalized = dict(DEFAULTS)
    normalized.update(record)

    if normalized["qualifier"] not in ALLOWED_QUALIFIERS:
        raise ValueError(f"invalid qualifier: {normalized['qualifier']!r}")
    if normalized["scope"] not in ALLOWED_SCOPES:
        raise ValueError(f"invalid scope: {normalized['scope']!r}")
    if normalized["offer_type"] not in ALLOWED_OFFER_TYPES:
        raise ValueError(f"invalid offer_type: {normalized['offer_type']!r}")
    if normalized["tier_mode"] not in ALLOWED_TIER_MODES:
        raise ValueError(f"invalid tier_mode: {normalized['tier_mode']!r}")
    if normalized["tier_mode"] == "cumulative":
        if not normalized["tiers"] or len(normalized["tiers"]) < 2:
            raise ValueError(f"cumulative needs at least two tiers: {normalized['tiers']!r}")
        if normalized["qualifier"] != "최소":
            raise ValueError(
                f"cumulative record must use qualifier '최소': {normalized['qualifier']!r}")
    validate_tiers(normalized["tiers"])

    return normalized
