<!-- 원본: tracker docs/superpowers/specs/2026-09-17-multi-device-parallel-design.md — 여기서 고치지 않는다 -->
# 실기기 추가 — 수집 병렬화 설계 (2026-09-17)

사용자 지시: 실기기 하나 더 붙여 수집을 병렬로 돌릴 수 있는지, 된다면 어떻게.
브레인스토밍 → 결정 → 구현 계획을 한 문서에 둔다. 두 번째 폰은 **아직 없다** —
구현은 기기 수에 무관하게 동작하는 조율기이고, 폰 하나면 지금과 같은 순서로
돈다. 두 대는 붙는 날 §7 절차로 켠다.

## 1. 되나

된다. 근거:
- 모든 단계가 이미 `ADB_SERIAL`/`--serial`로 기기를 받는다(`scripts/_env_paths.detect_serial`,
  `capture/device.run_with_device`). 폰이 둘이면 `candidate_serials`가 **일부러 고르지
  않는다** — 부르는 쪽이 정해야 한다. 조율기가 그 "부르는 쪽"이다.
- 단계 사이 의존은 파일뿐이다: 5b는 5a·3의 JSON, 6은 2·3의 JSON, 8은 2·3·5·5b의 JSON.
  같은 앱을 두 폰이 동시에 열 이유는 없다 — **앱(플랫폼) 단위로 폰을 나누면**
  충돌이 없다.
- 폰마다 앱 로그인이 따로다. 같은 계정으로 두 폰 동시 로그인은 배민·쿠팡이츠가
  세션을 끊을 수 있어 **폰 B는 다른 계정**이어야 한다. 이건 09-15에 이미 하던
  "두 계정 대조"(타겟딜 판별)를 자동화하는 부수 효과가 된다.

## 2. 시간이 어디서 줄어드나 (ROUTINE-TIMING 기준, 죽은 링크 장부 적용 뒤)

| 단계 | 앱 | 소요 |
|---|---|---|
| 2 배짱 + 클럽 | 배민 | 6~8 |
| 3 허브 | 쿠팡이츠 | 9~12 |
| 4 전수 배민 | 배민 | ~13 (29곳, 장부 적용 실측) |
| 4 전수 땡겨요·요기요 | 땡겨요·요기요 | ~19 |
| 5 쿠폰함 | 배민 | 1 |
| 5a 쿠폰함 | 쿠팡이츠 | 4 |
| 5b·6·7·8 | 폰 무관(파일·ssh) | 18 |

두 폰으로 앱을 가르면:
- **폰 A(배민)**: 2 → 4-배민 → 5 = ~21분
- **폰 B(쿠팡이츠·땡겨요·요기요)**: 3 → 5a → 4-땡겨요·요기요 = ~33분
- 뒤 18분은 둘 다 끝난 뒤. **한 바퀴 ~65 → ~50분**, 배민 쪽 폰은 20분만 쓴다.
- 세 대면 땡겨요·요기요를 또 가를 수 있으나 요기요 스윕 자체가 12분이라 이득 작다.

## 3. 접근

| | 방식 | 평가 |
|---|---|---|
| A | **조율기 하나** `scripts/run_routine.py`: 단계를 "작업"으로 등록(앱, 선행 작업, 명령), 기기 목록(`data/devices.json`)에 앱을 배정, 기기마다 스레드 하나가 자기 큐를 순서대로, 폰 무관 작업은 선행이 끝나면. 로그는 단계별 파일 + 통합 로그. `after_open_daily.cmd`는 이걸 부르기만 | **채택.** 폰 하나면 큐 하나 = 지금 순서. 기기 수는 devices.json이 정한다 |
| B | cmd 둘(`after_open_A.cmd`, `after_open_B.cmd`)을 스케줄러가 동시에 | 간단하지만 후행 단계(5b~8) 동기화를 파일 폴링으로 해야 하고, 실패·재시도 판정(check_routine)이 로그 둘로 갈린다. 안 함 |
| C | 단계 안에서 브랜드를 두 폰에 쪼개기(배민 전수 44곳을 22/22) | 같은 계정 동시 로그인 문제. 장부 적용 뒤 배민 전수가 13분이라 이득 작다. 안 함 |

## 4. 설계 (A)

### 4.1 기기 목록 `data/devices.json`
```json
{
  "devices": [
    {"id": "main", "serial": "<폰 일련번호>", "account": "주계정", "apps": ["baemin", "coupangeats", "ddangyo", "yogiyo"]}
  ]
}
```
- 두 대가 되면 `apps`를 나눠 적는다(예: main=[baemin], second=[coupangeats, ddangyo, yogiyo]).
- `serial`은 `adb devices`에 보이는 값. 조율기는 시작할 때 목록의 기기가 붙어 있는지
  확인하고, 안 붙은 기기의 앱은 **붙은 기기 중 그 앱을 가진 첫 기기로** 넘긴다
  (없으면 그 단계 FAIL, 나머지는 돈다).
- 없으면 폰 하나로 간주 — 지금과 같다.

### 4.2 작업표 (`scripts/run_routine.py` 안, 코드가 곧 표)
```
1  pytest            app=None      after=[]
2  baejjang          app=baemin    after=[1]
3  ce_weekly         app=coupangeats after=[1]
4a audit_baemin      app=baemin    after=[2]      cond=RUN_AUDIT
4b audit_ddangyo     app=ddangyo   after=[1]      cond=RUN_AUDIT
4c audit_yogiyo      app=yogiyo    after=[1]      cond=RUN_AUDIT
5  baemin_couponbox  app=baemin    after=[4a|2]
5a ce_couponbox      app=coupangeats after=[3]
5b ce_records        app=None      after=[3,5a]
6  banner_preview    app=None      after=[2,3]
7  banner_verify     app=None      after=[6]
8  reflect           app=None      after=[2,3,5,5b,6,7]
```
- `RUN_AUDIT` 규칙은 cmd에서 옮겨온다(시각<03시 또는 월요일).
- 4a·4b·4c는 `full_audit.py --platforms X` 하나씩. `full_audit`는 이미 플랫폼 인자를 받는다;
  `last_checked`·`dead_links` 파일은 플랫폼별 키라 동시 쓰기가 나면 안 된다 →
  조율기가 **플랫폼별 결과를 임시 파일로 받고 마지막에 합친다**(또는 audit 셋을
  같은 기기 큐에 넣어 직렬화 — 기기 배정이 다르면 자연히 병렬). 구현은 후자 +
  파일 잠금(`portalocker` 없이 `os.replace` 원자 쓰기 + 재읽기 병합).
- 기기 큐: 기기마다 스레드 하나, `subprocess.run(cmd, env={ADB_SERIAL: serial})`.
  한 기기 안에서는 순서 보장. 폰 무관 작업은 별도 스레드 풀(동시 1) — ssh·git이
  겹치면 안 된다.
- 실패 처리: 작업 실패 → 그 작업 FAIL 기록, `after`에 그것을 둔 작업은 **건너뜀**(지금
  cmd가 FAIL=1만 세우고 다음 단계로 가는 것과 다르다 — 지금은 5 실패해도 8이
  돈다). 8은 `after` 중 실패한 출처를 빼고 돌아야 하므로 8만 예외: 선행 실패를
  허용하고 reflect_daily가 판정으로 거른다(지금과 같다).
- 로그: `logs/after-open-<날짜>.log`에 지금과 같은 `-- n) … [HH:MM:SS]` 줄을 **작업이
  끝난 순서로** 적되 각 작업의 출력은 `logs/steps/<날짜>/<n>.log`에 따로 두고 통합
  로그에는 그 파일 경로와 요약 줄만. `check_routine`은 통합 로그의 `-- n)` 구획을
  그대로 읽는다 — 구획 안에 그 단계 출력 전체를 그대로 이어 붙인다(파일에서 읽어
  삽입). 즉 통합 로그 모양은 지금과 같다, 순서만 실행 순서.

### 4.3 두 번째 폰 — 계정과 화면
- 폰 B 계정은 "대조 계정". 쿠팡이츠 쿠폰함(5a)을 폰 B가 읽으면 그 계정 기준
  보유쿠폰이 원장에 들어간다 — **주계정과 다르다.** 규칙: `TARGETED_BRANDS`(계정별
  타겟딜) 판정을 이 차이로 자동화한다: 두 폰이 같은 날 같은 앱 쿠폰함을 읽었을 때
  한쪽에만 있는 브랜드 = 타겟딜 후보 → 원장에 안 넣고 보고. 이건 **2단계**(§6).
  1단계에서는 5·5a는 **주계정 폰에 고정**(devices.json `apps`와 별개로
  `couponbox_device: main`), 폰 B는 전수조사·허브처럼 계정 무관 화면만.
- 잠금 패턴: 폰 B도 사람이 푼다(MINIPC-HANDOVER §3). 조율기는 잠긴 기기를 건너뛰고
  그 앱을 다른 기기로 넘기지 **않는다**(사람 판단 자리) — FAIL로 남긴다.

### 4.4 안 바꾸는 것
- 각 단계 스크립트 내부. `--serial`/`ADB_SERIAL`만 받는다.
- `check_routine`·`reflect_daily`·ROUTINE-SPEC 판정 규칙. 로그 구획 모양 유지가 그 이유.
- 스케줄러: `discount-after-open`이 `after_open_daily.cmd`를 부르고, cmd는 `run_routine.py`
  한 줄로 준다. 실패하면 cmd 옛 본문으로 되돌릴 수 있게 `after_open_daily.cmd.legacy`로 둔다.

## 5. 위험

- 두 기기 USB 대역·adb 서버 동시 요청 — adb는 시리얼별로 독립이라 문제없다고 보나
  실측 전. 폰 하나로 먼저 돌려 회귀 없음을 본 뒤 두 대.
- 배민 앱을 폰 A가 여는 동안 폰 B가 배민을 열 일이 없게 `apps`로 갈랐다 —
  같은 계정 동시 로그인 방지.
- 폰 무관 작업(6·7·8)이 기기 작업과 겹쳐 ssh·git을 동시에 치는 일은 없다(동시 1).

## 6. 단계

1. `scripts/run_routine.py` + `data/devices.json`(기기 1대) + 테스트(작업표 위상 정렬,
   기기 배정, 실패 전파, 로그 구획 모양) — **오늘 밤 구현**.
2. `after_open_daily.cmd`를 조율기 호출로 교체(옛 본문 `.legacy`). 폰 하나로 10:55·15:55
   실행 → `check_routine` 판정 동일 확인.
3. 폰 B 준비(사람): 앱 설치·대조 계정 로그인·`adb connect`·잠금 해제, `devices.json`에
   추가. 조율기 그대로.
4. 2단계: 쿠폰함 두 계정 대조 → 타겟딜 자동 판정(ADR 후보).

## 7. 두 번째 폰 켜는 절차
1. USB 또는 `adb connect <ip>:5555`, `adb devices`에 두 시리얼.
2. `data/devices.json`에 `{"id": "second", "serial": "...", "account": "대조", "apps": ["coupangeats", "ddangyo", "yogiyo"]}` 추가, main의 `apps`를 `["baemin"]`으로.
3. `python scripts/run_routine.py --dry-run` — 배정 표만 출력해 확인.
4. 다음 예약 실행 로그에서 `기기 배정:` 줄과 단계별 시각 확인.
