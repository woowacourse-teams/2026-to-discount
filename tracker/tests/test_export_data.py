from export_data import (build_export, camel_tiers, estimated_expiry,
                         menu_limited_keys, next_monday, sorted_brand_names)

RECORDS = [
    {
        "platform": "baemin", "brand": "도미노피자", "amount": 5000,
        "qualifier": None, "needs_review": False, "offer_type": "discount",
        "section": "오늘의 할인", "raw_text": "5,000원 브랜드 할인",
        "captured_at": "2026-07-27T14:20:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "manual",
        "screenshot_path": "ref/delivery/baemin_2026-07-27.jpg",
    },
    {
        "platform": "yogiyo", "brand": "굽네치킨", "amount": 7000,
        "qualifier": "최대", "needs_review": True, "offer_type": "discount",
        "section": None, "raw_text": "최대 7,000원 할인",
        "captured_at": "2026-07-27T14:25:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "manual",
        "screenshot_path": "ref/delivery/yogiyo_2026-07-27 (1).jpg",
    },
]


def test_build_export_converts_to_camel_case():
    out = build_export(RECORDS)
    item = next(x for x in out if x["brand"] == "도미노피자")
    assert item["needsReview"] is False
    assert item["offerType"] == "discount"
    assert item["capturedAt"] == "2026-07-27T14:20:00+09:00"
    assert item["screenshotPath"] == "ref/delivery/baemin_2026-07-27.jpg"
    # snake_case 키는 남지 않는다
    assert "needs_review" not in item
    assert "capture_mode" not in item   # export에 불필요한 필드는 뺀다


def test_build_export_keeps_amount_and_qualifier():
    out = build_export(RECORDS)
    goobne = next(x for x in out if x["brand"] == "굽네치킨")
    assert goobne["amount"] == 7000
    assert goobne["qualifier"] == "최대"
    assert goobne["needsReview"] is True


def test_sorted_brand_names_unique_and_ascending():
    dup = RECORDS + [dict(RECORDS[0])]   # 도미노피자 중복
    names = sorted_brand_names(dup)
    assert names == ["굽네치킨", "도미노피자"]   # 중복 제거 + 오름차순


def test_build_export_carries_detail_fields_as_camel_case():
    records = [dict(RECORDS[1], min_order_amount=15000, conditions="1일 1회",
                    tiers=[{"min_order": 15000, "amount": 3000},
                           {"min_order": 25000, "amount": 7000}])]
    item = build_export(records)[0]
    assert item["minOrderAmount"] == 15000
    assert item["conditions"] == "1일 1회"
    assert item["tiers"] == [{"minOrder": 15000, "amount": 3000},
                             {"minOrder": 25000, "amount": 7000}]


def test_build_export_carries_percent_tier():
    # 요기요 실측(굽네치킨, 2026-07-31): 정률 tier는 percent와 cap이 같이
    # 살아남아야 한다. amount는 그 문턱에서 실제 받는 금액(25,000 x 5%),
    # cap은 상한(60,000원 주문에서야 닿는다) — ADR-019.
    records = [dict(RECORDS[1], tiers=[
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
        {"min_order": 17000, "amount": 4000},
    ])]
    item = build_export(records)[0]
    assert item["tiers"] == [
        {"minOrder": 25000, "amount": 1250, "percent": 5, "cap": 3000},
        {"minOrder": 17000, "amount": 4000},
    ]


def test_build_export_detail_fields_are_null_when_unknown():
    # 지금 원장은 거의 전부 이 상태 — 키는 있고 값만 비어 있어야 한다.
    item = build_export(RECORDS)[0]
    assert item["minOrderAmount"] is None
    assert item["tiers"] is None
    assert item["conditions"] is None
    assert item["expiresAt"] is None


def test_build_export_carries_expires_at():
    # today를 고정해 넘긴다. 안 넘기면 build_export가 오늘 날짜로 만료를
    # 걸러 실제 달력이 이 날짜를 지나는 순간 목록이 비고, 만료일이 안
    # 실린 것처럼 보인다(2026-09-04에 실제로 그렇게 깨졌다).
    records = [dict(RECORDS[1], expires_at="2026-08-31")]
    item = build_export(records, today="2026-08-20")[0]
    assert item["expiresAt"] == "2026-08-31"


def test_build_export_carries_channel_tier():
    # 땡겨요 실측(바른치킨, 2026-08-01): 배달/포장별 별개 쿠폰도
    # channel이 export.json까지 살아남아야 한다.
    records = [dict(RECORDS[1], tiers=[
        {"min_order": 19900, "amount": 4000, "channel": "배달"},
        {"min_order": 19900, "amount": 5000, "channel": "포장"},
    ])]
    item = build_export(records)[0]
    assert item["tiers"] == [
        {"minOrder": 19900, "amount": 4000, "channel": "배달"},
        {"minOrder": 19900, "amount": 5000, "channel": "포장"},
    ]


def test_build_export_carries_badge():
    records = [dict(RECORDS[1], badge="선착순 품절")]
    item = build_export(records)[0]
    assert item["badge"] == "선착순 품절"


def test_build_export_carries_sold_out():
    records = [dict(RECORDS[1], sold_out=True)]
    item = build_export(records)[0]
    assert item["soldOut"] is True


def test_build_export_carries_tier_sold_out():
    records = [dict(RECORDS[1], amount=6000, tiers=[
        {"min_order": 16000, "amount": 20000, "sold_out": True},
        {"min_order": 16000, "amount": 6000},
    ])]
    item = build_export(records)[0]
    assert item["tiers"] == [
        {"minOrder": 16000, "amount": 20000, "soldOut": True},
        {"minOrder": 16000, "amount": 6000},
    ]


# --- 브랜드 할인 카드에 못 띄우는 것은 내보내지 않는다 (docs/GLOSSARY.md) ---

def test_expired_offer_is_not_exported():
    """종료일이 지난 쿠폰이 카드에 뜨면 사용자가 없는 할인을 찾아 앱에 간다.

    실측(2026-08-09): 이 걸름이 없어 export 135건에 만료 7건이 섞여 있었다.
    """
    records = [dict(RECORDS[0], expires_at="2026-08-08")]

    assert build_export(records, today="2026-08-09") == []


def test_offer_expiring_today_is_still_exported():
    # "~2026.08.31 사용가능"은 그날까지 쓸 수 있다는 뜻이다.
    records = [dict(RECORDS[0], expires_at="2026-08-09")]

    assert len(build_export(records, today="2026-08-09")) == 1


def test_offer_without_amount_is_not_exported():
    """금액이 카드의 본문이다 — 못 읽은 관측은 띄울 게 없다.

    비교 화면에서 다른 앱 금액과 나란히 놓이면 "0원"처럼 읽힌다.
    """
    records = [dict(RECORDS[0], amount=None, needs_review=True)]

    assert build_export(records, today="2026-08-09") == []


def test_filtered_records_stay_in_the_ledger_view():
    """거르는 것은 export뿐이다 — 관측했다는 사실은 원장에 남는다."""
    records = [dict(RECORDS[0], expires_at="2026-08-08")]

    assert sorted_brand_names(records) == ["도미노피자"]


# --- 구간별 종료일 (API OfferRecord.isExpired와 같은 규칙, ADR-016) ---

def test_record_survives_while_any_tier_is_still_live():
    """청년피자 땡겨요 재현(2026-08-06): 상시 5,000원과 하루짜리 청피데이
    9,000원이 한 레코드에 있었는데, 레코드 종료일만 보고 살아있는
    5,000원까지 통째로 내려버렸다."""
    records = [dict(RECORDS[0], amount=9000, expires_at="2026-08-06", tiers=[
        {"min_order": 18900, "amount": 9000, "expires_at": "2026-08-06"},
        {"min_order": 18900, "amount": 5000, "expires_at": "2026-08-31"},
    ])]

    out = build_export(records, today="2026-08-09")

    assert len(out) == 1


def test_record_drops_when_every_tier_expired():
    records = [dict(RECORDS[0], tiers=[
        {"min_order": 18900, "amount": 9000, "expires_at": "2026-08-06"},
        {"min_order": 18900, "amount": 5000, "expires_at": "2026-08-08"},
    ])]

    assert build_export(records, today="2026-08-09") == []


def test_tier_without_its_own_expiry_follows_the_record():
    # 구간 종료일은 "이 구간만 따로 끝날 때" 채우는 값이다.
    records = [dict(RECORDS[0], expires_at="2026-08-08", tiers=[
        {"min_order": 18900, "amount": 5000},
    ])]

    assert build_export(records, today="2026-08-09") == []


def test_tier_expiry_reaches_export():
    records = [dict(RECORDS[0], tiers=[
        {"min_order": 18900, "amount": 5000, "expires_at": "2026-08-31"},
    ])]

    item = build_export(records, today="2026-08-09")[0]

    assert item["tiers"] == [{"minOrder": 18900, "amount": 5000, "expiresAt": "2026-08-31"}]
def test_camel_tiers_carries_per_tier_expires_at():
    tiers = camel_tiers([
        {"min_order": 18900, "amount": 4000, "expires_at": "2026-08-30"},
        {"min_order": None, "amount": 7500, "expires_at": "2026-08-31"},
    ])
    assert [t["expiresAt"] for t in tiers] == ["2026-08-30", "2026-08-31"]


def test_camel_tiers_omits_expires_at_when_absent():
    assert "expiresAt" not in camel_tiers([{"min_order": 15000, "amount": 3000}])[0]


# --- 배민은 종료일이 없어 "이번 수집에 안 보이면 끝" 규칙을 쓴다 ---

BAEMIN_OLD = dict(RECORDS[0], platform="baemin", brand="지난주브랜드",
                  captured_at="2026-08-03T02:00:00+09:00")
BAEMIN_NEW = dict(RECORDS[0], platform="baemin", brand="이번주브랜드",
                  captured_at="2026-08-10T02:00:00+09:00")


def test_baemin_offer_missing_from_the_latest_sweep_is_not_exported():
    """배민 화면에는 종료일이 없다. 프로모션이 월요일 00시에 통째로
    갈리므로(2026-08-10 확인) 이번 수집에 안 보인 것은 끝난 것이다."""
    brands = [o["brand"] for o in build_export([BAEMIN_OLD, BAEMIN_NEW],
                                               today="2026-08-10",
                                               sweeps={"baemin": "2026-08-10"})]

    assert "지난주브랜드" not in brands
    assert "이번주브랜드" in brands


def test_records_alone_never_make_a_sweep_day():
    """레코드가 아무리 많아도 그 자체로는 수집일이 아니다.

    전에는 그날 건수가 임계값을 넘으면 전수 수집으로 추정했고, 그 추정이
    양쪽으로 다 틀렸다 — 손입력 5건이 수집일로 잡혀 살아 있는 브랜드가
    사라졌고(2026-08-10), 임계값을 올린 뒤엔 정정 10건이 수집일로 잡혀
    배민 브랜드 69개가 사라졌다(2026-08-16). 이제 sweeps에 적힌 것만
    수집일이다."""
    old = dict(RECORDS[0], platform="ddangyo", brand="지난주", expires_at=None,
               captured_at="2026-08-03T02:00:00+09:00")
    many_today = [dict(RECORDS[0], platform="ddangyo", brand=f"오늘{i}",
                       expires_at=None, captured_at="2026-08-10T10:00:00+09:00")
                  for i in range(30)]

    brands = {o["brand"] for o in build_export([old] + many_today,
                                               today="2026-08-10", sweeps={})}

    assert "지난주" in brands


def test_same_sweep_day_survives_even_at_different_times():
    """같은 날 브랜드관과 배짱할인을 따로 훑어도 둘 다 살아야 한다."""
    lounge = dict(BAEMIN_NEW, brand="브랜드관", captured_at="2026-08-10T02:00:00+09:00")
    baejjang = dict(BAEMIN_NEW, brand="배짱할인", captured_at="2026-08-10T23:00:00+09:00")

    brands = sorted(o["brand"] for o in build_export([lounge, baejjang],
                                                     today="2026-08-10",
                                                     sweeps={"baemin": "2026-08-10"}))

    assert brands == ["배짱할인", "브랜드관"]


def test_latest_sweep_dates_reads_the_sweep_log(tmp_path):
    """수집일은 파일에 적힌 것만. 없으면 아무 날도 수집일이 아니다."""
    from export_data import latest_sweep_dates

    path = tmp_path / "sweeps.jsonl"
    path.write_text(
        '{"platform": "baemin", "date": "2026-08-03"}\n'
        '{"platform": "baemin", "date": "2026-08-10"}\n'
        '{"platform": "yogiyo", "date": "2026-08-15"}\n',
        encoding="utf-8")

    assert latest_sweep_dates([], path) == {"baemin": "2026-08-10", "yogiyo": "2026-08-15"}
    assert latest_sweep_dates([], tmp_path / "none.jsonl") == {}


def test_older_sweeps_survive_when_they_carry_an_expiry_date():
    """지난 수집분이라도 종료일이 남아 있으면 유지한다.

    앱이 직접 알려준 종료일이 "이번 수집에 안 보였다"보다 정확하다 —
    한때 4개 앱 전부를 수집 시점만으로 잘랐다가 아직 살아 있는 쿠폰
    70건을 날렸다(2026-08-10)."""
    old = dict(RECORDS[0], platform="ddangyo", brand="지난주",
               captured_at="2026-08-03T00:00:00+09:00", expires_at="2026-08-31")
    new = dict(RECORDS[0], platform="ddangyo", brand="이번주",
               captured_at="2026-08-10T00:00:00+09:00", expires_at="2026-08-31")

    brands = sorted(o["brand"] for o in build_export([old, new], today="2026-08-10"))

    assert brands == ["이번주", "지난주"]


def test_older_sweeps_without_expiry_drop_on_every_platform():
    """종료일이 없으면 이번 수집에 안 보인 순간 끝난 것으로 본다.

    배민만이 아니라 4개 앱 모두 그렇다 — 프로모션이 월요일 00시에
    통째로 갈린다."""
    old = dict(RECORDS[0], platform="ddangyo", brand="지난주",
               captured_at="2026-08-03T00:00:00+09:00", expires_at=None)
    new = dict(RECORDS[0], platform="ddangyo", brand="이번주",
               captured_at="2026-08-10T00:00:00+09:00", expires_at=None)

    brands = {o["brand"] for o in build_export([old, new], today="2026-08-10",
                                               sweeps={"ddangyo": "2026-08-10"})}

    assert "지난주" not in brands
    assert "이번주" in brands


def test_tier_level_expiry_also_keeps_an_older_sweep():
    """구간에만 종료일이 달린 경우도 종료일이 있는 것으로 친다."""
    old = dict(RECORDS[0], platform="ddangyo", brand="지난주",
               captured_at="2026-08-03T00:00:00+09:00", expires_at=None,
               tiers=[{"min_order": 15000, "amount": 3000, "expires_at": "2026-08-31"}])
    new = dict(RECORDS[0], platform="ddangyo", brand="이번주",
               captured_at="2026-08-10T00:00:00+09:00", expires_at=None)

    brands = sorted(o["brand"] for o in build_export([old, new], today="2026-08-10"))

    assert brands == ["이번주", "지난주"]


def test_build_export_carries_tier_mode():
    records = [dict(RECORDS[1], tier_mode="cumulative", tiers=[
        {"min_order": 17000, "amount": 4000},
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ])]
    item = build_export(records)[0]
    assert item["tierMode"] == "cumulative"


def test_build_export_defaults_tier_mode_to_exclusive():
    # 기존 원장 레코드는 이 필드가 없다 — 없으면 exclusive다.
    item = build_export(RECORDS)[0]
    assert item["tierMode"] == "exclusive"


def test_menu_limited_tag_does_not_outlive_its_carry_window():
    # 몇 주 전 다른 채널에서 같은 금액으로 메뉴 한정 쿠폰이 한 번 있었다는
    # 이유만으로, 지금의 평범한 최소주문 쿠폰까지 영영 "특정메뉴"로 찍히면
    # 안 된다(2026-09-09 실기 확인: bhc·파리바게뜨 등 다섯 곳이 이렇게
    # 잘못 찍혀 있었다 — 배민 앱에서 직접 열어 보니 메뉴 제한이 없었다).
    old_menu_limited = {
        "platform": "ddangyo", "brand": "국민낙곱새", "amount": 2000,
        "qualifier": None, "needs_review": False, "offer_type": "discount",
        "section": None, "raw_text": "2,000원 메뉴할인, 25,000원 이상 구매 시",
        "captured_at": "2026-08-01T12:00:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "auto",
        "screenshot_path": "ref/x.jpg",
    }
    current_plain_coupon = {
        "platform": "baemin", "brand": "국민낙곱새", "amount": 2000,
        "qualifier": None, "needs_review": False, "offer_type": "discount",
        "section": None, "raw_text": "20,000원 이상 2,000원",
        "captured_at": "2026-09-09T12:00:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "auto",
        "screenshot_path": "ref/y.jpg",
    }
    records = [old_menu_limited, current_plain_coupon]

    # 같은 금액의 더 최근 관측이 메뉴 얘기 없이 평범하게 찍혔으므로
    # 물려받지 않는다 — 옛 메뉴 한정 관측이 며칠 안이든 밖이든 상관없다.
    assert ("국민낙곱새", 2000) not in menu_limited_keys(records, as_of="2026-09-09")
    assert ("국민낙곱새", 2000) not in menu_limited_keys(records, as_of=None)

    # 플랫폼이 다르면 둘 다 살아남는다(최신값 고르기는 앱별로 센다).
    # 옛 땡겨요 행은 자기 문구가 "메뉴할인"이라 붙는 게 맞고, 확인할 것은
    # 새로 찍힌 배민 행이다.
    out = build_export(records, today="2026-09-09")
    baemin = next(x for x in out if x["platform"] == "baemin")
    assert baemin["qualifier"] != "특정메뉴"


def test_menu_limited_tag_still_carries_within_the_window():
    # 창 자체를 없애는 과교정은 아니다 — 최근 기록이면 여전히 물려받는다
    # (훌랄라 사례, 이 함수의 원래 목적).
    recent_menu_limited = {
        "platform": "ddangyo", "brand": "훌랄라참숯바베큐치킨", "amount": 12100,
        "qualifier": None, "needs_review": False, "offer_type": "discount",
        "section": None, "raw_text": "(순살) 참숯구이 1.5마리 사용 가능",
        "captured_at": "2026-09-01T12:00:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "auto",
        "screenshot_path": "ref/x.jpg",
    }
    keys = menu_limited_keys([recent_menu_limited], as_of="2026-09-09")
    assert ("훌랄라참숯바베큐치킨", 12100) in keys


def test_menu_limited_tag_comes_from_the_record_itself_first():
    """그 행이 스스로 메뉴 한정이라고 적고 있으면 이력을 안 뒤진다.

    훌랄라 12,100원은 배민클럽 전용이면서 메뉴 한정인데, 쿠폰함에서 새로
    관측되자 (브랜드, 금액) 이력 판정이 표식을 놓쳤다(2026-09-09).
    쿠폰함 목록 화면은 메뉴 제한을 아예 안 적는다 — 안 적힌 것을 "없다"로
    읽으면 안 된다.
    """
    record = {
        "platform": "baemin", "brand": "훌랄라참숯바베큐치킨", "amount": 12100,
        "qualifier": None, "needs_review": False, "offer_type": "discount",
        "section": "쿠폰함 보유쿠폰",
        "raw_text": "12,100원 배민클럽 훌랄라참숯치킨 할인",
        "conditions": "특정 메뉴 한정 할인",
        "membership": "baeminClub",
        "captured_at": "2026-09-09T12:00:00+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "auto",
        "screenshot_path": "ref/x.jpg",
    }
    item = build_export([record], today="2026-09-09")[0]
    assert item["qualifier"] == "특정메뉴"
    assert item["membership"] == "baeminClub"


def test_menu_limited_tag_carries_when_nothing_newer_contradicts_it():
    # 같은 금액을 아무도 다시 안 봤으면(날짜가 며칠 지났어도) 유일한
    # 증거인 옛 메뉴 한정 관측을 그대로 믿는다 — 물려받지 않는 쪽으로
    # 과교정하지 않는다.
    only_observation = {
        "platform": "baemin", "brand": "파리바게뜨", "amount": 4000,
        "qualifier": None, "needs_review": False, "offer_type": "discount",
        "section": None, "raw_text": "4,000원 메뉴할인",
        "captured_at": "2026-08-31T01:23:15+09:00", "unit": "KRW", "scope": "brand",
        "target_address": "x", "capture_mode": "manual",
        "screenshot_path": "ref/x.jpg",
    }
    assert ("파리바게뜨", 4000) in menu_limited_keys([only_observation], as_of="2026-09-09")


def test_camel_tiers_carries_cap():
    # 정률 tier의 상한액(ADR-019). 정액 tier에는 붙지 않는다.
    out = camel_tiers([
        {"min_order": 17000, "amount": 4000},
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ])
    assert out == [
        {"minOrder": 17000, "amount": 4000},
        {"minOrder": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]
