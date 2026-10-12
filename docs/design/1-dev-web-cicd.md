# Design: 개발 웹 검증 및 자동 배포

## 1. 문제

이슈 #53. 개발 Vercel 프로젝트는 dev를 추적하지만 최초 배포는 main이고 API 주소는 운영으로 고정되어 있다. 기존 main 검증과 미러 배포는 독립적으로 실행된다.

## 2. 목표

개발 웹 변경을 테스트하고 빌드한 뒤 개발 API에 연결된 산출물만 개발 주소에 배포한다.

## 3. Non-goals

운영 미러 배포 변경, 개발 웹 로그인, PostHog 정책 변경, 다른 main 기능의 dev 동기화는 제외한다.

## 4. 요구사항

브라우저, 초기 배너 요청, SSR, 사전 렌더링은 동일한 API origin을 사용한다. 개발 설정 누락이나 운영 주소 지정은 빌드 오류로 처리한다. 개발 API 장애 시 운영 데이터로 대체하지 않는다.

## 5. 제약사항

운영은 환경변수가 없어도 기존 API 주소로 동작한다. 개발은 VITE_APP_ENV=development와 명시적인 개발 API 주소가 필요하다. Vercel 배포 토큰은 development 환경의 GitHub 시크릿으로 관리한다.

## 6. 성공 조건

- 테스트와 빌드 실패 시 현재 개발 도메인을 유지한다.
- 신규 배포의 SSR과 개발 API CORS 검사를 통과한 최신 dev 커밋만 승격한다.
- 운영 API 연결과 main 미러 배포는 유지한다.

## 7. 고려한 접근 방식

A. Vercel Git 자동 배포 유지: 설정은 간단하지만 Actions 검증 완료 전에 배포될 수 있다.

B. Actions 검증 후 Vercel prebuilt 배포: 검증 순서를 보장하지만 배포 토큰과 별도 워크플로가 필요하다.

## 8. 선택

B를 사용자 승인(2026-10-12)에 따라 선택한다. dev Git 자동 배포는 vercel.json에서 비활성화하고 최초 적용 전에 개발 프로젝트의 자동 배포도 중지한다.

## 9. 설계

GitHub hosted runner가 웹 테스트, Vercel Production 설정 가져오기, prebuilt 빌드, 주소 검사, 도메인 미할당 배포를 수행한다. SSR 및 CORS 확인 후 최신 dev SHA인지 검사하고 승격한다. 이전 커밋이면 도메인을 옮기지 않는다.

API 개발 출처는 DISCOUNT_CORS_DEVELOPMENT_ORIGIN으로 개발 서비스에만 추가한다. 인증 기능과는 별개다.

## 10. 테스트 전략

API origin 단위 테스트, 전체 웹 테스트, 개발 및 운영 빌드, SSR 요청 origin 검사, Spring CORS 통합 테스트, Actions 정적 검사, 구조 문서 검사, 배포 후 SSR 및 CORS 확인.

## 11. 미해결 사항

GitHub Vercel 시크릿과 개발 API 환경 설정은 실제 배포 전에 구성해야 한다. 담당자, 스프린트, 마감일은 이슈에 지정되지 않았다.

## Implementation Plan

1. API origin 검증 함수를 추가하고 브라우저, 초기 배너 요청, SSR, 사전 렌더링에 공유한다.
2. 개발 웹 Actions와 산출물 및 배포 검증 스크립트를 추가한다.
3. 개발 API의 환경별 CORS 설정을 추가한다.
4. 배포 운영 절차와 변경된 API 계약 문서를 갱신한다.
5. 테스트, 두 환경 빌드, 구조 검사와 diff 점검을 수행한다.
