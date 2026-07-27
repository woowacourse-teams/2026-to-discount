import json
from pathlib import Path

from schema import validate_record


def append_record(record: dict, log_path: Path) -> dict:
    normalized = validate_record(record)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(normalized, ensure_ascii=False) + "\n")
    return normalized


def read_records(log_path: Path) -> list[dict]:
    if not log_path.exists():
        return []
    records = []
    with open(log_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def latest_per_brand(records: list[dict]) -> dict:
    latest: dict = {}
    for record in records:
        key = (record["platform"], record["brand"])
        current = latest.get(key)
        if current is None or record["captured_at"] > current["captured_at"]:
            latest[key] = record
    return latest
