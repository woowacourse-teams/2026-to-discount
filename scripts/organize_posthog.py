#!/usr/bin/env python3
"""PostHog 인사이트를 정리한다. 낡은 것은 내리고, 남는 것은 주제별 대시보드에 묶는다.

## 왜 필요한가

2026-09-22 기준 인사이트가 91개인데 그중 37개가 어느 대시보드에도 안 붙어 있었다. 목록으로만
쌓이면 "이 질문의 답이 이미 있는가"를 아무도 모르고, 같은 질문이 다시 만들어진다. 실제로
방문자 수를 세는 인사이트가 넷이었다.

두 가지를 한다.

1. **내린다.** PostHog가 프로젝트를 만들 때 끼워 준 기본 인사이트, 끝난 실험의 중간 산출,
   한 번 쓰고 만 초안. 지우지 않고 `deleted=true`로 내린다 — 화면에서 빠지되 되살릴 수 있다.
2. **묶는다.** 남는 인사이트를 주제별 대시보드에 붙인다. 한 인사이트가 여러 대시보드에
   속해도 된다(같은 그림이 두 질문에 답하는 경우가 있다).

    python scripts/organize_posthog.py            # 무엇을 내리고 어디 붙일지만 본다
    python scripts/organize_posthog.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import posthog_dashboards as ph                                  # noqa: E402

# 내릴 것. 이름이 정확히 같은 인사이트만 내린다.
RETIRE = {
    # PostHog가 프로젝트 개설 때 만들어 준 기본 타일. 우리 정의(실질 사용자, 활성 사용자)와
    # 겹치고 크롤러·개발 트래픽을 안 뺀다.
    "Active users (last 30 days)": "기본 타일. '활성 사용자 — DAU·WAU·MAU'가 대신한다",
    "Daily active users (DAUs)": "기본 타일. '실질 사용자 — 일별'이 대신한다",
    "Pageviews (last 7 days)": "기본 타일. 페이지뷰만으로는 판단할 것이 없다",
    "Sessions (last 7 days)": "기본 타일. 세션 수는 '재사용' 묶음이 더 자세히 본다",
    "Retention": "기본 타일. '재사용 — 일별 재방문율'이 대신한다",
    "Top referrers": "기본 타일. '유입 갈래별 사람과 전환'이 대신한다",
    # 한 번 쓰고 만 것.
    "draft user path": "초안. 남은 질문이 없다",
    "전체 이벤트(2026-08-26)": "그날 하루를 보려고 만든 것",
    "자동완성 도입 전 브랜드 검색 제출 기준선은 어떠한가": "도입 전 기준선. 도입이 끝났다",
    # 끝난 실험(2026-09-15 종료)의 중간 산출. 요약은 docs/AB-SUMMARY-2026-09.md에 있다.
    "A/B - 방문자 및 오퍼 클릭": "끝난 실험. 요약은 docs/AB-SUMMARY-2026-09.md",
    "A/B - 오퍼 클릭 비율": "끝난 실험. 요약은 docs/AB-SUMMARY-2026-09.md",
    "A/B - 옵션 설정 지표": "끝난 실험. 요약은 docs/AB-SUMMARY-2026-09.md",
    # 같은 것을 두 번 그린 것. '전체 기간' 판만 남긴다.
    "OS별 브라우저 점유율": "'(전체 기간)' 판과 같은 질문",
    "전체 브라우저 점유율": "'(전체 기간)' 판과 같은 질문",
    "브라우저 데이터 수집 상태": "'(전체 기간)' 판과 같은 질문",
}

# 주제별 묶음. 없는 대시보드는 만든다.
BOARDS = {
    "성공 신호 — 배달앱 도착": [
        "도착 — 배달앱으로 나간 클릭",
        "도착 — 브랜드별 클릭 상위",
        "퍼널 — 방문에서 배달앱 도착까지",
        "성공 신호 — 1인당 클릭 분포",
        "성공 신호 — 주별 전환율과 클릭 비율",
        "유입 갈래별 사람과 전환",
        "시간대 별 방문자 및 링크 클릭 수",
    ],
    "재사용 — 다시 오는가": [
        "유저 재방문률",
        "재방문 — 링크 이동 리텐션",
        "재사용 — 스티키니스 (30일 중 며칠 왔나)",
        "재사용 — 주간 라이프사이클",
        "재사용 — 주간 리텐션 (첫 방문 기준)",
        "재사용 — 일별 재방문율 (31일)",
        "재사용 — 다시 오기까지의 간격",
        "재사용 — 주별 신규·유지·복귀",
        "재사용 — 주별 충성 사용자 비율",
        "재사용 — 활동일수 분포",
        "첫 방문 행동 유형별 7일 재방문율",
    ],
    "탐색 — 무엇을 눌러 고르나": [
        "탐색 — 조건 조합 상위",
        "탐색 — 조건을 고르는 행동",
        "담아보기 — 사용량",
        "기능 사용 — 정렬·필터 종류별 (주별, 사람 수)",
        "검색 조건 활성 상태에서 배달앱으로 이동하는가",
        "검색 조건 활성 상태에서 어떤 비교 행동이 이어지는가",
        "검색 조건 활성 상태의 후속 행동 사용자는 얼마나 되는가",
        "검색과 필터 사용 유형별 오퍼 링크 도달률",
        "첫 화면 이탈 — 세션의 첫 동작",
    ],
    "배너 할인정보 성과": [
        "배너 — 브랜드별 클릭",
        "배너 — 클릭과 위치",
        "배너 — 자리(position)별 클릭률 (최근 14일)",
        "배너 — 장별 노출·클릭·클릭률 (최근 14일, 일별)",
    ],
    "계측 건강도 — 숫자를 믿어도 되나": [
        "brand_impression 수집 건강도",
        "수집 건강도 — 갈래 누락",
        "수집 건강도 — 경로별 도착",
        "수집 건강도 — 개발 트래픽 비중",
        "계측 건강도 — dev_suspect 오탐 규모",
        "전체 활동 — 이벤트 종류별",
        "일별 이벤트 개수 추이",
    ],
    "브랜드 검색 자동완성": [
        "전체 사용자 100명 기준 검색 사용률",
        "전체 사용자 100명 기준 검색 성과 도달률",
    ],
    "설문": [
        "설문 — 단계별 도달",
        "설문 — 문항별 응답 누계",
    ],
}


def load(token):
    rows = ph.api("insights/?limit=300", "GET", None, token).get("results", [])
    return {(r.get("name") or r.get("derived_name") or ""): r for r in rows}


def boards(token):
    rows = ph.api("dashboards/?limit=100", "GET", None, token).get("results", [])
    return {d["name"]: d["id"] for d in rows}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="실제로 내리고 붙인다")
    args = p.parse_args(argv)

    token = ph.key()
    insights = load(token)
    existing = boards(token)

    print("## 내릴 것")
    retire = [(name, why) for name, why in RETIRE.items() if name in insights]
    for name, why in retire:
        print(f"  {name}  — {why}")
    missing = [n for n in RETIRE if n not in insights]
    if missing:
        print(f"  (이미 없음 {len(missing)}개)")

    print("\n## 묶을 것")
    plan = []
    for board, names in BOARDS.items():
        found = [n for n in names if n in insights]
        absent = [n for n in names if n not in insights]
        print(f"  [{board}] {len(found)}개" + (f" · 없는 이름 {absent}" if absent else ""))
        plan.append((board, found))

    if not args.apply:
        print("\n미리보기다 — 실제로 하려면 --apply")
        return 0

    for name, _why in retire:
        ph.api("insights/%d/" % insights[name]["id"], "PATCH", {"deleted": True}, token)
    print(f"\n내렸다: {len(retire)}개")

    for board, names in plan:
        bid = existing.get(board)
        if bid is None:
            bid = ph.api("dashboards/", "POST", {"name": board, "description":
                                                 "scripts/organize_posthog.py가 묶는다"}, token)["id"]
            print(f"  대시보드 만듦: {board} ({bid})")
        for name in names:
            row = insights[name]
            want = sorted(set(row.get("dashboards") or []) | {bid})
            if want != sorted(row.get("dashboards") or []):
                ph.api("insights/%d/" % row["id"], "PATCH", {"dashboards": want}, token)
        print(f"  [{board}] {len(names)}개 붙였다 -> {ph.HOST}/project/{ph.PROJECT}/dashboard/{bid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
