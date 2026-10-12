import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

function run(overrides = {}, jobStatus = 'succeeded') {
  const deployment = { id: 'dpl_test', projectId: 'prj_test', ownerId: 'team_test', readyState: 'READY', target: 'production', meta: { githubCommitSha: 'test-sha' }, ...overrides }
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    Object.assign(process.env, { VERCEL_TOKEN: 'test-token', VERCEL_ORG_ID: 'team_test', VERCEL_PROJECT_ID: 'prj_test', DEPLOYMENT_URL: 'https://candidate.vercel.app', GITHUB_SHA: 'test-sha' });
    globalThis.fetch = async (url, options) => {
      if (!url.startsWith('https://api.vercel.com/') || new URL(url).searchParams.get('teamId') !== 'team_test') throw Error('wrong API scope');
      if (options.headers.Authorization !== 'Bearer test-token') throw Error('missing auth');
      if (url.includes('/v13/deployments/')) return new Response(JSON.stringify(${JSON.stringify(deployment)}));
      if (options.method === 'POST') { console.log('PROMOTE_REQUEST'); return new Response(null); }
      if (new URL(url).searchParams.get('rollbackInfo') !== 'true') throw Error('missing promotion status parameter');
      return new Response(JSON.stringify({ lastAliasRequest: { toDeploymentId: 'dpl_test', jobStatus: ${JSON.stringify(jobStatus)} } }));
    };
    await import(${JSON.stringify(new URL('../scripts/promote-dev-deployment.mjs', import.meta.url).href)});
  `], { encoding: 'utf8', timeout: 10000 })
}

test('team-scoped promotion accepts an empty response and waits for domain completion', () => {
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /development promotion: PASS/)
})

test('wrong project or commit cannot trigger promotion', () => {
  for (const overrides of [{ projectId: 'prj_other' }, { meta: { githubCommitSha: 'old-sha' } }]) {
    const result = run(overrides)
    assert.notEqual(result.status, 0)
    assert.doesNotMatch(result.stdout, /PROMOTE_REQUEST/)
  }
})

test('domain connection failure fails the deployment', () => {
  const result = run({}, 'failed')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /개발 도메인 연결 실패/)
})
