import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_unmarked_rows_point_to_existing_files():
    """evidence_status 없는 행(검증 통과 군)의 증거 화면은 디스크에 실존해야
    한다(ADR-021의 불변식). 원장 쓰기 없이 파일만 옮겨지는 회귀는 쓰기 시점
    검사가 못 보므로 전수 검사로 잡는다. 손실이 확인된 행은 evidence_status를
    달아야 이 검사를 통과한다. 표시 없는 손실은 존재할 수 없다."""
    lines = (ROOT / "data" / "log.jsonl").read_text(encoding="utf-8").splitlines()
    rows = [json.loads(line) for line in lines]
    broken = [
        (line_no, row.get("screenshot_path"))
        for line_no, row in enumerate(rows, 1)
        if row.get("evidence_status") is None
        and not (ROOT / (row.get("screenshot_path") or "")).is_file()
    ]
    assert not broken, f"증거 경로 끊김 {len(broken)}행: {broken[:5]}"
