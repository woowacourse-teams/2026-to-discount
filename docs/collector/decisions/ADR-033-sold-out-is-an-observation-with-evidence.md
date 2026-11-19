<!-- 원본: tracker docs/decisions/ADR-033-sold-out-is-an-observation-with-evidence.md — 여기서 고치지 않는다 -->
# ADR-033. 선착순 소진은 판단이 아니라 근거 있는 관측이다

- 날짜: 2026-10-22
- 상태: 확정 (이슈 #31 설계 승인)
- 관련: [ADR-030](ADR-030-exclusion-is-a-judgement-not-an-observation.md), `docs/specs/issue-31-first-come-soldout-correction.md`

## 맥락

배민 노랑통닭 선착순 6,000원이 소진됐는데 원장에 남길 길이 없어 사람이 콘솔에서 `limited`로 뺐다.
빼면 API가 "선착순이 소진이면 상시"를 세우지 못하고 상시 3,000원 구간까지 같이 사라진다. 정정
경로(`exclude_offer`, 콘솔 inbox)는 선착순 자리를 짚지도 못했다.

## 결정

1. 소진은 `excluded` 사유가 아니다. `sold_out: true` 관측 행이고, 근거 `sold_out_evidence`
   (`by: human|bot`, `kind`, `at`, `screen`, `note`)를 단다. 기계 행은 마감 화면(`screen`)이, 사람 행
   (`capture_mode: manual`)은 글이나 화면이 있어야 스키마를 통과한다.
2. 소진 행은 같은 날, 같은 쿠폰의 자동 관측 중 마감을 실제로 읽지 않은 것(`sold_out_observed` 없음)을
   이긴다(`store._sold_out_holds`). 마감을 읽은 화면의 "열림", 사람의 소진 취소, 다음 날 관측은 이긴다.
   다음 날 주기 수집이 다시 올린다.
3. 정정은 자리를 짚는다: `exclude_offer.py --slot first_come --sold-out|--clear-sold-out`, inbox `slot`,
   `action: sold_out|clear_sold_out`. 소진은 선착순 자리에만 건다.

## 하지 않은 것

- `EXCLUSION_REASONS`에 `sold_out`을 넣는 것(테스트가 막는다).
- 새 칸을 `export.json`에 싣는 것. 공개 계약은 `soldOut` 그대로다.
