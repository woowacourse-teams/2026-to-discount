// 플랫폼 계약(API 저장소 contracts/platforms.json)과 웹 목록이 같은지 본다.
// 같은 파일을 API, 콘솔(beggars-ops), 수집기(tracker)가 읽는다(감사 R3, 2026-09-29).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiFile } from '../scripts/api-repo.mjs'
import { PLATFORMS, OWN } from './platforms.js'

const contract = JSON.parse(readFileSync(
  apiFile('src', 'test', 'resources', 'contracts', 'platforms.json'), 'utf8'))

test('배달앱 목록(키, 이름, 머리글자, 순서)이 계약과 같다', () => {
  assert.deepEqual(PLATFORMS, contract.delivery)
})

test('자체 행사 키가 계약과 같다', () => {
  assert.equal(OWN, contract.own)
})
