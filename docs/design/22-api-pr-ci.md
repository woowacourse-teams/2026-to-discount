# Design: API PR CI

## 1. 문제

### 배경

Web은 `.github/workflows/check-web.yml`에서 PR과 `main` push마다 테스트와
빌드를 검증한다. 반면 API는 `.github/workflows/deploy-api.yml`의 수동 배포
과정에서만 `./gradlew build`를 실행한다. 이 워크플로는 운영 서버에 연결된
self-hosted runner를 사용하므로 검토 전 PR 코드를 실행하는 용도로 쓸 수 없다.

### 해결하려는 문제

API 코드의 컴파일 오류와 테스트 실패를 병합 전에 자동으로 발견한다. 검증은
배포 권한이 없는 GitHub-hosted runner에서 실행하고, API 또는 검증 워크플로가
바뀔 때만 동작하게 한다.

## 2. 목표

- API 변경 PR에서 테스트와 빌드를 자동 검증한다.
- Web PR CI와 같은 트리거, 최소 권한, GitHub-hosted runner 패턴을 사용한다.
- 테스트 실패와 패키징 실패를 GitHub Actions 화면에서 구분할 수 있게 한다.
- Gradle 의존성 캐시로 반복 실행 비용을 줄인다.

## 3. Non-goals

이번 작업에서 하지 않는 것:

- API 배포와 운영 서버 재시작
- self-hosted runner에서 PR 코드 실행
- 기존 `deploy-api.yml` 변경
- 코드 품질 도구, 커버리지 기준, 정적 분석 도입
- API 애플리케이션 코드와 테스트 변경

## 4. 요구사항

### 필수

- `.github/workflows/check-api.yml`을 추가한다.
- `api/**` 또는 워크플로 자체가 변경된 PR에서 실행한다.
- Web CI와 같이 `main` push에서도 같은 경로 조건으로 실행한다.
- `ubuntu-latest`와 `contents: read` 권한을 사용한다.
- 체크아웃 자격 증명을 저장하지 않는다.
- Java 17과 Gradle 의존성 캐시를 설정한다.
- 저장소의 Gradle Wrapper로 전체 테스트와 빌드를 검증한다.

### 선택

- 없음

## 5. 제약사항

- 기술적 제약: API의 Java toolchain은 17이고 Gradle Wrapper는 9.5.1이다.
- 일정 제약: 없음
- 기존 시스템 제약: `deploy-api.yml`의 self-hosted runner는 배포 권한이 있으므로
  PR 트리거와 연결하지 않는다.
- 기타: GitHub Actions는 저장소 루트의 `.github/workflows/`만 읽는다.

## 6. 성공 조건

- [ ] `api/**`가 변경된 PR에서 API CI가 실행된다.
- [ ] API와 무관한 파일만 변경된 PR에서는 API CI가 실행되지 않는다.
- [ ] `.github/workflows/check-api.yml` 변경 시 API CI가 실행된다.
- [ ] 정상 코드에서 테스트와 빌드 단계가 모두 통과한다.
- [ ] 테스트 실패 또는 빌드 실패가 해당 단계의 CI 실패로 이어진다.
- [ ] PR 검증에 self-hosted runner와 배포 권한을 사용하지 않는다.
- [ ] `main` push에서도 PR과 같은 경로 조건으로 회귀를 확인한다.

## 7. 고려한 접근 방식

### A. `./gradlew build` 한 단계

설명: Gradle `build`가 테스트를 포함하므로 한 명령으로 전체를 검증한다.

장점:

- 설정이 가장 짧다.
- 테스트를 중복 실행하지 않는다.

단점:

- Actions 화면에서 테스트 실패와 패키징 실패를 구분하기 어렵다.
- Web CI의 테스트와 빌드 단계 분리 방식과 다르다.

### B. 테스트와 빌드를 분리하고 테스트 중복 제외

설명: `./gradlew test`를 먼저 실행하고 `./gradlew build -x test`로 패키징을
검증한다.

장점:

- 테스트 실패와 패키징 실패가 별도 단계로 표시된다.
- 테스트를 두 번 실행하지 않는다.
- Web CI의 단계 구성을 따른다.

단점:

- 두 번째 명령만 보면 테스트를 생략하는 것으로 오해할 수 있어 단계 이름이나
  주석으로 의도를 설명해야 한다.

### C. `./gradlew test build` 한 단계

설명: 두 작업을 한 Gradle 실행에 전달해 Gradle 작업 그래프가 중복 실행을
제거하게 한다.

장점:

- 테스트와 빌드를 모두 명시하면서 Gradle 실행은 한 번이다.
- 테스트를 중복 실행하지 않는다.

단점:

- Actions 화면에서는 하나의 단계로만 보여 실패 지점을 바로 구분하기 어렵다.

## 8. 선택

선택한 방법: B. 테스트와 빌드를 분리하고 테스트 중복 제외

선택 이유: Web CI와 같은 단계 구조를 유지하면서 테스트와 패키징 실패를
구분할 수 있다. 선행 테스트가 통과한 뒤 `build -x test`를 실행하므로 검증을
줄이지 않으면서 중복 테스트 비용만 제거한다.

## 9. 설계

### Architecture

```text
API 또는 check-api.yml 변경
          |
          v
GitHub-hosted ubuntu-latest
          |
          +-- 저장소 읽기 전용 체크아웃
          +-- Temurin Java 17 및 Gradle 캐시 설정
          +-- api/에서 ./gradlew test
          +-- api/에서 ./gradlew build -x test
```

### Components

#### `.github/workflows/check-api.yml`

- 책임: API 변경의 테스트와 빌드 검증
- 의존성: GitHub-hosted runner, `actions/checkout`, `actions/setup-java`,
  `api/gradlew`
- 외부 인터페이스: GitHub PR 및 `main` push 체크 결과

### Data Flow

1. GitHub가 PR 또는 `main` push의 변경 경로를 확인한다.
2. `api/**` 또는 `.github/workflows/check-api.yml` 변경이면 워크플로를 시작한다.
3. 읽기 전용 권한으로 저장소를 체크아웃한다.
4. Temurin Java 17과 Gradle 캐시를 준비한다.
5. `api/`에서 전체 테스트를 실행한다.
6. 테스트 성공 후 테스트를 제외한 `build` 작업으로 컴파일과 패키징을 검증한다.
7. 어느 단계든 실패하면 GitHub 체크를 실패로 종료한다.

### Error Handling

- 의존성 내려받기 실패 -> 해당 setup 또는 Gradle 단계 실패로 종료한다.
- 테스트 실패 -> 테스트 단계에서 종료하고 빌드는 실행하지 않는다.
- 컴파일 또는 패키징 실패 -> 빌드 단계 실패로 종료한다.
- 경로 조건 불일치 -> 워크플로를 실행하지 않는다.

## 10. 테스트 전략

- Unit: 기존 API 테스트 전체를 `./gradlew test`로 실행한다.
- Integration: `./gradlew build -x test`로 컴파일과 실행 가능한 JAR 패키징을
  검증한다.
- Acceptance: API 변경 PR과 워크플로 변경 PR에서 체크가 실행되는지 확인한다.
- 기타: API와 무관한 변경에서 경로 필터로 실행되지 않는지 확인한다.

## 11. 미해결 사항

- 없음

## Implementation Plan

### 변경 대상

#### Create

- `.github/workflows/check-api.yml`: API PR 및 `main` push 테스트와 빌드 검증

#### Modify

- `docs/design/22-api-pr-ci.md`: 구현 중 확인된 결정이나 검증 결과가 설계와
  달라질 때 갱신

### Tasks

#### 1. API 검증 워크플로 작성

- 변경: Web CI와 동일한 트리거, 경로 필터, 최소 권한, GitHub-hosted runner를
  설정하고 Java 17 및 Gradle 캐시 준비 단계를 추가한다.
- 테스트: 워크플로 YAML을 파싱하고 저장된 트리거와 권한을 확인한다.
- 완료 조건: API와 워크플로 변경에만 반응하는 읽기 전용 워크플로가 정의된다.

#### 2. 테스트와 빌드 단계 구성

- 변경: `api/`를 기본 작업 디렉터리로 설정하고 `./gradlew test`,
  `./gradlew build -x test`를 순서대로 실행한다.
- 테스트: 로컬에서 두 명령을 같은 순서로 실행한다.
- 완료 조건: 전체 테스트와 테스트를 중복하지 않는 빌드가 모두 통과한다.

#### 3. 변경 사항과 수용 조건 검증

- 변경: 필요하면 실제 구현과 달라진 설계 또는 검증 결과를 이 문서에 반영한다.
- 테스트: `git diff`, YAML 파싱, Gradle 테스트와 빌드 결과를 확인한다.
- 완료 조건: 의도하지 않은 변경이 없고 #22의 완료 조건을 모두 만족한다.

### Scope Check

- [x] 각 Task가 현재 이슈의 목표를 직접 달성하기 위해 필요한가?
- [x] 서로 독립적으로 완료 가능한 작업이 포함되어 있지 않은가?
- [x] 하나의 PR에서 리뷰 가능한 범위인가?
- [x] 하나의 명확한 완료 조건으로 설명할 수 있는가?

별도 서브 이슈로 분리할 작업은 없다.

### 검증

- YAML 파서로 `.github/workflows/check-api.yml` 문법 확인
- `cd api && ./gradlew test`
- `cd api && ./gradlew build -x test`
- `git diff --check`
- `git diff`
