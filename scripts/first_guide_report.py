#!/usr/bin/env python3
"""첫 방문 안내 전, 떠 있던 동안, 뺀 뒤의 완전 신규 방문자 첫 세션을 갈래별로 견준다.

    python scripts/first_guide_report.py --src <events.jsonl>

보고: docs/metrics/FIRST-GUIDE-20261016.md. 제외 규칙은 experiments.py(개발자, 자동 방문 표시)와
docs/metrics/HOME-AB-20261014.md 상세 1(강제 안 선택, 안 기록 없음, 자동 방문자 1명)을 그대로 쓴다.
완전 신규는 원장의 첫 이벤트가 첫 방문(visitCount 1)인 방문자이고, 그 첫 세션만 본다.
"""
import argparse
import collections
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import experiments as ex  # noqa: E402

KST = dt.timezone(dt.timedelta(hours=9))
PERIODS = [("안내 전", "2026-10-07T00:00:00+09:00", "2026-10-12T23:23:00+09:00"),
           ("안내 중", "2026-10-12T23:23:00+09:00", "2026-10-14T15:44:00+09:00"),
           ("뺀 뒤", "2026-10-14T15:44:00+09:00", "2099-01-01T00:00:00+09:00")]
BOT_VID = "v_fa46ff74d778e5ba"            # HOME-AB-20261014.md 상세 4-1
# 동작으로 치지 않는 이벤트(HOME-AB 문서의 무동작 정의: 노출, 들어옴, 나감, 설문 노출, 알림 안내, 첫 방문 안내)
NON_ACTION = {"page_view", "page_exit", "brand_impression", "banner_impression", "survey_impression",
              "push_prompt_viewed", "push_prompt_closed", "first_guide", "web_vitals", "client_error",
              "push_notification_displayed", "app_open_result"}
FILTER = {"category_change", "platform_filter_toggle", "quick_filter", "filter_sheet_open", "filters_apply",
          "membership_toggle", "filters_reset"}
METRICS = (("conv", "전환"), ("link", "링크 클릭"), ("idle", "무동작"), ("search", "검색"),
           ("filter", "필터, 분류"), ("back", "다음 날 재방문"))


def when(s):
    return dt.datetime.fromisoformat(s)


def collect(src):
    people, _ = ex.load(src)
    first, sess, days, home, forced = {}, collections.defaultdict(list), collections.defaultdict(set), {}, set()
    last_ts = ""
    with open(src, encoding="utf-8") as f:
        for line in f:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            vid, ts = e.get("visitorId"), e.get("ts") or ""
            if not vid or not ts:
                continue
            last_ts = max(last_ts, ts)
            p = e.get("props") or {}
            if p.get("home"):
                home[vid] = p["home"]
            if p.get("home_forced"):
                forced.add(vid)
            if vid not in first or ts < first[vid]["ts"]:
                first[vid] = {"ts": ts, "sid": e.get("sessionId"), "ref": e.get("referrer"),
                              "vp": e.get("viewport") or "", "visits": e.get("visitCount")}
            sess[(vid, e.get("sessionId"))].append((ts, e.get("event"), p))
            days[vid].add(when(ts).astimezone(KST).date())
    # 다음 날 재방문은 다음 날이 원장에 다 들어 있을 때만 센다
    full_day = when(last_ts).astimezone(KST).date() - dt.timedelta(days=1)
    rows = []
    for vid, fe in first.items():
        v = people.get(vid)
        if v is None or v.looks_developer() or v.bot or vid == BOT_VID or vid in forced or vid not in home:
            continue
        if fe["visits"] not in (1, None):
            continue
        period = next((n for n, a, b in PERIODS if a <= fe["ts"] < b), None)
        if not period:
            continue
        names = {n for _, n, _ in sess[(vid, fe["sid"])]}
        guide = [p for _, n, p in sorted(sess[(vid, fe["sid"])], key=lambda x: x[0]) if n == "first_guide"]
        width = int(fe["vp"].split("x")[0]) if "x" in fe["vp"] else 0
        day0 = when(fe["ts"]).astimezone(KST).date()
        rows.append({
            "period": period, "ref": fe["ref"], "device": "폰" if width <= 500 else "컴퓨터", "arm": home[vid],
            "conv": bool(names & {"offer_link_click", "banner_click"}), "link": "offer_link_click" in names,
            "idle": not (names - NON_ACTION), "search": "brand_search_submitted" in names,
            "filter": bool(names & FILTER),
            "back": (day0 + dt.timedelta(days=1) in days[vid]) if day0 + dt.timedelta(days=1) <= full_day else None,
            "guide": guide})
    return rows, last_ts


def z(c1, n1, c0, n0):
    p = (c1 + c0) / (n1 + n0)
    se = (p * (1 - p) * (1 / n1 + 1 / n0)) ** 0.5
    return (c1 / n1 - c0 / n0) / se if se else 0.0


def table(rows, title):
    print(f"\n### {title}\n")
    print("| 지표 | " + " | ".join(n for n, _, _ in PERIODS) + " |")
    print("|---|" + "---|" * len(PERIODS))
    by = {n: [r for r in rows if r["period"] == n] for n, _, _ in PERIODS}
    print("| 방문자 | " + " | ".join(str(len(by[n])) for n, _, _ in PERIODS) + " |")
    for key, name in METRICS:
        cells = []
        base = [r[key] for r in by["안내 전"] if r[key] is not None]
        for n, _, _ in PERIODS:
            vals = [r[key] for r in by[n] if r[key] is not None]
            if not vals:
                cells.append("-")
                continue
            cell = f"{100 * sum(vals) / len(vals):.1f}%"
            if n != "안내 전" and base:
                cell += f" (z={z(sum(vals), len(vals), sum(base), len(base)):+.2f})"
            if key == "back":
                cell += f", {len(vals)}명"
            cells.append(cell)
        print(f"| {name} | " + " | ".join(cells) + " |")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=None, help="events.jsonl(없으면 experiments.py가 받아 둔 사본)")
    args = ap.parse_args()
    src = args.src or ex.fetch(None)
    rows, last_ts = collect(src)
    print(f"원장 끝: {last_ts}")
    table(rows, "완전 신규 전체")
    for key, label, vals in (("ref", "유입", ("direct", "external")), ("device", "기기", ("폰", "컴퓨터")),
                             ("arm", "안", ("coupon", "old"))):
        for val in vals:
            table([r for r in rows if r[key] == val], f"{label}: {val}")
    print("\n### 안내를 본 완전 신규의 마지막 안내 상태(안내 중)\n")
    groups, convs = collections.Counter(), collections.Counter()
    for r in rows:
        if r["period"] != "안내 중" or not r["guide"]:
            continue
        a, s = r["guide"][-1].get("action"), r["guide"][-1].get("step")
        g = ("첫 단계를 보고 그대로 나감" if (a, s) == ("view", "card") else "끝까지 봄" if a == "done"
             else "첫 단계에서 건너뛰기" if (a, s) == ("skip", "card") else "그 밖")
        groups[g] += 1
        convs[g] += r["conv"]
    for g, n in groups.most_common():
        print(f"| {g} | {n} | {convs[g]} |")


if __name__ == "__main__":
    main()
