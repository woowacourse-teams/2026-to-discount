# Grafana Cloud 로그 저장 및 조회 구성

설정 PR: [beggars-ops #14](https://github.com/nn98/beggars-ops/pull/14)
문서 PR: [#73](https://github.com/woowacourse-teams/2026-to-discount/pull/73)

## 배경과 선택

운영 서버에만 있는 로그를 서버와 분리해 조회하고 전체 예외를 보존한다.
Grafana Cloud를 선택한 근거는 다음과 같다.

- 운영 서버가 내려가도 이미 전송한 로그 조회 가능
- 로그와 이후 성능 지표를 한 플랫폼에서 관리
- 무료 로그 월 50 GB 수집, 14일 보관

## 적용 구성

### 운영 환경

OCI 서울, Ubuntu 24.04 arm64. Alloy 1.20.1

### 수집 대상

API journal과 Nginx 접근 및 오류 로그

- API journal: API 프로그램이 출력한 로그를 Linux의 systemd가 저장한 기록
    - 구성 요소: 요청 처리 결과, 데이터 로딩, 예외 메시지와 전체 스택트레이스 등
    - 용도: API 내부에서 무슨 일이 있었는지 확인할 때 사용
- Nginx 접근 로그: Nginx가 받은 HTTP 요청의 기록
    - 구성 요소: 요청 시각, 메서드, 경로, 응답 상태 코드, 요청 ID 등
    - 용도: 어떤 요청에 어떤 응답을 보냈는지 확인할 때 사용
- Nginx 오류 로그: Nginx가 요청을 처리하면서 겪은 문제의 기록
    - 구성 요소: API 서버 연결 실패, 응답 대기 시간 초과 등
    - 용도: Nginx와 API 사이에서 무엇이 실패했는지 확인할 때 사용

### 작동 방식

- Alloy가 Grafana Cloud Loki로 전송하고 Explore에서 조회한다.
    - Alloy: 운영 서버에 설치한 로그 수집기. API와 Nginx 로그를 읽어 Grafana Cloud로 보낸다.
    - Loki: 전송한 로그를 저장하고 검색하는 서비스
    - Explore: Grafana 안의 로그 검색 화면입니다. 환경, 서비스, 시간 범위, 요청 ID 등을 지정해 Loki에 저장된 로그를 찾는다.
- 여러 줄 예외는 하나로 묶는다. 대기 3초, 최대 4096줄이며 요청 ID는 본문에 유지한다.
    - 다음 로그를 기다리는 시간은 최대 3초
    - 한 블록은 최대 4096줄
- 토큰은 서버의 접근 제한된 파일에만 저장한다.

### 파일 아카이브

- 기존 journal과 Nginx 원본은 유지한다. Nginx는 최근 14일에 대응하는 기록을 유지한다.
- 추가 API 원본은 API 서버에 날짜별 JSONL gzip으로 30일 보관한다. 매일 00:10 KST에 전날 원본을 저장한다.
    - 추가 원본 위치: `/var/log/todiscount/api-archive`

### 전송 실패 방어 로직

- 전송 실패 시 Alloy가 재시도한다.
- 전송 대기 로그를 디스크에 기록하는 WAL은 사용하지 않는다. 따라서 Alloy 강제 종료 시 일부 대기 로그가 유실될 수 있다.
- 설치, 조회 및 복구 절차는 beggars-ops의 `deploy/alloy/README.md`에서 관리한다.

## 검증 결과

- 실제 요청 ID로 API와 Nginx 로그가 Grafana에서 함께 조회됨
- 전체 예외 9줄의 원인 예외, Suppressed 및 코드 위치 보존 확인
- 테스트 파일 회전과 Alloy 재시작 후 수집 확인
- 압축 원본 해제 및 JSON 무결성 확인
