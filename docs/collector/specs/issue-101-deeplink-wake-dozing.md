<!-- 원본: tracker docs/specs/issue-101-deeplink-wake-dozing.md — 여기서 고치지 않는다 -->
# 이슈 #101: 허브 딥링크가 꺼진 화면(Dozing)에서 실패한다

영역: `collect` (폰이 필요하다. 실기 시험은 노트20).

## 1. 문제

- 2026-11-03 00:22(3단계)와 02:39(7단계)가 `deeplink_did_not_open_app`으로 실패했다. 증거 캡처가 통째로 검고, 02:43에 폰은 `mWakefulness=Dozing`, 잠금 화면이었다.
- 5387ff0이 `capture/coupangeats.py open_promotion`(283행)에 `KEYCODE_WAKEUP` 한 번을 넣었다. 이 호출은 결과를 보지 않는다. Dozing에서 한 번에 안 깬 기록이 있다(10-23 노트20, `phone_cycle.wake` 주석). 잠금 화면도 걷지 않는다.
- 실패 판정이 늦다. `open_promotion`은 화면이 꺼져 있어도 `patience(40초)`를 다 기다린 뒤 실패한다. 3단계 재시도는 허브 전체를 다시 읽어 78분이 걸렸다(90분 상한 직전).
- 화면 꺼짐 시간이 2분(`SCREEN_OFF_MS`)이다. 단계 안에서 입력 없는 구간이 2분을 넘으면 꺼진다.

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에서 딥링크, 깨우기에 해당하는 묶음은 찾지 못했다. 이 변경은 mono의 api, web에 닿지 않는다. 수집기 안에서 같은 일을 하는 자리를 직접 센 결과다.

| 자리 | 지금 | 이번에 |
|---|---|---|
| `capture/coupangeats.py open_promotion` | WAKEUP 한 번, 결과 안 봄 | `ensure_awake` 호출, 검은 화면 분류 추가 |
| `capture/coupangeats_hub.py` 273, 566행 | `open_promotion` 경유(3, 3s, 5a, 6, 7단계) | 코드 변경 없음. 위 한 곳으로 모두 덮임 |
| `capture/coupangeats_hub_key.py` 80행 | `open_promotion` 경유 | 같음 |
| `scripts/coupangeats_share_link.py` 68행 | `open_promotion` 경유 | 같음 |
| `capture/common.py wait_for_package` | 깨우기 없음, `require_unlocked`가 단계 시작에 한 번 | **넣는다**: 같은 실패(`deeplink_did_not_open_app`)가 배민, 요기요, 땡겨요에도 난다 |
| `capture/phone_cycle.py wake` | 정본 깨우기(WAKEUP 3번, scrcpy, 밀기) | 그대로 쓴다. 가져다 부르기만 한다 |
| `scripts/run_routine.py` 3단계 재시도 | 허브 전체 재시도 | 검은 화면 실패는 재시도하지 않게 구분한다(§4) |

넣지 않는 것: 요기요, 땡겨요의 개별 링크 순회(`scripts/*_links.py`). `wait_for_package` 한 곳을 고치면 같이 덮이므로 따로 고치지 않는다.

순환 import 주의: `phone_cycle`가 `capture.common`을 import한다. `common.py`에서 `phone_cycle.wake`를 부를 때는 함수 안에서 늦게 import한다.

## 3. 설계

### 3-1. 딥링크 전 깨움 (할 일 1)

`capture/common.py`에 `ensure_awake(serial) -> bool`을 둔다.

- `phone_cycle.is_awake`가 이미 `Awake`인지 본다. 이미 깨어 있고 키가드가 없으면 adb 호출 두 번으로 끝낸다(수집 속도에 영향 거의 없음).
- 아니면 `phone_cycle.wake(serial)`을 부른다(WAKEUP 3번, LG 폰은 scrcpy, `wake_and_swipe`로 잠금 화면 밀기).
- 반환값은 `wake`의 결과다. 거짓이면 `DeviceAsleep`(기존 예외)을 던진다. 못 깬 채 딥링크를 쏘면 40초 뒤 "화면 도달 못 함"으로 보이고, 이는 링크가 죽은 것과 구분되지 않는다. 죽은 링크 원장(`data/dead_links.json`)에 잘못 쌓일 수 있다.
- 호출 자리: `open_promotion`에서 `force_stop` 앞(기존 WAKEUP 줄 대체), `wait_for_package`의 첫 폴 앞. 두 곳 모두 딥링크를 쏘는 호출자가 아니라 기다림 함수 쪽이다. 딥링크는 그 앞에서 이미 쏘아졌으므로 `open_promotion`은 쏘기 전, `wait_for_package`는 첫 폴이 빈 화면이면 한 번 깨우고 **딥링크를 다시 쏘기 위해 호출자에게 예외로 돌려준다**(§3-2의 `ScreenOff`).

### 3-2. 검은 캡처 분류 (할 일 2)

- `capture/common.py`에 `is_black_screen(img) -> bool`: 스크린샷 전체 픽셀의 최댓값 밝기가 임계(8/255) 이하면 참. 양성 신호는 "스크린샷을 실제로 찍었다(크기 > 0)"와 "`dumpsys power`가 `Awake`가 아니다" 둘 다다. 이미지만으로 판정하지 않는다. 어두운 앱 화면과 구분하려는 것이다.
- `ScreenOff(DeviceAsleep)` 예외를 둔다. 메시지는 `screen_off: 화면 꺼짐으로 도달 못 함`으로 `deeplink_did_not_open_app`과 접두어가 다르다.
- `open_promotion` 대기 루프: 폴마다 뷰 트리에 `PACKAGE` 노드가 없을 때만, 10초 지난 시점에 한 번 `Awake`를 확인한다. `Awake`가 아니면 `ensure_awake` 후 딥링크를 한 번 다시 쏜다. 다시 쏜 뒤에도 안 깨어 있으면 40초를 기다리지 않고 바로 `ScreenOff`를 던진다.
- 실패 시 `save_evidence` 호출 전에 검은 캡처를 분류해 태그를 `coupangeats_promotion_screen_off`로 바꾼다. 검지 않으면 기존 태그 `coupangeats_promotion_unreached`를 유지한다.

### 3-3. 재시도 (할 일 2의 뒷부분)

`ScreenOff`는 "허브 전체를 다시 읽는" 단계 재시도(`run_routine.py` 437~472행)를 건너뛴다. 이유: 깨우기를 이미 두 번(진입 전, 한 번 재시도) 시도했다. 재시도는 같은 폰을 같은 상태로 또 두드려 47분을 쓴다. 출력에 `screen_off:`가 있으면 `[retry] 화면 꺼짐이라 재시도 안 함`을 남기고 바로 실패 처리한다. 다른 폰으로 넘기는 경로(takeover)가 있으면 그 경로는 유지한다.

### 3-4. 단계 안에서 꺼지지 않게 하기 (할 일 3)

선택지:

| 안 | 내용 | 장점 | 단점 / 되돌림 |
|---|---|---|---|
| A (권장) | 아무것도 켜 두지 않고, 3-1의 깨움을 진입 지점마다 둔다 | 폰 설정을 안 건드린다(AGENTS.md 규칙: 화면 꺼짐 시간, 충전 중 켜짐은 바꾸지 않음) | 입력 없는 구간에 꺼지면 다음 진입에서 한 번 깨움 비용 |
| B | 단계 시작에 `svc power stayon true`, 끝에 `false` | 단계 안 꺼짐 없음 | 단계가 죽으면 `false`가 안 불린다. 폰이 계속 켜진 채 남음. 되돌림: `svc power stayon false`, `prepare_devices`에서 매 수집 시작에 `false`로 되돌림 |
| C | 오래 입력 없는 구간에서 주기적으로 `KEYCODE_WAKEUP` | 설정 변경 없음 | 코드가 여기저기 퍼짐 |

결정: **A로 간다.** `svc power stayon`은 폰 설정이다. AGENTS.md가 "폰 설정은 바꾸지 않는다"고 못 박았고, 서브에이전트가 설정을 바꾸고 못 되돌린 선례가 있다(2026-10-06). B가 필요해지면 사용자 승인 뒤 `prepare_devices`와 `finish_devices`에 짝으로 넣는다는 점만 이 문서에 남긴다.

## 4. "없다 / 0 / 통과"를 내는 자리와 양성 신호

| 자리 | 위험 | 양성 신호 |
|---|---|---|
| `ensure_awake` 통과 | 깼다고 믿고 딥링크 | `dumpsys power`에 `mWakefulness=Awake`가 **읽힌** 것, 키가드 없음. 읽기 실패(`ERR`)는 통과가 아니다 |
| `open_promotion` 성공 | 쿠폰 없음과 못 읽음 혼동 | 기존: `PACKAGE` 노드 존재와 `ready(xml)`. 변경 없음 |
| 검은 캡처 분류 | 어두운 정상 화면을 꺼짐으로 오분류 | 이미지 검음 **그리고** `Awake` 아님. 둘 다일 때만 `ScreenOff` |
| 재시도 생략 | 일시 실패를 영구로 취급 | `screen_off:` 접두어가 출력에 있을 때만. `deeplink_did_not_open_app`은 기존대로 재시도 |
| 죽은 링크 원장 | 꺼진 화면 실패가 죽은 링크로 쌓임 | `ScreenOff`는 `deeplink_did_not_open_app`이 아니므로 `baemin_links.py` 등의 연속 실패 집계에 안 들어간다(시험으로 박는다) |

## 5. 원장 (append-only)

`data/log.jsonl`을 건드리지 않는다. 실패한 수집은 원래도 원장에 안 들어간다. 이 변경은 값을 쓰는 경로가 아니라 읽기 전 준비 경로다.

## 6. 시험 (결론은 테스트로 박는다)

자동 시험 (폰 없이):

1. `ensure_awake`: `Awake`면 `wake`를 부르지 않음 / `Dozing`이면 `wake`를 부름 / `wake`가 거짓이면 `DeviceAsleep`.
2. 순서: `open_promotion`에서 `ensure_awake` 호출이 `force-stop`과 `open_url`보다 먼저(기존 `test_open_promotion_wakes_screen_before_deeplink` 대체).
3. `is_black_screen`: 전부 검은 이미지 참, 어두운 글자가 있는 이미지 거짓.
4. 분류: 검은 캡처 + `Dozing` → 태그 `screen_off`, 예외 `ScreenOff`. 검은 캡처 + `Awake` → 기존 `unreached`.
5. `ScreenOff` 후 40초를 기다리지 않음(`patience` 가짜 시계로 폴 횟수 확인).
6. `ScreenOff`가 죽은 링크 연속 실패 집계(`tests/test_session_streak.py` 방식)에 안 잡힘.
7. `run_routine` 재시도: 출력에 `screen_off:`가 있으면 재시도 안 함, `deeplink_did_not_open_app`은 재시도.
8. `wait_for_package`: 첫 폴이 빈 화면 + `Dozing`이면 `ScreenOff`.

실기 시험 (끝 조건, 노트20): `scripts/collect_trial.ps1`로 예약을 끄고 시험한다. 폰을 `adb shell input keyevent KEYCODE_SLEEP`로 Dozing에 둔 뒤 3단계와 7단계를 시작해 성공하는지 본다. 화면 꺼짐 시간 설정은 바꾸지 않는다. 시험 중 꺼지면 `python scripts/wake_phones.py --serial <기기>`. 잠금 화면에 패턴이 걸려 있으면 사람이 푼다.

## 7. 열린 질문

- **`wake`의 scrcpy 경로(LG)가 `open_promotion` 안에서 60초까지 걸릴 수 있다.** 노트20은 adb만으로 충분하지만 V50, X6은 확인하지 못했다.
- 10초 시점의 `Awake` 확인이 정상 콜드 스타트(최대 24초 기록)를 방해하지 않는지는 `logs/waits`로 실측해야 한다. 확인하지 않은 가정이다.
