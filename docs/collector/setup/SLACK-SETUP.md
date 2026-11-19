<!-- 원본: tracker docs/setup/SLACK-SETUP.md — 여기서 고치지 않는다 -->
# 슬랙 알림 봇 만들기 (2026-09-17)

예약 실행의 시작, 실패, 재시도, 완료를 슬랙 채널로 보내는 봇을 만드는 절차다. 보내는 쪽 코드는 수집 PC의 `capture/slack_notify.py`이고, 서버 수집기 beggars-ops `ops_collect.py`도 같은 봇으로 배포 실패를 알린다. 5분 걸린다. 워크스페이스가 앱 설치를 막아 두지 않았다면 관리자 권한은 필요 없다.

## 1. 앱 만들기 (매니페스트로 권한까지 한 번에)

1. 브라우저에서 <https://api.slack.com/apps>를 열고 **Create New App**을 누른다.
2. **From a manifest**를 고르고 워크스페이스를 고른 뒤 **Next**.
3. 아래 JSON을 통째로 붙여 넣고 **Next**, **Create**.

```json
{
  "display_information": { "name": "수집 현황", "description": "배달앱 할인 수집 예약 실행 알림" },
  "features": { "bot_user": { "display_name": "collector-status", "always_online": true } },
  "oauth_config": { "scopes": { "bot": ["chat:write", "files:write"] } },
  "settings": { "org_deploy_enabled": false, "socket_mode_enabled": false, "token_rotation_enabled": false }
}
```

- `bot_user.display_name`은 사용자명 규칙을 따른다. 소문자 영문, 숫자, `-`, `_`만 되고 공백과 한글은 안 된다. 한글 이름은 `display_information.name`에만 쓴다. 채널에 보이는 이름은 그쪽이다.
- `chat:write`는 메시지 보내기와 편집(`chat.postMessage`, `chat.update`)에 쓴다.
- `files:write`는 증거 스크린샷 첨부(`files.getUploadURLExternal`, `files.completeUploadExternal`)에 쓴다.
- 그 밖의 권한은 주지 않는다. 읽기 권한도 없다.

## 2. 설치하고 토큰 받기

4. 왼쪽 메뉴 **Install App**(또는 **OAuth & Permissions**)에서 **Install to Workspace**를 누르고 **Allow**.
5. 같은 화면의 **Bot User OAuth Token**에서 `<슬랙 토큰>`로 시작하는 값을 복사한다. 비밀번호처럼 다룬다.

## 3. 채널 만들고 봇 초대

6. 슬랙에서 채널 하나(예: `#수집-현황`)를 만든다. 비공개여도 된다.
7. 채널에서 `/invite @collector-status`를 입력한다. 봇을 초대하지 않으면 `not_in_channel` 오류가 난다.
8. 채널 이름을 눌러 맨 아래 **Channel ID**(`C0`로 시작)를 복사한다. 채널 링크의 끝부분과 같다.

## 4. 미니PC에 설정 파일

9. PowerShell(일반 권한):

```powershell
@'
{"token": "<슬랙 토큰>여기에-토큰", "channel": "C0여기에채널ID", "mode": "alert"}
'@ | Set-Content -Encoding utf8 "$env:<슬랙 키 파일>"
```

- 파일은 저장소 밖 `<슬랙 키 파일>`에 둔다. 커밋되지 않는다.
- `mode`는 셋 중 하나다. `alert`(기본. 시작, 실패, 재시도, 완료만 보내고 내용은 대시보드가 맡는다), `verbose`(이벤트마다 한 줄), `thread`(실행당 메시지 하나와 그 아래 스레드). 값을 바꾸면 다음 실행부터 적용된다.

## 5. 확인

10. 미니PC에서:

```powershell
cd $env:USERPROFILE\_dev\delivery-discount-tracker
python -m capture.slack_notify --test
```

채널에 `수집 현황 연결 확인` 한 줄이 오면 끝이다. 다음 예약 실행([`ROUTINE-SPEC.md`](ROUTINE-SPEC.md))부터 자동으로 보낸다. 재시작은 필요 없다. 실행마다 설정 파일을 읽는다.

## 자주 나는 오류

| 오류 | 뜻 | 조치 |
|---|---|---|
| `slack chat.postMessage: not_in_channel` | 봇이 채널에 없다 | 7번의 `/invite` |
| `invalid_auth` | 토큰 오타이거나 다른 워크스페이스의 토큰이다 | 5번에서 다시 복사 |
| `channel_not_found` | 채널 ID가 틀렸다. 이름을 넣은 경우가 많다 | 8번의 `C0` ID |
| `missing_scope` | 매니페스트에 권한이 빠졌다 | OAuth & Permissions에서 `chat:write`와 `files:write`를 더하고 **Reinstall** |

## 보안

- 토큰은 수집 PC `<슬랙 키 파일>`, 서버 `<슬랙 키 파일>`, GitHub 저장소 시크릿 `SLACK_OPS_TOKEN` 세 곳에 있다. 유출되면 api.slack.com/apps에서 앱의 **OAuth & Permissions**에 들어가 **Revoke**한 뒤 재설치하고 세 곳을 갱신한다. 봇은 쓰기만 하고 채널을 읽을 권한이 없다.
- 채널에 가는 내용은 단계 이름, 상태, 소요, 재시도, 화면 가드 로그, 실패 시 증거 스크린샷(앱 화면)이다. 설문 응답과 개인정보는 이 경로로 가지 않는다.
