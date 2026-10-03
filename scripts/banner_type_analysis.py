"""배너 유형별 클릭률(최근 N일)과 배너를 세울 기준의 근거.

두 갈래로 센다.
  - 사람 기준: 기간 전체에서 그 배너(또는 그 유형의 배너)를 본 고유 사용자와 누른 고유 사용자.
    날짜별로 더하지 않으므로 같은 사람이 여러 날 봐도 한 번이다. 고유 사용자가 --min-users
    미만인 배너는 판정에서 뺀다.
  - 위치 보정: 시간대별 노출, 클릭(이벤트 수)에 그 시각의 칸을 붙여 칸별 평균 클릭률로 기대
    클릭을 내고, 실제를 기대로 나눈다. 칸은 9/29부터 찍힌 `slot`을 쓰고, 그 전은 배너 보관
    파일과 운영 파일로 그 시각의 순서를 복원한다(banner_order_analysis.order_at, 9/29~30 실측
    대조 72% 일치, 어긋나면 1칸).

금액대 비교에서는 원 단위가 아닌 금액("1+1", "n%")을 뺀다. 결과 해석은
docs/metrics/BANNER-TYPES-20261003.md.

인증과 배너 메타는 banner_order_analysis.py와 같다(POSTHOG_PERSONAL_API_KEY 또는 POSTHOG_KEY_FILE,
운영 배너는 OPS_AUTH_FILE이 있으면 읽는다).

    python scripts/banner_type_analysis.py --days 14 --min-users 100
"""
from __future__ import annotations

import argparse, collections, datetime, json, math, os, re, sys, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from banner_order_analysis import HOST, PEOPLE, banners, bucket, key, order_at, BUCKETS  # noqa: E402


def hogql(sql: str) -> list:
    req = urllib.request.Request(
        f"{HOST}/api/projects/@current/query/",
        data=json.dumps({"query": {"kind": "HogQLQuery", "query": sql}}, ensure_ascii=False).encode(),
        headers={"Authorization": "Bearer " + key(), "Content-Type": "application/json; charset=utf-8"})
    return json.loads(urllib.request.urlopen(req, timeout=300).read())["results"]


TOP = "event IN ('banner_impression','banner_click') AND toString(properties.position)='top'"


def pull_people(days: int) -> list:
    """(사용자, 배너, 플랫폼, 봤나, 눌렀나)."""
    return hogql(f"""SELECT distinct_id, toString(properties.banner) b, any(toString(properties.platform)) p,
      max(event='banner_impression') seen, max(event='banner_click') hit
      FROM events WHERE {TOP} AND timestamp >= now() - INTERVAL {days} DAY AND {PEOPLE}
      GROUP BY distinct_id, b LIMIT 1000000""")


def pull_hours(days: int) -> list:
    """(한국 시각 정시, 배너, 플랫폼, 찍힌 칸, 노출 수, 클릭 수)."""
    return hogql(f"""SELECT toStartOfHour(toTimeZone(timestamp,'Asia/Seoul')) h, toString(properties.banner) b,
      any(toString(properties.platform)) p, min(toInt(properties.slot)) slot,
      countIf(event='banner_impression') imp, countIf(event='banner_click') clk
      FROM events WHERE {TOP} AND timestamp >= now() - INTERVAL {days} DAY AND {PEOPLE}
      GROUP BY h, b LIMIT 1000000""")


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
    """배너 금액(원). 원 단위가 아닌 값("1+1", "n%")은 None — 금액대 비교에서 뺀다."""
    a = meta.get("amount")
    if isinstance(a, dict):
        return a.get("won") if isinstance(a.get("won"), int) else None
    if isinstance(a, int):
        return a
    if isinstance(a, str):
        if "+" in a or "%" in a:
            return None
        nums = [int(x.replace(",", "")) for x in re.findall(r"\d[\d,]*", a)]
        if not nums:
            return None
        v = max(nums)
        return v * 1000 if v < 100 and "천" in a else v
    return None


def band(a: int | None) -> str:
    if a is None:
        return "원 단위 아님·모름"
    return "5천원 미만" if a < 5000 else "5천~7천원 미만" if a < 7000 else "7천~1만원 미만" if a < 10000 else "1만원 이상"


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
    ap.add_argument("--min-users", type=int, default=100, help="판정에 넣을 배너의 최소 고유 사용자(본 사람)")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    meta = banners()

    # ---- 사람 기준 -------------------------------------------------------
    people = pull_people(args.days)
    seen, hit, plat = collections.defaultdict(set), collections.defaultdict(set), {}
    for u, b, p, s, h in people:
        plat[b] = p
        if s:
            seen[b].add(u)
        if h:
            hit[b].add(u)
    keep = {b for b in seen if len(seen[b]) >= args.min_users}
    kinds = {b: kind(b, plat[b], meta.get(b, {})) for b in seen}

    # ---- 위치 보정(칸이 없으면 복원) -------------------------------------
    hours = pull_hours(args.days)
    cache, cell = {}, []
    real = rebuilt = lost = 0
    for h, b, p, slot, imp, clk in hours:
        if slot is not None:
            s = int(slot); real += imp
        else:
            k = h[:19]
            if k not in cache:
                cache[k] = order_at(meta, datetime.datetime.fromisoformat(k))
            s = cache[k].get(b)
            if not s:
                lost += imp
                continue
            rebuilt += imp
        cell.append((b, bucket(s), imp, clk))
    tot = {s: [0, 0] for s in BUCKETS}
    for _b, s, imp, clk in cell:
        tot[s][0] += imp; tot[s][1] += clk
    rate = {s: (c / i if i else 0) for s, (i, c) in tot.items()}
    exp_b, clk_b = collections.defaultdict(float), collections.defaultdict(int)
    for b, s, imp, clk in cell:
        exp_b[b] += imp * rate[s]; clk_b[b] += clk

    print(f"최근 {args.days}일. 고유 사용자 {args.min_users}명 이상 배너 {len(keep)}장 / 전체 {len(seen)}장")
    print(f"칸: 찍힌 칸 노출 {real}, 복원한 칸 노출 {rebuilt}, 복원 못 해 뺀 노출 {lost}")
    print("칸별 클릭률(이벤트):", {s: f"{rate[s] * 100:.2f}%" for s in BUCKETS})

    def summary(group: dict[str, set]) -> None:
        print("| 묶음 | 배너 | 본 고유 사용자 | 누른 고유 사용자 | 클릭률 [95% 구간] | 위치 보정 배수 |")
        print("|---|---|---|---|---|---|")
        rows = []
        for name, bs in group.items():
            v = set().union(*(seen[b] for b in bs))
            c = set().union(*(hit[b] for b in bs)) & v
            e = sum(exp_b[b] for b in bs)
            k = sum(clk_b[b] for b in bs)
            rows.append((name, len(bs), len(v), len(c), (k / e) if e else None))
        for name, nb, nv, nc, adj in sorted(rows, key=lambda r: -(r[3] / max(r[2], 1))):
            lo, hi = wilson(nc, nv)
            a = f"{adj:.2f}" if adj is not None else "-"
            print(f"| {name} | {nb} | {nv} | {nc} | {nc / nv * 100:.2f}% [{lo * 100:.1f}~{hi * 100:.1f}] | {a} |")

    allv = set().union(*(seen[b] for b in keep))
    allc = set().union(*(hit[b] for b in keep)) & allv
    print(f"\n전체(판정 대상): {len(allc)}/{len(allv)} = {len(allc) / len(allv) * 100:.2f}%")
    print("\n## 유형별")
    by_kind = collections.defaultdict(set)
    for b in keep:
        by_kind[kinds[b]].add(b)
    summary(by_kind)
    print("\n## 금액대별(원 단위 아닌 금액 제외)")
    by_band = collections.defaultdict(set)
    for b in keep:
        by_band[band(won(meta.get(b, {})))].add(b)
    summary(by_band)
    print("\n## 배너별 하위 10장")
    rows = sorted(keep, key=lambda b: len(hit[b] & seen[b]) / len(seen[b]))[:10]
    for b in rows:
        e = exp_b[b]
        print(f"  {b} [{kinds[b]}] {len(hit[b] & seen[b])}/{len(seen[b])} = "
              f"{len(hit[b] & seen[b]) / len(seen[b]) * 100:.2f}%, 위치 보정 {clk_b[b] / e:.2f}" if e else "")


if __name__ == "__main__":
    main()
