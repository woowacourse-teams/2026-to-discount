<!-- 원본: tracker docs/specs/issue-104-routine-false-suspect-3s-3w.md — 여기서 고치지 않는다 -->
# 이슈 104: 점검 보고서의 거짓 SUSPECT(3s 공유 링크 비교, 3w 단계 없음) 제거

영역: `collect` (3s는 폰에서 읽은 링크를 다루는 `coupangeats_share_link.py`, 3w 건너뜀 기록은 `run_routine.py`). 시험은 폰 없이 돈다. 구현 뒤 3s는 실제 수집으로 한 번 시험한다(`scripts/collect_trial.ps1`).

## 1. 문제

`reports/routine-2026-11-03.md`에 매일 같은 SUSPECT 둘이 뜬다. 둘 다 거짓 경보이고, 진짜 이상(5b, 4단계 판독 실패)이 묻힌다.

| 단계 | 지금 SUSPECT가 뜨는 이유 | 실제 |
|---|---|---|
| 3s | `coupangeats_share_link.py:143`이 폰이 읽은 링크 문자열을 상수(`COUPANGEATS_LINK`)와 그대로 견준다. 공유 버튼은 누를 때마다 새 토큰을 주므로(11-02 `OjV3DchnI7b`, 11-03 `aaBiYafnI7b`, 상수 `dqUf2prBE7b`) 항상 다르다 | 셋 다 같은 이번 주 허브(`V5_DEAL_1102_HL`)로 풀린다 |
| 3w | `check_routine.py:161`이 로그에 `-- 3w)` 머리줄이 없으면 SUSPECT. `PIN_ONLY`(`run_routine.py:46,719`)는 sub2가 안 붙었거나 `devices.json`에 고정이 없으면 단계를 큐에 넣지 않고 머리줄도 안 남긴다 | 의도한 건너뜀. 그런데 판정기는 "안 돌았다"와 "돌았어야 하는데 로그가 사라졌다"를 못 가른다 |

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에는 3s, 3w, 판정기 단계 이름이 직접 걸린 줄이 없다(쿠팡이츠 줄은 최소 주문금액 출처 하나뿐). 없다고 말하고 시작한다. 대신 코드에서 직접 찾은 짝은 다음과 같다.

| 같이 볼 자리 | 넣나 | 이유 |
|---|---|---|
| `capture/coupangeats_share.py` `resolve_share_key`, `week_tag`, `share_link` | 쓰기만, 고치지 않음 | 이미 reflect가 쓰는 허브 키 풀이. 새 해석기를 만들지 않고 같은 함수로 견줘야 판정과 반영이 갈라지지 않는다 |
| `capture/coupangeats_hub.py` `_cached_key`, `find_hub_key` | 안 고침 | 3s가 허브를 연 뒤의 캐시를 읽는 쪽. 비교에는 링크를 푼 키만 쓴다 |
| `banner_routine.py` (6단계가 `captures/coupangeats-hub-share-<날짜>.json`의 `url`을 배너 url로 씀) | 안 고침. `url` 필드는 그대로 둔다 | JSON에 `key`, `const_key` 필드를 더하기만 한다. 읽는 쪽 필드는 안 바뀐다 |
| `docs/setup/ROUTINE-SPEC.md` 단계 3s, 3w | 고침 | 성공 신호 문장을 바꾸면 `check_routine.py`도 바꾼다는 규칙(§ 끝) |
| `tests/test_check_routine.py::test_spec_and_checker_list_the_same_steps` | 안 바뀜 | `STEPS`에서 3w를 빼지 않는다(아래 4절) |
| mono `COUPANGEATS_LINK`, `offerChip.snapshot.json` | 안 고침, 읽기만 | 월요일 교체는 사람 몫(AGENTS.md). 이 이슈는 교체가 빠졌을 때 3s가 알리게 하는 쪽 |

## 3. 3s: 링크 문자열이 아니라 풀린 허브 키로 견준다

### 바꾸는 것

`coupangeats_share_link.py`의 문자열 비교(`url != share_link()`)를 순수 함수 하나로 바꾼다.

```
compare_share_keys(phone_url, const_url, fetch) -> (판정, 메시지, phone_key, const_key)
```

- 두 링크를 `resolve_share_key(url, fetch)`로 풀어 `week_tag`(MMDD)를 견준다. 허브 키 전체가 아니라 주 표시로 견주는 까닭은 `share_link_fresh`(`coupangeats_share.py:118`)가 이미 그렇게 하기 때문이다. 같은 기준을 쓴다.
- 판정은 셋이다.
  - `same`: 두 주 표시가 있고 같다 → `[suspect]` 줄을 찍지 않는다. 대신 정보 줄 `허브 키: V5_DEAL_1102_HL (상수와 같은 주)`를 찍는다.
  - `stale`: 두 주 표시가 있고 다르다 → `[suspect] 폰이 읽은 링크는 <폰 키>(<MMDD>) 허브인데 상수는 <상수 키>(<MMDD>) 허브다 — mono COUPANGEATS_LINK를 새 링크로 바꿀 것`.
  - `unknown`: 한쪽이라도 풀리지 않거나 주 표시가 없다 → `[suspect] 허브 키를 못 풀어 상수와 견주지 못했다(폰 <키|풀림 실패>, 상수 <키|풀림 실패>)`. 못 풀었다고 "같다"로 통과시키지 않는다.
- 저장 JSON(`share_record`)에 `key`(폰 링크가 풀린 키)와 `const_key`를 더한다. 기존 `url`, `label`, `captured_at`은 그대로.

### 양성 신호

"상수와 같은 주"라고 말하려면 **두 쪽 다 키가 실제로 풀렸다**는 것이 필요하다. 풀림 실패는 `same`이 아니라 `unknown`이다(AGENTS.md "먼저 알 것" 1번). `same`일 때도 풀린 키 이름을 로그에 남겨 보고서에서 내용을 읽을 수 있게 한다.

### 판정기

`check_routine.py` 3s 블록은 `[suspect]` 줄 유무를 이미 본다. `same`이면 그 줄이 없으니 PASS가 된다. 판정기 코드는 근거 문구만 바꾼다: PASS 근거에 정보 줄의 `허브 키: …`를 붙여 `공유 링크 <파일>` 대신 어떤 주로 풀렸는지 보이게 한다.

### 끝 조건 시험

- 11-04: 폰이 읽은 `aaBiYafnI7b`류 링크와 상수가 둘 다 `V5_DEAL_1102_HL`로 풀리면 `[suspect]`가 없고 3s PASS.
- 11-09(월): 상수가 `V5_DEAL_1102_HL`이고 폰이 읽은 링크가 `V5_DEAL_1109_HL`이면 `stale` → 3s SUSPECT. 이를 가짜 `fetch`를 주입하는 시험으로 박는다(네트워크 없이).

## 4. 3w: 의도한 건너뜀을 로그에 남기고, 판정기는 그것만 건너뜀으로 읽는다

판정기에서 3w를 통째로 빼면 sub2가 붙어 돌아야 하는 날 3w가 사라져도 아무도 모른다. 빼지 않는다. 대신 "안 돈 이유가 의도였다"를 양성 신호로 남긴다.

### 바꾸는 것

- `run_routine.py`: `PIN_ONLY` 단계가 기기 없음으로 큐에 안 들어갈 때(`:719`), 통합 로그에 머리줄 `-- 3w) … 건너뜀(그 폰 전용, 고정한 폰이 안 붙음)`을 한 줄 남긴다. 기존 `--skip` 건너뜀 줄(`:780`)과 같은 꼴이라 `check_routine._skipped`가 읽는다.
- `check_routine.py` 3w 블록 맨 앞: `_skipped(log, "3w")`이고 `Traceback`이 없으면 판정 어휘에 SKIP이 없으므로 **PASS, 근거 "건너뜀(그 폰 전용)"**. 머리줄이 아예 없을 때는 지금처럼 SUSPECT(`로그에 단계가 없다`)를 유지한다. 의도한 건너뜀은 줄이 있고, 줄이 사라진 날은 여전히 보인다.
- 사용자가 `--skip 3w`로 일부러 뺀 날(`:780`)도 같은 머리줄 규칙이라 PASS(건너뜀)로 읽힌다. 4단계의 기존 처리(`_skipped(log, "4")`)와 같은 패턴.

### 열린 질문(구현 전에 사용자 확인)

보고서의 "3w는 지금 루틴에 없다"는 이슈 서술과 달리 코드에는 3w가 `run_routine.py:157`에 있고 `PIN_ONLY`다. 11-03 로그에 머리줄이 없었던 이유가 (a) sub2가 안 붙음, (b) `devices.json`에서 `"steps": ["3w"]` 고정이 빠짐 중 어느 쪽인지는 이 세션이 `reports/`와 `logs/`를 읽을 수 없어 확인하지 못했다. (b)라면 3w는 영구히 안 도는 단계이므로, 판정기의 "건너뜀 → PASS"보다 `devices.json` 복구가 맞는 처방일 수 있다. 구현자는 로그에서 원인을 먼저 확인한다.

## 5. 박을 테스트

`tests/test_check_routine.py`와 새 `tests/test_coupangeats_share_link_compare.py`(새 test 파일이므로 `pytest` 목록에 자동 수집되는지 확인).

1. 두 링크가 문자열은 다르고 키(`V5_DEAL_1102_HL`)는 같다 → `same`, `[suspect]` 없음.
2. 월요일 교체: 상수 `…1102…`, 폰 `…1109…` → `stale`, 메시지에 두 MMDD가 들어 있음.
3. 폰 링크 풀림 실패(fetch가 예외) → `unknown`, `same`이 아님.
4. 상수만 풀림 실패 → `unknown`.
5. 판정기: 3s 로그에 정보 줄만 있고 `[suspect]`가 없으면 PASS이고 근거에 키가 들어 있음. `[suspect]` 줄이 있으면 SUSPECT(기존 동작 유지).
6. 판정기: `-- 3w) … 건너뜀(그 폰 전용…)` 머리줄 → PASS. 머리줄 없음 → 여전히 SUSPECT. 머리줄 있고 Traceback → SUSPECT.
7. `run_routine`: sub2가 안 붙은 구성에서 통합 로그에 3w 건너뜀 머리줄이 실제로 남는다(기존 `router`/`step_pins` 시험 패턴 재사용).
8. 문서 시험(`test_spec_and_checker_list_the_same_steps`)은 `STEPS`를 안 바꾸므로 그대로 통과해야 함.

## 6. 원장

`data/log.jsonl`을 건드리지 않는다. 바뀌는 산출물은 `captures/coupangeats-hub-share-<날짜>.json`(필드 추가)과 보고서 판정뿐이라 append-only 문제가 없다.

## 7. 하지 않는 것

- 폰이 읽은 링크로 상수를 자동 교체하지 않는다. 월요일 교체는 사람이 확인한 뒤 한다(AGENTS.md). 3s는 알리기만 한다.
- `STEPS`에서 3w를 빼지 않는다.
- 시각이나 요일로 "이번 주"를 추정하지 않는다(`current_hub_tag` 주석, 2026-10-21 사용자). 두 링크가 풀린 키끼리만 견준다.

## 8. 문서

`ROUTINE-SPEC.md` 단계 3s의 성공 신호를 "폰 링크와 상수가 같은 주 허브 키로 풀림, 아니면 `[suspect]`"로, 3w에 "고정한 폰이 안 붙으면 건너뜀 머리줄을 남기고 판정은 PASS(건너뜀)"를 적는다. 문서 문장은 테스트 5, 6이 같은 내용을 강제하므로 보조일 뿐이다.

## 변경 이력

- 2026-11-03 구현: 4절 열린 질문 확인. 11-03 00:01 로그(`logs/after-open-2026-11-03.log`) 기기 배정에 sub2가 없고, `data/devices.json`에서 sub2는 2026-10-22 사용자 결정으로 수집에서 빠졌다("3w는 고정할 일반 계정 폰이 없어 안 돈다"). 원인은 (b)에 가깝다(고정 폰 자체가 없음). 판정기 처방은 설계대로 두고 새 폰 고정은 사람 몫으로 남긴다. 같은 날 03:09, 09:36 실행의 `-- 3w) … 건너뜀(--skip)`도 "대조 줄 없음" SUSPECT였는데 이번 변경으로 PASS(건너뜀)가 된다.
