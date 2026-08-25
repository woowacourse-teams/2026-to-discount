#!/usr/bin/env python3
"""방문 원장(events.jsonl)으로 실험을 세우고 검증한다.

  scripts/experiments.py audit                     # 개발 트래픽 판정과 근거
  scripts/experiments.py daily                     # 일별 방문자·전환율
  scripts/experiments.py segments                  # 차원별 전환율 일람
  scripts/experiments.py compare --by variant      # 갈래별 전환율 + z검정
  scripts/experiments.py compare --by period:2026-08-19 --only returning
  scripts/experiments.py paths                     # 실제로 밟은 순서
  scripts/experiments.py funnel --steps brand_expand,offer_link_click
  scripts/experiments.py features                  # 기능별 사용량과 수명
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
    rows = []  # (날짜, 방문자, 이벤트, props, 시각, 세션)
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
            rows.append((day, vid, e.get("event"), e.get("props") or {},
                         e.get("ts") or "", e.get("sessionId") or ""))
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
    for day, vid, ev, _p, _ts, _sid in rows:
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


def median(values):
    """가운데 값. 헤비 유저 한 명에 안 흔들린다."""
    if not values:
        return 0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def table(groups, goal_name):
    """집단별 전환율 표와, 가장 큰 두 집단의 z검정.

    groups는 {이름: (사람 수, 전환한 사람 수, [전환자별 횟수])}.

    전환율만 내면 왜곡은 안 생기지만 왜곡이 있었는지를 눈치챌 단서가
    없다. 애초에 "b가 두 배 낫다"는 오독을 잡아낸 것이 중앙값과 최다
    한 명이었다(2026-08-24: b의 클릭 115회 중 43회가 한 사람).
    """
    print("집단                방문자   전환    전환율   95%% 구간      중앙  최다1명   (%s)"
          % goal_name)
    order = sorted(groups.items(), key=lambda kv: -kv[1][0])
    for name, (n, c, counts) in order:
        lo, hi = wilson(c, n)
        print("  %-16s %6d %6d   %5.1f%%   %4.1f~%4.1f%%  %5g %7d"
              % (name, n, c, c / n * 100 if n else 0, lo * 100, hi * 100,
                 median(counts), max(counts) if counts else 0))
        # 한 사람이 그 집단 전체 행동의 상당 부분을 차지하면 짚어 준다.
        total = sum(counts)
        if counts and max(counts) >= max(3, total * 0.25):
            print("       ! 최다 1명이 이 집단 %s %d회 중 %d회 (%.0f%%)"
                  % (goal_name, total, max(counts), max(counts) / total * 100))
    if len(order) >= 2:
        (n1, (a_n, a_c, _a)), (n2, (b_n, b_c, _b)) = order[0], order[1]
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
    # [사람 수, 전환한 사람 수, 전환자별 횟수]
    #
    # 전환은 사람 단위로 센다 — 한 사람이 43번 눌러도 1이다. 이상치를
    # 골라 빼는 대신 배제가 필요 없는 단위로 세면, 누구를 이상치로 볼지
    # 정하는 판단(그 자체로 편향이다)을 안 해도 된다.
    #
    # 횟수는 버리지 않고 따로 들고 있다가 분포 진단으로 낸다.
    groups = collections.defaultdict(lambda: [0, 0, []])
    for v in population(people, args):
        name = bucket(v, args.by)
        if name is None:
            continue
        groups[name][0] += 1
        hits = v.events[args.goal]
        if hits:
            groups[name][1] += 1
            groups[name][2].append(hits)
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


def sequences(rows, pop, scope):
    """(사람 또는 세션)마다 시각순 이벤트 목록. 연속 중복은 접는다."""
    bucket = collections.defaultdict(list)
    for _day, vid, ev, _props, ts, sid in rows:
        if vid not in pop:
            continue
        bucket[vid if scope == "visitor" else (vid, sid)].append((ts, ev))
    out = {}
    for key, items in bucket.items():
        seq = []
        for _ts, ev in sorted(items):
            if not seq or seq[-1] != ev:
                seq.append(ev)
        out[key] = seq
    return out


def cmd_funnel(people, rows, args):
    """단계를 시각순으로 밟은 사람만 다음 단계로 넘긴다.

    순서를 안 보면 흐름이 아니라 교집합이 된다 — 링크를 먼저 누르고
    나중에 분류를 바꾼 사람까지 통과했다. 실측에서 마지막 단계가
    139명(순서 무시) 대 81명(시각순) 대 44명(같은 세션)으로 갈렸다.

    기본 범위가 세션인 이유: 몇 주에 걸친 행동을 한 흐름으로 묶으면
    이어서 한 일이 아닌 것을 이어진 것으로 센다.
    """
    steps = args.steps.split(",")
    pop = {v.id for v in population(people, args)}
    if not pop:
        raise SystemExit("해당하는 방문자가 없다")
    seqs = sequences(rows, pop, args.scope)
    base = len(seqs)
    unit = "방문자" if args.scope == "visitor" else "세션"

    alive = list(seqs.values())
    print("단계                     도달     전체 대비  직전 대비   (모수 %d %s)"
          % (base, unit))
    prev = base
    for i, step in enumerate(steps):
        kept = []
        for seq in alive:
            # 앞 단계를 밟은 지점 뒤에서만 다음 단계를 찾는다.
            at = -1
            ok = True
            for st in steps[:i + 1]:
                nxt = next((j for j in range(at + 1, len(seq)) if seq[j] == st), None)
                if nxt is None:
                    ok = False
                    break
                at = nxt
            if ok:
                kept.append(seq)
        alive = kept
        n = len(alive)
        print("  %-22s %6d   %6.1f%%   %6.1f%%"
              % (step, n, n / base * 100, n / prev * 100 if prev else 0))
        prev = n


def cmd_paths(people, rows, args):
    """가정한 흐름 대신 실제로 밟은 순서를 센다.

    퍼널은 단계를 미리 정해야 하는데, 그 단계가 실제 경로가 아니면
    "여기서 78% 이탈"처럼 없는 이탈이 만들어진다. 실측에서 전환한
    세션 대부분은 첫 동작이 곧바로 링크였고, 펼침(brand_expand)은
    링크 앞보다 뒤에 오는 경우가 더 많았다 — 전 단계가 아니라 사후
    확인 행동이었다.
    """
    pop = {v.id for v in population(people, args)}
    seqs = sequences(rows, pop, args.scope)
    skip = set(args.ignore.split(",")) if args.ignore else set()
    paths = collections.Counter()
    conv = collections.Counter()
    for seq in seqs.values():
        # 뺄 이벤트를 걷고 나서 다시 접는다. 먼저 접으면 사이에 끼어
        # 있던 page_exit이 빠지면서 같은 동작이 둘로 남는다.
        trimmed = []
        for e in seq:
            if e in skip or (trimmed and trimmed[-1] == e):
                continue
            trimmed.append(e)
        key = " > ".join(trimmed[:args.depth]) if trimmed else "(아무것도 안 함)"
        paths[key] += 1
        if args.goal in trimmed:
            conv[key] += 1
    unit = "방문자" if args.scope == "visitor" else "세션"
    total = len(seqs)
    print("첫 %d동작 (연속 중복 접음, %s %d개)" % (args.depth, unit, total))
    print("경로                                       수   비중   그중 전환")
    for key, n in paths.most_common(args.limit):
        print("  %-40s %5d %5.1f%%  %5d" % (key[:40], n, n / total * 100, conv[key]))


def cmd_features(people, rows, args):
    """기능별 사용량. 무엇이 쓰이고 무엇이 죽었는지 한 장으로 본다.

    침투율만 보면 죽은 기능을 못 잡는다 — 한 달 누적이라 예전에 잘
    쓰이던 것도 높게 남는다. 최근 7일을 나란히 두면 갈린다.
    """
    pop = {v.id for v in population(people, args)}
    days = sorted({d for d, vid, *_ in rows if vid in pop})
    if not days:
        raise SystemExit("해당하는 방문자가 없다")
    recent_days = set(days[-args.window:])

    seen = collections.defaultdict(set)
    count = collections.Counter()
    recent = collections.defaultdict(set)
    first, last = {}, {}
    recent_pop = set()
    for day, vid, ev, _props, _ts, _sid in rows:
        if vid not in pop:
            continue
        seen[ev].add(vid)
        count[ev] += 1
        first.setdefault(ev, day)
        last[ev] = max(last.get(ev, ""), day)
        if day in recent_days:
            recent[ev].add(vid)
            recent_pop.add(vid)

    goal_users = seen[args.goal]
    n = len(pop)
    print("모수 %d명 · 최근 %d일 %d명 (%s~%s)"
          % (n, args.window, len(recent_pop), days[-args.window], days[-1]))
    print()
    print("기능(이벤트)             건수  사용자  침투율  최근%2d일  수명"
          % args.window)
    for ev, c in count.most_common():
        if ev in ("page_view", "page_exit"):
            continue
        users = seen[ev]
        now = len(recent[ev]) / len(recent_pop) * 100 if recent_pop else 0
        print("  %-22s %6d %6d %6.1f%% %7.1f%%  %s~%s"
              % (ev, c, len(users), len(users) / n * 100, now,
                 first[ev][5:], last[ev][5:]))

    # 전환율 대비는 따로 낸다. 같은 표에 두면 인과로 읽힌다.
    print()
    print("기능을 쓴 사람의 전환율 — %s" % args.goal)
    print("**이건 인과가 아니다.** 무엇이든 조작하는 사람이 링크도 누른다.")
    print("기능                     쓴 사람  안 쓴 사람   차이")
    for ev, _c in count.most_common():
        if ev in ("page_view", "page_exit", args.goal):
            continue
        users = seen[ev]
        others = pop - users
        if not users or not others:
            continue
        a = len(users & goal_users) / len(users) * 100
        b = len(others & goal_users) / len(others) * 100
        print("  %-22s %6.1f%%  %8.1f%%  %+6.1f%%p" % (ev, a, b, a - b))


def cmd_top(people, rows, args):
    pop = {v.id for v in population(people, args)}
    seen = collections.defaultdict(set)
    for _, vid, ev, props, _ts, _sid in rows:
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
    "top": cmd_top, "power": cmd_power, "paths": cmd_paths,
    "features": cmd_features,
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
    p.add_argument("--scope", choices=("session", "visitor"), default="session",
                   help="흐름을 어디까지 한 덩어리로 볼지. 기본은 세션")
    p.add_argument("--depth", type=int, default=3, help="paths: 앞에서 몇 동작까지")
    p.add_argument("--ignore", default="page_view,page_exit,banner_impression",
                   help="paths: 경로에서 뺄 이벤트")
    p.add_argument("--event", default=GOAL)
    p.add_argument("--prop", default="brand")
    p.add_argument("--limit", type=int, default=15)
    p.add_argument("--window", type=int, default=7, help="features: 최근 며칠을 현재로 볼지")
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
    assert median([1, 1, 43]) == 1, "헤비 유저가 중앙값을 못 움직인다"
    assert median([2, 4]) == 3
    assert median([]) == 0

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

    # 퍼널은 순서를 지켜야 한다. 링크를 먼저 누른 사람은 통과하면 안 된다.
    rows = [
        ("d", "정순", "brand_expand", {}, "1", "s"),
        ("d", "정순", "offer_link_click", {}, "2", "s"),
        ("d", "역순", "offer_link_click", {}, "1", "s"),
        ("d", "역순", "brand_expand", {}, "2", "s"),
    ]
    seqs = sequences(rows, {"정순", "역순"}, "session")
    assert seqs[("정순", "s")] == ["brand_expand", "offer_link_click"]
    assert seqs[("역순", "s")] == ["offer_link_click", "brand_expand"]

    # 사이에 낀 이벤트를 걷어내도 같은 동작이 둘로 남지 않는다.
    rows2 = [("d", "v", e, {}, str(i), "s") for i, e in enumerate(
        ["offer_link_click", "page_exit", "offer_link_click"])]
    seq = sequences(rows2, {"v"}, "session")[("v", "s")]
    trimmed = []
    for e in seq:
        if e == "page_exit" or (trimmed and trimmed[-1] == e):
            continue
        trimmed.append(e)
    assert trimmed == ["offer_link_click"], trimmed
    print("ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        main()
