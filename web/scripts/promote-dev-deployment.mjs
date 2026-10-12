import assert from 'node:assert/strict'

const { VERCEL_TOKEN: token, VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: project, DEPLOYMENT_URL: url, GITHUB_SHA: sha } = process.env
assert.ok(token && team && project && url && sha, '승격에 필요한 배포 설정이 없습니다')
const deploymentUrl = new URL(url)
assert.equal(deploymentUrl.protocol, 'https:')
assert.ok(deploymentUrl.hostname.endsWith('.vercel.app'))

async function api(path, method = 'GET') {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`https://api.vercel.com${path}${separator}teamId=${encodeURIComponent(team)}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
    signal: AbortSignal.timeout(20000),
  })
  assert.ok(response.ok, `Vercel ${method} 요청 실패: ${response.status}`)
  const body = await response.text()
  return body ? JSON.parse(body) : {}
}

const deployment = await api(`/v13/deployments/${encodeURIComponent(deploymentUrl.hostname)}`)
assert.equal(deployment.projectId, project, '다른 프로젝트의 배포입니다')
assert.equal(deployment.ownerId, team, '다른 팀의 배포입니다')
assert.equal(deployment.readyState, 'READY')
assert.equal(deployment.target, 'production')
assert.equal(deployment.meta?.githubCommitSha, sha, '검증한 커밋과 배포 커밋이 다릅니다')
await api(`/v10/projects/${encodeURIComponent(project)}/promote/${encodeURIComponent(deployment.id)}`, 'POST')

const deadline = Date.now() + 180000
while (Date.now() < deadline) {
  const status = await api(`/v9/projects/${encodeURIComponent(project)}?rollbackInfo=true`)
  const request = status.lastAliasRequest
  if (request?.toDeploymentId === deployment.id) {
    assert.notEqual(request.jobStatus, 'failed', '개발 도메인 연결 실패')
    if (request.jobStatus === 'succeeded') {
      console.log('development promotion: PASS')
      process.exit(0)
    }
  }
  await new Promise(resolve => setTimeout(resolve, 1000))
}
throw new Error('개발 도메인 연결 확인 시간 초과')
