#!/usr/bin/env bash
#
# A/B 갈래별 집계.
#
# 서버의 events.jsonl을 읽어 갈래(variant)별로 방문자와 이벤트를 센다.
#
#   scripts/ab_report.sh                 # 서버에서 실행하고 결과만 받는다
#   scripts/ab_report.sh events.jsonl    # 내려받은 파일로(로컬에 jq 필요)
#
# 기본값이 원격 실행인 이유: 원장이 8MB를 넘고 계속 자란다. 통째로
# 내려받으면 매번 그 시간을 쓰고, 로컬에 jq가 없는 환경도 있다.
#
# 개발 트래픽은 두 겹으로 걸러낸다.
#
#   1. dev == true          ?dev=1로 켠 표시. 확실하다.
#   2. desktop + 폭 400px 미만
#
# 2번이 필요한 이유: dk_dev는 localStorage라 브라우저·프로필·시크릿창마다
# 따로 잡힌다. 기기가 여럿이면 일부만 표시가 걸리고 나머지는 그대로
# 섞여 들어온다 — 실제로 오늘 자 트래픽에서 그렇게 새고 있었다.
#
# device는 matchMedia('(hover: hover)')로 정한다. desktop인데 폭이
# 400px 미만이면 데스크톱 브라우저 창을 좁혀 놓은 것, 곧 반응형 확인이다.
# 실제 사용자에게는 거의 안 나오는 조합이다.
#
# 이 규칙은 집계에만 있다. 서버는 들어온 것을 그대로 적는다 — 무엇이
# 개발 트래픽인지는 나중에 바뀔 수 있는 판단이라, 지워버리면 되돌릴 수
# 없다.
#
# 같은 규칙이 PostHogEventMapper.looksLikeDeveloper()에도 있다(거기서는
# dev_suspect 속성으로 PostHog에 넘긴다). 한쪽만 고치면 도구마다 다른
# 숫자가 나온다 — 기준을 바꿀 때는 둘 다 고치고, 배경은
# api/docs/traffic-analytics.md에 적는다.
set -euo pipefail

REMOTE_HOST="${AB_REPORT_HOST:-ubuntu@bebeggars.duckdns.org}"
REMOTE_KEY="${AB_REPORT_KEY:-$HOME/key_turbom_v0.key}"
REMOTE_PATH="${AB_REPORT_PATH:-/home/ubuntu/delivery-discount-api/data/events.jsonl}"

# 집계 본문. 원격에서 실행하든 로컬 파일로 돌리든 같은 코드를 쓴다 —
# 두 벌로 두면 한쪽만 고쳐져 숫자가 어긋난다.
report_body() {
  cat <<'BODY'
set -eu
SRC="$1"

# 개발 트래픽 판정. 한 곳에만 적어 두 집계가 어긋나지 않게 한다.
KEEP='select(.dev != true)
      | select(.variant)
      | select((.device == "desktop" and ((.viewport // "0x0") | split("x")[0] | tonumber) < 400) | not)'

echo
echo "== 제외된 것 =="
jq -r '
  if .dev == true then "개발 표시(?dev=1)"
  elif (.variant | not) then "갈래 없음(variant 필드 추가 전)"
  elif (.device == "desktop" and ((.viewport // "0x0") | split("x")[0] | tonumber) < 400) then "개발 추정(desktop인데 좁은 창)"
  else empty end' "$SRC" | sort | uniq -c

echo
echo "== 갈래별 방문자 =="
jq -r "$KEEP | [.variant, .visitorId] | @tsv" "$SRC" | sort -u | cut -f1 | uniq -c

echo
echo "== 갈래별 이벤트 =="
jq -r "$KEEP | [.variant, .event] | @tsv" "$SRC" | sort | uniq -c

# 이 실험이 답하려는 질문: 조건을 설정한 사람이 실제로 링크 이동까지
# 가는가.
#
# **전환율이 주 지표다.** "1인당 링크이동"(총합 / 사람 수)은 소수가 많이
# 누르면 통째로 부풀어 오판을 부른다 — 2026-08-24 실측에서 b의 클릭
# 115회 중 43회가 한 사람이었고, 그 한 명 때문에 1인당이 0.37 대 0.74로
# 갈려 "b가 두 배 낫다"처럼 보였다. 정작 전환율은 18.7% 대 18.1%로
# 차이가 없었다(p=0.89).
#
# 그래서 셋을 같이 낸다.
#   전환율    누른 사람 / 전체 사람 — 한 명이 여러 번 눌러도 1로 센다
#   중앙값    전환자가 보통 몇 번 누르는가 — 헤비 유저에 안 흔들린다
#   1인당     참고용. 위 둘과 어긋나면 분포를 의심할 것
echo
echo "== 갈래별 전환 =="
jq -r "$KEEP | [.variant, .event, .visitorId] | @tsv" "$SRC" | awk -F'\t' '
  { seen[$1 "\t" $3] = 1 }
  $2 == "offer_link_click" { clicks[$1 "\t" $3]++ }
  END {
    for (k in seen) {
      split(k, p, "\t")
      people[p[1]]++
      n = clicks[k] + 0
      total[p[1]] += n
      if (n > 0) {
        conv[p[1]]++
        list[p[1]] = list[p[1]] " " n
        if (n > top[p[1]]) top[p[1]] = n
      }
    }
    for (v in people) {
      m = 0
      cnt = split(list[v], arr, " ")
      s = 0
      for (i = 1; i <= cnt; i++) if (arr[i] != "") vals[++s] = arr[i] + 0
      if (s > 0) {
        for (i = 1; i < s; i++)
          for (j = i + 1; j <= s; j++)
            if (vals[i] > vals[j]) { t = vals[i]; vals[i] = vals[j]; vals[j] = t }
        m = (s % 2) ? vals[int(s / 2) + 1] : (vals[s / 2] + vals[s / 2 + 1]) / 2
      }
      delete vals
      printf "  %s  방문자 %d명  전환 %d명(%.1f%%)  전환자 중앙 %g회  1인당 %.2f  최다 1명 %d회\n",
             v, people[v], conv[v] + 0, (conv[v] + 0) / people[v] * 100,
             m, total[v] / people[v], top[v] + 0
    }
  }' | sort
BODY
}

if [ $# -gt 0 ]; then
  command -v jq >/dev/null || { echo "jq가 필요하다. 인자 없이 실행하면 서버에서 처리한다." >&2; exit 1; }
  report_body | bash -s "$1"
else
  report_body | ssh -i "$REMOTE_KEY" -o StrictHostKeyChecking=no "$REMOTE_HOST" "bash -s '$REMOTE_PATH'"
fi
