<!-- 원본: tracker docs/decisions/ADR-034-hold-is-a-human-judgement-with-guards.md — 여기서 고치지 않는다 -->
# ADR-034. 유지는 사람이 붙드는 판단이고, 새어 나가지 않게 가드를 둔다

- 날짜: 2026-10-29
- 상태: 확정 (사용자 지시 2026-10-28, 10-29)
- 관련: [ADR-030](ADR-030-exclusion-is-a-judgement-not-an-observation.md), [ADR-033](ADR-033-sold-out-is-an-observation-with-evidence.md), `tests/test_hold_offer.py`

## 맥락

2026-10-28 훌랄라참숯바베큐치킨 배민클럽 12,100원(쿠폰함 보유쿠폰, 종료 10-31)을 사용자가 써서 쿠폰함에서 빠지자,
다음 쿠폰함 수집의 4,000원이 "같은 자리 정정"으로 이겨 오퍼가 내려갔다. 쿠폰은 써도 오퍼는 앱에 남아 있다.
사람이 앱에서 직접 확인한 사실을 새 수집이 밀어내지 못하게 붙들 길이 없었다. 직접 고치는 길(콘솔 inbox,
`exclude_offer.py`)이 있는 이상, 붙드는 행이 영원히 남거나 유령 오퍼가 되지 않게 막는 가드가 같이 있어야 한다.

## 결정

1. 유지는 `held` 필드를 단 **manual 행**이다(제외 `excluded`의 짝). 기계 행에는 못 단다(`schema.validate_record`).
2. 이후의 **자동** 관측이 더 크지 않으면 유지 행이 이긴다(`store._hold_holds`). 더 큰 금액은 새 쿠폰이라 그쪽이 서고,
   사람이 다시 넣은 manual 행도 이긴다(풀기). `excluded`가 `held`보다 먼저다.
3. **가드(스키마가 막는다. CLI와 콘솔 inbox 모두 같은 `validate_record`를 지난다):**
   - 끝나는 날 필수: 오퍼의 `expires_at`이나 `held.until`. 둘 중 빠른 날 뒤의 관측은 유지를 못 이긴다.
   - 유지를 단 날부터 최대 14일(`HOLD_MAX_DAYS`).
   - `excluded`와 한 행에 못 둔다. `amount`가 있어야 한다.
   - `held.first_seen_at`은 ISO 시각, `held.until`은 YYYY-MM-DD.
   - `exclude_offer.py --hold`는 이미 끝난 쿠폰을 거부한다.
4. 신규(NEW) 표시를 지킨다: `--first-seen`에 마지막 내보내기의 `firstSeenAt`을 준다(`git log -p data/export.json`).
   원장에서 같은 금액의 가장 이른 행을 찾으면 안 된다. 월말마다 같은 금액 쿠폰이 반복돼 옛 행이 걸린다.
5. **보이게 한다:** `export_data.py`가 내보낼 때마다 `[유지] 앱 브랜드 금액 ~종료일(누가): 사유`를 찍고, 종료 2일 이내면
   "종료 임박"을 붙인다.

## 쓰는 법

    python scripts/exclude_offer.py baemin 훌랄라참숯바베큐치킨 --hold --amount 12100 --first-seen 2026-10-24T09:26:47+09:00 \
        --note "쿠폰 사용, 오퍼는 유지" --apply
    python scripts/exclude_offer.py baemin 훌랄라참숯바베큐치킨 --revive --apply      # 풀기(제외와 유지 둘 다)

## 하지 않은 것

- `held`를 기계 행에 허용하는 것. 앱에서 사라진 오퍼를 수집기가 스스로 붙들면 "봤다"를 추측하게 된다.
- 종료일 없는 유지, 14일 넘는 유지. 앱에서 내려간 오퍼가 화면에 남는다.
- 유지 오퍼를 일별 기록에서 빼는 것. `isNew`는 어제 일별 기록의 최고 금액과 견주는데(`OfferHistory.novelty`), 일별 기록은
  그날 **관측**의 최대값이라 유지 행(판단)이 빠지면 어제 값이 낮아 유지 오퍼가 매일 신규로 뜬다(2026-10-29 훌랄라 12,100원,
  하루 지나도 안 풀렸다). 그래서 `daily_state.classify(held=)`가 유지 오퍼를 유지 금액으로 적는다. 유지 전에 이미 쌓인 날은
  `data/daily/<날짜>.json`의 그 쌍 `max`를 고치고 `build_history`로 `history.json`을 다시 만든 뒤 배포한다.
