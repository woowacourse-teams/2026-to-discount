"""캡처·조사 산출물을 검증해서 원장(log.jsonl)에 덧붙인다.

## 왜 필요한가

원장에 넣을 길이 없으면 사람은 export.json을 직접 고친다. 2026-08-05에
실제로 그랬다 — 땡겨요 브랜드관 37장을 순회해 (브랜드, 캠페인기간, 링크,
최소주문금액)을 구조화해 뽑아놓고도, 그걸 원장에 넣을 방법이 없어
export.json을 손으로 패치했다. 드리프트를 고치던 중에 드리프트를 하나 더
만든 셈이다. 게을러서가 아니라 올바른 길이 막혀 있어서다.

## 정정은 삭제가 아니라 덮어쓰기다

원장은 append-only다. 틀린 값을 고치려면 지우는 게 아니라 **더 최신 시각의
새 관측**을 넣어야 하고, 승자는 `store._prefer`가 정한다(확정 > 최신 >
금액). 그래서 정정 레코드는 `needs_review=False`에 기존보다 늦은
`captured_at`이어야 이긴다 — 이걸 모르고 넣으면 "고쳤는데 반영이 안 되네"가
된다. `--dry-run`이 그 판정 결과를 미리 보여준다.

입력은 원장 모양(snake_case)의 레코드 리스트다. 수집기가 앱마다 다른 화면을
원장 모양으로 옮기는 일까지 맡고, 여기서는 검증과 적재만 한다.
"""
import json
import sys
from pathlib import Path

from schema import validate_record
from store import append_record, latest_per_brand, read_records

LOG_PATH = Path(__file__).parent / "data" / "log.jsonl"


def _identity(record: dict) -> tuple:
    """같은 관측인지 — 같은 앱·브랜드를 같은 시각에 본 기록은 하나면 된다.

    같은 파일을 두 번 넣어도 원장이 부풀지 않게 한다. 값을 고치려는
    정정은 시각이 다르므로 이 키에 걸리지 않는다.
    """
    return record.get("platform"), record.get("brand"), record.get("captured_at")


def plan(candidates: list[dict], existing: list[dict]) -> tuple[list, list, list]:
    """(넣을 것, 이미 있는 것, 검증 실패) 로 가른다."""
    seen = {_identity(r) for r in existing}
    fresh, duplicate, invalid = [], [], []
    for record in candidates:
        try:
            normalized = validate_record(record)
        except ValueError as exc:
            invalid.append((record, str(exc)))
            continue
        if _identity(normalized) in seen:
            duplicate.append(normalized)
        else:
            seen.add(_identity(normalized))
            fresh.append(normalized)
    return fresh, duplicate, invalid


def wins_after_ingest(fresh: list[dict], existing: list[dict]) -> dict:
    """넣고 나면 각 (앱, 브랜드)에서 어느 레코드가 이기는지.

    정정이 실제로 반영되는지 넣기 전에 확인하려고 둔다 — 더 오래됐거나
    needs_review인 정정은 조용히 진다.
    """
    return latest_per_brand(existing + fresh)


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in argv
    if not args:
        print("사용법: python ingest.py <records.json> [--dry-run]")
        return 2

    candidates = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    if isinstance(candidates, dict):
        candidates = [candidates]
    existing = read_records(LOG_PATH)
    fresh, duplicate, invalid = plan(candidates, existing)

    for record, reason in invalid:
        print(f"  거부: {record.get('brand')} / {record.get('platform')} — {reason}")
    print(f"신규 {len(fresh)} · 중복 {len(duplicate)} · 거부 {len(invalid)}")

    if invalid:
        print("검증에 실패한 레코드가 있어 넣지 않는다 — 고치고 다시 실행할 것")
        return 1

    if dry_run:
        winners = wins_after_ingest(fresh, existing)
        for record in fresh:
            key = (record["platform"], record["brand"])
            # 객체 동일성(`is`)으로 비교하면 안 된다 — _prefer는 이긴 쪽을
            # 그대로 돌려주지 않고 진 쪽의 상세를 병합한 새 dict를 만든다.
            # 그래서 이겼는데도 늘 "졌다"고 나온다(2026-08-05에 실제로
            # 108건 중 60건을 틀리게 보고했다).
            won = _identity(winners[key]) == _identity(record)
            print(f"  {record['brand']} / {record['platform']} -> "
                  f"{'반영됨' if won else '기존 레코드에 짐'}")
        return 0

    for record in fresh:
        append_record(record, LOG_PATH)
    print(f"원장에 {len(fresh)}건 추가")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
