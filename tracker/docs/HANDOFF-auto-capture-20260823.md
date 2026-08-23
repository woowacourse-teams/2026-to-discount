# 인수인계 — 주간 자동 캡처 엮기 (2026-08-23)

이 문서 하나로 이어받을 수 있게 적었다. 세션은 넘어가지 않으므로 여기에
남긴 것이 전부다.

## 먼저: 저장소 위치가 2026-08-22에 뒤집혔다

`ADR-018`(개발은 nn98/delivery-discount-tracker에서만, 모노레포엔 정해진
파일만 옮긴다)과 `HANDOFF-baemin-20260817`의 저장소 지정은 **더 이상
맞지 않는다.**

```
사람이 쓰는 곳   woowacourse-teams/2026-to-discount   ← 여기서만 작업
                  ├─ web/ ─(자동 미러)→ nn98/delivery-discount-web → Vercel
                  ├─ api/ ─(자동 미러)→ nn98/delivery-discount-api → self-hosted
                  └─ tracker/           ← 미러 안 됨. 여기가 유일한 정본
```

- 배포 경로가 web·api 서로 반대라 양쪽에 "뒤처진 사본"이 하나씩 생겼고,
  2026-08-21 하루에만 두 번 벌어졌다. 그래서 `mirror-deploy-repos.yml`로
  방향을 하나로 못박았다.
- **`tracker/`는 그 미러에 안 들어간다.** `nn98/delivery-discount-tracker`는
  `e97a885`에서 멈춰 있고 그 뒤 작업은 전부 모노에만 있다. 그쪽 저장소를
  건드리지 말 것.
- `tracker/data/export.json` push가 `Deploy Data` 워크플로를 돌려 서버에
  반영한다. 그 경로만 바뀌어도 배포가 돈다.

ADR-018은 아직 "확정"으로 남아 있다. 이 작업 중에 폐기 처리하거나 새
ADR로 덮어야 한다 — 지금은 문서가 현실과 반대로 말하고 있다.

## 목표

주 1회 자동으로 네 앱을 훑어 원장까지 넣는 실행 경로를 만든다. 기기는
상시 연결·잠금해제·로그인 상태다(`adb devices` → `e7f06aaf`).

## 지금 있는 것 / 없는 것

**있다 — 네 플랫폼 모두 실제 스윕 함수가 이미 있다.** `ADR-013`("자동
스크롤 캡처는 배민에서 멈추고 나머지는 수동+비전")은 그 뒤 SDD 작업으로
낡았다. 이 ADR도 갱신 대상이다.

| 앱 | 함수 | 비고 |
|---|---|---|
| baemin | `capture.baemin.capture`, `sweep_weekend_deals`, `collect_brand_details` | |
| ddangyo | `capture.ddangyo.sweep_brand_coupons`, `sweep_all_cards` | 목록에 텍스트가 다 있어 카드를 안 연다 |
| yogiyo | `capture.yogiyo.sweep_brand_coupons` | 내비바가 탭을 가로채 `_scroll_target_into_safe_zone` 필요 |
| coupangeats | `capture.coupangeats.harvest_keys`, `collect` | 키를 먼저 수확하고 개별 프로모션을 연다 |

**없다 — 이걸 엮는 실행 진입점.** `capture/*.py`에는 `__main__`이 없다.
`build_*_records.py`들은 특정 날짜 실측을 하드코딩한 일회용이라 재사용
경로가 아니다.

**있다 — 뒤쪽 파이프라인은 완성돼 있다.**

```
캡처 결과(list[dict])
  → ingest.py <records.json> [--dry-run]   원장에 덧붙임(검증·중복 제거)
  → record_sweep.py                         전수 수집 사실을 sweeps.jsonl에
  → export_data.py                          원장 → export.json + brands-sorted.txt
  → git push (tracker/data/export.json)     Deploy Data → 서버
```

## 반드시 지켜야 할 결정

- **`export.json`을 손으로 고치지 않는다.** 원장의 파생물이라 다음
  재생성 한 번에 되돌아간다. 2026-08-22에 실제로 그랬다(아래 미결 참고).
  정정은 `ingest.py`로 **더 늦은 시각의 새 관측**을 넣는 것이다
  (`ingest.py` 서두).
- **전수 수집 여부를 건수로 추정하지 않는다**(`ADR-020`). 다 훑었으면
  `record_sweep.py`로 적는다. 추정하다 두 번 사고가 났다 — 손으로 5건
  넣은 날이 수집일로 잡혀 브랜드가 사라졌고, 임계값을 올리자 정정 10건이
  수집일로 잡혀 배민 69개가 한꺼번에 사라졌다.
- **원장 필드로 사고를 판정하는 가드를 새로 만들지 않는다**(`ADR-022`).
  오탐을 뱉는 가드는 결국 꺼진다.
- **검증 못 한 증거는 표시한다**(`ADR-021`).
- 자동 캡처는 실패를 조용히 넘기면 안 된다. 기존 코드가 이미
  `RuntimeError("capture_failed: ...")`로 던진다 — 그 관례를 따를 것.

## 미결 — 이어받는 사람이 판단해야 한다

### 1. 배지가 지워지지 않는다 (막고 있음)

`청년피자 / ddangyo`의 `badge: "포장 +1,000"`을 지우라는 지시가 있었는데,
지금 방법으로는 안 된다.

```
07-27  5,000원  badge 없음
07-31  5,000원  badge 없음
08-05  9,000원  badge 포장 +1,000
08-06  5,000원  badge 포장 +1,000
08-17  5,000원  badge 없음   ← 최신
```

최신 관측에 배지가 없는데도 `store._prefer`가 금액이 같은 옛 레코드에서
상세를 병합해 되살린다(`ADR-016` 설계 그대로). **`null`이 "봤는데 배지가
없었다"와 "이번엔 못 봤다"를 구분하지 못한다.**

`export.json`을 손으로 고쳐 서버에는 반영했지만(그 과정은 `ADR-024`),
원장 재생성으로 되살아난다. 그래서 지금 `Weekly Check`가 이 한 건 때문에
계속 실패한다. **자동 캡처를 붙이기 전에 정해야 한다** — 배지를 살릴지,
아니면 "관측했고 없었다"를 표현할 수단을 원장에 만들지(`ADR-021`과 같은 결).

### 2. 전수 수집에서 안 보였는데 종료일이 남은 레코드

`is_stale_sweep`은 종료일 **없는** 것만 내린다. 그래서 08-17 땡겨요 전수
수집에서 안 보인 12건이 `expiresAt`을 근거로 아직 살아 있다. 자동 수집을
주 1회로 돌리면 이 상황이 매주 쌓인다. `ADR-022`가 "유지 정책은 별도
미결"이라 적어둔 바로 그 자리다.

### 3. 캡처 실패 시 무엇을 하나

주간 자동 실행이면 사람이 안 보고 있다. 한 앱이 실패했을 때 나머지를
계속할지, 부분 수집을 원장에 넣을지(그러면 그날은 전수가 아니므로
`record_sweep.py`에 적으면 안 된다), 실패를 어떻게 알릴지가 안 정해졌다.

## 이미 붙어 있는 자동화 (캡처 아님)

`.github/workflows/weekly-check.yml` — 매주 월 09:00 KST, GitHub 호스팅
러너. **캡처는 안 한다.** 커밋된 파일만 읽는다.

- 플랫폼별 마지막 전수 수집 경과일(`sweeps.jsonl`)
- 7일 안에 끝나는 오퍼
- 종료일 없는 오퍼 수
- **커밋된 `export.json`이 원장 재생성 결과와 같은지 — 이것만 실패로 잡는다**

"훑을 때가 됐다"는 실패로 안 잡는다. 훑기 전까지 매주 빨간 불이면 그 불은
무시된다.

`tracker/requirements.txt`를 이때 처음 만들었다. PyYAML·Pillow가 어디에도
안 적혀 있어서 CI에서 tracker 테스트가 한 번도 안 돌고 있었다.

## 현재 상태 (2026-08-23)

```
전수 수집    baemin 08-10(13일 전) · coupangeats/ddangyo/yogiyo 08-17(6일 전)
원장         data/log.jsonl
export       197건 — 원장 재생성과 배지 1건만 불일치(위 미결 1)
테스트       tracker 118 passed, 1 skipped
기기         e7f06aaf
```

## 시작 지점 제안

1. 미결 1을 먼저 정한다. 안 정하면 `Weekly Check`가 계속 빨간 채로 남고,
   그 상태에서 자동 캡처를 얹으면 새 실패와 옛 실패가 구분되지 않는다.
2. 한 앱(땡겨요가 제일 단순하다 — 카드를 안 연다)으로 캡처→`ingest.py
   --dry-run`까지 손으로 한 번 끝까지 통과시킨다.
3. 그 흐름을 스크립트로 굳히고, 나머지 셋을 같은 모양으로 붙인다.
4. 미결 3을 정한 뒤에야 스케줄에 올린다.
