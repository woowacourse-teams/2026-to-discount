from export_data import build_export, sorted_brand_names

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
