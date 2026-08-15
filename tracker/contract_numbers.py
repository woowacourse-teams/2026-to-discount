"""`docs/ORCHESTRATION-CONTRACT.md` §5·§6이 인용하는 수치를 다시 뽑는다.

문서에 박힌 수치는 데이터가 늘면 조용히 낡는다 — "137건 기준"이 그대로
남아 실제가 170건이던 적이 있다. 문서를 고칠 때마다 세는 대신 이걸 돌린다.

    python contract_numbers.py
"""
import collections
import json
from pathlib import Path

BASE = Path(__file__).parent


def main() -> None:
    records = [json.loads(l) for l in (BASE / "data" / "log.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    offers = json.loads((BASE / "data" / "export.json").read_text(encoding="utf-8"))

    import store
    winners = store.latest_per_brand(records)

    total, dated = collections.Counter(), collections.Counter()
    for offer in offers:
        total[offer["platform"]] += 1
        if offer.get("expiresAt"):
            dated[offer["platform"]] += 1

    print(f"원장 {len(records)}행 / export {len(offers)}건")
    print(f"종료일 없는 오퍼 {sum(total.values()) - sum(dated.values())}건 (수집 단위 판정이 맡는 몫)")
    for platform in sorted(total):
        print(f"  {platform}: 만료일 {dated[platform]}/{total[platform]} = {round(100 * dated[platform] / total[platform])}%")

    print(
        f"needs_review: 원장 {sum(1 for r in records if r.get('needs_review'))}건, "
        f"대표 {sum(1 for r in winners.values() if r.get('needs_review'))}건, "
        f"export {sum(1 for o in offers if o.get('needsReview'))}건"
    )


if __name__ == "__main__":
    main()
