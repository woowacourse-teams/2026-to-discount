// React.lazy용 import 래퍼. 네트워크가 끊겼다 돌아오거나 앱이 import를 undefined로 끝내면
// lazy가 "undefined is not an object (evaluating '_result.default')"로 터져 화면 조각이 통째로 죽었다
// (PostHog client_error 7일 16건). 한 번 더 시도해 대부분 살리고, 그래도 안 되면 그대로 던진다
// (배포로 지워진 옛 청크는 main.jsx의 vite:preloadError가 새로고침으로 푼다).
export async function importRetry(load, wait = 600) {
  for (let i = 0; ; i++) {
    try {
      const mod = await load()
      if (mod && mod.default) return mod
      throw new Error('lazy import가 default 없이 끝났다')
    } catch (e) {
      if (i >= 1) throw e
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}
