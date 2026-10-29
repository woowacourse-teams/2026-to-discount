# ADR-013. 단일 인스턴스 가정을 버리고 잠금 파일의 OS 락을 쓴다

- 날짜: 2026-10-28
- 상태: 확정
- 관련: 이슈 #192, PR #188(무중단 배포), [ADR-001](ADR-001-external-export-path.md), 설계 `docs/design/192-inter-process-file-lock.md`

## 결정

푸시 상태(`PushStateStore`)와 기프티콘(`GifticonStore`)의 읽기-고치기-쓰기는 `<데이터 파일>.lock`의 OS 락(`InterProcessFileLock`) 안에서 한다.

- 데이터 파일 자체에는 락을 걸지 않는다. `Files.move`로 교체되어 inode가 바뀌므로 옛 inode의 락은 새 파일을 지키지 못한다.
- 같은 JVM의 스레드는 경로별 `ReentrantLock`을 먼저 잡는다. 같은 JVM에서 OS 락을 두 번 잡으면 `OverlappingFileLockException`이 난다.
- 대기는 5초에서 포기한다. 푸시 상태는 `UncheckedIOException`, 기프티콘은 코드를 내주지 않고 `Optional.empty()`.
- 푸시 상태는 락 안에서 디스크를 다시 읽고 고친다. 시작 때 읽은 메모리를 통째로 쓰면 다른 프로세스의 변경을 지운다.
- 파일 형식은 바꾸지 않는다.

## 배경

무중단 배포(#188)로 10~20초 동안 인스턴스 둘이 같은 `data/` 폴더를 쓴다. 임시 인스턴스는 `DISCOUNT_PUSH_ENABLED=false`여도 구독 해지, 알림 추적, 배너 reload에서 상태 파일을 쓴다(`PushStateWriteEntryPointTest`가 고정). 기프티콘에는 끄는 장치가 없다. 이전 `GifticonStore` 주석의 "단일 인스턴스이므로 잠금 하나면 충분하다"는 전제가 깨졌다.

## 버린 것

- 락 없는 병합 쓰기: 합칠 때와 옮길 때 사이가 비어 있어 여전히 잃는다.
- 임시 인스턴스의 쓰기 경로 끄기: 해지 요청을 버린다.
- DB 이전: 범위가 크다.

## 남은 것

- 운영자가 `gifticons.yml`을 직접 교체하는 업로드는 이 락이 막지 못한다.
- `events.jsonl`은 `APPEND`로만 쓴다(`EventLog`, `ReportController`). 이번 범위 밖.
- 첫 배포 한 번은 본 인스턴스가 옛 jar라 보호되지 않는다. 그 뒤 상태 파일과 `gifticon-issues.jsonl`을 대조한다.
