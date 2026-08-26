const CHOSEONG_KEYS = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g']
const CHOSEONG_JAMO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const JUNGSEONG_KEYS = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l']
const JONGSEONG_KEYS = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g']

const COMPATIBILITY_JAMO = {
  r: 'ㄱ', R: 'ㄲ', s: 'ㄴ', e: 'ㄷ', E: 'ㄸ', f: 'ㄹ', a: 'ㅁ', q: 'ㅂ', Q: 'ㅃ',
  t: 'ㅅ', T: 'ㅆ', d: 'ㅇ', w: 'ㅈ', W: 'ㅉ', c: 'ㅊ', z: 'ㅋ', x: 'ㅌ', v: 'ㅍ', g: 'ㅎ',
  k: 'ㅏ', o: 'ㅐ', i: 'ㅑ', O: 'ㅒ', j: 'ㅓ', p: 'ㅔ', u: 'ㅕ', P: 'ㅖ', h: 'ㅗ',
  y: 'ㅛ', n: 'ㅜ', b: 'ㅠ', m: 'ㅡ', l: 'ㅣ',
}

const keyIndex = (keys, value) => keys.indexOf(value)
const isVowelKey = (key) => keyIndex(JUNGSEONG_KEYS, key) >= 0
const isConsonantKey = (key) => keyIndex(CHOSEONG_KEYS, key) >= 0

function readVowel(input, index) {
  const pair = input.slice(index, index + 2)
  const pairIndex = keyIndex(JUNGSEONG_KEYS, pair)
  if (pairIndex >= 0) return { index: pairIndex, length: 2 }
  const singleIndex = keyIndex(JUNGSEONG_KEYS, input[index])
  return singleIndex < 0 ? null : { index: singleIndex, length: 1 }
}

function readFinal(input, index) {
  const first = input[index]
  if (!isConsonantKey(first) || isVowelKey(input[index + 1])) return { index: 0, length: 0 }

  const pair = input.slice(index, index + 2)
  const pairIndex = keyIndex(JONGSEONG_KEYS, pair)
  if (pairIndex > 0 && !isVowelKey(input[index + 2])) return { index: pairIndex, length: 2 }

  const singleIndex = keyIndex(JONGSEONG_KEYS, first)
  return singleIndex < 0 ? { index: 0, length: 0 } : { index: singleIndex, length: 1 }
}

/** 두벌식 한영 전환을 놓친 영문 입력을 한글 음절로 조합한다. */
export function toDubeolsikHangul(input) {
  let result = ''
  let index = 0

  while (index < input.length) {
    const initialIndex = keyIndex(CHOSEONG_KEYS, input[index])
    const vowel = initialIndex >= 0 ? readVowel(input, index + 1) : null

    if (initialIndex >= 0 && vowel) {
      const final = readFinal(input, index + 1 + vowel.length)
      result += String.fromCharCode(0xac00 + initialIndex * 21 * 28 + vowel.index * 28 + final.index)
      index += 1 + vowel.length + final.length
      continue
    }

    const standaloneVowel = readVowel(input, index)
    if (standaloneVowel) {
      const key = input.slice(index, index + standaloneVowel.length)
      result += key.length === 1 ? COMPATIBILITY_JAMO[key] : key.split('').map((part) => COMPATIBILITY_JAMO[part]).join('')
      index += standaloneVowel.length
      continue
    }

    result += COMPATIBILITY_JAMO[input[index]] ?? input[index]
    index += 1
  }

  return result
}

const normalize = (value) => String(value ?? '').trim().toLowerCase()
const isChoseongQuery = (value) => /^[ㄱ-ㅎ]+$/.test(value)

/** 한글 음절과 단독 초성에서 검색에 사용할 초성열을 만든다. */
export function toChoseong(input) {
  return [...String(input ?? '')].map((character) => {
    const code = character.charCodeAt(0)
    if (code >= 0xac00 && code <= 0xd7a3) {
      return CHOSEONG_JAMO[Math.floor((code - 0xac00) / (21 * 28))]
    }
    return isChoseongQuery(character) ? character : ''
  }).join('')
}

function matchRank(target, query) {
  if (target === query) return 0
  if (target.startsWith(query)) return 1
  if (target.includes(query)) return 2
  return null
}

function matchBrands(brands, query, limit) {
  const choseongOnly = isChoseongQuery(query)
  return brands
    .map((brand, originalIndex) => {
      const targets = [brand.name, ...(brand.searchAliases ?? [])]
        .map(normalize)
        .map((target) => choseongOnly ? toChoseong(target) : target)
        .filter(Boolean)
      const ranks = targets.map((target) => matchRank(target, query)).filter((rank) => rank != null)
      return ranks.length === 0 ? null : { brand, rank: Math.min(...ranks), originalIndex }
    })
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank || left.originalIndex - right.originalIndex)
    .slice(0, limit)
    .map(({ brand }) => brand)
}

/** 대표명과 검색 별칭에서 안정된 순서의 자동완성 후보를 만든다. */
export function findBrandSuggestions(brands, input, limit = 10) {
  const query = normalize(input)
  if (!Array.isArray(brands) || query === '' || limit <= 0) return []

  const direct = matchBrands(brands, query, limit)
  if (direct.length > 0) return direct

  const converted = normalize(toDubeolsikHangul(String(input).trim()))
  if (converted === query) return []
  return matchBrands(brands, converted, limit)
}
