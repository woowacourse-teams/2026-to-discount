import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

// 실제 SurveyCard의 effect를 실행한다. DOM 배치와 JSX 렌더링은 이 계측 검증에서 제외한다.
const compiled = await build({
  stdin: {
    contents: "export { default as SurveyCard } from './SurveyCard.jsx'; export { effects } from 'react';",
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
        export const useRef = value => ({ current: value });
        export const useState = value => [value, () => {}];
        export const jsx = () => null;
        export const jsxs = jsx;
        export const Fragment = 'fragment';
        export const createPortal = () => null;
      ` }))
    },
  }],
})
const { SurveyCard, effects } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

function renderSurvey(isCardOpen, confirmClose) {
  effects.length = 0
  const events = []
  const survey = { draft: {}, isCardOpen, confirmClose, setDraft() {}, interact: (...args) => events.push(args) }
  SurveyCard({ survey })
  for (const { effect } of effects) effect()
  return { events, dependencies: effects[0].dependencies }
}

test('안내 X로 닫기 확인창만 열면 문항 노출 이벤트를 보내지 않는다', () => {
  assert.deepEqual(renderSurvey(false, true).events, [])
})

test('실제 설문을 열면 첫 문항 노출 이벤트를 보낸다', () => {
  assert.deepEqual(renderSurvey(true, false).events, [['question_viewed', { question: 'choice', step: 1 }]])
})

test('닫힌 카드가 실제로 열릴 때 effect가 다시 실행되도록 열림 상태를 관찰한다', () => {
  assert.ok(renderSurvey(false, true).dependencies.includes(false))
  assert.ok(renderSurvey(true, true).dependencies.includes(true))
})
