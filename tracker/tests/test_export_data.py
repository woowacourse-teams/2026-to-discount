from export_data import build_export, camel_tiers, sorted_brand_names

RECORDS = [
    {
        "platform": "baemin", "brand": "도미노피자", "amount": 5000,
        "qualifier": None, "needs_review": False, "offer_type": "discount",
        "section": "오늘의 할인", "raw_text": "5,000원 브랜드 할인",
        "captured_at": "2026-07-27T14:20:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "manual",
        "screenshot_path": "ref/delivery/baemin_2026-07-27.jpg",
    },
    {
        "platform": "yogiyo", "brand": "굽네치킨", "amount": 7000,
        "qualifier": "최대", "needs_review": True, "offer_type": "discount",
        "section": None, "raw_text": "최대 7,000원 할인",
        "captured_at": "2026-07-27T14:25:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "manual",
        "screenshot_path": "ref/delivery/yogiyo_2026-07-27 (1).jpg",
    },
]


def test_build_export_converts_to_camel_case():
    out = build_export(RECORDS)
    item = next(x for x in out if x["brand"] == "도미노피자")
    assert item["needsReview"] is False
    assert item["offerType"] == "discount"
    assert item["capturedAt"] == "2026-07-27T14:20:00+09:00"
    assert item["screenshotPath"] == "ref/delivery/baemin_2026-07-27.jpg"
    # snake_case 키는 남지 않는다
    assert "needs_review" not in item
    assert "capture_mode" not in item   # export에 불필요한 필드는 뺀다


def test_build_export_keeps_amount_and_qualifier():
    out = build_export(RECORDS)
    goobne = next(x for x in out if x["brand"] == "굽네치킨")
    assert goobne["amount"] == 7000
    assert goobne["qualifier"] == "최대"
    assert goobne["needsReview"] is True


def test_sorted_brand_names_unique_and_ascending():
    dup = RECORDS + [dict(RECORDS[0])]   # 도미노피자 중복
    names = sorted_brand_names(dup)
    assert names == ["굽네치킨", "도미노피자"]   # 중복 제거 + 오름차순


def test_build_export_carries_detail_fields_as_camel_case():
    records = [dict(RECORDS[1], min_order_amount=15000, conditions="1일 1회",
                    tiers=[{"min_order": 15000, "amount": 3000},
                           {"min_order": 25000, "amount": 7000}])]
    item = build_export(records)[0]
    assert item["minOrderAmount"] == 15000
    assert item["conditions"] == "1일 1회"
    assert item["tiers"] == [{"minOrder": 15000, "amount": 3000},
                             {"minOrder": 25000, "amount": 7000}]


def test_build_export_carries_percent_tier():
    # 요기요 실측(굽네치킨, 2026-07-31): 정률+상한 tier도 percent가
    # export.json까지 살아남아야 한다 — 정액 tier는 그대로 없어야 한다.
    records = [dict(RECORDS[1], tiers=[
        {"min_order": 25000, "amount": 3000, "percent": 5},
        {"min_order": 17000, "amount": 4000},
    ])]
    item = build_export(records)[0]
    assert item["tiers"] == [
        {"minOrder": 25000, "amount": 3000, "percent": 5},
        {"minOrder": 17000, "amount": 4000},
    ]


def test_build_export_detail_fields_are_null_when_unknown():
    # 지금 원장은 거의 전부 이 상태 — 키는 있고 값만 비어 있어야 한다.
    item = build_export(RECORDS)[0]
    assert item["minOrderAmount"] is None
    assert item["tiers"] is None
    assert item["conditions"] is None
    assert item["expiresAt"] is None


def test_build_export_carries_expires_at():
    records = [dict(RECORDS[1], expires_at="2026-08-31")]
    item = build_export(records)[0]
    assert item["expiresAt"] == "2026-08-31"


def test_build_export_carries_channel_tier():
    # 땡겨요 실측(바른치킨, 2026-08-01): 배달/포장별 별개 쿠폰도
    # channel이 export.json까지 살아남아야 한다.
    records = [dict(RECORDS[1], tiers=[
        {"min_order": 19900, "amount": 4000, "channel": "배달"},
        {"min_order": 19900, "amount": 5000, "channel": "포장"},
    ])]
    item = build_export(records)[0]
    assert item["tiers"] == [
        {"minOrder": 19900, "amount": 4000, "channel": "배달"},
        {"minOrder": 19900, "amount": 5000, "channel": "포장"},
    ]


def test_build_export_carries_badge():
    records = [dict(RECORDS[1], badge="선착순 품절")]
    item = build_export(records)[0]
    assert item["badge"] == "선착순 품절"


def test_build_export_carries_sold_out():
    records = [dict(RECORDS[1], sold_out=True)]
    item = build_export(records)[0]
    assert item["soldOut"] is True


def test_build_export_carries_tier_sold_out():
    records = [dict(RECORDS[1], amount=6000, tiers=[
        {"min_order": 16000, "amount": 20000, "sold_out": True},
        {"min_order": 16000, "amount": 6000},
    ])]
    item = build_export(records)[0]
    assert item["tiers"] == [
        {"minOrder": 16000, "amount": 20000, "soldOut": True},
        {"minOrder": 16000, "amount": 6000},
    ]


# --- 브랜드 할인 카드에 못 띄우는 것은 내보내지 않는다 (docs/GLOSSARY.md) ---

def test_expired_offer_is_not_exported():
    """종료일이 지난 쿠폰이 카드에 뜨면 사용자가 없는 할인을 찾아 앱에 간다.

    실측(2026-08-09): 이 걸름이 없어 export 135건에 만료 7건이 섞여 있었다.
    """
    records = [dict(RECORDS[0], expires_at="2026-08-08")]

    assert build_export(records, today="2026-08-09") == []


def test_offer_expiring_today_is_still_exported():
    # "~2026.08.31 사용가능"은 그날까지 쓸 수 있다는 뜻이다.
    records = [dict(RECORDS[0], expires_at="2026-08-09")]

    assert len(build_export(records, today="2026-08-09")) == 1


def test_offer_without_amount_is_not_exported():
    """금액이 카드의 본문이다 — 못 읽은 관측은 띄울 게 없다.

    비교 화면에서 다른 앱 금액과 나란히 놓이면 "0원"처럼 읽힌다.
    """
    records = [dict(RECORDS[0], amount=None, needs_review=True)]

    assert build_export(records, today="2026-08-09") == []


def test_filtered_records_stay_in_the_ledger_view():
    """거르는 것은 export뿐이다 — 관측했다는 사실은 원장에 남는다."""
    records = [dict(RECORDS[0], expires_at="2026-08-08")]

    assert sorted_brand_names(records) == ["도미노피자"]


# --- 구간별 종료일 (API OfferRecord.isExpired와 같은 규칙, ADR-016) ---

def test_record_survives_while_any_tier_is_still_live():
    """청년피자 땡겨요 재현(2026-08-06): 상시 5,000원과 하루짜리 청피데이
    9,000원이 한 레코드에 있었는데, 레코드 종료일만 보고 살아있는
    5,000원까지 통째로 내려버렸다."""
    records = [dict(RECORDS[0], amount=9000, expires_at="2026-08-06", tiers=[
        {"min_order": 18900, "amount": 9000, "expires_at": "2026-08-06"},
        {"min_order": 18900, "amount": 5000, "expires_at": "2026-08-31"},
    ])]

    out = build_export(records, today="2026-08-09")

    assert len(out) == 1


def test_record_drops_when_every_tier_expired():
    records = [dict(RECORDS[0], tiers=[
        {"min_order": 18900, "amount": 9000, "expires_at": "2026-08-06"},
        {"min_order": 18900, "amount": 5000, "expires_at": "2026-08-08"},
    ])]

    assert build_export(records, today="2026-08-09") == []


def test_tier_without_its_own_expiry_follows_the_record():
    # 구간 종료일은 "이 구간만 따로 끝날 때" 채우는 값이다.
    records = [dict(RECORDS[0], expires_at="2026-08-08", tiers=[
        {"min_order": 18900, "amount": 5000},
    ])]

    assert build_export(records, today="2026-08-09") == []


def test_tier_expiry_reaches_export():
    records = [dict(RECORDS[0], tiers=[
        {"min_order": 18900, "amount": 5000, "expires_at": "2026-08-31"},
    ])]

    item = build_export(records, today="2026-08-09")[0]

    assert item["tiers"] == [{"minOrder": 18900, "amount": 5000, "expiresAt": "2026-08-31"}]
def test_camel_tiers_carries_per_tier_expires_at():
    tiers = camel_tiers([
        {"min_order": 18900, "amount": 4000, "expires_at": "2026-08-30"},
        {"min_order": None, "amount": 7500, "expires_at": "2026-08-31"},
    ])
    assert [t["expiresAt"] for t in tiers] == ["2026-08-30", "2026-08-31"]


def test_camel_tiers_omits_expires_at_when_absent():
    assert "expiresAt" not in camel_tiers([{"min_order": 15000, "amount": 3000}])[0]
