ALLOWED_PLATFORMS = {"baemin", "coupangeats", "yogiyo", "ddangyo", "specialdelivery"}
ALLOWED_QUALIFIERS = {None, "최대", "최소"}
ALLOWED_SCOPES = {"brand", "store"}
ALLOWED_OFFER_TYPES = {"discount", "gift", "coupon", "unknown"}
ALLOWED_CAPTURE_MODES = {"auto", "manual"}

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
    "tiers": None,              # [{"min_order": 15000, "amount": 3000}, ...]
    "conditions": None,         # 그 외 문구 그대로 (예: "1일 1회, 배달만")
    "expires_at": None,         # 행사(쿠폰) 종료 예정일, ISO date (예: "2026-07-31")
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
