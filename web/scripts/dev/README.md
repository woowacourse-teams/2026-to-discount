# 모바일 확인용 스크립트 (개발자 로컬 전용)

배너·카드 UI는 **항상 모바일(360px) 기준으로 보고 올린다**(사용자 결정
2026-09-16). Edge 헤드리스를 CDP로 몰아 `vite preview`(:4179)를 찍는다.

    npm run build && npx vite preview --port 4179 --strictPort &
    node scripts/dev/banner-shot.mjs 2 out.png      # 세 번째 장을 360px, 2x로 찍는다
    node scripts/dev/banner-measure.mjs             # 배너 요소들의 박스 크기

- 프리뷰는 운영 API를 직접 부르므로 `--disable-web-security`로 CORS를 끈다.
  이벤트(`?dev=1`)는 dev 표시로 나간다.
- 스와이프는 `Input.synthesizeScrollGesture`가 헤드리스에서 안 먹었다 —
  `el.scrollTo`로 칸을 옮기고 settle을 검증하는 식으로 대신했다(2026-09-16).

## 저사양 폰 부하 측정

    node scripts/dev/load-tbt.mjs "https://beggars-five.vercel.app/?home=a&dev=1" "https://beggars-five.vercel.app/?home=old&dev=1" --runs 5

CPU 4배 감속, 360px 새 방문으로 열어 긴 작업(TBT), 레이아웃 이동, LCP, 예외 수를 잰다. 주소 여럿은 번갈아 연다.
보호된 프리뷰는 `VERCEL_BYPASS_FILE`(우회 값 파일 경로)을 준다. Lighthouse 점수는 같은 주소도 크게 흔들려
전후 비교에 이 스크립트를 쓴다. `--max-tbt`, `--max-cls`를 주면 넘을 때와 페이지 예외가 있을 때 종료 코드 1이다.
CI `web-perf`(.github/workflows/web-perf.yml)가 main 배포 뒤 운영에 이 기준으로 돈다(TBT 1,000ms, CLS 0.1, 예외 0).
`load-interact.mjs <주소>`는 같은 조건에서 카드 펼치기, 필터, 검색, 목록 끝 스크롤을 해 시나리오별 긴 작업을 잰다. 기록: `docs/metrics/WEB-PERFORMANCE-20261014.md`.

## UI 키트 (피그마 왕복용)

    node scripts/dev/capture-dom.mjs      # 프리뷰(:4179)에서 바·배너·카드 DOM과 CSS를 뜬다 -> $TMP/dom.json
    python scripts/dev/build-ui-kit.py    # public/design/ui-kit.html 생성

배포되면 `/design/ui-kit.html`. 피그마 플러그인 html.to.design으로 그 주소를
가져오면 편집 가능한 레이어가 된다(코드 -> 피그마). 고친 프레임은 Figma MCP로
읽어 CSS로 역반영한다(피그마 -> 코드). 흐름은 docs/archive/design/29-figma-roundtrip.md(보관, 2026-09-29).

## iOS 배치 검사의 시험 데이터 (ios-shot local)

`layout-report.py`가 가짜 API다. 고정 데이터(`fixtures/`)를 바꾸면 기준일 `fixtures/DATE`도 같이 고친다. 7일이 넘으면 검사 요약에 경고가 뜬다.
`live:` 장면은 찍기 직전에 받은 운영 응답(`PRODUCTION_API`)으로 연다. API와 웹을 함께 바꾸는 PR은 이 장면이 병합 전 옛 API 응답으로 새 웹을 보므로 거짓 경고가 날 수 있다.
시험: `python3 -m unittest discover -s web/scripts/dev -p 'test_*.py'`

## iOS 쿠폰 글자 배치

`ios-shot`은 웹 PR에서 iOS Safari 시뮬레이터로 브랜치의 빌드와 고정 데이터를 엽니다. `layout-check.js`가 글자 좌표를 보고하고, `layout-report.py summary`가 실패 종료 코드를 반환합니다.

기본 장면 `/?home=a&tab=4&expect=coupon-text`는 카페 분류로 전환해 금액과 단위, 최소주문 문구가 있는 쿠폰을 검사합니다. 금액이나 단위의 폭이 0이거나, 서로 겹치거나, 최소주문 텍스트의 폭이 0이면 실패합니다. 검사할 금액이나 최소주문이 없어도 실패합니다. `live:`가 붙지 않은 고정 데이터 장면이므로 경고로 낮추지 않습니다.

검사 로직과 결과 요약은 로컬에서도 확인할 수 있습니다.

```sh
# 저장소 루트에서 실행
node --test web/src/couponLayout.test.js
python3 -m unittest discover -v -s web/scripts/dev -p 'test_*.py'
```

Node 테스트는 잘못된 좌표를 놓치지 않는지 확인합니다. iOS 자체의 글자 배치 재현은 `ios-shot`의 실제 Safari 실행이 담당합니다. 운영 배포 후 실행은 현재 캡처만 하므로, 이 설명의 실패 판정은 PR 또는 `local=true` 실행에 해당합니다.
