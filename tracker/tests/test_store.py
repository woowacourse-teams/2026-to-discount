import pytest
from store import append_record, read_records, latest_per_brand

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
    assert result["conditions"] == "메뉴 한정 쿠폰"  # 진 쪽의 조건은 살아남는다


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
