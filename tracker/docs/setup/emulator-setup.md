# 헤드리스 Android 에뮬레이터 설정

> 이 PC(Windows, `C:\Users\soldesk`)에는 Android Studio 설치 과정에서 SDK와 AVD가
> 이미 준비되어 있었다. 아래는 `sdkmanager`/`avdmanager` CLI로 처음부터 만드는 절차가
> 아니라, **이 환경에서 실제로 확인된 상태**를 기록한 것이다. 다른 환경(예: 리눅스 서버)
> 에서 새로 준비할 때는 원래 계획(Task 1)의 cmdline-tools 절차를 따른다.

## 확인된 상태

- SDK 위치: `%LOCALAPPDATA%\Android\Sdk`
- `adb`: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` — **PATH에 없음**, 전체 경로로 호출하거나 PATH에 추가해서 쓴다.
- AVD: `Pixel_9_Pro` (`~/.android/avd/Pixel_9_Pro.avd`, target `android-37.0`)
  - 계획 초안의 `discount-tracker`(pixel_6, android-34)는 만들지 않았다 — ADR-002는 "SDK 에뮬레이터 vs BlueStacks"만 근거로 들 뿐 기종을 못박지 않았고, 좌표 실측(Task 8~10)이 아직 없는 시점이라 기종 차이가 실질적 영향이 없다. 이미 떠 있는 것을 그대로 쓴다.
- 해상도: `1280x2856` (`adb shell wm size`)
- 기동 확인: `adb devices` → `emulator-5554	device`

## 기동 명령 (참고)

```bash
"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd Pixel_9_Pro -no-window -no-audio -gpu swiftshader_indirect
```

## 검증

Run: `"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" devices`
Expected: `emulator-5554	device` — 확인됨.

## 남은 일 (사람이 직접 수행)

배민·쿠팡이츠·땡겨요 앱이 아직 이 AVD에 설치되어 있지 않다. 설치 후 최초 로그인까지
사람이 직접 수행해야 한다(README 참고).
