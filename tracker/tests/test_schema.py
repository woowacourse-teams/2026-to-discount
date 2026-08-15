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
    assert record["expires_at"] is None
    assert record["badge"] is None


def test_validate_record_keeps_expires_at():
    record = validate_record(dict(BASE, expires_at="2026-08-31"))
    assert record["expires_at"] == "2026-08-31"


def test_validate_record_keeps_badge():
    # 쿠팡이츠 메가MGC커피 실측(2026-08-03): 목록 액면 금액이 실제로는
    # 재고 소진 상태라 상세를 안 열어도 바로 보이게 짧은 라벨을 붙인다.
    record = validate_record(dict(BASE, badge="선착순 품절"))
    assert record["badge"] == "선착순 품절"


def test_validate_record_sold_out_defaults_false():
    record = validate_record(dict(BASE))
    assert record["sold_out"] is False


def test_validate_record_keeps_sold_out():
    record = validate_record(dict(BASE, sold_out=True))
    assert record["sold_out"] is True


def test_validate_record_keeps_tier_sold_out():
    # 쿠팡이츠 메가MGC커피 실측(2026-08-03): 20,000원 티어만 품절, 나머지
    # 6,000원/3,000원 티어는 살아있었다 — 브랜드 카드는 살아있는 값을
    # 대표로 보여줘야 하니 최상위 amount는 6,000원, 품절은 tier 안에.
    record = validate_record(dict(BASE, amount=6000, tiers=[
        {"min_order": 16000, "amount": 20000, "sold_out": True},
        {"min_order": 16000, "amount": 6000},
    ]))
    assert record["tiers"][0]["sold_out"] is True
    assert "sold_out" not in record["tiers"][1]


def test_validate_record_rejects_non_bool_tier_sold_out():
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[{"min_order": 16000, "amount": 20000, "sold_out": "yes"}]))


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
    # 최대 3,000원 할인. amount는 그 문턱에서 실제 받는 금액(25,000 x 5%),
    # 상한 3,000원은 cap이다(ADR-019).
    record = validate_record(dict(BASE, tiers=[
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]))
    assert record["tiers"][0] == {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000}


def test_validate_record_rejects_percent_out_of_range():
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[
            {"min_order": 25000, "amount": 1250, "percent": 0, "cap": 3000}]))
    with pytest.raises(ValueError):
        validate_record(dict(BASE, tiers=[
            {"min_order": 25000, "amount": 1250, "percent": 101, "cap": 3000}]))


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


def test_validate_tiers_accepts_per_tier_expires_at():
    record = validate_record(dict(BASE, tiers=[
        {"min_order": 18900, "amount": 4000, "expires_at": "2026-08-30"},
        {"min_order": None, "amount": 7500, "expires_at": "2026-08-31"},
    ]))
    assert record["tiers"][0]["expires_at"] == "2026-08-30"


def test_validate_tiers_rejects_malformed_tier_expires_at():
    with pytest.raises(ValueError, match="expires_at"):
        validate_record(dict(BASE, tiers=[
            {"min_order": 18900, "amount": 4000, "expires_at": "2026.08.30"},
        ]))


def test_validate_tiers_requires_cap_with_percent():
    # 정률 tier의 amount는 "이 문턱에서 실제 받는 금액"이고 상한은 cap이다.
    # percent만 있고 cap이 없으면 amount가 무슨 뜻인지 알 수 없다(ADR-019).
    with pytest.raises(ValueError, match="cap"):
        validate_record(dict(BASE, tiers=[
            {"min_order": 25000, "amount": 1250, "percent": 5},
        ]))


def test_validate_tiers_rejects_cap_without_percent():
    # 정액 tier에 상한은 뜻이 없다.
    with pytest.raises(ValueError, match="cap"):
        validate_record(dict(BASE, tiers=[
            {"min_order": 17000, "amount": 4000, "cap": 5000},
        ]))


def test_validate_tiers_rejects_amount_over_cap():
    with pytest.raises(ValueError, match="cap"):
        validate_record(dict(BASE, tiers=[
            {"min_order": 25000, "amount": 4000, "percent": 5, "cap": 3000},
        ]))


def test_validate_tiers_keeps_percent_with_cap():
    # 요기요 굽네치킨 실측(2026-07-31): 25,000원 이상 5%, 최대 3,000원.
    # 25,000 x 5% = 1,250이 그 문턱에서 실제 받는 금액이고 3,000은 상한.
    record = validate_record(dict(BASE, tiers=[
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]))
    assert record["tiers"][0]["cap"] == 3000
    assert record["tiers"][0]["amount"] == 1250


def test_validate_record_tier_mode_defaults_to_exclusive():
    record = validate_record(dict(BASE))
    assert record["tier_mode"] == "exclusive"


def test_validate_record_rejects_unknown_tier_mode():
    with pytest.raises(ValueError, match="tier_mode"):
        validate_record(dict(BASE, tier_mode="stacked"))


def test_validate_record_keeps_cumulative_tier_mode():
    # 요기요 굽네치킨 실측(2026-07-31): 고정 메뉴할인과 정률 쿠폰을
    # 겹쳐 쓸 수 있다.
    record = validate_record(dict(BASE, tier_mode="cumulative", qualifier="최소", tiers=[
        {"min_order": 17000, "amount": 4000},
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]))
    assert record["tier_mode"] == "cumulative"


def test_validate_record_rejects_cumulative_with_single_tier():
    # 겹칠 상대가 없으면 cumulative가 뜻을 갖지 않는다.
    with pytest.raises(ValueError, match="cumulative"):
        validate_record(dict(BASE, tier_mode="cumulative", qualifier="최소", tiers=[
            {"min_order": 17000, "amount": 4000},
        ]))


def test_validate_record_rejects_cumulative_without_minimum_qualifier():
    # cumulative의 대표값은 사다리 최저 문턱이라 "최소" 표기여야 한다.
    # 도메인이 qualifier를 덮어쓰는 대신 여기서 강제한다(ADR-019).
    with pytest.raises(ValueError, match="qualifier"):
        validate_record(dict(BASE, tier_mode="cumulative", qualifier="최대", tiers=[
            {"min_order": 17000, "amount": 4000},
            {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
        ]))


def test_validate_record_keeps_evidence_status():
    # ADR-021: 검증 불가 표시는 선택 필드로 남는다. 부재가 기본이다.
    marked = validate_record(dict(BASE, evidence_status="not_in_capture"))
    assert marked["evidence_status"] == "not_in_capture"
    assert "evidence_status" not in validate_record(dict(BASE))


def test_validate_record_rejects_invalid_evidence_status():
    bad = dict(BASE, evidence_status="unverified")
    with pytest.raises(ValueError):
        validate_record(bad)
