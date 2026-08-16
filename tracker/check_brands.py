"""원장에 찍힌 brand 이름이 api `brands.yml`에 등록됐는지 확인한다.

비전 판독 오타나 신규 브랜드를 조용히 놓치지 않으려는 체크 — 결과는
사람이 보고 오타면 캡처를 다시 확인하고, 신규 브랜드면 api 레포
`brands.yml`에 직접 추가한다. 여기서 자동으로 추가하지 않는다.

`brands.yml`이 어디 있는지는 환경마다 다르다. 원본 저장소에서는 sibling
`delivery-discount-api/`에, 모노레포에서는 `api/`에 있고, 워크트리 안에서
돌리면 둘 다 한 단계 더 위다(ADR-018). 후보를 순서대로 훑어 처음 있는
것을 쓰고, 하나도 없으면 건너뛴다 — 본 파이프라인(export_data.py 등)은
이 스크립트 없이도 동작해야 한다.

`DISCOUNT_BRANDS_YML` 환경변수를 주면 그 경로를 먼저 본다.
"""
import os
import sys
from pathlib import Path

import yaml

from config import use_utf8_stdout
from store import read_records

BASE = Path(__file__).parent
LOG_PATH = BASE / "data" / "log.jsonl"
RESOURCES = Path("src") / "main" / "resources" / "brands.yml"


def _find_brands_yml() -> Path:
    override = os.environ.get("DISCOUNT_BRANDS_YML")
    if override:
        return Path(override)
    # 워크트리에서 돌리면 저장소 루트가 두세 단계 더 깊다(ADR-018) —
    # 고정 깊이 대신 조상을 훑는다.
    names = ("delivery-discount-api", "api")
    for ancestor in [BASE, *BASE.parents]:
        for name in names:
            candidate = ancestor.parent / name / RESOURCES
            if candidate.exists():
                return candidate
    return BASE.parent / names[0] / RESOURCES


BRANDS_YML = _find_brands_yml()


def _known_brand_names(brands_yml: Path) -> set[str]:
    """대표명 + 별칭을 하나의 평탄한 집합으로. 대표명 자체도 별칭으로 친다."""
    with open(brands_yml, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    known = set()
    for name, attrs in (data.get("brands") or {}).items():
        known.add(name)
        known.update((attrs or {}).get("aliases") or [])
    return known


def unknown_brands(records: list[dict], known: set[str]) -> list[str]:
    return sorted({r["brand"] for r in records if r["brand"] not in known})


def main() -> int:
    use_utf8_stdout()
    if not BRANDS_YML.exists():
        print(f"brands.yml 없음(건너뜀): {BRANDS_YML}")
        return 0

    known = _known_brand_names(BRANDS_YML)
    unknown = unknown_brands(read_records(LOG_PATH), known)

    if not unknown:
        print("brands.yml에 없는 brand 없음.")
        return 0

    print(f"brands.yml에 없는 brand {len(unknown)}개 — 오타인지 신규 브랜드인지 확인 후 등록:")
    for name in unknown:
        print(f"  - {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
