// 로고 주소 계산. 컴포넌트(logos.jsx)와 분리한다.
//
// `node --test`가 .jsx를 못 읽어서(ERR_UNKNOWN_FILE_EXTENSION) 순수 함수가
// 컴포넌트 파일에 있으면 테스트를 못 붙인다. 색 추출(brandColor.js)도 이
// 함수만 필요하지 컴포넌트는 안 쓴다.
import { LOGO_MANIFEST } from './logoManifest.js'

function assetSrc(base, name) {
  return `${base}/${encodeURIComponent(name)}.png`
}

// 파일명 규칙. 대표명을 그대로 쓰지 않는다 — 공백·& 등이 `_`로 바뀐다.
// 이걸 어기면 파일은 있는데 화면에 안 뜬다(ADR-027, 2026-09-07 실측).
export function logoFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9가-힣]+/g, '_')
    .replace(/^_|_$/g, '')
}

// 로고 주소. **없으면 null이다 — 요청하지 않는다.**
//
// 예전에는 있든 없든 요청했다. 없으면 404가 오는데 `vercel.json`이
// `/logos/(.*)`에 `max-age=2592000, immutable`을 걸어 **그 404가 30일간
// 캐시됐다.** immutable이라 재검증조차 안 하므로, 나중에 로고를 올려도
// 먼저 방문했던 브라우저에는 30일 동안 안 보인다(2026-09-11 빽다방 실측).
//
// 매니페스트에 있는 것만 요청하고 `?v=<내용해시>`를 붙인다.
//   - 없는 로고: 요청 0 — 404가 안 생기니 캐시될 것도 없다. 로고 없는
//     브랜드만큼 Edge Requests도 준다(한도를 요청 수로 센다).
//   - 바뀐 로고: 해시가 달라져 URL이 바뀌므로 옛 캐시를 비켜 간다.
//   - 그대로인 로고: URL이 같아 30일 immutable 캐시를 그대로 쓴다.
export function brandLogoSrc(name) {
  const fileName = logoFileName(name)
  const version = LOGO_MANIFEST[fileName]
  if (!version) return null
  return `${assetSrc('/logos', fileName)}?v=${version}`
}

export { assetSrc }
