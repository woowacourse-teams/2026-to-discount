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

## UI 키트 (피그마 왕복용)

    node scripts/dev/capture-dom.mjs      # 프리뷰(:4179)에서 바·배너·카드 DOM과 CSS를 뜬다 -> $TMP/dom.json
    python scripts/dev/build-ui-kit.py    # public/design/ui-kit.html 생성

배포되면 `/design/ui-kit.html`. 피그마 플러그인 html.to.design으로 그 주소를
가져오면 편집 가능한 레이어가 된다(코드 -> 피그마). 고친 프레임은 Figma MCP로
읽어 CSS로 역반영한다(피그마 -> 코드). 흐름은 docs/design/23-figma-roundtrip.md.
