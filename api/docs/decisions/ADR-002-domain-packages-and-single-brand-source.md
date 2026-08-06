# ADR-002. 도메인 기준 패키지 분리, 브랜드 지식은 brands.yml 단일 출처

- 날짜: 2026-07-29
- 상태: 확정
- 관련: [ADR-001](ADR-001-external-export-path.md),
  [tracker ADR-012](../../../delivery-discount-tracker/docs/decisions/ADR-012-three-repo-split-and-deployment.md)

## 맥락

MVP를 빠르게 만들면서 두 가지가 굳어 있었다.

**1. 브랜드 지식이 두 레포 네 곳에 흩어져 있었다.**

| 무엇 | 어디에 |
|---|---|
| 별칭(같은 브랜드의 다른 표기) | api `brand-aliases.yml` |
| 카테고리 | web `App.jsx`의 `BRAND_CATEGORY` (60줄) |
| 땡겨요 바로가기 | web `App.jsx`의 `DDANGYO_LINKS` (38줄) |
| 로고 | web `public/logos/` |

브랜드 하나를 추가하려면 네 곳을 고쳐야 했고, 카테고리만 바꿔도 프론트를
다시 빌드·배포해야 했다. 더 나쁜 건 조용히 실패한다는 점이다 — 매핑을
빠뜨려도 에러가 없고 그냥 그 브랜드가 필터에서 사라진다.

**2. 패키지가 계층 기준이었다.** `model/`, `service/`, `data/`, `alias/`.
"확정/보류 판정"을 이해하려면 `model`과 `service`를 오가야 했고, 판정
규칙은 서비스의 static 헬퍼로 흩어져 있었다. 상태값도 `"confirmed"` /
`"held"` 문자열이라 `qualifier`("최대")와 혼동해 화면 배지가 잘못 뜬 적이
실제로 있다.

## 판단

**브랜드 지식은 `brands.yml` 하나로 합친다.** 별칭·카테고리·바로가기를
한 파일에 두고, API가 응답에 실어 프론트로 내려보낸다.

**패키지는 도메인으로 나눈다** — `brand/`, `offer/`, `comparison/`, `web/`.
판정 규칙은 그 규칙이 속한 타입이 갖는다(`OfferRecord.status()`,
`Offer.preferredOver()`, `BrandComparison.byBestDiscount()`).

**상태는 enum으로 만든다**(`OfferStatus`). `qualifier`와 직교한다는 걸
타입으로 못박는다 — 확정이면서 "최대"일 수 있다(땡겨요).

## 근거

- 브랜드 추가는 이 프로젝트에서 **가장 자주 하는 변경**이다. 그게 네 군데
  수정에 프론트 재배포까지 필요하다는 건 구조가 잘못됐다는 뜻이다.
- 카테고리·바로가기는 화면 표현이 아니라 **브랜드에 대한 사실**이다.
  프론트에 있을 이유가 없었다. 프론트는 받은 걸 그리기만 하면 된다.
- 도메인 패키지는 이 크기(파일 12개)에서도 이득이다. "브랜드를 어떻게
  묶나?"는 `brand/`만 보면 되고, 정렬 규칙을 바꾸려면 `comparison/`만
  열면 된다.

## 대가

- 응답 스키마가 프론트와의 계약이 되므로 함부로 못 바꾼다. 내부 표현
  (`Brand` 중첩 객체, `maxHeldAmount`)이 새 나가지 않도록 `@JsonIgnore`로
  막고, 그 모양을 테스트로 고정했다
  (`BrandControllerTest.brandResponseKeepsFlatContract`).
- `brands.yml`이 커진다(현재 73개 브랜드, 약 200줄). 사람이 읽고 고치는
  파일이라 카테고리별로 묶어 정렬해뒀다. 수백 개로 늘면 DB를 봐야 한다.
- 프론트가 API에 더 의존한다 — 전엔 API가 죽어도 카테고리 목록은 떴다.
  어차피 데이터가 없으면 화면이 의미 없으므로 실질적 손해는 아니다.

## 뒤집을 조건

브랜드가 수백 개가 되어 YAML을 사람이 관리 못 하게 되거나, 브랜드
메타데이터를 화면에서 편집해야 할 때. 그때는 `BrandCatalog`의 인터페이스는
그대로 두고 뒤를 DB로 바꾸면 된다 — 그러라고 카탈로그로 감싸뒀다.
