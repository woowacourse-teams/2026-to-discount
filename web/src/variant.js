import { getAnalyticsContext } from './analytics-context.js'

/**
 * 어느 화면을 보여줄지 정한다.
 *
 *   a = 한 줄 바 + 분류 캐러셀 (조건을 전부 펼쳐둔다)
 *   b = 두 줄 바 + 필터 바텀시트 (조건을 시트에 감춘다)
 *
 * <p>배정은 visitorId를 해시해서 즉시 정한다. 서버나 SDK에 물어보면 답이
 * 올 때까지 무엇을 그릴지 모르고, 일단 한쪽을 그렸다가 갈아끼우면 첫
 * 화면이 눈앞에서 바뀐다 — 그 깜빡임 자체가 실험을 오염시킨다.
 *
 * <p>visitorId는 localStorage에 남으므로 재방문해도 같은 쪽이 나온다.
 * 무엇을 봤는지 기억 못 하는 사람에게 매번 다른 화면을 주면 "이 화면이
 * 쓸 만한가"가 아니라 "화면이 바뀌면 헷갈리는가"를 재게 된다.
 *
 * <p>대신 비율을 원격에서 못 바꾼다. 반반 말고 다른 비율이 필요해지면
 * 그때 PostHog 플래그로 옮긴다(지금은 advanced_disable_feature_flags로
 * 꺼져 있다).
 */
const VARIANTS = ['a', 'b']

// 개발·QA용 강제. ?variant=b로도 넘길 수 있게 열어둔다 — 배정된 쪽이
// 아닌 화면을 확인할 길이 없으면 고칠 때마다 localStorage를 지워야 한다.
function override() {
  const fromUrl = new URLSearchParams(location.search).get('variant')
  if (VARIANTS.includes(fromUrl)) return fromUrl
  const fromEnv = import.meta.env?.VITE_UI_VARIANT
  if (VARIANTS.includes(fromEnv)) return fromEnv
  return null
}

// FNV-1a. 암호용이 아니라 고르게 흩기만 하면 된다.
function hash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const uiVariant = (() => {
  const forced = override()
  if (forced) return forced
  const { visitorId } = getAnalyticsContext()
  // localStorage가 막혀 visitorId조차 없으면 기존 화면을 준다.
  if (!visitorId) return 'a'
  return VARIANTS[hash(visitorId) % VARIANTS.length]
})()

/**
 * 두 안이 한 스타일시트를 쓰므로, 같은 이름의 규칙이 서로를 덮지 않게
 * 뿌리에 어느 안인지 새긴다. CSS는 [data-variant="a"] 아래에서만 A의
 * 바 규칙을 켠다 — 클래스 이름만으로 가르면 나중에 이름이 겹치는 순간
 * 조용히 어긋난다.
 *
 * <p>부르는 쪽(main.jsx)이 실행한다. import만으로 DOM을 건드리면 이
 * 모듈이 브라우저 밖(테스트 러너)에서 못 불린다 — 실제로 계측 테스트가
 * document 없이 이 파일을 읽다 죽었다.
 */
export function markVariantOnRoot() {
  document.documentElement.dataset.variant = uiVariant
}
