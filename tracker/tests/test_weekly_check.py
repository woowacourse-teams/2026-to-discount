import json
from datetime import date

import weekly_check
from weekly_check import expiring, export_drift, sweep_ages, undated

TODAY = date(2026, 8, 23)

RECORD = {
    "platform": "ddangyo", "brand": "청년피자", "amount": 5000,
    "qualifier": None, "needs_review": False, "offer_type": "coupon",
    "section": "혜택 > 브랜드쿠폰", "raw_text": "18,900원 이상 5,000원",
    "captured_at": "2026-08-17T01:24:03+09:00", "unit": "KRW", "scope": "brand",
    "target_address": "x", "capture_mode": "auto",
    "min_order_amount": 18900, "expires_at": "2026-08-31", "badge": "포장 +1,000",
}


def _redirect(tmp_path, monkeypatch, *, log=None, sweeps=None, export=None):
    """모듈이 보는 파일 경로를 임시 디렉터리로 돌린다."""
    if log is not None:
        p = tmp_path / "log.jsonl"
        p.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in log),
                     encoding="utf-8")
        monkeypatch.setattr(weekly_check, "LOG_PATH", p)
    if sweeps is not None:
        p = tmp_path / "sweeps.jsonl"
        p.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in sweeps),
                     encoding="utf-8")
        monkeypatch.setattr(weekly_check, "SWEEPS_PATH", p)
    if export is not None:
        p = tmp_path / "export.json"
        p.write_text(json.dumps(export, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(weekly_check, "EXPORT_PATH", p)


def test_sweep_age_counts_days_since_the_last_recorded_sweep(tmp_path, monkeypatch):
    _redirect(tmp_path, monkeypatch, sweeps=[
        {"platform": "ddangyo", "date": "2026-08-10", "records": 40},
        {"platform": "ddangyo", "date": "2026-08-17", "records": 42},
    ])
    ages = dict((p, age) for p, _, age in sweep_ages(TODAY))
    assert ages["ddangyo"] == 6
    # 한 번도 안 훑은 플랫폼은 경과일이 없다 — 0일로 치면 방금 훑은 것처럼 보인다.
    assert ages["baemin"] is None


def test_export_drift_reports_a_field_edited_by_hand(tmp_path, monkeypatch):
    # export.json은 원장의 파생물이다. 손으로 고친 값은 다음 재생성에
    # 사라지므로, 사라지기 전에 드러나야 한다(2026-08-22 실측).
    hand_edited = [dict(
        brand="청년피자", platform="ddangyo", amount=5000, badge=None,
        minOrderAmount=18900, expiresAt="2026-08-31",
    )]
    _redirect(tmp_path, monkeypatch, log=[RECORD], export=hand_edited)

    drift = export_drift(weekly_check.read_records(weekly_check.LOG_PATH), TODAY)
    assert any("badge" in line for line in drift)


def test_export_drift_is_empty_when_export_matches_the_ledger(tmp_path, monkeypatch):
    records = [RECORD]
    _redirect(tmp_path, monkeypatch, log=records)
    rebuilt = weekly_check.build_export(
        weekly_check.read_records(weekly_check.LOG_PATH),
        today=TODAY.isoformat(),
        sweeps=weekly_check.latest_sweep_dates(records),
    )
    _redirect(tmp_path, monkeypatch, export=rebuilt)

    assert export_drift(weekly_check.read_records(weekly_check.LOG_PATH), TODAY) == []


def test_expiring_lists_only_offers_ending_within_the_window():
    exported = [
        {"brand": "가", "platform": "ddangyo", "expiresAt": "2026-08-25"},
        {"brand": "나", "platform": "ddangyo", "expiresAt": "2026-09-30"},
        {"brand": "다", "platform": "ddangyo", "expiresAt": None},
    ]
    assert expiring(exported, TODAY) == {"ddangyo": ["가"]}


def test_undated_counts_offers_that_only_a_sweep_can_retire():
    exported = [
        {"brand": "가", "platform": "baemin", "expiresAt": None},
        {"brand": "나", "platform": "baemin", "expiresAt": "2026-09-30"},
    ]
    assert undated(exported) == {"baemin": 1}
