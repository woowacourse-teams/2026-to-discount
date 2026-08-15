"""원장이 스스로 모순되지 않는지 본다.

cumulative 레코드의 대표값(amount)은 사다리 최저 문턱과 같아야 한다.
API가 그 값을 계산해서 내려주므로, 원장 쪽 숫자가 어긋나 있으면 화면과
원장이 다른 말을 하게 된다. 사람이 손으로 더하다 틀리는 걸 여기서 잡는다.
"""
import json
import re
from pathlib import Path

from export_data import ladder_floor
from schema import validate_record

LOG_PATH = Path(__file__).parent.parent / "data" / "log.jsonl"


def read_log():
    with open(LOG_PATH, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def test_ladder_floor_of_yogiyo_two_step_coupon():
    # 굽네치킨 실측(2026-07-31): 17,000원 이상 4,000원 고정 메뉴할인 +
    # 25,000원 이상 5%(상한 3,000)의 정률 쿠폰을 겹쳐 쓴다.
    #   17,000원 주문 -> 4,000
    #   25,000원 주문 -> 4,000 + 1,250 = 5,250
    # 대표값은 최저 문턱인 4,000이다(ADR-019).
    tiers = [
        {"min_order": 17000, "amount": 4000},
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
    ]
    assert ladder_floor(tiers) == 4000


def test_ladder_floor_ignores_tier_order():
    tiers = [
        {"min_order": 25000, "amount": 1250, "percent": 5, "cap": 3000},
        {"min_order": 17000, "amount": 4000},
    ]
    assert ladder_floor(tiers) == 4000


def test_ladder_floor_treats_missing_min_order_as_no_threshold():
    # min_order가 없으면 문턱이 없다는 뜻이라 가장 낮은 칸이다.
    tiers = [
        {"min_order": None, "amount": 2000},
        {"min_order": 18000, "amount": 3000},
    ]
    assert ladder_floor(tiers) == 2000


def test_every_cumulative_record_amount_matches_its_ladder_floor():
    """지금 화면에 나가는 레코드만 본다.

    원장은 append-only라 옛 관측이 그대로 남는다. 그중엔 나중에 정정된
    것도 있는데(정정은 삭제가 아니라 더 최신 관측으로 덮어쓰기다),
    진 관측까지 검사하면 한 번 틀린 값이 영원히 이 테스트를 깨뜨린다.
    검사해야 할 것은 "지금 무엇을 내보내는가"이므로 승자만 본다.

    실제로 2026-08-16에 요기요 두 건을 문턱이 같은 tier 둘로 적으면서
    합(7,777)이 아니라 정액분(7,000)만 대표로 넣었고, 곧 한 tier로
    합쳐 정정했다. 정정된 지금 값은 맞지만 진 관측은 그대로 남아 있다.
    """
    from store import latest_per_brand

    mismatched = []
    for record in latest_per_brand(read_log()).values():
        if record.get("tier_mode") != "cumulative":
            continue
        floor = ladder_floor(record["tiers"])
        if record["amount"] != floor:
            mismatched.append(
                f"{record['brand']}/{record['platform']}: "
                f"amount={record['amount']} != 사다리 최저 {floor}")
    assert not mismatched, "\n".join(mismatched)


def test_every_ledger_record_passes_current_schema():
    # 마이그레이션이 스키마를 어기지 않았는지. cap 동반 필수, cumulative의
    # tier 2개·qualifier "최소"가 전부 여기서 걸린다.
    for record in read_log():
        validate_record(dict(record))


def test_percent_tier_amount_is_the_floored_threshold_share():
    # 정률 tier의 amount는 정의상 min_order x percent를 원 단위로 내린 값이다
    # (25,000 x 5% = 1,250). 올림으로 과대 표시하지 않는다 — ADR-019.
    # 스키마로 강제하지 않고 여기서 보는 이유: min_order가 없는 정률 쿠폰이
    # 나오면 이 관계가 성립하지 않는데, 그런 사례가 아직 없어 규칙으로
    # 굳히기엔 이르다.
    wrong = []
    for record in read_log():
        for tier in record.get("tiers") or []:
            if "percent" not in tier or tier.get("min_order") is None:
                continue
            expected = int(tier["min_order"] * tier["percent"] / 100)
            if tier["amount"] != expected:
                wrong.append(
                    f"{record['brand']}/{record['platform']}: "
                    f"amount={tier['amount']} != {expected} "
                    f"({tier['min_order']} x {tier['percent']}%)")
    assert not wrong, "\n".join(wrong)


DATE_IN_TEXT = re.compile(r"\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[-.]\d{1,2}[-.]\d{1,2}")


def test_conditions_carry_no_dates():
    # 기간 한정은 expires_at이 담는다. 문장에 날짜를 적으면 만료 판정이
    # 손을 못 대고, 병합(store._prefer)이 같은 (앱, 브랜드) 안에서 그
    # 문장을 새 관측으로 계속 옮겨 실어 날이 지나도 화면에 남는다 —
    # 배민 자담치킨의 "8월 11일 땡데이 이벤트"가 그랬다(2026-08-16 정정).
    # 승자만 본다. 원장은 append-only라 옛 관측은 고칠 수 없다.
    from store import latest_per_brand

    dated = [
        f"{record['platform']}/{record['brand']}: {record['conditions']}"
        for record in latest_per_brand(read_log()).values()
        if DATE_IN_TEXT.search(record.get("conditions") or "")
    ]
    assert not dated, "conditions에 날짜를 쓰지 않는다 — expires_at으로 옮겨라:\n" + "\n".join(dated)
