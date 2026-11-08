import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

// 실제 SurveyCard의 effect를 실행한다. 브라우저의 노출 판정을 모사해 문항 계측 시점을 검증한다.
const compiled = await build({
  stdin: {
    contents: "export { default as SurveyModal, InlineSurveyCard as SurveyCard } from './SurveyCard.jsx'; export { effects } from 'react';",
    resolveDir: new URL('.', import.meta.url).pathname,
  },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  plugins: [{
    name: 'survey-effect-harness',
    setup(build) {
      build.onResolve({ filter: /^react(?:\/jsx-runtime)?$|^react-dom$/ }, args => ({ path: args.path, namespace: 'hooks' }))
      build.onLoad({ filter: /.*/, namespace: 'hooks' }, () => ({ contents: `
        export const effects = [];
        export const useEffect = (effect, dependencies) => effects.push({ effect, dependencies });
        export const useLayoutEffect = () => {};
        export const useRef = value => ({ current: value ?? {} });
        export const useState = value => [value, () => {}];
        export const jsx = () => null;
        export const jsxs = jsx;
        export const Fragment = 'fragment';
        export const createPortal = () => null;
      ` }))
    },
  }],
})
const { SurveyCard, SurveyModal, effects } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

function observeSurvey(complete = false) {
  effects.length = 0
  const events = []
  const observers = []
  globalThis.IntersectionObserver = class {
    constructor(callback, options) { Object.assign(this, { callback, options }); observers.push(this) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  try {
    SurveyCard({ survey: { draft: {}, complete, markViewed: () => events.push('viewed') } })
    for (const { effect } of effects) effect()
    return { events, observers }
  } finally {
    delete globalThis.IntersectionObserver
  }
}

test('질문 영역의 절반 이상이 화면에 들어올 때만 노출을 기록한다', () => {
  const { events, observers: [observer] } = observeSurvey()
  assert.deepEqual(events, [])
  assert.equal(observer.options.threshold, 0.5)
  observer.callback([{ isIntersecting: true, intersectionRatio: 0.4 }])
  assert.deepEqual(events, [])
  observer.callback([{ isIntersecting: true, intersectionRatio: 0.5 }])
  assert.deepEqual(events, ['viewed'])
  assert.equal(observer.disconnected, true)
})

test('응답 완료 문구는 문항 노출로 기록하지 않는다', () => {
  assert.deepEqual(observeSurvey(true), { events: [], observers: [] })
})

test('기존 팝업은 하단 안내에서 1번, 인라인 응답 뒤에는 2번부터 계측한다', () => {
  for (const [modalStart, question, step] of [[0, 'choice', 1], [1, 'benefit', 2]]) {
    effects.length = 0
    const events = []
    SurveyModal({ survey: { draft: {}, modalStart, isCardOpen: true, interact: (...args) => events.push(args) } })
    for (const { effect } of effects) effect()
    assert.deepEqual(events, [['question_viewed', { question, step }]])
  }
})

test('닫기 확인창만 열 때 기존 팝업 문항을 노출로 세지 않는다', () => {
  effects.length = 0
  const events = []
  SurveyModal({ survey: { draft: {}, confirmClose: true, interact: (...args) => events.push(args) } })
  for (const { effect } of effects) effect()
  assert.deepEqual(events, [])
})
