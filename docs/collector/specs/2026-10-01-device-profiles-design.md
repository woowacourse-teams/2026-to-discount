<!-- 원본: tracker docs/specs/2026-10-01-device-profiles-design.md — 여기서 고치지 않는다 -->
# 기기 프로필과 기기 드라이버 설계안 (2026-10-01)

## 왜

같은 앱, 같은 화면이라도 기기마다 뷰 트리(접근성 트리)가 다르다. 2026-10-01 하루에만 셋이 나왔다.

| 기기 | 앱 | 차이 | 증상 |
| --- | --- | --- | --- |
| 새 서브(LG X6, Android 10, WebView 154) | 쿠팡이츠 허브 | 탭 이름이 `text`가 아니라 `content-desc` | 허브가 열렸는데 "안 열린다"로 떨어짐 |
| 새 서브 | 쿠팡이츠 허브 | 카드 금액이 "6,000원" / "할인" 두 칸으로 쪼개짐 | 고정 쿠폰 0곳 |
| 메인(SM-G885S, Android 9) | 요기요 홈 | 하단 탭 다섯 칸 bounds가 `[0,0][0,0]` | (0,0)을 눌러 쿠폰함 단계 실패 |

지금은 코드 곳곳에서 그때그때 대비한다(`patience`, `swipe_ref`, `same_screen`, 탭 자리 폴백 등). 대비가 흩어져 있어
기기를 하나 더 붙일 때 어디를 봐야 하는지 모른다. 그리고 앞으로 **iOS 기기**를 붙일 수 있다 — 지금 수집 코드는
adb(`run_adb` 90곳 이상)와 uiautomator XML에 직접 묶여 있어 iOS에서는 한 줄도 안 돈다.

## 목표

1. 기기별 차이를 **한 곳(기기 프로필)**에 적는다. 코드에 기기 이름이 나오지 않는다.
2. 화면을 읽고 누르는 일을 **기기 드라이버** 뒤로 숨긴다. Android(adb)와 iOS를 같은 인터페이스로 쓴다.
3. 기존 수집은 그대로 돈다. 한 번에 갈아엎지 않고 단계별로 옮긴다.

## 설계

### 1. 기기 프로필 (`data/devices.json` 확장)

```json
{"id": "sub2", "serial": "<폰 일련번호>", "os": "android", "apps": ["ddangyo"],
 "load_factor": 2.5,
 "quirks": {
   "coupangeats.hub_tab_attr": ["text", "content-desc"],
   "coupangeats.split_amount": true,
   "yogiyo.tabbar_placeless": false
 },
 "taps": {"yogiyo.my_tab": [0.853, 0.940]}}
```

- `load_factor`: 이미 있다(`capture.common.patience`). 기다림 기록(`logs/waits`, `scripts/wait_report.py`)으로 값을 정한다.
- `quirks`: 판독기가 묻는 이름 붙은 차이. 판독기는 기기 이름이 아니라 quirk 이름으로 분기한다.
  **기본은 "둘 다 받아들인다"**(text와 content-desc 둘 다, 붙은 금액과 쪼개진 금액 둘 다)로 짜고, quirk는 그게
  안 될 때만 쓴다. 오늘 고친 셋도 이미 "둘 다 받아들이는" 꼴이다.
- `taps`: 트리가 자리를 안 줄 때만 쓰는 **화면 비율** 좌표(픽셀 아님). 트리에 자리가 있으면 늘 트리가 이긴다.
- 프로필이 없는 기기는 기본값으로 돈다(배수 1, quirk 없음).

### 2. 기기 드라이버 (`capture/driver/`)

수집기가 기기에 하는 일은 몇 가지뿐이다. 이걸 인터페이스로 묶는다.

| 동작 | Android(adb) | iOS |
| --- | --- | --- |
| 화면 트리 | `uiautomator dump` XML | XCUITest 접근성 트리(Appium/WebDriverAgent의 page source) |
| 스크린샷 | `screencap` | WDA `/screenshot` |
| 탭·스와이프 | `input tap/swipe` | WDA 터치 액션 |
| 뒤로가기 | `KEYCODE_BACK` | **없음** — 화면의 뒤로/닫기 버튼, 스와이프 백 |
| 앱 띄우기·딥링크 | `am start`, `monkey` | `xcrun simctl openurl`(시뮬레이터) / WDA `activateApp`, 유니버설 링크 |
| 포커스 앱 | `dumpsys window` | WDA `activeAppInfo` |
| 클립보드 | `cmd clipboard` 등 | WDA `getPasteboard` |

- 판독기는 드라이버가 준 **정규화된 노드 목록**(글자, 설명, 자리, 누를 수 있는지)만 본다. uiautomator XML 정규식(`text="…"`)을
  판독기에서 직접 쓰지 않게 옮긴다 — iOS 트리에는 `text=` 속성이 없다(`label`, `value`, `name`).
- 지금의 `run_adb`, `dump_ui`, `screenshot`, `tap_center`, `swipe_ref`가 Android 드라이버가 된다. 시그니처는 유지하고
  안에서 드라이버를 부른다(1단계에서 호출부를 안 바꿔도 된다).

### 3. iOS에서 따로 생각할 것

- **뒤로가기 키가 없다.** 오늘 넣은 공통 가드("닫기가 없으면 뒤로가기 한 번")는 iOS에서 "닫기·뒤로 버튼 찾기 → 없으면 왼쪽 가장자리 스와이프"로 바뀐다. 가드 표(`capture/guards.py`)의 BACK 동작을 드라이버의 `back()`으로 돌린다.
- **딥링크 방식이 다르다.** Android `intent://`, `coupangeats://Web?url=` 같은 스킴은 iOS에서 안 될 수 있다. 앱별로 iOS 진입 경로(유니버설 링크, 앱 내 탐색)를 프로필에 따로 둔다.
- **WebView 트리.** iOS WKWebView 접근성 트리는 Android WebView와 모양이 다르다. 쿠팡이츠 허브처럼 웹 화면을 읽는 단계는 OCR(이미 `capture/ocr.py`가 있다) 폴백을 같이 둔다.
- **기기 연결.** iOS는 Mac(또는 WDA를 띄울 수 있는 환경)이 필요하다. 수집 PC가 Windows라 iOS는 원격 WDA 주소로 붙는 꼴이 된다. 프로필에 `"os": "ios", "wda_url": …`.
- **잠금·권한.** 잠금 해제는 사람이 한다는 규칙(MINIPC-HANDOVER §3)은 iOS도 같다.

## 단계

1. **프로필 확장** — `devices.json`에 `os`, `quirks`, `taps`를 받고, 오늘 코드에 흩어 넣은 대비(탭 자리 폴백 등)를 프로필 값으로 옮긴다. 테스트: 프로필 없는 기기 = 지금과 같은 동작.
2. **드라이버 인터페이스** — `capture/driver/base.py`(추상), `android.py`(지금 코드 이동). `common.py` 함수는 드라이버를 부르는 얇은 층으로.
3. **판독기 정규화** — 판독기가 XML 정규식 대신 정규화 노드를 보게 한 앱씩 옮긴다(배민 → 쿠팡이츠 → 요기요 → 땡겨요). 각 앱 옮길 때 그 앱 실기 시험(하네스 `scripts/collect_trial.ps1`).
4. **iOS 드라이버 시제품** — 앱 하나(쿠폰함처럼 화면이 단순한 단계)로 iOS 드라이버를 붙여 본다.

## 하지 않는 것

- 기기 이름(시리얼)으로 판독기 안에서 분기하지 않는다.
- 픽셀 좌표를 프로필에 적지 않는다(비율만).
- 한 번에 모든 판독기를 옮기지 않는다.
