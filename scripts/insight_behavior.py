"""/insight E 구역(사용자 반응)에 쓸 집계를 JSON 한 장으로 만든다.

  python3 scripts/insight_behavior.py --out behavior.json [--src 원장.jsonl]

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
TOP_BRANDS = 30
PLATFORMS = ("baemin", "coupangeats", "yogiyo", "ddangyo")
CLICKS = ("offer_link_click", "banner_click")  # 앱으로 나가는 길(experiments.GOAL)
# 브랜드 clicks는 카드 칩(offer_link_click)만 센다. 분모가 카드 노출이라 배너 클릭을 섞으면 비율이 부푼다.


def rate(num, den):
    """N이 작거나 분자가 분모를 넘으면 그리지 않는다(null)."""
    if den < MIN_N or num > den:
        return None
    return round(num / den, 4)


def build(people, rows, args=None):
    args = args or sn.base_args()
    week_click = collections.defaultdict(collections.Counter)
    week_brand = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))  # 주 -> 앱|all -> 브랜드 -> 카드 칩 클릭
    plat = {p: collections.defaultdict(int) for p in PLATFORMS}
    clickers = {p: set() for p in PLATFORMS}
    seen = collections.defaultdict(set)  # 깔때기: 단계 -> 방문자
    days = []
    brand = collections.defaultdict(lambda: collections.defaultdict(int))
    brand_clickers = collections.defaultdict(set)
    for day, vid, ev, props, _ts, _sid, _path in rows:
        if not ex.keep(people[vid], args):
            continue
        days.append(day)
        pr = props if isinstance(props, dict) else {}
        p = pr.get("platform")
        if ev in ("page_view", "brand_impression"):
            seen[ev].add(vid)
        b = pr.get("brand")
        if b and b != "none":  # 브랜드 없는 배너는 앱 합계에만 센다(bannerProps가 "none"을 채운다)
            key = {"brand_impression": "impressions", "brand_expand": "expands",
                   "offer_link_click": "clicks", "banner_click": "bannerClicks"}.get(ev)
            if ev == "cart_toggle" and pr.get("state") == "add":
                key = "cartAdds"
            if key:
                brand[b][key] += 1
            if ev == "offer_link_click":
                brand_clickers[b].add(vid)
                wk = sn.week_of(day).isoformat()
                if p in plat:  # 앱 합(all)과 앱별이 어긋나지 않게 네 앱의 클릭만 센다
                    week_brand[wk]["all"][b] += 1
                    week_brand[wk][p][b] += 1
        if ev in CLICKS:
            seen["click"].add(vid)
        if p not in plat:
            continue
        if ev in CLICKS:
            week_click[sn.week_of(day).isoformat()][p] += 1
            clickers[p].add(vid)
            plat[p]["clicks"] += 1
        key = {"banner_impression": "bannerImpressions", "banner_click": "bannerClicks",
               "banner_dismiss": "bannerDismisses"}.get(ev)
        if key:
            plat[p][key] += 1

    out_plat = {}
    for p in PLATFORMS:
        d = plat[p]
        out_plat[p] = {
            "clicks": d["clicks"], "clickers": len(clickers[p]),
            "bannerImpressions": d["bannerImpressions"], "bannerClicks": d["bannerClicks"],
            "bannerDismisses": d["bannerDismisses"],
            "bannerClickRate": rate(d["bannerClicks"], d["bannerImpressions"]),
            "bannerDismissRate": rate(d["bannerDismisses"], d["bannerImpressions"]),
        }
    top = sorted(brand, key=lambda b: -brand[b]["clicks"])[:TOP_BRANDS]
    brands = [{"brand": b, "clicks": brand[b]["clicks"], "clickers": len(brand_clickers[b]),
               "impressions": brand[b]["impressions"], "expands": brand[b]["expands"],
               "bannerClicks": brand[b]["bannerClicks"], "cartAdds": brand[b]["cartAdds"],
               "clickRate": rate(brand[b]["clicks"], brand[b]["impressions"])} for b in top]
    def top1(c):
        if not c:
            return None
        b, n = max(sorted(c.items()), key=lambda kv: kv[1])  # 같으면 이름순 앞
        return {"brand": b, "clicks": n}

    total_brand = collections.defaultdict(collections.Counter)  # 앱|all -> 브랜드 -> 전체 기간 카드 칩 클릭
    for per in week_brand.values():
        for k, c in per.items():
            total_brand[k].update(c)
    weeks = [{"week": w, "byPlatform": {p: c.get(p, 0) for p in PLATFORMS},
              "topBrands": {k: top1(week_brand[w][k]) for k in ("all",) + PLATFORMS}}
             for w, c in sorted(week_click.items())]
    funnel = [{"step": s, "visitors": len(seen[k])} for s, k in (
        ("방문", "page_view"), ("브랜드 노출", "brand_impression"),
        ("앱으로 이동", "click"))]  # 펼침은 뺀다: 칩을 바로 눌러 나가는 길이 있어 단계가 겹치지 않는다
    return {
        "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "range": {"from": min(days) if days else None, "to": max(days) if days else None},
        "minN": MIN_N, "platforms": list(PLATFORMS),
        "weeklyClicks": weeks,
        "topBrandsTotal": {k: top1(total_brand[k]) for k in ("all",) + PLATFORMS},
        "platformReaction": out_plat, "brands": brands, "funnel": funnel,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", help="원장 파일. 없으면 서버에서 받는다")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if not a.src:
        # ex.fetch는 캐시가 있으면 다시 안 받는다. 낡은 원장에 새 generatedAt을 붙여 내보내지 않는다.
        stale = os.path.join(os.path.dirname(os.path.abspath(ex.__file__)), ".events.jsonl")
        if os.path.exists(stale):
            os.remove(stale)
    people, rows = ex.load(ex.fetch(a.src))
    report = build(people, rows)
    tmp = a.out + ".tmp"  # API가 이 파일을 읽는다. 다 쓴 뒤 바꿔 끼워 반쪽 파일을 보이지 않는다.
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, a.out)
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
    assert "appOpenRate" not in b  # 앱 열림 성공률은 싣지 않는다(사용자 결정 11-18)
    rs2 = [("2026-11-02", "v1", "brand_impression", pr(brand="bhc"), "", "s", "/")] * 40
    rs2 += [("2026-11-02", "v1", "offer_link_click", pr(brand="bhc", platform="baemin"), "", "s", "/")] * 4
    top = build({"v1": P()}, rs2)["brands"][0]
    assert (top["brand"], top["clicks"], top["clickRate"]) == ("bhc", 4, 0.1)
    rs3 = rs2 + [("2026-11-02", "v9", "banner_click", pr(brand="bhc", platform="baemin"), "", "s", "/"),
                 ("2026-11-02", "v9", "banner_click", pr(brand="none", platform="baemin"), "", "s", "/")]
    out3 = build({"v1": P(), "v9": P()}, rs3)
    assert [b["brand"] for b in out3["brands"]] == ["bhc"]      # "none"은 순위에 없다
    assert out3["brands"][0]["clickers"] == 1                    # 배너만 누른 사람은 안 센다
    tb = out3["weeklyClicks"][0]["topBrands"]                     # 배너 클릭(v9)은 주간 1등 브랜드에 안 센다
    assert out3["topBrandsTotal"]["all"] == {"brand": "bhc", "clicks": 4}   # 전체 기간 1등
    assert tb["all"] == {"brand": "bhc", "clicks": 4} and tb["baemin"] == tb["all"] and tb["yogiyo"] is None


if __name__ == "__main__":
    demo()
    raise SystemExit(main())
