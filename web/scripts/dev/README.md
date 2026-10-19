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
