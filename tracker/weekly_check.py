"""매주 한 번, "어느 플랫폼을 다시 훑어야 하나"를 답한다.

## 무엇을 하지 않는가

수집이 옳은지는 판정하지 않는다. 원장 필드만으로 사고를 가르려는 시도는
[ADR-022]에서 이미 기각했다 — 오탐을 뱉는 가드는 결국 꺼진다. 여기서는
**기록에 이미 적혀 있는 사실만** 센다: 마지막 전수 수집이 언제였는지
(`data/sweeps.jsonl`), 무엇이 곧 끝나는지(`expires_at`), 그리고 커밋된
export가 원장에서 다시 만든 것과 같은지.

## 왜 마지막 항목이 제일 중요한가

`export.json`은 원장의 파생물이다. 손으로 고치면 다음 재생성 한 번에
조용히 되돌아간다 — 2026-08-22에 실제로 그랬다. 청년피자 배지를 export에서
지웠는데 원장에는 그 관측이 남아 있어, 재생성하자 그대로 살아났다. 그때는
아무도 몰랐고 배포는 성공했다.

그 드리프트만 실패로 잡는다(exit 1). 나머지는 사람이 판단할 정보라 경고로
출력만 한다.

사용:
    python weekly_check.py            # 오늘 기준
    python weekly_check.py 2026-08-23 # 날짜 고정(테스트용)
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from config import use_utf8_stdout
from export_data import build_export, latest_sweep_dates
from store import read_records

ROOT = Path(__file__).resolve().parent
LOG_PATH = ROOT / "data" / "log.jsonl"
SWEEPS_PATH = ROOT / "data" / "sweeps.jsonl"
EXPORT_PATH = ROOT / "data" / "export.json"

PLATFORMS = ["baemin", "coupangeats", "ddangyo", "yogiyo"]

# 한 주에 한 번 훑는다는 전제다. 8일이면 한 주기를 통째로 건너뛴 것이다.
SWEEP_DUE_DAYS = 8
# 곧 끝나는 것을 미리 본다 — 끝난 뒤에 알면 그 사이 화면이 비어 있었다.
EXPIRY_SOON_DAYS = 7


def sweep_ages(today: date) -> list[tuple[str, str | None, int | None]]:
    """(플랫폼, 마지막 전수 수집일, 경과일). 기록이 없으면 (플랫폼, None, None)."""
    last: dict[str, str] = {}
    if SWEEPS_PATH.exists():
        for line in SWEEPS_PATH.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            platform, day = row.get("platform"), row.get("date")
            if platform and day and day > last.get(platform, ""):
                last[platform] = day

    out = []
    for platform in PLATFORMS:
        day = last.get(platform)
        age = (today - date.fromisoformat(day)).days if day else None
        out.append((platform, day, age))
    return out


def expiring(exported: list[dict], today: date) -> dict[str, list[str]]:
    """플랫폼별로 EXPIRY_SOON_DAYS 안에 끝나는 브랜드."""
    limit = (today + timedelta(days=EXPIRY_SOON_DAYS)).isoformat()
    soon: dict[str, list[str]] = {}
    for record in exported:
        ends = record.get("expiresAt")
        if ends and today.isoformat() <= ends <= limit:
            soon.setdefault(record["platform"], []).append(record["brand"])
    return soon


def undated(exported: list[dict]) -> dict[str, int]:
    """종료일이 없어 다음 전수 수집으로만 내릴 수 있는 오퍼 수."""
    counts: dict[str, int] = {}
    for record in exported:
        if not record.get("expiresAt"):
            counts[record["platform"]] = counts.get(record["platform"], 0) + 1
    return counts


def export_drift(records: list[dict], today: date) -> list[str]:
    """커밋된 export.json과 원장 재생성 결과의 차이. 같으면 빈 목록."""
    if not EXPORT_PATH.exists():
        return ["export.json이 없다"]

    committed = json.loads(EXPORT_PATH.read_text(encoding="utf-8"))
    rebuilt = build_export(records, today=today.isoformat(),
                           sweeps=latest_sweep_dates(records))

    def key(record):
        return record["brand"], record["platform"]

    left = {key(r): r for r in committed}
    right = {key(r): r for r in rebuilt}

    lines = []
    for k in sorted(set(left) - set(right)):
        lines.append(f"커밋본에만 있음: {k[0]} / {k[1]}")
    for k in sorted(set(right) - set(left)):
        lines.append(f"원장에만 있음: {k[0]} / {k[1]}")
    for k in sorted(set(left) & set(right)):
        for field in sorted(set(left[k]) | set(right[k])):
            before, after = left[k].get(field), right[k].get(field)
            if before != after:
                lines.append(
                    f"{k[0]} / {k[1]} · {field}: 커밋본 {before!r} vs 원장 {after!r}")
    return lines


def main(argv: list[str]) -> int:
    use_utf8_stdout()
    today = date.fromisoformat(argv[1]) if len(argv) > 1 else date.today()
    records = read_records(LOG_PATH)
    exported = build_export(records, today=today.isoformat(),
                            sweeps=latest_sweep_dates(records))

    print(f"# 주간 점검 {today.isoformat()}")
    print()
    print("## 전수 수집 경과")
    due = []
    for platform, day, age in sweep_ages(today):
        if day is None:
            print(f"  {platform:<12} 기록 없음")
            due.append(platform)
            continue
        mark = "  ← 다시 훑을 때" if age >= SWEEP_DUE_DAYS else ""
        print(f"  {platform:<12} {day}  {age}일 전{mark}")
        if age >= SWEEP_DUE_DAYS:
            due.append(platform)

    print()
    print(f"## {EXPIRY_SOON_DAYS}일 안에 끝나는 오퍼")
    soon = expiring(exported, today)
    if not soon:
        print("  없음")
    for platform in PLATFORMS:
        names = soon.get(platform)
        if names:
            print(f"  {platform:<12} {len(names)}건: {', '.join(sorted(names)[:8])}"
                  + (" ..." if len(names) > 8 else ""))

    print()
    print("## 종료일 없는 오퍼 (다음 전수 수집으로만 내려간다)")
    counts = undated(exported)
    if not counts:
        print("  없음")
    for platform in PLATFORMS:
        if counts.get(platform):
            print(f"  {platform:<12} {counts[platform]}건")

    print()
    print("## export.json과 원장 일치")
    drift = export_drift(records, today)
    if not drift:
        print(f"  일치 ({len(exported)}건)")
    else:
        for line in drift:
            print(f"  {line}")
        print()
        print("커밋된 export.json이 원장에서 다시 만든 것과 다르다.")
        print("export.json을 손으로 고쳤다면 그 수정은 다음 재생성에 사라진다 —")
        print("정정은 ingest.py로 원장에 더 늦은 관측을 넣는 것이다(ingest.py 서두).")
        return 1

    if due:
        print()
        print(f"다시 훑을 것: {', '.join(due)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
