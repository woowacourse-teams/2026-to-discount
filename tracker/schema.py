ALLOWED_PLATFORMS = {"baemin", "coupangeats", "yogiyo", "ddangyo", "specialdelivery"}
ALLOWED_QUALIFIERS = {None, "최대", "최소"}
ALLOWED_SCOPES = {"brand", "store"}
ALLOWED_OFFER_TYPES = {"discount", "gift", "coupon", "unknown"}
ALLOWED_CAPTURE_MODES = {"auto", "manual"}
ALLOWED_CHANNELS = {"배달", "포장", "매장식사"}

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
    "tiers": None,
    "conditions": None,         # 그 외 문구 그대로 (예: "1일 1회, 배달만")
    "expires_at": None,         # 쿠폰 종료일(YYYY-MM-DD). 앱에 "~2026.08.31 사용가능"처럼 날짜만 나온다.
    # 금액 옆에 짧게 붙는 상태 표시(예: "선착순 품절", "선착순"). 목록의
    # 액면 금액이 실제로는 못 받는 상태이거나(재고 소진) 매일 무작위로
    # 바뀌는 경우(와우회원 랜덤박스) 상세를 안 열어봐도 바로 보이게 한다
    # (쿠팡이츠 메가MGC커피·왓더버거·던킨 실측, 2026-08-03). conditions처럼
    # 긴 설명은 아니고 칩에 얹을 한두 단어짜리 라벨만.
    "badge": None,
    # 목록 액면 금액(amount) 자체가 재고 소진으로 지금 못 받는 상태면
    # True. badge 문구에 "품절"을 박아 넣는 대신 여기 불리언으로 명확히
    # 표시한다 — 프론트가 문자열 매칭 없이 바로 취소선을 그릴 수 있게
    # (쿠팡이츠 메가MGC커피 실측, 2026-08-03: "최대 20,000원" 티어가
    # 품절이고 6,000원/3,000원 티어는 살아있었다).
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
        if "channel" in tier and tier["channel"] not in ALLOWED_CHANNELS:
            raise ValueError(f"invalid tier channel: {tier!r}")


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
    validate_tiers(normalized["tiers"])

    return normalized
