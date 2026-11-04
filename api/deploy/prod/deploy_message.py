#!/usr/bin/env python3
"""배포 종료 코드(stage_deploy.py)를 슬랙 알림 문구로 바꾼다. 문구는 사용자 확정(2026-10-30)이라 바꾸지 않는다.

사용: python3 deploy_message.py <code> <repo> <sha> <run_url>
대응이 없는 코드면 아무것도 찍지 않고 종료 코드 10으로 끝낸다(호출한 쪽이 기존 실패 문구로 간다).
"""
from __future__ import annotations

import sys

NO_MESSAGE = 10

MESSAGES = {
    0: "정상적으로 배포가 완료되었습니다",
    1: "임시 인스턴스가 구동 실패했습니다",
    2: "배포 중 예외가 발생해 이전 버전으로 복구됐습니다",
    3: "오류가 발생했습니다. 직접 확인이 필요합니다",
}


def build(code, repo: str, sha: str, run_url: str) -> str | None:
    try:
        text = MESSAGES.get(int(code))
    except (TypeError, ValueError):
        return None
    if text is None:
        return None
    return f"{text}\n저장소: {repo}\n커밋: {sha[:7]}\n실행: {run_url}"


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        return NO_MESSAGE
    text = build(*argv[1:])
    if text is None:
        return NO_MESSAGE
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
