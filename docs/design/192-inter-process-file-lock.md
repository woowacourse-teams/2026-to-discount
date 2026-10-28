# 192. 푸시 상태와 기프티콘 파일의 프로세스 간 락

추적 이슈: [#192](https://github.com/woowacourse-teams/2026-to-discount/issues/192)
짝 이슈: [#189](https://github.com/woowacourse-teams/2026-to-discount/issues/189)

## 결론

두 저장소의 읽기-고치기-쓰기를 **잠금 파일(`<파일>.lock`)의 OS 락** 안에서 하게 바꾼다. 병합 쓰기는 따로 만들지 않는다. 락 안에서 파일을 다시 읽고 고치기 때문에 결과적으로 병합이 된다.

- 락 도우미 하나(`InterProcessFileLock`)를 두 저장소가 함께 쓴다.
- `GifticonStore.issue`는 "이미 받았나 확인, 코드 고르기, yml 쓰기, 발급 원장 한 줄"을 한 락 안에서 한다.
- `PushStateStore`는 고치는 메서드마다 락을 잡고, 락 안에서 **디스크 상태를 다시 읽은 뒤** 고치고 쓴다. 지금은 시작 때 읽은 메모리를 통째로 써서, 동시 쓰기가 아니어도 낡은 메모리가 다른 프로세스의 변경을 지운다.
- 파일 형식은 바꾸지 않는다. 웹, 수집기, 운영 저장소의 변경은 없다.

## 배경

[#188](https://github.com/woowacourse-teams/2026-to-discount/pull/188)의 무중단 배포(`api/deploy/prod/README.md`)는 새 jar를 임시 인스턴스(8089)로 먼저 띄우고, 본 인스턴스(8088)를 재시작한 뒤 15초 뒤에 임시 인스턴스를 내린다. 두 인스턴스가 10~20초 같은 `data/` 폴더를 쓴다. 본 인스턴스가 재시작하는 5~8초 동안 nginx는 `backup`인 임시 인스턴스로 요청을 넘기므로, 임시 인스턴스는 실제 사용자 요청도 받는다.

현재 구조에서 잃는 경우는 둘이다.

1. **기프티콘** (`GifticonStore.java`): 읽을 때마다 파일을 새로 읽지만 `synchronized`는 JVM 안에서만 막는다. 두 프로세스가 같은 순간 `issue`하면 둘 다 같은 빈 자리를 집어 같은 코드를 두 사람에게 준다. 클래스 주석이 "단일 인스턴스이므로 잠금 하나면 충분하다"고 적은 전제가 깨졌다. 2026-09-02에 같은 링크가 두 사람에게 나간 적이 있어 금전 피해로 이어진다.
2. **푸시 상태** (`PushStateStore.java`): 생성자에서 한 번 읽은 `state`를 메모리에 두고 바뀔 때마다 통째로 `.tmp`에 써서 옮긴다. 다른 프로세스가 그 사이에 쓴 구독, 토큰, 배달 기록은 다음 `save()`에서 사라진다. 동시에 쓰지 않아도, 임시 인스턴스가 뜬 뒤 본 인스턴스가 쓴 내용을 임시 인스턴스의 다음 쓰기가 덮는다.

하루 방문이 수백 명이라 겹칠 확률은 낮다. 그래도 기프티콘은 한 번 틀리면 되돌릴 수 없어서 고친다.

## 임시 인스턴스가 푸시 상태 파일을 쓰는가 (코드로 확인)

이슈는 "임시 인스턴스는 푸시 발송을 꺼 두므로 쓰지 않는다고 본다"고 했다. 코드를 읽은 결과, **그렇게 말할 수 없다.**

임시 인스턴스는 `DISCOUNT_PUSH_ENABLED=false`로 뜬다(`api/deploy/prod/README.md`). `PushProperties.configured()`는 `enabled && 공개키 && 비공개키 && statePath != null`(`PushProperties.java:34`)이고, `PushStateStore.save()`는 `statePath == null`일 때만 건너뛴다(`PushStateStore.java:229`). 즉 `enabled`는 저장을 막지 않는다. `configured()`를 확인하는 곳과 안 하는 곳은 다음과 같다.

| 진입점 | `configured()` 확인 | `store`에 쓰나 |
|---|---|---|
| `NewOfferNotificationService` 스케줄러 (`:51`) | 한다. false면 돌아감 | 안 씀 |
| `PushSubscriptionController.subscribe` (`:35`) | 한다. 503 | 안 씀 |
| `PushSubscriptionController.unsubscribe` (`:51`) | **안 한다** | `remove` → `save()` |
| `PushTrackingController.displayed/clicked` | **안 한다** | `track` → `save()` |
| `BrandController` reload → `BannerNotificationService.onReload` (`:47`) | **안 한다** | `observe` → `save()` |

결론은 다음과 같다.

- 세 진입점(구독 해지, 알림 노출과 클릭 추적, 배너 reload)은 `enabled=false`여도 `statePath`가 설정돼 있으면 상태 파일을 쓴다. 임시 인스턴스는 `backup`으로 실제 요청을 받으므로 해지와 추적 요청이 거기로 가면 쓴다.
- 임시 인스턴스의 `DISCOUNT_PUSH_STATE_PATH`가 비어 있는지는 환경 파일이 비공개 운영 저장소에 있어 이 저장소에서 확인할 수 없다. 비어 있으면 위 세 경로도 쓰지 않는다.
- 그래서 "임시 인스턴스는 쓰지 않는다"에 기대지 않는다. 락과 재읽기로 쓰더라도 잃지 않게 만든다. 이것이 이 설계의 전제다.
- 기프티콘 쪽은 `enabled` 같은 끔 장치가 없다. 설문 요청(`SurveyService` → `GifticonStore.issue`)이 임시 인스턴스로 가면 그대로 쓴다. 이슈 본문의 "기프티콘 영향이 크다"가 맞다.

## 대안

| 안 | 장점 | 단점 | 선택 |
|---|---|---|---|
| A. 잠금 파일 + 락 안에서 재읽기 | 두 프로세스를 같은 규칙으로 막는다. 형식 불변 | 쓸 때마다 파일을 한 번 더 읽는다 | **선택** |
| B. 병합 쓰기(락 없이 읽고, 합치고, 쓰기) | 락 불필요 | 합칠 때와 옮길 때 사이가 비어 있어 여전히 잃는다. 삭제 병합이 모호하다 | 버림 |
| C. 임시 인스턴스에서 쓰기 경로를 끔 | 간단 | 임시 인스턴스가 받는 해지, 추적 요청을 버린다. 기프티콘은 끌 수 없다. 본 인스턴스가 재시작 직전에 쓴 것과의 낡음 문제는 남는다 | 보조로만 검토(열린 질문 1) |
| D. DB로 옮김 | 근본 해결 | 범위가 큼. ADR-001의 파일 방식을 뒤집음 | 범위 밖 |

### 락 방식

- `<데이터 파일>.lock`을 `FileChannel.open(CREATE, WRITE)`로 열어 `FileChannel.lock()`을 쓴다. 데이터 파일 자체에는 걸지 않는다. 데이터 파일은 `Files.move`로 교체되어 inode가 바뀌므로, 옛 inode에 건 락은 새 파일을 지키지 못한다.
- 같은 JVM의 두 스레드가 `lock()`하면 `OverlappingFileLockException`이 난다. 그래서 경로별 `ReentrantLock`을 JVM 전역 맵에 두고, 그것을 먼저 잡은 뒤 OS 락을 잡는다. 같은 경로의 저장소 객체가 둘이어도(테스트) 안전하다.
- 기다림은 `tryLock()`을 짧게 반복하다 5초에서 포기한다. 포기하면 푸시 저장소는 `UncheckedIOException`(기존 `save()` 실패와 같은 종류), 기프티콘은 `Optional.empty()`와 오류 로그다(기존 쓰기 실패와 같은 처리: 코드를 내주지 않는다).
- 프로세스가 죽으면 OS가 락을 풀어 준다. 잠금 파일은 지우지 않는다.

## 변경

### 새 클래스: `api/src/main/java/com/discounttracker/storage/InterProcessFileLock.java`

두 저장소가 함께 쓰는 작은 도구다. 새 패키지 이름은 구현자가 기존 패키지 규칙(ADR-002)에 맞춰 바꿔도 된다.

```java
public final class InterProcessFileLock {
    public static <T> T withLock(Path lockFile, Duration timeout, IOAction<T> action) throws IOException
}
```

경로별 JVM 락, OS 락의 순서를 지키고 `finally`에서 반대로 푼다.

### `GifticonStore`

- `issue`: `withLock(<gifticons.yml>.lock)` 안에서 `issuedTo` 확인, `read`, 표시, `write`, `recordIssue`를 한다. 지금은 `issuedTo`가 `issue` 앞에서 따로 읽는데, 락 밖이면 확인과 쓰기 사이가 열린다. 락 안으로 옮긴다.
- `write`: `Files.move`에 `ATOMIC_MOVE`를 더한다(`PushStateStore.save`는 이미 쓴다). 락 없이 읽는 `remaining`과 `issuedTo`가 반쪽 파일을 보지 않게 한다.
- 락을 못 잡으면 코드를 내주지 않고 로그를 남긴다.
- 클래스 주석의 "단일 인스턴스이므로 이 객체의 잠금 하나면 충분하다"를 현재 사실로 고친다. 이 문장을 남기면 다음 사람이 락을 걷어 낸다.
- 운영자가 `gifticons.yml`을 손으로 교체하는 업로드는 이 락이 막지 못한다. 범위 밖이고 열린 질문 3에 둔다.

### `PushStateStore`

- 고치는 메서드(`upsert`, `remove`, `activeSubscriptions`(비활성화가 생길 때), `deactivate`, `observe`, `markDispatched`, `createToken`, `dailyOffer`(새로 만들 때), `saveDailyOffer`, `markDelivered`, `track`)는 모두 `mutate(Function<State, R>)`를 거친다. `mutate`는 락을 잡고, `refresh()`로 디스크를 다시 읽고, 함수를 적용하고, `save()`하고, 락을 푼다.
- 읽기만 하는 메서드(`pending`, `wasDelivered`)는 락 없이 `refresh()`만 한다. 저장이 원자적 교체라 반쪽을 볼 일이 없다.
- `refresh()`는 파일의 수정 시각과 크기가 지난번과 같으면 다시 읽지 않는다. 신규 오퍼 스케줄러가 1초마다 도는데(`@Scheduled(fixedDelay = 1000)`), 그때마다 파일 전체를 파싱하지 않기 위함이다. 교체는 새 inode가 되므로 수정 시각이 바뀐다. 같은 밀리초에 같은 크기로 교체될 수 있는 경계는 구현자가 `fileKey`를 함께 비교해 닫는다.
- 락 안의 `refresh()`는 시각 비교를 건너뛰고 항상 다시 읽는다. 잠금이 곧 정합성의 근거라서 캐시를 믿지 않는다.
- 다시 읽다가 파일이 깨져 있으면: 기존 `recoverDamagedState`처럼 `.corrupt-<시각>`으로 옮겨 두고, **메모리에 있는 마지막 정상 상태를 유지**한 채 이어 쓴다. 지금 생성자는 빈 상태로 시작하는데, 가동 중에는 메모리가 더 믿을 만하다.
- `Files.createDirectories`는 락 파일을 열기 전에 한다.
- `save()`의 `.tmp` 이름은 프로세스마다 겹친다. 락 안에서만 쓰므로 그대로 둔다. 락 밖에서 `.tmp`를 쓰는 곳이 없어야 한다.

### 락 폭

락은 상태 파일의 짧은 구간(읽기, 고치기, 쓰기)만 잡는다. 웹푸시 전송이나 HTTP 호출을 락 안에서 하지 않는다. `NewOfferNotificationService`와 `BannerNotificationService.dispatch`는 `store` 메서드를 여러 번 부르며 그 사이에 전송하므로, 호출부는 건드리지 않는다. 한 메서드 안의 읽기-고치기-쓰기만 원자적이다.

## 변경 전파

`docs/CHANGE-PROPAGATION.md`에서 찾은 묶음은 5번(알림)이다. 상태 `data/push-state.json`을 보내는 쪽(`BannerNotificationService`)과 이 저장소가 같은 묶음이다.

- 이번 변경은 파일 형식과 칸 이름을 바꾸지 않아서 tracker, beggars-ops(`check_notification_fields`), 웹은 고칠 것이 없다. 묶음의 나머지를 넣지 않아도 되는 이유다.
- 8번(배포 순서)은 API만 바뀌어 순서 문제가 없다.
- **첫 배포 한 번은 보호되지 않는다.** 그 배포 중 본 인스턴스는 아직 옛 jar(락 없음)이고 임시 인스턴스만 새 jar다. 락은 두 쪽이 모두 새 jar일 때부터 지킨다. 이후 배포부터 효과가 있다. 첫 배포가 끝난 뒤 상태 파일과 `gifticon-issues.jsonl`을 한 번 대조한다.
- 새 파일(`InterProcessFileLock`, 시험 도우미)을 더하므로 `python scripts/generate_project_structure.py`로 `docs/PROJECT-STRUCTURE.md`를 다시 만든다(CHANGE-PROPAGATION 9번). 안 하면 push 훅이 막는다.
- 결정 기록: 구현이 끝나면 `api/docs/decisions/ADR-013-...`에 "단일 인스턴스 가정을 버리고 잠금 파일을 쓴다"를 적는다.
- Jackson 3 규칙(ADR-012): `refresh()`의 파싱 오류는 `IOException`이 아니라 `JacksonException`이다. 기존 `load()`처럼 둘 다 잡아야 한다.

## 시험

완료 조건의 "두 프로세스가 같은 파일에 동시에 쓰는 시험"은 **자식 JVM을 실제로 띄우는 시험**이어야 한다. 같은 JVM의 스레드 둘은 프로세스 사이가 아니고, 같은 JVM에서 OS 락을 두 번 잡으면 `OverlappingFileLockException`이 나서 오히려 틀리게 시험된다.

- 시험 도우미 `StoreWorker`(`src/test`의 `main`): 인자로 종류(gifticon 또는 push), 데이터 경로, 방문자 번호, 횟수를 받아 저장소를 만들고 일을 하고 종료한다. 부모 시험은 `ProcessBuilder(System.getProperty("java.home") + "/bin/java", "-cp", System.getProperty("java.class.path"), ...)`로 4개 이상을 동시에 띄우고 `CountDownLatch` 대신 시작 신호 파일로 출발을 맞춘다.
- `GifticonStoreMultiProcessTest`: 코드 40개, 프로세스 4개가 방문자 10명씩 `issue`. 기대: 40명 모두 서로 다른 코드를 받음, `remaining() == 0`, `gifticon-issues.jsonl`이 정확히 40줄, 같은 코드가 두 줄 없음.
- `PushStateStoreMultiProcessTest`: 프로세스 4개가 서로 다른 endpoint 25개씩 `upsert`. 기대: 최종 파일에 구독 100개. `markDelivered`, `createToken`도 같은 방식으로 섞는다.
- **낡은 메모리 시험**(자식 없이 가능): 저장소 A를 만든 뒤 같은 파일을 가리키는 저장소 B가 `upsert`한다. 그다음 A가 다른 endpoint를 `upsert`했을 때 파일에 B의 구독이 남아야 한다. 지금 코드는 이 시험이 빨갛다.
- **먼저 빨강을 본다.** 락 없이 같은 시험이 실패하는 것을 한 번 확인한 뒤 락을 넣는다. 시험이 원래 안 틀리는 구조면 통과가 무의미하다(AGENTS.md "먼저 알 것" 1).
- `InterProcessFileLock` 단위 시험: 같은 JVM 두 스레드가 순서대로 들어간다. 기다림이 5초를 넘으면 예외다. 예외가 나도 락이 풀린다.
- 진입점 고정 시험(`PushStateStoreTest` 옆): `enabled=false`, `statePath` 설정 상태에서 `remove`, `track`, `observe`는 파일을 쓰고 `subscribe`와 스케줄러 경로는 안 쓴다는 위 표를 시험으로 박는다. 나중에 누가 `configured()` 확인을 더하거나 빼면 이 표가 틀어진 것을 안다.
- 시험은 `./gradlew test`가 그대로 돌린다. `src/test`의 새 `*Test.java`는 따로 등록하지 않는다(웹 `*.test.js`와 다름).

## 하지 않는 것

- 웹, 수집기, 콘솔, nginx, 서버 환경 파일은 바꾸지 않는다.
- 파일 형식과 `discount.push.*`, `discount.gifticons-path` 설정은 바꾸지 않는다.
- `events.jsonl`, PostHog 아웃박스 등 다른 파일의 프로세스 간 안전은 다루지 않는다(열린 질문 2).

## 열린 질문

1. 임시 인스턴스의 해지와 추적, reload 쓰기를 `configured()` 확인으로 끄는 보조 조치(대안 C)를 이번에 함께 할까. 끄면 임시 인스턴스가 받은 해지 요청이 사라진다. 락만으로 안전하므로 기본은 하지 않는다.
2. `events.jsonl`과 PostHog 아웃박스도 같은 문제가 있는가. 이 설계는 두 저장소만 다룬다. 짝 이슈 #189에서 다루는 범위인지 확인이 필요하다.
3. 운영자가 `gifticons.yml`을 서버에서 직접 올리는 절차에 잠금 파일을 잡는 단계를 넣을까. 안 넣으면 업로드 순간 발급과 겹칠 수 있다. 업로드 도구는 비공개 저장소에 있다.
4. **임시 인스턴스의 `DISCOUNT_PUSH_STATE_PATH`가 비어 있는지** 운영 저장소 환경 파일에서 확인이 필요하다. 이 설계는 어느 쪽이어도 맞지만, 비어 있으면 위 표의 세 경로는 실제로는 쓰지 않는다.

## 변경 이력

- 2026-10-28: 승인 전 이슈 댓글로 열린 질문이 풀렸다. (1) 대안 C(임시 인스턴스 쓰기 끄기)는 하지 않는다. (2) `events.jsonl`은 구현 중 확인한 결과 `APPEND` 전용(`EventLog`, `ReportController`)이라 이번 범위 밖이다. (3) `gifticons.yml` 직접 업로드는 범위 밖이다. (4) 환경 파일에 `DISCOUNT_PUSH_STATE_PATH`가 있고 임시 인스턴스가 덮어쓰지 않아, 해지, 추적, reload는 실제 상태 파일을 쓴다. 설계의 전제가 맞다.
- 2026-10-28: 구현에서 락 도우미 패키지를 `com.discounttracker.storage`로 했다.
