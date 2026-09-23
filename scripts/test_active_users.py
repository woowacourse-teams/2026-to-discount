"""활성 사용자 집계 규칙. dev·bot 제외와 기간 창이 맞는지."""
import collections
import datetime

import active_users as au


class FakeVisitor:
    def __init__(self, dev=False, bot=None):
        self.dev, self.bot = dev, bot


def test_visits_and_clicks_are_counted_separately():
    """방문과 활성은 다른 숫자다 — 화면만 보고 나간 사람은 아직 아무 일도 안 했다."""
    people = {"a": FakeVisitor(), "b": FakeVisitor(),
              "dev": FakeVisitor(dev=True), "bot": FakeVisitor(bot="crawler")}
    rows = [
        ("2026-09-20", "a", "page_view", {}, "", "", ""),
        ("2026-09-20", "a", "offer_link_click", {}, "", "", ""),
        ("2026-09-20", "b", "page_view", {}, "", "", ""),
        ("2026-09-20", "dev", "offer_link_click", {}, "", "", ""),
        ("2026-09-20", "bot", "page_view", {}, "", "", ""),
    ]
    visited, active = au.buckets(rows, people)
    assert visited["2026-09-20"] == {"a", "b"}          # dev·bot은 빠진다
    assert active["2026-09-20"] == {"a"}


def test_a_window_counts_each_person_once():
    """WAU는 7일 동안의 **고유** 사람 수다. 매일 온 사람을 일곱 번 세면 안 된다."""
    visited = collections.defaultdict(set)
    for i in range(7):
        visited[(datetime.date(2026, 9, 20) - datetime.timedelta(days=i)).isoformat()] = {"a"}
    visited["2026-09-20"] = {"a", "b"}
    assert au.window(visited, datetime.date(2026, 9, 20), 7) == 2
    assert au.window(visited, datetime.date(2026, 9, 20), 1) == 2
    assert au.window(visited, datetime.date(2026, 9, 19), 1) == 1


def test_the_table_ends_on_the_last_day_with_data():
    people = {"a": FakeVisitor()}
    rows = [("2026-09-20", "a", "banner_click", {}, "", "", "")]
    visited, active = au.buckets(rows, people)
    got = au.table(visited, active, 3)
    assert [r["date"] for r in got] == ["2026-09-18", "2026-09-19", "2026-09-20"]
    assert got[-1]["dau_active"] == 1 and got[-1]["wau_active"] == 1
