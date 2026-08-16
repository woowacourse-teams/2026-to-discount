"""배포하려는 export.json이 서버에 이미 있는 것보다 낡았는지 본다.

deploy.yml은 커밋된 `data/export.json`을 서버 경로로 그대로 `cp`한다.
커밋이 서버 실물보다 뒤처져 있으면 이 복사 한 번에 서버 쪽 데이터가
사라진다 — 사람 개입 없이, 푸시 하나로.

2026-08-05 실측: 서버가 138건인데 커밋본은 135건이었다. 그대로 밀었으면
열정국밥·호식이두마리치킨 신규 2건과 청년피자 배민클럽 7,500원, 쿠팡이츠
badge 3건, 요기요 버거킹 conditions가 날아갔다. 08-01 이후 수집분이
export.json 직접 편집으로 들어오는 동안 커밋이 따라가지 못한 결과다.

## 왜 "건수가 줄면 실패"가 아닌가

프로모션이 끝나면 그 레코드는 정당하게 빠진다. 건수로 재면 정상 만료마다
오탐이 나고, 오탐을 뱉는 가드는 결국 꺼진다 — 없느니만 못하다.

대신 **최신 캡처 시각**을 본다. 들어오는 파일의 가장 최근 capturedAt이
서버 것보다 이르면, 그 파일은 서버가 이미 아는 것을 모르는 낡은 파일이다.
정상적으로 갱신한 커밋은 항상 서버 이상으로 최신이라 걸리지 않는다.

사라지는 (브랜드, 플랫폼)은 실패시키지 않고 로그로만 남긴다 — 만료로 인한
정상 제거와 사고를 이 층에서 구분할 근거가 없기 때문이다. 눈으로 볼 수는
있어야 하니 출력은 한다.
"""
import json
import sys
from pathlib import Path

from config import use_utf8_stdout


def latest_capture(records: list[dict]) -> str:
    """가장 최근 capturedAt. 비어 있으면 빈 문자열(어떤 값보다도 이르다)."""
    return max((r.get("capturedAt") or "" for r in records), default="")


def vanishing(incoming: list[dict], server: list[dict]) -> list[tuple[str, str]]:
    """서버엔 있는데 들어오는 쪽엔 없는 (브랜드, 플랫폼)."""
    key = lambda r: (r.get("brand"), r.get("platform"))
    have = {key(r) for r in incoming}
    return sorted({key(r) for r in server} - have)


# 채워져 있던 값이 비면 정보가 사라진 것이다. amount는 값이 바뀌는 게
# 정상이라 뺀다 — 여기 있는 건 "있다가 없어지면 되돌릴 수 없는" 상세뿐이다.
DETAIL_FIELDS = ("tiers", "badge", "minOrderAmount", "conditions", "expiresAt")


def losing_detail(incoming: list[dict], server: list[dict]) -> list[str]:
    """서버엔 채워져 있는데 들어오는 쪽에선 비는 상세 필드.

    캡처 시각 비교만으로는 이 경우를 못 잡는다 — 시각이 같은데 내용만
    다르면 통과한다. 2026-08-05에 실제로 그렇게 뚫렸다: 서버의 청년피자
    땡겨요 레코드가 tiers 2건과 badge("포장 +1,000")를 들고 있었는데,
    같은 캡처 시각(07-31)의 로컬 사본은 그 값이 없었고 그대로 덮여
    사라졌다. 로컬 사본이 서버와 같다고 가정하고 표본만 대조한 탓이다.
    """
    key = lambda r: (r.get("brand"), r.get("platform"))
    # 한 (브랜드, 앱)에 레코드가 둘일 수 있다 — 배민 청년피자는 일반
    # 4,000원과 배민클럽 7,500원이 따로 들어 있다. 키로 하나만 집으면
    # 다른 쪽 레코드의 값과 비교해 엉뚱하게 "사라졌다"고 한다.
    have: dict = {}
    for record in incoming:
        have.setdefault(key(record), []).append(record)

    out = []
    for record in server:
        candidates = have.get(key(record))
        if not candidates:
            continue
        for field in DETAIL_FIELDS:
            if record.get(field) is None:
                continue
            if all(c.get(field) is None for c in candidates):
                out.append(f"{record.get('brand')} / {record.get('platform')}: "
                           f"{field} {record.get(field)!r} -> 없음")
    return out


def staleness(incoming: list[dict], server: list[dict]) -> str | None:
    """배포를 막아야 할 사유. 안전하면 None."""
    new, old = latest_capture(incoming), latest_capture(server)
    if new < old:
        return (f"배포하려는 export.json이 서버보다 낡았다 — "
                f"최신 캡처 {new or '없음'} < 서버 {old}. "
                f"서버 쪽 갱신을 원장에 먼저 흡수할 것.")
    lost = losing_detail(incoming, server)
    if lost:
        return ("서버에 있는 상세가 사라진다:\n    " + "\n    ".join(lost))
    return None


def main(argv: list[str]) -> int:
    use_utf8_stdout()

    incoming_path, server_path = Path(argv[1]), Path(argv[2])
    incoming = json.loads(incoming_path.read_text(encoding="utf-8"))
    if not server_path.exists():
        print(f"서버에 {server_path}가 없다 — 첫 배포로 보고 통과")
        return 0
    server = json.loads(server_path.read_text(encoding="utf-8"))

    for brand, platform in vanishing(incoming, server):
        print(f"  사라짐: {brand} / {platform}")

    reason = staleness(incoming, server)
    if reason:
        print(f"배포 중단: {reason}")
        return 1
    print(f"배포 안전: {len(incoming)}건 (서버 {len(server)}건)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
