# 23. 피그마 왕복 — 코드 → 피그마 → 코드 (2026-09-16)

사용자 결정: 프론트 요소를 피그마로 옮겨 놓고 거기서 직접 고친 뒤 코드에
역반영한다. 프론트 변경·확장을 화면에서 먼저 결정하기 위해서다.

## 갖춘 것

| | 무엇 | 상태 |
|---|---|---|
| Figma MCP | `https://mcp.figma.com/mcp` (원격, HTTP) — 프로젝트 `.claude.json`에 등록 | 사용자 OAuth 완료. **세션을 새로 열어야 도구가 붙는다** |
| UI 키트 | `web/public/design/ui-kit.html` → 배포 시 `/design/ui-kit.html` | 운영 DOM·CSS를 그대로 떠낸 정적 페이지: 토큰 / 상단 바 / 배너(360·900) / 카드(펼침·접힘) / 오퍼 칩 5상태 / 필터 시트 |
| 생성 스크립트 | `web/scripts/dev/capture-dom.mjs` + `build-ui-kit.py` | 프리뷰에서 DOM을 떠 키트를 다시 만든다 — 컴포넌트가 바뀌면 다시 돌린다 |

## 흐름

1. **코드 → 피그마**: 피그마에서 플러그인 `html.to.design` → URL 가져오기 →
   `https://<프리뷰 또는 운영>/design/ui-kit.html`. 섹션마다 프레임이 생기고
   텍스트·색·간격이 편집 가능한 레이어가 된다. (원격 Figma MCP는 읽기
   전용이라 이 방향은 플러그인이 맡는다. 데스크톱 앱의 Dev Mode MCP
   `use_figma`면 코드에서 직접 그릴 수 있는데, 미니PC엔 데스크톱 앱이 없다.)
2. **피그마에서 수정**: 프레임을 고친다. 컴포넌트 클래스(`.offer__best-tag` 등)가
   레이어 이름으로 남아 어느 CSS인지 바로 짚인다.
3. **피그마 → 코드**: 고친 프레임을 선택하고 Claude 세션에 링크를 준다.
   Figma MCP `get_design_context`(구조·값) · `get_screenshot`(그림) ·
   `get_variable_defs`(토큰)로 읽어 `App.css`/JSX에 반영하고, 프리뷰 브랜치에
   올려 대조한다(21번 문서 B안: mono 브랜치 → 미러 `preview/<이름>` 브랜치 →
   Vercel 프리뷰).
4. 확정이면 main 머지 → 운영.

## 주의

- 키트는 **스냅샷**이다. 컴포넌트를 바꾸면 `capture-dom.mjs` → `build-ui-kit.py`로
  다시 만들어야 피그마 쪽 기준이 안 낡는다. 자동화 후보: mirror 워크플로에 키트
  생성 단계 추가.
- 로고·아이콘은 `/logos`, `/platform-icons` 상대 경로라 **배포된 주소**로
  가져와야 그림이 뜬다(로컬 파일로는 안 뜬다).
- 카드 3장은 떠낸 시점의 실데이터(피자헛·도미노·청년피자)다. 상태 예시는
  "오퍼 칩 상태" 섹션이 고정으로 든다.
- 프리뷰 주소 CORS: 브랜치 별칭(`beggars-git-*`)과 배포 고유(`beggars-*`) 둘 다
  허용(`WebConfig`, 2026-09-16).
