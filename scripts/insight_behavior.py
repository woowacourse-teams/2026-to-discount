"""/insight E 구역(사용자 반응)에 쓸 집계를 JSON 한 장으로 만든다.

  scripts/insight_behavior.py --out behavior.json [--src 원장.jsonl]

방문자 거르기(개발, 봇, 합성)는 experiments.load()/keep() 그대로다. 숫자가 snapshot.py와
갈라지지 않게 같은 걸 쓴다. 관리자 API(`GET /api/admin/insight/behavior`)가 이 파일을 읽는다.

비율은 분모(N)가 MIN_N 미만이거나 분자가 분모보다 크면 null이다. 노출 이벤트가 클릭보다
적게 잡히는 칸이 있다(snapshot 시험 머리말의 138% 사건).
"""
import argparse
import collections
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import experiments as ex  # noqa: E402
import snapshot as sn  # noqa: E402

MIN_N = 30
PLATFORMS = ("baemin", "coupangeats", "yogiyo", "ddangyo")
CLICKS = ("offer_link_click", "banner_click")  # 앱으로 나가는 길(experiments.GOAL)


def rate(num, den):
    """N이 작거나 분자가 분모를 넘으면 그리지 않는다(null)."""
    if den < MIN_N or num > den:
        return None
    return round(num / den, 4)


def build(people, rows, args=None):
    args = args or sn.base_args()
    week_click = collections.defaultdict(collections.Counter)
    plat = {p: collections.defaultdict(int) for p in PLATFORMS}
    clickers = {p: set() for p in PLATFORMS}
    seen = collections.defaultdict(set)  # 깔때기: 단계 -> 방문자
    days = []
    for day, vid, ev, props, _ts, _sid, _path in rows:
        if not ex.keep(people[vid], args):
            continue
        days.append(day)
        pr = props if isinstance(props, dict) else {}
        p = pr.get("platform")
        if ev in ("page_view", "brand_impression"):
            seen[ev].add(vid)
        if ev in CLICKS:
            seen["click"].add(vid)
        if p not in plat:
            continue
        if ev in CLICKS:
            week_click[sn.week_of(day).isoformat()][p] += 1
            clickers[p].add(vid)
            plat[p]["clicks"] += 1
        key = {"banner_impression": "bannerImpressions", "banner_click": "bannerClicks",
               "banner_dismiss": "bannerDismisses", "app_return": "appReturns",
               "app_open_result": "appOpenTries"}.get(ev)
        if key:
            plat[p][key] += 1
        if ev == "app_open_result" and str(pr.get("opened")).lower() == "true":
            plat[p]["appOpened"] += 1

    out_plat = {}
    for p in PLATFORMS:
        d = plat[p]
        out_plat[p] = {
            "clicks": d["clicks"], "clickers": len(clickers[p]),
            "bannerImpressions": d["bannerImpressions"], "bannerClicks": d["bannerClicks"],
            "bannerDismisses": d["bannerDismisses"],
            "bannerClickRate": rate(d["bannerClicks"], d["bannerImpressions"]),
            "bannerDismissRate": rate(d["bannerDismisses"], d["bannerImpressions"]),
            "appOpenTries": d["appOpenTries"],
            "appOpenRate": rate(d["appOpened"], d["appOpenTries"]),
            "appReturns": d["appReturns"],
        }
    weeks = [{"week": w, "byPlatform": {p: c.get(p, 0) for p in PLATFORMS}}
             for w, c in sorted(week_click.items())]
    funnel = [{"step": s, "visitors": len(seen[k])} for s, k in (
        ("방문", "page_view"), ("브랜드 노출", "brand_impression"),
        ("앱으로 이동", "click"))]  # 펼침은 뺀다: 칩을 바로 눌러 나가는 길이 있어 단계가 겹치지 않는다
    return {
        "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "range": {"from": min(days) if days else None, "to": max(days) if days else None},
        "minN": MIN_N, "platforms": list(PLATFORMS),
        "weeklyClicks": weeks, "platformReaction": out_plat, "funnel": funnel,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", help="원장 파일. 없으면 서버에서 받는다")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    people, rows = ex.load(ex.fetch(a.src))
    with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(build(people, rows), fh, ensure_ascii=False, indent=1)
    print(a.out)
    return 0


def demo():
    class P:
        bot = None
        returning = False
        days = ("2026-11-02",)

        def looks_developer(self):
            return False

    pr = lambda **k: k  # noqa: E731
    rs = [("2026-11-02", "v1", "banner_impression", pr(platform="baemin"), "", "s", "/")] * 40
    rs += [("2026-11-02", "v1", "banner_click", pr(platform="baemin"), "", "s", "/")] * 3
    rs += [("2026-11-03", "v2", "banner_click", pr(platform="yogiyo"), "", "s", "/")] * 50
    out = build({"v1": P(), "v2": P()}, rs)
    b, y = out["platformReaction"]["baemin"], out["platformReaction"]["yogiyo"]
    assert b["bannerClickRate"] == 0.075  # 3/40
    assert y["bannerClickRate"] is None   # 노출 0, 클릭이 더 많다 -> 안 그린다
    assert rate(5, 29) is None            # N 30 미만
    assert out["weeklyClicks"][0]["week"] == "2026-11-02"


if __name__ == "__main__":
    demo()
    raise SystemExit(main())
