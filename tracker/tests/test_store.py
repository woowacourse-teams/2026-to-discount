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
