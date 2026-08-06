# ADR-007. classpath export.json 스냅샷을 커밋해 테스트 픽스처로 쓴다

- 날짜: 2026-07-30
- 상태: **대체됨** — [ADR-009](ADR-009-synthetic-fixture-over-production-snapshot.md) (2026-08-06)

> 이 결정의 전제 두 개가 모두 깨졌다. 저장소가 public이 됐고("private이라
> 노출 리스크 없다"가 무효), "브랜드 구성이 크게 바뀔 때마다 다시 복사해
> 커밋하는 습관"은 끝내 생기지 않아 스냅샷이 07-29(107건, 13필드)에서
> 멈췄다. 아래 "대가 / 향후 조치"가 그대로 실현된 셈이다.

## 맥락

`BrandControllerTest`는 `@SpringBootTest`로 앱을 기본 설정 그대로 부팅해
`GET /api/brands`가 실 데이터 최소 1건 이상을 돌려준다고 가정한다
(`getBrandsReturnsList`, `brandResponseKeepsFlatContract`,
`brandResponseCarriesCatalogFields`).

기본 설정의 `discount.export-path`는 `classpath:data/export.json`인데,
이 경로(`src/main/resources/data/export.json`)는 `.gitignore`돼 있어
저장소에 커밋된 적이 없다. 로컬 개발자는 README의 안내대로
`delivery-discount-tracker`에서 만든 `export.json`을 이 경로에 직접
복사해두고 작업했기 때문에 각자 PC에서는 파일이 있어 테스트가
통과했지만, fresh clone이나 CI(self-hosted runner)에는 이 파일이 아예
없어 `OfferRepository`가 비고 `/api/brands`가 빈 배열을 반환해 위 3개
테스트가 항상 실패한다.

CI/CD 파이프라인(`.github/workflows/deploy.yml`)을 이 저장소에 새로
추가하면서 발견됨 — 배포 자동화 전에는 아무도 fresh checkout에서
`./gradlew test`를 돌릴 일이 없어 안 드러났던 문제.

## 판단

지금 서버에서 운영 중인 실 데이터(`data/export.json`, 브랜드 107건)를
`src/main/resources/data/export.json`로 그대로 커밋한다. `.gitignore`의
해당 줄은 제거.

- 저장소가 private이고 내용도 배달앱 공개 화면에서 긁은 할인 정보(브랜드명,
  할인액, 캡처 시각, 스크린샷 경로)뿐이라 커밋에 따른 노출 리스크는 없다.
- 테스트 코드는 건드리지 않는다 — 픽스처만 채우면 기존 어서션이 그대로
  통과한다.
- 운영 배포는 영향 없음 — [ADR-001](ADR-001-external-export-path.md)대로
  `DISCOUNT_EXPORT_PATH` 환경변수가 `file:` 절대경로로 classpath 기본값을
  덮어써서 실제로는 이 커밋된 스냅샷을 절대 읽지 않는다.
- 로컬 개발 절차(README `cp data/export.json
  src/main/resources/data/export.json`)도 그대로 유지 — 최신 데이터로
  갱신하고 싶으면 여전히 그 명령으로 덮어쓰면 된다. 안 하면 이 스냅샷이
  기본값으로 쓰인다.

## 대가 / 향후 조치

- 커밋된 스냅샷은 시간이 지나면 실 운영 데이터와 어긋난다(브랜드 추가/
  카테고리 변경 등). **브랜드 구성이 크게 바뀔 때마다** 서버의
  `data/export.json`을 이 경로에 다시 복사해 커밋하는 습관이 필요하다 —
  지금은 수동, 자동화 안 돼 있음.
- 스냅샷이 오래돼 새 브랜드가 안 걸려도 3개 테스트 자체는 계속
  통과한다(최소 1건 존재만 확인) — 즉 이 테스트들은 "죽지 않았다"는
  신호일 뿐 데이터 최신성 보증은 아니다. 최신성이 중요해지면 별도
  방안(예: CI에서 프로덕션 export.json을 주기적으로 동기화) 검토.
