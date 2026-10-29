import test from 'node:test'
import assert from 'node:assert/strict'
import { createShortShareLink } from './shortShareLink.js'
import { shortShareRedirect } from './shortShareRedirect.js'
import { sharedOfferKey, parseShareLink } from './offerSharing.js'
const id = 'a'.repeat(32), code = 'abcdefghijklmnop', offer = { platform: 'baemin', amount: 4000 }
test('짧은 링크 생성과 복원이 동일한 혜택 및 공유 식별값을 유지', async () => {
  let saved
  const url = await createShortShareLink('https://example.com', '도미노피자', offer, id, async (_, options) => {
    saved = JSON.parse(options.body)
    return { ok: true, json: async () => ({ code }) }
  })
  assert.equal(url, `https://example.com/s/${code}`)
  const result = await shortShareRedirect(code, 'https://api.example.com', async () => ({ ok: true, json: async () => saved }))
  assert.deepEqual(parseShareLink(new URL(result.location, url).hash), { shareId: id, brand: '도미노피자', offerKey: sharedOfferKey(offer) })
})
test('없는 코드는 기존 안내로 보내고 API 장애는 대상 없음으로 오인하지 않는다', async () => {
  assert.deepEqual(await shortShareRedirect('bad', ''), { location: '/#share=invalid' })
  assert.deepEqual(await shortShareRedirect(code, '', async () => ({ status: 404 })), { location: '/#share=invalid' })
  assert.deepEqual(await shortShareRedirect(code, '', async () => ({ status: 500 })), {})
  assert.deepEqual(await shortShareRedirect(code, '', async () => { throw Error() }), {})
})
test('생성 실패와 임의 URL 응답을 공유 링크로 사용하지 않는다', async () => {
  await assert.rejects(createShortShareLink('https://example.com', '브랜드', offer, id, async () => ({ ok: false })))
  await assert.rejects(createShortShareLink('https://example.com', '브랜드', offer, id, async () => ({ ok: true, json: async () => ({ code: 'https://evil.example' }) })))
})
