#!/usr/bin/env python3
"""PostHog 그래프에 "이날 무엇이 바뀌었나"를 찍는다.

  scripts/annotate_posthog.py                # 무엇을 찍을지 보여만 준다
  scripts/annotate_posthog.py --apply        # 실제로 올린다
  scripts/annotate_posthog.py --kind tracking
  scripts/annotate_posthog.py --reset --apply  # 다 지우고 다시 찍는다

PostHog 그래프에서 선이 꺾여도 지금은 원인을 못 찾는다.

두 가지가 겹쳐 있어서 더 그렇다. 2026-09-03은 방문자가 평소의 4.2배로
실제로 뛰었고, 동시에 08-31에 들어온 brand_impression 계측이 1인당
이벤트를 0.76건에서 12.89건으로 밀어 올렸다 — 사람이 는 것과 계측이
바뀐 것이 같은 그래프에서 같은 모양으로 보인다. 08-18은 반대로
banner_impression이 아직 없어 전환율이 20.6%로 낮게 찍혔다(분자에
banner_click이 없다).

네 가지를 찍는다.

  tracking  이벤트가 처음 나타난 날. 그 전 구간은 그 지표가 0이다 —
            비교하면 안 되는 구간이라는 표시다. 원장에서 뽑는다.
  release   화면이 바뀐 날(web/src의 feat 커밋).
  spike     방문자가 평소의 몇 배로 뛴 날. 같은 날 release 표시가 같이
            서면 배포 탓이고, 혼자 서면 밖에서 온 것이다.
  infra     화면은 안 바뀌었는데 그래프가 꺾인 날 — 계측 도구 도입,
            robots·sitemap·IndexNow 같은 유입 경로 변경, 캐시·프록시
            같은 전송 변경, 수집 자동화로 오퍼 수가 계단식으로 는 날.
            자동으로 못 가리므로 INFRA_MARKS에 사람이 적는다.

주석 본문은 한 줄로 짧게 쓴다. PostHog는 눈금 옆에 그대로 펼쳐 그리므로
긴 글을 넣으면 그래프를 덮는다 — 실제로 09-02 개편 9건을 이어 붙였더니
한 줄이 화면을 가로질렀다. 자세한 내역은 docs/metrics/ANNOTATIONS.md에
같은 날짜로 남긴다.

인증은 Personal API Key다. 발급 화면에서 Annotation 항목을 **Write**로
두면 된다 — 같은 리소스의 읽기까지 덮는다. 못 읽는 키라면 --no-dedup으로
넘길 수 있지만, 그러면 다시 돌릴 때마다 같은 주석이 쌓인다.

프로젝트 토큰(phc_)은 쓰기 전용 수집 키라 여기에 못 쓴다.
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
# 환경변수가 없을 때 볼 자리. 저장소 밖이라 실수로 커밋될 수 없다.
KEY_FILE = os.environ.get("POSTHOG_KEY_FILE",
                          os.path.expanduser("~/.posthog_key"))
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DOC = os.path.join(REPO, "docs", "metrics", "ANNOTATIONS.md")

# 하루 중 언제로 찍을지. 자정으로 두면 전날 눈금에 붙어 보인다.
MARKER_HOUR = "T12:00:00Z"

# 눈금 옆 한 줄이 감당하는 길이. 넘으면 그래프를 덮는다.
CONTENT_MAX = 45

EMOJI = {"tracking": "📏", "release": "🛠", "spike": "📈", "infra": "🧱"}

# 화면(web/src)은 안 건드렸는데 그래프는 흔드는 것들.
#
# release_marks()는 web/src의 feat 커밋만 본다. 그래서 유입 경로를 바꾸는
# 것(robots·sitemap·IndexNow), 계측 경로를 바꾸는 것(GA4·PostHog SDK·
# 프록시), 데이터 양 자체를 바꾸는 것(수집 자동화)이 전부 안 찍힌다 —
# 정작 그래프가 꺾이는 자리는 거기다.
#
# 자동으로 못 뽑는다. 커밋 메시지만으로는 "이게 유입을 바꾼 변경인가"를
# 기계가 못 가른다(vercel.json 한 줄이 캐시 정책 전체를 바꾸기도 하고,
# 아무것도 안 바꾸기도 한다). 사람이 판단해 여기 적는다.
#
# 저장소가 둘이라(tracker/mono) 한쪽 git 이력만으로는 반쪽이다. 수집
# 자동화는 tracker 저장소에서 일어나고 그 결과가 이 사이트의 오퍼 수를
# 바꾼다 — 같은 표에 놓아야 "그날 왜 늘었나"가 보인다.
INFRA_MARKS = [
    # 계측 — 이 앞뒤로는 같은 지표라도 분모·분자가 다르다
    ("2026-07-29", "계측: Vercel Analytics 도입"),
    ("2026-07-31", "계측: GA4 임시 병행(ADR-002)"),
    ("2026-08-14", "계측: PostHog outbox 전달"),
    ("2026-08-19", "계측: PostHog 프론트 SDK"),
    ("2026-08-20", "계측: PostHog 직접 전송 + 원장 이중 기록"),
    # 유입 — 크롤러와 검색이 사이트를 보는 방식이 바뀐 날
    ("2026-08-28", "유입: IndexNow로 빙·네이버에 즉시 통보"),
    ("2026-09-07", "유입: robots.txt 신설 + sitemap lastmod 실제 변경일로"),
    # 비용·전송 — 요청 수가 꺾이는 자리
    ("2026-09-07", "비용: 정적 자산 캐시 헤더 + 로고 축소"),
    ("2026-09-07", "비용: PostHog 리버스 프록시 해제"),
    # 데이터 — 화면에 뜨는 오퍼 수가 계단식으로 바뀐 날
    ("2026-08-12", "데이터: 당일 행사 배너 도입"),
    ("2026-08-24", "데이터: 네 앱 전수조사 시작"),
    ("2026-08-31", "데이터: 리워드 설문 시작"),
    ("2026-09-03", "데이터: 배짱할인 자동 수집 + 확인주기 도입"),
    ("2026-09-07", "데이터: 브랜드 딥링크 76 -> 110곳"),
    ("2026-09-08", "데이터: 브랜드 로고 51곳 미보유 -> 14곳"),
]


class Mark:
    """하루치 표시 하나. 짧은 본문과 긴 내역을 따로 들고 있다."""

    __slots__ = ("day", "kind", "short", "detail")

    def __init__(self, day, kind, short, detail=()):
        self.day = day
        self.kind = kind
        self.short = short
        self.detail = list(detail)

    @property
    def content(self):
        """PostHog에 올릴 본문. 길면 자른다."""
        if len(self.short) <= CONTENT_MAX:
            return self.short
        return self.short[:CONTENT_MAX - 1].rstrip() + "…"

    def sort_key(self):
        return (self.day, self.kind)


def tracking_marks(src):
    """이벤트가 처음 나타난 날. 같은 날 여러 개면 개수만 앞에 세운다."""
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
    marks = []
    for day, events in sorted(by_day.items()):
        if day == start:
            continue
        events = sorted(events)
        # 한 종이면 이름을 그대로 보여준다. 여럿이면 개수만 — 이름을
        # 이어 붙이면 08-21처럼 네 개가 눈금을 덮는다.
        short = ("계측 +%s" % events[0] if len(events) == 1
                 else "계측 +%d종" % len(events))
        marks.append(Mark(day, "tracking", short, events))
    return marks


def release_marks():
    """화면이 바뀐 날. web/src를 건드린 feat 커밋만 본다."""
    out = subprocess.run(
        ["git", "-C", REPO, "log", "--pretty=%ad|%h|%s", "--date=short",
         "--", "web/src"],
        capture_output=True, text=True, encoding="utf-8", check=True).stdout
    by_day = collections.defaultdict(list)
    for line in out.splitlines():
        day, _, rest = line.partition("|")
        sha, _, subject = rest.partition("|")
        if subject.startswith("feat:"):
            by_day[day].append((sha, subject[len("feat:"):].strip()))
    marks = []
    for day, commits in sorted(by_day.items()):
        # 하루에 여럿이면 개수만 세운다. 제목을 이어 붙이면 09-02처럼
        # 아홉 건이 한 줄로 늘어져 그래프를 가로지른다.
        short = ("개편: %s" % commits[0][1] if len(commits) == 1
                 else "개편 %d건" % len(commits))
        marks.append(Mark(day, "release", short,
                          ["%s  %s" % (sha, subject)
                           for sha, subject in commits]))
    return marks


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
        marks.append(Mark(day, "spike", "급증 %.1f배" % (len(who) / median),
                          ["방문자 %d명 (평소 중앙값 %d명의 %.1f배)"
                           % (len(who), median, len(who) / median),
                           "신규 방문자 %.0f%%" % new]))
    return marks


KIND_TITLE = {"tracking": "계측 추가", "release": "개편", "spike": "트래픽 급증",
              "infra": "기반 변경"}


def infra_marks():
    """화면 밖에서 그래프를 흔든 날. INFRA_MARKS 주석 참고."""
    by_day = collections.defaultdict(list)
    for day, text in INFRA_MARKS:
        by_day[day].append(text)
    marks = []
    for day, items in sorted(by_day.items()):
        short = items[0] if len(items) == 1 else "기반 변경 %d건" % len(items)
        marks.append(Mark(day, "infra", short, items))
    return marks


def write_doc(marks, path):
    """주석 본문에 안 들어간 내역을 날짜별로 남긴다."""
    lines = [
        "# 주석 상세",
        "",
        "PostHog 그래프의 세로선 하나하나가 무엇인지 적어 둔다. 주석 본문은",
        "눈금을 덮지 않게 한 줄로 줄이므로, 실제 내역은 여기서 본다.",
        "",
        "`scripts/annotate_posthog.py`가 만든다 — 손으로 고치지 말고 다시 돌려라.",
    ]
    for day in sorted({m.day for m in marks}, reverse=True):
        lines += ["", "## %s" % day, ""]
        for mark in sorted((m for m in marks if m.day == day),
                           key=lambda m: m.kind):
            lines.append("**%s %s** — `%s`"
                         % (EMOJI[mark.kind], KIND_TITLE[mark.kind],
                            mark.content))
            lines.append("")
            lines += ["- %s" % one for one in mark.detail]
            lines.append("")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines).rstrip() + "\n")


def read_key():
    """환경변수 우선, 없으면 키 파일.

    키 파일은 저장소 밖에 둔다 — .gitignore에 기대면 그 줄이 지워지는
    날 그대로 올라간다.
    """
    key = os.environ.get(KEY_VAR)
    if key:
        return key.strip()
    try:
        with open(KEY_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        return None


def call(key, path, method="GET", payload=None):
    url = "%s/api/projects/%s/%s" % (HOST, PROJECT, path)
    headers = {"Authorization": "Bearer " + key}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method,
                                 headers=headers)
    with urllib.request.urlopen(req, timeout=20) as res:
        raw = res.read().decode("utf-8")
    return json.loads(raw) if raw else None


def fetch_all(key):
    return call(key, "annotations/?limit=500")["results"]


def post(key, mark):
    return call(key, "annotations/", "POST",
                {"date_marker": mark.day + MARKER_HOUR,
                 "content": mark.content,
                 "emoji": EMOJI[mark.kind],
                 "scope": "project"})["id"]


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--kind", choices=("tracking", "release", "spike", "infra", "all"),
                   default="all")
    p.add_argument("--src", help="원장 파일. 없으면 서버에서 받는다")
    p.add_argument("--apply", action="store_true", help="실제로 올린다")
    p.add_argument("--since", default="2026-07-29", help="이 날 이후만")
    p.add_argument("--no-dedup", action="store_true",
                   help="기존 주석을 안 읽는다. 겹쳐 쌓일 수 있다")
    p.add_argument("--reset", action="store_true",
                   help="기존 주석을 다 지우고 다시 찍는다")
    p.add_argument("--doc", default=DOC, help="상세를 적을 파일")
    args = p.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    marks = []
    if args.kind in ("tracking", "all"):
        marks += tracking_marks(args.src)
    if args.kind in ("release", "all"):
        marks += release_marks()
    if args.kind in ("spike", "all"):
        marks += spike_marks(args.src)
    if args.kind in ("infra", "all"):
        marks += infra_marks()
    marks = sorted((m for m in marks if m.day >= args.since),
                   key=Mark.sort_key)

    write_doc(marks, args.doc)
    print("상세: %s" % os.path.relpath(args.doc, REPO))

    if not args.apply:
        for mark in marks:
            print("%s  %s %s" % (mark.day, EMOJI[mark.kind], mark.content))
        print("\n%d건. 올리려면 --apply." % len(marks))
        return 0

    key = read_key()
    if not key:
        # 여기서 멈춘다. 키 없이 올리면 401이 건건이 나면서 절반쯤
        # 올라간 상태가 된다.
        print("\n".join((
            "키가 없다. 둘 중 하나로 준다:",
            "  환경변수 %s" % KEY_VAR,
            "  파일 %s (한 줄로 키만)" % KEY_FILE,
            "PostHog 발급 화면에서 Annotation을 Write로 둔다.")),
            file=sys.stderr)
        return 2

    already = set()
    if args.reset or not args.no_dedup:
        try:
            current = fetch_all(key)
        except urllib.error.HTTPError as err:
            # 읽기가 막힌 키로 그냥 올리면 돌릴 때마다 같은 주석이 쌓이고,
            # 지우는 것은 손으로 해야 한다. 여기서 멈추는 편이 싸다.
            print("기존 주석을 못 읽었다 (%s). "
                  "발급 화면에서 Annotation을 Write로 두면 읽기까지 된다. "
                  "그대로 올리려면 --no-dedup." % err, file=sys.stderr)
            return 2
        if args.reset:
            # 이 스크립트가 만든 것만 지운다. 처음에는 전부 지웠다가
            # 손으로 찍어 둔 주석 2건까지 같이 날렸다 — 소프트 삭제라
            # 사라지기만 하고 되살릴 ID를 찾을 길이 없었다.
            # 표식은 이모지다. 사람이 UI에서 찍을 때는 안 붙는다.
            ours = [a for a in current if a.get("emoji") in set(EMOJI.values())]
            kept = len(current) - len(ours)
            # DELETE는 405를 준다. 지우는 것이 아니라 deleted 표시를 다는
            # 것이고, 그래프에서는 똑같이 사라진다.
            for one in ours:
                call(key, "annotations/%s/" % one["id"], "PATCH",
                     {"deleted": True})
            print("지웠다: %d건 (내 것 아닌 %d건은 뒀다)" % (len(ours), kept))
        else:
            already = {(a.get("date_marker", "")[:10], a.get("content"))
                       for a in current}

    added = skipped = 0
    for mark in marks:
        if (mark.day, mark.content) in already:
            skipped += 1
            continue
        post(key, mark)
        added += 1
    print("새로 %d건, 이미 있어 건너뜀 %d건." % (added, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
