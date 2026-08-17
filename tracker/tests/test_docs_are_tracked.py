"""문서와 입력 자산이 실제로 커밋되는 자리에 있는지 본다.

`captures/`는 통째로 .gitignore 대상이다. 거기에 문서를 두면 `git add -A`가
오류 없이 건너뛰고, 커밋은 성공하고, 파일만 사라진다 — 2026-08-17에
인수인계 문서와 딥링크 목록이 그렇게 빠졌다. 조용히 실패하는 종류라
사람이 알아채지 못한다.

README가 가리키는 문서가 추적되지 않으면 링크가 처음부터 죽어 있다.
"""
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

# README의 상대 링크 중 저장소 안 파일을 가리키는 것
LINK = re.compile(r"\]\((?!https?:)([^)#]+)\)")


def tracked_paths() -> set[str]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return set(out.splitlines())


@pytest.mark.parametrize("doc", ["README.md"])
def test_readme_links_point_to_tracked_files(doc):
    tracked = tracked_paths()
    targets = LINK.findall((ROOT / doc).read_text(encoding="utf-8"))
    missing = [
        t for t in targets
        if (ROOT / t).exists() and t.rstrip("/") not in tracked
        and not any(p.startswith(t.rstrip("/") + "/") for p in tracked)
    ]
    assert not missing, f"{doc}가 추적되지 않는 파일을 가리킨다: {missing}"


def test_sweep_input_is_tracked():
    """순회 실행기가 읽는 딥링크 목록은 추적돼야 한다."""
    assert "data/baemin_brand_links.json" in tracked_paths()
