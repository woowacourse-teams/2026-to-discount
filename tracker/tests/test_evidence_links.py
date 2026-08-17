import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

# 증거 화면이 사는 곳. 모노레포 미러는 원장과 코드만 받고 이 디렉터리는
# 받지 않아서(용량), 거기서는 링크 검사가 구조적으로 통과할 수 없다 —
# 실제로 모노레포 CI가 이 검사 하나로 계속 빨갰다. 디렉터리가 통째로
# 없으면 "여기서 검사할 수 없다"고 건너뛴다. 디렉터리는 있는데 파일이
# 없는 경우는 진짜 손실이므로 그대로 잡는다.
EVIDENCE_ROOTS = ("ref", "captures")


def test_unmarked_rows_point_to_existing_files():
    """evidence_status 없는 행(검증 통과 군)의 증거 화면은 디스크에 실존해야
    한다(ADR-021의 불변식). 원장 쓰기 없이 파일만 옮겨지는 회귀는 쓰기 시점
    검사가 못 보므로 전수 검사로 잡는다. 손실이 확인된 행은 evidence_status를
    달아야 이 검사를 통과한다. 표시 없는 손실은 존재할 수 없다."""
    if not any((ROOT / name).is_dir() for name in EVIDENCE_ROOTS):
        pytest.skip("증거 디렉터리가 없는 사본이다 — 여기서는 링크를 확인할 수 없다")

    lines = (ROOT / "data" / "log.jsonl").read_text(encoding="utf-8").splitlines()
    rows = [json.loads(line) for line in lines]
    broken = [
        (line_no, row.get("screenshot_path"))
        for line_no, row in enumerate(rows, 1)
        if row.get("evidence_status") is None
        and not (ROOT / (row.get("screenshot_path") or "")).is_file()
    ]
    assert not broken, f"증거 경로 끊김 {len(broken)}행: {broken[:5]}"
