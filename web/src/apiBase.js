// 배포 환경이 없던 운영 빌드의 동작은 유지한다. 개발 배포에서는 운영으로 대체하지 않는다.
export const PRODUCTION_API = 'https://bebeggars.duckdns.org'
export const DEVELOPMENT_API = 'https://dev-api-todiscount.duckdns.org'

export function resolveApiBase(value, environment) {
  if (environment && !['development', 'production'].includes(environment)) {
    throw new Error('VITE_APP_ENV는 development 또는 production이어야 합니다')
  }
  const supplied = value?.trim()
  if (environment === 'development' && !supplied) throw new Error('개발 API 주소가 필요합니다')
  const raw = supplied || PRODUCTION_API
  let url
  try { url = new URL(raw) } catch { throw new Error('API 주소는 절대 URL이어야 합니다') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.search || url.hash || url.pathname !== '/') {
    throw new Error('API 주소는 http 또는 https origin이어야 합니다')
  }
  if (environment === 'development' && url.origin !== DEVELOPMENT_API) {
    throw new Error('개발 배포는 개발 API만 사용할 수 있습니다')
  }
  return url.origin
}
