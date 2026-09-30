#!/usr/bin/env python3
"""배너 순서(캐러셀 칸)가 노출과 클릭에 주는 효과를 재현 가능하게 잰다.

  python scripts/banner_order_analysis.py            # 표만 찍는다
  python scripts/banner_order_analysis.py --boot 500 # 부트스트랩 횟수

입력
  PostHog banner_impression·banner_click (시간대별, position=top)
  beggars-ops/archive/banners-*.yml + 운영 /ops/banners (시간대별 순서 복원)
인증은 posthog_dashboards.py와 같다(POSTHOG_PERSONAL_API_KEY 또는 ~/.posthog_key).
운영 파일은 ~/.ops_auth(아이디:비밀번호)로 읽는다. 없으면 보관 파일만 쓴다.

세 가지를 잰다.
  1. 노출 도달: 같은 시각 1번 칸 대비 각 칸의 노출.
  2. 순진한 클릭률: 칸 묶음별. 배너 내용이 섞여 있어 위치 효과를 과장하거나 가린다.
  3. 배너 고정효과: 클릭 ~ Poisson(노출 x 배너 x 칸). 같은 배너가 여러 칸에 섰던 시각만
     칸 효과를 가른다. 배너를 부트스트랩으로 다시 뽑아 구간을 낸다.

한계는 docs/metrics/BANNER-ORDER-20260930.md. 순서 복원이 1칸 어긋날 수 있어 칸 효과는
0쪽으로 깎여 나온다(측정오차 감쇠).
"""
import argparse, base64, collections, datetime, glob, json, math, os, random, sys, urllib.request

import yaml

HOST = "https://us.i.posthog.com"
ARCHIVE = os.environ.get("BANNER_ARCHIVE", os.path.expanduser("~/_dev/beggars-ops/archive"))
OPS = "https://bebeggars.duckdns.org/ops/banners"
PEOPLE = ("toString(person_id) NOT IN (SELECT person_id FROM static_cohort_people WHERE cohort_id IN "
          "(464290,500325)) AND properties.bot IS NULL AND properties.dev IS NULL")
BUCKETS = ["1", "2-3", "4-6", "7+"]
DT = datetime.datetime


def bucket(s):
    return "1" if s == 1 else "2-3" if s <= 3 else "4-6" if s <= 6 else "7+"


def key():
    k = os.environ.get("POSTHOG_PERSONAL_API_KEY")
    return k.strip() if k else open(os.path.expanduser("~/.posthog_key")).read().strip()


def pull(days):
    sql = f"""SELECT toStartOfHour(toTimeZone(timestamp,'Asia/Seoul')) h, toString(properties.banner) b,
      toString(properties.platform) p, countIf(event='banner_impression') imp, countIf(event='banner_click') clk
      FROM events WHERE event IN ('banner_impression','banner_click') AND properties.position='top'
      AND timestamp >= now() - INTERVAL {days} DAY AND {PEOPLE} GROUP BY h,b,p LIMIT 100000"""
    req = urllib.request.Request(
        f"{HOST}/api/projects/@current/query/",
        data=json.dumps({"query": {"kind": "HogQLQuery", "query": sql}}, ensure_ascii=False).encode(),
        headers={"Authorization": "Bearer " + key(), "Content-Type": "application/json; charset=utf-8"})
    return json.loads(urllib.request.urlopen(req, timeout=180).read())["results"]


def banners():
    by = {}
    for p in sorted(glob.glob(os.path.join(ARCHIVE, "banners-*.yml"))):
        for b in yaml.safe_load(open(p, encoding="utf-8"))["banners"] or []:
            by[b["id"]] = b
    auth = os.path.expanduser("~/.ops_auth")
    if os.path.exists(auth):
        tok = base64.b64encode(open(auth).read().strip().encode()).decode()
        req = urllib.request.Request(OPS, headers={"Authorization": "Basic " + tok})
        for b in json.loads(urllib.request.urlopen(req, timeout=30).read())["banners"]:
            by[b["id"]] = b
    return by


def ts(v, end):
    if v is None:
        return None
    if isinstance(v, datetime.datetime):
        return v
    t = str(v)
    if isinstance(v, datetime.date) or len(t) == 10:
        d = v if isinstance(v, datetime.date) else datetime.date.fromisoformat(t)
        return DT(d.year, d.month, d.day, 23, 59, 59) if end else DT(d.year, d.month, d.day)
    return DT.fromisoformat(t)


def order_at(by, now):
    """BannerCatalog.active와 같은 순서: priority(기본 999), 종료 시각, id. 묶음은 한 장."""
    act = []
    for b in by.values():
        s, e = ts(b.get("startsAt") or b.get("startsOn"), False), ts(b.get("endsAt") or b.get("endsOn"), True)
        if s and e and s <= now <= e:
            act.append((b, e))
    gp = {}
    for b, _ in act:
        if b.get("group"):
            gp[b["group"]] = min(gp.get(b["group"], 999), b.get("priority", 999))
    act.sort(key=lambda x: (gp[x[0]["group"]] if x[0].get("group") else x[0].get("priority", 999), str(x[1]), x[0]["id"]))
    out, seen, i = {}, set(), 0
    for b, _ in act:
        g = b.get("group")
        if g and g in seen:
            out[b["id"]] = i
            continue
        if g:
            seen.add(g)
        i += 1
        out[b["id"]] = i
    return out


def fixed_effects(cells, iters=200):
    """clk_bs ~ Poisson(imp_bs * a_b * g_s). 교대 최대우도. g는 1번 칸을 1로 맞춘다."""
    g = {s: 1.0 for s in BUCKETS}
    a = {}
    for _ in range(iters):
        for b, cs in cells.items():
            den = sum(imp * g[s] for s, (imp, clk) in cs.items())
            a[b] = sum(clk for imp, clk in cs.values()) / den if den else 0
        for s in BUCKETS:
            num = sum(cs[s][1] for cs in cells.values() if s in cs)
            den = sum(cs[s][0] * a[b] for b, cs in cells.items() if s in cs)
            g[s] = num / den if den else g[s]
        base = g["1"] or 1
        g = {s: v / base for s, v in g.items()}
    return g


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--boot", type=int, default=300)
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    by = banners()
    rows = pull(args.days)
    cache, cells = {}, collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0]))
    hour = collections.defaultdict(lambda: collections.defaultdict(int))
    for h, b, p, imp, clk in rows:
        k = h[:19]
        if k not in cache:
            cache[k] = order_at(by, DT.fromisoformat(k))
        s = cache[k].get(b)
        if not s:
            continue
        c = cells[b][bucket(s)]
        c[0] += imp
        c[1] += clk
        hour[k][s] += imp
    print(f"## 표본: 배너 {len(cells)}장, 노출 {sum(c[0] for cs in cells.values() for c in cs.values())}\n")

    print("## 1. 노출 도달 (같은 시각 1번 칸 대비)")
    ratio = collections.defaultdict(list)
    for m in hour.values():
        if m.get(1, 0) >= 30:
            for s, v in m.items():
                ratio[s].append(v / m[1])
    for s in sorted(ratio)[:8]:
        print(f"  {s}번 칸  {sum(ratio[s]) / len(ratio[s]):.2f}  (시간대 {len(ratio[s])}개)")

    print("\n## 2. 순진한 클릭률")
    tot = {s: [0, 0] for s in BUCKETS}
    for cs in cells.values():
        for s, (i, c) in cs.items():
            tot[s][0] += i
            tot[s][1] += c
    for s in BUCKETS:
        i, c = tot[s]
        print(f"  {s:4} 노출 {i:6} 클릭 {c:4}  {c / i * 100 if i else 0:.2f}%")

    multi = {b: cs for b, cs in cells.items() if len(cs) >= 2}
    print(f"\n## 3. 배너 고정효과 (1번 칸 = 1.00, 같은 배너가 둘 이상 칸에 선 {len(multi)}장만)")
    g = fixed_effects(multi)
    random.seed(1)
    names = list(multi)
    boots = {s: [] for s in BUCKETS}
    for _ in range(args.boot):
        pick = {f"{i}:{n}": multi[random.choice(names)] for i, n in enumerate(names)}
        for s, v in fixed_effects(pick, 60).items():
            boots[s].append(v)
    for s in BUCKETS:
        xs = sorted(boots[s])
        lo, hi = xs[int(len(xs) * .025)], xs[int(len(xs) * .975) - 1]
        print(f"  {s:4} {g[s]:.2f}  [{lo:.2f}~{hi:.2f}]")
    print("  구간이 1.00을 품으면 칸 효과가 있다고 못 한다.")


if __name__ == "__main__":
    main()
