"""Vercel 사용량 수집기가 기록을 안 잃고 안 겹치게 쌓는지 본다.

API를 부르지 않는다 — 네트워크 없이 도는 부분만 본다.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vercel_usage as vu  # noqa: E402


def _store(tmp_path, monkeypatch):
    path = tmp_path / "usage.jsonl"
    monkeypatch.setattr(vu, "STORE", str(path))
    return path


def test_appends_and_never_writes_the_same_row_twice(tmp_path, monkeypatch):
    """같은 (날짜·항목·프로젝트·출처)는 다시 안 적는다.

    한도가 30일 롤링이라 매일 돌리게 되는데, 돌릴 때마다 같은 날이 겹쳐
    들어온다. 안 막으면 report의 평균이 겹친 날 쪽으로 끌려간다.
    """
    path = _store(tmp_path, monkeypatch)
    row = {"date": "2026-09-08", "service": "Edge Requests",
           "project": "web", "quantity": 100.0, "unit": "requests",
           "source": "api", "recorded_at": "2026-09-09"}

    assert len(vu.append([row], apply_=True)) == 1
    assert len(vu.append([row], apply_=True)) == 0
    assert len(path.read_text(encoding="utf-8").strip().splitlines()) == 1


def test_manual_and_api_rows_do_not_collide(tmp_path, monkeypatch):
    """손으로 적은 값은 API 값을 덮지 않는다 — 둘 다 남아야 비교가 된다."""
    _store(tmp_path, monkeypatch)
    base = {"date": "2026-09-08", "service": "Edge Requests", "project": "web",
            "unit": "requests", "recorded_at": "2026-09-09"}
    vu.append([{**base, "quantity": 100.0, "source": "api"}], apply_=True)
    fresh = vu.append([{**base, "quantity": 98.0, "source": "manual"}], apply_=True)

    assert len(fresh) == 1
    assert len(vu.load_store()) == 2


def test_preview_does_not_touch_the_file(tmp_path, monkeypatch):
    """--apply 없이는 아무것도 안 쓴다."""
    path = _store(tmp_path, monkeypatch)
    row = {"date": "2026-09-08", "service": "Edge Requests", "project": "web",
           "quantity": 1.0, "unit": "requests", "source": "api",
           "recorded_at": "2026-09-09"}

    assert len(vu.append([row], apply_=False)) == 1
    assert not path.exists()


def test_report_around_excludes_the_pivot_day(tmp_path, monkeypatch, capsys):
    """기준일 자체는 전에도 후에도 안 넣는다.

    바뀌는 중인 날이라 어느 쪽으로 세도 틀린다. 2026-09-07이 바로 그런
    날이었다 — 15:57에 캐시 헤더가 들어갔고 18:41에야 배포가 실제로
    나갔다. 그날 하루치는 절반은 옛 상태, 절반은 새 상태다.
    """
    _store(tmp_path, monkeypatch)
    rows = [
        {"date": "2026-09-06", "quantity": 100.0},
        {"date": "2026-09-07", "quantity": 999.0},   # 기준일 — 빠져야 한다
        {"date": "2026-09-08", "quantity": 20.0},
    ]
    vu.append([{"service": "Edge Requests", "project": "web", "unit": "requests",
                "source": "api", "recorded_at": "2026-09-09", **r} for r in rows],
              apply_=True)

    vu.main(["report", "--around", "2026-09-07"])
    out = capsys.readouterr().out
    assert "999" not in out, "기준일 값이 평균에 섞였다"
    assert "100" in out and "20" in out
    assert "-80.0%" in out


def test_store_rows_are_json_one_per_line(tmp_path, monkeypatch):
    """원장과 같은 모양이어야 나중에 다른 도구가 읽는다."""
    path = _store(tmp_path, monkeypatch)
    vu.append([{"date": "2026-09-08", "service": "Edge Requests", "project": "web",
                "quantity": 1.5, "unit": "requests", "source": "api",
                "recorded_at": "2026-09-09"}], apply_=True)

    line = path.read_text(encoding="utf-8").strip()
    assert json.loads(line)["quantity"] == 1.5
