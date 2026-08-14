"""원장이 스스로 모순되지 않는지 본다.

cumulative 레코드의 대표값(amount)은 사다리 최저 문턱과 같아야 한다.
API가 그 값을 계산해서 내려주므로, 원장 쪽 숫자가 어긋나 있으면 화면과
원장이 다른 말을 하게 된다. 사람이 손으로 더하다 틀리는 걸 여기서 잡는다.
"""
import json
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
    mismatched = []
    for record in read_log():
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
