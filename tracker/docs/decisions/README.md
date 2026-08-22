# 의사결정기록 (ADR)

각 문서는 되돌리기 어려운 판단 하나와 그 근거를 기록한다.
나중에 판단을 뒤집을 때, **무엇이 달라졌기 때문에 뒤집는지**를 명확히 하기 위한 문서다.

| ID | 제목 | 상태 |
|---|---|---|
| [ADR-001](ADR-001-python-adb-cli.md) | 구현 언어는 Python, ADB는 CLI 호출 | 확정 |
| [ADR-002](ADR-002-android-sdk-emulator.md) | 에뮬레이터는 Android SDK, BlueStacks 아님 | [ADR-009](ADR-009-real-device-over-emulator.md)로 대체 |
| [ADR-003](ADR-003-vision-over-selectors.md) | 판독은 비전, 선택자 기반 레시피 폐기 | 확정 |
| [ADR-004](ADR-004-preserve-qualifier.md) | 금액 수식어를 분리 보존, 단일 숫자 정규화 금지 | 확정 |
| [ADR-005](ADR-005-main-page-only.md) | 1차 범위는 메인 할인 페이지까지 | 확정 |
| [ADR-006](ADR-006-section-as-data.md) | 섹션명은 설정이 아니라 캡처 데이터 | 확정 |
| [ADR-007](ADR-007-unified-app-pipeline.md) | 요기요도 웹 분리 없이 앱 파이프라인으로 통합 | 확정 |
| [ADR-008](ADR-008-manual-fallback-parity.md) | 수동 캡처를 자동과 동일 산출물로 정의 | 확정 |
| [ADR-009](ADR-009-real-device-over-emulator.md) | 캡처 대상 기기는 에뮬레이터가 아니라 실기 | 확정 |
| [ADR-010](ADR-010-reject-internal-api.md) | 앱 내부 API를 쓰지 않고 화면 캡처를 유지 | 확정 |
| [ADR-011](ADR-011-deeplink-entry-over-tap-path.md) | 화면 진입은 딥링크로, 없으면 수동 캡처 | 확정 |
| [ADR-012](ADR-012-three-repo-split-and-deployment.md) | tracker/api/web 3레포 분리, 배포 토폴로지 | 확정 |
| [ADR-013](ADR-013-manual-capture-scope-freeze.md) | 자동 스크롤 캡처는 배민에서 멈추고 나머지는 수동+비전 | 확정 |
| [ADR-014](ADR-014-coupangeats-record-guaranteed-floor.md) | 쿠팡이츠는 헤드라인이 아니라 보장 바닥값을 기록 | 확정 |
| [ADR-015](ADR-015-open-access-only-and-disclosure.md) | 공개·정당한 경로로만 수집, 서비스 성격을 화면에 고지 | 확정 |
| [ADR-016](ADR-016-confirmed-beats-recency-on-dedup.md) | 중복 정리는 확정을 최신보다 우선, 상세는 병합 | 확정 |
| [ADR-017](ADR-017-ddangyo-subtract-first-order-coupon.md) | 땡겨요 `최대 N원`은 첫주문 쿠폰 5,000원을 빼고 기록 | 확정 |
| [ADR-018](ADR-018-original-repo-is-the-working-copy.md) | 개발은 이 저장소에서만, 모노레포엔 정해진 파일만 옮긴다 | 확정 |
| [ADR-019](ADR-019-cumulative-tiers-and-domain-judged-amount.md) | 겹쳐 쓰는 쿠폰은 `tier_mode`, 정률 상한액은 `cap`으로 분리 | 확정 |
| [ADR-020](ADR-020-sweep-is-recorded-not-inferred.md) | 전수 수집은 `sweeps.jsonl`에 기록 — 건수로 추정하지 않는다 | 확정 |
| [ADR-021](ADR-021-mark-unverifiable-evidence.md) | 검증 불가 증거는 원장 행에 `evidence_status`로 표시 | 확정 |
| [ADR-022](ADR-022-no-ledger-only-incident-gate.md) | 사고일 검문을 원장-단독 규칙으로 확장하지 않는다 | 확정 |
| [ADR-023](ADR-023-estimate-expiry-as-next-monday.md) | 종료일 없는 앱은 수집일 다음 월요일로 추정, 원장엔 안 적는다 | 확정 |
| [ADR-024](ADR-024-intentional-detail-removal-bypasses-the-guard-by-hand.md) | 의도한 상세 삭제는 서버를 먼저 맞춰 손으로 통과시킨다 | 확정 |
