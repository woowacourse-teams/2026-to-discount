#!/usr/bin/env bash
#
# "우리 통계가 실제 방문의 몇 %를 보고 있나"를 하루 한 줄로 남긴다.
#
# 화면을 그리려면 /api/brands를 반드시 부른다 — 여기에는 DNT 게이트가 없다.
# 반면 /api/events는 DNT·GPC가 켜져 있으면 아예 안 나간다(광고 차단기도
# 막는다). 그래서 두 요청의 차이가 곧 "왔지만 우리 통계에 안 남은 사람"이다.
#
#   브랜드는 불렀는데 이벤트는 한 건도 안 보낸 IP  =  누락 추정
#
# 이 값이 필요한 이유: A/B 판정이든 전환율이든 분모가 실제보다 작으면
# 비율이 부풀려진다. 2026-08-21 실측에서 하루 4~17%(14일 평균 10% 안팎)가
# 그렇게 빠지고 있었다.
#
# nginx 로그는 14일 뒤 사라진다(logrotate rotate 14). 그래서 매일 집계만
# 뽑아 원장에 append한다 — 원장은 지우지 않는다.
#
# 정확한 수치가 아니라 자릿수를 보는 값이다. IP 기준이라 이런 한계가 있다.
#
#   같은 와이파이의 여러 사람   IP 하나로 뭉친다
#   모바일 통신망               한 사람이 IP 여러 개
#   브랜드 응답 캐시            재방문 때 /api/brands를 안 부른다
#   봇·크롤러                   화면만 긁고 JS를 안 돌려 누락으로 잡힌다
#
# 사용:
#   coverage_snapshot.sh            어제치를 원장에 append (크론이 부르는 형태)
#   coverage_snapshot.sh --backfill 로그에 남아 있는 날 전부 채운다(중복은 건너뜀)
set -euo pipefail

LOG_DIR="${COVERAGE_LOG_DIR:-/var/log/nginx}"
LEDGER="${COVERAGE_LEDGER:-/home/ubuntu/delivery-discount-api/data/coverage.jsonl}"

mkdir -p "$(dirname "$LEDGER")"

# 로테이션된 것까지 한 번에 읽는다. 압축본은 zcat, 나머지는 cat.
read_logs() {
  cat "$LOG_DIR"/access.log "$LOG_DIR"/access.log.1 2>/dev/null || true
  for f in "$LOG_DIR"/access.log.*.gz; do
    [ -e "$f" ] || continue
    zcat "$f" 2>/dev/null || true
  done
}

# 날짜별로 (브랜드 부른 IP 수, 그중 이벤트를 한 건도 안 보낸 IP 수)를 센다.
# nginx 기본 포맷 기준: $1=IP, $4=[날짜:시각, $7=경로.
summarize() {
  awk '
    { day = substr($4, 2, 11); ip = $1; path = $7 }
    path == "/api/brands" { brands[day " " ip] = 1 }
    path == "/api/events" { events[day " " ip] = 1 }
    END {
      for (k in brands) {
        split(k, p, " ")
        total[p[1]]++
        if (!(k in events)) missing[p[1]]++
      }
      for (d in total) printf "%s\t%d\t%d\n", d, total[d], missing[d] + 0
    }
  '
}

# 07/Aug/2026 -> 2026-08-07
iso_date() {
  date -d "$(echo "$1" | tr '/' ' ')" +%Y-%m-%d 2>/dev/null || echo ""
}

append_day() {
  local raw="$1" total="$2" missing="$3"
  local iso; iso="$(iso_date "$raw")"
  [ -n "$iso" ] || return 0

  # 같은 날을 두 번 적지 않는다. 하루가 끝나기 전에 돌면 값이 덜 찬 채로
  # 굳으므로, 이미 있으면 건드리지 않는다.
  if [ -f "$LEDGER" ] && grep -q "\"date\":\"$iso\"" "$LEDGER"; then
    return 0
  fi

  local pct="0.0"
  [ "$total" -gt 0 ] && pct="$(awk -v m="$missing" -v t="$total" 'BEGIN{printf "%.1f", 100*m/t}')"

  printf '{"date":"%s","brandsIps":%d,"noEventIps":%d,"missingPct":%s,"recordedAt":"%s"}\n' \
    "$iso" "$total" "$missing" "$pct" "$(date -Iseconds)" >> "$LEDGER"
  echo "기록 $iso  브랜드IP $total  이벤트없음 $missing  ($pct%)"
}

if [ "${1:-}" = "--backfill" ]; then
  # 오늘은 뺀다 — 아직 안 끝난 하루라 값이 덜 찬 채로 굳는다.
  today="$(date +%d/%b/%Y)"
  read_logs | summarize | sort | while IFS=$'\t' read -r day total missing; do
    [ "$day" = "$today" ] && continue
    append_day "$day" "$total" "$missing"
  done
else
  yesterday="$(date -d yesterday +%d/%b/%Y)"
  line="$(read_logs | summarize | grep -P "^\Q$yesterday\E\t" || true)"
  if [ -z "$line" ]; then
    echo "어제($yesterday) 요청 기록이 없다 — 건너뛴다."
    exit 0
  fi
  IFS=$'\t' read -r day total missing <<< "$line"
  append_day "$day" "$total" "$missing"
fi
