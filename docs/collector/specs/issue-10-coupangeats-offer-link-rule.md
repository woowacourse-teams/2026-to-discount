<!-- 원본: tracker docs/specs/issue-10-coupangeats-offer-link-rule.md — 여기서 고치지 않는다 -->
# 설계: 쿠팡이츠 오퍼 링크 규칙을 하나로 (이슈 #10)

- 상태: 설계 (구현 전)
- 영역: **export** (이 PR의 범위). 폰이 필요한 수집 입구 쪽은 "하지 않는 것"에서 이슈를 나눈다.
- 읽은 것: `export_data.py` `build_export`(425~460행)와 `main`(719~736행), `capture/coupangeats_share.py`, `scripts/offer_link_check.py` `link_for`, `mono/web/src/offerLink.js`, `tests/test_coupangeats_hub_tabs.py`.

## 1. 지금 코드가 하는 일 (이슈 본문과 맞춰 본 것)

링크가 정해지는 자리는 이슈가 말한 셋이 맞고, 하나 더 있다.

1. `build_export` 445~460행: 원장 행의 `hub_tab.link`이 있으면 그대로, 없으면 `hub_tabs`(원장 전체에서 모은 탭 링크)에서 월간 → (브랜드, 금액) → 브랜드 순으로 빌린다. 빌리는 쪽만 최신 주차로 걸렀다(`6839762`).
2. `main` 733행: 위에서 `coupangeats://`가 안 나온 쿠팡이츠 오퍼에 `CE_OFFER_FALLBACK_LINK`를 채운다.
3. 웹 `offerLink.js` 175행: `coupangeats://`가 아니면 `COUPANGEATS_LINK`로 연다.
4. **(이슈에 없던 것) 자기 탭 링크는 주차 검사를 안 받는다.** 452행의 `record.hub_tab.link`은 `_hub_week` 필터 전에 쓰인다. 어제 허브에서 본 행이 승자로 남고 이번 주 허브에서 안 보인 브랜드면, 지난 주차 탭 링크가 그대로 나간다. `6839762`는 빌리는 길만 막았다.

그래서 "같은 쿠폰, 다른 링크"는 빌리는 길이 아니라 **자기 것은 검사 없이, 빌린 것만 검사하는 비대칭**에서 나온다. 규칙을 하나로 만든다는 것은 이 비대칭을 없애는 것이다.

## 2. 결정

### 2.1 링크 규칙 하나 (우선순위 고정)

수집 경로(허브 탭, 쿠폰함, 행사 카드)를 보지 않는 함수 하나로 옮긴다. `export_data.py` 안에 `coupangeats_offer_link(record, human_links, week_tabs)`로 둔다(새 모듈은 만들지 않는다. 쓰는 곳이 `build_export` 하나다).

| 순서 | 출처 | 조건 |
| --- | --- | --- |
| 1 | 사람 링크 `brands.yml` `links.coupangeats` | 있으면 이긴다. 배민 `links.baemin`과 같은 자리, 같은 우선순위 |
| 2 | 이번 주 허브 탭 링크 | 원장의 `hub_tab.link` 전부(자기 것 포함)를 한 표에 모으고, **이번 주 것만** 남긴 표에서 월간 → (브랜드, 금액) → 브랜드 순으로 찾는다 |
| 3 | 공유 링크 | `main`이 채우는 `CE_OFFER_FALLBACK_LINK`. 지금과 같다 |

자기 탭 링크도 표에 들어가 같은 걸러짐을 받는다. 표에서 (브랜드, 금액)을 먼저 찾으니 허브에서 읽힌 행도 대개 자기 탭이 나온다. 같은 쿠폰이면 읽은 경로와 상관없이 같은 링크다. 이게 이슈 제목의 요구다.

### 2.2 "이번 주"의 기준을 원장이 아니라 공유 링크 키로

지금 `week`는 원장에서 가장 최근 허브 탭 링크의 주차다(439행). 오늘 허브 수집이 실패했거나 허브를 못 읽은 날에는 **지난 주 허브가 "이번 주"가 된다.** 걸러짐이 통과로 바뀌는 자리라 AGENTS.md 1번에 걸린다.

- `main`은 이미 `share_link_fresh(share)`로 공유 링크가 푸는 허브 키를 네트워크로 확인한다(727행). 그 키의 주차(`_hub_week`)를 **이번 주의 정본**으로 쓴다.
- `build_export(..., current_week=None)` 인자로 받는다. 안 주면(테스트, 오프라인) 원장 최대 주차로 폴백하되, 그 사실을 반환값이 아니라 `print`가 아닌 **경고 줄**로 남긴다: `허브 주차를 원장에서 추정했다`.
- 공유 링크 키가 `V5_..._<MMDD>_HL` 모양이 아니라 주차를 못 뽑으면 빌리기를 **끄고**(탭 없이 3번으로) 경고한다. 모르는 주차를 최신으로 치지 않는다.

### 2.3 사람 링크 자리

- `brands.yml`에 `links.coupangeats`를 허용한다. 값은 `https://share.coupangeats.com/...` 또는 `coupangeats://...`.
- `scripts/offer_validate_l0.py` 138행, `scripts/brands_file.py`, `scripts/catch_link.py`가 `links:` 블록을 이미 다룬다. 구현자는 이 셋이 `coupangeats` 키를 거부하거나 지우지 않는지 확인한다(`scripts/link_targets.py`가 앱별 순회를 하는지 포함).
- **웹이 사람의 https 링크를 무시한다.** `offerLink.js` 175행은 `coupangeats://`로 시작할 때만 `offer.link`를 쓰고 나머지는 `COUPANGEATS_LINK`로 덮는다(108행은 `https://share.coupangeats.com/`를 알아보지만 175행이 먼저 막는다). 그래서 tracker만 고치면 사람 링크가 export.json에는 실려도 화면에서는 안 열린다. **mono 웹 변경이 필요하다**(별도 mono 이슈, 프리뷰 먼저 규칙). 이 저장소의 `mono/`는 읽기용이라 여기서 고치지 않는다. tracker 쪽은 사람 링크가 `coupangeats://`일 때만 효과가 있다는 것을 알고 먼저 병합해도 안전하다(공유 링크가 오면 웹이 폴백으로 같은 결과).

### 2.4 비판: 상수를 나누지 않는다

이슈의 "상수 분리" 후보에는 반대한다.

- 웹 폴백과 수집 입구는 둘 다 "이번 주 허브 입구"이고, 사람이 주마다 한 번 바꾼다. 둘을 나누면 주마다 손이 두 번 가고 하나가 낡아도 아무도 모른다(오늘 같은 사고가 입구 쪽에서 난다).
- 실제 사고는 상수가 둘을 겸해서가 아니라 **테스트가 옛 값을 박아 둔 것**(`c27dd82`)이었다. 그건 테스트로 막는다(아래 T6).
- "폰에서 공유 버튼으로 받은 링크를 입구로" 쓰는 안은 `scripts/coupangeats_share_link.py`가 이미 폰이 읽은 값과 상수를 견주어 `[suspect]`를 낸다(144행). 입구를 폰 값으로 바꾸려면 폰 시험이 필요하니 이 PR에서 뺀다.

## 3. 폭발 반경

CHANGE-PROPAGATION.md에서 링크 항목을 찾았으나 쿠팡이츠 오퍼 링크 줄은 표에 **없다**(`쿠팡이츠`가 든 줄은 126행 `ce_min_order` 하나). 그래서 코드에서 직접 쟀다.

| 자리 | 넣는가 | 이유 |
| --- | --- | --- |
| `export_data.py` `build_export`, `main` | 넣는다 | 규칙의 자리 |
| `tests/test_coupangeats_hub_tabs.py`, `tests/test_export_data.py` | 넣는다 | 새 규칙 테스트, 옛 테스트 정리 |
| `scripts/offer_link_check.py` `link_for` | 넣는다 | `offer["link"]`을 읽는 점검기. 사람 링크(`https://share...`)가 오면 지금은 `hub`로 떨어져 사람 링크를 점검하지 않는다. `hub-tab`과 같이 `brands.yml`/`share` 출처로 검사하게 한다 |
| `scripts/offer_validate_l0.py`, `brands_file.py`, `catch_link.py` | 확인만 | `coupangeats` 키 거부 여부. 거부하면 넣는다 |
| mono `web/src/offerLink.js` 175행 | **안 넣는다**(별도 mono 이슈) | 읽기용 체크아웃. 프리뷰 먼저 규칙. 사람 링크가 https일 때만 필요하다 |
| mono API `OfferRecord.link` | 확인만 | 그대로 내보내는 칸이라 변경 없음 예상. 구현자가 mono 쪽 `link` 검증(스킴 제한)이 https 공유 링크를 막지 않는지 읽는다 |
| `capture/coupangeats_share.py` 입구 | 안 넣는다 | 2.4. 상수를 안 나누므로 변경 없음 |
| 원장 `data/log.jsonl` | 안 건드린다 | 아래 4 |

의존 순서: tracker 병합 → (필요하면) mono 웹. 반대 순서는 안 된다. mono가 먼저면 웹이 모르는 링크를 기다린다. 이 PR은 mono에 의존하지 않는다.

## 4. 원장 append-only

원장은 쓰지 않는다. 2026-10-12~16에 `key=` 안에 허브 주소가 겹친 옛 탭 링크도 지금처럼 내보낼 때 펴기만 한다(460행의 정규식은 새 함수 안으로 옮기되 출력은 같다. 원장 행 수정 없음). 새 정보(사람 링크)는 `brands.yml`에만 둔다.

## 5. "없다 / 0 / 통과"의 양성 신호

| 자리 | 지금 "없다"가 뜨는 때 | 양성 신호 |
| --- | --- | --- |
| 이번 주 탭 없음 → 공유 링크 폴백 | 허브 수집이 실패한 날도, 정말 이번 주 허브에 없는 브랜드도 똑같이 "탭 없음" | `current_week`가 **공유 링크 키에서** 왔는지(2.2). 그리고 이번 주 표가 비어 있으면(오늘 허브 탭을 하나도 못 봤다) 경고에 "이번 주 허브 탭 0건"이라고 따로 적는다. 브랜드가 없는 것과 허브를 못 본 것을 가른다 |
| 주차 필터 통과 | `_hub_week(link) == None`인 링크(예: `coupangeats://tab2`)는 필터에서 조용히 빠진다 | 빠진 건수를 센다. 쿠팡이츠 오퍼 중 주차 없는 앱 링크가 있으면 경고 |
| 출력 검사 | 위가 맞았다고 믿고 지나감 | 반환 직전 `coupangeats://` 링크를 달고 나가는 모든 오퍼의 주차가 `current_week`와 같은지 한 번 더 센다. 다르면 `build_export`가 `RuntimeError`가 아니라 **그 링크만 떼고** 경고(전체 배포를 막지 않는다. 오늘 사고는 링크 하나가 틀린 것이지 오퍼가 틀린 게 아니다) |

경고는 `main`이 찍는 한 줄 요약(`쿠팡이츠 링크: 사람 N / 이번 주 탭 N / 공유 N / 지난 주차 제거 N`)에 모은다. 숫자만 보지 말고 제거된 브랜드 이름을 같이 찍는다(AGENTS.md: 숫자가 아니라 내용을 읽는다).

## 6. 테스트 (결론을 박는 곳)

`tests/test_coupangeats_hub_tabs.py`에 추가한다. 이름은 구현자가 정한다.

- **T1 경로 불변**: 같은 (브랜드, 금액)을 (a) `hub_tab` 있는 허브 행, (b) 허브 행 없이 쿠폰함 행만 둔 원장으로 각각 `build_export`하면 `link`가 **같다**(이번 주 허브 탭이 원장 어딘가에 있을 때).
- **T2 자기 링크도 주차 검사**: `hub_tab.link`이 10-12 주차인 승자 행 + `current_week="1019"` → 출력에 `1012`가 없다. (지금 코드가 실패하는 테스트다. 먼저 빨갛게 확인한다.)
- **T3 우선순위**: `links.coupangeats` 사람 링크가 있으면 이번 주 탭 링크보다 이긴다. 사람 링크가 없으면 탭, 탭도 없으면 공유 링크(`main` 경유).
- **T4 주차 정본**: `current_week`를 안 주면 원장 최대 주차로 폴백하고 경고가 나온다. 주차를 못 뽑는 키면 빌리기가 꺼진다.
- **T5 허브 미관측과 브랜드 부재를 가른다**: 이번 주 탭 0건인 원장에서 경고 문구가 "이번 주 허브 탭 0건"을 담는다.
- **T6 상수 박제 금지**: `tests/` 아래 어느 파일에도 `share.coupangeats.com/<ID>` 리터럴이 없다(소스를 문자열로 훑는 테스트. 허용 목록은 "만료 링크" 테스트용 가짜 ID 한두 개를 명시). `c27dd82` 재발 방지.
- **T7 점검기**: `link_for`가 사람 링크(`links.coupangeats`)를 출처 `brands.yml`로 돌려준다.

옛 `test_coupangeats_hub_tabs.py` 137행 테스트(`6839762`)는 T1/T2가 포함하니 지우지 않고 그대로 두되, 단언이 새 규칙과 겹치면 합친다.

## 7. 사용자에게 물을 것 (구현 전 확인)

- **`9hxKHM87k7b`는 허브(와우 라운지)로 가는 공유 링크다.** 2026-10-22 풀어 본 결과 `9hxKHM87k7b`와 `AA8dvNb8k7b`는 둘 다 `V5_WOW_LOUNGE_1019_HL`로 열린다. 이 설계에서 허브와 와우 라운지는 같은 곳으로 본다. 두 링크는 `COUPANGEATS_LINK`(허브 공유 링크)와 같은 역할이고, 브랜드 쿠폰 링크가 아니다. **이 값은 이 PR에 넣지 않는다.**
- 사람 링크의 수명. 허브 링크가 아니라 브랜드 링크면 주차가 없어 낡아도 검사로 못 잡는다. `offer_link_check.py`가 이미 매일 링크를 열어 보니 그 점검기에 `links.coupangeats`를 태우는 T7로 충분한지.

## 8. 하지 않는 것 (이슈를 나눌 것)

1. 수집 입구를 폰에서 받은 링크로 바꾸기 (collect, 폰 시험 필요, 2.4에서 반대).
2. mono `offerLink.js` 175행이 `https://share.coupangeats.com/` 오퍼 링크를 쓰게 하기 (mono, 프리뷰).
3. "언제부터 몇 건이었나" 세기. 원장은 `section`/`hub_tab`만 있고 내보낸 값이 없어 원장으로는 못 센다. 과거 export.json이 남아 있으면 그걸로 센다. 이번 수정의 전제는 아니다.

## 9. 범위 점검

한 PR에서 리뷰 가능한 크기다: `export_data.py` 한 함수 추출과 인자 하나, `link_for` 분기 하나, 테스트 일곱. 영역은 폰이 필요 없는 `export`이다.
