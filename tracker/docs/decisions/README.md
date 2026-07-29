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
