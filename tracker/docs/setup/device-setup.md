# 캡처 기기 설정

캡처 대상은 USB로 연결한 실기다 ([ADR-009](../decisions/ADR-009-real-device-over-emulator.md)).

## 현재 기기 (2026-07-27 기준)

| 항목 | 값 |
|---|---|
| 모델 | Xiaomi 2311DRK48G (`duchamp`) |
| Android | 16 |
| 해상도 / 밀도 | 1220 x 2712 / 480dpi |
| serial | `CQD6X8GQUCVGWSUC` |

## PC 쪽 준비

`adb`가 PATH에 있어야 한다. 이 PC는 Android Studio가 깔아둔 SDK를 쓴다.

```
ANDROID_HOME = %LOCALAPPDATA%\Android\Sdk
PATH        += %LOCALAPPDATA%\Android\Sdk\platform-tools
```

확인:

```bash
adb devices -l
# CQD6X8GQUCVGWSUC   device product:duchamp_global model:2311DRK48G
```

기기에서 **개발자 옵션 > USB 디버깅**이 켜져 있어야 하고, 최초 연결 시 폰에 뜨는 디버깅 허용을 사람이 승인해야 한다.

## 앱

로그인은 사람이 1회 직접 수행한다 (명세 §8). 아래는 실기에서 확인한 패키지명이다.

| 앱 | 패키지 | 상태 |
|---|---|---|
| 배달의민족 | `com.sampleapp` | 설치·로그인 완료 |
| 쿠팡이츠 | `com.coupang.mobile.eats` | 설치·로그인 완료 |
| 땡겨요 | `com.shinhan.o2o` | 설치·로그인 완료 |
| 요기요 | `com.fineapp.yogiyo` | 설치됨 (1차 범위 밖) |
| 배달특급 | — | 미설치 |

> 배민 패키지는 이름이 `com.sampleapp`이다. 오타가 아니라 실제 값이다.

## 앱별 실측 상수

좌표는 위 해상도에 묶여 있다. **기기가 바뀌면 전부 다시 재야 한다.**

### 배달의민족 — `capture/baemin.py`

| 상수 | 값 | 재는 방법 |
|---|---|---|
| `TARGET_ACTIVITY` | `com.sampleapp/com.baemin.shared.web.base.presentation.WebViewActivity` | `adb shell dumpsys window \| grep mCurrentFocus` |
| `BRAND_LOUNGE_DEEPLINK` | `baemin://./webview?webview_url=https%3A%2F%2Finapp-webview.baemin.com%2Fbrand-lounge` | APK 문자열에서 발견 ([ADR-011](../decisions/ADR-011-deeplink-entry-over-tap-path.md)) |
| `NEARBY_ONLY_CHECKBOX_TAP` | (80, 789) | 스크린샷에서 체크박스 중심 |
| `NEARBY_ONLY_CHECKBOX_BOX` | (55, 765, 108, 815) | 체크박스 안쪽. 켜짐/꺼짐을 밝기로 판정 |
| `CONTENT_BOTTOM_PX` | 2570 | `dumpsys activity com.sampleapp`의 웹뷰 bounds 하단 |
| `STATUS_BAR_PX` | 120 | 시계·배터리가 들어가는 상단 높이 |
| `OVERLAP_PX` | 1521 | 아래 절차로 실측 |
| 스와이프 | x=610, y 2000 → 900 | 콘텐츠 영역 안이면 됨 |

`배짱할인`은 자동화하지 않는다. 수동 캡처다 ([ADR-011](../decisions/ADR-011-deeplink-entry-over-tap-path.md)).

## `OVERLAP_PX` 재는 절차

스와이프 한 번에 화면이 실제로 몇 픽셀 올라가는지(`d`)를 재고 `overlap_px = CONTENT_BOTTOM_PX - d`를 쓴다. 요청한 스와이프 거리와 실제 이동량은 다르다 — 플링 감속 때문에 1100px 요청에 1049px만 움직였다.

1. 대상 화면을 연다
2. 스크린샷을 찍는다 (`before`)
3. 스와이프 한 번
4. 스크린샷을 찍는다 (`after`)
5. `before`를 `d`픽셀 위로 민 것이 `after`와 가장 잘 맞는 `d`를 찾는다. 비교 구간은 고정 헤더와 내비 바를 뺀 콘텐츠 영역만

## 새 기기로 옮길 때

1. `adb devices`로 serial 확인
2. `adb shell wm size`로 해상도 확인
3. 위 표의 좌표 상수를 전부 다시 측정
4. `python -m pytest`는 기기 없이도 통과해야 한다 (기기가 필요한 부분은 테스트하지 않는다)
5. 캡처를 두 번 연속 돌려 **결과 이미지 높이가 같은지** 확인한다. 다르면 체크박스 토글이나 바닥 감지가 깨진 것이다
