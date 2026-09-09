#!/usr/bin/env python3
"""서비스 지표 대시보드를 PostHog에 세운다.

  scripts/posthog_dashboards.py              # 질의를 실행해 결과만 보여준다
  scripts/posthog_dashboards.py --apply      # 대시보드와 인사이트를 올린다
  scripts/posthog_dashboards.py --only 실질  # 이름에 그 말이 든 것만

## 왜 스크립트로 만드나

PostHog 화면에서 손으로 만들면 정의가 그 화면에만 남는다. 실제로 그렇게
만든 인사이트 55개 중 **28개가 `dev_suspect IS NULL` 필터를 들고 있다** —
우리가 이미 틀렸다고 판정하고 서버에서 걷어낸 규칙이다(§4.3). 한 곳을
고쳐도 나머지 27곳은 그대로다. 정의를 코드에 두면 고칠 자리가 하나다.

## 무엇을 사람으로 보는가 — 여기 한 곳에서만 정한다

  뺀다   테스트 코호트(464290·500325), 스스로 밝힌 크롤러(properties.bot)
  안 뺀다 `dev_suspect` — 이 표시가 붙은 106명을 전부 다시 세어 보니
         한 명도 빠짐없이 폰이었다(세션 내내 폭이 하나). 개발자가 아니다.
         명시 개발 트래픽(`?dev=1`)은 서버가 PostHog로 아예 안 보낸다.

`dev_suspect`는 2026-08-21~28에만 찍혔고 그중 08-24 하루가 1,778건(80명)
이다. 그날은 그 주에서 방문자가 가장 많았던 날이라, 이 필터를 든 인사이트는
하필 가장 큰 표본에서 폰 사용자를 조용히 덜어내고 있다.

## 판정은 여전히 원장에서 한다

여기 있는 것은 **탐색용 화면**이다. 발표할 숫자는 `scripts/snapshot.py`가
원장에서 다시 낸다 — PostHog는 보낸 시점의 속성이 박혀 되돌릴 수 없고,
원장은 원본이 남아 재계산이 된다(ANALYTICS-CAPABILITY.md §3.3).
그래서 같은 지표를 양쪽에 두고, 갈리면 원장이 이긴다.

인증은 annotate_posthog.py와 같은 Personal API Key다. Insight·Dashboard
쓰기와 Query 읽기 권한이 필요하다.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HOST = os.environ.get("POSTHOG_HOST", "https://us.posthog.com")
PROJECT = os.environ.get("POSTHOG_PROJECT_ID", "548055")
KEY_VAR = "POSTHOG_PERSONAL_API_KEY"
KEY_FILE = os.environ.get("POSTHOG_KEY_FILE", os.path.expanduser("~/.posthog_key"))

DASHBOARD = "서비스 지표 — 재사용·실질 사용자·성공 신호"
DASHBOARD_NOTE = (
    "재사용(충성·재방문 주기), 크롤러를 뺀 실질 사용자, 고유 사용자 기준 "
    "성공 신호, A/B 표본 충분성, 설문 누계를 한 장에서 본다.\n\n"
    "공통: 테스트 코호트와 스스로 밝힌 크롤러를 뺀다. dev_suspect는 쓰지 "
    "않는다 — 그 표시가 붙은 106명이 전부 폰이었다(개발자 0명).\n\n"
    "정의는 scripts/posthog_dashboards.py에 있다. 화면에서 고치면 다음 "
    "실행에 덮인다. 발표용 숫자는 scripts/snapshot.py가 원장에서 낸다."
)

# 손으로 만든 테스트 사용자 묶음. 기존 인사이트가 쓰던 것과 같은 것을 쓴다.
TEST_COHORTS = (464290, 500325)

# 배달앱으로 나가는 모든 길. experiments.GOAL과 같은 정의다 — 08-19에
# 배너가 생기면서 나가는 길이 하나 더 늘었고, offer_link_click 하나로만
# 세면 그날 이후가 무조건 낮게 나온다(ANALYTICS-CAPABILITY.md §5.2).
GOAL = "('offer_link_click', 'banner_click')"

# 사람만 남기는 조건. 모든 질의가 이 한 줄을 쓴다.
PEOPLE = """toString(person_id) NOT IN (
        SELECT person_id FROM static_cohort_people WHERE cohort_id IN (%s)
    )
    AND properties.bot IS NULL""" % ", ".join(str(c) for c in TEST_COHORTS)

WINDOW = "timestamp >= now() - INTERVAL 60 DAY"

# A/B는 갈래를 싣기 시작한 날부터만 본다. 그 전 구간은 갈래가 없어
# 분모에 못 들어간다.
AB_START = "2026-08-20"
AB_WINDOW = "timestamp >= toDateTime('%s 00:00:00')" % AB_START

# "옵션을 설정했다"로 보는 동작. 분류·플랫폼·필터·검색·멤버십 — 목록을
# 좁히는 조작이면 전부 넣는다.
#
# `membership_open`은 뺀다. 2026-08-13에 사라진 이벤트라 A/B 구간
# (08-20~)에 아예 없다 — 넣으면 0인 칸이 하나 늘 뿐이다.
# `brand_expand`도 뺀다. 목록을 좁히는 게 아니라 고른 뒤에 확인하는
# 행동이고, 실제로 링크 클릭 '뒤'에 오는 경우가 많아 앞 단계로 두면
# 퍼널이 거꾸로 선다(ANALYTICS-CAPABILITY.md §5.1).
SETTING = ("('category_change', 'platform_filter_toggle', 'filters_apply', "
           "'filter_sheet_open', 'filters_reset', 'brand_search_submitted', "
           "'membership_toggle')")

# 갈래는 갈래를 실은 이벤트에서만 읽는다. 행동은 그 사람의 모든
# 이벤트에서 본다 — 한 CTE에서 같이 뽑으면 variant를 안 싣는 이벤트가
# 통째로 빠진다(실측: 전환율이 38.1%에서 32.9%로 내려앉았다).
VARIANTS_CTE = """variants AS (
    SELECT distinct_id, argMin(toString(properties.variant), timestamp) AS variant
    FROM events
    WHERE {ab} AND {people} AND toString(properties.variant) IN ('a', 'b')
    GROUP BY distinct_id
)"""


def variants_cte():
    return VARIANTS_CTE.format(ab=AB_WINDOW, people=PEOPLE)


# PostHog가 받는 설명 길이. 넘기면 400 에러가 나는데, 인사이트를 절반쯤
# 만든 뒤에 터져서 앞의 것만 올라간 상태로 멈춘다 — 올리기 전에 센다.
DESCRIPTION_MAX = 400


def q(sql, display="ActionsTable"):
    return {"kind": "DataVisualizationNode",
            "source": {"kind": "HogQLQuery", "query": sql.strip()},
            "display": display}


INSIGHTS = [
    # ---- 3. 일 평균 사용자와 실질 사용자 --------------------------------
    {
        "name": "실질 사용자 — 일별 (크롤러 제외)",
        "description":
            "하루에 몇 명이 왔는가. 스스로 User-Agent로 밝힌 크롤러를 뺀 "
            "수가 '실질'이다.\n\n"
            "주의: properties.bot은 2026-09-09에 서버가 PostHog로 보내기 "
            "시작했다. 그 이전 구간은 크롤러가 0으로 보이지만 실제로는 "
            "섞여 있다 — 원장 기준 2026-08-28은 하루 방문자의 10.4%가 "
            "크롤러였다. 그 구간 값은 snapshot.py의 '실질 사용자' 표를 봐라.\n\n"
            "이름을 숨기는 수집기는 안 잡힌다. 이 열은 크롤러의 하한이다.",
        "query": q(f"""
SELECT
    toDate(timestamp) AS `날짜`,
    count(DISTINCT distinct_id) AS `방문자`,
    count(DISTINCT if(properties.bot IS NOT NULL, distinct_id, NULL)) AS `크롤러`,
    count(DISTINCT if(properties.bot IS NULL, distinct_id, NULL)) AS `실질 사용자`
FROM events
WHERE {WINDOW}
  AND toString(person_id) NOT IN (
      SELECT person_id FROM static_cohort_people WHERE cohort_id IN ({", ".join(str(c) for c in TEST_COHORTS)})
  )
GROUP BY `날짜`
ORDER BY `날짜`
""", "ActionsLineGraph"),
    },
    # ---- 1. 충성 사용자 --------------------------------------------------
    {
        "name": "재사용 — 활동일수 분포",
        "description":
            "며칠에 걸쳐 다시 왔는가. 방문 '횟수'가 아니라 서로 다른 '날' "
            "수로 센다 — 한 번 와서 새로고침을 스무 번 한 사람과 스무 날에 "
            "걸쳐 온 사람을 같게 세면 안 된다.\n\n"
            "로그인이 없어 visitorId는 브라우저 localStorage 난수다. 기기를 "
            "갈아타거나 데이터를 지우면 같은 사람이 새 사람으로 쪼개진다. "
            "그러므로 이 표는 재사용의 하한이다 — 실제보다 낮게 나오지 "
            "높게 나오지 않는다.",
        "query": q(f"""
WITH active AS (
    SELECT distinct_id, count(DISTINCT toDate(timestamp)) AS days
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
    GROUP BY distinct_id
)
SELECT
    multiIf(days = 1, '1일', days = 2, '2일', days <= 4, '3~4일',
            days <= 7, '5~7일', days <= 14, '8~14일', '15일 이상') AS `활동일`,
    count() AS `사람`,
    round(count() / (SELECT count() FROM active) * 100, 1) AS `비중`
FROM active
GROUP BY `활동일`
ORDER BY min(days)
"""),
    },
    {
        "name": "재사용 — 주별 충성 사용자 비율",
        "description":
            "그 주에 온 사람 중 이틀 이상·사흘 이상 온 사람의 비율.\n\n"
            "분모를 '그 주 방문자'로 둔다. 누적 사용자를 분모로 두면 서비스가 "
            "오래될수록 비율이 저절로 떨어져 아무것도 말하지 않는다.\n\n"
            "절대 수가 아니라 비율로 보는 이유는 홍보일 때문이다 — 하루 "
            "방문자가 4배로 뛴 날이 여럿 있고, 그런 주는 신규가 몰려 들어와 "
            "충성 사용자 '수'가 늘어도 비율은 떨어진다.",
        "query": q(f"""
WITH active AS (
    SELECT
        distinct_id,
        toStartOfWeek(timestamp, 1) AS week,
        count(DISTINCT toDate(timestamp)) AS days
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
    GROUP BY distinct_id, week
)
SELECT
    week AS `주`,
    count() AS `그 주 방문자`,
    countIf(days >= 2) AS `2일 이상`,
    round(countIf(days >= 2) / count() * 100, 1) AS `2일 이상 비율`,
    countIf(days >= 3) AS `3일 이상`,
    round(countIf(days >= 3) / count() * 100, 1) AS `3일 이상 비율`
FROM active
GROUP BY `주`
ORDER BY `주`
"""),
    },
    # ---- 2. 띄엄띄엄 재방문 ---------------------------------------------
    {
        "name": "재사용 — 다시 오기까지의 간격",
        "description":
            "다시 온 사람이 며칠 만에 왔는가. 같은 사람의 활동일을 정렬해 "
            "이웃한 날 사이의 간격을 전부 센다.\n\n"
            "리텐션 코호트(W+1, W+2)는 '다음 주에 왔나'만 본다. 2주 쉬었다 "
            "오는 사람은 그 표에서 이탈로 잡히는데, 이 서비스는 매일 여는 "
            "도구가 아니라 시켜 먹을 때 여는 도구다. 그 사람이야말로 살아 "
            "있는 사용자라 따로 센다.\n\n"
            "원장 기준으로 다시 온 609명 중 488명(80.1%)이 하루 이상 띄우고 "
            "돌아왔다 — 연달아 오는 쪽이 오히려 소수다.",
        "query": q(f"""
WITH active AS (
    SELECT distinct_id, arraySort(groupUniqArray(toDate(timestamp))) AS days
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
    GROUP BY distinct_id
),
gaps AS (
    SELECT arrayJoin(arrayMap(
        (later, earlier) -> dateDiff('day', earlier, later),
        arraySlice(days, 2), arraySlice(days, 1, length(days) - 1))) AS gap
    FROM active
    WHERE length(days) >= 2
)
SELECT
    multiIf(gap = 1, '다음 날', gap <= 3, '2~3일', gap <= 7, '4~7일',
            gap <= 14, '8~14일', '15일 이상') AS `다시 오기까지`,
    count() AS `횟수`,
    round(count() / (SELECT count() FROM gaps) * 100, 1) AS `비중`
FROM gaps
GROUP BY `다시 오기까지`
ORDER BY min(gap)
"""),
    },
    {
        "name": "재사용 — 주별 신규·유지·복귀",
        "description":
            "그 주에 온 사람을 셋으로 가른다. 처음 온 사람(신규), 지난주에도 "
            "온 사람(유지), 지난주에는 안 왔는데 이번 주에 온 기존 "
            "사용자(복귀).\n\n"
            "'복귀'가 코호트 표에서 이탈로 잡히던 사람들이다. 이 줄이 두꺼우면 "
            "DAU 같은 '붙잡아 두는' 지표로 이 서비스를 재는 것 자체가 틀린 "
            "것이다.",
        "query": q(f"""
WITH weekly AS (
    SELECT DISTINCT distinct_id, toStartOfWeek(timestamp, 1) AS week
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
),
firsts AS (
    SELECT distinct_id, min(week) AS first_week FROM weekly GROUP BY distinct_id
)
SELECT
    w.week AS `주`,
    countIf(w.week = f.first_week) AS `신규`,
    countIf(w.week != f.first_week
            AND (w.distinct_id, w.week - INTERVAL 7 DAY) IN (
                SELECT distinct_id, week FROM weekly)) AS `유지`,
    countIf(w.week != f.first_week
            AND (w.distinct_id, w.week - INTERVAL 7 DAY) NOT IN (
                SELECT distinct_id, week FROM weekly)) AS `쉬었다 복귀`,
    count() AS `합`
FROM weekly w
JOIN firsts f ON f.distinct_id = w.distinct_id
GROUP BY `주`
ORDER BY `주`
"""),
    },
    # ---- 4. 고유 사용자별 성공 신호 --------------------------------------
    {
        "name": "성공 신호 — 주별 전환율과 클릭 비율",
        "description":
            "고유 사용자 기준이다. 한 사람이 43번 눌러도 1로 센다 — 총합으로 "
            "세면 헤비 유저 한 명이 결론을 뒤집는다(2026-08-24 실측: b갈래 "
            "클릭 115회 중 43회가 한 사람).\n\n"
            "오퍼 클릭과 배너 클릭을 나눠 적는다. 08-19에 배너가 생기면서 "
            "배달앱으로 나가는 길이 하나 더 늘었기 때문이다. 합만 보면 그날의 "
            "계단이 제품 개선으로 읽히지만 실제로는 분자의 정의가 바뀐 "
            "것이었다(ANALYTICS-CAPABILITY.md §5.2).",
        "query": q(f"""
SELECT
    toStartOfWeek(timestamp, 1) AS `주`,
    count(DISTINCT distinct_id) AS `방문자`,
    count(DISTINCT if(event IN {GOAL}, distinct_id, NULL)) AS `전환자`,
    round(count(DISTINCT if(event IN {GOAL}, distinct_id, NULL))
          / count(DISTINCT distinct_id) * 100, 1) AS `전환율`,
    round(count(DISTINCT if(event = 'offer_link_click', distinct_id, NULL))
          / count(DISTINCT distinct_id) * 100, 1) AS `오퍼 클릭 비율`,
    round(count(DISTINCT if(event = 'banner_click', distinct_id, NULL))
          / count(DISTINCT distinct_id) * 100, 1) AS `배너 클릭 비율`
FROM events
WHERE {WINDOW} AND {PEOPLE}
GROUP BY `주`
ORDER BY `주`
""", "ActionsLineGraph"),
    },
    {
        "name": "성공 신호 — 1인당 클릭 분포",
        "description":
            "전환율만 내면 왜곡은 안 생기지만 왜곡이 있었는지를 눈치챌 단서가 "
            "사라진다. 중앙값과 최다 한 명을 같이 둔다.\n\n"
            "한 사람이 그 주 클릭의 25% 이상을 차지하면 그 주의 '1인당 평균' "
            "지표는 못 쓴다는 뜻이다.",
        "query": q(f"""
WITH per_person AS (
    SELECT
        toStartOfWeek(timestamp, 1) AS week,
        distinct_id,
        countIf(event IN {GOAL}) AS clicks
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
    GROUP BY week, distinct_id
    HAVING clicks > 0
)
SELECT
    week AS `주`,
    count() AS `전환한 사람`,
    sum(clicks) AS `총 클릭`,
    round(median(clicks), 1) AS `중앙값`,
    max(clicks) AS `최다 한 명`,
    round(max(clicks) / sum(clicks) * 100, 1) AS `최다 한 명 비중`
FROM per_person
GROUP BY `주`
ORDER BY `주`
"""),
    },
    # ---- 5. A/B ---------------------------------------------------------
    {
        "name": "A/B — 갈래별 전환율과 표본 충분성",
        "description":
            "갈래별 방문자·전환자와 두 비율 z검정. |z| >= 1.96이면 p < 0.05다.\n\n"
            "표본이 모자란 것을 '차이 없음'으로 발표하지 않는다. `필요 표본`은 "
            "상대 15% 개선을 검정력 80%로 잡는 데 갈래당 몇 명이 필요한지다 "
            "— 현재 방문자가 그보다 적으면 이 화면은 '아직 모른다'는 뜻이다.\n\n"
            "갈래는 visitorId 해시로 즉시 배정한다(web/src/variant.js). 서버에 "
            "물어보고 그리면 첫 화면이 눈앞에서 바뀌고 그 깜빡임이 실험을 "
            "오염시킨다.",
        "query": q(f"""
-- 갈래는 갈래를 실은 이벤트에서 읽고, 전환은 그 사람의 **모든** 이벤트에서
-- 본다. 한 CTE에서 같이 하면 안 된다 — variant를 안 싣는 이벤트가 있어서
-- (원장 69,140행 중 43,657행만 싣는다) 전환 이벤트가 통째로 빠진다.
-- 실제로 그렇게 짰다가 전환율이 38.1%에서 32.9%로 내려앉았다.
WITH variants AS (
    SELECT distinct_id, argMin(toString(properties.variant), timestamp) AS variant
    FROM events
    WHERE {WINDOW} AND {PEOPLE} AND toString(properties.variant) IN ('a', 'b')
    GROUP BY distinct_id
),
converted AS (
    SELECT distinct_id, max(event IN {GOAL}) AS converted
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
    GROUP BY distinct_id
),
per_variant AS (
    SELECT v.variant AS variant, count() AS n, sum(c.converted) AS c
    FROM variants v JOIN converted c ON c.distinct_id = v.distinct_id
    GROUP BY variant
),
both AS (
    SELECT
        sumIf(n, variant = 'a') AS na, sumIf(c, variant = 'a') AS ca,
        sumIf(n, variant = 'b') AS nb, sumIf(c, variant = 'b') AS cb
    FROM per_variant
)
SELECT
    v.variant AS `갈래`,
    v.n AS `방문자`,
    v.c AS `전환자`,
    round(v.c / v.n * 100, 1) AS `전환율`,
    round((b.cb / b.nb - b.ca / b.na) / sqrt(
        ((b.ca + b.cb) / (b.na + b.nb)) * (1 - (b.ca + b.cb) / (b.na + b.nb))
        * (1 / b.na + 1 / b.nb)), 2) AS `z (a 대비 b)`,
    -- 상대 15% 개선을 검정력 80%·유의수준 5%로 잡는 데 필요한 갈래당 인원.
    -- experiments.sample_size()와 같은 식이다. 기준선은 지금 a갈래의
    -- 전환율에서 가져온다 — 상수로 박으면 전환율이 움직였을 때 화면이
    -- 조용히 옛 기준을 말한다.
    ceil(pow(1.959964 * sqrt(2 * ((b.ca / b.na) * 1.075) * (1 - (b.ca / b.na) * 1.075))
             + 0.841621 * sqrt((b.ca / b.na) * (1 - b.ca / b.na)
                               + (b.ca / b.na) * 1.15 * (1 - (b.ca / b.na) * 1.15)), 2)
         / pow((b.ca / b.na) * 0.15, 2)) AS `필요 표본(갈래당)`
FROM per_variant v
CROSS JOIN both b
ORDER BY `갈래`
"""),
    },
    # ---- A/B 행동 지표 (기존 A/B 대시보드에 붙는다) ----------------------
    {
        "dashboard": 2049188,
        "name": "A/B — 옵션 설정과 그 뒤 (사람 단위)",
        "description":
            "갈래별로 목록을 좁히는 조작(분류·플랫폼·필터·검색·멤버십)을 한 "
            "사람 비율과, 그 뒤에 실제로 나갔는지.\n\n"
            "a안은 조건을 바에 펼쳐 두고 b안은 바텀시트에 감춘다"
            "(App.jsx `variantA`). 그래서 **갈래마다 나오는 이벤트가 다르다** "
            "— a엔 `filter_sheet_open`이 아예 없다. 종류별 비교는 옆 "
            "'옵션 종류별 사용률'에서 그걸 감안해 읽어라. 이 표의 '설정률'은 "
            "'무엇이든 만졌나'라서 그 차이에 안 흔들린다.\n\n"
            "'설정 후 전환'은 **설정한 시각 이후**의 전환만 센다. 순서를 안 "
            "보면 흐름이 아니라 교집합이 된다.\n\n"
            "`z(설정률)`: |z| >= 1.96이면 p < 0.05.",
        "query": q(f"""
WITH {variants_cte()},
per_person AS (
    SELECT
        distinct_id,
        minIf(timestamp, event IN {SETTING}) AS first_set,
        maxIf(timestamp, event IN {GOAL}) AS last_goal,
        max(event IN {SETTING}) AS did_set,
        max(event IN {GOAL}) AS converted
    FROM events
    WHERE {AB_WINDOW} AND {PEOPLE}
    GROUP BY distinct_id
),
joined AS (
    SELECT v.variant AS variant, p.*
    FROM variants v JOIN per_person p ON p.distinct_id = v.distinct_id
),
totals AS (
    SELECT
        countIf(variant = 'a') AS na, countIf(variant = 'a' AND did_set = 1) AS sa,
        countIf(variant = 'b') AS nb, countIf(variant = 'b' AND did_set = 1) AS sb
    FROM joined
)
SELECT
    j.variant AS `갈래`,
    count() AS `방문자`,
    countIf(j.did_set = 1) AS `옵션 설정`,
    round(countIf(j.did_set = 1) / count() * 100, 1) AS `설정률`,
    countIf(j.did_set = 1 AND j.converted = 1 AND j.last_goal > j.first_set) AS `설정 후 전환`,
    round(countIf(j.did_set = 1 AND j.converted = 1 AND j.last_goal > j.first_set)
          / nullIf(countIf(j.did_set = 1), 0) * 100, 1) AS `설정자 전환율`,
    round(countIf(j.did_set = 0 AND j.converted = 1)
          / nullIf(countIf(j.did_set = 0), 0) * 100, 1) AS `설정 안 한 쪽 전환율`,
    round((t.sb / t.nb - t.sa / t.na) / sqrt(
        ((t.sa + t.sb) / (t.na + t.nb)) * (1 - (t.sa + t.sb) / (t.na + t.nb))
        * (1 / t.na + 1 / t.nb)), 2) AS `z(설정률)`
FROM joined j CROSS JOIN totals t
GROUP BY `갈래`, `z(설정률)`
ORDER BY `갈래`
"""),
    },
    {
        "dashboard": 2049188,
        "name": "A/B — 옵션을 설정한 세션은 어떻게 끝났나",
        "description":
            "세션 단위다. 옵션을 설정한 세션을 셋으로 가른다 — 설정한 뒤 "
            "나갔나(전환), 더 만지기만 했나, 아무것도 안 하고 이탈했나.\n\n"
            "사람 단위로 보면 '언젠가는 눌렀다'가 섞여 이탈이 안 보인다. "
            "설정이 도움이 됐는지는 그 자리에서 갈리므로 세션으로 본다.\n\n"
            "'설정 후 이탈'이 갈래별로 다르면 그 갈래의 옵션 UI가 사람을 "
            "막고 있다는 뜻이다.",
        "query": q(f"""
WITH {variants_cte()},
per_session AS (
    SELECT
        distinct_id,
        toString(properties.source_session_id) AS session_id,
        minIf(timestamp, event IN {SETTING}) AS first_set,
        maxIf(timestamp, event IN {GOAL}) AS last_goal,
        max(event IN {SETTING}) AS did_set,
        countIf(event IN {SETTING}) AS set_count
    FROM events
    WHERE {AB_WINDOW} AND {PEOPLE}
      AND notEmpty(toString(properties.source_session_id))
    GROUP BY distinct_id, session_id
)
SELECT
    v.variant AS `갈래`,
    count() AS `설정한 세션`,
    countIf(s.last_goal > s.first_set) AS `설정 후 전환`,
    round(countIf(s.last_goal > s.first_set) / count() * 100, 1) AS `전환 비중`,
    countIf(s.last_goal <= s.first_set AND s.last_goal > toDateTime(0)) AS `설정 전에만 전환`,
    countIf(s.last_goal = toDateTime(0) AND s.set_count > 1) AS `계속 만지다 이탈`,
    countIf(s.last_goal = toDateTime(0) AND s.set_count = 1) AS `한 번 만지고 이탈`,
    round(countIf(s.last_goal = toDateTime(0)) / count() * 100, 1) AS `설정 후 이탈률`
FROM per_session s JOIN variants v ON v.distinct_id = s.distinct_id
WHERE s.did_set = 1
GROUP BY `갈래`
ORDER BY `갈래`
"""),
    },
    {
        "dashboard": 2049188,
        "name": "A/B — 옵션 종류별 사용률",
        "description":
            "어떤 조작이 실제로 쓰이는가. 갈래별로 그 조작을 한 사람의 "
            "비율이다.\n\n"
            "건수가 아니라 사람 수로 센다 — 한 사람이 스무 번 쓴 기능과 스무 "
            "명이 한 번씩 쓴 기능은 완전히 다른 얘기다.\n\n"
            "**0인 칸은 버그가 아니라 설계다.** a안은 조건을 바에 펼쳐 두고 "
            "b안은 바텀시트에 감춘다 — a엔 시트가 없으니 "
            "`filter_sheet_open`·`filters_apply`가 0이고, b는 플랫폼 필터가 "
            "시트 안으로 들어가 `platform_filter_toggle`이 얇다. 같은 의도가 "
            "다른 이벤트로 나온다는 뜻이라, 줄끼리가 아니라 "
            "**갈래별 합**으로 읽어야 한다.",
        "query": q(f"""
WITH {variants_cte()},
counted AS (
    SELECT v.variant AS variant, e.event AS event, e.distinct_id AS distinct_id
    FROM events e JOIN variants v ON v.distinct_id = e.distinct_id
    WHERE {AB_WINDOW.replace("timestamp", "e.timestamp")}
      AND e.event IN {SETTING}
),
base AS (
    SELECT variant, count() AS n FROM variants GROUP BY variant
)
SELECT
    c.event AS `조작`,
    count(DISTINCT if(c.variant = 'a', c.distinct_id, NULL)) AS `a 사람`,
    round(count(DISTINCT if(c.variant = 'a', c.distinct_id, NULL))
          / (SELECT n FROM base WHERE variant = 'a') * 100, 1) AS `a 사용률`,
    count(DISTINCT if(c.variant = 'b', c.distinct_id, NULL)) AS `b 사람`,
    round(count(DISTINCT if(c.variant = 'b', c.distinct_id, NULL))
          / (SELECT n FROM base WHERE variant = 'b') * 100, 1) AS `b 사용률`,
    round(count(DISTINCT if(c.variant = 'b', c.distinct_id, NULL))
          / (SELECT n FROM base WHERE variant = 'b') * 100
          - count(DISTINCT if(c.variant = 'a', c.distinct_id, NULL))
          / (SELECT n FROM base WHERE variant = 'a') * 100, 1) AS `차이(b-a)`
FROM counted c
GROUP BY `조작`
ORDER BY `a 사람` + `b 사람` DESC
"""),
    },
    {
        "dashboard": 2049188,
        "name": "A/B — 설정 깊이별 전환율",
        "description":
            "옵션을 많이 만질수록 잘 나가는가, 헤매는가.\n\n"
            "**인과가 아니다.** 무엇이든 조작하는 사람이 링크도 누른다. "
            "이 표가 답하는 것은 '깊이에 따라 갈래가 다르게 굴러가는가' 하나다 "
            "— 같은 깊이 칸에서 a와 b가 다르면 그건 그 갈래의 UI 때문이다.\n\n"
            "깊이가 깊어질수록 전환율이 떨어지면 옵션이 사람을 헤매게 하고 "
            "있다는 신호다.",
        "query": q(f"""
WITH {variants_cte()},
per_person AS (
    SELECT distinct_id, countIf(event IN {SETTING}) AS depth,
           max(event IN {GOAL}) AS converted
    FROM events
    WHERE {AB_WINDOW} AND {PEOPLE}
    GROUP BY distinct_id
)
SELECT
    multiIf(p.depth = 0, '0 (설정 안 함)', p.depth = 1, '1회', p.depth <= 3, '2~3회',
            p.depth <= 9, '4~9회', '10회 이상') AS `설정 횟수`,
    countIf(v.variant = 'a') AS `a 사람`,
    round(countIf(v.variant = 'a' AND p.converted = 1)
          / nullIf(countIf(v.variant = 'a'), 0) * 100, 1) AS `a 전환율`,
    countIf(v.variant = 'b') AS `b 사람`,
    round(countIf(v.variant = 'b' AND p.converted = 1)
          / nullIf(countIf(v.variant = 'b'), 0) * 100, 1) AS `b 전환율`
FROM per_person p JOIN variants v ON v.distinct_id = p.distinct_id
GROUP BY `설정 횟수`
ORDER BY min(p.depth)
"""),
    },
    {
        "dashboard": 2049188,
        "name": "A/B — 세션의 첫 동작",
        "description":
            "갈래별로 사람들이 화면에서 처음 하는 일. 노출·이탈 이벤트는 "
            "동작으로 안 친다.\n\n"
            "'(아무 동작 없음)'이 가장 큰 칸이고, 이게 갈래별로 다르면 첫 "
            "화면이 다르게 작동한다는 뜻이다 — 전환율보다 먼저 움직이는 "
            "지표라 표본이 모자란 A/B에서 특히 볼 값이 있다.",
        "query": q(f"""
WITH {variants_cte()},
per_session AS (
    SELECT
        distinct_id,
        toString(properties.source_session_id) AS session_id,
        argMinIf(event, timestamp, event NOT IN ('$pageview', 'page_exit',
                 'banner_impression', 'brand_impression')) AS first_action,
        countIf(event NOT IN ('$pageview', 'page_exit', 'banner_impression',
                              'brand_impression')) AS actions
    FROM events
    WHERE {AB_WINDOW} AND {PEOPLE}
      AND notEmpty(toString(properties.source_session_id))
    GROUP BY distinct_id, session_id
)
SELECT
    if(s.actions = 0, '(아무 동작 없음)', s.first_action) AS `첫 동작`,
    countIf(v.variant = 'a') AS `a 세션`,
    round(countIf(v.variant = 'a') / sum(countIf(v.variant = 'a')) OVER () * 100, 1) AS `a 비중`,
    countIf(v.variant = 'b') AS `b 세션`,
    round(countIf(v.variant = 'b') / sum(countIf(v.variant = 'b')) OVER () * 100, 1) AS `b 비중`
FROM per_session s JOIN variants v ON v.distinct_id = s.distinct_id
GROUP BY `첫 동작`
ORDER BY `a 세션` + `b 세션` DESC
"""),
    },
    {
        "dashboard": 2049188,
        "name": "A/B — 세션당 동작 수와 체류시간",
        "description":
            "갈래별로 얼마나 오래, 얼마나 많이 만지는가.\n\n"
            "평균이 아니라 **중앙값**을 본다. 한 사람이 43번 누르는 일이 "
            "실제로 있어서 평균은 그 한 명을 따라간다.\n\n"
            "체류시간은 `page_exit`이 싣는 `dwell_ms`다. 탭이 닫히는 순간 "
            "보내는 값이라 못 받는 경우가 있다 — 그래서 `체류 잰 세션`을 "
            "같이 적는다. 이 수가 세션 수보다 많이 적으면 중앙값을 믿지 마라.\n\n"
            "`z(무동작률)`은 '동작 없이 끝난 세션' 비율의 갈래 간 z검정이다. "
            "전환율보다 표본이 크고(세션 단위) 먼저 움직이는 지표라, 전환이 "
            "판정 불가인 구간에서도 여기서는 갈릴 수 있다.",
        "query": q(f"""
WITH {variants_cte()},
per_session AS (
    SELECT
        distinct_id,
        toString(properties.source_session_id) AS session_id,
        countIf(event NOT IN ('$pageview', 'page_exit', 'banner_impression',
                              'brand_impression')) AS actions,
        maxIf(toIntOrZero(toString(properties.dwell_ms)), event = 'page_exit') AS dwell
    FROM events
    WHERE {AB_WINDOW} AND {PEOPLE}
      AND notEmpty(toString(properties.source_session_id))
    GROUP BY distinct_id, session_id
),
labelled AS (
    SELECT v.variant AS variant, s.actions AS actions, s.dwell AS dwell
    FROM per_session s JOIN variants v ON v.distinct_id = s.distinct_id
),
totals AS (
    SELECT
        countIf(variant = 'a') AS na, countIf(variant = 'a' AND actions = 0) AS qa,
        countIf(variant = 'b') AS nb, countIf(variant = 'b' AND actions = 0) AS qb
    FROM labelled
)
SELECT
    l.variant AS `갈래`,
    count() AS `세션`,
    round(median(l.actions), 1) AS `동작 수 중앙값`,
    max(l.actions) AS `최다 동작`,
    countIf(l.dwell > 0) AS `체류 잰 세션`,
    round(medianIf(l.dwell, l.dwell > 0) / 1000, 1) AS `체류 중앙값(초)`,
    round(countIf(l.actions = 0) / count() * 100, 1) AS `무동작 세션 비중`,
    round((t.qb / t.nb - t.qa / t.na) / sqrt(
        ((t.qa + t.qb) / (t.na + t.nb)) * (1 - (t.qa + t.qb) / (t.na + t.nb))
        * (1 / t.na + 1 / t.nb)), 2) AS `z(무동작률)`
FROM labelled l CROSS JOIN totals t
GROUP BY `갈래`, `z(무동작률)`
ORDER BY `갈래`
"""),
    },
    {
        "dashboard": 2049188,
        "name": "A/B — 어떤 분류를 고르나",
        "description":
            "`category_change`가 싣는 분류 이름의 상위. 사람 수로 센다.\n\n"
            "**`all`이 a에만 있는 것은 버그가 아니다.** a(TopBarA)는 '전체' "
            "탭이 있는 배타 선택이고, b(FilterSheet)는 다중 선택 칩이라 전부 "
            "끄는 것이 곧 전체다 — b에서는 `all`이라는 값이 나올 수 없다.\n\n"
            "같은 이유로 이 이벤트는 갈래마다 뜻이 다르다. a는 '분류를 "
            "갈아탔다', b는 '칩을 켜거나 껐다'. 횟수 비교는 하지 마라 — "
            "비교할 수 있는 것은 '그 분류를 건드린 사람 수'까지다.",
        "query": q(f"""
WITH {variants_cte()}
SELECT
    toString(e.properties.category) AS `분류`,
    count(DISTINCT if(v.variant = 'a', e.distinct_id, NULL)) AS `a 사람`,
    count(DISTINCT if(v.variant = 'b', e.distinct_id, NULL)) AS `b 사람`,
    count(DISTINCT e.distinct_id) AS `합`
FROM events e JOIN variants v ON v.distinct_id = e.distinct_id
WHERE {AB_WINDOW.replace("timestamp", "e.timestamp")}
  AND e.event = 'category_change'
  AND notEmpty(toString(e.properties.category))
GROUP BY `분류`
ORDER BY `합` DESC
LIMIT 15
"""),
    },
    # ---- 6. 설문 --------------------------------------------------------
    {
        "name": "설문 — 단계별 도달",
        "description":
            "리워드 설문(2026-08-31 시작)의 단계별 인원. 사람 수로 센다.\n\n"
            "표본이 두 자릿수라 비율은 아직 읽지 않는다. 이 화면이 답하는 것은 "
            "'응답이 쌓이고 있는가' 하나다.",
        "query": q(f"""
SELECT
    multiIf(event = 'survey_impression', '1. 노출',
            event = 'survey_open', '2. 열어봄',
            event = 'survey_answer', '3. 응답',
            '4. 닫음') AS `단계`,
    count(DISTINCT distinct_id) AS `사람`,
    count() AS `건수`
FROM events
WHERE {WINDOW} AND {PEOPLE}
  AND event IN ('survey_impression', 'survey_open', 'survey_answer', 'survey_dismiss')
GROUP BY `단계`
ORDER BY `단계`
"""),
    },
    {
        "name": "설문 — 문항별 응답 누계",
        "description":
            "객관식 답의 누계. `choice`는 여러 개를 고를 수 있어 '+'로 붙어 "
            "오므로 쪼개서 센다.\n\n"
            "자유 입력(`text`, `q_*_text`)은 여기 없다. 서버가 PostHog로 "
            "넘기지 않는다 — 제3자 도구로 보내는 것은 스펙이 정한 개인정보 "
            "처리 범위 밖이다(PostHogEventMapper). 자유 입력은 원장에만 있고 "
            "사람이 직접 읽는다.",
        "query": q(f"""
WITH answers AS (
    SELECT arrayJoin(arrayFilter(pair -> notEmpty(pair.2), [
        ('무엇을 하러 왔나', ifNull(toString(properties.choice), '')),
        ('언제 쓰나', ifNull(toString(properties.q_when), '')),
        ('무엇을 먼저 보나', ifNull(toString(properties.q_priority), '')),
        ('무엇이 아쉬운가', ifNull(toString(properties.q_missing), '')),
        ('무엇을 바라나', ifNull(toString(properties.q_wish), ''))
    ])) AS pair
    FROM events
    WHERE {WINDOW} AND {PEOPLE} AND event = 'survey_answer'
)
SELECT
    pair.1 AS `문항`,
    arrayJoin(splitByChar('+', pair.2)) AS `답`,
    count() AS `응답`
FROM answers
GROUP BY `문항`, `답`
ORDER BY `문항`, `응답` DESC
"""),
    },
    # ---- 그 밖의 대표 지표 ----------------------------------------------
    {
        "name": "첫 화면 이탈 — 세션의 첫 동작",
        "description":
            "세션마다 처음 한 동작 하나. 지금까지 본 것 중 가장 큰 단일 "
            "손실이 '아무것도 안 하고 나감'이다.\n\n"
            "퍼널로 세면 안 되는 값이다. `page_view → category_change`로 세면 "
            "'78% 이탈'로 읽히지만, 실제로는 분류 변경이 필수 단계가 아닐 "
            "뿐이었다(§5.1). 그래서 흐름이 아니라 첫 동작의 분포로 낸다.",
        "query": q(f"""
WITH sessions AS (
    SELECT
        distinct_id,
        toString(properties.source_session_id) AS session_id,
        argMin(event, timestamp) AS first_event,
        argMinIf(event, timestamp, event NOT IN ('$pageview', 'page_exit',
                                                 'banner_impression',
                                                 'brand_impression')) AS first_action,
        countIf(event NOT IN ('$pageview', 'page_exit', 'banner_impression',
                              'brand_impression')) AS actions
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
      AND notEmpty(toString(properties.source_session_id))
    GROUP BY distinct_id, session_id
)
SELECT
    if(actions = 0, '(아무 동작 없음)', first_action) AS `첫 동작`,
    count() AS `세션`,
    round(count() / (SELECT count() FROM sessions) * 100, 1) AS `비중`
FROM sessions
GROUP BY `첫 동작`
ORDER BY `세션` DESC
"""),
    },
    {
        "name": "유입 갈래별 사람과 전환",
        "description":
            "밖에서 들어온 사람과 직접 온 사람이 같은 값을 하는가.\n\n"
            "**검색엔진별로는 못 가른다.** 유입 원본 URL을 일부러 안 보내고 "
            "direct·internal·external 셋으로 접어 보내기 때문이다"
            "(web/src/analytics.js `referrerKind`). 유실이 아니라 결정이다. "
            "그 대가로 'SEO가 사람을 보내는가'는 이 화면이 답할 수 없다 — "
            "Search Console을 봐야 한다.\n\n"
            "갈래는 사람마다 하나로 고정한다. SDK가 스스로 만드는 이벤트에는 "
            "이 속성이 없어 이벤트마다 세면 한 사람이 여러 갈래에 걸친다.",
        "query": q(f"""
WITH kind AS (
    SELECT distinct_id, argMin(toString(properties.referrer), timestamp) AS referrer
    FROM events
    WHERE {WINDOW} AND {PEOPLE} AND notEmpty(toString(properties.referrer))
    GROUP BY distinct_id
),
converted AS (
    SELECT distinct_id, max(event IN {GOAL}) AS converted
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
    GROUP BY distinct_id
)
SELECT
    multiIf(k.referrer = 'direct', '직접(주소창·앱 안 브라우저)',
            k.referrer = 'external', '밖에서 링크 타고',
            k.referrer = 'internal', '우리 사이트 안에서',
            k.referrer) AS `유입 갈래`,
    count() AS `사람`,
    sum(c.converted) AS `전환자`,
    round(sum(c.converted) / count() * 100, 1) AS `전환율`
FROM kind k JOIN converted c ON c.distinct_id = k.distinct_id
GROUP BY `유입 갈래`
ORDER BY `사람` DESC
"""),
    },
    {
        "name": "수집 건강도 — 개발 트래픽 비중",
        "description":
            "날마다 개발 트래픽이 얼마나 섞이는가.\n\n"
            "예전 질의는 `countIf(properties.dev_suspect)`였다. 그 속성은 "
            "2026-08-28을 끝으로 서버가 안 보내므로 **그 뒤로는 영원히 0%로 "
            "찍힌다** — 개발 트래픽이 없어서가 아니라 세는 값이 사라져서다.\n\n"
            "지금 규칙으로 다시 센다: 한 사람의 뷰포트 폭이 여러 개이고 그중 "
            "최대가 800px 이상이면 창을 조절해 가며 본 것이다. 폰은 세션 내내 "
            "폭이 하나다. 판정은 사람 단위라 그 사람의 이벤트를 전부 모아야 "
            "내릴 수 있다 — 이벤트 하나만 보는 옛 방식이 틀렸던 이유다.\n\n"
            "명시 `?dev=1`은 서버와 SDK 양쪽에서 막혀 여기 아예 안 온다.",
        "query": q(f"""
WITH judged AS (
    SELECT
        distinct_id,
        count(DISTINCT toString(properties.viewport)) AS widths,
        max(toIntOrZero(splitByChar('x', toString(properties.viewport))[1])) AS max_width
    FROM events
    WHERE {WINDOW} AND {PEOPLE}
    GROUP BY distinct_id
),
developers AS (
    SELECT distinct_id FROM judged WHERE widths > 1 AND max_width >= 800
)
SELECT
    toDate(timestamp) AS `날짜`,
    count(DISTINCT distinct_id) AS `사람`,
    count(DISTINCT if(distinct_id IN (SELECT distinct_id FROM developers),
                      distinct_id, NULL)) AS `개발 트래픽`,
    round(count(DISTINCT if(distinct_id IN (SELECT distinct_id FROM developers),
                            distinct_id, NULL))
          / count(DISTINCT distinct_id) * 100, 1) AS `비중`
FROM events
WHERE {WINDOW} AND {PEOPLE}
GROUP BY `날짜`
ORDER BY `날짜` DESC
"""),
    },
    {
        "name": "계측 건강도 — dev_suspect 오탐 규모",
        "description":
            "**이 화면은 지표가 아니라 경고다.** 인사이트 55개 중 28개가 "
            "`properties.dev_suspect IS NULL`을 필터로 들고 있는데, 그 표시는 "
            "틀린 규칙이 붙인 것이다.\n\n"
            "옛 규칙은 'desktop이면서 폭 400px 미만'이었다. device를 "
            "matchMedia('(hover: hover)')로 정하는데 일부 안드로이드 브라우저가 "
            "hover:hover를 보고해서 폰이 desktop으로 잡혔다. 그래서 서버에서 "
            "걷어내고 판정을 집계로 옮겼다(§4.3).\n\n"
            "이 표는 그 표시가 붙은 사람을 지금 규칙(한 세션 안에서 폭이 여러 "
            "개이고 최대가 800px 이상이면 개발자)으로 다시 가른 것이다. "
            "'폰'으로 나오는 사람은 그 필터를 든 인사이트에서 부당하게 빠지고 "
            "있다.",
        "query": q(f"""
WITH flagged AS (
    SELECT
        distinct_id,
        count(DISTINCT toString(properties.viewport)) AS widths,
        max(toIntOrZero(splitByChar('x', toString(properties.viewport))[1])) AS max_width,
        countIf(properties.dev_suspect IS NOT NULL) AS flagged_events
    FROM events
    WHERE distinct_id IN (
        SELECT DISTINCT distinct_id FROM events WHERE properties.dev_suspect IS NOT NULL)
    GROUP BY distinct_id
)
SELECT
    if(widths > 1 AND max_width >= 800, '진짜 개발자(창 조절)', '폰 — 오탐') AS `다시 가른 결과`,
    count() AS `사람`,
    sum(flagged_events) AS `필터에서 빠지는 이벤트`
FROM flagged
GROUP BY `다시 가른 결과`
ORDER BY `사람` DESC
"""),
    },
]

# PostHog가 스스로 잘하는 것은 HogQL로 다시 쓰지 않는다.
NATIVE = [
    {
        "name": "재사용 — 주간 리텐션 (첫 방문 기준)",
        "description":
            "첫 방문 주를 기준으로 이후 주에 돌아온 비율. PostHog 기본 "
            "리텐션이라 '2주 쉬었다 온 사람'은 W+2 칸에 잡힌다 — 이탈로 "
            "치지 않는다.\n\n"
            "같은 것을 원장으로도 낸다(snapshot.py '리텐션 — 주 코호트별'). "
            "숫자가 갈리면 원장이 이긴다.",
        "query": {
            "kind": "InsightVizNode",
            "source": {
                "kind": "RetentionQuery",
                "retentionFilter": {
                    "period": "Week",
                    "totalIntervals": 7,
                    "targetEntity": {"id": "$pageview", "name": "Pageview", "type": "events"},
                    "returningEntity": {"id": "$pageview", "name": "Pageview", "type": "events"},
                    "retentionType": "retention_first_time",
                    "meanRetentionCalculation": "simple",
                },
                "filterTestAccounts": True,
            },
        },
    },
    {
        "name": "재사용 — 주간 라이프사이클",
        "description":
            "주마다 신규·유지·복귀·이탈을 갈라 그린다. 위 '주별 신규·유지·복귀' "
            "표와 같은 것을 PostHog 기본 계산으로 본 것이다 — 두 값이 갈리면 "
            "정의가 어긋난 것이니 그때 파고들 자리다.",
        "query": {
            "kind": "InsightVizNode",
            "source": {
                "kind": "LifecycleQuery",
                "interval": "week",
                "dateRange": {"date_from": "-60d"},
                "series": [{"kind": "EventsNode", "event": "$pageview",
                            "name": "$pageview", "math": "total"}],
                "filterTestAccounts": True,
            },
        },
    },
    {
        "name": "재사용 — 스티키니스 (30일 중 며칠 왔나)",
        "description":
            "한 사람이 30일 중 며칠이나 왔는지의 분포. '충성'을 방문 횟수가 "
            "아니라 날 수로 보는 화면이라 위 '활동일수 분포'와 짝이다.",
        "query": {
            "kind": "InsightVizNode",
            "source": {
                "kind": "StickinessQuery",
                "interval": "day",
                "dateRange": {"date_from": "-30d"},
                "series": [{"kind": "EventsNode", "event": "$pageview",
                            "name": "$pageview", "math": "dau"}],
                "stickinessFilter": {},
                "filterTestAccounts": True,
            },
        },
    },
]


# ---- API ---------------------------------------------------------------

def key():
    k = os.environ.get(KEY_VAR)
    if k:
        return k.strip()
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    raise SystemExit(
        "Personal API Key가 없다. %s 환경변수나 %s 파일에 두고, 발급 화면에서 "
        "Insight·Dashboard를 Write, Query를 Read로 켜라." % (KEY_VAR, KEY_FILE))


def api(path, method="GET", body=None, token=None):
    url = "%s/api/projects/%s/%s" % (HOST, PROJECT, path)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as res:
            return json.load(res) if res.status != 204 else {}
    except urllib.error.HTTPError as e:
        raise SystemExit("%s %s -> %d\n%s"
                         % (method, path, e.code, e.read().decode()[:1500]))


def run_query(sql, token):
    """인사이트로 굳히기 전에 실제로 돌려 본다.

    PostHog는 안 도는 질의도 그대로 저장한다 — 저장된 뒤에 깨진 것을
    보는 것보다 여기서 걸리는 편이 낫다.
    """
    return api("query/", "POST", {"query": {"kind": "HogQLQuery", "query": sql}}, token)


def find(kind, name, token):
    """이름으로 찾는다. 없으면 None.

    같은 이름을 두 번 만들면 화면에 쌍둥이가 생기고 어느 쪽이 최신인지
    아무도 모른다.
    """
    got = api("%s/?limit=200" % kind, token=token)
    for item in got.get("results", []):
        if item.get("name") == name:
            return item
    return None


def upsert_dashboard(token, apply_):
    found = find("dashboards", DASHBOARD, token)
    if not apply_:
        return found["id"] if found else None
    body = {"name": DASHBOARD, "description": DASHBOARD_NOTE, "tags": ["service-metrics"]}
    if found:
        return api("dashboards/%d/" % found["id"], "PATCH", body, token)["id"]
    return api("dashboards/", "POST", body, token)["id"]


def upsert_insight(spec, dashboard_id, token, apply_):
    """`dashboard` 키가 있으면 그 대시보드에 붙인다.

    A/B 지표는 이미 있는 'A/B 테스트 - 옵션 설정' 대시보드로 보낸다 —
    같은 실험을 두 화면에 나눠 두면 어느 쪽이 최신인지 아무도 모른다.
    """
    found = find("insights", spec["name"], token)
    target = spec.get("dashboard", dashboard_id)
    body = {"name": spec["name"], "description": spec["description"],
            "query": spec["query"], "saved": True, "tags": ["service-metrics"]}
    if target:
        # 이미 붙어 있던 대시보드는 안 떼어낸다. 사람이 손으로 붙여 둔
        # 것을 스크립트가 조용히 걷어내면 화면이 비어 버린다.
        body["dashboards"] = sorted(
            set((found or {}).get("dashboards") or []) | {target})
    if not apply_:
        return "있음(갱신 예정)" if found else "새로 만듦 예정"
    if found:
        api("insights/%d/" % found["id"], "PATCH", body, token)
        return "갱신"
    api("insights/", "POST", body, token)
    return "생성"


# HogQL에 손으로 적힌 dev_suspect 필터의 모양들. 사람마다 다르게 썼다.
DEV_SUSPECT_SQL = (
    re.compile(r"\s*AND\s+properties\.dev_suspect\s+IS\s+NULL", re.I),
    re.compile(r"\s*AND\s+isNull\(\s*properties\.dev_suspect\s*\)", re.I),
    re.compile(r"\s*AND\s+coalesce\(\s*toString\(\s*properties\.dev_suspect\s*\)\s*,"
               r"\s*''\s*\)\s+NOT\s+IN\s*\([^)]*\)", re.I),
    # WHERE 바로 뒤에 온 경우. 앞에 AND가 없어 위 규칙이 못 잡는다.
    re.compile(r"(?<=WHERE\s)\s*properties\.dev_suspect\s+IS\s+NULL\s+AND\s+", re.I),
)


def strip_dev_suspect_props(node):
    """TrendsQuery 등의 속성 필터 트리에서 dev_suspect 항목만 덜어낸다.

    `{"key": "dev_suspect", "type": "event", "operator": "is_not_set"}` 모양이라
    키를 보고 고른다. 빈 리스트가 남는 것은 그대로 둔다 — PostHog가 받는다.
    """
    if isinstance(node, dict):
        if node.get("key") == "dev_suspect":
            return None
        return {k: strip_dev_suspect_props(v) for k, v in node.items()}
    if isinstance(node, list):
        cleaned = [strip_dev_suspect_props(v) for v in node]
        return [v for v in cleaned if v is not None]
    return node


def fix_dev_suspect(token, apply_):
    """손으로 만든 인사이트에서 틀린 필터를 걷는다.

    ## 왜 걷는 게 맞나 — 실측

    `dev_suspect`는 2026-08-21~28에만 찍혔고 106명에게 붙었다. 그중 104명이
    원장에 있는데, 원장 규칙(한 사람의 세션 전체를 보고 "폭이 여러 개이고
    최대가 800px 이상"이면 개발자)으로 다시 가르면 **104명 전원이 사람**이다.
    뷰포트 폭도 384(58명)·360(32명)처럼 전부 폰 폭이다.

    반대로 **원장이 개발 트래픽으로 보는 123명 중 dev_suspect가 붙은 사람은
    0명**이다. 이 필터는 개발자를 한 명도 못 잡으면서 사람만 걷어낸다.

    결정적인 것은 전환율이다. 이 106명은 **62.5%**로 전체(35.2%)의 두 배에
    가깝다. 개발자가 실사용자보다 링크를 더 누를 이유가 없다 — 애초에 옛
    규칙이 틀렸다는 것을 알아챈 단서가 이거였다(ANALYTICS-CAPABILITY §3.4).

    ## 걷어도 개발자가 안 섞인다

    명시 개발 트래픽(`?dev=1`)은 세 경로에서 모두 막힌다 — 서버 매퍼가
    `dev:true`를 버리고(PostHogEventMapper 첫 줄), 브라우저 SDK도
    `captureSignal`과 `captureAnalyticsEvent` 양쪽에서 막는다(posthog.js).
    즉 이 필터를 걷어도 PostHog에 개발자가 들어오지 않는다.

    ## 어떻게 걷나

    HogQL은 정규식으로 절만 덜어내고, TrendsQuery 같은 속성 필터는 트리에서
    그 항목만 뺀다. 걷어낸 뒤 실제로 돌려 보고, 안 돌면 그대로 둔다.

    `dev_suspect`를 **재는** 인사이트(필터가 아니라 SELECT에 쓴 것)는 안
    건드린다 — 걷으면 그 화면의 주제 자체가 사라진다. 따로 보고한다.
    """
    got = api("insights/?limit=200", token=token)
    fixed_n = manual = 0
    for item in got.get("results", []):
        query = item.get("query") or {}
        if "dev_suspect" not in json.dumps(query, ensure_ascii=False):
            continue
        name = item["name"][:44]

        source = query.get("source") or {}
        sql = source.get("query")
        if sql and "dev_suspect" in sql:
            new_sql = sql
            for pattern in DEV_SUSPECT_SQL:
                new_sql = pattern.sub("", new_sql)
            if "dev_suspect" in new_sql:
                # 필터가 아니라 측정 대상으로 쓰고 있다.
                print("  %-44s 손으로 — dev_suspect를 재는 화면이다" % name)
                manual += 1
                continue
            try:
                run_query(new_sql, token)
            except SystemExit:
                print("  %-44s 건너뜀 — 걷어내니 질의가 안 돈다" % name)
                manual += 1
                continue
            query = json.loads(json.dumps(query))
            query["source"]["query"] = new_sql
        else:
            query = strip_dev_suspect_props(json.loads(json.dumps(query)))
            if "dev_suspect" in json.dumps(query, ensure_ascii=False):
                print("  %-44s 손으로 — 못 알아본 모양이다" % name)
                manual += 1
                continue

        fixed_n += 1
        print("  %-44s %s" % (name, "고침" if apply_ else "고칠 것"))
        if apply_:
            api("insights/%d/" % item["id"], "PATCH", {"query": query}, token)

    print("\n%d개 %s, %d개는 사람이 봐야 한다."
          % (fixed_n, "고쳤다" if apply_ else "고칠 수 있다 (--apply)", manual))
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="실제로 올린다")
    p.add_argument("--only", help="이름에 이 말이 든 것만")
    p.add_argument("--skip-validate", action="store_true",
                   help="질의를 돌려 보지 않는다(느릴 때만)")
    p.add_argument("--fix-dev-suspect", action="store_true",
                   help="손으로 만든 인사이트에서 틀린 dev_suspect 필터를 걷는다")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = p.parse_args(argv)

    token = key()
    if args.fix_dev_suspect:
        return fix_dev_suspect(token, args.apply)

    specs = INSIGHTS + NATIVE
    too_long = [(s["name"], len(s["description"])) for s in specs
                if len(s["description"]) > DESCRIPTION_MAX]
    if too_long:
        for name, n in too_long:
            print("설명이 %d자다(최대 %d): %s" % (n, DESCRIPTION_MAX, name))
        raise SystemExit("설명을 줄여라. 긴 설명은 docs/metrics 쪽에 쓴다.")
    if args.only:
        specs = [s for s in specs if args.only in s["name"]]
        if not specs:
            raise SystemExit("이름에 %r이 든 인사이트가 없다" % args.only)

    dashboard_id = upsert_dashboard(token, args.apply)
    print("대시보드 %r -> %s" % (DASHBOARD, dashboard_id or "아직 없음(미리보기)"))
    print()

    failed = 0
    for spec in specs:
        sql = (spec["query"].get("source") or {}).get("query")
        rows = "—"
        if sql and not args.skip_validate:
            got = run_query(sql, token)
            rows = "%d행" % len(got.get("results", []))
            if not got.get("results"):
                rows += " ⚠ 빈 결과"
                failed += 1
        state = upsert_insight(spec, dashboard_id, token, args.apply)
        print("  %-38s %-8s %s" % (spec["name"][:38], rows, state))

    print()
    if failed:
        print("⚠ 결과가 비어 있는 질의 %d개 — 지표가 아직 안 쌓였거나 질의가 "
              "틀렸다는 뜻이다. 화면에 걸기 전에 확인해라." % failed)
    if not args.apply:
        print("미리보기다. 실제로 올리려면 --apply")
    elif dashboard_id:
        print("%s/project/%s/dashboard/%s" % (HOST, PROJECT, dashboard_id))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
