#!/usr/bin/env python3
"""DAU, WAU, MAU를 두 가지 기준으로 센다.

## 왜 두 가지인가

"온 사람"과 "쓴 사람"은 다르다. 이 서비스에서 값이 생기는 순간은 배달앱으로 나가는
순간이고(`offer_link_click`, `banner_click`), 화면만 보고 나간 방문은 아직 아무 일도
일어나지 않은 것이다. 그래서 같은 날을 두 번 센다.

    방문   그날 이벤트가 하나라도 있는 사람
    활성   그날 오퍼나 배너를 눌러 앱으로 나간 사람

둘을 나란히 두면 "사람은 늘었는데 아무도 안 누른다" 같은 상태가 한 줄로 보인다.

## 어디서 세나

**자체 원장이 기준이다**(서버 `events.jsonl`). 방문자 식별자와 dev, bot 표시가 그대로
있어서 크롤러와 개발 기기를 뺄 수 있다. PostHog, GA4, Vercel은 이 숫자를 견주는 데 쓴다.

    PostHog   같은 이벤트를 받는 두 번째 장부. HogQL로 같은 기간을 물어 대조한다.
    GA4       measurement id G-7T4DN0NXV5. 브라우저가 직접 보내므로 광고 차단에 더 약하다.
    Vercel    사람 수가 아니라 요청 수다. 사람당 요청이 튀는 날을 잡는 데 쓴다.

숫자가 서로 다른 것은 정상이다. 차단·표본·식별 방식이 다르다. 어긋나는 **폭**이 갑자기
바뀌는 것이 신호다.

    python scripts/active_users.py                  # 최근 30일
    python scripts/active_users.py --days 60
    python scripts/active_users.py --posthog        # PostHog 대조까지
    python scripts/active_users.py --json           # 기계용
"""
from __future__ import annotations

import argparse
import collections
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import experiments as ex                                       # noqa: E402

# 성공 신호. 이 이벤트가 있으면 그 사람은 그날 앱으로 나갔다.
ACTIVE_EVENTS = ("offer_link_click", "banner_click")


def buckets(rows, people, active_events=ACTIVE_EVENTS):
    """(날짜 -> 방문자 집합, 날짜 -> 활성 방문자 집합). dev·bot은 뺀다."""
    keep = {vid for vid, v in people.items() if not v.dev and not v.bot}
    visited = collections.defaultdict(set)
    active = collections.defaultdict(set)
    for day, vid, event, _props, _ts, _sid, _path in rows:
        if vid not in keep or not day:
            continue
        visited[day].add(vid)
        if event in active_events:
            active[day].add(vid)
    return visited, active


def window(buckets_by_day, end: datetime.date, days: int) -> int:
    """`end`를 포함한 `days`일 동안의 고유 방문자 수."""
    seen = set()
    for i in range(days):
        seen |= buckets_by_day.get((end - datetime.timedelta(days=i)).isoformat(), set())
    return len(seen)


def table(visited, active, days: int):
    """날짜마다 DAU, WAU, MAU를 두 기준으로. 최근 날짜가 마지막 줄이다."""
    all_days = sorted(set(visited) | set(active))
    if not all_days:
        return []
    last = datetime.date.fromisoformat(all_days[-1])
    out = []
    for i in range(days - 1, -1, -1):
        day = last - datetime.timedelta(days=i)
        key = day.isoformat()
        out.append({
            "date": key,
            "dau": len(visited.get(key, ())),
            "wau": window(visited, day, 7),
            "mau": window(visited, day, 30),
            "dau_active": len(active.get(key, ())),
            "wau_active": window(active, day, 7),
            "mau_active": window(active, day, 30),
        })
    return out


def posthog_counts(days: int) -> dict:
    """PostHog에 같은 질문을 던진다. 키가 없으면 빈 dict."""
    sys.path.insert(0, HERE)
    import posthog_dashboards as ph

    try:
        token = ph.key()
    except SystemExit:
        return {}
    sql = f"""
    SELECT toDate(timestamp) AS day,
           count(DISTINCT person_id) AS dau,
           countIf(DISTINCT person_id, event IN ('offer_link_click','banner_click')) AS dau_active
    FROM events
    WHERE timestamp >= now() - INTERVAL {days} DAY
      AND properties.dev IS NULL
    GROUP BY day ORDER BY day
    """
    try:
        res = ph.api("query/", "POST", {"query": {"kind": "HogQLQuery", "query": sql}}, token)
    except SystemExit as exc:
        return {"error": str(exc)[:200]}
    return {str(row[0]): {"dau": row[1], "dau_active": row[2]} for row in res.get("results", [])}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--src", help="원장 파일. 없으면 서버에서 받는다")
    p.add_argument("--days", type=int, default=30, help="표에 담을 날 수")
    p.add_argument("--posthog", action="store_true", help="PostHog 숫자와 나란히 본다")
    p.add_argument("--json", action="store_true", help="표 대신 JSON")
    args = p.parse_args(argv)

    people, rows = ex.load(ex.fetch(args.src))
    visited, active = buckets(rows, people)
    data = table(visited, active, args.days)
    if not data:
        print("원장에 셀 것이 없다")
        return 1

    ph_rows = posthog_counts(args.days) if args.posthog else {}

    if args.json:
        print(json.dumps({"rows": data, "posthog": ph_rows}, ensure_ascii=False, indent=1))
        return 0

    print("날짜         DAU  WAU  MAU  |  활성 DAU  WAU  MAU" + ("   | PostHog DAU" if ph_rows else ""))
    for r in data:
        line = (f"{r['date']}  {r['dau']:4d} {r['wau']:4d} {r['mau']:4d}  |"
                f"{r['dau_active']:9d} {r['wau_active']:4d} {r['mau_active']:4d}")
        if ph_rows:
            got = ph_rows.get(r["date"])
            line += f"   |{got['dau']:8d}" if got else "   |       —"
        print(line)

    last = data[-1]
    rate = (last["dau_active"] / last["dau"] * 100) if last["dau"] else 0
    print(f"\n{last['date']} 기준 — 방문 {last['dau']}명 중 {last['dau_active']}명이 앱으로 나갔다"
          f" ({rate:.0f}%). 주간 {last['wau_active']}/{last['wau']}, 월간 {last['mau_active']}/{last['mau']}")
    if ph_rows.get("error"):
        print(f"PostHog 대조 실패: {ph_rows['error']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
