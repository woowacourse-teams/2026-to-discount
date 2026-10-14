# 개발 조회 API 부하 실험 및 병목 개선 계획

승인 설계: [api-load-test.md](../../design/api-load-test.md).
작업 브랜치: codex/api-load-test, 기준 dev ae66ad3.

- [x] 개발 전용 k6 시나리오와 요청별 전체 지연 및 실패 집계 추가
- [x] JAR 및 데이터 변경, 재시작, 최근 30초 실패와 지연, 메모리 중단 감시 추가
- [x] k6 timestamp 처리와 감시 조건의 회귀 테스트를 CI에 연결
- [x] k6 2.3.0 설치, 생성기와 개발 API 서버 분리
- [x] 2 RPS 30초 사전 점검 및 기준 API 전체 테스트와 빌드 성공
- [x] 2/10/30/60 RPS 탐색 및 30 RPS JFR 진단, 100 RPS 중단과 해석 한계 기록
- [ ] 반복 측정과 프로파일로 병목 1건 확인
- [x] 동일 데이터에서 개선 전 30 RPS 5분 3회 측정
- [x] 병목 개선과 정확성 회귀 테스트 구현
- [x] 전체 API 테스트 및 빌드, CI 구성 연결 및 로컬 검증 (GitHub CI 미실행)
- [x] PR #78에서 GitHub API CI 및 감시 테스트 12개 실제 통과
- [ ] 개발 후보에서 같은 조건으로 개선 후 3회 측정
- [ ] 원시 결과와 비교 보고서 작성, diff 검토

조건 변경 또는 100 RPS까지 병목 미관측이면 결과를 기록하고 추가 범위를 합의한다.
운영 부하와 운영 배포는 수행하지 않는다. PR 제출 및 병합은 별도 사용자 요청 단계다.

사용자 요청으로 개선 후 측정 보류. 진행 중인 후보 측정을 중단하고 임시 설정 원복 및 API HTTP 200 확인.
원시 결과는 api/load-tests/results/20261014에 보존. 재개 시 입력 해시를 확인하고 개선 후 3회 전체를 새로 측정한다.

생성기: 사용자의 macOS arm64 컴퓨터. 서버: 개발 전용 Linux arm64, 2 vCPU, 3.8GB.
JVM: Java 21, Xms256m, Xmx1536m, systemd MemoryMax=2560M.
서버 지표 수집: Alloy 15초. 실행기: Python 3.11, SSH 스냅샷 15초.
임시 원시 자료: /tmp/load-before-explore, 비교 결과는 별도 before/after 디렉터리로 보존한다.
