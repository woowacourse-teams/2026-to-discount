"""생성기의 fail-fast 가드가 실제로 멈추는지 검사한다.

생성기의 값은 "모르는 것을 만나면 멈춘다"에 있다. 가드가 조용히 죽으면
문서는 틀린 채로 CI를 통과하고, 그때는 아무도 모른다 — ADR-001이 기록한
사고가 정확히 그 모양이었다. 그래서 각 가드마다 raise하는 경로를 하나씩
남긴다.

    python -m pytest scripts/test_generate_project_structure.py
"""
from pathlib import PurePosixPath

import pytest

import generate_project_structure as gen


BASE = [
    ".github/workflows/deploy-api.yml",
    ".github/workflows/deploy-data.yml",
    "tracker/schema.py",
    "api/build.gradle",
    "web/package.json",
]


def paths(*extra: str) -> list[PurePosixPath]:
    return sorted(PurePosixPath(p) for p in [*BASE, *extra])


def test_new_top_level_unit_stops():
    """분류 안 된 실행 단위가 생기면 멈춘다 — 안 멈추면 문서가 계속 "3층"이라고 말한다."""
    everything = paths("mobile/src/Main.kt")
    with pytest.raises(ValueError, match="mobile"):
        gen.render(gen.source_files(everything), everything)


def test_unknown_deploy_workflow_stops():
    """배포 경계 그림은 손으로 그린 것이라, 그림이 낡았을 조건을 대신 검증한다."""
    everything = paths(".github/workflows/deploy-web.yml")
    with pytest.raises(ValueError, match="deploy-web.yml"):
        gen.render(gen.source_files(everything), everything)


def test_missing_deploy_workflow_stops():
    everything = sorted(
        p for p in paths() if p.name != "deploy-data.yml"
    )
    with pytest.raises(ValueError, match="deploy-data.yml"):
        gen.render(gen.source_files(everything), everything)


CONTROLLER = 'api/src/main/java/com/discounttracker/web/SampleController.java'


def write_controller(tmp_path, body: str) -> list[PurePosixPath]:
    target = tmp_path / CONTROLLER
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")
    return [PurePosixPath(CONTROLLER)]


def test_endpoint_regex_miss_stops(tmp_path, monkeypatch):
    """정규식이 못 읽는 형태가 들어오면 조용히 빠뜨리지 않고 멈춘다."""
    monkeypatch.setattr(gen, "ROOT", tmp_path)
    files = write_controller(
        tmp_path,
        '@RestController\n'
        '@GetMapping("/api/ok")\n'
        '@PostMapping(value = "/api/missed", produces = "application/json")\n',
    )
    with pytest.raises(ValueError, match="2개만|1개만"):
        gen.api_endpoints(files)


def test_endpoint_extraction_uses_class_base(tmp_path, monkeypatch):
    monkeypatch.setattr(gen, "ROOT", tmp_path)
    files = write_controller(
        tmp_path,
        '@RequestMapping("/api")\n@GetMapping("/brands")\n@PostMapping("/events")\n',
    )
    assert gen.api_endpoints(files) == ["GET /api/brands", "POST /api/events"]


def test_signature_is_order_independent():
    """`--check`는 같은 커밋에서 같은 바이트가 나와야 성립한다."""
    forward = paths("api/src/main/java/com/discounttracker/offer/Offer.java")
    assert gen.structure_signature(sorted(forward)) == gen.structure_signature(
        sorted(reversed(forward))
    )


def test_signature_catches_swap():
    """집계 숫자만 있으면 파일 하나 지우고 하나 더할 때 문서가 안 바뀐다."""
    before = gen.structure_signature(paths("tracker/a.py"))
    after = gen.structure_signature(paths("tracker/b.py"))
    assert before != after
