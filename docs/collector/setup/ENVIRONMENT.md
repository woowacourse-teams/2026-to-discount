<!-- 원본: tracker docs/setup/ENVIRONMENT.md — 여기서 고치지 않는다 -->
# 실행 환경 변수

`scripts/` 자동화가 머신마다 달라지는 값을 받는 곳. 전부 `scripts/_env_paths.py`를
거친다.

**코드에는 저장소 밖 절대경로가 없다(2026-09-05).** 값을 안 주면 저장소 안에서
상대로 찾고, 기기는 `adb devices`로 잡는다. 그전에는 호출하는 쪽마다 처음
돌리던 머신의 절대경로를 기본값으로 들고 있었는데, 저장소를 옮긴 날 그게
한꺼번에 죽어 수집이 세 번 연달아 멈췄다.

`.env.example`을 복사해 채워 넣는 걸 템플릿으로 쓸 것 (자동 로드는 안 되니
직접 export해야 한다. 파일 안 주석 참고).

## 기기 / 캡처

| 변수 | 기본값 | 쓰는 곳 |
|---|---|---|
| `ADB_SERIAL` | (없음. adb 자동탐지) | `scripts/full_audit.py`, `scripts/probe_offer_links.py`, `scripts/repro_sweep.py` |
| `TARGET_ADDRESS` | `경기도 성남시 수정구 금토동` | `scripts/build_audit_records.py`, `scripts/coupangeats_weekly.py` |

**`ADB_SERIAL`은 이제 전부 자동탐지가 기본이다.** `full_audit.py`, 
`probe_offer_links.py`, `repro_sweep.py`도 `scripts/_env_paths.py`의
`detect_serial()`을 쓰도록 바뀌었다. `adb devices`로 붙어 있는 기기가
정확히 1대면 그걸 쓰고, 0대나 2대 이상이면 에러로 멈춰서 사람이
`ADB_SERIAL`로 직접 지정하게 한다.

`banner_routine.py`의 `detect_serial()`도 이제 `ADB_SERIAL`을 본다
(`coupangeats_weekly.py`가 이 함수를 쓴다). 안 보던 시절에는 같은 폰이 USB와
무선으로 두 번 잡히기만 해도 수집이 통째로 멈췄다(2026-09-05).

(과거 이력: 위 3개 스크립트는 한때 `SERIAL = "<폰 일련번호>"`로 고정돼 있었는데,
그 값은 [`docs/setup/device-setup.md`](device-setup.md)에 기록된 현재 기기
시리얼(`<폰 일련번호>`)과도 이미 달라 포터빌리티 이전에 이미 깨져 있던
값이었다. 지금은 자동탐지로 대체돼 더 이상 문제되지 않는다.)

## 경로

| 변수 | 기본값 | 쓰는 곳 |
|---|---|---|
| `DISCOUNT_BRANDS_YML` | `<저장소>/mono/api/src/main/resources/brands.yml` | `scripts/catch_link.py`, `scripts/link_targets.py`, `scripts/full_audit.py`, `scripts/repro_sweep.py`, `scripts/collect_all.py` |
| `MIRROR_CHECK_DIR` | `<저장소>/reports` (git 무시) | `scripts/full_audit.py`, `scripts/build_audit_records.py`, `scripts/probe_offer_links.py` |

`mono`는 이 저장소 밑(`mono/`)에 있다. 그래서 두 경로 다 저장소 루트에서
상대로 찾는다. 다른 머신에 클론만 해도 그대로 돈다. 위 변수는 mono를 다른
자리에 둘 때만 지정하면 된다.

`export_data.py`가 쓰는 `check_brands._find_brands_yml()`도 같은 자리를 본다. 
조상을 훑다가 `<조상>/mono/api`도 같이 보므로 워크트리에서도 찾는다.

`MIRROR_CHECK_DIR`은 `--report-dir` CLI 인자로도 덮을 수 있다(스크립트별로 확인).

**`DISCOUNT_BRANDS_YML`이 없어도 `export_data.py`는 멈추지 않는다.** 경고 두
줄을 찍고 대표명 합치기를 건너뛴 채 파일을 쓴다. 2026-09-04에 그렇게 150건
(정상 145건)이 만들어졌다. 별칭이 안 접히면 같은 브랜드가 여러 줄로 남는다.
건수를 안 세면 못 알아채므로 **배포 전 `deploy_export.py` 미리보기가 찍는
로컬/서버 건수를 반드시 볼 것.**

값을 사용자 환경변수로 박아도 **이미 떠 있는 프로세스에는 안 붙는다.** 자식은
부모가 시작할 때 뜬 스냅샷을 물려받는다. 같은 날 사용자 변수는 설정돼 있는데
Git Bash, PowerShell 양쪽 다 못 읽어 위 사고가 났다. 셸을 다시 띄우거나 그
자리에서 넣는다.

```powershell
$env:DISCOUNT_BRANDS_YML = [Environment]::GetEnvironmentVariable(
    "DISCOUNT_BRANDS_YML", "User")
```

## 배포 타겟

| 변수 | 기본값 | 쓰는 곳 |
|---|---|---|
| `DEPLOY_REMOTE` | `<서버 계정>` | `scripts/banner_routine.py`, `scripts/deploy_export.py` |
| `DEPLOY_SSH_KEY` | `<SSH 키 파일>` | 위와 동일 |
| `DEPLOY_REMOTE_YML` | `<서버>/delivery-discount-api/data/banners.yml` | 위와 동일 |
| `DEPLOY_REMOTE_EXPORT` | `<서버>/delivery-discount-api/data/export.json` | `scripts/deploy_export.py` |
| `DEPLOY_RELOAD_URL` | `https://bebeggars.duckdns.org/api/reload` | 위와 동일 |
| `DEPLOY_OPERATIONS_BACKUP_LOCK` | 없음(꺼짐). `1`이면 서버의 대기 폴더 경유 업로드 | `scripts/_ssh.py`의 `staged_upload_enabled()` 하나가 읽는다. 원장(`deploy_export.py`), 배너, 스냅샷이 모두 따른다. 켜면 올리기 전에 서버 큐의 failed 배치를 보고 있으면 올리지 않고 해소 명령을 안내한다. reload가 409로 돌려주는 배치 실패는 8단계 실패로 센다. 끄는 법은 변수를 빼는 것(대기 폴더에 남은 배치는 서버 reload가 계속 반영하려 한다) |

실서버 정보라 소스에 평문으로 남기는 게 이상적이진 않지만, 지금 당장 깨지지 않는
쪽을 택해 기본값은 유지했다(사용자 결정). 다른 배포 타겟에 쓰려면 위 네 변수를
전부 지정할 것.

## 외부 도구 (PATH 필요)

| 도구 | 용도 | 비고 |
|---|---|---|
| `adb` | 기기 캡처 전반 | [device-setup.md](device-setup.md) 참고 |
| `ssh` | `banner_routine.py --apply`, `deploy_export.py` | `DEPLOY_SSH_KEY` 필요 |
| `scrcpy` | `scripts/catch_link.py` | 코드에서 직접 호출하지 않음. 클립보드 브리지 역할로 **사람이 미리 띄워둬야** 한다 |

## Python 패키지

`requirements.txt` 참고 (`PyYAML>=6.0`, `Pillow>=10.0`). 표준 라이브러리 밖 의존은 이 둘뿐.

## 의도적으로 그대로 둔 것

- **`capture/*.py`의 화면 좌표, 크기 상수** (`NEARBY_ONLY_CHECKBOX_TAP`, `CONTENT_BOTTOM_PX`,
  `BLOCK_GAP_PX` 등): 기기 해상도에 실측으로 묶인 값. 환경변수화 대상이 아니라
  [device-setup.md](device-setup.md)의 "새 기기로 옮길 때" 절차대로 기기가 바뀔 때마다
  다시 재는 게 맞다.
- **`time.sleep()` 로딩 대기 (40여 곳)**: 네트워크/기기 속도에 맞춘 경험적 튜닝값.
  실행 위치와 무관하게 결과는 같고(느리면 그만큼 더 기다릴 뿐), 40개 넘는 변수로
  쪼개는 비용이 이득보다 크다고 판단해 보류.
- **저장소 루트의 `build_*_records.py`**: 특정 날짜 실측을 원장에 한 번 넣고 끝난 1회성
  스크립트였다. 2026-09-29에 참조 없는 여섯을 지웠다(기록은 git 이력). 남은
  `build_baemin_couponbox_records.py`와 `build_coupangeats_weekly_records.py`는 scripts/가 불러 쓴다.

## Claude Code 권한 설정 (`.claude/`)

두 파일이 있고 역할이 다르다.

| 파일 | 커밋 | 내용 |
|---|---|---|
| `.claude/settings.json` | **한다** | 이 저장소에서 쓰는 도구의 권한 허용 규칙. 절대경로 없이 `$ADB` 같은 환경변수로만 적는다 |
| `.claude/settings.local.json` | 안 한다 | 개인 기계 전용. 전역 gitignore(`**/.claude/settings.local.json`)가 이미 막는다 |

`settings.json`에는 **조회, 판독만** 넣는다. 일부러 뺀 것:

- `adb shell input …`. 화면을 실제로 누른다. 쿠팡이츠 허브의 `받기`는
  누르는 순간 **실계정 지갑에 쿠폰이 발급된다**(2026-09-03 실측).
- `deploy_export.py --apply`, `banner_routine.py --apply`. 운영 반영
- `git push`, `ssh <원격 명령>`. 되돌리기 어려운 쪽

이관받는 사람은 `ADB` 환경변수만 자기 경로로 잡으면 된다. 그 외 경로는
이 문서 위쪽 표의 환경변수로 덮는다.
