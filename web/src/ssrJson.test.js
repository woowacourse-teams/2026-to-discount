import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ssrJson } from './ssrJson.js'
import { hasNewBest } from './filters.js'

describe('ssrJson', () => {
  const offer = { platform: 'own', amount: 15000, status: 'confirmed', isNew: null, firstSeenAt: new Date().toISOString(), note: null }

  it('null 칸은 지우되 isNew의 null은 남긴다', () => {
    const o = JSON.parse(ssrJson({ offers: [offer] })).offers[0]
    assert.equal('note' in o, false)
    assert.equal(o.isNew, null)
  })

  it('서버와 브라우저가 같은 오퍼를 신규로 가린다(isNew null + 오늘 처음 본 오퍼는 신규 아님)', () => {
    const client = JSON.parse(ssrJson({ offers: [offer] })).offers
    assert.equal(hasNewBest(client), hasNewBest([offer]))
    assert.equal(hasNewBest(client), false)
  })

  it('</script>를 막는다', () => {
    assert.ok(!ssrJson({ a: '</script>' }).includes('</script>'))
  })
})
