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
}


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

    return normalized
