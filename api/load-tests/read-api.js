import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';

const base = __ENV.BASE_URL || 'https://dev-api-todiscount.duckdns.org';
if (base !== 'https://dev-api-todiscount.duckdns.org') throw new Error('Development URL only');
const rate = Number(__ENV.RATE || 2);
if (![2, 10, 30, 60, 100].includes(rate)) throw new Error('Unapproved rate');
const total = new Trend('client_elapsed', true);
const failed = new Rate('request_failed');
export const options = {
  scenarios: { reads: {
    executor: 'constant-arrival-rate', rate, timeUnit: '1s',
    duration: __ENV.DURATION || '3m', preAllocatedVUs: rate * 2,
    maxVUs: rate <= 30 ? 200 : rate <= 60 ? 400 : 600,
    gracefulStop: '6s',
  } },
  thresholds: {
    dropped_iterations: ['count==0'],
    'client_elapsed{endpoint:brands}': ['p(95)<=300', 'p(99)<=1000'],
    'client_elapsed{endpoint:banners}': ['p(95)<=300', 'p(99)<=1000'],
    'request_failed{endpoint:brands}': ['rate<0.001'],
    'request_failed{endpoint:banners}': ['rate<0.001'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)', 'count'],
};

export default function () {
  const endpoint = exec.scenario.iterationInTest % 2 === 0 ? 'brands' : 'banners';
  const tags = { endpoint, run: __ENV.RUN_ID || 'manual' };
  const start = Date.now();
  const response = http.get(`${base}/api/${endpoint}`, {
    timeout: '5s', tags, headers: {
      'User-Agent': `beggars-load-test/${__ENV.RUN_ID || 'manual'}`,
      'Accept-Encoding': 'gzip',
    },
  });
  total.add(Date.now() - start, tags);
  let valid = response.status === 200;
  try {
    const body = response.json();
    valid = valid && Array.isArray(body);
    if (endpoint === 'brands') {
      if (__ENV.REQUIRE_COMPRESSION === 'true') valid = valid && response.headers['Content-Encoding'] === 'gzip';
      if (__ENV.REQUIRE_COMPRESSION === 'false') valid = valid && !response.headers['Content-Encoding'];
      valid = valid && body.length > 0 && body.every(item => typeof item.name === 'string' && Array.isArray(item.offers));
    } else {
      valid = valid && body.every(item => typeof item.id === 'string' && typeof item.url === 'string');
    }
  } catch (_) { valid = false; }
  failed.add(!valid, tags);
}

export function handleSummary(data) {
  return { [__ENV.SUMMARY_FILE || 'summary.json']: JSON.stringify(data, null, 2) };
}
