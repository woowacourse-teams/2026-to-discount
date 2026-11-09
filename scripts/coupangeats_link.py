"""쿠팡이츠 주간 공유 링크 검사기와 교체기(설계 docs/design/227).

  python scripts/coupangeats_link.py check <링크> [--today YYYY-MM-DD]
  python scripts/coupangeats_link.py replace <링크> [--root <mono 경로>] [--today YYYY-MM-DD]

종료 코드: 0 통과(교체했거나 이미 같음), 1 실패(사유 한 줄, stdout `FAIL <사유>: ...`), 2 사용법 틀림.
허브 키 `V5_DEAL_<월일>_HL`은 공유 링크 응답 본문(앱 링크 meta)에 들어 있다(2026-11-03 실측, 리디렉션 없이 200).
"""
import argparse
import datetime
import re
import sys
import urllib.request
from pathlib import Path

PREFIX = 'https://share.coupangeats.com/'
LINK_RE = re.compile(r'https://share\.coupangeats\.com/[A-Za-z0-9]+')
KEY_RE = re.compile(r'V5_DEAL_(\d{4})_HL')
CONST_RE = re.compile(r"(export const COUPANGEATS_LINK = ')([^']*)(')")
KST = datetime.timezone(datetime.timedelta(hours=9))
FILES = ('web/src/offerLink.js', 'web/src/offerChip.snapshot.json')


class Fail(Exception):
    """사유(형식 틀림, 못 풀었음, 키 없음, 날짜 어긋남, 교체 불가) + 설명."""


def fetch(link):
    req = urllib.request.Request(link, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:  # 200이 아니면 HTTPError
        return r.read().decode('utf-8', 'replace')


def monday_mmdd(today):
    return (today - datetime.timedelta(days=today.weekday())).strftime('%m%d')


def check(link, today, get=fetch):
    if not LINK_RE.fullmatch(link or ''):
        raise Fail('형식 틀림', f'{PREFIX}<키> 꼴이 아님: {link!r}')
    try:
        body = get(link)
    except Exception as e:  # 네트워크, 시간 초과, 200 아님: 옛 링크인지 모른다
        raise Fail('못 풀었음', f'{type(e).__name__}: {e}')
    keys = set(KEY_RE.findall(body))
    if not keys:
        raise Fail('키 없음', f'응답 {len(body)}자에 V5_DEAL_<월일>_HL 없음')
    want = monday_mmdd(today)
    if keys != {want}:
        raise Fail('날짜 어긋남', f'허브 키 {sorted(keys)}, 이번 주 월요일 {want}')
    return want


def replace(link, root, today, get=fetch):
    check(link, today, get)  # 통과 전에는 아무 파일도 안 건드린다
    js_path, snap_path = (Path(root) / f for f in FILES)
    js, snap = js_path.read_bytes().decode('utf-8'), snap_path.read_bytes().decode('utf-8')
    m = CONST_RE.search(js)
    if not m or len(CONST_RE.findall(js)) != 1:
        raise Fail('교체 불가', f'{FILES[0]}에 COUPANGEATS_LINK 선언이 정확히 한 곳이 아님')
    old = m.group(2)
    if LINK_RE.findall(snap) != [old]:  # wow 한 곳에 상수와 같은 링크
        raise Fail('교체 불가', f'{FILES[1]}의 쿠팡이츠 링크가 상수와 같은 한 곳이 아님')
    if old == link:
        return False
    new_js = js[:m.start(2)] + link + js[m.end(2):]
    new_snap = snap.replace(old, link)
    assert old not in new_js and old not in new_snap
    js_path.write_bytes(new_js.encode('utf-8'))  # 줄바꿈 그대로
    snap_path.write_bytes(new_snap.encode('utf-8'))
    return True


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('cmd', choices=['check', 'replace'])
    p.add_argument('link')
    p.add_argument('--root', default=str(Path(__file__).resolve().parent.parent))
    p.add_argument('--today', type=datetime.date.fromisoformat,
                   default=datetime.datetime.now(KST).date())
    a = p.parse_args(argv)
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        if a.cmd == 'check':
            print(f'OK 허브 키 V5_DEAL_{check(a.link, a.today)}_HL')
        else:
            print('OK 교체함' if replace(a.link, a.root, a.today) else 'OK 이미 같은 링크')
    except Fail as e:
        print(f'FAIL {e.args[0]}: {e.args[1]}')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
