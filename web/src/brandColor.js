// 배너 색. 시드색 하나를 정하고, 거기서 배경·테두리·글자·강조를 파생한다.
//
// 우선순위는 banners.yml의 color -> 로고에서 뽑기 -> 플랫폼 색이다.
// 브랜드명을 해시해 임의의 색을 고르는 방식은 쓰지 않는다 — 브랜드와 무관한
// 색을 진짜 브랜드색인 양 입히게 되고, 나중에 로고를 확보하면 색이 통째로
// 바뀌어 "어제 본 그 배너"가 아니게 된다.

import { brandLogoSrc } from './logos.jsx'

// 플랫폼 폴백 색. public/platform-icons/*.png에서 가장 넓은 채도 있는
// 색 구간을 실제로 추출한 값이다(아이콘이 바뀌면 다시 뽑아야 한다).
// 로고 파일이 없는 브랜드도, 브랜드 자체가 없는 앱 전체 행사도 이 색을
// 시드로 쓴다 — 배너는 어차피 그 앱으로 나가는 링크라 색이 거짓말을 안 한다.
const PLATFORM_SEED = {
  baemin: '#0bebd0',
  coupangeats: '#985a31',
  ddangyo: '#fe3e00',
  yogiyo: '#e61c4f',
}
const NEUTRAL_SEED = '#5b6470'

export function platformSeed(platformKey) {
  return PLATFORM_SEED[platformKey] ?? NEUTRAL_SEED
}

/* ---------- 색 변환 ---------- */

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n) || full.length !== 6) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHsl(r, g, b) {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0)
  else if (max === gg) h = (bb - rr) / d + 2
  else h = (rr - gg) / d + 4
  return [(h / 6) * 360, s * 100, l * 100]
}

function hslToRgb(h, s, l) {
  const ss = s / 100, ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * ss
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = ll - c / 2
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]
}

function css(h, s, l) {
  return `hsl(${Math.round(h)} ${Math.round(clamp(s, 0, 100))}% ${Math.round(clamp(l, 0, 100))}%)`
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

/* ---------- 대비 ---------- */

function relativeLuminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// 대비가 확보될 때까지 명도를 내린다.
//
// 하단 배너는 진한 브랜드색에 흰 글자인데, 노란 계열 브랜드는 같은 명도라도
// 훨씬 밝아서 흰 글자가 안 읽힌다. 색상마다 상한을 따로 박는 대신 실제
// 대비를 재서 통과할 때까지 누른다 — 어떤 시드가 들어와도 읽히는 값이 나온다.
function darkenUntil(h, s, startL, against, ratio) {
  for (let l = startL; l >= 12; l -= 2) {
    if (contrast(hslToRgb(h, s, l), against) >= ratio) return l
  }
  return 12
}

const WHITE = [255, 255, 255]

/* ---------- 팔레트 ---------- */

/**
 * 시드 하나에서 상단·하단 배너가 쓸 CSS 변수를 만든다.
 *
 * 색 계산은 여기(JS)에서, 어디에 칠할지는 App.css에서 한다 — 스타일 규칙이
 * JS로 새지 않게.
 */
export function bannerPalette(seed) {
  const rgb = hexToRgb(seed) ?? hexToRgb(NEUTRAL_SEED)
  const [h, rawS, rawL] = rgbToHsl(...rgb)
  // 무채색에 가까운 시드는 채도를 억지로 올리지 않는다(회색 로고는 회색으로).
  const s = rawS < 12 ? rawS : clamp(rawS, 40, 85)

  const tintL = 96
  const tint = hslToRgb(h, Math.min(s, 55), tintL)
  const inkL = darkenUntil(h, Math.min(s, 80), Math.min(rawL, 34), tint, 5)
  const accentL = darkenUntil(h, s, Math.min(rawL, 42), tint, 4.5)
  const deepL = darkenUntil(h, s, Math.min(Math.max(rawL, 30), 46), WHITE, 4.5)

  return {
    '--banner-tint': css(h, Math.min(s, 55), tintL),
    '--banner-line': css(h, Math.min(s, 60), 84),
    '--banner-ink': css(h, Math.min(s, 80), inkL),
    '--banner-accent': css(h, s, accentL),
    '--banner-deep': css(h, s, deepL),
    '--banner-deep-accent': css(h, Math.min(s, 60), 88),
  }
}

/* ---------- 로고에서 시드 뽑기 ---------- */

// 브랜드당 한 번만 훑는다. 실패(로고 없음, 흰 배경뿐)도 null로 캐시해
// 스캔을 되풀이하지 않는다.
const seedCache = new Map()

const SAMPLE = 32
const HUE_BUCKET = 15
const MIN_PIXELS = 8

/**
 * 로고 PNG를 작은 캔버스에 그려 가장 흔한 색상 구간의 평균을 시드로 삼는다.
 * 투명·흰색·무채색 픽셀은 버린다. 남는 게 없으면 실패로 보고 null을 준다
 * (흰 배경만 있는 로고가 여기 걸린다) — 부르는 쪽이 플랫폼 색으로 간다.
 *
 * 같은 출처(public/logos/) 이미지라 canvas가 오염되지 않는다.
 */
export function brandSeed(brandName) {
  if (!seedCache.has(brandName)) {
    seedCache.set(brandName, extractSeed(brandLogoSrc(brandName)))
  }
  return seedCache.get(brandName)
}

function extractSeed(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        resolve(dominantColor(img))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function dominantColor(img) {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE
  canvas.height = SAMPLE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE)
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE)

  const counts = new Map()
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (a < 200) continue
    const [h, s, l] = rgbToHsl(r, g, b)
    if (s < 25 || l < 15 || l > 95) continue
    const key = Math.floor(h / HUE_BUCKET)
    const acc = counts.get(key) ?? [0, 0, 0, 0]
    acc[0] += r; acc[1] += g; acc[2] += b; acc[3] += 1
    counts.set(key, acc)
  }

  let best = null
  for (const acc of counts.values()) {
    if (!best || acc[3] > best[3]) best = acc
  }
  if (!best || best[3] < MIN_PIXELS) return null

  const n = best[3]
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0')
  return `#${hex(best[0])}${hex(best[1])}${hex(best[2])}`
}
