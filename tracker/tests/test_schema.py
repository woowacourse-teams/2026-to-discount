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
