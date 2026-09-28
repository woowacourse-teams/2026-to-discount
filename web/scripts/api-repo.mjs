// 웹과 API가 맞물리는 계약의 정본은 API 저장소에 있다. 웹 검사가 그것을 옆에서 읽는다.
//
//   이벤트 허용 목록   src/main/java/com/discounttracker/analytics/EventController.java
//   확실성 판정표     src/test/resources/contracts/certainty-cases.json
//
// 2026-09-29부터 두 앱의 정본 저장소가 갈렸다(nn98/delivery-discount-api, -web). 그 전에는
// 한 저장소(mono)에 같이 있어 상대 경로로 읽었다.
//
// 못 찾으면 실패한다. 건너뛰지 않는다. 건너뛴 계약 검사는 초록으로 보이고, 그 사이
// 웹이 쏘는 이벤트를 서버가 조용히 버린다(2026-08-20에 여섯 종이 그렇게 사라졌다).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('..', import.meta.url))

// 순서: 명시한 자리, mono처럼 web/ 옆의 api/, 개인 저장소 클론처럼 나란히 둔 자리.
const CANDIDATES = [
  process.env.DISCOUNT_API_DIR,
  path.join(WEB, '..', 'api'),
  path.join(WEB, '..', 'delivery-discount-api'),
].filter(Boolean)

export function apiDir() {
  const hit = CANDIDATES.find((dir) => existsSync(path.join(dir, 'src', 'main', 'java')))
  if (!hit) {
    throw new Error(
      'API 저장소를 못 찾았다. 계약 검사는 건너뛰지 않는다. '
      + 'nn98/delivery-discount-api를 이 저장소 옆에 받거나 DISCOUNT_API_DIR를 준다. '
      + `찾아본 자리: ${CANDIDATES.join(', ')}`,
    )
  }
  return hit
}

export function apiFile(...parts) {
  return path.join(apiDir(), ...parts)
}
