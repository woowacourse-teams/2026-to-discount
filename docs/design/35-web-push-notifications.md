# Design: 중요 배너 Web Push 알림

> GitHub Issue: [#35](https://github.com/woowacourse-teams/2026-to-discount/issues/35)
>
> 범위: Design과 Implementation Plan

## 1. 문제

### 배경

서비스의 중요한 할인은 사람이 선별해 `banners.yml`에 등록한다. 사용자는 서비스를 직접 다시 방문해야 새 배너가 추가됐는지 알 수 있다. 중요한 신규 할인을 놓치지 않게 알리고 서비스 재방문을 유도할 수단이 필요하다.

현재 로그인과 사용자 계정은 없다. 초기 알림은 개인화하지 않고, 알림 수신에 동의한 모든 브라우저 구독에 동일하게 보낸다.

### 해결하려는 문제

- 알림 수신에 동의한 사용자가 중요한 신규 배너를 서비스에 재방문하지 않고도 알 수 있어야 한다.
- 여러 신규 배너 때문에 하루에 알림을 반복해서 받지 않아야 한다.
- 신규 등록과 `notify: false`에서 `true`로 변경된 배너를 구분하고 중복 발송을 막아야 한다.
- iOS 사용자가 Web Push의 설치 조건을 이해하고 구독할 수 있어야 한다.

## 2. 목표

- 로그인 없이 브라우저 단위 Web Push 구독을 제공한다.
- 매일 오전 11시에 지난 24시간 동안 알림 대상으로 등록된 배너를 한 건의 요약 알림으로 보낸다.
- 운영자가 배너 등록 또는 `notify` 활성화 시 즉시 알림 여부를 선택할 수 있게 한다.
- 즉시 알림과 정기 요약 사이의 중복 발송을 방지한다.
- iOS와 iPadOS의 홈 화면 설치 조건과 알림 활성화 방법을 안내한다.
- 알림 표시와 클릭을 이벤트로 기록해 발송 이후 반응을 측정한다.

## 3. Non-goals

이번 작업에서 하지 않는 것:

- 로그인과 사용자 계정 기반 구독 동기화
- 사용자별 브랜드, 플랫폼, 시간대 알림 설정
- 시작 임박, 종료 임박, 품절 해제 등 배너 생애주기 알림
- 배너를 등록하거나 수정하는 별도 관리 화면
- 즉시 알림의 예약 발송
- 알림 성과 분석을 위한 별도 PostHog 대시보드

## 4. 요구사항

### 필수

#### 사용자 구독

- 사용자는 서비스에서 알림을 켜거나 끌 수 있다.
- 브라우저 알림 권한은 사용자가 알림 켜기를 직접 선택한 뒤 요청한다.
- 권한을 거부했거나 Web Push를 지원하지 않는 환경에서도 기존 서비스를 이용할 수 있어야 한다.
- 알림을 선택하면 서비스 루트 페이지 `/`로 이동한다.
- 로그인하지 않은 동일 사용자가 여러 기기나 브라우저에서 구독하면 각각 별도 구독으로 취급한다.

#### 정기 요약

- 매일 오전 11시 `Asia/Seoul` 기준으로 발송한다.
- 직전 발송 기준 시각부터 현재 발송 기준 시각까지 최대 24시간 동안 알림 대상으로 활성화된 배너를 조회한다.
- 현재 `notify: true`이며 발송 이력이 없는 배너만 포함한다.
- 배너가 여러 개여도 구독당 알림 한 건으로 요약한다.
- 오전 11시 이후 등록되거나 알림 대상으로 전환된 배너는 다음 날 오전 11시 요약에 포함한다.
- 즉시 알림으로 발송한 배너는 정기 요약에서 제외한다.

#### 알림 대상 판정

- `notify`의 기본값은 `false`다.
- 새로운 `id`의 배너가 처음 반영되면 신규 등록으로 본다.
- 기존 배너의 `notify`가 `false`에서 `true`로 바뀌면 새로운 알림 대상 전환으로 본다.
- 일반 내용 수정과 `true`에서 `true`로의 재반영은 새로운 알림 대상으로 보지 않는다.
- 배너별 알림 대상 활성화 시각과 발송 여부를 서버 상태에 저장한다.
- 서버 재시작과 동일 파일 재반영 후에도 신규 등록이나 전환으로 잘못 판단하지 않아야 한다.

#### 즉시 알림

- 배너 신규 등록 또는 `notify: false`에서 `true`로 전환할 때 `notifyImmediately`로 즉시 발송 여부를 선택한다.
- 오전 7시 이상 오후 10시 미만에만 즉시 발송한다.
- 오후 10시 이상 다음 날 오전 7시 미만의 즉시 발송 요청은 실행하지 않고 다음 오전 11시 요약 대상으로 유지한다.
- 즉시 발송에 성공한 배너는 오전 11시 요약에서 제외한다.
- 동일한 알림 대상 전환에 대해 즉시 알림을 두 번 발송하지 않는다.

#### 알림 문구

배너가 한 개일 때:

- 제목: `오늘의 새로운 배달 쿠폰 소식`
- 본문: `{브랜드명} 할인을 확인해 보세요.`

배너가 여러 개일 때:

- 제목: `오늘의 새로운 할인 소식`
- 본문: `{대표 브랜드명} 외 {N}개의 새로운 할인이 있어요.`
- `{N}`은 대표 배너를 제외한 나머지 배너 수다.
- 대표 브랜드는 배너 정렬 결과의 첫 배너에 있는 대표 브랜드를 사용한다.

#### iOS와 iPadOS

- iOS와 iPadOS 16.4 이상을 지원 대상으로 삼는다.
- 홈 화면에 설치되지 않은 iOS 사용자에게 홈 화면 추가가 필요하다고 안내한다.
- 사용자가 홈 화면에서 설치된 웹 앱을 실행한 뒤 알림 켜기를 선택하도록 안내한다.
- 설치 조건을 충족하기 전에는 알림 권한 요청을 시도하지 않는다.

#### 운영 화면

- 운영자는 기존 `/ops/#banner`의 배너 승인 또는 편집 화면에서 `notify`를 선택한다.
- `notify`를 선택한 경우에만 즉시 알림 여부를 선택할 수 있다.
- 오전 7시 이상 오후 10시 미만에만 즉시 알림 선택을 활성화한다.
- 즉시 알림을 선택하지 않으면 다음 오전 11시 요약에 포함된다는 안내를 표시한다.
- `/ops/` 서버도 시간대와 필드 조합을 검증하며 화면 검증에만 의존하지 않는다.

#### 분석 이벤트

- Service Worker가 `showNotification()`을 완료하면 `push_notification_displayed`를 기록한다.
- `push_notification_displayed`는 브라우저가 알림 표시 요청을 처리했다는 뜻이며 사용자가 실제로 읽었다는 의미로 해석하지 않는다.
- 사용자가 알림을 선택해 `notificationclick`이 발생하면 `push_notification_clicked`를 기록한다.
- 두 이벤트에는 `notificationId`, `deliveryType`, `bannerCount`, `bannerIds`를 포함한다. 기존 이벤트 계약에 맞춰 `bannerIds`는 정렬된 ID를 쉼표로 연결한 문자열로 보낸다.
- 각 이벤트에 고유한 `eventId`를 부여해 재전송에 따른 중복 집계를 막는다.
- Push endpoint와 암호화 키는 분석 이벤트와 로그에 포함하지 않는다.
- 분석 이벤트 전송 실패가 알림 표시, 클릭 처리와 루트 페이지 이동을 막지 않아야 한다.
- 구독 등록과 갱신 시 현재 브라우저의 `visitorId`를 Push 구독에 연결한다.
- Push payload에는 `visitorId` 대신 구독별 일회성 추적 토큰을 포함한다.
- 서버는 추적 토큰으로 구독의 `visitorId`를 찾아 두 이벤트의 PostHog `distinct_id`로 사용한다.
- 클릭은 서버가 이벤트를 먼저 기록한 뒤 루트 페이지로 redirect해 `push_notification_clicked`가 이후 `$pageview`, `offer_link_click`보다 먼저 기록되게 한다.
- 브라우저 데이터 삭제로 `visitorId`가 바뀌면 페이지가 다음에 열릴 때 기존 Push 구독과 새 `visitorId` 연결을 갱신한다.
- 기존 분석 수집 거부 상태도 구독에 함께 갱신하며, 수집을 거부한 구독의 표시와 클릭 이벤트는 기록하지 않는다.

### 선택

- 알림 설정 상태와 최근 구독 갱신 실패를 운영 로그나 상태 응답에서 확인한다.
- 일시적인 Push 전송 실패를 제한된 횟수만큼 재시도한다.

## 5. 제약사항

- 기술적 제약: Web Push는 HTTPS와 Service Worker가 필요하다. iOS와 iPadOS에서는 16.4 이상과 홈 화면 설치가 필요하다.
- 기술적 제약: 로그인하지 않으므로 사람 단위 중복 제거와 여러 기기 간 설정 동기화를 할 수 없다.
- 운영 제약: 배너 승인과 편집을 담당하는 운영 콘솔 코드는 `nn98/beggars-ops` 저장소의 `main`에서 관리한다. `web/index.html`은 서버의 `/var/www/ops/index.html`로, `ops_apply.py`는 `/home/ubuntu/ops_apply.py`로 배포된다.
- 운영 제약: `ops_apply.py`가 서버 외부 `banners.yml`을 수정한 뒤 `POST /api/reload`를 호출한다. Spring API에 배너 쓰기 경로를 추가하지 않는다.
- 운영 제약: 브라우저 구독 정보와 알림 상태는 서버 재시작 후에도 유지돼야 한다.
- 보안 제약: VAPID 비공개 키와 Push 구독 정보는 저장소에 커밋하지 않는다.
- 배포 제약: Vercel의 프론트 출처와 API 출처가 다르므로 Service Worker는 프론트 출처에서 제공하고 구독 등록은 API CORS 정책을 따른다.

## 6. 성공 조건

### 사용자 관점

- [ ] 지원 브라우저에서 알림을 켜고 끌 수 있다.
- [ ] 알림을 거부하거나 지원하지 않는 브라우저에서도 기존 기능을 사용할 수 있다.
- [ ] 대상 배너 한 개와 여러 개의 알림이 합의한 문구로 표시된다.
- [ ] 알림을 선택하면 서비스 루트 페이지가 열린다.
- [ ] 지원되는 iOS 환경에서 설치 안내를 따라 홈 화면 웹 앱으로 구독할 수 있다.
- [ ] 알림 표시와 클릭을 별도 이벤트로 구분해 측정할 수 있다.

### 시스템 관점

- [ ] 매일 오전 11시에 지난 24시간의 대상 배너를 구독당 알림 한 건으로 발송한다.
- [ ] 신규 배너와 `notify: false`에서 `true`로 전환된 배너만 새 대상으로 기록한다.
- [ ] 즉시 발송된 배너가 정기 요약에 다시 포함되지 않는다.
- [ ] 같은 알림 대상 전환과 브라우저 구독 조합에 중복 발송하지 않는다.
- [ ] 재시작과 `/api/reload` 재호출 이후에도 알림 대상 시각과 발송 이력이 유지된다.
- [ ] 만료된 Push 구독은 전송 결과를 근거로 비활성화하거나 제거한다.
- [ ] 표시 이벤트는 `showNotification()` 완료 후, 클릭 이벤트는 `notificationclick`에서 한 번 기록된다.
- [ ] 분석 이벤트 실패와 재시도가 알림 표시나 루트 페이지 이동을 막거나 중복 집계하지 않는다.

### 운영 관점

- [ ] `notify`와 `notifyImmediately`의 기본값과 동작이 배너 운영 문서에 설명된다.
- [ ] 야간 즉시 발송 요청이 실행되지 않았는지 운영자가 로그와 reload 응답으로 확인할 수 있다.
- [ ] VAPID 키와 데이터 파일 경로를 환경변수로 설정할 수 있다.
- [ ] 발송 대상 수, 성공 수, 실패 수와 제외 이유를 로그에서 확인할 수 있다.
- [ ] `/ops/#banner`에서 알림 등록 여부와 허용 시간대의 즉시 발송 여부를 함께 결정할 수 있다.

## 7. 고려한 접근 방식

### A. 자체 Web Push와 익명 브라우저 구독

설명: 프론트가 Service Worker와 Push API로 구독을 만들고 서버가 VAPID로 직접 발송한다. 구독과 발송 상태는 서버에서 관리한다.

장점:

- 로그인 없이 현재 요구사항을 충족할 수 있다.
- 구독, 발송 시각, 중복 제거 정책을 서비스 요구에 맞게 제어할 수 있다.
- 외부 알림 서비스의 사용자 모델과 비용 정책에 종속되지 않는다.

단점:

- VAPID 키, 구독 만료, 재시도와 발송 상태를 직접 운영해야 한다.
- iOS 설치 조건을 별도로 안내해야 한다.

### B. OneSignal 등 관리형 Push 서비스

설명: 외부 서비스의 Web SDK와 발송 API를 사용해 구독과 전송을 위임한다.

장점:

- 구독 관리와 발송 현황 도구를 빠르게 확보할 수 있다.
- 브라우저별 예외 처리 부담이 줄어든다.

단점:

- 외부 SDK와 운영 화면에 종속된다.
- 배너의 신규 등록과 상태 전환, 정기 요약 중복 제거는 여전히 자체 구현해야 한다.
- 현재 규모에서는 관리형 서비스 도입 비용과 복잡성이 더 클 수 있다.

### C. 로그인 기반 사용자 알림

설명: 계정에 구독을 연결하고 사용자별 알림 설정과 여러 기기 구독을 관리한다.

장점:

- 사람 단위 중복 제거와 기기 간 설정 동기화가 가능하다.
- 향후 개인화 알림으로 확장하기 쉽다.

단점:

- 로그인 도입이 현재 목표보다 큰 선행 작업이다.
- 알림 수요와 다중 기기 요구가 확인되지 않은 상태에서 범위가 과도하게 커진다.

## 8. 선택

선택한 방법: A. 자체 Web Push와 익명 브라우저 구독

선택 이유:

- 현재 서비스의 로그인 없는 구조를 유지하면서 재방문 알림을 제공할 수 있다.
- 하루 한 번 요약, 선택적 즉시 발송, 배너 단위 중복 제거 정책을 직접 표현할 수 있다.
- 로그인은 알림 수요와 여러 기기 동기화 요구가 확인된 뒤 검토할 수 있다.

## 9. 설계

### Architecture

```text
브라우저
  알림 설정 UI
    → Service Worker 등록
    → PushSubscription 생성
    → API에 구독 등록 또는 해제

운영자
  /ops/#banner에서 승인 또는 편집
    → POST /ops/apply 또는 POST /ops/edit
    → ops_apply.py가 banners.yml 수정
    → POST /api/reload
    → BannerCatalog 갱신
    → 신규 등록 또는 notify 활성화 감지
    → 알림 상태 기록
    → 조건을 충족하면 즉시 발송 작업 생성

API
  오전 11시 Scheduler
    → 지난 24시간의 미발송 대상 조회
    → 배너 요약 Payload 생성
    → 활성 구독에 Web Push 발송
    → 배너와 구독별 결과 기록

Service Worker
  Push 수신
    → 알림 표시
    → push_notification_displayed 기록
  알림 선택
    → push_notification_clicked 기록
    → 루트 페이지 열기 또는 포커스
```

### 데이터 모델

#### Banner 알림 필드

- `notify: boolean`: 알림 대상 여부. 생략 시 `false`다.
- `notifyImmediately: boolean`: 이번 신규 등록 또는 `notify` 활성화 때 즉시 발송할지 여부. 생략 시 `false`다.

`notifyImmediately`는 지속적인 발송 상태가 아니다. 동일 배너가 재반영돼도 상태 저장소에 기록된 전환 식별자가 같으면 다시 발송하지 않는다.

#### PushSubscription

- `endpoint`: Push 서비스가 발급한 구독 주소
- `p256dh`, `auth`: 암호화에 필요한 브라우저 키
- `createdAt`, `updatedAt`: 등록과 갱신 시각
- `active`: 발송 가능한 구독인지 여부
- `visitorId`: 기존 웹 분석에서 사용하는 브라우저 익명 식별자
- `analyticsEnabled`: 기존 분석 수집 거부 설정을 반영한 이벤트 기록 가능 여부

endpoint 원문은 로그에 남기지 않는다. 저장소와 발송 이력에서는 endpoint의 안정적인 해시를 구독 식별자로 사용한다.

#### PushTrackingToken

- `token`: payload와 추적 URL에 넣는 추측하기 어려운 일회성 값
- `notificationId`: 발송 작업 식별자
- `subscriptionId`: 수신 구독 식별자
- `expiresAt`: 추적 허용 만료 시각

토큰으로 구독에 연결된 `visitorId`를 찾는다. 분석 이벤트의 `eventId`는 `notificationId`, `subscriptionId`, 이벤트 종류의 조합으로 결정해 표시나 클릭 요청이 재시도돼도 같은 `$insert_id`를 사용한다.

#### BannerNotificationState

- `bannerId`: 배너 식별자
- `lastNotify`: 마지막으로 관찰한 `notify` 값
- `activationId`: 신규 등록 또는 `false`에서 `true` 전환마다 생성하는 식별자
- `activatedAt`: 해당 전환이 서버에 반영된 시각
- `immediateRequested`: 즉시 발송 선택 여부
- `immediateDispatchedAt`: 즉시 발송 작업이 시작된 시각
- `digestDispatchedAt`: 정기 요약 발송 작업이 시작된 시각

발송 이력은 `activationId`와 구독 식별자의 조합으로 기록한다. 전체 발송 작업의 완료 여부와 개별 구독의 성공 여부를 분리해 일시 실패를 재시도하면서도 성공한 구독에 중복 발송하지 않는다.

### Components

#### 알림 설정 UI

- 책임: 지원 여부와 권한 상태 표시, 구독과 해제, iOS 설치 안내
- 의존성: Notification API, Service Worker API, Push API, Push 구독 API
- 외부 인터페이스: 알림 켜기와 끄기 사용자 동작

#### Ops 배너 화면

- 책임: 배너 승인 또는 편집 시 알림 등록과 즉시 발송 여부 입력, 야간 선택 비활성화
- 의존성: `nn98/beggars-ops/web/index.html`, `/ops/apply`, `/ops/edit`
- 외부 인터페이스: `notify`, `notifyImmediately`를 포함한 승인 또는 편집 요청

#### ops_apply.py

- 책임: 승인 요청 검증, `banners.yml` 백업과 수정, 편집 이력 기록, `/api/reload` 호출
- 의존성: 서버의 `scripts/ops_apply.py`, `banners.yml`, `/var/www/ops/edits`, Spring API
- 외부 인터페이스: nginx Basic Auth 뒤의 `/ops/apply`, `/ops/edit`

#### Service Worker

- 책임: `push` 이벤트로 알림 표시와 표시 이벤트 기록, `notificationclick`에서 클릭 이벤트 기록 후 루트 페이지 열기 또는 포커스
- 의존성: 브라우저 Service Worker 실행 환경
- 외부 인터페이스: 서버가 보내는 제목, 본문, URL, `notificationId`, 발송 유형과 배너 정보 payload

#### PushSubscriptionController

- 책임: VAPID 공개 키 제공, `visitorId`를 포함한 구독 등록과 갱신, 구독 해제
- 의존성: PushSubscriptionStore
- 외부 인터페이스: `/api/push/public-key`, `/api/push/subscriptions`

#### PushSubscriptionStore

- 책임: 브라우저 구독의 영속 저장, 중복 endpoint 갱신, 만료 구독 비활성화
- 의존성: 서버 외부 데이터 파일

#### BannerNotificationTracker

- 책임: BannerCatalog 갱신 전후 상태를 비교해 신규 등록과 `notify` 활성화를 기록
- 의존성: BannerCatalog, BannerNotificationStore, Clock
- 외부 인터페이스: `/api/reload` 처리 결과에 신규 대상 수와 즉시 발송 결과 제공

#### BannerNotificationScheduler

- 책임: `Asia/Seoul` 오전 11시 정기 요약 대상을 선택하고 발송 작업 생성
- 의존성: BannerNotificationStore, WebPushSender, Clock

#### WebPushSender

- 책임: VAPID 인증과 payload 암호화, 활성 구독별 발송, 결과 분류
- 의존성: Web Push 구현 라이브러리, PushSubscriptionStore
- 오류 분류: 성공, 만료, 재시도 가능 실패, 영구 실패

#### PushTrackingController

- 책임: 표시 추적 토큰 수신, 클릭 이벤트 기록, 루트 페이지 redirect
- 의존성: PushSubscriptionStore, AnalyticsEventService, 발송 이력
- 외부 인터페이스: `POST /api/push/displayed/{token}`, `GET /api/push/click/{token}`

### Data Flow

#### 구독

1. 사용자가 알림 켜기를 선택한다.
2. 프론트가 환경과 iOS 설치 조건을 확인한다.
3. 프론트가 Service Worker를 등록하고 알림 권한을 요청한다.
4. 브라우저가 VAPID 공개 키로 PushSubscription을 생성한다.
5. API가 endpoint 기준으로 구독을 새로 저장하거나 갱신하고 현재 `visitorId`를 연결한다.
6. 사용자가 알림 끄기를 선택하면 브라우저 구독과 서버 구독을 함께 해제한다.

#### 배너 등록과 즉시 발송

1. 운영자가 `/ops/#banner`에서 배너 승인 또는 편집과 함께 `notify`, `notifyImmediately`를 선택한다.
2. `ops_apply.py`가 필드 조합과 즉시 발송 가능 시간을 검증하고 승인 내용을 이력에 기록한다.
3. `ops_apply.py`가 `banners.yml`을 백업하고 수정한 뒤 `/api/reload`를 호출한다.
4. 파일 파싱과 기존 배너 검증이 성공한 경우에만 알림 상태를 비교한다.
5. 신규 `id` 또는 `notify: false → true` 전환이면 activation을 기록한다.
6. `notifyImmediately: true`이고 현재 시각이 오전 7시 이상 오후 10시 미만이면 즉시 발송한다.
7. 야간 요청은 발송하지 않고 다음 요약 대상으로 유지하며 ops 응답과 이력에 사유를 남긴다.
8. 즉시 발송 작업을 시작한 activation은 정기 요약 대상에서 제외한다. 개별 구독 실패는 같은 발송 작업 안에서만 재시도한다.

#### 오전 11시 정기 요약

1. Scheduler가 `Asia/Seoul` 오전 11시에 실행된다.
2. 지난 24시간 안에 활성화됐고 현재 `notify: true`인 activation을 찾는다.
3. 즉시 발송 작업이나 이전 요약 발송 작업이 없는 activation만 선택한다.
4. 배너 정렬 순서로 대표 브랜드를 고르고 한 건의 payload를 만든다.
5. 구독별 발송 결과를 기록한다.
6. 만료 응답을 받은 구독은 비활성화하고 일시 실패만 제한적으로 재시도한다.

#### 알림 선택

1. 서버가 구독별 추적 토큰을 포함한 Push payload를 보낸다.
2. Service Worker가 알림 표시를 완료하면 `POST /api/push/displayed/{token}`을 호출한다.
3. 서버가 구독의 `visitorId`로 `push_notification_displayed`를 기록한다.
4. 사용자가 알림을 선택하면 Service Worker가 `GET /api/push/click/{token}`을 연다.
5. 서버가 같은 `visitorId`로 `push_notification_clicked`를 기록한 뒤 서비스 루트 페이지로 redirect한다.
6. 같은 출처의 루트 페이지가 열려 있으면 추적 URL을 거쳐 해당 창을 이동하고, 열려 있지 않으면 새 창을 연다.

### Error Handling

- 알림 권한 거부 → 권한을 반복 요청하지 않고 브라우저 설정 변경 방법을 안내한다.
- 지원하지 않는 브라우저 → 알림 설정을 비활성화하고 기존 서비스는 그대로 제공한다.
- iOS 홈 화면 미설치 → 권한을 요청하지 않고 설치 가이드를 표시한다.
- 구독 저장 실패 → 알림 켜기 실패를 알리고 브라우저 구독을 정리해 양쪽 상태가 갈리지 않게 한다.
- 배너 YAML 파싱 또는 검증 실패 → 기존 카탈로그와 알림 상태를 유지하고 알림을 생성하지 않는다.
- 야간 즉시 발송 요청 → 정기 요약 대상으로 유지하고 사유를 reload 응답과 로그에 기록한다.
- Push 서비스의 404 또는 410 → 만료 구독으로 처리하고 더 이상 발송하지 않는다.
- 429 또는 5xx → 성공 구독은 유지하고 실패 구독만 제한적으로 재시도한다.
- 서버 재시작 → 영속 상태를 읽어 처리 중이거나 미발송인 작업을 재개하고 성공 이력은 다시 보내지 않는다.
- 대상 배너 없음 → 오전 11시 작업은 알림을 보내지 않고 대상 0건을 기록한다.
- 표시 이벤트 전송 실패 → 알림 표시는 유지하고 같은 토큰으로 제한적으로 재시도한다.
- 클릭 이벤트 기록 실패 → 루트 페이지로 redirect하고 실패를 기록한다. 분석 실패 때문에 사용자 이동을 막지 않는다.
- 만료되거나 알 수 없는 추적 토큰 → 이벤트를 기록하지 않고 클릭 요청이면 루트 페이지로 redirect한다.

## 10. 테스트 전략

- Unit: 신규 배너 감지, `notify` 전환, 24시간 경계, 오전 7시와 오후 10시 경계, 문구 생성, 중복 제거를 고정 Clock으로 검증한다.
- Integration: 구독 등록과 해제, reload 이후 activation 저장, Scheduler와 가짜 Push Sender의 연동, 재시작 후 상태 복구를 검증한다.
- Frontend: 지원 여부와 권한 상태, iOS 설치 조건, 구독과 해제 API 호출, Service Worker payload 처리를 검증한다.
- Analytics: 구독과 `visitorId` 연결, 추적 토큰 만료, 표시와 클릭 이벤트 이름 및 속성, 결정적 `eventId`, 클릭 후 redirect 순서를 검증한다.
- Acceptance: 실제 HTTPS 환경에서 Chrome, Android Chrome, iOS 16.4 이상 홈 화면 웹 앱의 구독, 수신, 선택 이동을 확인한다.
- Regression: 기존 배너 조회와 `/api/reload`, 알림 비지원 환경의 기존 서비스 동작을 검증한다.

## 11. 미해결 사항

- Web Push Java 라이브러리는 `nl.martijndwars:web-push:5.1.1`로 확정했다.
- 일시 실패 재시도 횟수와 간격은 구현 시 Push 서비스 응답 분류에 맞춰 정한다.
- 알림 설정 UI의 정확한 위치와 iOS 가이드 표현은 기존 화면을 해치지 않는 범위에서 구현 시 확정한다.

## Implementation Plan

### 변경 대상

#### Create

- `api/src/main/java/com/discounttracker/push/PushProperties.java`: VAPID와 저장 경로, 발송 시각 설정
- `api/src/main/java/com/discounttracker/push/PushSubscription.java`: 익명 브라우저 구독 모델
- `api/src/main/java/com/discounttracker/push/BannerNotificationState.java`: 배너 activation과 발송 상태 모델
- `api/src/main/java/com/discounttracker/push/PushTrackingToken.java`: 구독별 표시와 클릭 추적 토큰 모델
- `api/src/main/java/com/discounttracker/push/PushStateStore.java`: 구독, activation, 발송 이력과 추적 토큰의 원자적 영속 저장
- `api/src/main/java/com/discounttracker/push/BannerNotificationService.java`: reload 전후 전환 감지, 오전 11시 요약과 즉시 발송 조정
- `api/src/main/java/com/discounttracker/push/PushMessageFactory.java`: 한 개와 여러 개 배너 알림 문구 생성
- `api/src/main/java/com/discounttracker/push/WebPushSender.java`: VAPID Web Push 발송과 결과 분류
- `api/src/main/java/com/discounttracker/web/PushSubscriptionController.java`: 공개 키와 구독 등록 및 해제 API
- `api/src/main/java/com/discounttracker/web/PushTrackingController.java`: 표시 이벤트 수신과 클릭 이벤트 기록 후 루트 페이지 redirect
- `api/src/test/java/com/discounttracker/push/`: 판정, 저장소, 발송 조정 단위 테스트
- `api/src/test/java/com/discounttracker/web/PushSubscriptionControllerTest.java`: 구독 API 테스트
- `api/src/test/java/com/discounttracker/web/PushTrackingControllerTest.java`: visitorId 연결, 추적 토큰, 표시와 클릭 및 redirect 테스트
- `web/public/sw.js`: Push 표시와 알림 선택 처리 Service Worker
- `web/src/pushNotifications.js`: 지원 확인, 권한 요청, 구독과 해제 로직
- `web/src/PushNotificationSetting.jsx`: 알림 설정과 iOS 설치 안내 UI
- `web/src/pushNotifications.test.js`: 환경 판정과 구독 흐름 단위 테스트

#### Modify

- `nn98/beggars-ops/web/index.html`: 배너 승인과 편집 폼에 알림 등록 및 즉시 발송 선택 추가. API와 Web 구현 및 PR 병합이 모두 끝난 뒤 `beggars-ops`의 `main`에서 변경
- `nn98/beggars-ops/ops_apply.py`: 알림 필드 검증과 저장, 이력 기록, reload 결과 전달. API와 Web 구현 및 PR 병합이 모두 끝난 뒤 `beggars-ops`의 `main`에서 변경
- `nn98/beggars-ops/banner_ops.py`: 배너 파일 쓰기 로직에서 `notify`, `notifyImmediately` 필드를 보존하고 검증하도록 필요한 경우 변경
- `api/build.gradle`: 선택한 Web Push 라이브러리 의존성 추가
- `api/src/main/java/com/discounttracker/banner/Banner.java`: `notify`, `notifyImmediately` 필드와 기본값 추가
- `api/src/main/java/com/discounttracker/banner/BannerCatalog.java`: 전체 배너 상태 제공과 reload 변경 감지 연결
- `api/src/main/java/com/discounttracker/web/BrandController.java`: 검증 성공 후 알림 tracker 호출과 결과 응답 추가
- `api/src/main/resources/application.yml`: VAPID, 구독 저장소, 알림 상태 저장소와 Scheduler 설정 추가
- `api/src/test/java/com/discounttracker/banner/BannerCatalogTest.java`: 새 필드 기본값과 파싱 테스트 추가
- `api/src/main/resources/banners.yml`: 알림 필드 예시 반영
- `api/README.md`: 배너 알림 필드, VAPID 키, 데이터 경로와 운영 절차 설명
- `web/src/App.jsx`: 알림 설정 UI 배치
- `web/src/App.css`: 알림 설정과 iOS 설치 안내 스타일 추가
- `web/src/api.js`: Push 공개 키, 구독 등록과 해제 호출 추가
- `web/README.md`: 브라우저 지원 범위와 iOS 설치 및 검증 절차 추가

### PR 분할

#### PR 1. API Web Push와 배너 발송

- 제목 예시: `[API] feat: 중요 배너 Web Push 발송 추가`
- 범위: Task 1부터 Task 4, Push 추적 API, API 운영 문서와 테스트
- 완료 조건: 가짜 Push Sender를 사용해 구독, 배너 대상 판정, 발송, 표시, 클릭, redirect가 검증되고 VAPID 설정이 없는 환경에서 기존 API가 정상 동작한다.
- 배포 조건: PR 1을 병합하고 API를 배포한 뒤 PR 2의 실제 HTTPS 연동을 검증한다.

#### PR 2. Web Push 구독과 수신

- 제목 예시: `[WEB] feat: Web Push 구독 및 수신 추가`
- 범위: Task 5와 Task 6, Web 운영 문서와 브라우저 검증
- 의존성: PR 1에서 확정한 구독, 표시 추적, 클릭 redirect API 계약
- 완료 조건: 지원 브라우저에서 구독, 수신, 표시 기록, 클릭, 루트 이동이 동작하고 PostHog에서 같은 `distinct_id`의 Push 퍼널을 확인할 수 있다.

두 PR이 모두 병합되고 API와 Web 배포가 끝난 뒤에만 Task 8의 ops 서버 변경을 수행한다.

### Tasks

#### 1. Web Push 기술 검증과 설정 기반 구성

- 변경: Java 17에서 사용할 Web Push 라이브러리를 검증하고 VAPID 키와 데이터 경로 설정을 추가한다.
- 테스트: 애플리케이션 설정 바인딩과 키 누락 시 비활성화 동작을 검증한다.
- 완료 조건: 키가 없는 개발 환경에서는 기존 API가 정상 실행되고, 키가 있는 환경에서는 공개 키를 제공할 수 있다.

#### 2. 배너 알림 대상과 영속 상태 구현

- 변경: Banner에 알림 필드를 추가하고 신규 `id`, `notify: false → true`, 일반 수정을 구분한다. activation과 발송 이력을 원자적으로 저장한다.
- 테스트: 기본값, 전환, 동일 reload, 재시작, 24시간 경계를 고정 Clock으로 검증한다.
- 완료 조건: 같은 배너 상태를 반복 반영해도 activation이 한 번만 생성되고 재시작 후에도 유지된다.

#### 3. 익명 Push 구독 API 구현

- 변경: 공개 키 조회와 구독 등록, 갱신, 해제 API 및 파일 기반 구독 저장소를 구현한다. 등록과 갱신 요청의 `visitorId`와 분석 수집 거부 상태를 구독에 연결한다.
- 테스트: 신규 등록, 같은 endpoint와 현재 `visitorId` 및 수집 거부 상태 갱신, 해제, 잘못된 요청, 재시작 복구를 검증한다.
- 완료 조건: 브라우저 구독을 로그인 없이 등록하고 해제할 수 있고 기존 분석의 `visitorId`와 연결되며 endpoint가 로그에 노출되지 않는다.

#### 4. 즉시 발송과 오전 11시 요약 구현

- 변경: 문구 생성, 오전 7시부터 오후 10시까지의 즉시 발송, 오전 11시 정기 요약, 구독별 결과 기록과 일회성 추적 토큰을 구현한다. 표시 API는 연결된 `visitorId`로 이벤트를 기록하고 클릭 API는 이벤트 기록 후 루트 페이지로 redirect한다.
- 테스트: 07:00, 11:00, 22:00 경계, 한 개 및 여러 개 문구, 즉시 발송 후 요약 제외, 부분 실패 재시도, 토큰 만료, 표시 중복 제거, 클릭 기록과 redirect 순서를 검증한다.
- 완료 조건: 대상 배너가 합의한 정책과 문구로 한 번 발송되고 즉시 발송과 요약이 중복되지 않으며 표시와 클릭이 기존 `visitorId`로 기록된다.

#### 5. Web Push 구독 UI와 Service Worker 구현

- 변경: 사용자의 직접 동작으로 권한을 요청하고 현재 `visitorId`와 Push 구독을 API에 저장한다. Service Worker는 표시 추적 API를 호출하고 알림 선택 시 서버의 클릭 추적 URL을 거쳐 루트 페이지로 이동한다. 페이지가 열릴 때 기존 구독과 현재 `visitorId` 연결을 갱신한다.
- 테스트: 지원 여부, 권한 상태, 구독과 해제, visitorId 갱신, 표시 API 호출, 클릭 추적 URL, 분석 실패와 알림 선택 동작을 브라우저 API 대역으로 검증한다.
- 완료 조건: 지원 브라우저에서 알림을 켜고 끌 수 있고 표시와 클릭이 같은 `visitorId`로 기록되며, 분석 실패 여부와 관계없이 알림 선택 시 `/`로 이동한다.

#### 6. iOS 설치 가이드와 비지원 환경 처리

- 변경: iOS 버전과 standalone 실행 여부를 판정해 홈 화면 설치 안내를 제공하고 조건 충족 전 권한 요청을 막는다.
- 테스트: 일반 iOS Safari, 홈 화면 웹 앱, 비지원 브라우저, 권한 거부 상태를 검증한다.
- 완료 조건: iOS 사용자가 필요한 설치 단계를 확인할 수 있고 알림을 사용할 수 없는 환경에서도 기존 기능이 유지된다.

#### 7. 운영 문서와 실제 환경 검증

- 변경: 배너 필드 사용법, 야간 요청 처리, VAPID 키 생성과 배포, 브라우저별 검증 절차를 문서화한다.
- 테스트: 저장소 안에서 실행 가능한 테스트와 빌드를 모두 완료한다.
- 완료 조건: 운영자가 문서만 보고 구독 설정, 배너 알림 선택, 발송 결과 확인과 만료 구독 처리를 수행할 수 있고 PR을 제출할 준비가 된다.

#### 8. PR 병합 후 beggars-ops 반영과 배포

- 선행 조건: API와 Web 구현의 검증, 리뷰, PR 병합과 배포가 모두 완료돼야 한다. 그전에는 운영 콘솔 코드를 변경하지 않는다.
- 변경: `nn98/beggars-ops`의 `main`에서 `web/index.html`에 알림 선택 UI와 요청 payload를 추가하고, `ops_apply.py`와 필요한 경우 `banner_ops.py`에 필드와 시간대 검증 및 이력 기록을 추가한다. 서버 파일을 직접 수정하지 않는다.
- 적용: `beggars-ops`의 배포 워크플로로 `main`의 코드를 서버에 반영한다. 정적 콘솔 변경에는 재시작이 필요 없고 Python 파일이 변경된 경우에만 `ops-apply.service`를 재시작한다. API와 nginx는 해당 코드나 설정을 변경하지 않으므로 재시작하지 않는다.
- 테스트: 서비스 상태, `/ops/banners`, `/api/banners`, `/api/reload`를 확인한 뒤 테스트 배너로 요약과 즉시 알림 선택, 야간 제한을 점검한다.
- 완료 조건: 운영 화면에서 알림 방식을 선택할 수 있고 배너 반영과 reload가 성공하며 기존 배너 승인과 편집도 정상 동작한다.
- 롤백: 실패하면 `beggars-ops`에서 정상 동작하던 이전 커밋의 운영 콘솔 파일을 복원해 새 커밋으로 `main`에 반영하고 다시 배포한다. Python 파일이 복원된 경우 `ops-apply.service` 재시작과 기존 배너 승인 및 조회를 확인한다.

### Scope Check

- [x] 각 Task가 현재 이슈의 목표를 직접 달성하기 위해 필요하다.
- [x] 현재 단계에서 별도 가치를 갖는 독립 기능을 불필요하게 포함하지 않았다.
- [x] API와 Web을 두 PR로 분리해 각 PR의 계약과 완료 조건을 독립적으로 리뷰할 수 있다.
- [x] 전체 완료 조건은 중요한 신규 배너를 익명 구독자에게 중복 없이 전달하는 것으로 설명할 수 있다.

채택한 분할:

- `BLOCKING`: PR 1의 API 계약과 배포가 PR 2의 실제 HTTPS 연동 검증에 선행한다.
- `BLOCKING`: PR 1과 PR 2의 병합 및 배포가 `beggars-ops`의 `main` 변경과 배포에 선행한다.

후속 작업:

- `FOLLOW-UP`: 로그인 기반 구독 동기화와 개인화 알림.
- `FOLLOW-UP`: 시작, 종료 임박, 품절 해제 등 배너 생애주기 알림.
- `FOLLOW-UP`: 알림 성과 PostHog 대시보드.

### 검증

- `cd api && ./gradlew test`
- `cd web && npm test`
- `cd web && npm run build`
- `beggars-ops` 배포 후 `systemctl status ops-apply.service`
- PR 병합과 배포 후 `/ops/banners`, `/api/banners`, `/api/reload` 점검
- 실제 HTTPS 환경에서 데스크톱 Chrome, Android Chrome, iOS 16.4 이상 홈 화면 웹 앱의 구독, 수신, 알림 선택 확인
