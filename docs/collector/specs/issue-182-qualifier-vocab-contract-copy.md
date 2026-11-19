<!-- 원본: tracker docs/specs/issue-182-qualifier-vocab-contract-copy.md — 여기서 고치지 않는다 -->
# 이슈 #182: qualifiers 어휘를 mono 계약 사본 한 곳에서 읽기

- 영역: `export` (폰이 필요 없다. 수집기 코드 `schema.py`를 건드리지만 어휘 값이 그대로라 수집 결과가 바뀌지 않는다. 3-4 참고)
- 읽은 것: 이슈 입력(본문과 2026-11-15 사용자 결정), `.claude/agents/designer.md`, `docs/workflow/LOCAL-RULES.md`, `schema.py`(`KNOWN_QUALIFIERS`, `KNOWN_TIER_QUALIFIERS`, `derive_qualifiers`, `derive_tier_qualifiers`), `export_data.py`(`_contract_allows`, `FIRST_SEEN_IN_CONTRACT`), `tests/test_r3_contracts.py`, `tests/test_banner_ops_copy.py`, `tests/test_banner_contract.py` 머리, `tests/test_export_tier_qualifiers.py`(어휘 참조 줄), `.github/workflows/tests.yml`, `pytest.ini`, `.gitattributes`, mono `api/src/test/resources/contracts/offer-cases.json`, mono `web/src/couponModel.js`(122~125행), mono `web/src/offerContract.test.js`(9, 40행), `mono/docs/CHANGE-PROPAGATION.md`, `docs/public/WORKFLOW.md` 7-5.
- 읽지 못한 것: beggars-ops `.github/workflows/ci.yml`과 그쪽 `tests/test_banner_contract.py`(이 체크아웃에 없음). 결정이 든 선례 "`cmp`로 바이트 비교, 다르면 '그대로 복사한다'로 실패"는 결정 문장을 근거로 쓴다. mono API(Java)가 `tierQualifierVocabulary`를 읽는 시험은 grep으로 찾지 못했다(JSON 파일 밖 0건).

## 1. 결정 요약과 비판

사용자 결정(2026-11-15)대로 간다. tracker에 mono 계약 사본을 두고, 수집기가 그 사본에서 어휘를 읽고, CI가 사본을 mono 정본과 바이트로 견준다.

결정을 그대로 받아 적지 않고 짚은 것 셋:

1. **웹 쪽은 이미 막혀 있다.** mono `web/src/offerContract.test.js:40`이 웹 `KNOWN_QUALIFIERS`를 계약 `qualifierVocabulary`와 견준다. 그래서 이번에 고리 하나만 닫으면 된다: 수집기 = 사본(정의가 하나라 구조로 같음), 사본 = 정본(바이트 비교), 정본 = 웹(mono 시험). 처음 안의 "웹 후속 이슈"가 접혀도 빠지는 것이 없다.
2. **`cmp`는 워크플로 단계가 아니라 pytest 시험으로 둔다.** 결정은 beggars-ops 선례(워크플로의 `cmp` 줄)를 들지만, 워크플로 단계는 "일부러 어긋나게 하면 실패한다"를 시험으로 박을 수 없다(`AGENTS.md` "먼저 알 것" 3번). 비교 함수를 pytest 안에 두면 어긋난 바이트로 실패하는 것을 합성 파일로 시험할 수 있고, 실패 알림도 지금 pytest 단계의 슬랙 알림을 그대로 탄다. 비교는 `read_bytes()` 일치로 `cmp`와 같은 엄밀함이다. 결정과 다른 점이라 리뷰 질문 1로 묻는다.
3. **구간 어휘에 코드 안 사본이 하나 더 있다.** `derive_tier_qualifiers`(`schema.py:138~140`)는 `KNOWN_TIER_QUALIFIERS`를 안 읽고 `("첫 주문", "월 1회")`와 `"선착순"`을 글자로 적어 둔다. 계약에 어휘를 하나 더해도 이 함수는 그 말을 못 읽는다. 사본과 바이트 비교가 초록인데 새 어휘가 원장에서 안 읽히는, 이 저장소가 깨지는 꼴 그대로다. 이번에 같이 고친다(3-2).

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에서 `qualifier`, `어휘`, `KNOWN_`, `offer-cases`를 찾았다. **어휘 묶음은 표에 없다**(일치 0건). 가장 가까운 줄은 1번(확실성)의 "원장 값은 tracker `schema.py`의 `ALLOWED_QUALIFIERS`"인데, 그것은 `qualifier`(단수, 확실성 표식)라 이번 어휘(`qualifiers`, 구조화 조건)와 다른 칸이다. 이번에 건드리지 않는다.

표에 없으니 코드를 따라 직접 쟀다.

| 자리 | 이번에 넣나 | 이유 |
|---|---|---|
| `schema.KNOWN_QUALIFIERS`, `KNOWN_TIER_QUALIFIERS` | 넣는다 | 본 작업. 사본에서 읽는다(3-2) |
| `schema.derive_tier_qualifiers`의 글자 목록 | 넣는다 | 1번 비판 3. 어휘를 읽게 바꾼다 |
| `export_data._contract_allows`(`exportKeys`를 mono 작업 트리에서 읽음) | 넣는다 | 같은 파일의 다른 칸이고 결정이 사본 범위에 `exportKeys`를 넣었다. 3-3 |
| `tests/test_r3_contracts.py`의 `offer-cases.json` 시험 넷 | 넣는다 | 결정. 사본을 읽게 바꾼다(3-4) |
| `tests/test_export_tier_qualifiers.py` | 안 고친다 | `schema.KNOWN_TIER_QUALIFIERS`를 참조만 한다. 값이 같으니 그대로 초록이어야 한다. 구현자가 돌려 확인한다 |
| mono 웹 `couponModel.js` `KNOWN_QUALIFIERS`, `offerContract.test.js` | 안 넣는다 | mono는 읽기용 체크아웃. 이미 계약과 견준다(1번 비판 1) |
| mono API의 `tierQualifierVocabulary` 소비 | 안 넣는다 | 시험을 못 찾았다. `schema.py:121~123` 주석의 "계약과 API도 함께 고친다"는 기계로 지켜지지 않을 수 있다. **확인하지 못함**, 리뷰 질문 3 |
| `mono/docs/CHANGE-PROPAGATION.md`에 어휘 묶음과 순서 적기 | 이 PR에서 못 넣는다 | 결정의 할 일이지만 mono는 이 작업에서 읽기용이다. 후속 조치로 버퍼에 넣는다(9번). tracker 쪽 순서는 `schema.py` 주석과 비교 시험의 실패 문구에 적는다 |
| `platforms.json`, `brand-alias-cases.json`도 사본으로 | 안 넣는다 | 3-5 |

## 3. 변경

### 3-1. 사본 파일

- 자리: 저장소 뿌리 `contracts/offer-cases.json`(새 폴더). mono 정본 `api/src/test/resources/contracts/offer-cases.json`을 **그대로 복사한다**(바이트 그대로). 파일 이름을 정본과 같게 둬서 `cp` 한 줄로 갱신된다.
- 폴더 이름을 `contracts/`로 두고 `mono/`를 붙이지 않는 이유: `mono/`는 이미 읽기용 체크아웃 자리라, 그 아래에 두면 체크아웃과 섞여 "mono 작업 트리를 안 읽는다"가 흐려진다.
- 줄바꿈: `.gitattributes`가 `* text=auto eol=lf`라 윈도 체크아웃에서도 LF다. mono도 `.gitattributes`가 있다. 바이트 비교는 CI(우분투, 양쪽 LF)에서만 돌므로 윈도 줄바꿈이 비교를 흔들지 않는다. 구현자는 복사 뒤 `git diff --stat`로 줄바꿈 변환 경고가 없는지 본다.
- 머리에 주석을 넣지 않는다. JSON이라 주석 자리가 없고, 넣으면 바이트 비교가 깨진다. 이 파일이 사본이라는 표시는 3-4의 시험 이름과 실패 문구, `schema.py` 주석이 맡는다.

### 3-2. `schema.py`가 사본에서 읽기

```python
# 구조화 조건 어휘의 정의는 contracts/offer-cases.json(mono 계약의 사본) 한 곳이다. 여기에 값을 적지 않는다.
# 어휘를 늘리는 순서: mono 계약 정본 → 이 사본으로 그대로 복사(cp) → mono 웹. 사본만 고치면
# tests/test_contract_copy.py가 CI에서 실패한다.
_OFFER_CONTRACT = json.loads((Path(__file__).resolve().parent / "contracts" / "offer-cases.json").read_text(encoding="utf-8"))
KNOWN_QUALIFIERS = tuple(_OFFER_CONTRACT["qualifierVocabulary"])
KNOWN_TIER_QUALIFIERS = tuple(_OFFER_CONTRACT["tierQualifierVocabulary"])
```

- **읽기 실패를 빈 어휘로 메우지 않는다.** 파일이 없거나 칸이 없으면 `import schema`가 예외로 죽어야 한다. `try`로 감싸 `()`를 돌려주면 `derive_qualifiers`가 모든 행에 `None`을 내고, 내보내기는 조용히 "조건 모름"이 된다. 시험도 초록이다. 이것이 이 저장소의 실패 방식이라 시끄럽게 죽는 쪽을 고른다. 예약 수집 1단계 게이트가 `schema`를 import하므로, 사본이 빠지면 수집 전에 멈춘다(양성 신호: 게이트가 통과했다면 어휘를 읽었다).
- 값 순서: 지금 튜플 순서가 계약 배열 순서와 같다(`["첫 주문"]`, `["첫 주문", "월 1회", "선착순"]`). `derive_qualifiers`는 `parts` 순서로 결과를 내므로 어휘 순서가 출력에 닿지 않는다. `derive_tier_qualifiers`는 3-2 아래 규칙대로 어휘 순서를 따른다. 지금 값과 결과가 같다.
- `json`, `Path`가 `schema.py`에 이미 import돼 있는지 구현자가 확인하고, 없으면 더한다.

`derive_tier_qualifiers` 변경:

```python
# 앞에 시각, 발급 방식이 붙어 오는 말. 단어로 들어 있으면 읽는다. 나머지 어휘는 note와 정확히 같을 때만.
TIER_QUALIFIERS_BY_WORD = ("선착순",)

found = [q for q in KNOWN_TIER_QUALIFIERS if (q in note if q in TIER_QUALIFIERS_BY_WORD else note == q)]
```

- 지금 동작과 같다: "첫 주문", "월 1회"는 정확히 같을 때, "선착순"은 들어 있을 때. 결과 순서도 어휘 순서라 지금(`첫 주문`, `월 1회`, 그다음 `선착순`)과 같다.
- 어휘가 늘면 새 말은 기본으로 "정확히 같을 때만" 읽힌다. 부분 일치는 다른 뜻을 오독할 수 있어서 보수적인 쪽이 기본이다(`schema.py:116~117` 주석과 같은 원칙).
- `TIER_QUALIFIERS_BY_WORD`는 매칭 규칙이라 계약에 없다. 이 목록이 어휘 밖의 말을 품으면 그 말은 영원히 안 읽힌다. T5가 막는다.

### 3-3. `export_data._contract_allows`가 사본을 읽기

- 읽는 자리를 `mono/api/.../offer-cases.json`에서 `contracts/offer-cases.json`으로 바꾼다. `schema._OFFER_CONTRACT`를 재사용해 같은 파일을 두 번 열지 않는다(`schema`는 이미 `export_data`가 쓰는 모듈인지 구현자가 확인한다).
- **동작이 달라지는 곳**: 지금은 mono 체크아웃이 없는 곳에서 `FIRST_SEEN_IN_CONTRACT`가 `False`라 `firstSeenAt`을 안 싣는다(712행 주석). 계약 `exportKeys`에 `firstSeenAt`이 있으므로(정본 255행) 바꾼 뒤에는 어디서나 `True`다.
  - CI는 이미 mono를 받으므로(`tests.yml` 32~35행) 지금도 `True`다. 712행 주석 "mono가 없는 곳(CI)"은 낡았다. 주석을 지운다.
  - 수집 PC는 mono 사본을 쓰므로(`CHANGE-PROPAGATION.md` 8번 "수집 PC의 mono 사본") 지금도 `True`일 것이다. **확인하지 못함.** 구현자가 예약 수집과 같은 환경에서 바꾸기 전 `python -c "import export_data; print(export_data.FIRST_SEEN_IN_CONTRACT)"`로 본다. `False`라면 바꾼 뒤 운영 export에 `firstSeenAt`이 새로 실리는 변화라 PR 본문에 적는다.
  - 읽기 실패 때 `False`로 접는 `try`는 지운다. 사본은 저장소 안에 있어 없을 수 없고, 없으면 3-2에서 이미 import가 죽는다.

### 3-4. 시험 정리

- `tests/test_r3_contracts.py`: `offer-cases.json`을 읽는 시험 넷(어휘 둘, `exportKeys` 둘)을 새 파일로 옮긴다. `platforms.json`, `brand-alias-cases.json` 시험은 그대로 둔다(ci_only, mono 작업 트리).
- 새 파일 `tests/test_contract_copy.py`. 6번 표의 T1~T6.
- 어휘 두 시험(T3)은 `ci_only`를 **뗀다.** 사본만 읽으니 mono가 필요 없고, 예약 수집 게이트에서 돌아도 된다. 실패하는 경우는 누군가 `schema.py`에 어휘를 다시 글자로 적은 때뿐이다.
- `exportKeys` 두 시험(T6)은 `ci_only`를 **그대로 둔다.** 그중 하나는 `data/export.json`을 읽는데, 이것을 수집 게이트에 넣을지는 이 이슈 밖의 판단이다.
- 바이트 비교(T1)는 `ci_only`다. mono 정본이 있어야 한다.

### 3-5. 다른 계약 파일을 이번에 안 옮기는 이유

- `brand-alias-cases.json`: 시험이 쓰는 별칭표가 어차피 mono `brands.yml`이라(`tests.yml` 25~31행) 사본을 둬도 mono 의존이 안 줄어든다.
- `platforms.json`: `schema.ALLOWED_PLATFORMS`가 같은 구조로 옮겨질 수 있는 후보다. 다만 플랫폼 키는 수집기 곳곳(`banner_routine.PLATFORM` 등)에 상수로 있어 정의를 한 곳으로 모으는 범위가 이번보다 크다. 이번 구조(사본 + 바이트 비교 시험)가 자리 잡은 뒤 같은 틀로 한다. 후속 조치로 버퍼에 넣는다(9번).

## 4. 관측과 미관측 (양성 신호)

"없다 / 같다 / 통과"를 내는 자리마다 무엇을 보고 말하는지 적는다.

| 자리 | 거짓 초록이 나는 경우 | 양성 신호 |
|---|---|---|
| T1 바이트 비교 | mono 체크아웃이 없거나 경로가 바뀌어 비교 대상을 못 찾고 건너뜀 | 정본 파일이 있고 JSON으로 읽히며 `qualifierVocabulary` 칸이 있다. CI(`CI` 환경변수)에서 정본이 없으면 **실패**로 낸다. 건너뜀은 초록과 구별되지 않는다(`tests/test_banner_ops_copy.py:26~31` 선례). 로컬에서만 건너뛴다 |
| T1 바이트 비교 | 로컬 mono 체크아웃이 main이 아닌 브랜치라 다른 것과 같다고 봄 | T1은 `ci_only`라 로컬 게이트에서 안 돈다. CI는 mono 기본 브랜치를 받는다(`tests.yml`에 `ref` 없음). 실패 문구에 "정본은 mono main 원문"을 적는다 |
| `derive_qualifiers`가 `None` | 어휘가 비어서 아무 조각도 못 읽음 | 어휘가 비어 있지 않고 "첫 주문"을 품는다(T2). 사본을 못 읽으면 import가 죽는다(3-2) |
| `derive_tier_qualifiers`가 `None` | 새 어휘를 함수가 모름 | T4가 어휘의 모든 말에 대해 그 말 하나만 적힌 note를 읽는지 본다. 어휘가 늘면 자동으로 새 말도 시험된다 |
| `FIRST_SEEN_IN_CONTRACT` | 파일을 못 읽어 `False`로 접힘 | 접는 길을 지운다(3-3). T6이 `True`를 확인한다 |

## 5. 원장 append-only

원장(`data/log.jsonl`)을 **읽지도 쓰지도 않는다.** 바뀌는 것은 원장 행을 해석하는 어휘의 출처뿐이고 값이 같아 해석 결과도 같다(T4가 지금 동작과 같은 결과를 본다).

## 6. 결론을 박을 테스트

새 파일 `tests/test_contract_copy.py`. 모두 합성 입력이거나 저장소 안 파일이다.

| 번호 | 시험 | 표시 | 박는 결론 |
|---|---|---|---|
| T1 | `contracts/offer-cases.json`의 바이트 == mono 정본의 바이트. 정본 없음: CI면 실패, 로컬이면 건너뜀. 실패 문구: "contracts/offer-cases.json이 mono 정본(main)과 다르다. 사본을 고치지 말고 mono 것을 그대로 복사한다: cp mono/api/src/test/resources/contracts/offer-cases.json contracts/offer-cases.json" | `ci_only` | 끝 조건 둘째(사본이 정본과 다르면 CI 실패) |
| T1b | 비교 함수 `copy_matches(copy_path, canon_path)`에 합성 파일 둘: 같은 바이트 → 참. 한 글자 다름 → 거짓. **줄바꿈만 다름(LF 대 CRLF) → 거짓.** 키 순서만 다른 같은 JSON → 거짓 | 없음 | 비교가 바이트 단위라 "뜻이 같으니 통과"로 느슨해지지 않는다. 끝 조건 셋째(일부러 어긋나면 실패)를 시험으로 박는다 |
| T2 | `schema.KNOWN_QUALIFIERS`가 비어 있지 않고 "첫 주문"을 품는다. `KNOWN_TIER_QUALIFIERS`도 비어 있지 않다 | 없음 | 어휘를 읽었다는 양성 신호 |
| T3 | `schema.KNOWN_QUALIFIERS == tuple(사본["qualifierVocabulary"])`, `KNOWN_TIER_QUALIFIERS == tuple(사본["tierQualifierVocabulary"])` | 없음 | `schema.py`에 어휘를 다시 글자로 적으면(정의가 둘이 되면) 사본을 바꿀 때 실패한다 |
| T3b | `schema.py` 원문에 `KNOWN_QUALIFIERS = (`, `KNOWN_TIER_QUALIFIERS = (`처럼 튜플 글자 정의가 없다. 저장소의 `*.py`(`mono/`, `tests/` 밖)에서 `KNOWN_QUALIFIERS =`, `KNOWN_TIER_QUALIFIERS =` 대입이 `schema.py` 한 줄씩뿐이다 | 없음 | 끝 조건 첫째(정의가 한 곳). 값이 우연히 같아 T3이 통과하는 재정의를 막는다 |
| T4 | 어휘의 각 말 `q`에 대해 `derive_tier_qualifiers({"note": q}) == [q]`. 추가로 지금 동작 고정: `"오전 11시 오픈 발급 선착순"` → `["선착순"]`, `"첫 주문만 가능"` → `None`, `"월 1회"` → `["월 1회"]`, `qualifiers`가 있는 구간은 그대로 | 없음 | 함수가 어휘를 읽는다. 바꾸기 전과 결과가 같다 |
| T5 | `set(schema.TIER_QUALIFIERS_BY_WORD) <= set(KNOWN_TIER_QUALIFIERS)` | 없음 | 매칭 규칙이 어휘 밖의 말을 품지 않는다 |
| T6 | 옮긴 `exportKeys` 시험 둘이 사본을 읽는다. 추가로 `export_data.FIRST_SEEN_IN_CONTRACT is True` | `ci_only` | 계약 읽기가 mono 작업 트리 없이 된다 |

**끝 조건 셋째의 사람 확인**: T1b로 박지만, 구현자는 PR 전에 한 번 사본의 `qualifierVocabulary`에 값을 하나 더한 채로 `python -m pytest tests/test_contract_copy.py`를 mono 체크아웃이 있는 상태로 돌려 T1과 T3이 실패하는 출력을 PR 본문에 붙이고 되돌린다. "실패를 봤다"가 비교가 실제로 돈다는 양성 신호다.

구현자는 전체 `python -m pytest -q`를 돌린다(`tests/test_export_tier_qualifiers.py`, 새 폴더 `contracts/`를 문제 삼는 저장소 구조 시험이 있는지 포함). `AGENTS.md`대로 별칭표 없이 도는 마지막 줄(`docs/HARNESS.md` §11)까지 돌린다.

## 7. 예약 수집에 닿는 것

`schema.py`는 예약 수집이 부르는 코드다. 값이 같아 수집 결과는 안 바뀌지만, 사본을 못 읽으면 import가 죽는다. `AGENTS.md`(사용자 2026-10-15)대로 다음 예약 전에 1단계 게이트(`run_routine.py`가 도는 `pytest -m "not ci_only"`)와 내보내기 단계를 `--skip`으로 골라 돌려 본다. 폰을 잡지 않는다. 이 일은 수집 PC에서 해야 하므로 클라우드 구현자는 PR 본문에 **미확인**으로 적고 병합 전 사람이나 로컬 세션에 넘긴다.

## 8. 하지 않는 것

- `platforms.json`, `brand-alias-cases.json`을 사본으로 옮기는 일(3-5).
- mono 문서, 웹, API 수정(읽기용).
- `exportKeys` 시험을 예약 수집 게이트에 넣는 일.
- 어휘 값 변경.

## 9. 후속 조치

구현 PR의 `### 후속 조치`에 넣을 것(버퍼 경유, `WORKFLOW.md` 7-5):

- mono 변경 전파 표에 qualifiers 어휘 묶음 추가(mono `docs`): `docs/CHANGE-PROPAGATION.md`에 자리(계약 정본 `offer-cases.json`의 두 어휘 칸, 웹 `KNOWN_QUALIFIERS`, 수집기는 tracker 계약 사본을 읽음), 끊기면 보이는 것(수집기는 읽는데 웹은 모르는 조건이 칩에서 사라짐), 막는 것(웹 `offerContract.test.js`, tracker 사본 바이트 비교), 순서(계약 정본 → tracker 사본 복사 → 웹)를 적는다. 공개 저장소라 tracker 내부 경로는 "tracker 계약 사본"으로만 쓴다. 끝 조건: 표에 한 묶음이 있고 네 칸이 다 있다.
- platforms 계약을 tracker 사본으로(tracker `export`): `platforms.json`을 `contracts/`로 복사하고 `schema.ALLOWED_PLATFORMS`가 사본에서 읽게 하고 바이트 비교 시험을 같은 틀로 단다. 끝 조건: `test_r3_contracts.py`의 platforms 시험이 mono 작업 트리 없이 돈다.

## 10. 리뷰 질문

1. 결정의 "CI가 `cmp`로 비교"를 워크플로 단계 대신 pytest 바이트 비교(T1, T1b)로 해도 되는가? 엄밀함은 같고, "어긋나면 실패"를 시험으로 박을 수 있다.
2. 사본을 못 읽으면 `import schema`가 죽게 하는 것(빈 어휘로 메우지 않음)에 동의하는가? 예약 수집 1단계에서 멈춘다.
3. **mono API가 `tierQualifierVocabulary`를 시험으로 견주는지 확인하지 못했다.** 견주지 않으면 구간 어휘는 웹, API 쪽 고리가 열려 있다. 9번 첫 항목에 넣을지?
4. **수집 PC에서 지금 `FIRST_SEEN_IN_CONTRACT`가 `True`인지 확인하지 못했다**(3-3).
