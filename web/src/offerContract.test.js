// 오퍼 계약(API 저장소 contracts/offer-cases.json). 웹이 오퍼에서 읽는 칸이 API가 실제로
// 보내는 칸(offerKeys) 안에 있는지 본다. 없는 칸을 읽으면 조용히 undefined다 - 2026-09-29
// 감사 때 offer.channel과 offer.via가 그랬다(Offer에 없는 칸이라 한 번도 값이 온 적 없다).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { apiFile } from '../scripts/api-repo.mjs'

const contract = JSON.parse(readFileSync(
  apiFile('src', 'test', 'resources', 'contracts', 'offer-cases.json'), 'utf8'))
const SRC = fileURLToPath(new URL('.', import.meta.url))

function offerReads() {
  const reads = new Set()
  for (const name of readdirSync(SRC)) {
    if (!/\.(js|jsx)$/.test(name) || name.includes('.test.')) continue
    const text = readFileSync(path.join(SRC, name), 'utf8')
    for (const m of text.matchAll(/\boffer\??\.([a-zA-Z]+)/g)) reads.add(m[1])
  }
  return reads
}

test('웹이 오퍼에서 읽는 칸은 API가 보내는 칸이다', () => {
  const reads = offerReads()
  assert.ok(reads.size >= 10, '스캔이 비었다')
  const missing = [...reads].filter((k) => !contract.offerKeys.includes(k))
  assert.deepEqual(missing, [])
})

test('계약 응답 예시에 웹이 읽는 칸이 전부 있다', () => {
  for (const c of contract.cases) {
    assert.deepEqual(Object.keys(c.offer).sort(), [...contract.offerKeys].sort(), c.name)
  }
})
