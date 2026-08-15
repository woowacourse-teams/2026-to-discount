#!/usr/bin/env python3
"""추적된 소스에서 프로젝트 구조 문서를 결정론적으로 생성한다."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "PROJECT-STRUCTURE.md"

LAYERS = ("tracker", "api", "web")

TOP_LEVEL_EXECUTABLE_EXTENSIONS = {
    ".gradle",
    ".html",
    ".java",
    ".js",
    ".jsx",
    ".json",
    ".kt",
    ".kts",
    ".py",
    ".rb",
    ".rs",
    ".swift",
    ".ts",
    ".tsx",
}

NON_UNIT_TOP_LEVEL = {"scripts"}

TOP_LEVEL_MARKERS = {
    "build.gradle",
    "build.gradle.kts",
    "package.json",
    "pyproject.toml",
    "settings.gradle",
    "settings.gradle.kts",
}

IGNORED_PREFIXES = (
    PurePosixPath("api/build"),
    PurePosixPath("api/data"),
    PurePosixPath("api/docs"),
    PurePosixPath("tracker/data"),
    PurePosixPath("tracker/docs"),
    PurePosixPath("tracker/ref"),
    PurePosixPath("web/dist"),
    PurePosixPath("web/docs"),
    PurePosixPath("web/node_modules"),
    PurePosixPath("web/public"),
)

IGNORED_SUFFIXES = {
    ".gif",
    ".hwp",
    ".jpeg",
    ".jpg",
    ".jsonl",
    ".pdf",
    ".png",
}

TRACKER_GROUPS = (
    ("데이터 모델", ("schema.py", "store.py")),
    ("원장 운용", ("ingest.py", "backfill_export.py", "check_deploy.py")),
    ("내보내기", ("export_data.py",)),
    ("일관성 검사", ("check_brands.py",)),
    ("판독 계약", ("parse",)),
    ("테스트 설정", ("conftest.py",)),
    ("검증", ("tests",)),
)

API_RESPONSIBILITIES = {
    "offer": "원장 스냅샷 적재, 만료 판정, 오퍼 선택",
    "brand": "대표명, 별칭, 카테고리, 플랫폼 링크",
    "comparison": "브랜드 단위 결합과 정렬",
    "banner": "당일 행사 로드와 날짜 판정",
    "testdata": "검수용 더미 데이터, 오류를 일부러 섞는다",
    "web": "HTTP 엔드포인트와 CORS",
    "analytics": "행동 이벤트 수집과 트래픽 집계",
}

WEB_RESPONSIBILITIES = {
    "App.css": "서비스 전체 스타일",
    "App.jsx": "브랜드 비교, 분류, 검색, 상세",
    "EventBanner.jsx": "당일 행사 배너",
    "api.js": "브랜드와 배너 API 호출",
    "analytics.js": "자체 행동 이벤트",
    "ga4.js": "임시 GA4 측정",
    "logos.jsx": "브랜드와 플랫폼 로고",
    "brandColor.js": "배너 색 파생",
    "main.jsx": "React와 분석 도구 진입점",
}


def tracked_files() -> list[PurePosixPath]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return sorted(
        {
            PurePosixPath(raw.decode("utf-8"))
            for raw in result.stdout.split(b"\0")
            if raw
        }
    )


def under(path: PurePosixPath, prefix: PurePosixPath) -> bool:
    return path == prefix or prefix in path.parents


def is_ignored_path(path: PurePosixPath) -> bool:
    return any(under(path, prefix) for prefix in IGNORED_PREFIXES)


def top_level_units(paths: list[PurePosixPath]) -> list[str]:
    units = set()
    for path in paths:
        if len(path.parts) < 2:
            continue
        if path.parts[0].startswith(".") or path.parts[0] in NON_UNIT_TOP_LEVEL:
            continue
        if path.name in TOP_LEVEL_MARKERS or path.suffix.lower() in TOP_LEVEL_EXECUTABLE_EXTENSIONS:
            units.add(path.parts[0])
    return sorted(units)


def is_source(path: PurePosixPath) -> bool:
    if path.parts[0] not in LAYERS:
        return False
    if is_ignored_path(path):
        return False
    return path.suffix.lower() not in IGNORED_SUFFIXES


def is_structure_input(path: PurePosixPath) -> bool:
    if path.parts[0] not in LAYERS:
        return False
    return not is_ignored_path(path)


def source_files(paths: list[PurePosixPath]) -> list[PurePosixPath]:
    return sorted(path for path in paths if is_source(path))


def structure_signature(paths: list[PurePosixPath]) -> str:
    return "\n".join(str(path) for path in paths if is_structure_input(path))


def count_by_layer(paths: list[PurePosixPath]) -> dict[str, int]:
    counts = {layer: 0 for layer in LAYERS}
    for path in paths:
        counts[path.parts[0]] += 1
    return counts


def count_by_api_package(paths: list[PurePosixPath]) -> dict[str, int]:
    prefix = ("api", "src", "main", "java", "com", "discounttracker")
    counts: defaultdict[str, int] = defaultdict(int)
    for path in paths:
        if path.parts[: len(prefix)] == prefix and len(path.parts) > len(prefix) + 1:
            counts[path.parts[len(prefix)]] += 1
    return dict(counts)


def api_endpoints(paths: list[PurePosixPath]) -> list[str]:
    controllers = sorted(
        path
        for path in paths
        if path.parts[:6] == ("api", "src", "main", "java", "com", "discounttracker")
        and path.name.endswith("Controller.java")
    )
    endpoints: list[str] = []
    mapping_pattern = re.compile(r'@(Get|Post|Put|Delete|Patch)Mapping\("([^"]+)"\)')
    base_pattern = re.compile(r'@RequestMapping\("([^"]+)"\)')
    declared_pattern = re.compile(
        r'^\s*@(?:Get|Post|Put|Delete|Patch|Request)Mapping\b', re.MULTILINE
    )

    for controller in controllers:
        source = (ROOT / controller).read_text(encoding="utf-8")
        base_match = base_pattern.search(source)
        base = base_match.group(1) if base_match else ""
        mappings = mapping_pattern.findall(source)
        declared = len(declared_pattern.findall(source))
        parsed = len(mappings) + (1 if base_match else 0)
        if declared != parsed:
            raise ValueError(
                f"{controller.name}의 매핑 어노테이션 {declared}개 중 {parsed}개만 "
                "읽었습니다. 한 줄 @GetMapping(\"/경로\") 형태만 읽으므로 "
                "여러 줄이나 value= 형태는 생성기를 고쳐야 합니다."
            )
        if not mappings:
            endpoints.append(f"{controller.name} 매핑은 코드 확인")
            continue
        for method, endpoint in mappings:
            path = f"{base.rstrip('/')}/{endpoint.lstrip('/')}"
            endpoints.append(f"{method.upper()} {path}")
    return sorted(endpoints)


def markdown_list(items: list[str]) -> str:
    return "\n".join(f"- `{item}`" for item in items)


def workflow_names(paths: set[PurePosixPath]) -> set[str]:
    workflows = sorted(
        path.name
        for path in paths
        if path.parts[:2] == (".github", "workflows")
        and path.name.startswith("deploy-")
    )
    if not workflows:
        raise ValueError("배포 워크플로를 찾지 못했습니다.")
    return set(workflows)


def tracker_rows(paths: set[PurePosixPath]) -> str:
    rows = []
    known = {member for _, members in TRACKER_GROUPS for member in members}
    for label, members in TRACKER_GROUPS:
        found = []
        for member in members:
            prefix = PurePosixPath("tracker") / member
            if prefix in paths or any(prefix in candidate.parents for candidate in paths):
                found.append(member)
        if found:
            rows.append(f"| {label} | {', '.join(f'`{item}`' for item in found)} |")
    unknown = sorted(
        {
            path.parts[1]
            for path in paths
            if path.parts[0] == "tracker"
            and len(path.parts) > 1
            and not path.parts[1].startswith(".")
            and path.parts[1] != "README.md"
            and path.parts[1] not in known
        }
    )
    if unknown:
        rows.append(f"| 기타 현재 모듈 | {', '.join(f'`{item}`' for item in unknown)} |")
    return "\n".join(rows)


def web_rows(paths: set[PurePosixPath]) -> str:
    rows = []
    modules = sorted(
        path.name
        for path in paths
        if path.parts[:2] == ("web", "src") and len(path.parts) == 3
    )
    for name in modules:
        responsibility = WEB_RESPONSIBILITIES.get(name, "런타임 모듈, 세부 책임은 코드 확인")
        rows.append(f"| `{name}` | {responsibility} |")
    return "\n".join(rows)


def render(paths: list[PurePosixPath], all_paths: list[PurePosixPath]) -> str:
    units = top_level_units(all_paths)
    unexpected_units = sorted(set(units) - set(LAYERS))
    if unexpected_units:
        raise ValueError(
            "새 최상위 실행 단위를 구조 생성기에 분류하세요: "
            + ", ".join(unexpected_units)
        )
    path_set = set(paths)
    signature_paths = sorted(
        {path for path in all_paths if is_structure_input(path)}
    )
    counts = count_by_layer(signature_paths)
    api_counts = count_by_api_package(paths)
    endpoints = api_endpoints(paths)

    api_rows = "\n".join(
        f"| `{package}/` | {API_RESPONSIBILITIES.get(package, '새 도메인 패키지, 세부 책임은 코드 확인')} | {count} |"
        for package, count in sorted(api_counts.items())
    )

    signature = structure_signature(signature_paths)

    deploy_workflows = workflow_names(set(all_paths))
    expected_deploy_workflows = {"deploy-api.yml", "deploy-data.yml"}
    missing_deploy_workflows = expected_deploy_workflows - deploy_workflows
    if missing_deploy_workflows:
        raise ValueError(
            "배포 그림이 참조하는 워크플로가 없습니다: "
            + ", ".join(sorted(missing_deploy_workflows))
        )
    unexpected_deploy_workflows = deploy_workflows - expected_deploy_workflows
    if unexpected_deploy_workflows:
        raise ValueError(
            "새 배포 워크플로를 배포 그림에 분류하세요: "
            + ", ".join(sorted(unexpected_deploy_workflows))
        )

    return f"""# 프로젝트 구조

<!-- structure-inputs
{signature}
-->

이 문서는 추적된 구조 입력 경로를 기준으로 자동 생성된다. 설명 계약은
[`ORCHESTRATION.md`](ORCHESTRATION.md), 결정 정본은
[`decisions/`](decisions/)를 따른다.

## 한눈에 보기

```mermaid
flowchart LR
    apps[배달앱 공개 화면] --> capture[Tracker 판독 입력]
    capture --> ledger[(log.jsonl 원장)]
    ledger --> export[(export.json)]
    export --> offers[API offer]
    brands[brands.yml] --> catalog[API brand]
    banners[banners.yml] --> banner[API banner]
    offers --> compare[API comparison]
    catalog --> compare
    compare --> brandApi[GET /api/brands]
    banner --> bannerApi[GET /api/banners]
    brandApi --> web[React Web]
    bannerApi --> web
    web -->|POST /api/events| analytics[API analytics]
    analytics --> events[(events.jsonl)]
```

## 배포 경계

```mermaid
flowchart TB
    repo[이 모노레포] --> dataWorkflow[deploy-data.yml]
    repo --> apiWorkflow[deploy-api.yml]
    repo --> vercel[Vercel Git 배포]
    dataWorkflow -->|export.json 교체 후 reload| oci[OCI, systemd, nginx]
    apiWorkflow -->|Gradle build 후 재시작| oci
    oci --> apiOrigin["API 오리진 bebeggars.duckdns.org"]
    vercel --> site["웹 beggars-five.vercel.app"]
    site --> apiOrigin
```

## 실행 단위

| 실행 단위 | 책임 | 자동 집계한 구조 입력 파일 수 |
|---|---|---:|
| `tracker/` | 판독 계약, 데이터 모델, 원장, 배포 스냅샷 | {counts['tracker']} |
| `api/` | 별칭 정규화, 만료 판정, 비교, 배너, 분석 | {counts['api']} |
| `web/` | 브랜드 비교 UI와 행동 이벤트 | {counts['web']} |

### Tracker

| 묶음 | 현재 경로 |
|---|---|
{tracker_rows(path_set)}

공개 모노레포에는 수집 실행 원본인 `capture/`, `tracker.py`, `dashboard.py`,
`config/`, `ref/`가 의도적으로 없다. 이 경계는
[`ADR-001`](decisions/ADR-001-monorepo-consolidation.md)에 고정돼 있다.

### API

패키지는 기술 계층이 아니라 도메인 책임으로 나뉜다.

| 패키지 | 책임 | Java 소스 수 |
|---|---|---:|
{api_rows}

HTTP 경계:

{markdown_list(endpoints)}

### Web

| 모듈 | 책임 |
|---|---|
{web_rows(path_set)}

`public/`은 런타임 자산이지만 대형 로고 목록은 구조 문서에서 제외한다.

## 갱신 방법

```bash
python3 scripts/generate_project_structure.py
python3 scripts/generate_project_structure.py --check
```

생성 시각과 환경별 절대 경로를 넣지 않으므로 같은 Git 상태에서는 같은 문서가
생긴다. CI의 `--check`는 구조에 영향을 주는 소스 변경 뒤 이 문서가 갱신되지
않았으면 실패한다.
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="현재 문서가 생성 결과와 같은지 확인한다.",
    )
    args = parser.parse_args()

    paths = tracked_files()
    try:
        document = render(source_files(paths), paths)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    if args.check:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != document:
            print(
                "docs/PROJECT-STRUCTURE.md가 현재 소스 구조와 다릅니다. "
                "python3 scripts/generate_project_structure.py를 실행하세요.",
                file=sys.stderr,
            )
            return 1
        print("프로젝트 구조 문서가 최신입니다.")
        return 0

    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
