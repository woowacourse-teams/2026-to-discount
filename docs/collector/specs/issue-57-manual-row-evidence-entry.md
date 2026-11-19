<!-- 원본: tracker docs/specs/issue-57-manual-row-evidence-entry.md — 여기서 고치지 않는다 -->
# 설계: 원장에 손으로 행을 넣을 때 증거 경로를 채우는 입구 (이슈 #57)

- 상태: 구현
- 영역: **export** (폰 불필요. 수집 코드는 바꾸지 않는다)
- 읽은 것: `schema.py` 40~60행, 230~287행(`validate_record`), `store.py`(`append_record`), `ingest.py`, `tracker.py`, `scripts/exclude_offer.py`, `scripts/evidence_manifest.py`, `tests/test_evidence_links.py`, ADR-021, 커밋 `e19d880`, `mono/docs/CHANGE-PROPAGATION.md`(원장·schema 관련 줄), 이슈 입력.
- **읽지 않은 것**: #54에서 손으로 넣은 열 행을 어떤 명령으로 넣었는지(이슈에 없다). `tracker.py append-record`나 임시 스크립트 중 하나로 보고 두 입구를 모두 다룬다. `data/log.jsonl`의 실제 행은 열지 않았다. `tests/test_store.py`의 `BASE` 경로 값은 열지 않았다(4.4의 영향 확인은 구현자가 한다).

## 1. 지금 코드가 하는 일

- `schema.validate_record`는 `screenshot_path` **키가 있는지만** 본다(`REQUIRED_FIELDS`). 값이 `None`, `""`이어도 통과한다. 슬래시 정규화만 한다(276~278행).
- `store.append_record`는 `validate_record`를 부르고 쓴다. 파일 존재는 보지 않는다.
- `tests/test_evidence_links.py`는 **쓴 뒤 전수**로 본다. `evidence_status`가 없는 행의 경로가 매니페스트(CI) 또는 디스크(수집 기계)에 없으면 실패한다. 즉 쓰는 시점에는 아무것도 막지 않고 CI에서야 터진다.
- 증거를 못 대는 행의 정식 표식은 이미 있다. ADR-021의 `evidence_status`(`missing_file`, `no_path`, `not_in_capture`). 다만 **이유를 적는 칸이 없다**.
- 사람이 쓰는 입구는 셋이다. `tracker.py append-record <json>`, `ingest.py <records.json>`, `scripts/exclude_offer.py`(승자 행을 복사하므로 경로를 물려받음).
- 경로가 맞아도 매니페스트에 안 올리면 CI가 실패한다. #54의 직접 원인은 빈 경로지만, 새 증거 파일을 단 행은 같은 모양으로 한 번 더 실패할 수 있다(`evidence_manifest.py record`를 잊는 경우).

## 2. 비판: 이슈 요구를 그대로 받으면 안 되는 곳

1. **"입구마다 인자를 둔다"는 입구를 하나만 막는다.** 입구가 셋이고 임시 스크립트도 있다. 검사는 입구 CLI가 아니라 **쓰는 한 곳**(`store.append_record`)에 둔다. 인자는 그 검사를 통과하는 편의일 뿐이다.
2. **`validate_record`에 그대로 넣으면 안 된다.** 기계 수집기 여섯 곳이 같은 함수를 지난다. 이미 `evidence_status: no_path`를 다는 기계 행(`build_audit_records.py` 105행)은 통과해야 하고, 기계 쪽 수집이 경로를 못 대서 조용히 멈추면 그것이 이 프로젝트의 가장 나쁜 실패다. 그래서 **엄격 모드를 켜는 입구만** 막는다(4.3). 기계 쓰기를 어디까지 포함할지는 8번에서 묻는다.
3. **"증거 없음"은 허용하되 기록한다.** 이유 없이 빈 경로를 넣는 것만 막는다. 증거를 못 대는 사정(운영 확인, 사람이 본 화면)은 실제로 있다. 막기만 하면 사람이 빈 문자열 대신 아무 경로나 넣는 쪽으로 우회한다. 그래서 경로가 **실존하는지**도 같이 본다(4.2).
4. **원장 스키마에 새 열거값을 늘리지 않는다.** `evidence_status`는 그대로 쓴다. 이유는 새 선택 필드 `evidence_note`(자유문)에 둔다. 웹, api는 소비하지 않으므로 export 매핑에는 넣지 않는다(ADR-021과 같은 결정).

## 3. 결정 요약

| 항목 | 결정 |
| --- | --- |
| 검사 자리 | `store.append_record(..., require_evidence=False)` 인자 추가. 켜면 `schema.check_evidence_entry(record, present)` 통과해야 씀 |
| 켜는 입구 | `tracker.py append-record`, `ingest.py`. `exclude_offer.py`는 승자 경로를 물려받으므로 같은 검사를 켠다 |
| 통과 조건 | (가) `screenshot_path`가 비지 않고 실존(수집 기계는 디스크 또는 매니페스트, CI 사본은 매니페스트), 또는 (나) `evidence_status`가 있고 `evidence_note`가 비지 않음 |
| 막는 경우 | 경로가 비었는데 `evidence_status`나 `evidence_note`가 없음 / 경로가 있는데 실존하지 않고 `evidence_status`도 없음 / `evidence_status`가 있는데 `evidence_note`가 비어 있음 |
| 인자 | `tracker.py append-record`에 `--evidence PATH`, `--no-evidence STATUS --evidence-note TEXT`. JSON 안의 같은 필드도 같은 검사를 받음 |
| 매니페스트 | 경로가 있는 행은 쓴 직후 `evidence_manifest.record([path])` 호출 |
| 기계 입구 | 이번에 켜지 않음(8번) |

## 4. 규칙

### 4.1 판정 함수

`schema.py`에 순수 함수 `check_evidence_entry(record, present) -> None`을 둔다. `present(path) -> bool`은 주입한다(테스트에서 디스크에 의존하지 않기 위함). 실패하면 `ValueError`에 **어느 칸을 어떻게 채우라는 말**을 넣는다.

판정 순서(구조로 짚는다. 문구는 보지 않는다):

1. `path = (record["screenshot_path"] or "").strip()`, `status = record.get("evidence_status")`, `note = (record.get("evidence_note") or "").strip()`.
2. `status`가 `None`이면 `path`가 비지 않고 `present(path)`여야 한다. 아니면 "증거 경로를 주거나 `--no-evidence`로 이유를 적을 것".
3. `status`가 있으면 `note`가 비지 않아야 한다.

### 4.2 양성 신호: `present`

"경로가 있다"는 관측이 아니다. 실존 여부로 가른다.

- 수집 기계(`captures/` 디렉터리가 있음): 파일이 디스크에 있음, 또는 매니페스트에 있음. `test_evidence_links.py`의 `missing`과 같은 기준이다.
- 사본(CI): 매니페스트에 있음.
- 같은 기준이 두 곳(테스트, 쓰기 검사)에 복사되면 갈라진다. `scripts/evidence_manifest.py`에 `present(path)`를 두고 **테스트도 그 함수를 부르게** 바꾼다.

### 4.3 `append_record`

- 인자 `require_evidence: bool = False`. 기본값이 꺼짐이라 기존 호출(`reflect_daily`, `deploy_export`, `parse/load_coupangeats_ref.py`, 기존 테스트)은 동작이 같다.
- 켜면 `validate_record` 뒤에 `check_evidence_entry`를 부른다. 실패하면 **아무것도 쓰지 않는다**(검사가 쓰기보다 앞).
- 쓴 뒤 경로가 있으면 `evidence_manifest.record`. 매니페스트 기록이 0건인데 경로가 이미 매니페스트에 있는 경우는 정상(같은 해시)이다.
- `ingest.plan`은 `validate_record`로 후보를 가르므로 같은 검사를 `plan`의 거부 목록(`invalid`)에 넣어 `--dry-run`에서도 보이게 한다. 한 건이라도 막히면 전부 넣지 않는 기존 동작(1 반환)을 따른다.

### 4.4 `exclude_offer.py`

- 승자 행을 복사하므로 승자가 `evidence_status` 없이 실존하는 경로를 들고 있으면 통과, 승자가 이미 표식이 있으면 `evidence_note`도 물려받는다.
- 승자의 증거가 끊겨 있으면(CI에서만 보이던 상태) 이 입구에서 막혀 드러난다. 그것은 의도다. 막혔을 때 사람이 `--evidence`를 줄 수 있도록 `--evidence PATH`, `--no-evidence STATUS --evidence-note TEXT`를 같이 받는다.
- 구현자는 `tests/test_exclude_offer*.py`(있다면)와 `tests/test_store.py`의 `BASE` 경로가 `require_evidence=True`에서 어떻게 되는지 먼저 확인한다. 기본값이 꺼짐이라 기존 테스트는 변하지 않아야 한다.

## 5. 폭발 반경 (`mono/docs/CHANGE-PROPAGATION.md`)

- 표에서 `schema.py`가 나오는 묶음은 두 곳이다. 82행(`ALLOWED_QUALIFIERS`, `Certainty.java`)은 qualifier 값 묶음이고, 151행은 "원장 검사: `schema.validate_record(..., user_facing_copy=True)`"다. 이번 변경은 `validate_record`의 입력 규칙을 바꾸지 않고 **새 함수를 따로** 두므로 두 묶음 모두 건드리지 않는다. 151행의 짝(배너 편집기, 배포 가드)이 부르는 `validate_record`는 같은 동작이다.
- `evidence_status`, `screenshot_path`를 가리키는 줄은 표에 없다. 소비자는 `tests/test_evidence_links.py`, `evidence_manifest.py`, `build_audit_records.py` 셋이다. 앞 둘은 이번에 고치고, 셋째는 쓰기 쪽이라 그대로 둔다.
- 새 선택 필드 `evidence_note`는 export 필드 매핑에 넣지 않는다. 웹, api, 콘솔(beggars-ops)은 읽지 않는다. 콘솔이 원장 행 모양을 검사하는 곳이 있는지는 **확인하지 못했다**. 구현자는 `export_data.py`가 모르는 필드를 버리는지(통과시키는지) 한 줄 테스트로 박는다.
- mono는 고치지 않는다.

## 6. "없다 / 0 / 통과"가 나오는 자리와 양성 신호

| 자리 | 통과가 뜻하는 것 | 양성 신호 |
| --- | --- | --- |
| `check_evidence_entry` 통과 | 증거가 있다 | 경로 실존(디스크 또는 매니페스트). 빈 문자열, 공백만 있는 경로는 "있다"로 세지 않음 |
| `--no-evidence` 통과 | 증거 없음이 사람 판단이다 | `evidence_note`가 비지 않음. 열거값은 `ALLOWED_EVIDENCE_STATUS`에서 |
| `ingest --dry-run`의 "거부 0" | 모두 넣어도 된다 | 후보 수와 (신규+중복+거부) 합이 같음을 출력 |
| 매니페스트 기록 0건 | 이미 올라 있음 | 기록 뒤 `present(path)`를 다시 불러 참인지 확인. 거짓이면 실패 |

## 7. 테스트 (결론은 테스트로 박는다)

`tests/test_evidence_entry.py` 신설. 디스크에 의존하지 않도록 `present`를 주입하고, `append_record`는 `tmp_path` 원장을 쓴다.

1. 경로가 빈 문자열이고 표식이 없으면 `check_evidence_entry`가 `ValueError`. 끝 조건의 "증거 없이 넣으면 막힘".
2. 경로가 `None`이어도, 공백만 있어도 같음.
3. 경로가 있으나 `present`가 거짓이고 표식이 없으면 막힘(경로를 지어내는 우회).
4. 경로가 있고 `present`가 참이면 통과. 끝 조건의 "경로를 주면 통과".
5. `evidence_status="no_path"`와 `evidence_note="..."`가 있으면 통과. 끝 조건의 "이유를 주면 통과".
6. `evidence_status`만 있고 `evidence_note`가 비면 막힘.
7. `append_record(require_evidence=True)`가 막으면 **원장 파일이 그대로**다(바이트 비교). append-only 보호.
8. `append_record` 기본값(꺼짐)은 기존처럼 빈 경로를 받는다(기계 입구 회귀 방지).
9. `tracker.py append-record --evidence`(`present` 주입)와 `--no-evidence` 인자 해석. 인자가 없고 JSON에도 없으면 종료 코드가 0이 아님.
10. `ingest.plan`: 증거 없는 후보가 `invalid`에 들어감.
11. `exclude_offer.build`가 만든 행이 승자의 증거 경로를 그대로 가리킴(이미 하는 일을 테스트로 박음).
12. `present`가 테스트(`test_evidence_links`)와 쓰기 검사에서 같은 함수임을 박는 임포트 확인 한 줄.
13. `export_data`가 `evidence_note`가 든 행을 에러 없이 처리.

로컬 점검은 `docs/HARNESS.md` §11, CI는 별칭표 없이 도는 마지막 줄까지.

## 8. 사용자에게 묻는 것

1. 기계 입구(`reflect_daily`, `deploy_export`, 빌더)에도 `require_evidence`를 켤까? 켜면 수집이 증거 경로를 못 댈 때 **반영이 막힌다**(조용히 잃지 않는 대신 하루 반영이 보류됨). 이번 PR은 사람 입구만 켜고 기계는 후속으로 제안한다.
2. 이유 칸 이름을 `evidence_note`로 해도 되나? 기존 `excluded.note`, `sold_out_evidence.note`와 같은 결을 따랐다.

## 9. 원장 append-only

- 원장 행을 고치거나 지우지 않는다. 이미 들어간 경로 빈 행은 건드리지 않는다(`e19d880`에서 이미 고쳤다).
- 막힌 입력은 쓰지 않으므로 원장은 바이트까지 같다(테스트 7).
- 증거가 뒤늦게 생기면 더 늦은 시각의 새 관측을 넣는다. `evidence_status`를 단 행을 지우지 않는다.

## 10. 범위 밖

- 기계 입구 엄격 모드(8번 1).
- 이미 원장에 있는 행의 일괄 보정.
- 사람이 증거 화면을 찍어 올리는 입구. 이 설계는 이미 있는 파일의 경로를 받는 데까지다.

## 변경 이력

- 2026-10-23: 설계 검수 댓글(승인)이 8번에 답했다. 기계 입구 엄격 모드는 후속(이번엔 사람 입구만), 이유 칸 이름은 `evidence_note`. 설계와 같다.
- 2026-10-23 구현: `ingest.plan`은 `present` 인자를 받을 때만 증거 검사를 건다(기본 없음). `main`이 `evidence_manifest.present`를 넘긴다. 기존 `plan` 단위 테스트가 디스크에 기대지 않게 하려는 것이다. 인자 해석(`add_evidence_args`, `with_evidence`)은 `tracker.py`에 두고 `exclude_offer.py`가 가져다 쓴다.