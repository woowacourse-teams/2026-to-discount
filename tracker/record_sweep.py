"""전수 수집을 마쳤다는 사실을 `data/sweeps.jsonl`에 적는다.

## 왜 따로 적나

종료일 없는 오퍼는 "이번 수집에 안 보였다"로만 내릴 수 있다(export_data
.is_stale_sweep). 그러려면 그 수집이 목록을 **다 훑은 것**이어야 하는데,
전에는 그날 레코드 건수로 추정했다. 추정은 양쪽으로 다 틀렸다 — 손으로
5건 넣은 날이 수집일로 잡혀 살아 있는 브랜드가 사라졌고(2026-08-10),
임계값을 10으로 올린 뒤엔 정정 10건이 수집일로 잡혀 배민 브랜드 69개가
한꺼번에 사라졌다(2026-08-16).

건수는 수집 여부를 말해주지 않는다. 그래서 사람이 직접 적는다.

## 언제 적나

목록을 처음부터 끝까지 훑고, 그 결과를 원장에 넣은 **직후**. 중간에
끊겼거나 일부만 본 날은 적지 않는다 — 안 적으면 아무것도 안 내려갈 뿐
(끝난 프로모션이 남는 정도)이지만, 잘못 적으면 살아 있는 프로모션이
화면에서 사라진다. 한쪽이 훨씬 싸다.

## 사용법

    python record_sweep.py yogiyo                 # 오늘 날짜로
    python record_sweep.py baemin 2026-08-10      # 날짜 지정
    python record_sweep.py yogiyo --note "브랜드 혜택 탭 전수"
"""
import json
import sys
from datetime import date
from pathlib import Path

BASE = Path(__file__).parent
SWEEPS_PATH = BASE / "data" / "sweeps.jsonl"
LOG_PATH = BASE / "data" / "log.jsonl"

ALLOWED_PLATFORMS = {"baemin", "coupangeats", "yogiyo", "ddangyo", "specialdelivery"}


def read_sweeps(path: Path = SWEEPS_PATH) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def count_records(platform: str, day: str, log_path: Path = LOG_PATH) -> int:
    """그날 그 앱으로 원장에 들어간 레코드 수. 기록용 참고값이다."""
    if not log_path.exists():
        return 0
    total = 0
    for line in log_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        if record["platform"] == platform and record["captured_at"][:10] == day:
            total += 1
    return total


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args or args[0] not in ALLOWED_PLATFORMS:
        print(f"사용법: python record_sweep.py <{'|'.join(sorted(ALLOWED_PLATFORMS))}> [YYYY-MM-DD]")
        return 2

    platform = args[0]
    day = args[1] if len(args) > 1 else date.today().isoformat()
    note = ""
    if "--note" in argv:
        idx = argv.index("--note")
        if idx + 1 < len(argv):
            note = argv[idx + 1]

    existing = read_sweeps()
    if any(s["platform"] == platform and s["date"] == day for s in existing):
        print(f"이미 적혀 있다: {platform} {day}")
        return 0

    entry = {"platform": platform, "date": day, "records": count_records(platform, day)}
    if note:
        entry["note"] = note

    with SWEEPS_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"기록: {platform} {day} (원장 {entry['records']}건)")
    print("이제 export_data.py를 돌리면 이 날짜 이전 관측 중 종료일 없는 것이 내려간다.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
