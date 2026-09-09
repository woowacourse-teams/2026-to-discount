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
    found = find("insights", spec["name"], token)
    body = {"name": spec["name"], "description": spec["description"],
            "query": spec["query"], "saved": True, "tags": ["service-metrics"]}
    if dashboard_id:
        body["dashboards"] = sorted(
            set((found or {}).get("dashboards") or []) | {dashboard_id})
    if not apply_:
        return "있음(갱신 예정)" if found else "새로 만듦 예정"
    if found:
        api("insights/%d/" % found["id"], "PATCH", body, token)
        return "갱신"
    api("insights/", "POST", body, token)
    return "생성"


DEV_SUSPECT_FILTERS = (
    "AND properties.dev_suspect IS NULL\n",
    "AND properties.dev_suspect IS NULL",
    "properties.dev_suspect IS NULL AND ",
    "properties.dev_suspect IS NULL",
)


def fix_dev_suspect(token, apply_):
    """손으로 만든 인사이트에서 틀린 필터를 걷는다.

    `properties.dev_suspect IS NULL`은 2026-08-21~28에만 찍힌 표시를 거른다.
    그 표시를 단 106명을 지금 규칙으로 다시 가르면 **전원이 폰**이다 —
    개발자가 한 명도 없다. 옛 규칙이 'desktop이면서 폭 400px 미만'이었고,
    일부 안드로이드 브라우저가 hover:hover를 보고해 폰이 desktop으로
    잡혔기 때문이다(ANALYTICS-CAPABILITY.md §4.3).

    하필 08-24 하루가 1,778건(80명)이다. 그 주에서 방문자가 가장 많았던
    날이라, 이 필터를 든 인사이트는 가장 큰 표본에서 폰 사용자를 덜어낸다.

    명시 개발 트래픽(`?dev=1`)은 서버가 PostHog로 아예 안 보내므로, 이
    필터를 걷어도 개발자가 섞여 들어오지 않는다.

    문자열 치환이라 질의 모양을 안 건드린다. 걷어낸 뒤 실제로 도는지
    확인하고, 안 돌면 그 인사이트는 그대로 둔다.
    """
    got = api("insights/?limit=200", token=token)
    touched = 0
    for item in got.get("results", []):
        query = item.get("query") or {}
        sql = (query.get("source") or {}).get("query")
        if not sql or "dev_suspect" not in sql:
            continue
        fixed = sql
        for needle in DEV_SUSPECT_FILTERS:
            fixed = fixed.replace(needle, "\n" if needle.endswith("\n") else "")
        if "dev_suspect" in fixed:
            print("  손으로 봐야 함 %-40s (모양이 달라 못 걷었다)" % item["name"][:40])
            continue
        try:
            run_query(fixed, token)
        except SystemExit:
            print("  건너뜀 %-46s (걷어내니 질의가 안 돈다)" % item["name"][:46])
            continue
        touched += 1
        print("  %-46s %s" % (item["name"][:46], "고침" if apply_ else "고칠 것"))
        if apply_:
            query["source"]["query"] = fixed
            api("insights/%d/" % item["id"], "PATCH", {"query": query}, token)
    print("\n%d개 %s" % (touched, "고쳤다" if apply_ else "고칠 수 있다 (--apply)"))
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
