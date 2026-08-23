import pytest
from store import _prefer, append_record, read_records, latest_per_brand

BASE = {
    "platform": "baemin",
    "brand": "피자헛",
    "raw_text": "10,000원 브랜드 할인",
    "captured_at": "2026-07-26T11:22:00+09:00",
    "target_address": "서울특별시 강남구 역삼동 858 강남역",
    "capture_mode": "manual",
    "screenshot_path": "captures/baemin/20260726-1122/full.png",
    "amount": 10000,
}


def test_append_and_read_round_trip(tmp_path):
    log_path = tmp_path / "log.jsonl"
    append_record(dict(BASE), log_path)
    records = read_records(log_path)
    assert len(records) == 1
    assert records[0]["brand"] == "피자헛"


def test_read_records_missing_file_returns_empty_list(tmp_path):
    assert read_records(tmp_path / "no-such-file.jsonl") == []


def test_append_record_rejects_invalid_without_writing(tmp_path):
    log_path = tmp_path / "log.jsonl"
    invalid = dict(BASE)
    del invalid["brand"]
    with pytest.raises(ValueError):
        append_record(invalid, log_path)
    assert not log_path.exists()


def test_latest_per_brand_picks_most_recent():
    older = dict(BASE, captured_at="2026-07-19T09:00:00+09:00", amount=8000,
                 raw_text="8,000원 브랜드 할인")
    newer = dict(BASE, captured_at="2026-07-26T09:00:00+09:00", amount=10000,
                 raw_text="10,000원 브랜드 할인")
    latest = latest_per_brand([older, newer])
    assert latest[("baemin", "피자헛")]["amount"] == 10000


def test_latest_per_brand_prefers_confirmed_over_newer_held():
    # 예전에 확정(needs_review 없음)으로 잡힌 큰 금액을, 나중에 재확인하며
    # needs_review로 캡처한 작은 금액이 최신이라는 이유로 밀어내면 안 된다.
    confirmed_old = dict(BASE, captured_at="2026-07-27T14:26:00+09:00", amount=11000)
    held_new = dict(BASE, captured_at="2026-07-29T18:53:00+09:00", amount=7000,
                     needs_review=True, conditions="메뉴 한정 쿠폰")
    latest = latest_per_brand([confirmed_old, held_new])
    result = latest[("baemin", "피자헛")]
    assert result["amount"] == 11000
    # 금액이 다르면(11000 vs 7000) 서로 다른 쿠폰일 수 있어 조건을 옮겨
    # 붙이지 않는다 — API 훌랄라참숯바베큐치킨 사고(2026-07-31)와 같은 클래스.
    assert result.get("conditions") is None


def test_latest_per_brand_merges_detail_when_amount_matches():
    confirmed = dict(BASE, captured_at="2026-07-27T14:26:00+09:00", amount=5000)
    held_same_amount = dict(BASE, captured_at="2026-07-29T18:53:00+09:00", amount=5000,
                             needs_review=True, conditions="메뉴 한정 쿠폰")
    latest = latest_per_brand([confirmed, held_same_amount])
    result = latest[("baemin", "피자헛")]
    assert result["amount"] == 5000
    assert result["conditions"] == "메뉴 한정 쿠폰"  # 같은 금액이면 같은 쿠폰의 재확인으로 본다


def test_latest_per_brand_merges_detail_when_loser_amount_unknown():
    # 자동 매칭 실패로 amount를 비우고 conditions만 원문으로 남긴 기록은
    # "다른 쿠폰"이라 단정할 근거가 없다 — 병합을 막지 않는다.
    confirmed = dict(BASE, captured_at="2026-07-27T14:26:00+09:00", amount=6000)
    held_unknown_amount = dict(BASE, captured_at="2026-07-29T18:53:00+09:00", amount=None,
                                needs_review=True, conditions="쿠폰 2종 - 자동 매칭 안 됨")
    latest = latest_per_brand([confirmed, held_unknown_amount])
    result = latest[("baemin", "피자헛")]
    assert result["amount"] == 6000
    assert result["conditions"] == "쿠폰 2종 - 자동 매칭 안 됨"


def test_latest_per_brand_does_not_merge_detail_when_amounts_differ():
    # 훌랄라참숯바베큐치킨 실측(2026-07-31): 확정 5,000원 오퍼(전체 메뉴)와
    # 다른 needs_review 12,100원 오퍼(순살 참숯구이 한정 쿠폰)는 금액이
    # 달라 서로 다른 쿠폰이다. 조건을 섞어 붙이면 5,000원 오퍼가 그
    # 메뉴로 한정된 것처럼 잘못 보인다.
    confirmed = dict(BASE, captured_at="2026-07-27T14:26:00+09:00", amount=5000)
    held_other_coupon = dict(BASE, captured_at="2026-07-29T18:53:00+09:00", amount=12100,
                              needs_review=True, conditions="메뉴 한정 쿠폰")
    latest = latest_per_brand([confirmed, held_other_coupon])
    result = latest[("baemin", "피자헛")]
    assert result["amount"] == 5000
    assert result.get("conditions") is None


def test_latest_per_brand_merges_detail_when_loser_amount_is_unknown():
    # 꾸브라꼬숯불치킨 실측(2026-07-31): 자동 매칭에 실패해 amount를
    # 비워 두고 conditions에 원문만 남긴 기록은 "다른 쿠폰"이라고 단정할
    # 근거가 없다 — 병합을 막으면 상세를 확인하려 시도했다는 사실 자체가
    # 사라진다.
    confirmed = dict(BASE, captured_at="2026-07-27T14:26:00+09:00", amount=6000)
    review_amount_unknown = dict(BASE, captured_at="2026-07-31T16:00:00+09:00", amount=None,
                                  needs_review=True, conditions="쿠폰 2종 - 자동 매칭 안 됨")
    latest = latest_per_brand([confirmed, review_amount_unknown])
    result = latest[("baemin", "피자헛")]
    assert result["amount"] == 6000
    assert result["conditions"] == "쿠폰 2종 - 자동 매칭 안 됨"


def test_latest_per_brand_does_not_leak_stale_detail_through_a_third_record():
    # 실제로 터진 순서 그대로: (1) 확정 5,000원(상세 없음) (2) needs_review
    # 12,100원(다른 쿠폰, 조건 있음) (3) 나중에 실측한 확정 5,000원(진짜
    # 최소주문금액 있음, 조건 없음). (1)과 (2)가 먼저 합쳐질 때 amount가
    # 달라 조건이 안 옮겨붙어야 하고, 그 결과에 (3)이 합쳐질 때도 (2)의
    # 조건이 뒤늦게 새어 들어오면 안 된다 — 셋을 한 번에 넣어도, 순서를
    # 바꿔 하나씩 넣어도 마찬가지다.
    old_confirmed = dict(BASE, captured_at="2026-07-27T14:26:00+09:00", amount=5000)
    other_coupon_review = dict(BASE, captured_at="2026-07-29T18:53:00+09:00", amount=12100,
                                needs_review=True, conditions="메뉴 한정 쿠폰")
    new_confirmed_with_detail = dict(BASE, captured_at="2026-07-31T16:00:00+09:00", amount=5000,
                                      min_order_amount=21900)
    latest = latest_per_brand([old_confirmed, other_coupon_review, new_confirmed_with_detail])
    result = latest[("baemin", "피자헛")]
    assert result["amount"] == 5000
    assert result["min_order_amount"] == 21900
    assert result.get("conditions") is None


def test_latest_per_brand_keeps_winner_detail_when_winner_already_has_it():
    a = dict(BASE, captured_at="2026-07-27T00:00:00+09:00", amount=7000,
             min_order_amount=22000, conditions="1일 1회")
    b = dict(BASE, captured_at="2026-07-29T00:00:00+09:00", amount=3000,
             needs_review=True, min_order_amount=10000, conditions="다른 조건")
    latest = latest_per_brand([a, b])
    result = latest[("baemin", "피자헛")]
    assert result["amount"] == 7000
    assert result["min_order_amount"] == 22000
    assert result["conditions"] == "1일 1회"


def test_latest_per_brand_breaks_captured_at_tie_on_amount():
    # 같은 시각에 캡처된 두 확정 레코드(주로 인위적인 경우) — 금액 큰 쪽이 남는다.
    a = dict(BASE, captured_at="2026-07-27T00:00:00+09:00", amount=3000)
    b = dict(BASE, captured_at="2026-07-27T00:00:00+09:00", amount=5000)
    latest = latest_per_brand([a, b])
    assert latest[("baemin", "피자헛")]["amount"] == 5000


def test_multi_platform_brands_filters_by_count():
    from store import multi_platform_brands
    records = [
        {"platform": "baemin", "brand": "피자헛"},
        {"platform": "ddangyo", "brand": "피자헛"},
        {"platform": "coupangeats", "brand": "피자헛"},
        {"platform": "baemin", "brand": "단독브랜드"},
    ]
    result = multi_platform_brands(records)
    assert result == {"피자헛": {"baemin", "ddangyo", "coupangeats"}}


def test_multi_platform_brands_respects_min_platforms():
    from store import multi_platform_brands
    records = [
        {"platform": "baemin", "brand": "A"},
        {"platform": "ddangyo", "brand": "A"},
        {"platform": "yogiyo", "brand": "A"},
    ]
    assert multi_platform_brands(records, min_platforms=3) == {"A": {"baemin", "ddangyo", "yogiyo"}}
    assert multi_platform_brands(records, min_platforms=4) == {}


def test_badge_is_not_pulled_from_an_older_record():
    """목록 카드에 같이 찍히는 값이라, 최신 캡처에 없으면 없어진 것이다.

    2026-08-22 실측: 청년피자 땡겨요의 08-05·08-06 backfill 레코드가
    07-31 스크린샷을 그대로 가리키면서 원문에 없는 "포장 +1,000"을 달고
    있었고, 08-17 자동 전수 캡처가 같은 카드를 badge 없이 기록했는데도
    그 값이 되살아났다.
    """
    old = dict(BASE, platform="ddangyo", brand="청년피자", amount=5000,
               captured_at="2026-08-06T00:00:00+09:00", badge="포장 +1,000")
    new = dict(BASE, platform="ddangyo", brand="청년피자", amount=5000,
               captured_at="2026-08-17T01:24:03+09:00")

    assert _prefer(old, new).get("badge") is None


def test_detail_behind_a_tap_is_still_pulled_from_an_older_record():
    """최소주문금액은 상세를 열어야 보인다 — 목록 캡처에 없는 게 정상이다."""
    old = dict(BASE, platform="ddangyo", brand="청년피자", amount=5000,
               captured_at="2026-08-06T00:00:00+09:00", min_order_amount=18900)
    new = dict(BASE, platform="ddangyo", brand="청년피자", amount=5000,
               captured_at="2026-08-17T01:24:03+09:00")

    assert _prefer(old, new).get("min_order_amount") == 18900

