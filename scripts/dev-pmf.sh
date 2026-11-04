#!/usr/bin/env bash
# 로컬 원장과 로컬 API만 사용하는 PMF 검토 환경. Ctrl+C로 두 프로세스를 종료한다.
set -euo pipefail
pmf_root="$(cd "$(dirname "$0")/.." && pwd)"
pmf_state_dir="${TMPDIR:-/tmp}/beggars-pmf-local"
mkdir -p "$pmf_state_dir"
for pmf_port in 8081 5173; do
  if lsof -tiTCP:"$pmf_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "포트 $pmf_port 사용 중. 기존 서버를 종료한 뒤 다시 실행하세요." >&2
    exit 1
  fi
done
cd "$pmf_root/api"
./gradlew bootRun --args="--spring.profiles.active=local --server.port=8081 --management.server.port=9091 --discount.pmf.enabled=true --discount.event-log-path=$pmf_state_dir/events.jsonl --analytics.snapshot.enabled=false --discount.posthog.enabled=false --discount.push.enabled=false" > "$pmf_state_dir/api.log" 2>&1 &
pmf_api_pid=$!
trap 'kill "$pmf_api_pid" "${pmf_web_pid:-}" 2>/dev/null || true; wait || true' EXIT INT TERM
cd "$pmf_root/web"
VITE_API_BASE_URL=http://localhost:8081 VITE_APP_ENV=production npm run dev -- --host localhost --port 5173 --strictPort > "$pmf_state_dir/web.log" 2>&1 &
pmf_web_pid=$!
echo "API: http://localhost:8081"
echo "설문 확인: http://localhost:5173/?pmfDemo=1"
echo "새 데모 사용자: http://localhost:5173/?pmfDemo=1&pmfReset=1"
echo "로그: $pmf_state_dir/api.log, $pmf_state_dir/web.log"
wait "$pmf_api_pid" "$pmf_web_pid"
