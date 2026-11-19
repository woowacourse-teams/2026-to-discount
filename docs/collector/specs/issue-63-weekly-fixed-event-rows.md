<!-- 원본: tracker docs/specs/issue-63-weekly-fixed-event-rows.md — 여기서 고치지 않는다 -->
# 이슈 #63: 확정액 행사 행을 주간 수집 파일에 싣는다

- 영역: `collect` (수집 코드를 고친다. 시험에 폰이 필요하다)
- 읽은 것: 이슈 입력, `AGENTS.md`, `scripts/coupangeats_weekly.py` 375~436행(`random_event_records`, `fixed_event_records`, `merge_events`), 527~544행(`run_events_only`), 603~761행(`main`), `scripts/reflect_daily.py`(8단계 읽는 파일), `mono/docs/CHANGE-PROPAGATION.md`, `docs/specs/issue-55-event-card-hub-rounds.md`, `docs/specs/issue-56-coupangeats-fixed-tier-merge.md`.

## 원인 (코드로 확인, 10-23 실측은 구현 세션이 이미 확인)

주간 파일(`captures/coupangeats-weekly-<날짜>.json`)에 행사 행을 쓰는 곳은 `main`의 756행 한 곳이다(`out_records += fixed_event_records(merged, ...)`). 갈래별로 보면 이렇다.

| 갈래 | 하루 행사 파일 | 주간 파일 | 행사 행 |
|---|---|---|---|
| 3단계 일반 실행 (`--write`) | `merged`로 씀 (636행) | 씀 (758행) | `merged`에 있는 만큼 실림 |
| 3단계, 카드 급감(`suspect`, 종료 3) | 씀 | **안 씀** (703행) | 없음 |
| 3단계, 쓸 게 없음 (699행) | 씀 | **안 씀** | 없음 |
| `--events-only --write` | 씀 (542행) | **안 씀** | 없음 |
| `--nonwow` | 안 씀 | 안 건드림(의도) | 해당 없음 |

10-23은 11:26 일반 실행이 행사 0건(허브에 머리줄만 있고 카드가 없었다, `merge_events` 주석의 11:02 현상)이라 `merged`가 비었고 주간 파일에 브랜드 할인 27행만 실렸다. 11:37 `--events-only`가 KFC 7,000 등을 읽어 행사 파일만 갱신했다. 주간 파일은 그대로라 8단계가 넣을 행사 행이 없다.

즉 행사 행은 "행사를 읽은 실행이 주간 파일도 쓴 경우"에만 실린다. 행사 파일과 주간 파일 사이에 시점의 커네선스가 있다.

## 결정

`run_events_only`가 `--write`일 때 하루 행사 파일을 쓴 뒤, 주간 파일의 행사 구역 행을 합쳐진 행사(`merge_events` 결과)로 다시 만든다.

1. 하루 행사 파일을 쓴 `merged`로 `fixed_event_records`와 `random_event_records`를 만든다. `now`와 `shot`은 아래 4번을 따른다.
2. 주간 파일이 있으면 읽어 행사 구역 행(`section`이 `릴레이 슈퍼딜 > 스페셜 특가`, `위클리 슈퍼딜 > 이벤트 쿠폰`)만 떼어 내고 새 행사 행을 붙여 쓴다. 브랜드 할인 등 나머지 행은 한 글자도 안 바꾼다.
3. 주간 파일이 없으면 만들지 않는다. 이유: 파일이 있어야 3단계 판정(`check_routine.py`, 141행)이 "브랜드 할인이 읽혔다"를 증명한다. 행사 행만 든 파일이 있으면 그 증명이 거짓 PASS가 된다. 이 경우 `[suspect] 주간 파일 없음 — 행사 행을 못 실음`을 찍고 종료 코드 1.
4. `shot`(증거 경로)은 주간 파일에 이미 있는 행의 `screenshot_path`를 따라 쓴다. 없으면 `captures/coupangeats/weekly-<날짜>.png`가 있을 때만 그것을 쓰고, 파일이 없으면 행사 행을 싣지 않고 이유를 찍는다(#57: 증거 없는 행은 원장에 못 들어간다). `now`는 현재 시각.
5. 일반 실행의 758행 쓰기도 같은 함수(`merge_event_rows(existing, new_rows)`)를 거치게 해 두 갈래가 한 규칙을 쓴다. 급감(`suspect`)과 "쓸 게 없음" 갈래는 이번에 안 바꾼다: 브랜드 할인을 못 믿어 파일을 안 쓰는 것이 의도이고, 그날 행사는 뒤의 `--events-only`나 다음 일반 실행이 싣는다.

### 하지 않는 것

- 주간 파일을 낮 일반 실행 때 행사 파일을 보고 다시 만들지 않는다. 일반 실행은 이미 `merged`(앞선 값 포함)로 쓴다.
- 8단계(`reflect_daily.py`)는 안 고친다. #61(PR #62)이 8단계 갈래와 가드를 맡는다. 주간 파일이 행사 행을 갖게 되면 그 갈래가 읽는다.
- 원장은 건드리지 않는다. 원장 입력은 8단계 `ingest` 한 길이다.

## 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md` 표에는 주간 파일 모양이나 행사 행 묶음이 없다(1~9번 중 해당 없음. 확실성 판정, 배너 모양은 행의 `qualifier`, `membership` 값이 이어지는 쪽이라 값은 안 바꾼다). 없다고 말하고 시작한다. 표 밖에서 같이 보는 자리는 아래다.

| 자리 | 넣는가 | 이유 |
|---|---|---|
| `fixed_event_records`, `random_event_records` | 안 고침 | 행 모양은 그대로. 호출 자리만 늘림 |
| `scripts/check_routine.py` 141행 (3단계 판정) | 안 고침 | 판정은 브랜드 할인 행으로 한다. 3번 결정이 이걸 지킨다 |
| `drop_suspect` (503행) | 안 고침 | `위클리 슈퍼딜 > 브랜드 할인`만 센다. 행사 행이 늘어도 카드 수 판정이 안 변함. T4가 박는다 |
| `export_data.py`의 쿠폰함 잔여 판정 (#55) | 안 고침 | 원장의 행사 행을 읽는다. 행이 실리면 그쪽 입력이 늘 뿐이다 |
| `store.py` 병합 (#56) | 안 고침 | 같은 모양의 행이 같은 경로로 들어온다 |
| `scripts/build_ce_couponbox_records.py` 314행 | 확인 | 주간 파일을 읽는다. 행사 구역 행이 섞여도 되는지 T5가 확인 |
| `scripts/offer_validate_l4.py` | 확인 | 주간 파일을 "허브 카드 전체 목록"으로 쓴다(머리말). 행사 행은 이미 일반 실행 때도 섞여 있었다. T5 |
| `docs/setup/ROUTINE-SPEC.md` 3단계 산출물 | 고침 | `--events-only`가 주간 파일의 행사 행도 갱신한다고 적는다 |

mono 쪽 코드는 안 건드린다(수집기 변경). 그래서 mono push는 없다.

## "없다 / 0 / 통과" 자리와 양성 신호

| 자리 | 위험한 출력 | 양성 신호 |
|---|---|---|
| `--events-only`가 "행사 N건"을 찍고 주간 파일에는 0행 | 읽은 걸 실었다고 착각 | 쓴 뒤 주간 파일을 다시 읽어 행사 행 수를 세고 `행사 행 N개를 주간 파일에 실음`으로 찍는다. 읽은 `won` 확정 행사 수와 실린 `fixed` 행 수가 다르면 `[suspect]`와 종료 1 |
| 행사 0건 | "행사가 없다"가 아니라 "못 봤다"일 수 있다 | 기존 `return 0 if events else 1` 유지. 0건이면 주간 파일을 **안 건드린다**(앞선 실행의 행사 행을 지우지 않음) |
| 주간 파일 없음 | 파일 없이 행사 행만 든 파일 생성 | 3번 결정. 만들지 않고 실패 신호 |
| 증거 경로 없음 | 증거 없는 자동 행 | 4번 결정. 행사 행을 안 싣고 이유를 찍음 |

## 테스트 (결론은 테스트로 박는다)

`tests/capture/test_coupangeats.py`(또는 새 `tests/test_ce_weekly_event_rows.py`)에 둔다. `run_events_only`는 드라이버가 필요하므로, 파일을 합치는 부분을 `merge_event_rows`와 `write_event_rows(day, merged, root)`로 빼서 파일 입출력만으로 시험한다.

- **T1 (끝 조건 1)**: 10-23 모양 픽스처. 주간 파일은 `위클리 슈퍼딜 > 브랜드 할인` 27행, 행사 파일은 KFC `won` 7,000 등. `write_event_rows`를 부르면 주간 파일에 `section == 릴레이 슈퍼딜 > 스페셜 특가` 행이 KFC 7,000으로 생기고, 브랜드 할인 27행은 바이트까지 같다. 행은 `fixed_event_records`가 만든 것이다(손으로 안 쓴다).
- **T2 재실행**: 같은 호출을 두 번 하면 행사 행이 중복되지 않는다. 브랜드 하나가 다음 실행에서 빠졌어도(`merge_events`로 앞선 값 유지) 행은 남는다.
- **T3 오래된 행사 행 교체**: 주간 파일에 낡은 행사 행(KFC 6,000)이 있으면 새 값(7,000)으로 바뀐다. 행사 구역이 아닌 행은 안 바뀐다.
- **T4 카드 수 판정 불변**: 행사 행이 실린 주간 파일을 `drop_suspect`에 먹여도 `before` 수가 안 변한다.
- **T5 소비자**: 행사 행이 섞인 주간 파일을 `build_ce_couponbox_records`와 `offer_validate_l4` 입력으로 읽어도 예외 없이 통과하고 브랜드 할인 쪽 결과가 같다.
- **T6 주간 파일 없음**: 파일이 없으면 만들지 않고 실패 신호를 돌려준다. 행사 0건이면 파일을 안 건드린다.
- **T7 증거 경로**: `screenshot_path`가 없으면 행사 행을 안 싣는다.
- **T8 일반 실행과 같은 규칙**: 일반 실행 경로(`merge_event_rows`)와 `--events-only` 경로가 같은 입력에서 같은 행사 행을 낸다.

## 원장 append-only

원장(`data/log.jsonl`)을 직접 안 쓴다. 주간 파일은 8단계 `ingest`의 입력이고, 원장에 들어갈 때 기존 규칙(append-only, 사람이 오늘 넣은 같은 브랜드는 보류)이 그대로 적용된다. 이번 변경은 정정 행을 삭제하지 않는다.

## 실제 수집 시험 (끝 조건 2)

`scripts/collect_trial.ps1 -Command "python scripts/coupangeats_weekly.py --write"`로 일반 실행을 돌리고, 이어 `--events-only --write`를 돌린다. 예약 시각(`ROUTINE-SPEC.md`)을 피한다. 확인할 것은 **내용**이다.

1. `--events-only` 뒤 주간 파일에 `릴레이 슈퍼딜 > 스페셜 특가` 행이 있고 `won`과 금액이 읽은 값과 같다.
2. 8단계 `reflect_daily`(미리보기)가 `쿠팡이츠 행사: 넣음 N` 줄을 N ≥ 1로 찍는다(#61/PR #62 병합 뒤).

폰 설정은 바꾸지 않는다. 화면이 꺼지면 `wake_phones.py`로 깨운다.

## 열린 질문

- **행사 파일이 비는 날(행사 0건) 낡은 행사 행을 지울지**: 이 설계는 지우지 않는다(미관측을 부재로 쓰지 않음). 행사가 정말 끝난 날의 행은 원장의 만료 규칙이 다룬다고 가정했다(미확인).
- **주간 파일이 없을 때 실패 코드 1이 `run_routine`의 재시도를 부르는가**: `run_routine`이 `--events-only`를 호출하는지 이 저장소에서는 찾지 못했다(수동 실행 가정). 구현 세션이 호출 자리를 확인한다.

## 변경 이력

- 2026-10-28 구현: 열린 질문 2번 확인. `run_routine`과 `scripts/`에 `--events-only` 호출이 없다(손 실행). 권한자 댓글 중 설계와 다른 것은 없었다.
