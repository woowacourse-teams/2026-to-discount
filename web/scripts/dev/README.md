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
