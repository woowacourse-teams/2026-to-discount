#!/usr/bin/env python3
"""Vercel 사용량(Edge Requests 등)을 날짜별로 받아 저장소에 쌓는다.

  scripts/vercel_usage.py fetch                    # 최근 30일을 받아온다
  scripts/vercel_usage.py fetch --days 60 --apply  # 실제로 기록한다
  scripts/vercel_usage.py record 2026-09-07 "Edge Requests" 41200 --apply
  scripts/vercel_usage.py report                   # 쌓인 것을 표로
  scripts/vercel_usage.py report --around 2026-09-07  # 그날 전후 비교

## 왜 필요한가

2026-09-07에 Vercel Edge Requests가 30일 롤링 한도의 93%(934,483/1,000,000)에
닿아 캐시 헤더·robots·sitemap·PostHog 프록시를 손봤다. 그런데 **줄었는지를
우리가 못 봤다.**

우리 원장은 JS를 실행하는 방문자만 센다. 크롤러 대부분은 HTML만 받아가고,
정적 자산 재검증 요청은 아예 이벤트가 아니다 — 정작 한도를 채운 것이 그
둘인데 둘 다 원장 밖이다. Vercel Web Analytics는 GA4로 갈아타며 껐다
(ADR-002). **줄이려던 것을 재는 눈이 없었다.**

이 스크립트가 그 눈이다. 받아온 값은 `docs/metrics/vercel-usage.jsonl`에
append-only로 쌓는다 — 원장과 같은 방식이다. API는 1년치만 주고 한도는
30일 롤링이라 지나가면 되돌릴 수 없으므로, 받은 날 그대로 남긴다.

## 두 가지 경로

  fetch   API에서 받는다. `GET /v1/billing/charges` (FOCUS v1.3 JSONL).
          Owner·Member·Billing 역할이면 된다고 문서에 적혀 있지만 요금제에
          따라 403/410이 날 수 있다 — 그러면 아래 record를 쓴다.
  record  대시보드에서 눈으로 읽은 수를 같은 파일에 적는다. 손으로 적은
          값은 `source: "manual"`로 남아 API 값과 섞이지 않는다.

둘 다 같은 파일에 쌓이므로 report는 어느 쪽이든 읽는다. 자동이 막혀도
지표가 끊기지 않게 하는 것이 목적이다.

## 인증

Personal Access Token을 `VERCEL_TOKEN` 환경변수나 `~/.vercel_token` 파일에
둔다. 저장소 밖이라 실수로 커밋될 수 없다 — `~/.posthog_key`와 같은 방식이다.
팀은 `VERCEL_TEAM_ID`(team_... 또는 slug).
"""
import argparse
import collections
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HOST = os.environ.get("VERCEL_API", "https://api.vercel.com")
TOKEN_VAR = "VERCEL_TOKEN"
TOKEN_FILE = os.environ.get("VERCEL_TOKEN_FILE",
                            os.path.expanduser("~/.vercel_token"))
TEAM = os.environ.get("VERCEL_TEAM_ID", "")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, "docs", "metrics", "vercel-usage.jsonl")

# 한도가 걸리는 항목. 이름이 요금제마다 조금씩 달라 부분일치로 본다.
WATCH = ("edge request", "fast data transfer", "function invocation",
         "fast origin transfer", "image optimization")


def token():
    value = os.environ.get(TOKEN_VAR)
    if value:
        return value.strip()
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    raise SystemExit(
        "Vercel 토큰이 없다.\n"
        "  1) https://vercel.com/account/tokens 에서 만들고\n"
        "  2) %s 에 넣거나 %s 환경변수로 준다\n"
        "  3) 팀이 있으면 VERCEL_TEAM_ID도 같이 준다\n"
        "토큰 없이 지금 있는 기록만 보려면: report" % (TOKEN_FILE, TOKEN_VAR))


def charges(start, end, tok):
    """FOCUS 청구 데이터를 JSONL로 받는다. 한 줄이 하나의 charge다."""
    params = {"from": start.isoformat() + "T00:00:00Z",
              "to": end.isoformat() + "T00:00:00Z"}
    if TEAM:
        params["teamId" if TEAM.startswith("team_") else "slug"] = TEAM
    url = "%s/v1/billing/charges?%s" % (HOST, urllib.parse.urlencode(params))
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok})
    try:
        with urllib.request.urlopen(req) as res:
            for line in res:
                line = line.strip()
                if line:
                    yield json.loads(line)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:400]
        hint = ""
        if e.code in (403, 410):
            hint = ("\n이 요금제·역할에서는 청구 API가 안 열리는 것 같다. "
                    "대시보드 Usage에서 눈으로 읽고 record로 적어라:\n"
                    "  scripts/vercel_usage.py record <날짜> \"Edge Requests\" <수> --apply")
        elif e.code == 401:
            hint = "\n토큰이 틀렸거나 만료됐다."
        raise SystemExit("GET /v1/billing/charges -> %d\n%s%s" % (e.code, body, hint))


def load_store():
    if not os.path.exists(STORE):
        return []
    rows = []
    with open(STORE, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    continue
    return rows


def append(rows, apply_):
    """append-only. 같은 (날짜, 항목, 프로젝트, 출처)는 덮지 않고 건너뛴다.

    덮어쓰기를 안 하는 이유는 원장과 같다 — 나중에 값이 달라지면 그 사실
    자체가 정보이고, 지워 버리면 왜 달랐는지 못 따진다. 대신 이미 있는
    것은 다시 안 적는다.
    """
    seen = {(r.get("date"), r.get("service"), r.get("project"), r.get("source"))
            for r in load_store()}
    fresh = [r for r in rows
             if (r["date"], r["service"], r["project"], r["source"]) not in seen]
    if apply_ and fresh:
        os.makedirs(os.path.dirname(STORE), exist_ok=True)
        with open(STORE, "a", encoding="utf-8") as fh:
            for r in fresh:
                fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
    return fresh


def cmd_fetch(args):
    tok = token()
    end = datetime.date.today() + datetime.timedelta(days=1)
    start = end - datetime.timedelta(days=args.days)
    got = collections.defaultdict(float)
    units = {}
    seen_services = set()

    for c in charges(start, end, tok):
        if c.get("ChargeCategory") != "Usage":
            continue
        name = (c.get("ServiceName") or "").strip()
        seen_services.add(name)
        if args.all is False and not any(w in name.lower() for w in WATCH):
            continue
        qty = c.get("ConsumedQuantity")
        if qty is None:
            continue
        day = (c.get("ChargePeriodStart") or "")[:10]
        if not day:
            continue
        tags = c.get("Tags") or {}
        project = tags.get("ProjectName") or tags.get("ProjectId") or "(팀 전체)"
        got[(day, name, project)] += float(qty)
        units[name] = c.get("ConsumedUnit") or ""

    rows = [{"date": d, "service": s, "project": p, "quantity": round(q, 4),
             "unit": units.get(s, ""), "source": "api",
             "recorded_at": datetime.date.today().isoformat()}
            for (d, s, p), q in sorted(got.items())]

    if not rows:
        print("받아온 사용량 행이 없다.")
        if seen_services:
            print("이 기간에 온 ServiceName:", ", ".join(sorted(seen_services)) or "(없음)")
            print("--all 로 전부 받아 볼 수 있다.")
        return 0

    fresh = append(rows, args.apply)
    print("%d행 받음 / 새로 쌓을 것 %d행%s"
          % (len(rows), len(fresh), "" if args.apply else "  (미리보기 — --apply)"))
    show(rows)
    return 0


def cmd_record(args):
    row = {"date": args.date, "service": args.service, "project": args.project,
           "quantity": float(args.quantity), "unit": args.unit,
           "source": "manual", "recorded_at": datetime.date.today().isoformat()}
    fresh = append([row], args.apply)
    if not fresh:
        print("이미 같은 값이 있다 — 안 적었다.")
        return 0
    print("%s %s %s = %s%s" % (row["date"], row["project"], row["service"],
                               fmt(row["quantity"]),
                               "" if args.apply else "  (미리보기 — --apply)"))
    return 0


def fmt(n):
    return "{:,.0f}".format(n) if n >= 1000 else "{:,.2f}".format(n).rstrip("0").rstrip(".")


def show(rows):
    by_service = collections.defaultdict(list)
    for r in rows:
        by_service[r["service"]].append(r)
    for service in sorted(by_service):
        items = sorted(by_service[service], key=lambda r: r["date"])
        unit = items[0].get("unit") or ""
        total = sum(r["quantity"] for r in items)
        print()
        print("== %s (%s) — 합계 %s ==" % (service, unit or "단위 미상", fmt(total)))
        for r in items[-14:]:
            print("  %s  %-22s %12s" % (r["date"], r["project"][:22], fmt(r["quantity"])))


def cmd_report(args):
    rows = load_store()
    if not rows:
        raise SystemExit(
            "쌓인 기록이 없다. fetch --apply 로 받아오거나 record 로 적어라.\n"
            "파일: %s" % STORE)
    if args.service:
        rows = [r for r in rows if args.service.lower() in r["service"].lower()]

    if not args.around:
        show(rows)
        print()
        print("파일: %s (%d행)" % (STORE, len(load_store())))
        return 0

    # 전후 비교. 그날은 양쪽 어디에도 안 넣는다 — 바뀌는 중인 날이라
    # 어느 쪽으로 세도 틀린다.
    pivot = args.around
    by_service = collections.defaultdict(lambda: ([], []))
    for r in rows:
        if r["date"] < pivot:
            by_service[r["service"]][0].append(r["quantity"])
        elif r["date"] > pivot:
            by_service[r["service"]][1].append(r["quantity"])

    print("기준일 %s 전후 — 하루 평균 (그날 자체는 뺀다)" % pivot)
    print()
    print("%-26s %10s %10s %10s %9s" % ("항목", "전(일평균)", "후(일평균)", "차이", "변화"))
    for service in sorted(by_service):
        before, after = by_service[service]
        if not before or not after:
            print("%-26s %10s %10s %10s %9s"
                  % (service[:26],
                     fmt(sum(before) / len(before)) if before else "—",
                     fmt(sum(after) / len(after)) if after else "—",
                     "—", "한쪽 없음"))
            continue
        b = sum(before) / len(before)
        a = sum(after) / len(after)
        pct = (a - b) / b * 100 if b else 0
        print("%-26s %10s %10s %10s %8.1f%%"
              % (service[:26], fmt(b), fmt(a), fmt(a - b), pct))
    print()
    print("전 %d일치 / 후 %d일치."
          % (len({r["date"] for r in rows if r["date"] < pivot}),
             len({r["date"] for r in rows if r["date"] > pivot})))
    print("날수가 한쪽으로 크게 치우쳐 있으면 평균 비교를 믿지 마라.")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch", help="Vercel API에서 받아온다")
    f.add_argument("--days", type=int, default=30)
    f.add_argument("--all", action="store_true", help="한도 항목 말고 전부")
    f.add_argument("--apply", action="store_true", help="실제로 기록한다")
    f.set_defaults(fn=cmd_fetch)

    r = sub.add_parser("record", help="대시보드에서 읽은 수를 적는다")
    r.add_argument("date", help="YYYY-MM-DD")
    r.add_argument("service", help='예: "Edge Requests"')
    r.add_argument("quantity", type=float)
    r.add_argument("--project", default="delivery-discount-web")
    r.add_argument("--unit", default="requests")
    r.add_argument("--apply", action="store_true")
    r.set_defaults(fn=cmd_record)

    o = sub.add_parser("report", help="쌓인 것을 본다")
    o.add_argument("--service", help="이 말이 든 항목만")
    o.add_argument("--around", help="이 날짜 전후를 비교한다 (YYYY-MM-DD)")
    o.set_defaults(fn=cmd_report)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
