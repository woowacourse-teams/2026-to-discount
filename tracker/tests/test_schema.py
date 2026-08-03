import pytest
from schema import validate_record

BASE = {
    "platform": "coupangeats",
    "brand": "반올림피자",
    "raw_text": "최소 4,000원",
    "captured_at": "2026-07-26T11:20:00+09:00",
    "target_address": "서울특별시 강남구 역삼동 858 강남역",
    "capture_mode": "manual",
    "screenshot_path": "captures/coupangeats/20260726-1120/full.png",
}


def test_validate_record_fills_defaults():
    record = validate_record(dict(BASE))
    assert record["qualifier"] is None
    assert record["amount"] is None
    assert record["unit"] == "KRW"
    assert record["scope"] == "brand"
    assert record["offer_type"] == "discount"
    assert record["needs_review"] is False


def test_validate_record_missing_required_field():
    incomplete = dict(BASE)
    del incomplete["brand"]
    with pytest.raises(ValueError):
        validate_record(incomplete)


def test_validate_record_rejects_unknown_platform():
    bad = dict(BASE, platform="unknown-app")
    with pytest.raises(ValueError):
        validate_record(bad)


def test_validate_record_rejects_invalid_qualifier():
    bad = dict(BASE, qualifier="대략")
    with pytest.raises(ValueError):
        validate_record(bad)


def test_validate_record_preserves_qualifier_distinction():
    # 반올림피자 = 최소, 노랑통닭 = 최대. 서로 다른 값으로 남아야 한다.
    min_record = validate_record(dict(BASE, qualifier="최소", amount=4000))
    max_record = validate_record(dict(
        BASE, brand="노랑통닭", qualifier="최대", amount=7000,
        raw_text="최대 7천원 할인",
    ))
    assert min_record["qualifier"] == "최소"
    assert max_record["qualifier"] == "최대"
    assert min_record["amount"] != max_record["amount"]


def test_validate_record_detail_fields_default_to_none():
    record = validate_record(dict(BASE))
    assert record["min_order_amount"] is None
    assert record["tiers"] is None
    assert record["conditions"] is None


def test_validate_record_keeps_tiers():
    record = validate_record(dict(BASE, tiers=[
        {"min_order": 15000, "amount": 3000},
        {"min_order": 25000, "amount": 6000},
    ]))
    assert record["tiers"][1]["amount"] == 6000


def test_validate_record_rejects_malformed_tier():
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[{"min_order": 15000}]))


def test_validate_record_rejects_non_list_tiers():
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers={"min_order": 15000, "amount": 3000}))


def test_validate_record_keeps_percent_tier():
    # 요기요 실측(굽네치킨, 2026-07-31): 25,000원 이상 주문 시 5%,
    # 최대 3,000원 할인 — 정률+상한. amount는 상한액, percent는 별도.
    record = validate_record(dict(BASE, tiers=[
        {"min_order": 25000, "amount": 3000, "percent": 5},
    ]))
    assert record["tiers"][0] == {"min_order": 25000, "amount": 3000, "percent": 5}


def test_validate_record_rejects_percent_out_of_range():
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[{"min_order": 25000, "amount": 3000, "percent": 0}]))
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[{"min_order": 25000, "amount": 3000, "percent": 101}]))


def test_validate_record_keeps_channel_tier():
    # 땡겨요 바른치킨 실측(2026-08-01): 같은 min_order 19900에 배달
    # 4,000원/포장 5,000원으로 채널마다 금액이 다른 별개 쿠폰.
    record = validate_record(dict(BASE, tiers=[
        {"min_order": 19900, "amount": 4000, "channel": "배달"},
        {"min_order": 19900, "amount": 5000, "channel": "포장"},
    ]))
    assert record["tiers"][0]["channel"] == "배달"
    assert record["tiers"][1]["channel"] == "포장"


def test_validate_record_rejects_invalid_tier_channel():
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[{"min_order": 19900, "amount": 4000, "channel": "드라이브스루"}]))
