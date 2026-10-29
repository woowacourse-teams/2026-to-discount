import { shareApiBase } from '../dist-server/entry-server.js'
import { shortShareRedirect } from '../src/shortShareRedirect.js'

export default async function handler(req, res) {
  const result = await shortShareRedirect(req.query.code, shareApiBase)
  res.setHeader('Cache-Control', 'no-store')
  if (result.location) return res.redirect(302, result.location)
  return res.status(503).send('링크를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.')
}
