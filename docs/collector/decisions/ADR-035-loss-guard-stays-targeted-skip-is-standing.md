<!-- 원본: tracker docs/decisions/ADR-035-loss-guard-stays-targeted-skip-is-standing.md — 여기서 고치지 않는다 -->
# ADR-035. 배포 소실 가드는 그대로 두고, 타겟은 상시 건너뛰기 목록에 박는다

- 날짜: 2026-11-01
- 상태: 확정 (사용자 지시 2026-10-30, 11-01)
- 관련: [ADR-030](ADR-030-exclusion-is-a-judgement-not-an-observation.md), [ADR-034](ADR-034-hold-is-a-human-judgement-with-guards.md), `docs/setup/COLLECTION-INCIDENTS.md` "2026-10-30 ~ 11-01 배포 소실 가드가 사흘 연속 올리기를 막았다"

## 맥락

10-30부터 11-01까지 운영 배포가 `서버에 있는 상세가 사라진다`로 사흘 막혔다. 원인은 둘이다. 하나는 쿠폰이 살아 있는데 구간(`tiers`)이 별칭 행의 병합 순서 때문에
빠진 거짓 소실(BBQ), 다른 하나는 구간을 이루던 쿠폰함 쿠폰이 종료일을 넘겨 수집에서 빠진 참 소실(bhc)이다. 가드는 둘을 가르지 못하고 같이 막았다.
같은 기간 쿠팡이츠 허브의 와우 타겟 값(BBQ 8,000원 등)이 원장에 들어갔고, 10-30에 하루짜리로 건 건너뛰기가 만료됐다.

## 결정

1. **소실 가드(`check_deploy.staleness`)는 그대로 둔다. 약하게 하지 않는다.** 이 사흘 동안 가드는 거짓 소실로 병합 순서 문제를, 참 소실로 구간 종료를 사람 눈에 한 번씩 걸었다.
   거짓과 참을 가르는 근거는 export 안에 없다. 넘기는 길은 `--accept-loss <브랜드>` 하나이고 사람이 브랜드를 지정한다. 전체 끄기 스위치는 두지 않는다.
   승인하기 전에 정보가 사라지는지 위치가 바뀐 것인지 먼저 본다(AGENTS.md).
2. **타겟은 상시 건너뛰기 목록에 박는다.** `data/targeted_skip.json`(앱 -> 브랜드 -> since, note, last_seen). `reflect_daily.py`가 목록의 (앱, 브랜드) 새 행을
   **출처와 무관하게** 원장에 안 넣는다. 수집기가 허브에서 "받기"를 눌러 타겟 쿠폰이 쿠폰함으로 들어오므로 허브 행만 막으면 쿠폰함 행으로 샌다(11-01 내보내기에서 확인).
3. **목록에서 빼는 것은 사람이 한다.** 사용자가 해소됐다고 말하면 `python scripts/targeted_skip.py remove 앱 브랜드`. 자동으로 빼지 않는다.
   허브를 덜 읽은 날(11-01 00:01, 36곳)의 "안 보임"을 해소로 오판하면 타겟 값이 원장에 들어오기 때문이다. 대신 보고서와 로그에 마지막으로 보인 날을 띄우고
   3일째 안 보이면 "해소됐으면 뺀다"를 알린다(`UNSEEN_NOTICE_DAYS`).
4. **쿠팡이츠 허브 카드 급감 가드는 직전 수집 대비 80%를 유지한다.** 같은 요일이나 이동 평균 같은 조건을 더하지 않는다. 월말과 주말에서 다음 날로 넘어갈 때
   허브가 급변하는 것은 정상일 수 있어 케이스가 갈리지만, 조건이 늘수록 예외가 늘고 설명하기 어려워진다(사용자 2026-11-01). 오탐이면 다음 수집이 다시 읽고 사람이 본다.
   (11-01 00:01은 36곳이라 실패, 08:30은 52곳으로 회복했다.)

## 쓰는 법

    python scripts/targeted_skip.py list
    python scripts/targeted_skip.py add coupangeats BBQ 맥도날드 --note "허브 와우 타겟"
    python scripts/targeted_skip.py remove coupangeats BBQ        # 사용자가 해소됐다고 말했을 때만
    python scripts/exclude_offer.py coupangeats BBQ --reason targeted --apply   # 이미 들어간 행을 빼는 길(ADR-030)

일시 계류는 `data/reflect_hold.json`(그날만, `hold=false`면 건너뛰기만 남김)이다. 상시 목록과 겹치지 않는다.

## 하지 않은 것

- 가드의 거짓 소실을 자동으로 넘기는 것. 거짓/참을 가르는 근거가 export에 없고, 이 사흘의 참 소실(bhc)이 같은 줄로 나왔다.
- 타겟을 `capture.coupangeats_couponbox.TARGETED_BRANDS`(수집기 쪽 영구 목록)에 넣는 것. 쿠폰함 빌더도 같은 브랜드를 "타겟딜"로 제외해 범위가 넓어진다.
- 제외(`excluded`)로 처리하는 것. 승자가 제외 행이면 (앱, 브랜드)가 통째로 빠져 비타겟 오퍼까지 사라진다.
