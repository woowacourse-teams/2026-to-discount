# ADR-012. Spring Boot 4.1과 Jackson 3으로 올리고, JSON 모양은 Jackson 2 기본값으로 지킨다

- 날짜: 2026-10-14
- 상태: 확정
- 관련: mono `docs/TECH-CHOICES.md`, [ADR-011](ADR-011-event-log-incremental-read.md)

## 결정

API를 Spring Boot(자바 웹 서버 프레임워크) 3.3.5에서 4.1.1로 올렸다. 함께 Jackson(JSON을 읽고 쓰는 라이브러리)이 2에서 3으로 바뀌었다.

- 응답과 이벤트 원장의 JSON 모양은 바꾸지 않는다. Spring이 만드는 매퍼는 `spring.jackson.use-jackson2-defaults: true`로, 코드가 직접 만드는 매퍼는 `JsonMapper.builderWithJackson2Defaults()`로 Jackson 2의 기본값을 쓴다.
- Jackson 3에서 파싱 오류는 `IOException`이 아니라 비검사 예외(`JacksonException`)다. 예전에 `IOException`으로 잡던 자리마다 `JacksonException`도 같은 처리 길로 보낸다.

## 배경

2026-10-14 백엔드 점검에서 지원 기간을 확인했다(endoflife.date).

| 판 | 무료 지원 끝 | 유료 지원 끝 |
| --- | --- | --- |
| 3.3 | 2025-06-30 | 2026-06-30 |
| 3.5 | 2026-06-30 | 2032-06-30 |
| 4.0 | 2026-12-31 | 2027-12-31 |
| 4.1 | 2027-07-31 | 2028-07-31 |

3.3은 두 지원이 모두 끝나 보안 패치가 나오지 않는다. 인터넷에 열린 서버다. 무료 지원이 남은 판은 4.0과 4.1뿐이라 4.1을 골랐다.

## 바뀐 것

| 자리 | 바꾼 것 |
| --- | --- |
| 의존성 | `spring-boot-starter-web`을 `spring-boot-starter-webmvc`로. 테스트에 `spring-boot-starter-webmvc-test`, `spring-boot-micrometer-metrics-test` |
| Jackson 패키지 | `com.fasterxml.jackson.databind`를 `tools.jackson.databind`로. 어노테이션(`com.fasterxml.jackson.annotation`)은 그대로다 |
| Jackson 메서드 | `JsonNode.asText`를 `asString`으로, `fieldNames`를 `propertyNames`로. 매퍼는 빌더로 만든다(3에서는 바꿀 수 없는 객체다) |
| actuator 설정 | 폐기된 `management.endpoints.enabled-by-default`를 `management.endpoints.access.default: none`으로, 프로메테우스는 `access: read-only`로 |
| 테스트 | `AutoConfigureMockMvc`, `WebMvcTest`의 새 패키지. `@MockBean`을 `@MockitoBean`으로. `@AutoConfigureObservability`를 `@AutoConfigureMetrics`로. `TestRestTemplate` 대신 JDK `HttpClient` |

## Jackson 3 예외에서 조심한 자리

예외 종류가 바뀐 것은 컴파일이 다 잡지 못한다. `catch (IOException)` 블록에 파일 읽기가 함께 있으면 컴파일은 되는데 파싱 오류만 빠져나간다. 그대로 두었다면 이렇게 바뀌었다.

| 자리 | 그대로 두었다면 | 지금 |
| --- | --- | --- |
| `PushStateStore.load` | 깨진 푸시 상태 파일이 서버 기동 실패 | 예전처럼 복구 길(`recoverDamagedState`) |
| `PostHogOutbox` 대기 파일 읽기 | 깨진 파일 하나가 전달 전체를 멈춤 | 예전처럼 격리(`quarantineCorrupt`) |
| `EventController` 본문 읽기 | 잘못된 이벤트 본문이 500 | 예전처럼 조용히 버림(`accepted: 0`) |
| `OfferRepository.reload` | 깨진 export가 로그 없이 실패 | 예전처럼 로그를 남기고 실패 |

## 근거

- 테스트 434개가 통과한다.
- 배포된 3.3.5 jar와 4.1.1 jar를 같은 입력(tracker export와 이력, 운영 배너 사본, 이벤트 원장)으로 띄웠다. `/api/brands`(113건), `/api/banners`, 이력, 설문 응답이 같다.
- 같은 이벤트를 두 jar에 보내 원장에 적힌 줄이 키 순서까지 같다.
- 운영 배포 뒤 확인했다. 네 GET 경로가 200이고, 배너 날짜가 문자열이고, 깨진 이벤트 본문이 `accepted: 0`이다.

## 대가와 남은 일

- Jackson 2 기본값은 이행용 설정이라 다음 판에서 빠질 수 있다. 지우려면 응답 키 순서(3은 알파벳순)와 원시 타입 null 거부를 확인해야 한다.
- 4.1의 무료 지원은 2027-07-31에 끝난다. 그 전에 다음 판을 본다.
- 운영 서버에 붙은 러너가 jar를 빌드하고 테스트까지 돌린 뒤 재시작한다. 이 워크플로는 미러 저장소에만 있어 이 결정에서 바꾸지 않았다(tracker `docs/REFACTOR-BACKLOG.md` 14번).
