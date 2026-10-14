# Grafana Cloud 로그 저장 및 조회 구성

이슈: [#72](https://github.com/woowacourse-teams/2026-to-discount/issues/72)
설정 PR: [beggars-ops #14](https://github.com/nn98/beggars-ops/pull/14)
문서 PR: [#73](https://github.com/woowacourse-teams/2026-to-discount/pull/73)

상태: 운영 설치 및 기능 검증 완료. PR 리뷰와 노출된 토큰 교체 후 전송 재확인 대기.

## 배경과 선택

운영 서버에만 있는 로그를 서버와 분리해 조회하고 전체 예외를 보존한다.
Grafana Cloud를 선택한 근거는 다음과 같다.

- 운영 서버가 내려가도 이미 전송한 로그 조회 가능
- 로그와 이후 성능 지표를 한 플랫폼에서 관리
- 무료 로그 월 50 GB 수집, 14일 보관
- 별도 로그 저장 서버 운영 불필요

## 적용 구성

- 운영 환경: OCI 서울, Ubuntu 24.04 arm64. Alloy 1.20.1 사용.
- 수집 대상: API journal과 Nginx 접근 및 오류 로그.
- Alloy가 Grafana Cloud Loki로 전송하고 Explore에서 환경, 서비스, 요청 ID로 조회한다.
- 여러 줄 예외는 하나로 묶는다. 대기 3초, 최대 4096줄이며 요청 ID는 본문에 유지한다.
- 토큰은 서버의 접근 제한된 파일에 저장하고 저장소에는 포함하지 않는다.
- 기존 journal과 Nginx 원본은 유지한다. Nginx는 기존 일별 회전과 14개 보관을 유지한다.
- 추가 API 원본은 날짜별 JSONL gzip으로 30일 보관한다. 매일 00:10 KST에 전날 원본을 저장한다.
- 추가 원본 위치: `/var/log/todiscount/api-archive`. 운영 서버 내부 보관이며 외부 장기 백업은 아니다.
- 전송 재시도는 구성됐지만 디스크 WAL은 비활성 상태다. 강제 종료 시 전송 대기 로그의 무손실을 보장하지 않는다.

설치, 조회 및 복구 절차는 beggars-ops의 `deploy/alloy/README.md`에서 관리한다.

## 검증 결과

- 운영 도구 테스트 267개, Alloy 설정 및 systemd unit 검증 통과
- 실제 요청 ID로 API와 Nginx 로그가 Grafana에서 함께 조회됨
- 전체 예외 9줄의 원인 예외, Suppressed 및 코드 위치 보존 확인
- 테스트 파일 회전과 Alloy 재시작 후 수집 확인
- 압축 원본 해제 및 JSON 무결성 확인
- 기존 API, 30초 감시 및 5분 수집 유지

## 남은 작업

- 노출된 토큰 교체 및 전송 재확인
- #71: `/ops` 오류 상세 조회를 Loki 조회 API에 연결
- 성능 지표 수집과 Grafana 그래프 구성
- 팀원 조회 권한 설정
