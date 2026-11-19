<!-- 원본: tracker docs/superpowers/specs/2026-10-09-discount-history-design.md — 여기서 고치지 않는다 -->
# 할인 이력과 신규 판정 설계

작성 2026-10-09. 사용자 지시(2026-10-09 01:34~05:43 대화)를 옮긴 것이다.

## 결정 요약

- 신규는 **금액만** 본다. 오퍼 금액이 그 플랫폼의 **직전 수집일** 그 브랜드 최대 금액보다 크거나, 직전 수집일에 그 브랜드 오퍼가 없었으면 신규다. 조건(최소주문, 멤버십 등)은 좋아질 수도 나빠질 수도 있어 판정에서 뺀다.
- 판정은 API 도메인 객체가 오퍼마다 직접 한다(`Offer.isNewAgainst(history)`). 푸시 알림과 웹 표시가 같은 판정을 쓴다.
- 날마다 브랜드와 플랫폼별 **하루 상태**를 파일로 남긴다. "수집이 안 됨", "수집했지만 반영 안 됨(사유별)", "수집했는데 할인 없음"을 가른다. 판정과 그래프는 이 상태만 읽는다.
- 첫 그래프는 **플랫폼 무관 브랜드 최고 할인 금액**의 일자별 변화다. 플랫폼별 선은 다음 단계다.

## 배경

- 2026-10-09 00:41 쿠팡이츠 쿠폰함 단계(5a)가 메뉴 개명으로 실패했다. 그날 내보내기의 청년피자 대표값이 쿠폰함 7,500원에서 허브 10,000원으로 바뀌었고, 직전 내보내기와 견주는 지금 판정(`export_data.apply_first_seen`, `data/offer_seen.json`)이 신규로 잡았다. 10,000원은 09-23부터 원장에 있던 값이다.
- 10-08 이후 신규 16건 중 13건이 최근 14일 원장에 이미 있던 금액이었다.
- 근본 원인: 지금 구조는 "그날 수집이 안 됐다"와 "그날 할인이 없었다"를 구별하지 못한다. 대표값 하나만 견주므로 출처가 하나 빠지면 판정이 흔들린다.
- 신규 판정은 푸시 알림(`NewOfferNotificationService`, `firstSeenAt` 사용)에도 쓰인다. 거짓 신규가 푸시로도 나갈 수 있다.

## 참고한 서비스

| 서비스 | 가져온 것 |
|---|---|
| 폴센트 | 상품별 가격 그래프와 역대 최저가 표시. 알림을 "7일 만에, 14일 만에, 30일 만에 최저가", "역대 최저가"로 나눈다. 여기서는 "N일 만에 최대 할인", "역대 최대 할인"이 된다(요약 칸 `daysSinceHigher`) |
| CamelCamelCamel | 판매 주체별 선, 선마다 최저, 최고, 평균 표시, 1개월부터 전체까지 기간 선택. 플랫폼별 선(2단계)과 `range`에 쓴다 |
| Keepa | 데이터가 없는 구간을 값과 따로 표시해 선을 끊는다. 이 설계의 "미수집"과 "없음"을 가르는 근거다 |

## 하루 상태

브랜드와 플랫폼마다 날짜별로 하나를 정한다.

| 상태 | 뜻 | 그래프 | 신규 판정의 직전 수집일 |
|---|---|---|---|
| `published` 반영 | 수집되어 내보내기에 들어감 | 실선, 점 | 된다 |
| `withheld` 보류 | 수집은 됐지만 반영 안 됨. 사유가 붙는다(아래 표) | 사유별 | 사유별 |
| `uncollected` 미수집 | 그 플랫폼 출처 단계가 실패했거나 돌지 않음 | 직전 금액을 점선으로 잇는다 | 안 된다(건너뜀) |
| `absent` 없음 | 출처 단계가 통과했는데 그 브랜드가 없음 | 선을 끊고 단절 표시 | 된다(그날 없음이므로 다음 등장은 신규) |

### 보류 사유

수집은 된 것이라 선은 잇는다. 무엇으로 잇는지가 사유마다 다르다.

| 사유 코드 | 출처 | 선 | 금액으로 쓰는 값 | 직전 수집일로 |
|---|---|---|---|---|
| `held_human` | reflect: 사람이 오늘 넣은 같은 브랜드 기록이 있어 기계 기록 보류 | 실선 | 사람 기록 금액 | 된다 |
| `duplicate` | reflect: 이미 들어간 같은 관측 | 실선 | 기존 금액 | 된다 |
| `rejected` | reflect: 스키마 거부로 출처 전체 보류 | 점선, 빈 점 | 직전 반영 금액 | 안 된다 |
| `stage_suspect` | reflect: 근거 단계가 PASS가 아니라 출처를 통째로 건너뜀 | 점선, 빈 점 | 직전 반영 금액 | 안 된다 |
| `misread` | 사람 제외(ADR-030): 잘못 읽음 | 점선, 빈 점 | 직전 반영 금액 | 안 된다 |
| `limited`, `duplicate_label` | 사람 제외: 한정 행사, 다른 표기 중복 | 이 오퍼는 선에서 뺀다 | 없음 | 그 오퍼 없이 계산 |
| `expired` | export: 만료 | 선을 끊는다(`absent`와 같음) | 없음 | 된다 |

- 값을 믿을 수 있는 보류(`held_human`, `duplicate`)는 실선이다. 값을 믿을 수 없는 보류는 점선이고 빈 점에 사유를 단다.
- 사람 제외 사유 `targeted`는 타겟딜 브랜드 목록을 없앤 결정(2026-10-09, `c977787`)과 함께 새로 쓰지 않는다. 원장에 남은 옛 값은 `limited`처럼 다룬다.

## 저장

### 날짜별 상태 파일 `data/daily/<날짜>.json`

```json
{
  "date": "2026-10-09",
  "builtAt": "2026-10-09T01:46:10+09:00",
  "stages": {"3": "PASS", "5a": "PASS", "5b": "PASS"},
  "platforms": {"coupangeats": {"collected": true, "sources": ["3", "5b"]}},
  "brands": [
    {"platform": "coupangeats", "brand": "청년피자", "state": "published",
     "max": 10000, "offers": [7500, 10000]},
    {"platform": "baemin", "brand": "BBQ", "state": "withheld", "reason": "stage_suspect",
     "seen": 3000}
  ]
}
```

- 만드는 자리: 8단계 `reflect_daily.py --apply` 끝, 그리고 손으로 다시 반영할 때. 둘이 같은 함수 `scripts/daily_state.py build(date)`를 부른다.
- 입력: 그날 단계 판정(`check_routine`), reflect가 가른 넣음, 보류, 중복, 거부, 내보내기 결과(`export.json`), 사람 제외(원장 `excluded`).
- 원장은 건드리지 않는다. 원장은 관측, 이 파일은 그날 처리 결과다.
- 같은 날 다시 만들면 덮어쓴다. 손 재수집(오늘 5a처럼)도 이 파일을 갱신해야 한다.
- 브랜드 이름은 별칭표 대표명으로 접는다(`scripts/_env_paths.brands_yml()`).

### 이력 묶음 `data/history.json`

- 날짜별 상태 파일 전부를 접은 것. 내보내기 때 함께 만들고 `deploy_export.py`가 같이 올린다.
- 모양: `{"generatedAt", "days": [{date, platform, brand, state, reason?, max}], "coverage": [{date, platforms}]}`.
- 원장 1만 건 기준 수천 줄. 파일 하나로 충분하다. 수만 줄을 넘으면 서버 저장소로 옮긴다.

### 지난 날짜 복원 (07-27~10-08)

- `scripts/daily_state.py backfill`이 원장과 `reports/routine-<날짜>.md`로 상태 파일을 만든다.
- 원장에 그 플랫폼 관측이 있으면 `published`, 보고서에 단계 FAIL이 있으면 `uncollected`, 보고서가 없으면 상태 `unknown`으로 둔다.
- `unknown`은 그래프에서 점선, 판정에서 건너뜀으로 다룬다. 복원한 파일에는 `"backfilled": true`를 단다.
- 원장에 관측이 없는 21일(대부분 8월)은 `uncollected`다.

## 도메인 (mono/api, 새 패키지 `history`)

| 객체 | 책임 |
|---|---|
| `DayState` | 열거형. `PUBLISHED, WITHHELD, UNCOLLECTED, ABSENT, UNKNOWN` |
| `WithheldReason` | 열거형. 위 표의 사유. `trustsValue()`, `countsAsCollected()`를 스스로 답한다 |
| `BrandDay` | 값 객체. 날짜, 플랫폼, 브랜드, 상태, 사유, 금액 |
| `OfferHistory` | `BrandDay` 모음. `previousCollectedMax(platform, brand, date)`, `bestSeries(brand, range)`, `daysSinceHigher(brand, amount, date)` |
| `HistoryRepository` | `history.json`을 시작할 때와 `/api/reload` 때 읽는다. 못 읽으면 빈 이력과 경고 로그. 빈 이력이면 모든 오퍼가 신규가 되므로, 이 경우 판정은 "모름"을 돌려주고 푸시는 보내지 않는다 |

### 신규 판정

```
Offer.isNewAgainst(history, today):
  prev = history.previousCollectedMax(platform, brand, today)   // 직전 수집일(상태가 published/absent/믿을 수 있는 withheld)
  prev가 "이력 없음"   -> 모름(신규 표시 안 함, 푸시 안 함)
  prev가 "그날 없음"   -> 신규
  amount > prev.max    -> 신규
  그 밖                -> 신규 아님
```

- 오퍼마다 따로 판정한다. 청년피자 7,500원과 10,000원 카드는 직전 수집일 최대 10,000원과 각각 견주어 둘 다 신규가 아니다.
- 직전 수집일은 플랫폼별이다. 그 플랫폼 상태가 `uncollected`, `unknown`, 믿을 수 없는 `withheld`인 날은 건너뛴다.
- 같은 날 같은 브랜드를 여러 출처가 보면 `max`가 그날 최대다.
- 배너에서 세운 오퍼(`fromBanner`)도 같은 규칙을 쓴다. 날짜별 상태 파일을 만들 때 그날 걸린 배너 4사 오퍼를 `published`로 함께 적는다(출처 `banner`). 2026-10-09 전에는 배너 오퍼의 `firstSeenAt`이 비어 신규로 잡히지 않았다(mono `3509230`, `b5f4d8c`에서 배너 시작 시각을 싣는 임시 처리).

## API

`GET /api/brands/{brand}/history?range=1m|3m|all` (기본 `1m`)

```json
{
  "brand": "청년피자",
  "best": [
    {"date": "2026-10-07", "amount": 10000, "line": "solid"},
    {"date": "2026-10-08", "amount": 10000, "line": "carried", "reason": "stage_suspect"},
    {"date": "2026-10-09", "amount": null, "line": "break"}
  ],
  "summary": {"maxEver": 10000, "maxEverOn": "2026-09-23", "current": 10000, "daysSinceHigher": 16}
}
```

- `best`는 플랫폼 무관 그날 최고 금액이다. 점의 `line`은 그날 플랫폼 상태들로 정한다.
  - 하나라도 `published` 또는 값을 믿는 `withheld`면 `solid`, 금액은 그 값들의 최대.
  - 모두 `uncollected`, `unknown`, 값을 못 믿는 `withheld`면 `carried`, 금액은 직전 `solid` 금액.
  - 수집한 플랫폼이 모두 `absent` 또는 `expired`면 `break`.
- 2단계에서 `platforms: [{platform, points}]`를 같은 응답에 더한다.
- 내보내기의 오퍼 JSON에 `isNew`(true, false, null=모름)를 싣는다. 웹은 이 값만 표시한다. `firstSeenAt`은 이행 기간 동안 함께 싣고 웹이 `isNew`로 옮긴 뒤 뺀다(`offer-cases.json` 계약 갱신).

## 화면 (웹, 1단계)

- 브랜드 시트에 최고 할인 그래프 하나. 가로 날짜, 세로 금액.
- 실선과 점은 반영 값, 점선과 빈 점은 이어 그린 값(누르면 사유), 끊긴 자리는 할인 없음.
- 요약 한 줄: 역대 최대와 그 날짜, "N일 만에 최대 할인". 노출 문구는 넣기 전에 사용자에게 묻는다(COPY-STYLE).
- 프리뷰 먼저, 360px 확인 뒤 main.

## 함께 바뀌는 것 (폭발 반경)

| 자리 | 바뀜 |
|---|---|
| `export_data.apply_first_seen`, `data/offer_seen.json` | 판정이 API로 옮겨 가면 걷어낸다 |
| `reflect_daily.py` | 끝에 `daily_state.build` 호출 |
| `scripts/check_routine.py` | 그날 상태 파일이 있고 단계 판정과 맞는지 확인, 없으면 FAIL |
| `deploy_export.py` | `history.json`도 올린다 |
| `NewOfferNotificationService` | `isNewAgainst` 사용, 모름이면 보내지 않음 |
| `offer-cases.json` 계약, `OfferContractTest` | `isNew` 추가 |
| 웹 `isNew` 표시, 신규 탭 | `firstSeenAt` 대신 `isNew` |

## 보장 장치

- 테스트: 오늘 사례를 고정한다. 10-08 쿠폰함 7,500원 반영, 10-09 5a 실패(미수집), 허브 10,000원 반영이면 10,000원은 신규가 아니다(09-23부터 있었고 10-08에도 허브 10,000원 반영).
- 테스트: 직전 수집일 그 브랜드가 `absent`면 다음 등장은 신규다.
- 테스트: 이력 파일을 못 읽으면 판정은 모름이고 푸시는 0건이다.
- 테스트: `WithheldReason`의 모든 값이 `trustsValue`, `countsAsCollected` 답을 가진다(새 사유를 넣고 빼먹으면 실패).
- `check_routine`이 상태 파일 누락을 FAIL로 잡는다. 손 재수집 뒤에도 `daily_state.build`를 돌리지 않으면 걸린다.

## 구현 순서

1. `daily_state.py build`와 `check_routine` 확인, reflect 연결 (tracker)
2. `backfill`과 `history.json`, 배포 연결 (tracker)
3. API `history` 도메인, `isNewAgainst`, 푸시 교체, 계약 `isNew` (mono/api)
4. 웹 `isNew` 전환과 최고 할인 그래프 (mono/web, 프리뷰)
5. 플랫폼별 선과 기간 선택 (API, 웹)

## 하지 않는 것

- 조건(최소주문, 멤버십, 채널)별 판정. 좋아짐과 나빠짐이 섞여 금액만 본다.
- 타겟딜 추정. 브랜드 목록은 없앴다.
- DB 도입. 이력 파일이 수만 줄을 넘으면 다시 본다.
