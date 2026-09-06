#!/usr/bin/env python3
"""PostHog 그래프에 "이날 무엇이 바뀌었나"를 찍는다.

  scripts/annotate_posthog.py                # 무엇을 찍을지 보여만 준다
  scripts/annotate_posthog.py --apply        # 실제로 올린다
  scripts/annotate_posthog.py --kind tracking

PostHog 그래프에서 선이 꺾여도 지금은 원인을 못 찾는다.

두 가지가 겹쳐 있어서 더 그렇다. 2026-09-03은 방문자가 평소의 4.2배로
실제로 뛰었고, 동시에 08-31에 들어온 brand_impression 계측이 1인당
이벤트를 0.76건에서 12.89건으로 밀어 올렸다 — 사람이 는 것과 계측이
바뀐 것이 같은 그래프에서 같은 모양으로 보인다. 08-18은 반대로
banner_impression이 아직 없어 전환율이 20.6%로 낮게 찍혔다(분자에
banner_click이 없다).

세 가지를 찍는다.

  tracking  이벤트가 처음 나타난 날. 그 전 구간은 그 지표가 0이다 —
            비교하면 안 되는 구간이라는 표시다. 원장에서 뽑는다.
  release   화면이 바뀐 날(web/src의 feat 커밋). 하루에 여러 건이면 한
            줄로 묶는다 — 커밋마다 찍으면 눈금이 글자로 덮인다.
  spike     방문자가 평소의 몇 배로 뛴 날. 같은 날 release 표시가 같이
            서면 배포 탓이고, 혼자 서면 밖에서 온 것이다.

인증은 Personal API Key다. 발급 화면에서 Annotation 항목을 **Write**로
두면 된다 — 같은 리소스의 읽기까지 덮는다. 못 읽는 키라면 --no-dedup으로
넘길 수 있지만, 그러면 다시 돌릴 때마다 같은 주석이 쌓인다.

프로젝트 토큰(phc_)은 쓰기 전용 수집 키라 여기에 못 쓴다. 브라우저에
넣는 값이 아니므로 환경변수로만 받는다.
"""
import argparse
import collections
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import experiments as ex  # noqa: E402

HOST = os.environ.get("POSTHOG_HOST", "https://us.posthog.com")
PROJECT = os.environ.get("POSTHOG_PROJECT_ID", "548055")
KEY_VAR = "POSTHOG_PERSONAL_API_KEY"
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# 하루 중 언제로 찍을지. 자정으로 두면 전날 눈금에 붙어 보인다.
MARKER_HOUR = "T12:00:00Z"


def tracking_marks(src):
    """이벤트가 처음 나타난 날. 같은 날 여러 개면 한 줄로 묶는다."""
    _people, rows = ex.load(ex.fetch(src))
    first = {}
    for day, _vid, event, *_rest in rows:
        if event not in first or day < first[event]:
            first[event] = day
    by_day = collections.defaultdict(list)
    for event, day in first.items():
        by_day[day].append(event)
    # 첫날은 전부 처음이라 찍을 값이 없다 — 계측이 생긴 날이 아니라
    # 원장이 시작된 날이다.
    start = min(by_day)
    return [(day, "계측 추가: " + ", ".join(sorted(events)))
            for day, events in sorted(by_day.items()) if day != start]


def release_marks():
    """화면이 바뀐 날. web/src를 건드린 feat 커밋만 본다."""
    out = subprocess.run(
        ["git", "-C", REPO, "log", "--pretty=%ad|%s", "--date=short",
         "--", "web/src"],
        capture_output=True, text=True, encoding="utf-8", check=True).stdout
    by_day = collections.defaultdict(list)
    for line in out.splitlines():
        day, _, subject = line.partition("|")
        if subject.startswith("feat:"):
            by_day[day].append(subject[len("feat:"):].strip())
    return [(day, "개편: " + " / ".join(subjects))
            for day, subjects in sorted(by_day.items())]


SPIKE_TIMES = 3          # 중앙값의 몇 배부터 급증으로 볼 것인가


def spike_marks(src):
    """방문자가 평소의 몇 배로 뛴 날.

    유입원까지는 못 짚는다. referrer는 direct/internal/external로만 받고
    원본 URL은 안 남기며, 카톡·커뮤니티는 인앱 브라우저라 referrer 자체가
    안 온다 — 실제로 급증일 여섯 날 모두 외부유입이 2.5~5.9%로 평소와
    같았다. 그래서 "밖에서 왔다"까지만 적고 어디서인지는 안 지어낸다.

    대신 같은 날 release 표시가 같이 서는지로 갈린다. 2026-08-18은 방문자
    5.4배인데 web 커밋이 0건이었다 — 배포가 아니라 밖에서 온 것이다.
    """
    people, rows = ex.load(ex.fetch(src))
    args = argparse.Namespace(goal=ex.GOAL, include_dev=False,
                              include_bots=False, only=None, since=None,
                              until=None)
    seen = collections.defaultdict(set)
    first = {}
    for day, vid, _event, *_rest in rows:
        if not ex.keep(people[vid], args):
            continue
        seen[day].add(vid)
        if vid not in first or day < first[vid]:
            first[vid] = day
    counts = sorted(len(v) for v in seen.values())
    median = counts[len(counts) // 2]
    marks = []
    for day, who in sorted(seen.items()):
        if len(who) < median * SPIKE_TIMES:
            continue
        new = sum(1 for v in who if first[v] == day) / len(who) * 100
        marks.append((day, "트래픽 급증: %d명 (평소 %.1f배), 신규 %.0f%%"
                      % (len(who), len(who) / median, new)))
    return marks


def existing(key):
    """이미 찍힌 것. 다시 돌려도 겹쳐 쌓이지 않게 날짜+내용으로 본다."""
    url = "%s/api/projects/%s/annotations/?limit=500" % (HOST, PROJECT)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=20) as res:
        data = json.loads(res.read().decode("utf-8"))
    return {(a.get("date_marker", "")[:10], a.get("content"))
            for a in data.get("results", [])}


def post(key, day, content):
    url = "%s/api/projects/%s/annotations/" % (HOST, PROJECT)
    body = json.dumps({"date_marker": day + MARKER_HOUR,
                       "content": content,
                       "scope": "project"}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8"))["id"]


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--kind", choices=("tracking", "release", "spike", "all"),
                   default="all")
    p.add_argument("--src", help="원장 파일. 없으면 서버에서 받는다")
    p.add_argument("--apply", action="store_true", help="실제로 올린다")
    p.add_argument("--since", default="2026-07-29", help="이 날 이후만")
    p.add_argument("--no-dedup", action="store_true",
                   help="기존 주석을 안 읽는다. 겹쳐 쌓일 수 있다")
    args = p.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    marks = []
    if args.kind in ("tracking", "all"):
        marks += tracking_marks(args.src)
    if args.kind in ("release", "all"):
        marks += release_marks()
    if args.kind in ("spike", "all"):
        marks += spike_marks(args.src)
    marks = sorted(m for m in marks if m[0] >= args.since)

    if not args.apply:
        for day, content in marks:
            print("%s  %s" % (day, content))
        print("\n%d건. 올리려면 --apply (환경변수 %s 필요)."
              % (len(marks), KEY_VAR))
        return 0

    key = os.environ.get(KEY_VAR)
    if not key:
        # 여기서 멈춘다. 키 없이 올리면 401이 건건이 나면서 절반쯤
        # 올라간 상태가 된다.
        print("%s 가 없다. Personal API Key(annotation:write)를 넣어라."
              % KEY_VAR, file=sys.stderr)
        return 2

    already = set()
    if not args.no_dedup:
        try:
            already = existing(key)
        except urllib.error.HTTPError as err:
            # 읽기가 막힌 키로 그냥 올리면 돌릴 때마다 같은 주석이 쌓이고,
            # 지우는 것은 손으로 해야 한다. 여기서 멈추는 편이 싸다.
            print("기존 주석을 못 읽었다 (%s). "
                  "발급 화면에서 Annotation을 Write로 두면 읽기까지 된다. "
                  "그대로 올리려면 --no-dedup." % err, file=sys.stderr)
            return 2

    added = skipped = 0
    for day, content in marks:
        if (day, content) in already:
            skipped += 1
            continue
        post(key, day, content)
        added += 1
        print("찍음 %s  %s" % (day, content))
    print("\n새로 %d건, 이미 있어 건너뜀 %d건." % (added, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
