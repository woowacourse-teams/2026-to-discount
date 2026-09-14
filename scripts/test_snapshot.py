"""스냅샷이 없는 숫자를 지어내지 않는지 검사한다.

2026-09-06 첫 판에서 금액대별 클릭률이 138%로 나왔다 — 분모로 쓴
brand_impression이 클릭보다 적게 잡히는데 그대로 나눴다. 문서로 남는
숫자라 한 번 틀리면 그 값이 근거로 인용된다. 비율을 만드는 자리마다
경계 하나씩 남긴다.
"""
import argparse
import datetime

import snapshot as sn


def rows(*triples):
    """(날짜, 방문자, 이벤트) -> load()가 주는 모양."""
    return [(d, v, e, None, d, "s", "/") for d, v, e in triples]


class FakePerson:
    """keep()이 보는 것만 흉내낸다."""
    bot = None
    returning = False
    days = ("2026-09-01",)

    def looks_developer(self):
        return False


def people_for(rs):
    return {vid: FakePerson() for _d, vid, *_ in rs}


ARGS = argparse.Namespace(goal="offer_link_click", include_dev=False,
                          include_bots=False, only=None, since=None, until=None)


def test_week_starts_on_monday():
    assert sn.week_of("2026-09-06") == datetime.date(2026, 8, 31)  # 일요일
    assert sn.week_of("2026-08-31") == datetime.date(2026, 8, 31)


def test_future_weeks_are_blank_not_zero():
    """아직 안 온 주를 0%로 적으면 리텐션이 붕괴한 것처럼 읽힌다."""
    rs = rows(("2026-08-31", "v1", "page_view"))
    out = "\n".join(sn.sec_retention(people_for(rs), rs, ARGS))

    assert "0.0%" not in out
    assert out.count("—") == 3  # W+1..W+3 모두 아직 안 왔다


def test_past_week_without_return_is_zero():
    """빈칸과 0%는 다른 말이다 — 지나간 주에 안 왔으면 0%로 적는다."""
    rs = rows(("2026-08-24", "v1", "page_view"),
              ("2026-08-31", "v2", "page_view"))
    out = "\n".join(sn.sec_retention(people_for(rs), rs, ARGS))

    assert "0 (0.0%)" in out  # 08-24 코호트의 W+1


def test_unclosed_windows_are_left_out_of_the_denominator():
    """어제 처음 온 사람은 D8–14에 "안 왔다"가 아니라 "모른다"다.

    분모에 넣으면 최근 코호트일수록 낮게 찍혀 하락처럼 읽힌다
    (2026-09-14, PostHog 리텐션 표). 원장 마지막 날이 09-10이면
    09-01 첫 방문자는 D8–14(09-09~09-15)가 아직 안 닫혔다.
    """
    rs = rows(("2026-08-01", "v1", "page_view"),   # D1·D2–7·D8–14 전부 닫힘
              ("2026-08-02", "v1", "page_view"),   # D1 복귀
              ("2026-08-10", "v1", "page_view"),   # D8–14 복귀
              ("2026-09-01", "v2", "page_view"),   # D8–14 안 닫힘
              ("2026-09-10", "v3", "page_view"))   # 아무 창도 안 닫힘
    out = "\n".join(sn.sec_retention_windows(people_for(rs), rs, ARGS))

    # 전체 행: D1은 v1·v2만 관측 가능(v3는 09-11이 원장 밖), D8–14는 v1만.
    assert "| **전체(관측 가능만)** | 3 | 1/2 (50.0%) | 0/2 (0.0%) | 1/1 (100.0%) |" in out


def test_weekly_and_weekday_returners_are_counted():
    """금요일마다 오는 사람은 W+1 표엔 없고 여기엔 있어야 한다."""
    fridays = ["2026-08-07", "2026-08-14", "2026-08-21", "2026-08-28"]
    rs = rows(*[(d, "v1", "page_view") for d in fridays],
              ("2026-08-01", "v2", "page_view"), ("2026-08-02", "v2", "page_view"),
              ("2026-08-03", "v2", "page_view"))
    out = "\n".join(sn.sec_periodic_return(people_for(rs), rs, ARGS))

    assert "주간 주기(간격 중앙값 6~8일) **1명" in out
    assert "특정 요일 집중(최빈 요일 60%↑) **1명" in out
    assert "집중 요일: 금 1명" in out


def test_amount_band_edges():
    band = lambda w: next(n for lo, hi, n in sn.BANDS if lo <= w < hi)

    assert band(2999) == "3천원 미만"
    assert band(3000) == "3~5천원"
    assert band(4999) == "3~5천원"
    assert band(5000) == "5~8천원"
    assert band(8000) == "8천원 이상"


def test_amount_rate_is_per_brand_not_per_impression(monkeypatch):
    """브랜드 수로 나눈다. 노출로 나누면 100%를 넘는 값이 나온다."""
    monkeypatch.setattr(sn, "_amounts", lambda: {"가": 9000, "나": 9000})
    rs = [("2026-09-01", "v%d" % i, "offer_link_click", {"brand": "가"},
           "2026-09-01", "s", "/") for i in range(10)]
    out = sn.sec_amount(people_for(rs), rs, ARGS)

    # 브랜드 2곳에 10명이 눌렀다 -> 5.0명. 비율이 아니라 인원이므로
    # 100을 넘어도 이상하지 않고, 넘을 일도 없다.
    assert "| 8천원 이상 | 2 | 10 | 5.0명 |" in out


def test_banner_counts_people_not_clicks():
    """한 사람이 세 번 누른 배너가 세 명짜리 배너를 이기면 안 된다."""
    rs = [("2026-09-01", "v1", "banner_click", {"banner": "많이누름"},
           "2026-09-01", "s", "/")] * 3
    rs += [("2026-09-01", "v%d" % i, "banner_click", {"banner": "여럿이누름"},
            "2026-09-01", "s", "/") for i in range(2, 4)]
    out = sn.sec_banner(people_for(rs), rs, ARGS)
    table = [line for line in out if line.startswith("| ")][1:]  # 머리글 한 줄

    assert table[0].startswith("| 여럿이누름 | 2 ")
    assert table[1].startswith("| 많이누름 | 1 ")


def test_click_without_banner_prop_is_kept_as_unknown():
    """계측 전 클릭 55건을 버리면 그 달 배너가 안 눌린 것처럼 보인다."""
    rs = [("2026-08-01", "v1", "banner_click", None, "2026-08-01", "s", "/")]
    out = "\n".join(sn.sec_banner(people_for(rs), rs, ARGS))

    assert "미상(계측 전)" in out


class WidePerson(FakePerson):
    widths = frozenset({1440})
    devices = frozenset({"desktop"})


class NarrowPerson(FakePerson):
    """hover:hover를 보고하는 안드로이드 — device는 desktop이라고 말한다."""
    widths = frozenset({390})
    devices = frozenset({"desktop"})


class NoWidthPerson(FakePerson):
    widths = frozenset()
    devices = frozenset({"mobile"})


def test_narrow_desktop_is_a_phone():
    """이 오분류가 기기별 전환율 결론을 통째로 뒤집었다(2026-09-06)."""
    assert sn.real_device(NarrowPerson()) == "폰"
    assert sn.real_device(WidePerson()) == "데스크톱"


def test_unknown_width_is_kept_apart():
    """가를 근거가 없는 방문자를 한쪽에 몰면 그 집단이 오염된다."""
    assert sn.real_device(NoWidthPerson()) == "폭 미상"
