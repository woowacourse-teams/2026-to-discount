<!-- 원본: tracker docs/specs/issue-35-first-come-soldout-bot.md — 여기서 고치지 않는다 -->
# 설계: 선착순 소진 전용 봇 (이슈 #35)

- 상태: 설계 (구현 전)
- 영역: **collect.** 폰으로 배짱할인 화면을 읽는다. 구현자는 `collect-implementer`(로컬 PC, 사람이 지켜봄).
- 앞선 설계: [`issue-31-first-come-soldout-correction.md`](issue-31-first-come-soldout-correction.md) §3.4, §3.5, §5-4(collect 후속 1번), [`ADR-033`](../decisions/ADR-033-sold-out-is-an-observation-with-evidence.md).
- 읽은 것: 이슈 입력 파일, #31 설계 전문, `capture/baemin_baejjang.py`(`read_today_hotdeal`), `capture/baemin_baejjang_parse.py`(`parse_today_hotdeals`), `scripts/first_come_ledger.py`, `scripts/offer_link_check.py`(`check_first_come`, `read_hotdeal_cards`), `scripts/baejjang_daily.py`(`hotdeal_records`, `brand_first_come_cards`), `scripts/verify_bot.py`(`CHECKS`, 폰 보호), `store.py`(`_sold_out_holds`), `tests/test_first_come_soldout.py` 앞부분, `mono/docs/CHANGE-PROPAGATION.md`(묶음 제목과 1번 표만), `docs/workflow/LOCAL-RULES.md`.
- 읽지 못한 것: `docs/setup/ROUTINE-SPEC.md` 전문(예약 시각 표), `docs/HARNESS.md`, `docs/AGENT-FAILURES.md`, `data/log.jsonl`의 2026-10-22 노랑통닭 행, 배짱할인 하단 캐러셀의 실제 화면 트리(저장소에 덤프가 없다), `tests/capture/test_baemin_baejjang.py` 전문. 폰은 이 세션에 없다.

## 1. 이슈가 요구하는 것과 코드가 말해 주는 것

| 이슈 할 일 | 코드에서 확인한 사실 | 결론 |
|---|---|---|
| 핫딜 카드 마감을 폰으로 읽는 봇 | `parse_today_hotdeals`가 이미 `sold_out`(꼬리표에 "마감")을 읽는다(229행). 읽는 곳은 `read_today_hotdeal`뿐이고 L3(`verify_bot` 30분 간격, 10~22시)가 이걸 부른다 | 읽기 자체는 있다. **없는 것은 "그 카드가 그 화면에 있었다"는 증거 저장** |
| 마감 카드 화면 경로 | `read_today_hotdeal`은 `out_dir`이 있을 때 **첫 화면 한 장**만 저장한다(199~201행, 스크롤 전). 카드가 일곱 장이면 뒤 카드는 스크롤 뒤에 읽히고(206~226행) 그 화면은 저장되지 않는다. 합치기에서 `sold_out`은 OR로 옮겨 붙는다(219~220행) | #31 §3.4-2의 멈춤 조건은 **카드 단위 화면 저장**으로 푼다(§3.2). 전체 한 장 경로를 근거로 쓰지 않는다 |
| 캐러셀 마감 | 저장소에 캐러셀 마감 표시를 읽는 코드와 덤프가 없다. 인기 브랜드 패널(`brand_first_come_cards`)은 마감을 안 읽는다(`offer_link_check.py` 289행) | **읽기 전에 실물 확인이 먼저**다(§3.6). 확인 전에는 캐러셀과 패널 오퍼를 "소진 관측 불가"로 세어 따로 보고한다 |
| 양성 신호 | 판정 `check_first_come`은 브랜드 이름만 맞춘다. 금액까지 맞추는 것은 `record_first_come_sold_out` | 봇 쪽에서 같은 화면의 트리에 브랜드, 금액, 마감이 한 카드로 있음을 확인한다(§3.3) |

## 2. 결정 요약

1. 새 스크립트 `scripts/first_come_bot.py`(새 파일). 판정과 링크 점검을 하는 `offer_link_check`를 늘리지 않고, 읽기, 판정, 원장 기록, 업로드를 한 흐름으로 묶는다.
2. `read_today_hotdeal`의 **반환 모양은 안 바꾼다**(`(state, deal)`). 호출처가 넷이고 테스트가 `lambda *args`로 갈아 끼운다(`tests/test_local_banner_source.py` 86행). 카드 dict에 키만 더한다(§3.2).
3. 원장 기록은 #31에서 만든 `record_first_come_sold_out`을 **그대로** 쓴다. 쓰는 곳은 봇 하나다. L3(`offer_link_check --first-come`)는 알림만 남기고 원장에 쓰지 않는다.
4. 핫딜 카드 행에 `sold_out_observed: true`를 단다(`baejjang_daily.hotdeal_records`). 이 칸이 없으면 같은 날 패널 행이 소진을 풀어 버리거나(#31 §2), 반대로 소진이 영영 안 풀린다.
5. 캐러셀과 패널은 실물 확인(§3.6) 뒤에 같은 함수로 잇는다. 확인 못 하면 이슈 끝 조건 중 카드 쪽만 닫고 캐러셀은 후속으로 남긴다.

## 3. 설계

### 3.1 언제 도나

- 대상은 export의 `baemin` 선착순 오퍼 중 **아직 `soldOut`이 거짓이고 오픈 시각이 지난 것**이다. 오픈 시각은 `badge`/`conditions`에서 `banner_model.parse_open_hour`로 읽는다(`offer_link_check.build_targets`가 쓰는 같은 입력). 시각을 못 읽으면(99) **오픈한 것으로 보지 않고** 대상에서 빼며 "시각 미상 N건"으로 센다.
- 대상이 0이면 폰을 잡지 않는다. 종료 코드 2(`verify_bot`의 skip)로 끝내고 이유 줄을 찍는다: "대상 없음(오픈 전 N, 이미 소진 M, 시각 미상 K)". "0건이라 통과"와 "안 봤다"를 이 줄로 가른다.
- 호출은 `verify_bot.CHECKS`에 한 줄 더한다(`Check("soldout-bot", ...)`, `app="baemin"`, 창 10~22시). `verify_bot`의 폰 보호(수집 중, 다음 수집 20분 전, 시험 잠금, 인계 파일의 폰 줄)를 그대로 받는다. 직접 폰을 잡는 두 번째 길을 만들지 않는다.
- **간격 숫자는 정하지 않았다.** 선착순은 몇 분 안에 끝나는 날이 있어(2026-10-17 맘스터치, 60계) 30분 간격(L3와 같음)이 충분한지 이 세션은 모른다. 구현자가 `logs/verify-bot/latest.json`과 오픈 뒤 소진까지 걸린 시간 기록을 읽고 정하며, 근거를 PR 본문에 적는다. 간격을 줄이면 폰 점유가 늘어 수집과 부딪힐 수 있다는 점을 같이 쓴다.
- L3의 소진 담당 분리(#31 §1)는 이 봇이 한 번이라도 실제 소진을 `soldOut`으로 내보낸 **뒤** 별도 변경으로 한다. 이번에는 L3를 건드리지 않는다.

### 3.2 마감 카드 화면을 카드 단위로 저장

`read_today_hotdeal(serial, out_dir, date_str)`에서만 바꾼다. `out_dir`이 없으면 동작이 지금과 같아야 한다(L3, `banner_routine`이 그렇게 부른다).

- 첫 화면과 이어 읽는 화면마다, **트리를 뜨고 → 스크린샷을 찍고 → 트리를 다시 뜬** 뒤 두 트리가 같은 카드 목록(브랜드, 금액, 마감)을 내는지 본다. 다르면 그 화면은 증거로 쓰지 않는다(스크롤 중 애니메이션으로 사진과 트리가 어긋난 것).
- 파일 이름: `baemin_<날짜>_오늘의핫딜_<순번>.png`. 첫 화면은 기존 이름(`..._오늘의핫딜.png`)을 그대로 두어 `banner_routine` 등 기존 참조를 안 깬다.
- 카드 dict에 `screen`(저장소 상대 경로)을 단다. **그 카드의 마감이 읽힌 화면**의 경로다. 마감이 읽히지 않은 카드는 `screen`을 달지 않는다.
- 이어 읽기의 `old.update(sold_out=old.get(...) or d.get(...))` 합치기에서 `screen`도 같이 옮긴다. `sold_out`이 이 프레임에서 처음 참이 될 때만 이 프레임의 경로로 덮는다. 앞 프레임에서 이미 마감이었으면 앞 경로를 둔다. (경로 없이 `sold_out`만 참이 되는 길을 만들지 않는다.)
- `parse_today_hotdeals`가 돌려주는 카드에 `sold_out_observed: true`를 단다(마감 꼬리표를 실제로 읽는 유일한 함수다). 패널 카드(`brand_first_come_cards`)와 `read_hotdeal_cards`가 붙이는 `sold_out: False`에는 이 키가 없다. **"읽었다"를 읽은 함수가 켜고, 안 읽은 쪽은 키가 없는 구조**라 미관측이 관측으로 둔갑하지 않는다.

### 3.3 소진 행을 만들기 전의 양성 신호

판정 행은 `check_first_come(row, t, cards)`로 만들고(카드 읽기만 다른 입력), 아래 **넷이 모두 참일 때만** `record_first_come_sold_out`에 넘긴다. 하나라도 아니면 행을 안 만들고 그 이유를 집계에 센다.

1. 카드 읽기가 끝났다(`cards is not None`, `read_today_hotdeal`의 상태가 `unread`가 아님). `none`(오늘 핫딜 없음)과 `unread`를 가른다. `unread`는 기존 `baejjang_daily`처럼 최대 3회 다시 연다(135~142행).
2. 브랜드 이름이 같은 **카드**가 있다. 별칭은 `record_first_come_sold_out`이 `_canon_brand`로 접는다. 이 화면에서 브랜드 이름이 보였다는 것이 이슈가 요구한 양성 신호다.
3. 그 카드의 금액이 원장 선착순 승자의 금액과 같다(`record_first_come_sold_out`이 이미 본다). 다르면 다른 쿠폰의 마감일 수 있다.
4. 그 카드의 `screen`이 있고 파일이 실제로 있다(크기 0이 아님). 3.2의 두 트리가 일치한 화면이어야 한다.

집계 줄(매번 찍는다): `카드 읽음 N / 못 읽음 M / 대상 K 중 소진 기록 a, 열림 확인 b, 미관측 c(카드에 없음), 금액 불일치 d`. `열림 확인`은 카드가 `sold_out` 거짓이고 금액이 같은 경우다. "마감이 아니다"를 말하려면 카드를 읽고 찾았어야 한다. 카드에 없는 것은 `미관측`이고 **열림으로 세지 않는다**.

### 3.4 쓰기와 올리기

- 행은 `record_first_come_sold_out(verdict_rows, records, now)`가 돌려준 것을 봇이 `append_record`로 붙인다. 원장은 append-only다: 삭제도, 기존 행 수정도 없다. 같은 날 중복은 함수가 이미 막는다(승자가 이미 `sold_out`이면 안 만든다).
- 행이 하나라도 생기면 같은 프로세스에서 `export_data.py` 다음 `deploy_export.py --apply`를 부른다(#31 §3.5). 행이 없으면 부르지 않는다. 올리기가 실패하면 종료 코드로 알리고 원장 행은 남는다(다음 실행이나 예약 수집의 8단계가 올린다).
- 지금 `first_come_ledger.py` 머리말의 "아직 아무도 부르지 않는다" 주석은 연결과 함께 지운다(주석이 거짓이 되므로).
- 같은 날 소진이 풀리는 길은 #31이 만든 규칙을 그대로 쓴다: 핫딜 카드가 `sold_out_observed`와 함께 `sold_out: false`를 보이면 풀린다. 봇은 풀지 않는다. 풀기는 예약 수집(`baejjang_daily --write`)의 몫이고 3.5가 그 입력을 맞춘다.

### 3.5 `sold_out_observed`를 수집 쪽에서 단다

- `baejjang_daily.hotdeal_records`: 카드에 `sold_out_observed`가 참이면 행에 `sold_out_observed: True`를 단다. 참이 아니면 키를 **넣지 않는다**(거짓을 쓰지 않는다. 스키마가 불리언만 허용하고 의미는 "읽었음"이다).
- 패널에서 온 카드는 이 키가 없으므로 행에도 없다. 같은 날 패널 행이 소진을 풀지 못하는 #31 규칙이 그대로 선다.
- 이 변경은 **예약 수집이 부르는 코드**다. AGENTS.md대로 다음 예약 전에 `baejjang_daily` 단계만 골라 실제로 돌려 본다.

### 3.6 캐러셀과 인기 브랜드 패널: 실물 확인이 먼저

노랑통닭 소진은 2026-10-19 기준 핫딜 카드가 아니라 **패널**에서 온 오퍼였다(`offer_link_check.py` 287~289행 주석). 핫딜 카드만 읽는 봇은 이 오퍼의 소진을 영영 못 본다. 이 봇이 이슈의 출발점인 사례를 못 잡을 수 있다는 뜻이므로 먼저 확인한다.

- 구현 첫 단계(코드 변경 없음, 읽기만): 오픈 뒤 소진된 것으로 알려진 선착순 오퍼의 패널과 하단 캐러셀 화면을 폰으로 열어 트리와 스크린샷을 `captures/_evidence/`에 덤프한다. 소진 표시가 **있는지**, 있다면 어떤 구조(열, 구역 관계)인지 적는다. 문구("마감")만으로 짚지 않는다(AGENTS.md "구조로 짚는다").
- 결과 두 갈래:
  - **구조로 짚을 소진 표시가 있다.** 그 덤프를 `tests/fixtures/`에 넣고 파서 테스트(T7)를 박은 뒤 같은 `record_first_come_sold_out`에 잇는다. 판정 행 모양(`platform`, `brand`, `verdict`, `card`, `card_screen`)이 같으면 함수는 안 바뀐다.
  - **없거나 못 읽는다.** 읽지 말고 결론을 남긴다: 설계 문서 변경 이력과 PR 본문 **미확인** 절에 "패널·캐러셀 소진은 관측 불가"를 적고, 봇 집계 줄에 `관측 불가(패널/캐러셀) N`을 계속 찍는다. 이 경우 소진 반영은 사람 정정(`exclude_offer.py --slot first_come --sold-out`)이 맡는다. 이 결론으로 이슈 끝 조건의 카드 부분만 닫고 캐러셀은 새 이슈로 넘긴다.
- 원장 키가 패널 오퍼와 카드 오퍼에서 같은지(`(앱, 브랜드, 선착순)`, `offer_key`)는 `store.py` 189~200행 설명으로만 알고 실제 행을 읽지 않았다. 구현자가 실제 `log.jsonl`의 해당 브랜드 행으로 확인한다.

## 4. 폭발 반경

| 묶음 | 건드리나 | 판단 |
|---|---|---|
| 1. 확실성 | 아니오 | `sold_out`은 확실성 입력이 아니다. `soldOut` 선착순이 최고 후보에서 빠지는지는 #31 T8에서 구현자가 확인하기로 했다. 이번 구현은 그 결과를 PR 본문에서 이어 받는다 |
| 2. 배너 모양 | 아니오 | 배너 칸과 `firstCome` 칸을 안 건드린다. 같은 카드를 읽는 `banner_routine`이 `read_today_hotdeal`을 부르므로 3.2의 키 추가가 배너 판정(`split_hotdeals`)에 새 키를 흘리지 않는지 테스트로 본다(T8) |
| 8. 저장소 경계와 배포 순서 | 해당 안 됨 | `export.json`에 새 칸을 싣지 않는다. `soldOut`은 이미 나간다(`export_data.py` 41행). mono 변경 없음 |
| 9. 새 파일 | 해당 | `scripts/first_come_bot.py`, 테스트 파일. 구현자가 `generate_project_structure.py`가 이 저장소의 대상인지 확인 |

tracker 안에서 같이 고칠 자리(직접 읽어 잰 것):

| 자리 | 넣는가 | 이유 |
|---|---|---|
| `capture/baemin_baejjang.py` `read_today_hotdeal` | 넣는다 | 3.2 |
| `capture/baemin_baejjang_parse.py` `parse_today_hotdeals` | 넣는다 | `sold_out_observed` |
| `scripts/baejjang_daily.py` `hotdeal_records` | 넣는다 | 3.5 |
| `scripts/verify_bot.py` `CHECKS`, 머리말 표 | 넣는다 | 3.1. `tests/test_verify_bot.py`의 점검 목록 단언도 같이 본다 |
| `docs/setup/ROUTINE-SPEC.md` 5-b | 넣는다 | 새 검사 한 줄. 이 세션은 전문을 못 읽었으므로 구현자가 표를 읽고 맞춘다 |
| `scripts/first_come_ledger.py` 머리말 | 넣는다 | 3.4 (거짓이 될 주석) |
| `scripts/offer_link_check.py` `read_hotdeal_cards` | 안 넣는다 | `out_dir` 없이 부르는 L3는 그대로 둔다. 단 3.2 이후 `card_screen`이 항상 `None`인 것은 L3의 사실로 남는다(L3는 원장에 쓰지 않으므로 무해) |
| `scripts/banner_routine.py` | 안 넣는다 | 같은 함수를 `out_dir`과 함께 부른다(511행). 첫 화면 파일 이름이 안 바뀌는 것을 T8이 지킨다 |
| 콘솔(beggars-ops), 쿠팡이츠, 요기요, 땡겨요 | 안 넣는다 | #31 §5-4의 별도 후속 |

## 5. "없다 / 0 / 통과" 양성 신호

| 자리 | 지금 "아니다"가 뜨는 때 | 양성 신호 |
|---|---|---|
| 소진 기록 0건 | 오늘 소진이 없다 / 핫딜 카드를 못 읽었다 / 브랜드가 카드에 없다 / 오픈 전이다 | 집계 줄(§3.3)이 네 경우를 따로 센다. `열림 확인`은 **카드를 찾았을 때만** 센다 |
| "대상 없음" 종료 | 오픈 전이다 / 시각을 못 읽었다 | `대상 없음(오픈 전 N, 이미 소진 M, 시각 미상 K)`. 시각 미상은 통과가 아니라 따로 센다 |
| 마감 카드 화면 | 사진과 트리가 어긋난 화면 | 사진 전후 두 트리가 같은 카드 목록(§3.2). 어긋나면 `screen`을 안 단다 |
| 같은 날 소진이 풀림 | 패널 행은 마감을 안 읽는다 | 핫딜 카드 파서가 단 `sold_out_observed`만이 풀 수 있다(§3.2, 3.5) |
| 패널, 캐러셀 소진 | 소진 표시가 없어 항상 "열림" | 실물 덤프로 소진 표시의 존재를 먼저 확인(§3.6). 못 하면 `관측 불가`로 센다 |

## 6. 원장 append-only

- 봇은 `append_record`로 새 행만 붙인다. 소진 취소, 다음 날 풀림은 이 봇이 하지 않는다(더 늦은 시각의 새 관측이 한다, #31 §6).
- 새 행의 `captured_at`은 승자보다 늦다(`record_first_come_sold_out`의 `later_than`). 테스트는 `tmp_path` 원장만 쓴다. 실제 수집 시험(끝 조건)은 실제 원장에 쓰되, 시험 행은 근거 화면과 함께 남기고 지우지 않는다. 잘못 쓴 행은 `--clear-sold-out` 정정 행으로 되돌린다.

## 7. 테스트

파일 이름은 구현자가 정한다. 옛 코드에서 먼저 빨갛게 확인한다.

- **T1 카드 단위 화면**: 카드 일곱 장 중 일곱 번째(스크롤 뒤)가 마감인 가짜 트리 열을 `read_today_hotdeal`에 넣으면 그 카드의 `screen`이 **두 번째 프레임** 경로이고 첫 화면 경로가 아니다.
- **T2 사진-트리 불일치**: 사진 전후 트리가 다르면 `screen`이 없고 봇이 소진 행을 안 만든다.
- **T3 마감 아님과 못 읽음을 가른다**: (카드 열림, 금액 같음) → `열림 확인`, (카드에 브랜드 없음) → `미관측`, (읽기 `unread`) → `못 읽음`. 셋 다 행 0개이고 집계 줄이 서로 다르다.
- **T4 금액 불일치**: 같은 브랜드 마감 카드라도 금액이 다르면 행이 없다.
- **T5 끝에서 끝까지**: 마감 카드 → 봇 → `append_record`(tmp 원장) → `build_export`의 해당 선착순 오퍼 `soldOut`이 참(이슈 끝 조건 1의 단위 시험판).
- **T6 대상 선별**: 오픈 전, 이미 소진, 시각 미상(99)은 폰을 안 부르고 종료 코드 2와 사유를 낸다.
- **T7 `sold_out_observed`**: 핫딜 카드 파서 출력의 행에는 참이 달리고 패널 카드 행에는 키가 없다. 같은 날 패널 행이 소진을 못 풀고 핫딜 카드 행은 푼다(`store._sold_out_holds`와 맞물림).
- **T8 기존 호출처 불변**: `out_dir` 없이 부르는 `read_today_hotdeal`의 반환과 첫 화면 파일 이름이 그대로다. `split_hotdeals` 결과가 새 키 때문에 안 바뀐다.
- **T9 `verify_bot` 등록**: `CHECKS`에 `soldout-bot`이 있고 `app="baemin"`, 창이 10~22시다. `tests/test_verify_bot.py`의 폰 보호 시험이 이 검사에도 적용된다.
- **T10 패널·캐러셀**: §3.6 결과가 "읽을 수 있음"이면 실물 덤프 fixture로 파서 시험. "없음"이면 집계 줄에 `관측 불가`가 찍히는 시험.

## 8. 실제 수집 시험 (이슈 끝 조건)

- 수집 코드(`read_today_hotdeal`, `parse_today_hotdeals`, `hotdeal_records`)를 바꾸므로 `scripts/collect_trial.ps1 -Command "<명령>"`로 예약을 끄고 돌리고 끝나면 다시 켠다. 폰은 인계 파일의 `폰 시험:` 줄로 잡고 놓을 때 지운다(LOCAL-RULES). 예약 시각을 피한다.
- 시험 순서: (1) 3.6 실물 덤프, (2) `baejjang_daily` 단계만 `--skip`으로 골라 `sold_out_observed`가 행에 붙는지, (3) 오픈 뒤 소진된 카드가 있는 시각에 봇을 돌려 행과 근거 화면 확인, (4) `export.json`의 `soldOut`과 서버 조회.
- 끝 조건 "실제로 소진된 카드가 `soldOut`으로 나감"은 **오늘 소진된 카드가 있어야만** 시험된다. 없는 날은 시험을 못 닫는다. 그런 날은 PR 본문 **미확인**에 적고, 가짜 카드를 만들어 닫은 것으로 쓰지 않는다.

## 9. 하지 않는 것

1. L3의 소진 담당 제거(이 봇이 실제 소진을 한 번 내보낸 뒤).
2. `first_come_time_changed`로 `badge`/`conditions` 갱신(#31 §3.6의 2회 확인 규칙이 필요. 봇이 읽는 카드 열림 시각을 쌓을 수는 있으나 이 이슈 범위 밖).
3. 쿠팡이츠, 요기요, 땡겨요 선착순.
4. 콘솔 변경, mono 변경, `export.json` 공개 계약 변경.
5. 수집 시각, 마감 시각 새로 측정.

## 10. 사용자에게 물을 것

- 봇 간격을 L3와 같은 30분으로 시작해도 되는가. 오픈 직후 몇 분 안에 끝나는 선착순을 잡으려면 더 짧아야 하는데 폰 점유와 맞바꾼다. 이 세션은 소진까지 걸린 시간 자료를 못 봤다.
- 패널, 캐러셀에 소진 표시가 없다고 실물에서 확인되면, 이 이슈를 카드 쪽만 닫고 캐러셀을 새 이슈로 넘겨도 되는가. 노랑통닭 사례는 패널 출처라 카드만으로는 재현되지 않을 수 있다.

## 11. 범위 점검

한 PR로 가능한 크기다: 카드 읽기에 화면과 키 추가, 새 스크립트 하나, `verify_bot` 한 줄, 문서 한 줄. 단 §3.6이 "읽을 수 없음"이면 캐러셀은 이 PR에서 빠진다. 폰 시험이 필요하므로 구현은 로컬 `collect-implementer`가 한다.

## 변경 이력

- 2026-10-22 (설계): 처음 작성.
- 2026-10-28 (구현): 권한자 댓글(2026-10-23 설계 검수)이 §10 열린 질문에 답했다. 간격은 30분으로 시작한다(`verify_bot` `every_min=30`). 캐러셀은 #36이 맡으므로 이 이슈는 핫딜 카드 쪽만 닫는다. 그래서 §3.6의 캐러셀 실물 확인과 T10의 파서 갈래는 #36으로 넘기고, 이 구현은 "카드에 없는 오퍼"를 집계 줄의 `미관측(카드에 없음 = 관측 불가 패널/캐러셀)`으로 센다. 봇 파일은 `scripts/first_come_bot.py`, 테스트는 `tests/test_first_come_bot.py`.
