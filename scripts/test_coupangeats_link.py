"""쿠팡이츠 공유 링크 검사기와 교체기(설계 227). 네트워크 없이 픽스처로 돈다."""
import datetime
import urllib.error

import pytest

import coupangeats_link as cl

# 2026-11-03 이번 주 공유 링크 응답 본문의 앱 링크 meta 한 줄(실측, 허브 키 자리만 남김)
REAL = ('<meta property="al:android:url" content="coupangeats://Web?url&#x3D;https%3A%2F%2F'
        'eats-mobile-web.coupang.com%2Fpromotion%2Flanding-page-v5%3Fkey%3DV5_DEAL_{}_HL&amp;navType&#x3D;push">')
MON = datetime.date(2026, 11, 2)
OLD, NEW = 'https://share.coupangeats.com/OldTestKey1', 'https://share.coupangeats.com/NewTestKey2'


def body(mmdd):
    return lambda link: REAL.format(mmdd)


def reason(fn):
    with pytest.raises(cl.Fail) as e:
        fn()
    return e.value.args[0]


def test_this_week_key_passes_any_day_of_the_week():
    for d in range(7):
        assert cl.check(NEW, MON + datetime.timedelta(days=d), body('1102')) == '1102'


def test_last_week_key_is_date_mismatch():
    assert reason(lambda: cl.check(NEW, MON, body('1026'))) == '날짜 어긋남'


def test_network_error_is_unresolved_not_absent():
    def boom(link):
        raise urllib.error.URLError('timeout')
    assert reason(lambda: cl.check(NEW, MON, boom)) == '못 풀었음'


def test_body_without_key_is_no_key():
    assert reason(lambda: cl.check(NEW, MON, lambda l: '<html>쿠팡이츠</html>')) == '키 없음'


def test_wrong_format():
    assert reason(lambda: cl.check('https://example.com/x', MON, body('1102'))) == '형식 틀림'


def test_year_end_week_uses_previous_years_monday():
    assert cl.check(NEW, datetime.date(2027, 1, 1), body('1228')) == '1228'  # 2026-12-28 월요일


def tree(tmp_path, js_nl='\n'):
    (tmp_path / 'web/src').mkdir(parents=True)
    js = f"// a{js_nl}export const COUPANGEATS_LINK = '{OLD}'{js_nl}x{js_nl}"
    snap = '{\n  "wow": "<a href=\\"' + OLD + '\\" target=\\"_blank\\">"\n}\n'
    (tmp_path / cl.FILES[0]).write_bytes(js.encode())
    (tmp_path / cl.FILES[1]).write_bytes(snap.encode())
    return js, snap


def read(tmp_path):
    return [(tmp_path / f).read_bytes().decode() for f in cl.FILES]


def test_replace_changes_only_the_link_in_both_files(tmp_path):
    js, snap = tree(tmp_path, '\r\n')
    assert cl.replace(NEW, tmp_path, MON, body('1102')) is True
    assert read(tmp_path) == [js.replace(OLD, NEW), snap.replace(OLD, NEW)]
    assert cl.replace(NEW, tmp_path, MON, body('1102')) is False  # 두 번 돌려도 그대로
    assert read(tmp_path) == [js.replace(OLD, NEW), snap.replace(OLD, NEW)]


def test_failed_check_leaves_files_untouched(tmp_path):
    before = tree(tmp_path)
    assert reason(lambda: cl.replace(NEW, tmp_path, MON, body('1026'))) == '날짜 어긋남'
    assert read(tmp_path) == list(before)


def test_snapshot_must_hold_exactly_the_current_link(tmp_path):
    js, snap = tree(tmp_path)
    (tmp_path / cl.FILES[1]).write_bytes((snap + OLD).encode())
    assert reason(lambda: cl.replace(NEW, tmp_path, MON, body('1102'))) == '교체 불가'
    assert read(tmp_path) == [js, snap + OLD]
