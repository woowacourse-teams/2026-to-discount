<!-- 원본: tracker docs/specs/2026-11-06-device-fleet-design.md — 여기서 고치지 않는다 -->
# 기기 함대 설계: 레지스트리, 측정, 전략, 생애주기, 자격 (2026-11-06)

상태: 설계 승인(사용자 2026-11-06, 1~3절 각각 승인) 뒤 콜드 리뷰 반영(판 2, 11절). 구현 계획은 별도 문서. 이슈 #179.

대체 관계:
- `docs/specs/2026-10-01-device-profiles-design.md`의 프로필과 quirk 부분을 이 문서가 잇는다. iOS 드라이버는 범위 밖이다(8절 "새 OS" 행).
- `docs/specs/phone-pool-units.md`의 "계정 제약" 항목을 5절 자격 계산이 대체한다. 그 문서의 작업 단위와 공용 큐는 범위 B다.

## 용어

| 말 | 뜻 |
|---|---|
| 단계 | 수집 루틴의 한 줄. id와 하는 일은 `scripts/run_routine.py` `STEP_TITLES`(예: 3 쿠팡이츠 허브, 4a 배민 브랜드관 전수조사, 7 배너 검증) |
| 범위 A, B, C | A 이 문서(기기). B 배치(작업 단위 큐, 실패 재시도, 늦게 빈 폰 끼어들기). C 단계 이관(4a, 7, 6, 4c, 4d를 단위 큐로) |
| 1b 점검 | 수집을 막지 않는 점검(`task_table`의 1b). 실패하면 알림만 |
| 덮개 걷기 | 알림창 접기와 잠금 화면 밀기 |
| 비행기 모드 + 와이파이 | 수집 중 폰은 비행기 모드를 켜고 와이파이만 켠다(사용자 2026-10-21, 통화와 모바일 데이터를 끊어 화면을 가리는 알림을 줄인다). 반납 때 끈다 |
| #120 | 반납 때 비행기 모드를 다시 읽어 확인하고 못 끄면 슬랙 경고(tracker #120) |

## 0. 왜

기기 차이를 한 경로가 뭉갠 사고가 2026-09-30부터 11-06까지 22건이다(부록 A). 매번 그 자리에 대비를 덧댔다. 마지막은 11-06 01:12 7단계: 랜딩 대기가 adb 깨우기만 보내 V50(adb 깨우기 무시)이 안 켜졌고 458초를 돌다 단계가 끊겼다(`logs/steps/2026-11-06/7.log`).

같은 시기 문서끼리 어긋난 기기 값이 11개였다(부록 B). 기기 특성을 사람 메모나 세션 기억에서 가져오면 다시 틀린다. 그래서:

- 기기가 스스로 답할 수 있는 것은 **측정**해서 데이터로 둔다.
- 사람만 아는 것(앱별 계정, 사람이 눈으로 확인한 능력)만 **선언**한다.
- 코드는 기기 이름이나 시리얼로 분기하지 않고, 측정값과 선언값으로 고른 **전략**을 쓴다.
- 단계를 돌 수 있는 폰은 단계 **요구**와 기기 데이터에서 **계산**한다. 손으로 정하는 것은 순서뿐이다.

## 1. 확정 사실 (2026-11-06)

측정(02:46, `getprop`, `wm size`, `wm density`, `dumpsys package com.google.android.webview`, `cmd connectivity airplane-mode`, 읽기만):

| id | 이름 | 시리얼 | 모델 | Android(sdk) | 화면 | 웹뷰 | `cmd connectivity` |
|---|---|---|---|---|---|---|---|
| sub3 | 노트20 | <폰 일련번호> | SM-N981N | 13(33) | 1080x2400 | 156 | 있음 |
| sub4 | V50 | <폰 일련번호> | LM-V500N | 12(31) | 1440x3120, 덮어쓴 해상도 1080x2340이 남아 있음 | 156 | 있음 |
| main | A8 Star | <폰 일련번호> | SM-G885S | 8.0(26) | 1080x2220 | 69 | 없음 |
| sub | V30 | <폰 일련번호> | LGM-V300S | 9(28) | 1440x2880, 밀도만 640에서 560으로 | 77 | 있음 |
| sub2 | X6(제외) | <폰 일련번호> | LM-X625N | 10(29) | 720x1520 | 156 | 있음 |

계정과 등급(지금 `devices.json` `accounts`, `baemin` 칸과 사용자 확정에서 옮김):

| 폰 | 배민 | 쿠팡이츠 | 요기요 | 땡겨요 |
|---|---|---|---|---|
| 노트20 | 멤버십, 주계정 | 와우, 주계정 | 멤버십, 주계정 | 기본, 주계정 |
| V50 | 멤버십, 주계정 | 와우, 주계정 | 멤버십, 주계정 | 기본, 주계정 |
| A8 | 멤버십, 주계정 | 기본(와우 아님), 주계정 아님 | 멤버십, 주계정 | 기본, 주계정 |
| V30 | 멤버십, 주계정 | 기본(와우 아님), 주계정 아님 | 멤버십, 주계정 | 기본, 주계정 |

- 배민은 네 폰 다 주계정이다(사용자 11-06).
- 요기요는 네 폰 다 같은 계정이고 저장 주소는 8곳이다(사용자 11-06).
- 쿠팡이츠 와우 아닌 폰(A8, V30)의 계정 이름은 기록에 없다. 계정 이름이 조건인 쿠팡이츠 단계는 없어서 `account`는 "기본 계정"으로 둔다.

요기요 주소 바꾸기(사용자 11-06): 다른 폰은 주소 시트에서 입력창(키보드)이 떠 화면을 가리고, 앱 전환 창과 뒤로가기로 걷는 별도 로직(`capture/yogiyo_address.py:90`)을 탄다. V50은 입력창이 안 뜬다. 그래서 주소를 바꾸며 도는 4c는 V50을 **권장**한다. 다른 폰도 기존 주소 변경 로직으로 돌 수는 있다(사용자 11-06). 자격 조건이 아니라 순서로 둔다: `step_order."4c"`에서 V50 먼저, `why`에 "주소 시트에서 입력창이 안 뜸".

V50 해상도(V-3 닫음): 03:27에 덮어쓴 해상도와 밀도를 지웠다(`wm size reset`, `wm density reset`, 이제 1440x3120, 밀도 560). `collect_trial`로 `driver_smoke.py`(노드 158, 자리 있음 146, 스크린샷 1440x3120, 요기요 앞) OK, `yogiyo_couponbox_daily.py`(읽기만, 하단 탭 좌표로 쿠폰함 진입, 62장) 종료 코드 0. 되돌리기: `adb -s <폰 일련번호> shell wm size 1080x2340`, `wm density 420`. 배민, 쿠팡이츠, 땡겨요 경로는 이 해상도로 아직 안 돌렸다(V-7).

사용자 확정(대화 2026-11-06):
- 노트20은 공유 링크 복사가 된다. `pool."4d"`의 "노트20은 못 받는다"는 낡았다.
- A8 쿠팡이츠는 와우가 아니다.
- V50 해상도는 1440x3120이다. 1080x2340은 추가 화면을 연결했을 때의 값이다(V-3).
- 모든 폰에 화면 잠금이 없다(11-05, `devices.json` `_lock`).
- 단계별 예외가 늘거나 바뀌는 위험은 지금은 감수한다. 재검토 날짜로 따라간다(5.2).

## 2. 도메인 모델

### 2.1 두 파일

**`data/devices.json`: 사람이 선언한다. 코드는 읽기만 한다.** 판을 2로 올린다(`"schema": 2`).

```json
{
  "schema": 2,
  "devices": [
    {
      "id": "sub4", "name": "LG V50", "serial": "<폰 일련번호>", "wireless": null,
      "os": "android", "enabled": true, "priority": 2,
      "accounts": {
        "baemin":      {"account": "주계정", "tier": "membership", "since": "2026-11-05"},
        "coupangeats": {"account": "주계정", "tier": "wow", "since": "2026-10-21"},
        "yogiyo":      {"account": "주계정", "tier": "membership", "since": "2026-10-21"},
        "ddangyo":     {"account": "주계정", "tier": "basic", "since": "2026-10-21"}
      },
      "abilities": {
        "share_link_copy":           {"value": true,  "checked": "2026-11-05"},
        "coupangeats_hub_top_cards": {"value": false, "checked": "2026-11-02"}
      },
      "quirks": {},
      "note": "사람 메모. 코드는 읽지 않는다"
    }
  ],
  "step_order": {
    "4a": {"order": ["sub", "sub4", "sub3", "main"], "why": "A8 덤프 6.5초(다른 폰 3~5초)", "since": "2026-11-05", "review_after": "2026-12-05"}
  },
  "exclusions": [
    {"step": "4b", "device": "sub", "why": "땡겨요를 켜 두면 덤프 성공률 1/10", "since": "2026-09-30", "review_after": "2026-12-05"}
  ]
}
```

- `tier` 값: 배민 `membership|basic|none`, 쿠팡이츠 `wow|basic|none`, 요기요 `membership|basic|none`, 땡겨요 `basic|none`. `none`은 로그인 안 됨.
- `account`는 계정 이름이다. 같은 계정끼리 같은 문자열을 쓴다(5단계처럼 계정 자체가 조건인 단계가 있다).
- `abilities`는 사람이 눈으로 확인한 능력이다. 측정기로 잴 수 있게 되면 측정 저장소로 옮긴다.
- `priority`는 1이 먼저다. 처음 값은 `_priority` 주석의 순서: 노트20 1, V50 2, A8 3, V30 4.
- 요기요 주소 수는 네 폰이 같은 계정이라 폰 능력이 아니다. 4c가 도는 주소는 `data/yogiyo_addresses.json`이 정한다. 그래서 `abilities`에 넣지 않는다. 4c에서 V50을 먼저 두는 이유(입력창 안 뜸)는 `step_order."4c".why`에 적는다.
- 남기는 키: `os`(`capture/driver/__init__.py:9`가 `os_of`로 드라이버를 고른다), `quirks`(판독기가 `device_profile.quirk`를 묻는다), `taps`(사람이 적는 탭 비율, `capture/device_profile.py:85`).
- 옮기는 키: `baemin.account`, `baemin.purpose`는 `accounts.baemin`으로(`scripts/full_audit.py:593`이 읽는다. A3-2에서 읽는 곳을 바꾼다). `spots`는 측정 저장소로(아래).
- 없애는 키: `apps`, `takeover`, `steps`, `assist`, `couponbox_device`, `pool`, `load_factor`, `lock`, `rotate`, `_excluded`(제외된 기기는 `enabled: false`로 같은 목록에). 읽는 코드를 A3-2가 없앤 뒤 A1-4(맨 끝)에서 지운다.
- 옮기는 동안(A1-1부터 A1-4까지) 한 파일에 판 2 칸과 옛 키가 같이 있다. 판 1 읽기기는 따로 두지 않는다. 자유 문장 `accounts`는 읽는 코드가 없어 A1-1에서 바로 판 2 dict로 바꾼다.

**측정 저장소 `%LOCALAPPDATA%\delivery-discount-tracker\fleet\device_traits.json`: 코드만 쓴다.** 사람이 고치지 않는다. 저장소(`data/`) 밖에 둔다. `data/` 아래 새 파일은 PR 데이터 가드가 막고(`scripts/check_pr_state_files.py:21`, 예외는 `devices.json`과 `targeted_skip.json`뿐), 수집 중에 쓰면 작업 트리가 더러워진다. 수집 PC 한 대의 폰을 재는 값이라 PC에 둔다. 측정 결과 요약은 측정기가 출력하고, 이 문서 1절 표가 사람이 읽는 기록이다. 시험은 고정 traits(시험 자료)로 돈다.

```json
{
  "<폰 일련번호>": {
    "measured_at": "2026-11-06T02:46+09:00",
    "model": "LM-V500N", "android_sdk": 31,
    "display": {"physical": [1440, 3120], "override": [1080, 2340]},
    "webview": "156.0.8078.47",
    "airplane_cmd": true,
    "adb_wake": null, "wifi_svc": null, "dump_p50_s": null,
    "spots": {"coupangeats.my_tab": [0.9, 0.925]}
  }
}
```

- `null`은 아직 안 쟀다는 뜻이다(2.3 규칙 1).
- `webview`는 전략이 쓰지 않는다. 판독기 표기 차이(부록 A 10-07 두 건)가 웹뷰 판에 묶여 있어 보고용으로 둔다.
- `spots`는 판독기가 화면에서 찾은 하단 탭 자리다. 지금 `device_profile.save_spot`이 `devices.json`에 쓰던 것을 여기로 옮긴다. 처음 값은 지금 `devices.json` `spots`에서 가져온다.
- 쓰는 쪽은 `fleet.traits.update(serial, **values)` 하나다. 측정기와 `save_spot`이 이것을 부른다. 잠금(3절과 같은 `msvcrt.locking` 방식, `device_traits.json.lock`)을 잡고 임시 파일에 쓴 뒤 `os.replace`로 바꿔치기한다. 병렬 단계 프로세스가 동시에 써도 깨지지 않는다.
- 파일이 없으면 빈 측정으로 친다. 측정기를 한 번 돌리기 전에는 2.3 규칙 1에 따라 전략이 필요한 폰이 준비에서 빠지므로, A1-2가 첫 값을 채운 뒤에만 A2를 켠다.

### 2.2 `capture/fleet/` 패키지

| 모듈 | 하는 일 | 기대는 것 |
|---|---|---|
| `registry.py` | 두 파일을 읽어 읽기 전용 `Device` 목록을 만든다. 형식 검사: 판, 필수 칸, tier 값, 시리얼 중복, `step_order`와 `exclusions`의 기기와 단계가 있는지, `why`, `since`, `review_after`가 있는지 | 파일 두 개 |
| `traits.py` | 측정 저장소 읽기와 잠근 쓰기. 경로는 환경변수 `FLEET_TRAITS`로 바꿀 수 있다(시험) | 파일 잠금 |
| `power.py` | 전원 상태 읽기 하나(`is_awake`, `wakefulness`). 전략, 측정기, 옛 `phone_cycle.is_awake`가 모두 이것을 부른다. `tests/conftest.py`의 패치도 이것으로 옮긴다 | adb |
| `probe.py` | 측정(2.4). 결과를 `traits.update`로 쓰고 이전 값과 다르면 보고 | adb |
| `strategy.py` | 깨우기, 화면 유지, 덮개 걷기, 비행기 모드, 와이파이 전략. `Device`의 `os`와 측정값으로 고른다 | adb, scrcpy 스크립트 |
| `lifecycle.py` | 폰 한 대의 상태기계(4절) | `strategy` |
| `eligibility.py` | 단계 요구와 기기에서 자격과 순서 계산(5절) | `registry` |
| `events.py` | 기기 사건(깨우기 시도, 전이) 기록. 회차 폴더의 `fleet-events.jsonl`에 한 줄씩 덧붙인다 | 파일 |

프로세스 경계: 단계 스크립트는 지금처럼 `ADB_SERIAL`을 받고 `fleet.device(serial)`로 같은 `Device`를 다시 만든다. 무선 연결 이름(`<내부 IP>:5555`)도 같은 기기로 찾는다(`device_profile._hw_serial`를 옮긴다). 세션 사이에 넘기는 기억은 없다. 두 파일이 정본이다.

### 2.3 결정 규칙

1. 측정값이 `null`이면 그 측정값으로 고르는 전략을 고르지 않는다. 그 기기는 준비에서 `probe_needed`로 제외된다. 몰래 기본값으로 가지 않는다. 그래서 전략(A2)은 조작 측정(A1-3)이 켜진 네 폰을 다 잰 뒤에 켠다(9절 순서). 깨우기 전략은 먼저 `Awake`인지 보고, 이미 `Awake`면 측정값을 읽지 않고 끝난다(가짜 시리얼로 도는 기존 시험이 측정 저장소에 닿지 않는다).
2. 선언이 없는 능력과 계정은 자격 없음이다. 형식 검사가 "선언 없음" 목록으로 보고한다(예: V30 `share_link_copy`).
3. 좌표 계산은 adb 입력이 실제로 따르는 값(덮어쓴 해상도가 있으면 그 값)을 쓴다. 지금 `common.screen_size`(`capture/common.py:225`)와 같다. 덮어쓴 해상도가 있으면 측정기가 이상으로 알린다. 정본은 실제 해상도다(V50 1440x3120, 사용자 11-06). 추가 화면을 연결하면 다시 생긴다.
4. 코드에 기기 이름, 시리얼, 모델명으로 분기하는 문장을 두지 않는다(6절 시험).

### 2.4 측정 방법과 판정

| 값 | 방법 | 판정 | 언제 |
|---|---|---|---|
| `model`, `android_sdk`, `display`, `webview`, `airplane_cmd` | 1절 명령. `airplane_cmd`는 `subprocess`로 stdout과 stderr를 따로 받는다(`run_adb`는 stdout만 주고 실패면 예외다, `capture/common.py:96`) | 읽은 그대로. `airplane_cmd`는 출력이 `enabled` 또는 `disabled`면 참, stderr에 `No shell command implementation`이면 거짓 | 언제나(읽기만) |
| `adb_wake` | `KEYCODE_SLEEP`으로 끈 뒤 `Awake`가 아닌 것(`Asleep` 또는 `Dozing`, 삼성은 `Dozing`으로 간다)을 확인하고, adb 깨우기 키 최대 3번(2초 간격) 보내 `Awake`인지 본다. 끄자마자 2번, 화면 꺼짐 시간 뒤(150초 기다려 깊은 절전) 1번, 모두 3번 | 3번 다 깨면 참, 아니면 거짓(들쭉날쭉도 거짓: adb 키에 기대지 않는 scrcpy 길이 안전하다). 끝나면 고른 전략으로 깨워 원래대로 둔다 | 수집이 없는 시간 |
| `wifi_svc` | 비행기 모드를 켠 뒤 `svc wifi` 전략 함수를 그대로 부른다(8초마다 다시 켜기 포함, `capture/phone_cycle.py:177`). 45초 안에 와이파이 연결과 8.8.8.8 핑. 2번 | 2번 다 되면 참, 아니면 거짓(타일 길). 끝나면 비행기 모드를 끈다 | 수집이 없는 시간 |
| `dump_p50_s` | 홈 화면에서 `uiautomator dump` 10번 | 중앙값. 기록만 한다(3절 기다림 배율) | 수집이 없는 시간 |

조작 측정은 `collect_trial.lock`을 잡고 돌고, 검증 봇 잠금도 본다(봇이 그 폰을 쓰는 중이면 그 폰을 건너뛴다). 켜진 폰(`enabled: true`)만 잰다.

재측정:
- 전략이 확인에 실패하면(`wake_failed` 등) 그 폰은 그 회차에서 제외되고, 그 회차 반납 단계 끝에서 그 폰만 조작 측정을 다시 돈다. 반납은 수집이 끝난 뒤라 수집과 겹치지 않는다. 측정값이 바뀌면 다음 회차부터 다른 전략이 고른다. 바뀌지 않으면 전략 버그로 보고한다.
- 사람이 부르는 재측정: `python -m capture.fleet.probe --act --serial <시리얼>`.

## 3. 전략

기기마다 한 길만 쓰고, 끝에 상태를 다시 읽어 확인한다. 전략끼리 이어 붙이지 않는다. 확인에 실패하면 이유 코드를 단 예외를 올린다. `WakeFailed(DeviceAsleep)`(지금 `capture/common.py:103`의 `DeviceAsleep`을 잇는다, 잡는 곳이 그대로 잡는다), `AirplaneStuck`, `WifiFailed`. 전략은 `os`로 먼저 가르고(지금은 `android`만 구현), 안에서 측정값으로 고른다.

옛 이름 위임(`phone_cycle.wake` 등)은 지금처럼 bool을 돌려준다. 호출부 네 곳(`capture/common.py:120`, `:191`, `:198`, `:1047`)이 bool을 쓴다. 폰을 제외하는 일은 상태기계만 하고, 단계 하위 프로세스는 실패를 사건으로 남기고 지금처럼 단계를 실패시킨다.

| 동작 | 고르는 근거 | 구현 | 끝난 뒤 확인 | 상한 |
|---|---|---|---|---|
| 깨우기 | `adb_wake` 참 | adb 깨우기 키 최대 3번, 2초 간격 | 전원 상태 `Awake` | 10초 |
| | `adb_wake` 거짓 | 이미 `Awake`면 아무것도 안 한다(우클릭은 켜진 화면에서 뒤로가기다). 아니면 scrcpy 우클릭. 창이 떠 있으면 그 창에, 없으면 띄워서. 최대 2번 | 같음 | 130초(스크립트 60초 x 2번, `capture/phone_cycle.py:65`, 확인 여유 10초) |
| 화면 유지 | 공통 | `KEYCODE_UNKNOWN`(깨우기 키는 꺼짐 타이머를 안 늦춘다, `docs/setup/DEVICE-MATRIX.md` 10-07 실측) | 없음 | |
| 덮개 걷기 | 공통 | 알림창 접기, 잠금 화면이면 위로 밀기 | 잠금 화면 없음 | 5초 |
| 비행기 모드 | `airplane_cmd` 참 | `cmd connectivity airplane-mode enable/disable` | 다시 읽은 상태가 목표 | 15초 |
| | `airplane_cmd` 거짓 | 깨운 뒤 빠른 설정 타일 | 같음 | 20초(타일 한 번 6초, 10-21 A8) |
| 와이파이 | `wifi_svc` 참 | `svc wifi enable` | 와이파이 연결, 8.8.8.8 핑 | 45초(`set_wifi_on`) |
| | `wifi_svc` 거짓 | 빠른 설정 타일(끄고 켜기 포함, `capture/phone_cycle.py:191`) | 같음 | 45초 |

- 같은 폰을 두 프로세스가 동시에 깨우지 않게, 깨우기와 비행기 모드와 와이파이 전략은 폰별 잠금(`%LOCALAPPDATA%\delivery-discount-tracker\fleet\<시리얼>.lock`)을 잡고 돈다. 잠금은 연 파일 핸들에 `msvcrt.locking`을 건다. 프로세스가 죽으면(단계 상한으로 죽인 하위 프로세스 포함) OS가 푼다. 기다림 상한 140초(scrcpy 깨우기 130초보다 길게), 넘으면 `WakeFailed`.
- 전략은 부를 때마다 `events.py`에 한 줄 남긴다(프로세스, 단계, 전략 이름, 시도 수, 걸린 시간, 결과).
- 기다림 배율(`patience`)은 기준선을 볼 때까지 지금 값을 그대로 둔다(`load_factor` 없으면 1). `dump_p50_s`로 계산하면 A8이 2.17배가 되는데 단계 상한(`scripts/run_routine.py:59`)은 그대로라 상한에 더 가까워진다. 기준선 뒤에 단계 상한과 함께 정한다.
- adb 키가 안 들어서 깨우기가 실패해도 scrcpy로 넘어가지 않는다. 측정값이 틀렸다는 신호라서 `wake_failed`로 올리고 재측정한다(2.4).

## 4. 생애주기

폰 한 대마다 수집 PC 쪽 상태기계 하나. 풀(범위 B)이 폰을 빌리고 돌려준다.

```
[미연결] → 준비 → [대기] ⇄ [작업] → 반납 → [끝]
            │        ↑  │실패, 무응답
            │        └ 복구 ┘
            │                │복구 실패, 횟수 초과
            └──────→ 정리 ←──┘ → [제외(이유)]
```

- 허용된 전이만 있다. 그 밖의 전이(예: 제외된 폰에 작업 주기)는 예외다.
- **정리**: 제외되는 폰도 반납 동작(비행기 모드 끄기와 확인, 앱 정리, 실패하면 슬랙 경고)을 한 번 한다. 제외된 폰이 비행기 모드로 남지 않게 한다.
- **와이파이 실패는 제외가 아니다.** 지금 `capture/phone_cycle.py:205`는 와이파이를 못 켜면 비행기 모드를 끄고 모바일 데이터로 수집을 계속한다. 그대로 둔다: 준비에서 와이파이가 실패하면 비행기 모드를 끄고, 핑이 되면 대기로 가고 경고를 남긴다. 핑도 안 되면 `offline`으로 정리를 거쳐 제외. 노트20 한 대가 와이파이로 빠지면 3, 3s, 5a, 5b가 통째로 실패하기 때문이다.
- 준비는 폰마다 스레드로 동시에 돈다. 지금 `prepare_devices`는 차례로 돌아(`scripts/run_routine.py:218`) 3절 상한을 다 쓰면 네 대에 약 13분이다.
- 전이마다 시각, 이전 상태, 다음 상태, 이유를 `events.py`로 남기고, 회차 끝에 `run_routine`이 `fleet-events.jsonl`을 `state.json`의 `devices.<serial>`로 합친다.

### 4.1 깨우기의 주인

- 준비, 반납, 정리, 복구, 대기에서 작업으로 넘길 때: 수집 PC 상태기계가 깨운다.
- 작업 중: 단계 하위 프로세스만 깨운다(`common.require_unlocked`, `common.landing_check`가 같은 `Device` 전략을 쓴다). 상태기계는 작업 중인 폰을 깨우지 않는다.
- 4a처럼 한 단계가 여러 폰을 거들게 쓰는 경우(`share`), 거드는 폰도 작업 상태이고 그 단계 하위 프로세스가 깨운다.
- 두 주인이 겹쳐도 폰별 잠금(3절)이 한 번에 하나만 돌게 한다. 하위 프로세스의 깨우기도 `fleet-events.jsonl`에 남아 7절 측정에 잡힌다.

### 4.2 성공 조건과 상한

초기 상한은 3절 표와 지금 코드에서 왔다. 기준선(7절)을 보고 줄인다.

| 상태 | 성공 조건 (전부) | 상한 |
|---|---|---|
| 준비 | `Awake`, 잠금 화면 없음, 핑 성공, 배달앱 4개 프로세스 없음, 화면 꺼짐 120000ms. 그리고 둘 중 하나: (비행기 모드 켜짐, 와이파이 연결) 또는 (와이파이 실패로 비행기 모드 꺼짐, 경고 남김) | 동작별 3절 상한의 합 |
| 대기 → 작업 | adb 온라인, 깨우기 성공, 발열 게이트 통과 | 깨우기 상한 |
| 작업 | 단위 결과 ok, 상한 안 | 단계 상한(`run_routine.step_timeout`). 단위 상한은 범위 B |
| 복구 | adb 온라인, `Awake`, 앱 정리 끝 | 60초, 회차당 폰마다 2번(추정, 기준선으로 조정) |
| 반납, 정리 | 비행기 모드 다시 읽어 꺼짐, 와이파이 연결, 앱 정리 끝. 실패하면 슬랙 경고(#120) | 60초(재시도 1번 포함) |
| 제외 | 이유 코드 하나: `offline`, `wake_failed`, `probe_needed`, `airplane_stuck`, `recover_exhausted`, `hot` | |

발열:
- 온도 존을 읽을 수 있는지를 폰별로 둔다. 지금 `capture/thermal.py:31` `_zones_readable`는 프로세스 전역이라 한 폰이 못 읽으면 다른 폰 판정까지 바뀐다.
- 준비와 대기에서 뜨거우면 일을 받지 않고 식기를 기다린다. 상한은 지금 `thermal.wait_if_hot`의 900초(`capture/thermal.py:106`). 넘으면 `hot`으로 정리를 거쳐 제외한다.
- 작업 중 발열은 지금처럼 단계 안의 `wait_if_hot`이 맡고, 그 시간은 작업 시간에 든다.

### 4.3 바뀌는 코드

- `phone_cycle.prepare`, `finish`, `run_routine.prepare_devices`, `finish_devices` → 상태기계의 준비, 반납, 정리.
- `phone_cycle.wake`, `scrcpy_wake`, `set_airplane`, `set_wifi_on` → `fleet.strategy`. 옛 이름은 한 판 동안 얇은 위임으로 남기고 다음 판에서 지운다.
- `capture.common.patience` → `Device.patience`.
- `capture.device_profile` → `fleet.registry`(프로필, `os_of`, `quirk`, 무선 이름 찾기)와 `fleet.traits`(`spots`, `save_spot`).
- `capture.thermal`의 존 판독 여부 → 폰별.

## 5. 단계 요구, 자격, 순서

### 5.1 요구 선언 (코드)

단계의 요구는 코드 작업표(`run_routine.task_table`) 옆 `NEEDS` 표에 둔다. 단계가 무엇을 필요로 하는지는 단계 코드의 성질이라서다. 집는 순서(지금 `pool` 키 순서)는 `NEEDS` 키 순서다.

```python
NEEDS = {
    "3":  Need(tiers={"coupangeats": "wow"}, abilities={"coupangeats_hub_top_cards": True}),
    "3s": Need(tiers={"coupangeats": "wow"}, abilities={"coupangeats_hub_top_cards": True}),
    "5a": Need(tiers={"coupangeats": "wow"}, abilities={"coupangeats_hub_top_cards": True}, same_device_as="3"),
    "6":  Need(tiers={"coupangeats": "wow", "baemin": "membership"}),
    "7":  Need(tiers={"coupangeats": "wow", "baemin": "membership"}, share=True,
               helpers=Need(tiers={"baemin": "membership"})),
    "4a": Need(tiers={"baemin": "membership"}, share=True),
    "4g": Need(tiers={"baemin": "membership"}),
    "2":  Need(tiers={"baemin": "membership"}),
    "5":  Need(accounts={"baemin": "주계정"}),
    "3w": Need(tiers={"coupangeats": "basic"}),
    "4b": Need(tiers={"ddangyo": "basic"}),
    "4d": Need(tiers={"ddangyo": "basic"}, abilities={"share_link_copy": True}),
    "4c": Need(tiers={"yogiyo": "membership"}),
    "4f": Need(tiers={"yogiyo": "membership"}),
    "5y": Need(tiers={"yogiyo": "membership"}),
}
```

- `tiers`는 정확히 그 등급(3w가 와우 아닌 계정만 집으려면 정확 일치여야 한다), `accounts`는 그 계정 이름, `abilities`는 그 값. `min_abilities`는 지금 쓰는 단계가 없어 두지 않는다.
- `same_device_as`는 그 단계를 돈 폰만 허용한다. 그 단계가 아직 안 돌았으면 나머지 조건으로 계산한 목록을 쓴다. 그래서 5a에도 3과 같은 조건(와우, 허브 상단 카드)을 단다. 와우만 달면 V50도 후보가 된다(지금은 `pool` 후보 목록 `["sub3"]`가 막아 준다, `scripts/run_routine.py:613`).
- `share`는 집을 때 노는 다른 후보 폰을 같이 잡는다(지금 `pool` `share`, `scripts/run_routine.py:655`).
- `helpers`는 단계를 맡지는 못해도 거들 수 있는 폰의 조건이다(지금 `pool."7".helpers`, `scripts/run_routine.py:660`, 시험 `tests/test_run_routine_pool.py:188`). 7은 배민 멤버십이면 거든다(배너 링크 열기).
- **거들기로 묶지 않는 폰**: 지금은 "다른 남은 단계의 유일한 후보인 폰"을 뺀다(`scripts/run_routine.py:658`). 계산하면 후보가 늘어 이 규칙이 거의 아무것도 안 뺀다(예: 5의 후보가 A8 하나에서 네 폰으로, A8이 4a 거들기로 묶인다). 새 규칙: **선행이 끝나 지금 집을 수 있는 남은 단계에서 계산 순서 1순위인 폰은 묶지 않는다.** 이 규칙은 결정적이라 스레드가 먼저 집는 순서에 따라 갈리지 않는다.
- 이 규칙의 대가: 00:01 회차 시작 때 V50은 4c 1순위라 4a 거들기에 안 묶인다(지금은 V30과 V50이 4a를 나눈다). 4a는 V30 혼자 시작하고, 다른 폰이 일을 마치면 범위 B의 늦게 끼어들기가 그 폰을 보탠다. 범위 B 전까지 4a가 길어질 수 있다(V-9).

### 5.2 계산, 순서, 제외 (데이터)

- 자격 = `enabled` 기기 중 요구를 만족하고 `exclusions`에 없는 폰.
- 순서: `step_order.<단계>.order`가 있으면 그 순서. 거기 없는 자격 폰은 뒤에 `priority` 순으로 붙는다. `order`에 자격 없는 폰이 있으면 형식 검사가 보고하고 계산에서 뺀다(순서가 자격을 넓히지 못한다).
- 순서가 곧 스케줄이다. `Pool.pick`은 후보 목록에서 자기보다 앞선 폰이 놀고 있으면 그 단계를 집지 않는다(`scripts/run_routine.py:627`). 그래서 순서는 성능과 부하 분산 판단이고, 데이터에 이유를 달아 둔다.
- `step_order`와 `exclusions`의 항목마다 `why`, `since`, `review_after`가 반드시 있다. 형식 검사가 빠진 칸을 막는다.
- 1b 점검이 `review_after`가 지난 항목을 알린다. 항목이 쌓이거나 낡는 위험은 여기서 따라간다.
- 처음 넣을 값은 지금 `pool` 후보 목록의 순서를 그대로 옮긴다(A3-1). 4c는 V50을 앞으로 바꾼다(1절). 이유는 `pool`의 `why`에서 낡은 문장을 빼고 옮긴다.

### 5.3 대조

시험 하나가 계산한 자격과 순서를 A3-1 때 떠 둔 지금 `pool` 후보 목록(시험 고정값. `pool`은 지금 `devices.json`에서 단계마다 돌 수 있는 폰을 사람이 적어 둔 표다. 예: `"4g": {"phones": ["sub", "sub4"]}`)과 단계별로 견준다. 차이가 나면 실패하고, 아래에 적은 차이만 기대값에 넣는다. 지금 `devices.json`으로 미리 계산해 본 차이:

| 단계 | `pool` 후보 목록 | 계산(`pool` 순서를 `step_order`로 옮긴 뒤) | 처리 |
|---|---|---|---|
| 4c | A8, V50, 노트20 | V50, A8, 노트20, V30 | 계산이 맞다. V50 권장(입력창 안 뜸), 나머지는 주소 변경 로직으로 대체(사용자 11-06). `step_order."4c"` = V50, A8, 노트20(V30은 `priority`로 뒤에 붙는다). 11-05 V50 4c에서 덤프가 약 10분마다 461초 멈춘 일이 있어 V-8로 본다 |
| 4g | V30, V50 | V30, V50, 노트20, A8 | 계산이 맞다(사용자 11-06, V-6) |
| 5y | A8, V50, 노트20 | A8, V50, 노트20, V30 | 계산이 맞다(사용자 11-06, V-6) |
| 5 | A8 | A8, 노트20, V50, V30 | 계산이 맞다. 배민은 네 폰 다 주계정(사용자 11-06). `step_order`로 A8 먼저 |
| 4d | V50, A8 | V50, A8, 노트20 | 계산이 맞다. 노트20 공유 링크 복사 됨(사용자 11-06) |
| 5a | 노트20 | 노트20 | 같다(와우 조건을 더해서) |
| 4f | A8, V50, 노트20 | A8, V50, 노트20, V30 | 계산이 맞다. 요기요 네 폰 같은 계정(사용자 11-06, "다 넣을 수 있는 것") |
| 7 helpers | A8, V30 | 배민 멤버십 네 폰 중 1순위 후보(V50, 노트20)를 뺀 A8, V30 | 같다 |

`pool."4b".why`의 "V50 1순위"는 목록(A8 먼저)과 다르다. 목록을 따르고 이유 문장은 옮기지 않는다.

이 대조는 후보 목록만 본다. 거들기 묶기와 집는 순서는 A3-2에서 00:01 회차 모의 실행으로 따로 본다: 단계마다 가짜 소요시간(11-06 00:01 회차 로그)을 주고, 폰마다 무엇을 언제 돌았는지를 지금 `Pool`과 새 `Pool`로 견준다. 다른 곳은 표로 사용자에게 보인다.

이 표에 없는 차이가 시험에서 나오면 둘 중 하나로 닫는다. `pool` 후보 목록이 맞으면 `exclusions`나 `step_order`에 이유를 단다. 계산이 맞으면 사용자 승인으로 기대값을 고친다. 어느 쪽이든 이 표에 한 줄 더한다.

## 6. 강제 시험

- `capture/fleet/` 밖의 코드 줄(주석과 문서 문자열 제외)에 기기 동작 명령이 나오면 실패한다. 대상: `KEYCODE_WAKEUP`, `KEYCODE_SLEEP`, `cmd connectivity airplane-mode`, `svc wifi`, 빠른 설정 타일 누르기 함수, `scrcpy_wake.ps1`, `scrcpy_wake_existing.ps1`. 지금 있는 `tests/test_wake_single_path.py`를 이것으로 넓힌다.
- `capture/`, `scripts/`의 코드 줄(주석과 문서 문자열 제외)에 `devices.json`의 시리얼이나 모델명이 문자열로 나오면 실패한다. `tests/`와 `docs/`는 뺀다.
- `devices.json` 형식 검사를 시험으로도 돌린다.

## 7. 측정과 기준선

회차마다 `state.json`에 남긴다(폰별, `fleet-events.jsonl`에서 합침):

- 상태별 머문 시간. 대기는 둘로 나눈다. **선행 대기**: 그 폰이 후보인 단계가 남았는데 선행 단계가 안 끝나서 노는 시간(예: 3w가 3을 기다림). **빈 대기**: 그 폰이 후보인 단계가 남지 않았거나 순서에 밀려 노는 시간.
- 깨우기 시도 수와 걸린 시간, 전략 이름, 깨운 프로세스(상태기계 / 단계 이름).
- 복구 횟수, 제외 이유.

기준선은 이 설계를 적용한 첫 실측 회차(`scripts/collect_trial.ps1`, 전수조사 포함) 값이다. 회차 하나로는 p95나 대기 나누기가 약하다. 그래서 첫 목표는 셋만 본다: 깨우기 실패 0, 상한 초과 0, 폰별 대기 합계(나눈 값은 기록만). 대기를 줄이는 목표와 4.2 상한 줄이기는 회차가 세 번 쌓인 뒤 사용자와 정한다.

## 8. 바뀔 때의 절차

| 일 | 고치는 곳 | 하는 일 |
|---|---|---|
| 새 폰 붙이기 | `devices.json` 항목 하나(`enabled: false`로 시작, 계정과 능력 선언) | `python -m capture.fleet.probe --read --act --serial <시리얼>` → traits 채움 → 단계 시험 → `enabled: true` → 자격 대조 시험의 차이를 5.3 표로 닫음 |
| 폰 빼기 | `enabled: false` | 같음(5.3 표로 닫음) |
| 계정이나 멤버십 바뀜 | `accounts.<앱>` 값과 `since` | 자격 대조 시험이 바뀐 단계를 보여 준다 |
| 사람이 확인한 능력 바뀜 | `abilities.<이름>` 값과 `checked` | 같음 |
| OS 업데이트, 앱 업데이트, 화면 설정 바뀜 | 고치지 않는다 | 측정기를 다시 돌린다. 달라진 값은 측정기가 보고한다 |
| 장애: 전략이 확인에 실패 | 고치지 않는다 | 2.4 재측정이 자동으로 돈다. 측정값이 같으면 전략 버그라 `fleet/strategy.py`를 고치고 시험을 단다 |
| 장애: 특정 폰이 특정 단계에서 느림, 멈춤 | `step_order` 또는 `exclusions`에 `why`, `since`, `review_after` | 재검토 날짜가 지나면 1b가 알린다 |
| 새 단계 | `NEEDS`에 한 줄, `task_table`에 한 줄 | 자격 대조 시험 기대값에 그 단계 |
| 새 앱 | `registry.py` tier 값 목록, `run_routine.APP_PACKAGES`, `phone_cycle.PACKAGES`(앱 정리), `NEEDS` | 형식 검사 시험에 그 앱 |
| 새 기기 특성(새 동작 방식) | `probe.py`에 측정 항목, `strategy.py`에 구현 하나 | 기존 전략은 그대로. 시험 하나 |
| 새 OS(iOS 등) | `os` 값, `strategy.py`에 그 OS 갈래, 드라이버(`capture/driver/`) | 이 설계 범위 밖. 화면 조작 드라이버가 먼저다 |

## 9. 작업 단위와 진행

단위마다 완결되고 따로 검증한다. 순서는 수집이 중간에 멈추지 않게 짰다. 옛 키는 새 경로가 다 돈 뒤 맨 끝에 지운다. 담당: 구현과 시험은 main 세션(Claude), 사람 확인은 사용자(남은 것 없음, 11-06). 상태: 대기 / 진행 / 끝(검증 근거) / 검증 대기.

| 순서 | 단위 | 내용 | 선행 | 검증 | 상태 |
|---|---|---|---|---|---|
| 1 | A1-1 | `devices.json`을 그 자리에서 판 2로(옛 키는 남김): `schema`, `enabled`, `priority`, `accounts` dict, `abilities`, `step_order`, `exclusions`. 레지스트리 읽기 모델과 형식 검사 | 없음 | 단위 시험, 지금 pytest 전부 | 끝(8657a75, de184a2) |
| 2 | A1-2 | `traits.py`(잠근 쓰기, LOCALAPPDATA), `power.py`, 읽기 측정기, 첫 값(`spots`는 `devices.json`에서) | A1-1 | 실기 읽기만 | 끝(c544ac0, dea139e, 10fcd90, 실기 11-06 04:16 네 폰) |
| 3 | A1-3 | 조작 측정(2.4) 켜진 네 폰 | A1-2 | 실기, 수집이 없는 시간(V-1) | 대기 |
| 4 | A3-1 | `NEEDS`(`share`, `helpers` 포함), 자격과 순서 계산, 거들기 묶기 규칙. 지금 `pool`을 시험 고정값으로 떠 둠 | A1-1 | 대조 시험(5.3, 1b) | 끝(95abd58, aae5fa6) |
| 5 | A2-1 | 깨우기, 화면 유지, 덮개 걷기 전략, 폰별 잠금, `events.py`. `phone_cycle.wake` 위임, `tests/test_wake_single_path.py`와 `tests/conftest.py` 패치를 같은 커밋에서 `fleet`로 | A1-3 | 단위 시험, 실기(꺼진 폰) | 대기 |
| 6 | A2-2 | 비행기 모드, 와이파이 전략, 위임 | A1-3 | 단위 시험, 실기(수집이 없는 시간) | 대기 |
| 7 | A2-3 | 상태기계, 정리, 와이파이 실패 처리, 전이 기록, 폰별 발열, 준비 동시 실행 | A2-1, A2-2 | 단위 시험 | 대기 |
| 8 | A2-4 | 강제 시험(6절) | A2-1, A2-2 | 시험 | 대기 |
| 9 | A3-2 | `run_routine.Pool`이 계산한 자격, 순서, `share`, `helpers`를 씀. 풀 쓰기 조건을 `"pool" in cfg`(`scripts/run_routine.py:901`)에서 판 2로. 옛 고정 큐, `assign`, `router`, `step_pins` 제거. `verify_bot`, `device_watch`, `full_audit`의 `baemin` 읽기를 레지스트리로. `cfg["devices"]`를 읽는 곳 모두 `enabled`로 거름. 상태기계를 준비, 반납에 연결. 선언 안 한 무선 주소를 adb로 묻는 일(`device_profile._hw_serial` 이관)과 `fleet.device(serial)`. **회차 시작 점검**: 켜진 폰의 측정값(`adb_wake`, `airplane_cmd`, `wifi_svc`)이 비면 그 폰을 시작에서 빼고 알린다(측정이 비면 깨우기와 와이파이가 단계 중간에 조용히 실패한다, 계획 2 재리뷰 2026-11-06) | A3-1, A2-3 | `--dry-run` 풀 표 비교, 00:01 회차 모의 실행(5.3) | 대기 |
| 10 | 실측 | `collect_trial` 전수조사 포함 한 회차(`--no-audit` 없이), 7절 기준선 | A3-2 | 실기(V-2) | 대기 |
| 11 | A1-4 | 옛 키 제거, `_excluded`를 `enabled: false` 항목으로, `spots` 칸 제거 | 실측 | 이관 전후 비교, pytest | 대기 |
| 끝 | | 깨우기 키를 `phone_cycle.wake` 하나로 | | pytest 635 통과, f50e7e6 | 끝 |

구현 계획은 셋이다. 뒤 계획은 앞 계획의 결과(측정값, 전략) 위에 선다.
- 계획 1: `docs/specs/2026-11-06-device-fleet-plan-1.md`, 순서 1, 2, 4(A1-1, A1-2, A3-1). 수집 동작은 안 바뀐다.
- 계획 2: 순서 3, 5~8(A1-3, A2). 계획 1이 끝난 뒤 쓴다.
- 계획 3: 순서 9~11(A3-2, 실측, A1-4). 계획 2가 끝난 뒤 쓴다.
구현은 브랜치 `feat/pool-units`에 쌓고 PR 하나로 올린다(사용자 2026-11-06).

## 10. 검증 대기

| id | 무엇 | 왜 지금 못 하나 | 누가, 언제 |
|---|---|---|---|
| V-1 | 조작 측정 켜진 네 폰 | 화면과 네트워크 상태를 바꾼다 | main 세션, 수집이 없는 시간(08:30 회차 끝 뒤 15:55 전 등). 시작 전에 사용자에게 한 줄 알림 |
| V-2 | 새 구조로 전수조사 포함 한 회차 | 실제 회차가 필요 | main 세션, A3-2 뒤 `collect_trial`(예약 수집 끄고) |
| V-3 | 닫음(11-06 03:36). V50 덮어쓴 해상도를 지우고 1440x3120으로 두 스크립트 통과(1절) | | |
| V-4 | 닫음(11-06). 요기요 네 폰 같은 계정, 주소 8곳(사용자) | | |
| V-5 | 닫음(11-06). 배민 네 폰 다 주계정(사용자) | | |
| V-6 | 닫음(11-06). 4g, 5y는 계산대로 다 넣는다(사용자) | | |
| V-7 | V50 1440x3120에서 배민, 쿠팡이츠, 땡겨요 경로 | 03:36에는 요기요만 돌렸다 | 08:30 정기 회차 로그로 확인(main 세션) |
| V-8 | 4c를 V50 1순위로 둔 뒤 덤프 멈춤(11-05 461초)이 다시 나는지 | 실제 회차가 필요 | 4c가 도는 00:01 회차 로그(main 세션) |
| V-9 | 거들기 묶기 새 규칙으로 4a가 V30 혼자 시작할 때 길어지는 정도 | 모의 실행은 가짜 시간이라 실제 길이를 모른다 | A3-2 모의 실행 표를 사용자에게 보이고, V-2 회차로 확인 |
| V-10 | LG 폰이 adb 깨우기를 무시하는 것이 깊은 절전 뒤에만 나는지 | 2.4의 150초 측정으로 일부만 본다 | V-1 결과와 V-2 회차 사건 기록 |
| V-1 결과 | 2026-11-06 06:03(네 폰), 06:11(V30, A8 다시) `collect_trial`로 조작 측정. adb_wake: 노트20 참, V50 거짓, A8 참, V30 거짓. wifi_svc: 노트20 참, V50 참, A8 거짓, V30 거짓. dump_p50_s: 2.66, 3.03, 2.47, 2.0. 06:03 회는 V30 되돌리기에서 와이파이 타일을 못 찾았으나 비행기 모드를 끈 뒤 와이파이가 스스로 붙었다(인터넷 확인). 06:11 회는 종료 코드 0 | | |
| V-11 | V30 와이파이: 옛 준비는 비행기 모드에서 매번 와이파이를 붙였는데(run_routine-stdout.log `'wifi': True`), 측정은 svc가 두 번 다 실패. 타일 갈래는 V30이 adb로 안 깨 꺼진 화면이라 패널이 안 읽힌다(덤프 빈 값). 이대로면 V30은 준비에서 와이파이 실패, 비행기 모드 끄고 진행 | 닫음(2026-11-06 10:12 실험, 10:14 재측정). svc는 거절되지 않는다(WifiService `setWifiEnabled package=com.android.shell enable=true`), 약 30~35초 뒤 붙는다. svc 갈래가 26초에 껐다 켜며 그 연결을 끊었다(오측정 원인). 껐다 켜기를 svc 갈래에서 뺐고(1c365b1) V30 wifi_svc 참으로 다시 쟀다. 코드 비교 리뷰의 "svc 거절" 추정은 틀렸다 | | |
| V-12 | LG(V30) 빠른 설정 타일 이름 꼴: `<이름> 켜짐.`/`꺼짐.`, 와이파이 타일은 연결된 SSID(`iptime5G 켜짐.`, 덤프 2026-11-06 10:19). `tiles.tile_state`는 삼성 꼴(`Wi-Fi,사용,…,버튼`)만 읽어 LG 타일을 못 찾는다(10:12 실험 "타일 찾음 False"는 이 때문, "타일이 안 보인다"는 판단은 틀렸다). 지금 타일 갈래를 쓰는 폰은 A8(삼성)뿐이라 수집 영향은 없다 | 와이파이를 끈 상태의 LG 타일 이름을 봐야 구조로 짚을 수 있다 | 다음 LG 타일 갈래 폰이 생기기 전 |

## 11. 변경 기록

- 2026-11-06 판 1: 처음 씀. 1~3절 사용자 승인. 사용자 확정: 노트20 공유 링크 복사 됨, A8 쿠팡이츠 와우 아님, V50 해상도 1440x3120. 생애주기 이름은 사용자 예시(시동, 수집, 대기, 회수, 해제)를 준비, 대기, 작업, 복구, 반납, 제외로 바꿈(사용자 허락).
- 2026-11-06 판 2: 콜드 리뷰(새 Opus 5.5 세션, 대화 맥락 없음) 22건 반영.
  - 높음:
    - 단계별 순서를 `step_order`로 둠(전역 우선순위로는 지금 순서를 못 냄).
    - 4g 차이를 바로잡음.
    - 5a에 와우 조건 추가.
    - `share`와 집는 순서의 출처를 둠.
    - 작업 순서를 수집이 안 멈추게 바꿈(옛 키 제거를 맨 끝으로).
    - 제외 전에 정리를 둠.
    - 깨우기 주인과 폰별 잠금을 정함.
  - 중간:
    - 측정 방법, 판정, 재측정 주체를 정함.
    - 선언이 없으면 자격 없음.
    - 1절에 계정 표 추가.
    - 발열을 폰별로.
    - scrcpy 상한을 130초로.
    - `os`와 `quirks`는 남기고 `spots`는 측정 파일로.
    - traits 잠근 쓰기.
    - 8절에 새 단계, 새 앱, 새 OS 추가.
    - 대기를 선행 대기와 빈 대기로 나눔.
  - 낮음: 용어표, 부록 A와 B, `REFERENCE_DUMP_S` 고정값, 6절 범위. "선언과 측정이 부딪히면" 규칙은 지움(키가 겹치지 않는다).
  - YAGNI: `by`, `mem_total_kb`, `android_release` 뺌. 덮어쓴 해상도 알림은 V-3 뒤로.
  - 복구 상태는 기기 건강 회복이라 남기고, 일 단위 재시도는 범위 B로 둠.
- 2026-11-06 판 3: 사용자 답 반영. 배민 네 폰 다 주계정(V-5), 요기요 네 폰 같은 계정에 주소 8곳(V-4), 4c는 입력창이 안 뜨는 V50에만(능력 `yogiyo_address_no_ime`), V50 덮어쓴 해상도 지우고 실기 두 개 통과(V-3). "손 목록"이라는 말을 "`pool` 후보 목록"으로 바꾸고 뜻을 적음. V-7, V-8 추가.
- 2026-11-06 판 4: 4c의 V50은 자격 조건이 아니라 권장(순서 1순위)으로 바꿈. 다른 폰도 주소 변경 로직으로 돈다(사용자). 4g, 5y 계산대로(V-6 닫음).
- 2026-11-06 판 5: 2차 콜드 리뷰(새 Opus 5.5 세션) 반영. 근거 줄은 main 세션이 다시 확인(`run_routine.py:890`, `:901`, `check_pr_state_files.py:21`, `verify_bot.py:180`, `device_watch.py:89`).
  - 퇴행 막기:
    - 7 `helpers`를 지금 `Need`에.
    - 거들기 묶기 규칙을 "지금 집을 수 있는 단계의 1순위 폰은 안 묶음"으로(대가 V-9).
    - `devices.json`을 A1-1에서 그 자리에서 판 2로, 판 1 읽기기 없음, 옛 키 읽는 코드는 A3-2가 없앰.
    - 와이파이 실패는 제외가 아니라 지금처럼 비행기 모드 끄고 계속.
    - 측정 저장소를 LOCALAPPDATA로(PR 데이터 가드, 작업 트리).
  - 정함:
    - 깨우기 측정은 "Awake 아님"과 깊은 절전 한 번, 들쭉날쭉은 거짓.
    - 와이파이 측정은 전략 함수로.
    - `airplane_cmd`는 stderr로 판정.
    - 전원 읽기 하나(`power.py`)와 conftest 패치 이동.
    - `WakeFailed(DeviceAsleep)`, 위임은 bool.
    - `msvcrt.locking` 잠금 140초.
    - 기다림 배율은 기준선까지 그대로.
    - 준비 동시 실행.
    - 실측은 전수조사 포함.
    - 측정은 시험 잠금을 잡음.
  - 뺌: `yogiyo_addresses`와 `yogiyo_address_no_ime` 능력, `min_abilities`. `baemin`, `taps`, `rotate` 키를 어디로 옮길지와 지울지 정함. 첫 기준선은 세 값만.

## 부록 A. 기기 차이를 한 경로가 뭉갠 사고 (2026-09-30 ~ 11-06)

출처: `docs/setup/COLLECTION-INCIDENTS.md`, `docs/setup/DEVICE-MATRIX.md`, `docs/setup/DUAL-DEVICE.md`, `capture/*.py` 주석, claude-harness `memory/handoff_*.md`. 해시가 없는 것은 기록에 없다.

| 날짜 | 증상 | 원인 | 고친 곳 |
|---|---|---|---|
| 09-30 | V30 땡겨요 0건 | Android 9 덤프 null root, 파일 안 써 옛 ui.xml 읽음 | `capture/common.py:378` 덤프 재시도 |
| 10-01 | X6 허브 "안 열림", 고정 쿠폰 0곳 | 탭 이름이 content-desc, 금액 쪼개짐 | device-profiles 설계 |
| 10-01 | A8 요기요 쿠폰함 실패 | 하단 탭 bounds 0 | 탭 자리 폴백 |
| 10-05 | 노트20 쿠팡이츠 탭 자리 없음 | bounds 빔 | `spots` |
| 10-07 | 4a 노트20, X6 값 없음 | 새 웹뷰가 버튼 이름을 content-desc에 | 2b102d6 |
| 10-07 | 4d 노트20 링크 0 | One UI 버튼 이름 "URL 복사" | 2b102d6 |
| 10-07 | 덤프 재시도 중 화면 꺼짐 | 깨우기 키가 꺼짐 타이머를 안 늦춤 | fd9bfa6 |
| 10-17 | 노트20 가드 두 개 | USB와 무선 전송로 중복 | `scripts/run_routine.py` |
| 10-21 | A8 비행기 모드, 와이파이 안 바뀜 | Android 8에 `cmd connectivity` 없음, `svc` 안 들음 | 타일 누르기 |
| 10-22 | V50 Asleep인데 통과 | `wake_and_swipe`가 잠금 화면만 봄 | `is_awake`, scrcpy |
| 10-22 | 노트20, X6 덤프 137 | SIGKILL | 92542c6(추정) |
| 10-23 | V50 교대 때 3단계 45분 초과 | My 이츠 빈 화면 | 9fa2cc2 |
| 11-02 | V50 못 깨움 | scrcpy 창이 떠 있으면 건너뜀 | b5c3112(#84) |
| 11-02 | A8 4d 통째로 죽음 | `rm` 255 | 5c71fd4(#86) |
| 11-02~03 | 비회원 V50 값이 원장에 섞임 | assist가 계정을 거르지 않음 | 8ea0740 |
| 11-03 | 노트20 Dozing에서 딥링크 실패 | 깨우기 키 한 번으로 부족 | 5387ff0, 9f52cb9(#110) |
| 11-03 | V30 요기요 시작 점검 멈춤 | LG가 adb 깨우기 무시 | 1be4d59(#128), 2899bd1(#132) |
| 11-03 | A8 비행기 모드 못 끔 | Asleep라 타일 못 누름 | df42118(#124) |
| 11-05 | V30 4a 링크 전부 실패 | 링크 기본 앱이 브라우저로 바뀜. #170이 모든 폰을 깨 #173으로 되돌림 | f147f1e, 3b9bd84(해결 미확인) |
| 11-05 | 3단계 27분 밀림 | 4a 도우미가 노트20을 묶음 | 54842ba(#177) |
| 11-05 15:28 | 7이 V30에서 45분 상한 | 와우 아닌 허브 | `pool` 6, 7 후보 조정, 2cbf8cb |
| 11-06 01:12 | 7 실패, 랜딩 대기 458초 | 랜딩 대기가 adb 깨우기만 보냄(V50) | 01ca730, f50e7e6 |

## 부록 B. 문서끼리 어긋난 기기 값 (11-06 기준)

| 값 | 어긋남 | 정리 |
|---|---|---|
| 노트20 공유 링크 복사 | DEVICE-MATRIX 10-07 통과 / `pool."4d"` 못 받음 | 됨(사용자 11-06) |
| A8 Android | 9(device-profiles 10-01) / 8(DEVICE-MATRIX 10-07) | 8.0(측정 11-06) |
| A8 쿠팡이츠 계정 | 와우(DEVICE-MATRIX) / 기본(`accounts`, `pool."3w"`) | 기본(사용자 11-06) |
| V30 요기요 주소 | 회사만 / 3곳 / 8곳 | 8곳, 네 폰 같은 계정(사용자 11-06) |
| adb 깨우기 무시 폰 | V50, X6(phone_cycle 10-22) / V30, V50(common 11-03) | 조작 측정(V-1) |
| 덤프 137 폰 | A8 / 노트20, X6 / X6 | 기록용. 측정 대상 아님 |
| V50 5a | 쿠폰함 못 읽음(10-25) / `steps` `["5a"]`(11-03) | `steps`는 `pool`이 안 봄. A1-4에서 지움 |
| V30 상태 | 쉬는 중(`_sub_paused`, `_priority`) / `pool."4a"` 1순위 | `pool`이 정본. A1-4에서 주석 지움 |
| 같은 계정 동시 로그인 | 끊긴다(09-17 설계) / 안 끊긴다(4a 설계 6.1, 사용자 11-02) | 11-02 사용자 쪽 |
| `device-setup.md` | Xiaomi(07-27) 기준 | 범위 밖, 낡음 |
| 4a 주 폰 | A8(4a 설계 11-02) / `pool."4a"` A8 맨 뒤(11-05) | `pool` 쪽. `baemin.purpose` 문장은 A1-4에서 지움 |
| V50 해상도 | 빈칸 / 측정 1440x3120 + 덮어쓴 1080x2340 | 1440x3120(사용자 11-06), V-3 |
