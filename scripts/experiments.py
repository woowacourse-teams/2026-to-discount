#!/usr/bin/env python3
"""방문 원장(events.jsonl)으로 실험을 세우고 검증한다.

  scripts/experiments.py audit                     # 개발 트래픽 판정과 근거
  scripts/experiments.py daily                     # 일별 방문자·전환율
  scripts/experiments.py segments                  # 차원별 전환율 일람
  scripts/experiments.py compare --by variant      # 갈래별 전환율 + z검정
  scripts/experiments.py compare --by period:2026-08-19 --only returning
  scripts/experiments.py funnel --steps page_view,brand_expand,offer_link_click
  scripts/experiments.py events                    # 이벤트별 도달 인원
  scripts/experiments.py top --event offer_link_click --prop brand
  scripts/experiments.py power --baseline 0.34 --lift 0.15

원장이 없으면 서버에서 받아온다(--src로 로컬 파일 지정 가능).

집계 단위는 방문자다. 한 사람이 여러 번 눌러도 1로 센다 — 2026-08-24
실측에서 b갈래 클릭 115회 중 43회가 한 사람이었고, 1인당 평균만 보면
"b가 두 배 낫다"로 읽혔지만 전환율 차이는 없었다(p=0.89).

개발 트래픽 판정은 이 파일에만 있다. 옛 규칙(desktop이면서 폭 400px
미만)은 안드로이드 폰 사용자 365명을 개발자로 몰아냈다 — device를
matchMedia('(hover: hover)')로 정하는데 일부 안드로이드 브라우저가
hover:hover를 보고하기 때문이다. 지금 규칙은 세션 전체를 봐야 하므로
이벤트 하나만 보는 서버·브라우저 쪽에서는 판정하지 않는다.
"""
import argparse
import collections
import json
import math
import os
import subprocess
import sys

REMOTE_HOST = os.environ.get("EVENTS_HOST", "ubuntu@bebeggars.duckdns.org")
REMOTE_KEY = os.environ.get("EVENTS_KEY", os.path.expanduser("~/key_turbom_v0.key"))
REMOTE_PATH = os.environ.get(
    "EVENTS_PATH", "/home/ubuntu/delivery-discount-api/data/events.jsonl")

GOAL = "offer_link_click"

# 배포 확인이 넣는 붙박이 방문자. 사람이 아니다.
SYNTHETIC = {"v_deploycheck"}

# 창을 조절한 흔적으로 보는 폭. 폰은 세션 내내 폭이 하나다.
DESKTOP_WIDTH = 800


class Visitor:
    __slots__ = ("id", "dev", "widths", "devices", "referrers", "visits",
                 "days", "sessions", "events", "variant", "dwell")

    def __init__(self, vid):
        self.id = vid
        self.dev = False
        self.widths = set()
        self.devices = set()
        self.referrers = set()
        self.visits = 1
        self.days = set()
        self.sessions = set()
        self.events = collections.Counter()
        self.variant = None
        self.dwell = 0

    @property
    def returning(self):
        return self.visits > 1 or len(self.sessions) > 1

    def looks_developer(self):
        """명시 표시가 있거나, 한 세션 안에서 창 크기를 바꿔 가며 봤거나."""
        if self.dev:
            return "명시(?dev=1)"
        if len(self.widths) > 1 and max(self.widths) >= DESKTOP_WIDTH:
            return "창 조절(폭 %s)" % ",".join(str(w) for w in sorted(self.widths))
        return None


def load(src):
    """원장을 방문자 단위로 접는다. 이벤트 원문은 들고 있지 않는다."""
    people = {}
    rows = []  # (날짜, 방문자, 이벤트, props)
    with open(src, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except ValueError:
                continue
            vid = e.get("visitorId")
            if not vid or vid in SYNTHETIC:
                continue
            v = people.get(vid)
            if v is None:
                v = people[vid] = Visitor(vid)
            if e.get("dev") is True:
                v.dev = True
            vp = e.get("viewport") or ""
            if "x" in vp:
                try:
                    v.widths.add(int(vp.split("x")[0]))
                except ValueError:
                    pass
            if e.get("device"):
                v.devices.add(e["device"])
            if e.get("referrer"):
                v.referrers.add(e["referrer"])
            if isinstance(e.get("visitCount"), int):
                v.visits = max(v.visits, e["visitCount"])
            if e.get("sessionId"):
                v.sessions.add(e["sessionId"])
            if e.get("variant") and v.variant is None:
                v.variant = e["variant"]
            if isinstance(e.get("dwellMs"), int):
                v.dwell += e["dwellMs"]
            day = (e.get("ts") or "")[:10]
            v.days.add(day)
            v.events[e.get("event")] += 1
            rows.append((day, vid, e.get("event"), e.get("props") or {}))
    return people, rows


def fetch(src):
    if src:
        return src
    cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".events.jsonl")
    if not os.path.exists(cache):
        print("원장을 받아온다 (%s)" % REMOTE_HOST, file=sys.stderr)
        with open(cache, "wb") as out:
            subprocess.check_call(
                ["scp", "-i", REMOTE_KEY, "-o", "StrictHostKeyChecking=no",
                 "%s:%s" % (REMOTE_HOST, REMOTE_PATH), "/dev/stdout"], stdout=out)
    return cache


# ---- 통계 -------------------------------------------------------------

def ztest(c1, n1, c2, n2):
    """두 비율 차이의 z와 양측 p. 표본이 비면 (0, 1)."""
    if n1 == 0 or n2 == 0:
        return 0.0, 1.0
    p1, p2 = c1 / n1, c2 / n2
    p = (c1 + c2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    if se == 0:
        return 0.0, 1.0
    z = (p2 - p1) / se
    return z, math.erfc(abs(z) / math.sqrt(2))


def wilson(c, n, z=1.96):
    """작은 표본에서도 안 무너지는 신뢰구간. 정규근사는 0%/100%에서 폭이 0이 된다."""
    if n == 0:
        return 0.0, 0.0
    p = c / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, centre - half), min(1.0, centre + half)


def sample_size(baseline, lift, power=0.80, alpha=0.05):
    """갈래당 필요한 사람 수. lift는 상대 변화(0.15 = 15% 개선)."""
    p1 = baseline
    p2 = baseline * (1 + lift)
    if not 0 < p2 < 1:
        return None
    za, zb = 1.959964, 0.841621 if power == 0.80 else 1.281552
    pbar = (p1 + p2) / 2
    num = (za * math.sqrt(2 * pbar * (1 - pbar))
           + zb * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    return math.ceil(num / (p2 - p1) ** 2)


# ---- 집단 나누기 ------------------------------------------------------

def bucket(v, by):
    """방문자를 어떤 이름의 집단에 넣을지. 빈 값이면 집계에서 뺀다."""
    if by == "variant":
        return v.variant
    if by == "returning":
        return "재방문" if v.returning else "신규"
    if by == "device":
        return "/".join(sorted(v.devices)) or None
    if by == "referrer":
        return "/".join(sorted(v.referrers)) or None
    if by == "width":
        return str(min(v.widths)) if v.widths else None
    if by.startswith("period:"):
        # 첫 방문 시점으로 가르는 코호트다. 같은 사람이 양쪽에 걸치지
        # 않으므로 "개편 뒤에 들어온 사람"과 "그 전부터 있던 사람"을
        # 비교한다 — 활동 시점으로 가르는 것과 답하는 질문이 다르다.
        cut = by.split(":", 1)[1]
        return "%s 전 유입" % cut if min(v.days) < cut else "%s 후 유입" % cut
    raise SystemExit("모르는 기준: %s" % by)


def keep(v, args):
    if v.looks_developer() and not args.include_dev:
        return False
    if args.only == "returning" and not v.returning:
        return False
    if args.only == "new" and v.returning:
        return False
    if args.since and max(v.days) < args.since:
        return False
    if args.until and min(v.days) > args.until:
        return False
    return True


def population(people, args):
    return [v for v in people.values() if keep(v, args)]


# ---- 명령 -------------------------------------------------------------

def cmd_audit(people, rows, args):
    reasons = collections.Counter()
    for v in people.values():
        reasons[v.looks_developer() and v.looks_developer().split("(")[0] or "사람"] += 1
    print("전체 방문자 %d명" % len(people))
    for r, n in reasons.most_common():
        print("  %-10s %5d" % (r, n))
    print()
    print("옛 규칙(desktop & 폭<400)이 걸렀을 사람 중 지금 사람으로 보는 수:")
    n = sum(1 for v in people.values()
            if "desktop" in v.devices and v.widths and min(v.widths) < 400
            and not v.looks_developer())
    print("  %d명 — 이들이 안드로이드 폰 사용자다" % n)


def cmd_daily(people, rows, args):
    per = collections.defaultdict(lambda: [set(), set()])
    for day, vid, ev, _ in rows:
        v = people[vid]
        if not keep(v, args):
            continue
        per[day][0].add(vid)
        if ev == args.goal:
            per[day][1].add(vid)
    print("날짜         방문자   전환   전환율")
    for day in sorted(per):
        seen, conv = per[day]
        print("%s  %6d  %5d   %5.1f%%"
              % (day, len(seen), len(conv), len(conv) / len(seen) * 100))


def table(groups, goal_name):
    """집단별 전환율 표와, 가장 큰 두 집단의 z검정."""
    print("집단                방문자   전환    전환율   95%% 구간        (%s)" % goal_name)
    order = sorted(groups.items(), key=lambda kv: -kv[1][0])
    for name, (n, c) in order:
        lo, hi = wilson(c, n)
        print("  %-16s %6d %6d   %5.1f%%   %4.1f~%4.1f%%"
              % (name, n, c, c / n * 100 if n else 0, lo * 100, hi * 100))
    if len(order) >= 2:
        (n1, (a_n, a_c)), (n2, (b_n, b_c)) = order[0], order[1]
        z, p = ztest(a_c, a_n, b_c, b_n)
        verdict = "유의" if p < 0.05 else "판정 불가"
        print("\n  %s vs %s:  z=%.2f  p=%.4f  %s" % (n1, n2, z, p, verdict))
        if p >= 0.05:
            base = a_c / a_n if a_n else 0
            need = sample_size(base, 0.15) if base else None
            if need:
                print("  상대 15%% 차이를 잡으려면 갈래당 %d명 필요 (현재 %d/%d)"
                      % (need, a_n, b_n))


def cmd_compare(people, rows, args):
    groups = collections.defaultdict(lambda: [0, 0])
    for v in population(people, args):
        name = bucket(v, args.by)
        if name is None:
            continue
        groups[name][0] += 1
        if v.events[args.goal]:
            groups[name][1] += 1
    if not groups:
        raise SystemExit("해당하는 방문자가 없다")
    table(dict(groups), args.goal)


def cmd_segments(people, rows, args):
    for by in ("returning", "variant", "device", "referrer"):
        print("== %s ==" % by)
        try:
            cmd_compare(people, rows, argparse.Namespace(**{**vars(args), "by": by}))
        except SystemExit as e:
            print("  %s" % e)
        print()


def cmd_events(people, rows, args):
    pop = {v.id for v in population(people, args)}
    reach = collections.Counter()
    total = collections.Counter()
    for v in people.values():
        if v.id not in pop:
            continue
        for ev, n in v.events.items():
            reach[ev] += 1
            total[ev] += n
    print("이벤트                   도달 인원  전체 건수  1인당")
    for ev, n in reach.most_common():
        print("  %-22s %6d %9d  %5.2f" % (ev, n, total[ev], total[ev] / n))
    print("\n모수 %d명" % len(pop))


def cmd_funnel(people, rows, args):
    steps = args.steps.split(",")
    pop = [v for v in population(people, args)]
    base = len(pop)
    if not base:
        raise SystemExit("해당하는 방문자가 없다")
    # 각 단계는 앞 단계를 모두 거친 사람 중에서만 센다. 그러지 않으면
    # 펼치지 않고 바로 링크로 간 사람 때문에 도달률이 100%를 넘는다.
    print("단계                     도달     전체 대비  직전 대비")
    prev = base
    for s in steps:
        pop = [v for v in pop if v.events[s]]
        n = len(pop)
        print("  %-22s %6d   %6.1f%%   %6.1f%%"
              % (s, n, n / base * 100, n / prev * 100 if prev else 0))
        prev = n


def cmd_top(people, rows, args):
    pop = {v.id for v in population(people, args)}
    seen = collections.defaultdict(set)
    for _, vid, ev, props in rows:
        if ev != args.event or vid not in pop:
            continue
        val = props.get(args.prop)
        if val:
            seen[val].add(vid)
    print("%s의 %s별 도달 인원" % (args.event, args.prop))
    for val, who in sorted(seen.items(), key=lambda kv: -len(kv[1]))[:args.limit]:
        print("  %-24s %5d" % (val, len(who)))


def cmd_power(people, rows, args):
    print("기준 전환율 %.1f%%, 상대 개선 목표별 갈래당 필요 인원 (검정력 80%%)"
          % (args.baseline * 100))
    for lift in (0.05, 0.10, 0.15, 0.20, 0.30, 0.50):
        n = sample_size(args.baseline, lift)
        print("  +%4.0f%%  →  %s명" % (lift * 100, "{:,}".format(n) if n else "불가"))


COMMANDS = {
    "audit": cmd_audit, "daily": cmd_daily, "compare": cmd_compare,
    "segments": cmd_segments, "events": cmd_events, "funnel": cmd_funnel,
    "top": cmd_top, "power": cmd_power,
}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=sorted(COMMANDS))
    p.add_argument("--src", help="원장 파일. 없으면 서버에서 받는다")
    p.add_argument("--by", default="variant", help="compare 기준: variant|returning|device|referrer|width|period:YYYY-MM-DD")
    p.add_argument("--goal", default=GOAL, help="전환으로 볼 이벤트")
    p.add_argument("--only", choices=("returning", "new"), help="이 무리만")
    p.add_argument("--since", help="이 날 이후에도 온 사람만")
    p.add_argument("--until", help="이 날 이전에 처음 온 사람만")
    p.add_argument("--include-dev", action="store_true", help="개발 트래픽도 센다")
    p.add_argument("--steps", default="page_view,brand_expand,offer_link_click")
    p.add_argument("--event", default=GOAL)
    p.add_argument("--prop", default="brand")
    p.add_argument("--limit", type=int, default=15)
    p.add_argument("--baseline", type=float, default=0.34)
    p.add_argument("--lift", type=float, default=0.15)
    args = p.parse_args(argv)

    # 윈도우 콘솔은 기본이 cp949라 한글 출력에서 죽는다.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    if args.command == "power":   # 원장이 필요 없다
        return cmd_power({}, [], args)
    people, rows = load(fetch(args.src))
    COMMANDS[args.command](people, rows, args)


def selftest():
    """계산이 틀리면 여기서 걸린다."""
    z, p = ztest(200, 575, 57, 316)
    assert abs(z + 5.28) < 0.05 and p < 1e-6, (z, p)
    z, p = ztest(50, 200, 52, 200)
    assert p > 0.5, p
    lo, hi = wilson(0, 30)
    assert lo == 0 and 0.05 < hi < 0.2, (lo, hi)
    assert 1300 < sample_size(0.34, 0.15) < 1500, sample_size(0.34, 0.15)
    assert sample_size(0.185, 0.15) > sample_size(0.34, 0.15)

    v = Visitor("x")
    v.widths = {384}
    assert v.looks_developer() is None       # 폰: 폭 하나
    v.widths = {390, 1280}
    assert v.looks_developer()                # 창 조절
    v.widths = {360, 384}
    assert v.looks_developer() is None        # 둘 다 폰 폭이면 사람
    print("ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        main()
