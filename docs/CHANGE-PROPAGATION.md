# 변경 전파 명세

한 곳을 고치면 같이 고쳐야 하는 자리들의 목록이다. 작업 전에 여기서 내가 건드릴
자리를 찾고, 같은 줄에 적힌 나머지를 함께 고쳤는지 확인한다.

## 이 문서가 부르는 것

| 말 | 뜻 |
| --- | --- |
| 결합(coupling) | 두 자리가 같이 움직여야 하는 관계. 이름, 값, 순서로 묶인 결합을 커네선스(connascence)라 한다 |
| 동반 변경 묶음(co-change cluster) | 실제로 늘 같이 바뀌는 파일 묶음. 이 문서의 표 한 줄이 그것이다 |
| 폭발 반경(blast radius) | 한 변경이 닿는 범위 |
| 변경 증폭(change amplification) | 한 가지를 고치려고 여러 곳을 고쳐야 하는 정도. 클수록 설계가 나쁘다 |

묶음을 없애는 것이 이상이다. 못 없앨 때만 여기 적는다. 적는 순간 그 묶음은
"알려진 빚"이 되고, 줄이는 것이 다음 설계의 목표다.

## 읽는 법

**끊기면 무엇이 보이나**를 꼭 읽는다. 대부분의 사고는 묶음의 절반만 고쳐서 났고,
테스트는 초록이었다. 그 칸이 "초록인데도 틀린 모습"을 적은 자리다.

---

## 1. 확실성 판정 (certainty)

무엇이 최고 할인 후보로 설 수 있는가.

| 자리 | 파일 |
| --- | --- |
| 판정 본체 | `api/.../offer/OfferComparison.java` |
| 같은 판정의 웹판 | `web/src/filters.js` (`isBestCandidate`, `comparisonAmount`, `sortingAmount`) |
| 두 쪽이 함께 읽는 판정표 | `docs/contracts/certainty-cases.json` (30가지) |
| 원장 표기와의 다리 | `api/.../offer/Certainty.java#fromQualifier`, 원장 값은 tracker `schema.py`의 `ALLOWED_QUALIFIERS` |

- **묶인 이유**: 정렬은 서버가, 배지는 웹이 정한다. 규칙이 하나인데 실행하는 곳이 둘이다.
- **끊기면**: 카드 순서와 "최고" 배지가 어긋난다. 특정메뉴 쿠폰뿐인 브랜드가 맨 위에 선다.
- **막는 것**: 판정표를 `BannerCertaintyContractTest`(Java)와 `filters.test.js`(JS)가 함께 읽는다. 한쪽만 고치면 깨진다.
- **줄이려면**: 웹이 서버가 계산한 값을 그대로 받으면 이 묶음이 사라진다.

## 2. 배너 모양 (banner shape)

배너 한 장이 파일에서 화면까지 가는 길.

| 자리 | 파일 |
| --- | --- |
| 만드는 쪽 | tracker `scripts/banner_routine.py` |
| 올리는 문 | beggars-ops `ops_apply.py` (`BANNER_SCHEMA`, `shape_problem`, `legacy_spec_field_problem`, `check_amount_field`) |
| 읽는 쪽 | `api/.../banner/BannerCatalog.java`, `Banner.java`, `BannerAmount.java` |
| 문구 만드는 쪽 | `api/.../banner/BannerText.java` |
| 그리는 쪽 | `web/src/EventBanner.jsx`, `web/src/bannerTag.js` |

- **묶인 이유**: 같은 칸 이름이 다섯 저장소 위치에 적혀 있다.
- **끊기면**: 배너가 조용히 사라지거나(`toBanner`가 null), 표식이 안 붙거나, 발행이 거부된다. 셋 다 화면을 봐야 안다.
- **실제 사고**: 수집기가 `firstCome`을 안 쓰는데 웹이 그 칸만 읽게 바뀌어 선착순 표식이 사라질 뻔했다(2026-09-24). 따옴표 없는 `startsAt`을 snakeyaml이 `Date`로 만들어 배너가 통째로 버려졌다(2026-09-24).
- **막는 것**: `BannerCatalogTest`의 옛 모양과 새 모양 대조 테스트, ops의 검사 넷.

## 3. 묶음 배너 (group)

여러 브랜드를 한 장으로 그리되 브랜드마다 오퍼를 세운다.

| 자리 | 파일 |
| --- | --- |
| 만드는 쪽 | tracker `banner_routine.propose_ce_ops` (브랜드마다 한 장, 같은 `group`) |
| 접는 쪽 | `BannerCatalog.active()` (`groupAmount`가 구성원 금액을 합쳐 적는다) |
| 안 접는 쪽 | `BannerCatalog.activeMembers()` (오퍼는 여기서 난다) |
| 그리는 쪽 | `web/src/EventBanner.jsx`의 `brands`, `brandLabels` |

- **묶인 이유**: 화면은 한 장, 오퍼는 여럿이라는 두 관점이 같은 자료에서 나온다.
- **끊기면**: 구성원 금액이 다른데 대표 것 하나만 뜬다. 7,000원인 브랜드를 누른 사람이 8,000원인 줄 안다.
- **순서 주의**: 묶음 안 순서는 구성원 `priority`가 정한다. 같은 값을 주면 id 알파벳순이 되어 금액 큰 순서가 뒤집힌다.

## 4. 최소주문 출처 (min order)

| 자리 | 파일 |
| --- | --- |
| 배민 | `banner_routine.brand_min_orders()` (export.json) + `previous_for` |
| 쿠팡이츠 | `banner_routine.ce_min_order()` (export.json, 지난 배너, 쿠폰함 원장) |
| 문장에서 되짚기 | `api/.../banner/Banner.java#effectiveMinOrder` |
| 열린 뒤 대조 | `banner_routine.verify_opened_min_orders()` |

- **묶인 이유**: 같은 숫자를 네 곳이 서로 다른 근거로 안다.
- **원칙**: 지어내지 않는다. 모르면 비우고 화면이 "최소주문 미확인"으로 뜬다.
- **끊기면**: 틀린 문턱이 화면에 뜬다. 없는 것보다 나쁘다.

## 5. 알림 (notification)

| 자리 | 파일 |
| --- | --- |
| 칸을 붙이는 쪽 | tracker `banner_routine.carry_over_open_banners` (`notify`만 잇는다) |
| 창을 재는 쪽 | beggars-ops `ops_apply.check_notification_fields` (07:00~22:00) |
| 보내는 쪽 | `api/.../push/BannerNotificationService.java` |
| 상태 | 서버 `data/push-state.json` |

- **묶인 이유**: `notify`와 `notifyImmediately`가 한 칸처럼 보이지만 성격이 다르다.
- **끊기면**: 즉시 발송을 기계가 이으면 새벽 실행 제안이 **통째로** 반려된다. 한 건이 아니라 묶음 전부다(2026-09-24 05:26, 아홉 건).
- **규칙**: 창 숫자는 서버 한 곳에만 둔다. 언제 보낼지는 사람이 정한다.

## 6. 화면에 나가는 글자 (copy)

| 자리 | 파일 |
| --- | --- |
| 규칙 | `docs/COPY-STYLE.md` |
| 원장 검사 | tracker `schema.validate_record(..., user_facing_copy=True)` |
| 배너 검사 | beggars-ops `ops_apply.COPY_FIELDS`, `COPY_FORBIDDEN` |
| 만드는 쪽 | `api/.../banner/BannerText.java` |
| 라벨 | `web/src/platforms.js` (`OWN_LABEL`, `MEMBERSHIP_LABEL`) |

- **규칙**: 새 문구는 세션이 정하지 않는다. 넣는 것이 맞는지, 어떤 문구인지 개발자에게 묻는다.
- **끊기면**: 수집기 말("확인", "미확인", "판독")이 사용자 화면에 샌다. 2026-09-03, 09-07, 09-18에 실제로 났다.

## 7. 행동 이벤트 (analytics)

| 자리 | 파일 |
| --- | --- |
| 쏘는 쪽 | `web/src/**` 의 `track(...)` |
| 받는 쪽 | `api/.../analytics/EventController.java`의 `ALLOWED_EVENTS` |
| 대조 | `web/scripts/verify-analytics-event-contract.mjs` |

- **끊기면**: 새 이벤트가 조용히 버려진다. 화면은 멀쩡하고 수치만 안 쌓인다.
- **막는 것**: 대조 스크립트가 양쪽 목록을 맞댄다. 빠진 쪽도 남는 쪽도 잡는다.

## 8. 저장소 경계와 배포 순서

| 무엇 | 어디로 | 언제 |
| --- | --- | --- |
| `mono/api` | `nn98/delivery-discount-api` | main 푸시 시 미러 |
| `mono/web` | `nn98/delivery-discount-web` → Vercel | main 푸시 시 미러 |
| beggars-ops | 서버 직접(Actions) | main 푸시 시 |
| tracker | 배포 없음. 미니PC에서 돈다 | |

- **순서**: API가 먼저, 웹이 나중. 반대로 하면 새 웹이 옛 응답을 읽어 정렬이 풀리고 배너 표식이 사라진다(2026-09-24 실측).
- **tracker와 mono는 별도 저장소다.** 둘 다 푸시해야 한다.
- **tracker `store.py`는 `mono/tracker/store.py`에 사본이 있다**(ADR-018). 테스트가 대조한다.
- **웹 변경은 프리뷰 먼저**: 브랜치 → 미러 `preview/<이름>` → Vercel → 승인 → main. 360px로 찍어 본다.

## 9. 새 파일을 더할 때

- `mono/docs/PROJECT-STRUCTURE.md`를 다시 만든다(`python scripts/generate_project_structure.py`). 안 하면 푸시 훅이 막는다.
- `web/src/*.test.js`는 `web/package.json`의 `test` 사슬에 넣는다. 안 넣으면 안 돌고, 안 도는 줄도 모른다.
- beggars-ops `web/`에 파일을 더하면 배포 목록 두 곳(`.github/workflows/deploy.yml`, `deploy/push.sh`)에 같이 넣는다. 빠지면 콘솔이 통째로 안 뜬다.
- `/ops/` 아래 새 확장자는 nginx `types`에 넣는다. 없으면 `application/octet-stream`으로 나가고 모듈 스크립트는 MIME 검사에 걸려 안 돈다(2026-09-24).

## 이 문서를 고칠 때

묶음을 하나 줄였으면 그 줄을 지운다. 새 사고가 나면 그 사슬을 한 줄 더한다.
"끊기면 무엇이 보이나"를 빼고 적지 않는다 — 그 칸이 없으면 다음 사람이 이 표를
읽고도 절반만 고친다.
