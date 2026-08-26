import test from 'node:test'
import assert from 'node:assert/strict'

import { findBrandSuggestions, toChoseong, toDubeolsikHangul } from './brandAutocomplete.js'

const brands = [
  { name: '굽네치킨', searchAliases: ['굽네', '굽네 치킨', 'goobne', 'goobne chicken'] },
  { name: '굽네피자', searchAliases: ['굽네 피자', 'goobne pizza', 'gubne pizza'] },
  { name: '네네치킨', searchAliases: ['네네', '네네 치킨', 'nene', 'nene chicken'] },
  { name: '피자헛', searchAliases: ['피자 헛', '피자헛 코리아', 'pizza hut', 'pizzahut'] },
]

test('정확 일치, 앞부분 일치, 포함 일치 순으로 후보를 반환한다', () => {
  const result = findBrandSuggestions([
    { name: '가나다', searchAliases: ['다나'] },
    { name: '나다', searchAliases: [] },
    { name: '나', searchAliases: [] },
  ], '나')

  assert.deepEqual(result.map((brand) => brand.name), ['나', '나다', '가나다'])
})

test('검색 별칭의 대소문자와 앞뒤 공백을 무시한다', () => {
  assert.deepEqual(findBrandSuggestions(brands, '  GOOBNE  ').map((brand) => brand.name), ['굽네치킨', '굽네피자'])
})

test('한 브랜드의 여러 표현이 일치해도 한 번만 반환한다', () => {
  assert.deepEqual(findBrandSuggestions(brands, '굽네').map((brand) => brand.name), ['굽네치킨', '굽네피자'])
})

test('같은 순위에서는 API 순서를 유지하고 최대 개수를 지킨다', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ name: `브랜드${index}`, searchAliases: [`brand ${index}`] }))
  assert.deepEqual(findBrandSuggestions(many, 'brand', 3).map((brand) => brand.name), ['브랜드0', '브랜드1', '브랜드2'])
})

test('원문 후보가 없으면 두벌식 한국어로 변환해 다시 찾는다', () => {
  assert.equal(toDubeolsikHangul('rnqsp'), '굽네')
  assert.deepEqual(findBrandSuggestions(brands, 'rnqsp').map((brand) => brand.name), ['굽네치킨', '굽네피자'])
})

test('영문 원문 후보가 있으면 두벌식 변환 후보를 섞지 않는다', () => {
  const result = findBrandSuggestions([
    ...brands,
    { name: '해외브랜드', searchAliases: ['rnqsp'] },
  ], 'rnqsp')
  assert.deepEqual(result.map((brand) => brand.name), ['해외브랜드'])
})

test('한글 브랜드명과 별칭의 초성열을 만든다', () => {
  assert.equal(toChoseong('굽네 치킨'), 'ㄱㄴㅊㅋ')
  assert.equal(toChoseong('BBQ 비비큐'), 'ㅂㅂㅋ')
})

test('초성 하나 또는 여러 개로 시작하는 브랜드 후보를 찾는다', () => {
  assert.deepEqual(findBrandSuggestions(brands, 'ㄱ').map((brand) => brand.name), ['굽네치킨', '굽네피자'])
  assert.deepEqual(findBrandSuggestions(brands, 'ㄱㄴ').map((brand) => brand.name), ['굽네치킨', '굽네피자'])
  assert.deepEqual(findBrandSuggestions(brands, 'ㅍㅈㅎ').map((brand) => brand.name), ['피자헛'])
})

test('영문 대표명은 한국어 검색 별칭의 초성으로 찾는다', () => {
  const englishBrand = [{ name: 'BBQ', searchAliases: ['비비큐', '비비큐치킨', 'bbq chicken'] }]
  assert.deepEqual(findBrandSuggestions(englishBrand, 'ㅂㅂㅋ').map((brand) => brand.name), ['BBQ'])
})

test('빈 입력, 브랜드 미로딩, 변환 결과도 없는 입력은 후보가 없다', () => {
  assert.deepEqual(findBrandSuggestions(brands, '  '), [])
  assert.deepEqual(findBrandSuggestions(null, '굽네'), [])
  assert.deepEqual(findBrandSuggestions(brands, 'zzzzzz'), [])
})
