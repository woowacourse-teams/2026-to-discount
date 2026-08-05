import json

import ingest
from ingest import plan, wins_after_ingest


def rec(brand="BBQ", platform="ddangyo", captured="2026-08-05T12:00:00+09:00", **extra):
    base = {
        "platform": platform,
        "brand": brand,
        "raw_text": f"{brand} 할인",
        "captured_at": captured,
        "target_address": "경기도 성남시 수정구 금토동",
        "capture_mode": "auto",
        "screenshot_path": "ref/x.png",
        "amount": 4000,
    }
    base.update(extra)
    return base


def test_plan_splits_fresh_duplicate_and_invalid():
    existing = [rec(captured="2026-08-01T00:00:00+09:00")]
    candidates = [
        rec(captured="2026-08-05T12:00:00+09:00"),          # 신규
        rec(captured="2026-08-01T00:00:00+09:00"),          # 이미 있음
        rec(platform="배달의민족"),                            # 알 수 없는 플랫폼
    ]
    fresh, duplicate, invalid = plan(candidates, existing)
    assert len(fresh) == 1 and len(duplicate) == 1 and len(invalid) == 1
    assert "unknown platform" in invalid[0][1]


def test_same_file_twice_does_not_grow_the_ledger():
    candidates = [rec(), rec()]
    fresh, duplicate, _ = plan(candidates, [])
    assert len(fresh) == 1 and len(duplicate) == 1


def test_correction_needs_newer_capture_to_win():
    """정정은 삭제가 아니라 덮어쓰기 — 더 오래된 정정은 조용히 진다."""
    existing = [rec(amount=4000, captured="2026-08-05T12:00:00+09:00")]
    stale = plan([rec(amount=9000, captured="2026-08-01T00:00:00+09:00")], existing)[0]
    assert wins_after_ingest(stale, existing)[("ddangyo", "BBQ")]["amount"] == 4000

    newer = plan([rec(amount=9000, captured="2026-08-06T00:00:00+09:00")], existing)[0]
    assert wins_after_ingest(newer, existing)[("ddangyo", "BBQ")]["amount"] == 9000


def test_needs_review_correction_loses_to_confirmed():
    existing = [rec(amount=4000, captured="2026-08-05T12:00:00+09:00")]
    held = plan([rec(amount=9000, captured="2026-08-06T00:00:00+09:00", needs_review=True)],
                existing)[0]
    assert wins_after_ingest(held, existing)[("ddangyo", "BBQ")]["amount"] == 4000


def test_main_appends_and_is_idempotent(tmp_path, monkeypatch, capsys):
    log = tmp_path / "log.jsonl"
    monkeypatch.setattr(ingest, "LOG_PATH", log)
    src = tmp_path / "in.json"
    src.write_text(json.dumps([rec()]), encoding="utf-8")

    assert ingest.main(["ingest.py", str(src)]) == 0
    assert ingest.main(["ingest.py", str(src)]) == 0
    assert len([l for l in log.read_text(encoding="utf-8").splitlines() if l.strip()]) == 1


def test_main_refuses_the_whole_batch_when_any_record_is_invalid(tmp_path, monkeypatch):
    log = tmp_path / "log.jsonl"
    monkeypatch.setattr(ingest, "LOG_PATH", log)
    src = tmp_path / "in.json"
    src.write_text(json.dumps([rec(), rec(brand="X", platform="배달의민족")]), encoding="utf-8")

    assert ingest.main(["ingest.py", str(src)]) == 1
    assert not log.exists()


def test_dry_run_reports_a_winning_record_as_reflected(tmp_path, monkeypatch, capsys):
    """_prefer는 이긴 쪽을 그대로 돌려주지 않고 병합한 새 dict를 만든다 —
    객체 동일성으로 비교하면 이겨도 '졌다'고 나온다."""
    log = tmp_path / "log.jsonl"
    monkeypatch.setattr(ingest, "LOG_PATH", log)
    log.write_text(json.dumps(
        rec(amount=7000, captured="2026-07-27T14:25:00+09:00", needs_review=True)) + "\n",
        encoding="utf-8")
    src = tmp_path / "in.json"
    src.write_text(json.dumps([rec(amount=4000, captured="2026-07-31T14:30:00+09:00")]),
                   encoding="utf-8")

    ingest.main(["ingest.py", str(src), "--dry-run"])
    assert "반영됨" in capsys.readouterr().out


def test_dry_run_writes_nothing(tmp_path, monkeypatch):
    log = tmp_path / "log.jsonl"
    monkeypatch.setattr(ingest, "LOG_PATH", log)
    src = tmp_path / "in.json"
    src.write_text(json.dumps([rec()]), encoding="utf-8")

    assert ingest.main(["ingest.py", str(src), "--dry-run"]) == 0
    assert not log.exists()
