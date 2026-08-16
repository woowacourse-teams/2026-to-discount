import json
from pathlib import Path

REQUIRED_KEYS = {"target_address", "platforms"}
ALLOWED_CAPTURE_MODES = {"auto", "manual"}


def load_target_config(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"config not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        config = json.load(f)

    missing = REQUIRED_KEYS - config.keys()
    if missing:
        raise ValueError(f"target config missing keys: {sorted(missing)}")

    for platform, settings in config["platforms"].items():
        mode = settings.get("capture_mode")
        if mode not in ALLOWED_CAPTURE_MODES:
            raise ValueError(
                f"platform '{platform}' has invalid capture_mode: {mode!r}"
            )

    return config


def use_utf8_stdout() -> None:
    """윈도우 콘솔(cp949)에서 한글 안내 문구가 죽지 않게 한다.

    안내에 줄표(—)가 하나 섞였다는 이유로 스크립트가 UnicodeEncodeError로
    죽은 적이 있다. 하필 배포를 막아야 할 자리(check_deploy)와 미등록
    브랜드를 알려야 할 자리(check_brands)였다 — 알림이 죽으면 알림이 없는
    것과 같다. CLI 진입점에서 한 번 부른다.
    """
    import sys

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
