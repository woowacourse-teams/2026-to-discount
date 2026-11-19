<!-- 원본: tracker docs/setup/MINIPC-HANDOVER.md — 여기서 고치지 않는다 -->
# 미니PC 이관. 상시 가동

수집, 배포를 미니PC로 옮겨 24시간 돌리기 위한 절차. 지금은 사람이 앉아 있는
노트북에서 돌아가서, 자리를 비우면 그날 수집이 통째로 빈다.

**옮기는 것은 두 덩어리다.** 저장소는 `git clone`이면 끝이고, 진짜 일은
**저장소에 없는 것들**(자격증명, 기기 연결, 예약 실행)이다. 아래 3장이 그것이다.

## 0. 에이전트가 이 문서를 실행하는 법

새 머신에서 이 저장소를 클론한 에이전트는 아래 순서로 돈다. 사람이 해야만
하는 두 가지(폰 잠금 해제, 노트북에서 SSH 키 복사)를 빼면 나머지는 전부
검사로 확인된다.

```bash
python scripts/bootstrap_check.py --no-net
```

**이 스크립트는 아무것도 고치지 않는다.** 무엇이 없는지와 무엇을 하면
되는지만 적고, 필수가 빠져 있으면 1로 나간다. 설치는 머신마다 다르고
(패키지 매니저, 권한, 경로) 자격증명은 애초에 자동으로 만들 수 없다.

읽는 법:

- **필수** 가 하나라도 있으면 **수집을 돌리지 않는다.** 반쯤 된 상태로 돌면
  원장에 빈 날이 남고, 그날은 되돌릴 수 없다.
- **선택** 은 그 기능만 못 쓴다는 뜻이다. `vercel`이 없으면 프론트 환경변수를
  못 고치고, PostHog 키가 없으면 그래프 주석만 안 된다.

돌리는 차례:

1. §1 저장소. `tracker`와 `mono`를 순서대로 클론
2. §2 도구. `bootstrap_check.py --group 도구`가 다 OK 될 때까지
3. §3 자격증명, 기기. **사람 손이 필요한 구간**
4. §6 Claude 설정. 에이전트 자신의 환경
5. §5 확인 순서. 읽기만 하는 명령부터, 앞이 안 되면 뒤는 안 본다
6. §4 예약 실행. 위가 다 되고 나서 등록한다

검사가 전부 통과해도 §5의 마지막(배포 미리보기 건수)은 **눈으로 봐야 한다.**
스크립트가 못 보는 종류의 고장이다. 자세한 것은 §5에 적었다.

## 1. 저장소

세 개가 얽혀 있다. `mono`가 `Project` 안에 들어가는 구조라 순서가 있다.

```bash
git clone https://github.com/nn98/delivery-discount-tracker Project
cd Project
git clone https://github.com/woowacourse-teams/2026-to-discount.git mono
```

`mono`는 `Project/mono/`에 있어야 한다. `scripts/_env_paths.py`가 저장소
루트에서 상대로 찾는다. 다른 자리에 두려면 `DISCOUNT_BRANDS_YML`과
`MIRROR_CHECK_DIR`을 지정해야 한다([`ENVIRONMENT.md`](ENVIRONMENT.md)).

`mono`는 **별도 저장소다.** 커밋하고 push를 잊으면 배포에 안 들어간다
(2026-09-06에 실제로 그랬다). 작업 뒤 양쪽 다 `git status -sb`를 본다.

## 2. 도구

노트북에 깔려 있던 버전. 하한만 맞추면 된다.

| 도구 | 버전 | 쓰는 곳 |
|---|---|---|
| Python | 3.14.3 | `scripts/` 전부 |
| Java (JDK) | 25 | `mono/api` 빌드, 테스트 |
| Node | 24 | `mono/web` 빌드, 테스트 |
| adb | 1.0.41 | 기기 캡처 |
| gh | 2.78 | CI 확인 |
| vercel CLI | 44.2 | 프론트 환경변수, 재배포 |
| Claude Code | 2.1.263 | 에이전트 |
| rtk | 0.44.1 | Bash 훅이 매번 부른다 |

```bash
pip install -r requirements.txt   # PyYAML, Pillow
```

`mono/web`은 `npm ci`. `mono/api`는 `./gradlew` 래퍼가 알아서 받는다.

로그인이 필요한 것: `gh auth login`, `vercel login`(계정 `nn98`), 그리고
Claude Code 자신(`claude` 실행 뒤 `/login`).

**`~/.claude/.credentials.json`은 복사하지 않는다.** 로그인 토큰이라 새 머신
에서 다시 받는 게 맞다. 복사한 토큰은 만료되거나 세션이 겹쳐 한쪽이 끊긴다.

## 3. 저장소에 없는 것. 이게 진짜 이관 대상

### 자격증명

| 무엇 | 자리 | 없으면 |
|---|---|---|
| 서버 SSH 키 | `<SSH 키 파일>` | 배너, export 배포 전부 실패 |
| PostHog Personal Key | `<PostHog 키 파일>` 또는 `POSTHOG_PERSONAL_API_KEY` | 그래프 주석만 실패 |
| 슬랙 봇 토큰 | `<슬랙 키 파일>` JSON `{"token":"<슬랙 토큰>…","channel":"C…","mode":"verbose"}` | 슬랙 알림만 빠짐(수집은 그대로) |
| 슬랙 시크릿(GitHub) | 저장소 시크릿 `SLACK_OPS_TOKEN`, `SLACK_OPS_CHANNEL` (mono, 미러 web, 미러 api) | 워크플로 실패 알림만 빠짐 |
| 대시보드 Basic Auth | `<콘솔 인증 파일>` `user:pass` 한 줄 (nginx `<서버 설정>`와 같은 값) | `status.py --remote`, 브라우저 접근만 실패 |

둘 다 **저장소 밖에 둔다.** `.gitignore`에 기대면 그 줄이 지워지는 날 그대로
올라간다. SSH 키는 노트북에서 그대로 복사한다(재발급하면 서버 쪽
`authorized_keys`도 같이 고쳐야 한다).

PostHog 키는 Annotation **Write** 스코프만 있으면 된다. 조회 API를 쓰려면
`query:read`를 더 켠다(지금은 꺼져 있다).

### 기기 연결. 여기가 제일 잘 깨진다

폰은 **무선 adb**로 붙는다. 현재 `<내부 IP>:5555`.

```bash
adb connect <내부 IP>:5555
adb devices          # 정확히 1대여야 한다
```

주의할 것 세 가지:

1. **IP가 바뀐다.** 하루 만에 `.9` → `.7`로 바뀐 적이 있다. 미니PC와 폰이
   같은 LAN에 있어야 하고, 공유기에서 폰 IP를 고정하는 게 낫다.
2. **USB와 무선이 같이 잡혀도 이제는 돈다**(2026-09-07). `detect_serial()`이
   `ro.serialno`로 전송로 뒤의 실제 기기를 물어 같은 폰인지 가른다. 같은
   폰이면 하나를 골라 쓰고 무시한 쪽을 찍어 준다. **정말 다른 폰이 둘**이면
   그때는 멈춘다. 어느 것을 수집할지는 사람만 안다(`ADB_SERIAL`로 지정).

   기본은 **USB**다. 무선은 IP가 바뀌고(하루 사이 `.9`→`.7`→`.9`) 공유기를
   타서 끊기는데, USB는 그 사이 **충전까지 된다**. 충전은 부수 효과가 아니라
   핵심이다. 2026-09-07에 폰이 충전 없이 돌다 10분 만에 화면이 꺼져 잠겼고,
   그 상태에서 전수조사가 배민 69곳을 전부 "만료 후보"로 적어 냈다.
   무선을 쓰려면 `ADB_SERIAL`에 그 주소를 준다. 순서는 data/devices.json이 정한다.
3. **잠금 패턴은 사람이 푼다.** 에이전트가 입력하지 않는다. 상시 가동하려면
   화면 잠금을 풀어 두거나(개발 전용 기기) 사람이 아침에 한 번 풀어야 한다.
   폰 설정에서 **개발자 옵션 → 충전 중 화면 켜짐**을 켜 둔다.

폰이 메모리를 먹으면 `uiautomator dump`가 exit 137(OOM)로 죽는다.
`dump_ui`가 두 번 재시도하며 `am kill-all`을 걸지만, 자주 나면 폰을
재부팅한다. `MemFree`가 200MB 근처면 위험, 500MB면 정상.

### 환경변수

전부 기본값이 있어 **안 넣어도 돈다.** 다른 자리에 둘 때만 넣는다. 목록과
기본값은 [`ENVIRONMENT.md`](ENVIRONMENT.md).

미니PC에서 실제로 넣을 만한 것:

```
ADB_SERIAL=<내부 IP>:5555      # 기기가 두 번 잡힐 때만
TARGET_ADDRESS=경기도 성남시 수정구 금토동
```

**사용자 환경변수는 이미 떠 있는 프로세스에 안 붙는다.** 예약 작업을 다시
등록하거나 셸을 다시 띄운다.

## 4. 상시 가동. 예약 실행

지금 노트북에는 예약 작업이 **하나도 없다**(`Get-ScheduledTask`로 확인).
전부 손으로 돌리고 있었다. 미니PC에서는 아래를 등록한다.

| 작업 이름 | 언제 | 무엇 |
|---|---|---|
| `discount-after-open` | 매일 00:01 / 08:30 / 15:55 | `scripts/after_open_daily.cmd` → `scripts/run_routine.py`(단계 정본은 `run_routine.task_table()`). 겹치면 새 실행을 버리고(IgnoreNew) 6시간에 끊는다 |
| `discount-mono-snapshot` | 매주 월 04:00 | **끔(사용자 결정 2026-11-15, 작업은 Disabled, 코드는 남김)**: 원장 캐시 `.events.jsonl`이 10-15에 얼어 10-19~11-09 문서 4개가 같은 값이었다. `mono/scripts/snapshot_weekly.cmd`(주 코호트가 월요일에 닫힌다) |

예전 작업 넷(`discount-baejjang`, `discount-banner`, `discount-coupangeats-weekly`,
`discount-full-audit`)과 그 `.cmd`는 2026-09-29에 은퇴했다. 그 일은 모두
`run_routine.py` 단계로 들어갔다. 작업 스케줄러에 남아 있으면 등록을 지운다
(`Unregister-ScheduledTask -TaskName <이름>`).

등록 예(PowerShell, 관리자):

```powershell
$act = New-ScheduledTaskAction -Execute "scripts\after_open_daily.cmd" `
    -WorkingDirectory "D:\...\Project"
$trg = @("00:01","08:30","15:55" | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ })
$set = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 6) -WakeToRun
Register-ScheduledTask -TaskName "discount-after-open" -Action $act -Trigger $trg `
    -Settings $set -RunLevel Limited
```

**로그를 남겨야 한다.** 예약 작업은 실패해도 조용하다. `.cmd`로 감싸 로그를
파일에 남긴다(`scripts/after_open_daily.cmd`가 그 모양이다).

미니PC 자체 설정도 같이 본다:

- **절전, 최대 절전 끔.** 자면 adb가 끊긴다.
- **자동 로그온** 또는 작업을 "사용자 로그온 여부와 관계없이 실행"으로.
  단, 후자는 대화형 세션이 없어 adb가 붙는지 먼저 확인한다.
- **Windows 업데이트 자동 재시작**을 사용 시간 밖으로 미룬다.

### 4-b. 밖에서 미니PC로 들어가기 (B안, 미설치. 절차만)

수집 PC는 인바운드가 없다. 현황은 서버로 밀어 올려 본다(ROUTINE-SPEC §1.1-c). 그래도
로그 원문, `adb`를 원격에서 직접 만지려면 아래 둘이 필요하고, **둘 다 관리자 권한과 사람의
로그인**이 필요해 세션이 못 한다(2026-09-17 확인: 세션은 비관리자, sshd, tailscale 없음).

1. 관리자 PowerShell: `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0`,
   `Set-Service sshd -StartupType Automatic; Start-Service sshd`. 키 로그인만
   (`C:\ProgramData\sshdministrators_authorized_keys`, `PasswordAuthentication no`).
2. Tailscale 설치(`winget install tailscale.tailscale`) 후 브라우저 로그인. 폰에도 Tailscale.
3. 그 뒤 `ssh Jaewun@<tailscale ip> "cd _dev\delivery-discount-tracker && python scripts\status.py --watch"`.
   예약 실행 중엔 폰을 만지지 않는다(§4).

### 4-c. 서버(OCI) 구성, 2026-09-17 정리 뒤

같은 서버에 있던 다른 프로젝트(turbom)를 내렸다. 살아 있는 것과 내린 것을 적어 둔다.

| 살아 있는 것 | 무엇 |
|---|---|
| `delivery-discount-api.service` | 우리 API. 포트 8088. nginx가 `bebeggars.duckdns.org`로 프록시 |
| nginx | `sites-enabled/delivery-discount-api.conf`(API, `/ops/` 대시보드, 전용 접근 로그 `discount.access.log`), `00-default.conf`(모르는 Host와 IP 직접 접근은 444로 끊는다) |
| GitHub 러너 2개 | `actions-runner-delivery-discount-api`(API 배포), `actions-runner-delivery-discount-tracker`(tracker). mono 러너는 2026-09-29에 해제했다. 디렉터리는 `.removed-20260929`로 이름만 바꿔 남겼다(`COLLECTION-INCIDENTS.md` 09-29) |
| cron | `ops_collect.py`(정본 beggars-ops) 5분마다(대시보드 서버 탭), `coverage_snapshot.sh` 매일 01:05 |
| 콘솔 계정 | nginx Basic Auth `<서버 설정>`. 사람마다 계정 하나: `sudo htpasswd <서버 설정> <이름>`(비밀번호 입력). nginx가 그 이름을 `X-Ops-User`로 넘겨 편집 이력과 제안 승인에 "누가"로 남는다(설계 30 첫 층, 2026-09-18). 공용 `ops` 계정은 팀원 계정이 다 만들어지면 지운다: `sudo htpasswd -D <서버 설정> ops` |
| `ops-apply.service` | 배너 제안 승인 반영과 콘솔 배너 편집기(2026-09-18). `GET /ops/banners`(yml 전체), `POST /ops/edit`(편집기 저장, 이력 `<콘솔 폴더>/edits/<날짜>.jsonl`, 백업 `.bak-<시각>-console`). `~/ops_apply.py`와 `~/banner_ops.py`(정본 beggars-ops. 그 저장소의 `deploy.yml`이 올린다. tracker `scripts/banner_ops.py`는 루틴이 import하는 사본이다). 127.0.0.1:8090, nginx `/ops/apply`가 Basic Auth 뒤에서 프록시. 제안서는 `<콘솔 폴더>/proposals/`, 적용 결과는 같은 곳의 `<날짜>.result.json`. `banners.yml`을 고칠 때마다 `.bak-<시각>`을 남긴다 |
| 비밀 파일 | `<슬랙 키 파일>`, `<비밀 파일>`, gh CLI 인증(`~/.config/gh`) |

| 내린 것 (2026-09-17 18:40) | 되돌리는 법 |
|---|---|
| `turbom-server.service`, `mysql.service` 중지와 비활성 | `sudo systemctl enable --now mysql turbom-server`. 데이터(`/var/lib/mysql`)와 jar(`turbom-server/target/`)는 그대로다 |
| turbom nginx vhost | `<서버 설정>`를 `sites-enabled/`로 되돌리고 reload |
| turbom GitHub 러너 | 서비스 제거와 디렉터리 삭제. 필요하면 GitHub에서 새 러너 토큰으로 재설치 |
| `app-build`(turbom-server 클론 1.3G), `delivery-discount-web` 클론 | GitHub에서 다시 clone |

디스크는 23G에서 19G가 되었다.

## 5. 옮긴 뒤 확인 순서

위에서부터 하나씩. 앞이 안 되면 뒤는 볼 필요가 없다.

```bash
# 0) 환경 전체. 필수 미달이 0인지
python scripts/bootstrap_check.py

# 1) 기기
adb devices                                   # 1대

# 2) 읽기. 아무것도 안 바꾼다
python scripts/banner_routine.py              # --apply 없이
python -m pytest -q                           # tracker 테스트

# 3) mono
cd mono && python -m pytest scripts -q && cd web && npm ci && npm test

# 4) 서버 연결
ssh -i <SSH 키 파일> <서버 계정> "echo ok"

# 5) 배포 경로. 미리보기만
python scripts/deploy_export.py               # 로컬/서버 건수를 눈으로 본다
```

5번의 건수 비교를 **반드시 본다.** `DISCOUNT_BRANDS_YML`을 못 찾으면
`export_data.py`가 경고 두 줄만 찍고 별칭 합치기를 건너뛴다. 2026-09-04에
그렇게 150건(정상 145건)이 만들어졌다.

## 6. Claude Code 설정 이관

지금 구조는 [`../public/ARCHITECTURE.md`](../public/ARCHITECTURE.md)에 있다. 여기는
**에이전트 환경 자체**를 옮기는 절차다.

설정은 전부 `~/.claude/`(Windows: `C:\Users\<사용자>\.claude\`) 아래에 있고,
MCP 서버만 그 밖의 `~/.claude.json`에 있다.

### 6.0 저장소가 들고 오는 것

`Project/.claude/settings.json`은 **저장소에 추적된다.** 클론하면 따라온다. 
`adb`, `git` 읽기 명령과 몇몇 스크립트를 미리 허용해 둔 목록이라, 새 머신에서
같은 권한 프롬프트가 반복되지 않는다. 손으로 만들 필요 없고, 만들면 오히려
저장소 것과 어긋난다. `mono`에는 없다.

### 6.1 그대로 복사할 것

| 자리 | 무엇 | 없으면 |
|---|---|---|
| `~/.claude/settings.json` | 모델, 권한 모드, 플러그인, 훅 | 기본값으로 돌아간다 |
| `~/.claude/CLAUDE.md` | 전역 지침(`@RTK.md`를 불러온다) | 지침이 통째로 빠진다 |
| `~/.claude/RTK.md` | rtk 사용 규칙 | 위와 같이 빠진다 |
| `~/.claude/rules/` | 규칙 조각(`context7.md`) | Context7을 안 쓰게 된다 |
| `~/.claude/plugins/` | 설치된 플러그인과 마켓 목록 | 플러그인 전부 빠진다 |
| `~/.claude/projects/<슬러그>/memory/` | 세션 간 기억 | 같은 실수를 반복한다 |

프로젝트 슬러그는 경로를 납작하게 편 이름이다. 지금은
`D--Dev--Woowahan-Techcourse-Project`. **미니PC에서 저장소를 다른 경로에 두면
슬러그가 달라져 기억을 못 읽는다**. 폴더 이름을 새 경로에 맞게 바꾸거나,
저장소를 같은 경로(`D:\Dev\_Woowahan-Techcourse\Project`)에 둔다.

지금 기억에 들어 있는 것(옮기면 그대로 살아난다):

```
MEMORY.md                              색인. 한 줄에 하나
feedback_verify_before_declaring.md    고장이라 말하기 전에 확인
feedback_confirm_before_destructive.md 지우기 전에 대상을 세어 보여라
feedback_orchestrator_git_check.md     저장소 셋 다 fetch+status
project_mono_separate_repo.md          mono는 별도 저장소
```

### 6.2 현재 설정값

`settings.json`에서 실제로 쓰고 있는 값. 복사 대신 새로 잡을 때 참고한다.

```
model            opus
effortLevel      low        (modelSettings.claude-opus-5도 같음)
permissions      defaultMode: auto
theme / autoUpdatesChannel / remoteControlAtStartup 는 취향
```

플러그인 5종과 출처:

| 플러그인 | 마켓 | 저장소 |
|---|---|---|
| caveman | caveman | `JuliusBrussee/caveman` |
| ponytail | ponytail | `DietrichGebert/ponytail` |
| superpowers | superpowers-marketplace | `obra/superpowers-marketplace` |
| context7 | claude-plugins-official | (공식) |
| frontend-design | claude-plugins-official | (공식) |

`~/.claude/plugins/`를 통째로 복사하면 캐시까지 같이 간다. 새로 받게 하려면
`settings.json`의 `extraKnownMarketplaces`만 옮기고 플러그인은 Claude Code가
재설치하게 둔다.

### 6.3 설정만 옮겨서는 안 되는 것

**`rtk` 바이너리.** `settings.json`의 `hooks.PreToolUse`가 `Bash` 호출마다
`rtk hook claude`를 부른다. 미니PC에 rtk가 없으면 **모든 Bash 호출에서 훅이
실패한다.**

```bash
rtk --version     # 0.44.1  (지금 자리: ~/.local/bin/rtk)
```

이름이 겹치는 다른 rtk(Rust Type Kit)가 있다. `rtk gain`이 동작하는지로
가른다. 안 되면 다른 물건이다.

**MCP 서버.** `~/.claude.json`에 `mcpServers`가 있고 지금은 `context7` 하나다.
이 파일은 85KB에 대화 이력, 프로젝트별 상태가 섞여 있으므로 **통째로 복사하지
말고** `mcpServers` 항목만 옮기거나 미니PC에서 다시 추가한다.

계정에 붙는 커넥터(Notion, Vercel, Slack, Chrome 확장)는 파일이 아니라 계정에
매여 있다. 로그인하면 따라온다. Chrome 확장만 미니PC 브라우저에 다시 깔고
사이트 권한을 다시 준다.

**자격증명은 여기 없다.** SSH 키와 PostHog 키는 §3을 따른다.

### 6.4 옮기고 나서

```bash
claude               # 뜨는지
rtk gain             # 훅이 부를 물건이 맞는지
```

Claude Code 안에서 확인할 것:

- `/status`. 모델과 권한 모드
- `/plugin`. 5종이 다 보이는지
- 첫 응답이 caveman, ponytail 말투인지 (플러그인이 붙었으면 그렇다)
- 기억이 붙었는지. 프로젝트 폴더에서 띄웠을 때 MEMORY.md가 들어온다

`~/.claude/sessions`와 `history.jsonl`은 선택이다. 옮기면 지난 대화를
`claude --resume`으로 이어갈 수 있다. 용량이 크고 없어도 새 세션은 잘 뜬다.

## 7. 실행 기록. 2026-09-06 실제 이관

이 문서를 처음으로 실제 미니PC에 대고 돌린 기록이다. 순서대로 따라 했을 때
막힌 지점과 이유를 남긴다.

### 7.1 저장소 구조가 처음부터 틀려 있었다

`mono`와 `tracker`를 각각 `git clone`만 하고 나란히 둔 상태로 시작했다.
§1이 요구하는 `tracker/mono/` 중첩이 아니어서 `_env_paths.py`가
`brands.yml`을 못 찾는 상태였다. `DISCOUNT_BRANDS_YML` 없이 그대로
뒀으면 2026-09-04와 같은 방식으로 조용히 깨졌을 것이다. 둘 다 클린한
상태였으므로 `mv 2026-to-discount delivery-discount-tracker/mono`로
옮기는 것으로 끝났다(별도 clone 불필요).

**함정**: 처음 `mv`가 "Device or resource busy"로 실패했다. 원인은 내
셸의 현재 작업 디렉터리가 옮기려는 폴더 **안**에 있었던 것. `cd ..`
하고 나서 재시도하면 된다.

### 7.2 Python이 사실은 설치돼 있지 않았다

`python --version`이 조용히 "Python"만 찍고 exit 49로 끝났다. 이건 진짜
파이썬이 아니라 **Windows Store로 연결하는 스텁**이다(`실행 별칭`).
`bootstrap_check.py`조차 이걸로는 못 돌린다. 이관의 첫 관문이
`python`인데 그게 가짜였던 셈이다.

`winget install -e --id Python.Python.3.14`로 설치했지만 그 뒤로도
같은 증상이 **간헐적으로 재발했다**. 어떤 새 터미널에서는 진짜
3.14.7이 잡히고, 어떤 터미널에서는 다시 스텁이 잡혔다. 앱 실행
별칭이 완전히 꺼지지 않은 상태에서 PATH 순서가 프로세스마다 달라진
것으로 보인다. **설정 → 앱 → 고급 앱 설정 → 앱 실행 별칭**에서
`python.exe`/`python3.exe` 토글을 직접 끄고 나서야 안정됐다.

### 7.3 winget 설치 직후 PATH가 새 프로세스에도 안 먹혔다

Java, adb, gh, vercel, rtk를 winget/npm/수동으로 설치한 뒤, **완전히 새
터미널 창**을 열어도 한동안 `command not found`가 났다. 터미널
앱(탐색기에 이미 떠 있던 호스트 프로세스)이 설치 이전의 환경변수
블록을 계속 물려주고 있었던 것으로 보인다. **재부팅**이 제일 확실한
해결책이었다. 새 탭/새 창 정도로는 안 될 때가 있다.

별개로: Claude Code 세션(이 문서를 실행하는 에이전트) 자체는 터미널을
껐다 켜도 PATH가 안 바뀐다. **에이전트가 실행하는 셸과 사람이 여는
터미널은 별개 프로세스**이므로, `gh auth login`, `vercel login`, 
`bootstrap_check.py` 같은 사람이 확인해야 하는 단계는 에이전트
세션이 아니라 **사람이 직접 새로 연 터미널**에서 돌리고 결과만
붙여넣는 방식으로 진행했다. 세션을 새로 켤 필요는 없다.

### 7.4 rtk는 이 저장소들에 설치 출처가 없다

`rtk`(전역 Bash 훅이 매 호출마다 부르는 토큰 절약 프록시)는 tracker나
mono 어디에도 설치 문서가 없다. 개인 도구라 사용자에게 직접 물어야
했다. 출처: `https://github.com/rtk-ai/rtk`,
`curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh`.

이 설치 스크립트는 **Windows(MINGW)를 감지 못 한다**
(`detect_os`가 Linux/Darwin만 안다). 대신 릴리스에 Windows 빌드
(`rtk-x86_64-pc-windows-msvc.zip`)가 있어 수동으로 받고
`checksums.txt`로 SHA-256을 직접 대조한 뒤 `~/.local/bin/`에 풀었다.

풀고 나서도 `rtk --version`이
`api-ms-win-crt-locale-l1-1-0.dll` 못 찾는다고 죽었다. VC++
런타임이 없어서다. `winget install -e --id Microsoft.VCRedist.2015+.x64`로
해결.

### 7.5 adb. IP가 이번에도 바뀌었고, 승인이 연결마다 따로다

문서에 `.9`→`.7` 변경 이력이 적혀 있었는데 이번엔 **`.7`→`.9`로 다시
바뀌어 있었다**. `detect_serial()`은 자동탐지라 영향 없지만, 사람이
`adb connect`에 쓰는 고정 IP는 매번 확인해야 한다. `ADB_SERIAL`
환경변수로 `<내부 IP>:5555`를 고정해 뒀지만, IP가 또 바뀌면 이 값도
다시 바꿔야 한다. 근본 해결은 공유기에서 폰 IP를 고정하는 것(§3
권고사항, 아직 안 함).

**2026-09-14에 그 변수를 지웠다.** 무선이 끊긴 채 목록에서도 사라졌는데
`ADB_SERIAL`이 그 주소를 가리켜 `detect_serial()`이 자동 판별을 건너뛰고
21:00 배짱, 전수조사가 첫 adb 호출에서 죽었다(11:05는 같은 변수 때문에
테스트 2건이 깨져 1단계에서 멈췄다. 09-13, 09-14 이틀 쿠폰함 수집 누락).
위 §2가 말하듯 같은 폰이 두 번 잡히는 건 자동으로 갈리므로 이 변수는
**정말 다른 폰이 둘일 때만** 둔다. 지금은 비워 둔다. 기본이 USB고
무선이 죽으면 USB로 간다.

승인은 폰-PC 조합이 아니라 **연결 방식(USB vs 무선)마다 따로** 뜬다.
USB로 이미 승인된 폰이어도 무선으로 처음 붙을 때 별도 팝업이 뜬다.
한 번은 팝업이 이미 지나가 있어 다시 `adb disconnect` 후
`adb connect`로 재요청해야 했다.

USB와 무선이 잠깐 동시에 잡힌 순간이 있었다(둘 다 `unauthorized`
상태였지만). §3의 경고대로 케이블을 뽑고서야 무선 하나만 남았다.

### 7.6 pytest는 `requirements.txt`에 없다

§5의 `python -m pytest -q`가 `No module named pytest`로 실패했다.
`requirements.txt`는 tracker 코드가 import하는 것만 적어 뒀고
(PyYAML, Pillow), pytest 자체는 개발 도구라 별도다.
`pip install pytest`로 채웠다. 이 문서의 §2 표에는 없던 항목이니
다음 이관 때는 미리 넣는다.

### 7.7 최종 상태

```
python scripts/bootstrap_check.py   →  21개 검사, 필수 미달 0, 선택 미달 0
adb devices                         →  <내부 IP>:5555   device
python scripts/deploy_export.py     →  로컬 146건 = 서버 146건
```

작업 스케줄러 등록 완료(§4 표에서 갱신):

| 작업 이름 | 시각 | 무엇 |
|---|---|---|
| `discount-after-open` | 매일 00:01 / 08:30 / 15:55 | `scripts/after_open_daily.cmd` → `scripts/run_routine.py` |
| `discount-mono-snapshot` | 매주 월 04:00 | `mono/scripts/snapshot_weekly.cmd`(**끔**, 사용자 결정 2026-11-15) |

예전 작업 넷(`discount-baejjang`, `discount-banner`, `discount-coupangeats-weekly`,
`discount-full-audit`)은 2026-09-29에 은퇴했다(§4). 등록이 남아 있으면 지운다.

모든 작업에 `WakeToRun`을 켜 뒀다(절전에서도 깨워서 실행). 다만 절전
자체를 껐다면 의미 없는 설정이다.

Windows 업데이트 활성 시간을 `00:00~23:00`으로 넓혀, 자동 재시작이
가능한 유일한 창(23:00~00:00)이 00:10 작업과 겹치지 않게 했다.

**여기까지 하고도 안 된 것**. 사람 손이 필요해서 이 세션에서 못
끝낸 항목:

- 절전, 최대 절전 끄기 (사용자가 직접 하기로 함)
- 자동 로그온 (비밀번호가 얽혀 있어 직접 설정 권장)
- 완전 종료 상태에서의 자동 전원 켜짐. OS가 아니라 BIOS/UEFI
  영역이라 원격으로 못 건드린다. 정전 복구 후 자동 부팅이 필요하면
  부팅 시 BIOS(Del/F2 등)에서 "AC Power Recovery" 항목을 켠다.

## 2026-09-17 추가. 조율기, 기기 목록

- 예약 작업 `discount-after-open`은 `scriptsfter_open_daily.cmd` → `scripts
un_routine.py`.
  옛 cmd 본문은 `after_open_daily.cmd.legacy`(문제면 파일명만 되돌린다).
- 기기 목록 `data\devices.json`(시리얼, 계정, 앱 배정). 두 번째 폰을 붙이면 여기 추가하고
  `apps`를 나눈다. 절차는 `docs/superpowers/specs/2026-09-17-multi-device-parallel-design.md` §7.
- 단계별 원문 로그 `logs\steps\<날짜>\<n>.log`, 조율기 stdout `logs
un_routine-stdout.log`.
- 화면 가드가 재난문자 등 남의 창을 닫는다(`capture/guards.py`). 잠금은 여전히 사람이 푼다.
