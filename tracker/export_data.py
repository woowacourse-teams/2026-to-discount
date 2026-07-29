import json
from pathlib import Path

from store import read_records, latest_per_brand

# export.json 항목에 담을 필드: (원장 snake_case 키, export camelCase 키)
FIELDS = [
    ("platform", "platform"),
    ("brand", "brand"),
    ("amount", "amount"),
    ("qualifier", "qualifier"),
    ("needs_review", "needsReview"),
    ("offer_type", "offerType"),
    ("section", "section"),
    ("raw_text", "rawText"),
    ("captured_at", "capturedAt"),
    ("screenshot_path", "screenshotPath"),
    # 상세 조건. 아직 대부분 None이지만, 채워지는 대로 프론트 상세 패널에
    # 그대로 뜬다 — 스키마를 먼저 뚫어놔야 수집이 반영될 데가 생긴다.
    ("min_order_amount", "minOrderAmount"),
    ("tiers", "tiers"),
    ("conditions", "conditions"),
]

LOG_PATH = Path(__file__).parent / "data" / "log.jsonl"
EXPORT_PATH = Path(__file__).parent / "data" / "export.json"
BRANDS_PATH = Path(__file__).parent / "data" / "brands-sorted.txt"


def camel_tiers(tiers):
    """구간 할인도 export에선 camelCase — 원장은 snake_case를 유지한다."""
    if not tiers:
        return None
    return [{"minOrder": t["min_order"], "amount": t["amount"]} for t in tiers]


def build_export(records: list[dict]) -> list[dict]:
    latest = latest_per_brand(records)
    out = []
    for record in latest.values():
        item = {camel: record.get(snake) for snake, camel in FIELDS}
        item["tiers"] = camel_tiers(record.get("tiers"))
        out.append(item)
    return out


def sorted_brand_names(records: list[dict]) -> list[str]:
    return sorted({r["brand"] for r in records})


def main() -> int:
    records = read_records(LOG_PATH)
    EXPORT_PATH.write_text(
        json.dumps(build_export(records), ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    BRANDS_PATH.write_text(
        "\n".join(sorted_brand_names(records)) + "\n", encoding="utf-8",
    )
    print(f"export.json {len(build_export(records))}건, "
          f"brands-sorted.txt {len(sorted_brand_names(records))}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
