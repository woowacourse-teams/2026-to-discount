"""배너 유형별 클릭률(최근 N일, 사람 기준)과 저조한 유형 판별.

PostHog 인사이트 "배너 — 장별 노출·클릭·클릭률 (최근 14일, 일별)"과 같은 집계(그날 그 배너를
본 사람, 누른 사람)를 유형으로 묶고, 9/29부터 찍히는 칸(slot)으로 위치 효과를 덜어 낸 배수를 낸다.
결과 해석은 docs/metrics/BANNER-TYPES-20261003.md.

인증과 배너 메타는 banner_order_analysis.py와 같다(POSTHOG_PERSONAL_API_KEY 또는 POSTHOG_KEY_FILE,
운영 배너는 OPS_AUTH_FILE이 있으면 읽는다).

    python scripts/banner_type_analysis.py --days 14
"""
from __future__ import annotations

import argparse, collections, math, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from banner_order_analysis import HOST, PEOPLE, banners, key  # noqa: E402

import json, urllib.request  # noqa: E402


def pull(days: int) -> list:
    sql = f"""SELECT toDate(timestamp) d, toString(properties.banner) b, any(toString(properties.platform)) p,
      min(toInt(properties.slot)) slot,
      count(DISTINCT if(event='banner_impression', distinct_id, NULL)) imp,
      count(DISTINCT if(event='banner_click', distinct_id, NULL)) clk
      FROM events WHERE event IN ('banner_impression','banner_click') AND toString(properties.position)='top'
      AND timestamp >= now() - INTERVAL {days} DAY AND {PEOPLE}
      GROUP BY d, b HAVING imp >= 5 LIMIT 100000"""
    req = urllib.request.Request(
        f"{HOST}/api/projects/@current/query/",
        data=json.dumps({"query": {"kind": "HogQLQuery", "query": sql}}, ensure_ascii=False).encode(),
        headers={"Authorization": "Bearer " + key(), "Content-Type": "application/json; charset=utf-8"})
    return json.loads(urllib.request.urlopen(req, timeout=180).read())["results"]


def kind(bid: str, platform: str, meta: dict) -> str:
    """배너 유형. id 꼴과 플랫폼, 묶음(group) 여부로 가른다."""
    if platform == "own":
        return "자사 행사"
    if bid.startswith("coupangeats-open") or "seonchak" in bid:
        if "릴레이" in bid:
            return "쿠팡 릴레이 선착순"
        grouped = meta.get("group") or re.search(r"open-\d{8}-\d+시$", bid)
        return "쿠팡 선착순 묶음" if grouped else "쿠팡 선착순 단독"
    if "weekly" in bid:
        return "쿠팡 위클리"
    if "random" in bid:
        return "쿠팡 랜덤"
    return {"coupangeats": "쿠팡 기타", "baemin": "배민 핫딜·특가", "ddangyo": "땡겨요",
            "yogiyo": "요기요"}.get(platform, f"기타({platform})")


def won(meta: dict) -> int | None:
    """배너 금액(원). 옛 모양 문장 금액("6/5천원")은 가장 큰 값."""
    a = meta.get("amount")
    if isinstance(a, dict):
        a = a.get("won") or a.get("max")
    if isinstance(a, str):
        nums = [int(x.replace(",", "")) for x in re.findall(r"\d[\d,]*", a)]
        a = max(nums) if nums else None
        if a is not None and a < 100:
            a *= 1000
    return a if isinstance(a, int) else None


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return 0.0, 0.0
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    r = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (c - r) / d, (c + r) / d


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    args = ap.parse_args()
    rows, meta = pull(args.days), banners()

    # 칸 클릭률: 1~5번은 그대로, 6번부터는 한 칸으로 묶는다(표본이 작다).
    slot = collections.defaultdict(lambda: [0, 0])
    for _d, _b, _p, s, imp, clk in rows:
        if s is not None:
            slot[min(int(s), 6)][0] += imp
            slot[min(int(s), 6)][1] += clk
    rate = {s: c / i for s, (i, c) in slot.items() if i}

    t = collections.defaultdict(lambda: {"ban": set(), "imp": 0, "clk": 0, "exp": 0.0, "simp": 0, "sclk": 0})
    per = collections.defaultdict(lambda: [0, 0, "", None])
    for _d, b, p, s, imp, clk in rows:
        m = meta.get(b, {})
        k = kind(b, p, m)
        x = t[k]
        x["ban"].add(b); x["imp"] += imp; x["clk"] += clk
        if s is not None:
            x["exp"] += imp * rate[min(int(s), 6)]; x["simp"] += imp; x["sclk"] += clk
        per[b][0] += imp; per[b][1] += clk; per[b][2] = k; per[b][3] = won(m)

    all_imp = sum(x["imp"] for x in t.values())
    all_clk = sum(x["clk"] for x in t.values())
    print(f"최근 {args.days}일, 배너-일 {len(rows)}행, 전체 클릭률 {all_clk / all_imp * 100:.2f}%")
    print("칸별 클릭률:", {s: f"{r * 100:.1f}%" for s, r in sorted(rate.items())})
    print("| 유형 | 배너 | 본 사람 | 누른 사람 | 클릭률 [95% 구간] | 칸 보정 배수(칸 있는 날만) |")
    print("|---|---|---|---|---|---|")
    for k, x in sorted(t.items(), key=lambda kv: -kv[1]["clk"] / max(kv[1]["imp"], 1)):
        lo, hi = wilson(x["clk"], x["imp"])
        adj = f"{x['sclk'] / x['exp']:.2f} (본 사람 {x['simp']})" if x["exp"] else "-"
        print(f"| {k} | {len(x['ban'])} | {x['imp']} | {x['clk']} | "
              f"{x['clk'] / x['imp'] * 100:.2f}% [{lo * 100:.1f}~{hi * 100:.1f}] | {adj} |")
    bands = collections.defaultdict(lambda: [0, 0, 0])
    for imp, clk, _k, a in per.values():
        band = ("금액 모름" if a is None else "5천원 미만" if a < 5000 else
                "5천~7천원 미만" if a < 7000 else "7천원 이상")
        bands[band][0] += imp; bands[band][1] += clk; bands[band][2] += 1
    for band, (imp, clk, n) in bands.items():
        print(f"금액 {band}: 배너 {n}장, {clk}/{imp} = {clk / imp * 100:.2f}%")
    print("본 사람 100명 이상 중 클릭률 하위 10장:")
    low = sorted((kv for kv in per.items() if kv[1][0] >= 100), key=lambda kv: kv[1][1] / kv[1][0])[:10]
    for b, (imp, clk, k, a) in low:
        print(f"  {b} [{k}] {clk}/{imp} = {clk / imp * 100:.2f}% 금액 {a}")


if __name__ == "__main__":
    main()
