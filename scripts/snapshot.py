#!/usr/bin/env python3
"""원장을 훑어 지표 스냅샷 문서를 남긴다.

  scripts/snapshot.py                  # docs/metrics/YYYY-MM-DD.md 로 저장
  scripts/snapshot.py --stdout         # 파일 대신 화면으로
  scripts/snapshot.py --src path.jsonl # 받아둔 원장으로

experiments.py는 "지금 궁금한 것"을 묻는 도구라 물어본 사람 화면에만
남는다. 그래서 한 달 전 리텐션이 얼마였는지 되짚을 길이 없고, 실제로
"재방문율이 떨어지는가"를 판단하는 데 코호트를 매번 새로 짜야 했다.

이 스크립트는 같은 원장에서 늘 같은 항목을 뽑아 날짜별 문서로 남긴다.
집계·필터·통계는 experiments.py 것을 그대로 쓴다 — 두 벌로 두면
숫자가 갈라지고, 갈라진 순간 어느 쪽이 맞는지 아무도 모른다.
"""
import argparse
import collections
import datetime
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import experiments as ex  # noqa: E402

DOC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "..", "docs", "metrics")
BRANDS_API = os.environ.get("DISCOUNT_BRANDS_API",
                            "https://bebeggars.duckdns.org/api/brands")
RECENT_DAYS = 14


def base_args(goal=ex.GOAL):
    """experiments.keep()이 보는 값들. 개발 트래픽과 봇은 뺀다."""
    return argparse.Namespace(goal=goal, include_dev=False, include_bots=False,
                              only=None, since=None, until=None)


def week_of(day):
    d = datetime.date.fromisoformat(day)
    return d - datetime.timedelta(days=d.weekday())


# ---- 구획 -------------------------------------------------------------

def sec_retention(people, rows, args, pick=None, note=None):
    """주 코호트별 복귀율.

    아직 오지 않은 주는 0%가 아니라 빈칸이다 — 0으로 적으면 "안 왔다"로
    읽혀 하락 폭이 실제보다 커 보인다.

    pick을 주면 그 무리만 센다. 폰과 데스크톱은 성격이 다르니 한 표에
    섞으면 둘 다 안 보인다 — 섞인 값이 떨어져도 어느 쪽이 빠지는지 모른다.
    """
    first, days = {}, collections.defaultdict(set)
    for day, vid, _ev, _p, _ts, _sid, _path in rows:
        v = people[vid]
        if not ex.keep(v, args) or (pick and not pick(v)):
            continue
        days[vid].add(day)
        if vid not in first or day < first[vid]:
            first[vid] = day
    if not first:
        return ["코호트를 만들 방문자가 없다."]

    last_week = week_of(max(d for ds in days.values() for d in ds))
    coh = collections.defaultdict(collections.Counter)
    for vid, f in first.items():
        fw = week_of(f)
        coh[fw][0] += 1
        for d in days[vid]:
            n = (week_of(d) - fw).days // 7
            if n > 0:
                coh[fw][n] += 1

    out = ["| 첫 주 | 신규 | W+1 | W+2 | W+3 |", "|---|---|---|---|---|"]
    for fw in sorted(coh):
        c = coh[fw]
        n = c[0]
        cells = []
        for k in (1, 2, 3):
            # 그 주가 아직 안 왔으면 셀 수가 없다.
            cells.append("—" if fw + datetime.timedelta(weeks=k) > last_week
                         else "%d (%.1f%%)" % (c[k], c[k] / n * 100))
        out.append("| %s | %d | %s |" % (fw, n, " | ".join(cells)))
    return ([note, ""] + out) if note else out


def sec_retention_by_device(people, rows, args):
    """폰과 데스크톱을 갈라 본 복귀율.

    2026-09-06: 합쳐 보면 W+1이 36%에서 10%로 떨어지는데, 갈라 보면
    양쪽이 같이 떨어진다 — 기기를 갈아타서 생긴 착시가 아니다.
    """
    out = []
    for name in ("폰", "데스크톱"):
        out += ["**%s**" % name, ""]
        out += sec_retention(people, rows, args,
                             pick=lambda v, n=name: real_device(v) == n)
        out += [""]
    out += ["visitorId는 브라우저마다 다른 난수라 기기를 갈아타면 새 사람이 "
            "된다. ipHash로 이어붙여 재보면 재방문율이 16.7%에서 17.7%로 "
            "1.0%p 오를 뿐이다(2026-09-06) — 하락을 설명할 크기가 아니다."]
    return out


def sec_daily(people, rows, args):
    gs = ex.goals(args)
    per = collections.defaultdict(lambda: [set(), set()])
    for day, vid, ev, _p, _ts, _sid, _path in rows:
        if not ex.keep(people[vid], args):
            continue
        per[day][0].add(vid)
        if ev in gs:
            per[day][1].add(vid)
    out = ["| 날짜 | 방문자 | 전환 | 전환율 |", "|---|---|---|---|"]
    for day in sorted(per)[-RECENT_DAYS:]:
        seen, conv = per[day]
        rate = len(conv) / len(seen) * 100 if seen else 0
        out.append("| %s | %d | %d | %.1f%% |" % (day, len(seen), len(conv), rate))
    return out


def _rate_rows(people, rows, args, bucket_of):
    """bucket_of(방문자) -> 무리 이름. 무리별 (방문자수, 전환수)."""
    gs = ex.goals(args)
    seen = collections.defaultdict(set)
    conv = collections.defaultdict(set)
    for _day, vid, ev, _p, _ts, _sid, _path in rows:
        v = people[vid]
        if not ex.keep(v, args):
            continue
        b = bucket_of(v)
        if b is None:
            continue
        seen[b].add(vid)
        if ev in gs:
            conv[b].add(vid)
    return {b: (len(seen[b]), len(conv[b])) for b in seen}


def _compare(title, groups, order):
    out = ["| %s | 방문자 | 전환 | 전환율 | 95%% 구간 |" % title,
           "|---|---|---|---|---|"]
    for k in order:
        if k not in groups:
            continue
        n, c = groups[k]
        lo, hi = ex.wilson(c, n)
        out.append("| %s | %d | %d | %.1f%% | %.1f~%.1f%% |"
                   % (k, n, c, c / n * 100, lo * 100, hi * 100))
    pair = [k for k in order if k in groups][:2]
    if len(pair) == 2:
        (n1, c1), (n2, c2) = groups[pair[0]], groups[pair[1]]
        z, p = ex.ztest(c1, n1, c2, n2)
        verdict = "유의" if p < 0.05 else "판정 불가"
        out += ["", "%s vs %s: z=%.2f p=%.4f — **%s**"
                % (pair[0], pair[1], z, p, verdict)]
    return out


def sec_variant(people, rows, args):
    groups = _rate_rows(people, rows, args,
                        lambda v: getattr(v, "variant", None))
    return _compare("갈래", groups, sorted(groups)) if groups else \
        ["갈래를 실은 이벤트가 없다."]


def sec_returning(people, rows, args):
    groups = _rate_rows(people, rows, args,
                        lambda v: "재방문" if v.returning else "신규")
    return _compare("무리", groups, ["신규", "재방문"])


def _active_days(people, rows, args):
    """방문자 -> 활동한 날짜 집합. 아래 세 구획이 같은 것을 본다."""
    days = collections.defaultdict(set)
    for day, vid, _ev, _p, _ts, _sid, _path in rows:
        if ex.keep(people[vid], args):
            days[vid].add(day)
    return days


def sec_loyalty(people, rows, args):
    """며칠에 걸쳐 다시 오는가.

    "충성 사용자"를 방문 횟수로 세면 안 된다 — 한 번 와서 새로고침을
    스무 번 한 사람과 스무 날에 걸쳐 한 번씩 온 사람이 같아진다. 서로
    다른 날에 스스로 다시 찾아온 것만 재사용으로 본다.

    로그인이 없는 서비스라 이 표의 바닥에는 구조적 한계가 깔려 있다.
    visitorId는 localStorage 난수라 기기를 갈아타거나 데이터를 지우면
    같은 사람이 새 사람으로 쪼개진다. 그러므로 이 숫자는 재사용의
    **하한**이다 — 실제보다 낮게 나오지 높게 나오지 않는다.
    """
    days = _active_days(people, rows, args)
    if not days:
        return ["방문자가 없다."]
    n = len(days)
    dist = collections.Counter(len(d) for d in days.values())

    out = ["| 활동일 | 사람 | 누적 | 누적 비중 |", "|---|---|---|---|"]
    cum = 0
    for k in sorted(dist, reverse=True):
        cum += dist[k]
        label = "%d일" % k
        out.append("| %s | %d | %d | %.1f%% |" % (label, dist[k], cum, cum / n * 100))
    out += ["", "모수 %d명. 하루만 온 사람이 %.1f%%다 — 이 서비스에서 재방문은 "
            "다수 행동이 아니라 소수 행동이라는 뜻이고, 그래서 아래 주별 "
            "추이를 비율로 본다(절대 수는 그날 홍보에 통째로 흔들린다)."
            % (n, dist[1] / n * 100 if 1 in dist else 0), ""]

    # 주별 추이. 그 주에 실제로 온 사람만 분모다 — 전체 누적을 분모로
    # 두면 서비스가 오래될수록 비율이 저절로 떨어진다.
    wk = collections.defaultdict(lambda: collections.defaultdict(set))
    for vid, ds in days.items():
        for d in ds:
            wk[week_of(d)][vid].add(d)
    out += ["| 주 | 그 주 방문자 | 2일+ | 비율 | 3일+ | 비율 |",
            "|---|---|---|---|---|---|"]
    for w in sorted(wk):
        m = wk[w]
        t = len(m)
        d2 = sum(1 for v in m.values() if len(v) >= 2)
        d3 = sum(1 for v in m.values() if len(v) >= 3)
        out.append("| %s | %d | %d | %.1f%% | %d | %.1f%% |"
                   % (w, t, d2, d2 / t * 100, d3, d3 / t * 100))
    return out


def sec_cadence(people, rows, args):
    """띄엄띄엄이라도 다시 오는 사람이 있는가.

    리텐션 코호트(W+1, W+2)는 "다음 주에 왔나"만 본다. 2주 쉬었다가
    오는 사람은 그 표에서 이탈로 잡히는데, 이 서비스는 매일 쓰는 도구가
    아니라 시켜 먹을 때 여는 도구라 그 사람이야말로 살아 있는 사용자다.

    그래서 두 가지를 따로 센다 — 연달아 온 사람과 하루 이상 띄우고
    돌아온 사람. 후자가 많다면 "붙잡아 두는" 지표(DAU)로 이 서비스를
    재는 것 자체가 틀린 것이다.
    """
    days = _active_days(people, rows, args)
    multi = {v: d for v, d in days.items() if len(d) >= 2}
    if not multi:
        return ["다시 온 사람이 없다."]

    gaps = collections.Counter()
    spread, dense = set(), set()
    for vid, ds in multi.items():
        s = sorted(datetime.date.fromisoformat(d) for d in ds)
        g = [(b - a).days for a, b in zip(s, s[1:])]
        gaps.update(g)
        (spread if any(x >= 2 for x in g) else dense).add(vid)

    n = len(days)
    total_gaps = sum(gaps.values())
    out = ["- 활동일 2일 이상 **%d명 (%.1f%%)**" % (len(multi), len(multi) / n * 100),
           "  - 연달아 온 날만 있는 사람 %d명" % len(dense),
           "  - 하루 이상 띄우고 돌아온 사람 **%d명** (다시 온 사람의 %.1f%%)"
           % (len(spread), len(spread) / len(multi) * 100),
           "", "| 다시 오기까지 | 횟수 | 비중 |", "|---|---|---|"]
    buckets = (("다음 날", lambda g: g == 1),
               ("2~3일", lambda g: 2 <= g <= 3),
               ("4~7일", lambda g: 4 <= g <= 7),
               ("8~14일", lambda g: 8 <= g <= 14),
               ("15일 이상", lambda g: g >= 15))
    for label, pick in buckets:
        c = sum(v for g, v in gaps.items() if pick(g))
        out.append("| %s | %d | %.1f%% |" % (label, c, c / total_gaps * 100))

    # 주별 분해. PostHog 라이프사이클과 같은 갈래를 원장으로 낸다.
    wk = collections.defaultdict(set)
    for vid, ds in days.items():
        for d in ds:
            wk[week_of(d)].add(vid)
    out += ["", "| 주 | 신규 | 지난주에도 옴 | 쉬었다 돌아옴 | 합 |",
            "|---|---|---|---|---|"]
    ever, prev = set(), set()
    for w in sorted(wk):
        cur = wk[w]
        new = cur - ever
        back = cur - prev - new
        out.append("| %s | %d | %d | %d | %d |"
                   % (w, len(new), len(cur & prev), len(back), len(cur)))
        ever |= cur
        prev = cur
    out += ["", "\"쉬었다 돌아옴\"은 지난주에는 안 왔는데 이번 주에 온 "
            "기존 사용자다. 코호트 표에서는 이탈로 잡히는 사람들이다."]
    return out


def sec_real_users(people, rows, args):
    """하루에 몇 명이 오는가 — 크롤러와 개발 트래픽을 빼고.

    다른 구획은 전부 사람만 세지만(ex.keep), 이 표만은 뺀 것을 나란히
    보여준다. 무엇을 얼마나 빼고 있는지가 안 보이면 "실질 사용자"라는
    말이 검증 불가능한 주장이 된다.

    크롤러는 하루하루 균등하게 오지 않는다 — 몰려와서 한 바퀴 돌고
    간다. 평균만 보면 안 보이고 그날치를 봐야 보인다.
    """
    bots = {v.id for v in people.values() if v.bot}
    devs = {v.id for v in people.values() if v.looks_developer()}
    per = collections.defaultdict(set)
    for day, vid, _ev, _p, _ts, _sid, _path in rows:
        per[day].add(vid)

    days = sorted(per)
    out = ["| 날짜 | 전체 | 크롤러 | 개발 | 실질 | 크롤러 비중 |",
           "|---|---|---|---|---|---|"]
    for d in days[-RECENT_DAYS:]:
        seen = per[d]
        b = len(seen & bots)
        out.append("| %s | %d | %d | %d | **%d** | %.1f%% |"
                   % (d, len(seen), b, len(seen & devs),
                      len(seen - bots - devs), b / len(seen) * 100))

    def avg(window):
        pick = days[-window:]
        return sum(len(per[d] - bots - devs) for d in pick) / len(pick)

    out += ["", "- 일 평균 실질 사용자 — 최근 7일 **%.1f명**, 최근 30일 %.1f명, 전체 %.1f명"
            % (avg(7), avg(min(30, len(days))), avg(len(days)))]
    worst = max(days, key=lambda d: len(per[d] & bots) / len(per[d]))
    out += ["- 크롤러 비중이 가장 컸던 날 %s (%.1f%%, %d명)"
            % (worst, len(per[worst] & bots) / len(per[worst]) * 100,
               len(per[worst] & bots)),
            "", "크롤러는 스스로 밝힌 것만 잡는다(User-Agent). 이름을 안 "
            "밝히고 사람인 척하는 수집기는 여기 안 들어 있으므로 이 열은 "
            "크롤러의 **하한**이다. 2026-08-29 이전 구간은 서버가 이름을 "
            "적기 전이라 몰려온 흔적으로 되짚은 값이다."]
    return out


def sec_success(people, rows, args):
    """고유 사용자 기준 성공 신호의 주별 추이.

    전환은 사람 단위로 센다 — 한 사람이 43번 눌러도 1이다(2026-08-24
    실측에서 총합 기준이 갈래 하나의 결론을 뒤집었다).

    오퍼 클릭과 배너 클릭을 나눠 적는 이유는 08-19에 배너가 생기면서
    나가는 길이 하나 더 늘었기 때문이다. 합만 보면 그날의 계단이 제품
    개선으로 읽힌다 — 실제로는 분자의 정의가 바뀐 것이었다
    (ANALYTICS-CAPABILITY.md §5.2).
    """
    wk = collections.defaultdict(lambda: [set(), set(), set(), set()])
    for day, vid, ev, _p, _ts, _sid, _path in rows:
        if not ex.keep(people[vid], args):
            continue
        w = week_of(day)
        wk[w][0].add(vid)
        if ev in ex.goals(args):
            wk[w][1].add(vid)
        if ev == "offer_link_click":
            wk[w][2].add(vid)
        if ev == "banner_click":
            wk[w][3].add(vid)

    out = ["| 주 | 방문자 | 전환자 | 전환율 | 95% 구간 | 오퍼 클릭 | 배너 클릭 |",
           "|---|---|---|---|---|---|---|"]
    for w in sorted(wk):
        seen, conv, offer, banner = wk[w]
        n = len(seen)
        lo, hi = ex.wilson(len(conv), n)
        out.append("| %s | %d | %d | %.1f%% | %.1f~%.1f%% | %.1f%% | %.1f%% |"
                   % (w, n, len(conv), len(conv) / n * 100, lo * 100, hi * 100,
                      len(offer) / n * 100, len(banner) / n * 100))
    out += ["", "전환 = `%s`. 신뢰구간이 겹치는 주끼리는 차이를 주장하지 "
            "않는다." % args.goal]
    return out


def sec_banner(people, rows, args):
    """배너는 본 사람 대비 누른 사람으로 본다.

    세션 퍼널로 보면 "배너를 못 본 세션"까지 분모에 들어가 클릭률이
    실제보다 낮게 나온다 — 고칠 곳이 문구인지 노출인지 갈리는 지점이라
    둘을 나눠 적는다.
    """
    reach = collections.defaultdict(set)
    per_banner = collections.defaultdict(set)
    for _day, vid, ev, props, _ts, _sid, _path in rows:
        if not ex.keep(people[vid], args):
            continue
        if ev in ("page_view", "banner_impression", "banner_click",
                  "banner_dismiss"):
            reach[ev].add(vid)
        if ev == "banner_click":
            # 2026-08에 banner 속성을 붙이기 전 클릭 55건이 있다. 버리면
            # 그 달 배너가 안 눌린 것처럼 보이므로 한 줄로 모아 남긴다.
            bid = (props or {}).get("banner") if isinstance(props, dict) else None
            per_banner[bid or "미상(계측 전)"].add(vid)

    views = len(reach["page_view"]) or 1
    saw = len(reach["banner_impression"])
    clicked = len(reach["banner_click"])
    out = ["- 방문자 %d명 중 배너를 본 사람 **%d명 (%.1f%%)**"
           % (views, saw, saw / views * 100)]
    out.append("- 본 사람 중 누른 사람 **%d명 (%.1f%%)**" % (clicked, clicked / saw * 100)
               if saw else "- 노출 없음")
    out += ["- 닫은 사람 %d명" % len(reach["banner_dismiss"]),
            "", "| 배너 | 클릭 |", "|---|---|"]
    # 사람 수로 센다. 건수로 세면 한 사람이 여러 번 누른 배너가 위로 온다.
    top = sorted(per_banner.items(), key=lambda kv: -len(kv[1]))[:10]
    for bid, who in top:
        out.append("| %s | %d |" % (bid, len(who)))
    return out


def _amounts():
    """브랜드별 최대 할인액. 못 받아오면 빈 표를 준다(구획만 접힌다)."""
    try:
        with urllib.request.urlopen(BRANDS_API, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
    except Exception as err:  # 네트워크·서버 사정. 스냅샷 전체를 접을 일은 아니다.
        print("금액표를 못 받았다: %s" % err, file=sys.stderr)
        return {}
    brands = data if isinstance(data, list) else data.get("brands", [])
    out = {}
    for b in brands:
        amounts = [o.get("amount") for o in b.get("offers", [])
                   if isinstance(o.get("amount"), int)]
        if amounts:
            out[b.get("name")] = max(amounts)
    return out


BANDS = ((0, 3000, "3천원 미만"), (3000, 5000, "3~5천원"),
         (5000, 8000, "5~8천원"), (8000, 10 ** 9, "8천원 이상"))


def sec_amount(people, rows, args):
    """할인액이 클릭을 끄는가, 브랜드가 끄는가.

    브랜드를 금액대로 묶어 브랜드 하나당 몇 명이 눌렀는지 본다. 금액대로
    묶으면 브랜드 인지도가 각 칸에 흩어져 금액 몫만 남는다.

    분모를 brand_impression으로 두면 안 된다 — 목록은 대부분 화면 밖이라
    노출이 클릭보다 적게 잡히고, 그대로 나누면 138% 같은 값이 나온다
    (2026-09-06 실측). 브랜드 수로 나눈다: 한 칸에 브랜드가 많으면 클릭도
    당연히 많이 모이므로, 그 몫을 걷어내야 금액대끼리 견줄 수 있다.

    한계: 금액은 지금 값이다. 지난 행사 금액이 달랐으면 그 클릭은 엉뚱한
    칸에 들어간다. 추세를 보는 용도지 효과 추정치가 아니다.
    """
    amounts = _amounts()
    if not amounts:
        return ["금액표를 못 받아 건너뛴다."]

    def band_of(won):
        return next(name for lo, hi, name in BANDS if lo <= won < hi)

    brands = collections.Counter(band_of(w) for w in amounts.values())
    clicked = collections.defaultdict(set)
    for _day, vid, ev, props, _ts, _sid, _path in rows:
        if ev != "offer_link_click" or not isinstance(props, dict):
            continue
        if not ex.keep(people[vid], args):
            continue
        won = amounts.get(props.get("brand"))
        if won is not None:
            clicked[band_of(won)].add(vid)
    out = ["| 할인액 | 브랜드 | 누른 사람 | 브랜드당 |", "|---|---|---|---|"]
    for _lo, _hi, name in BANDS:
        b, c = brands[name], len(clicked[name])
        per = "%.1f명" % (c / b) if b else "—"
        out.append("| %s | %d | %d | %s |" % (name, b, c, per))
    out += ["", "금액이 클수록 브랜드당 클릭이 는다. 다만 배너에 올리는 것도 "
            "금액이 큰 쪽이라, 위 칸은 배너로 들어온 몫이 섞여 있다 — "
            "금액의 순효과는 이 표만으로 못 가른다."]
    return out


SURVEY_KEYS = ("choice", "q_when", "q_priority", "q_missing", "q_wish")


def sec_survey(people, rows, args):
    reach = collections.defaultdict(set)
    tally = {k: collections.Counter() for k in SURVEY_KEYS}
    for _day, vid, ev, props, _ts, _sid, _path in rows:
        if not ev.startswith("survey") or not ex.keep(people[vid], args):
            continue
        reach[ev].add(vid)
        if ev == "survey_answer" and isinstance(props, dict):
            for k in SURVEY_KEYS:
                if props.get(k):
                    # choice는 "new+discount_info"처럼 여러 개가 붙어 온다.
                    for one in str(props[k]).split("+"):
                        tally[k][one] += 1
    out = ["| 단계 | 인원 |", "|---|---|"]
    for ev in ("survey_impression", "survey_open", "survey_answer",
               "survey_dismiss"):
        out.append("| %s | %d |" % (ev, len(reach[ev])))
    for k in SURVEY_KEYS:
        if not tally[k]:
            continue
        total = sum(tally[k].values())
        out += ["", "**%s** (응답 %d)" % (k, total), "", "| 답 | 수 |", "|---|---|"]
        out += ["| %s | %d |" % (a, n) for a, n in tally[k].most_common()]
    return out


# 폰인지 데스크톱인지 가르는 폭. 이보다 좁은 창은 데스크톱에 없다.
PHONE_WIDTH = 800


def real_device(v):
    """device 속성만 믿으면 안 된다 — 폭까지 봐야 한다.

    device는 matchMedia('(hover: hover)')로 정하는데 일부 안드로이드
    브라우저가 hover:hover를 보고한다. 그래서 desktop 1720명 중 854명
    (49.7%)이 세션 내내 폭 800px 미만이었다 — 폰이다.

    그대로 두면 결론이 뒤집힌다. 오분류된 채로는 "데스크톱 37.9% >
    모바일 32.8%"였는데, 폭으로 다시 가르면 "폰 37.4% > 데스크톱 32.7%"다
    (z=-2.49, p=0.0128). 정반대다.

    폭이 없는 방문자는 가를 근거가 없으므로 따로 둔다 — 한쪽에 몰아넣으면
    그 집단이 조용히 오염된다.
    """
    if not v.widths:
        return "폭 미상"
    if max(v.widths) < PHONE_WIDTH:
        return "폰"
    return "데스크톱" if ex.bucket(v, "device") == "desktop" else "태블릿·큰 폰"


def sec_traffic(people, rows, args):
    """어디서 들어와 무엇으로 보는가. 전환까지 같이 본다.

    유입은 experiments.bucket()을 그대로 쓴다 — "referrer가 뭐였더라"를
    여기서 다시 정의하면 두 도구가 다른 답을 낸다. 기기만 폭을 함께 본다
    (real_device 참고).
    """
    out = []
    for pick, title in ((lambda v: ex.bucket(v, "referrer"), "유입"),
                        (real_device, "기기")):
        groups = _rate_rows(people, rows, args, pick)
        order = sorted(groups, key=lambda k: -groups[k][0])
        out += ["**%s**" % title, ""] + _compare(title, groups, order) + [""]
    out += ["기기는 device 속성이 아니라 창 폭으로 가른다 — 안드로이드 "
            "일부가 hover:hover를 보고해 폰이 데스크톱으로 잡힌다.", ""]
    return out


def sec_features(people, rows, args):
    """이벤트별 도달 인원. 어느 기능이 실제로 쓰이는가.

    건수가 아니라 사람 수로 센다 — 한 사람이 스무 번 쓴 기능과 스무
    명이 한 번씩 쓴 기능은 완전히 다른 얘기다.
    """
    reach = collections.defaultdict(set)
    total = collections.Counter()
    everyone = set()
    for _day, vid, ev, _p, _ts, _sid, _path in rows:
        if not ex.keep(people[vid], args):
            continue
        everyone.add(vid)
        reach[ev].add(vid)
        total[ev] += 1
    n = len(everyone) or 1
    out = ["모수 %d명." % n, "", "| 이벤트 | 도달 | 비율 | 1인당 |",
           "|---|---|---|---|"]
    for ev in sorted(reach, key=lambda e: -len(reach[e])):
        who = len(reach[ev])
        out.append("| %s | %d | %.1f%% | %.2f |"
                   % (ev, who, who / n * 100, total[ev] / who))
    return out


SECTIONS = (
    ("리텐션 — 주 코호트별 복귀율", sec_retention),
    ("리텐션 — 기기별", sec_retention_by_device),
    ("재사용 — 활동일수와 주별 충성도", sec_loyalty),
    ("재사용 — 다시 오기까지의 간격", sec_cadence),
    ("실질 사용자 — 크롤러·개발 트래픽을 뺀 하루치", sec_real_users),
    ("성공 신호 — 고유 사용자 기준 주별 추이", sec_success),
    ("신규 vs 재방문", sec_returning),
    ("전환 — 최근 %d일" % RECENT_DAYS, sec_daily),
    ("A/B", sec_variant),
    ("유입과 기기", sec_traffic),
    ("배너", sec_banner),
    ("금액대별 클릭", sec_amount),
    ("설문", sec_survey),
    ("기능별 도달", sec_features),
)


def build(people, rows, args):
    today = datetime.date.today().isoformat()
    span = sorted({day for day, *_ in rows})
    lines = [
        "# 지표 스냅샷 %s" % today,
        "",
        "원장 %s ~ %s, 방문자 %d명. 개발 트래픽과 봇은 뺐다."
        % (span[0], span[-1], len(people)),
        "",
        "`scripts/snapshot.py`가 만든다 — 손으로 고치지 말고 다시 돌려라. "
        "전환은 `%s` 기준." % args.goal,
    ]
    for title, fn in SECTIONS:
        lines += ["", "## %s" % title, ""] + fn(people, rows, args)
    return "\n".join(lines) + "\n"


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--src", help="원장 파일. 없으면 서버에서 받는다")
    p.add_argument("--goal", default=ex.GOAL, help="전환으로 볼 이벤트")
    p.add_argument("--stdout", action="store_true", help="파일 대신 화면으로")
    args = p.parse_args(argv)

    people, rows = ex.load(ex.fetch(args.src))
    text = build(people, rows, base_args(args.goal))
    if args.stdout:
        # 윈도우 콘솔은 기본이 cp949라 '—' 하나에 통째로 죽는다.
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stdout.write(text)
        return 0
    os.makedirs(DOC_DIR, exist_ok=True)
    path = os.path.join(DOC_DIR, datetime.date.today().isoformat() + ".md")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(os.path.relpath(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
