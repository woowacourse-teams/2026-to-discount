#!/usr/bin/env bash
#
# 배너가 값을 하는지 본다.
#
#   scripts/banner_report.sh                 # 서버에서 실행하고 결과만 받는다
#   scripts/banner_report.sh events.jsonl    # 내려받은 파일로(로컬에 jq 필요)
#
# 원격 실행이 기본인 이유, 개발 트래픽을 두 겹으로 거르는 이유는
# ab_report.sh와 같다. 판정 규칙도 그쪽과 한 글자까지 같아야 한다 —
# 한쪽만 고치면 같은 날 숫자가 두 가지로 나온다.
#
# 답하려는 질문 다섯 가지. 각각 다른 결정을 바꾼다.
#
#   1. 어느 행사가 먹혔나        다음에 어떤 배너를 걸지
#   2. 하단 플로팅이 값을 하나   유지할지 뺄지
#   3. 몇 번째 장까지 보나       배너를 몇 개까지 걸지
#   4. 순증인가 잠식인가         배너를 계속 쓸지
#   5. 방해가 되나               노출 방식을 줄일지
#
# 4번이 이 스크립트의 핵심이다. 배너 도입 전후를 비교하면 같은 기간에
# 들어간 다른 개편들과 뒤섞여 배너 몫을 못 가른다. 같은 기간 안에서
# "배너를 누른 사람"과 "보고도 안 누른 사람"을 갈라 보면 그 교란이
# 대부분 상쇄된다 — 둘 다 같은 화면을 같은 날 본 사람들이다.
#
# 노출(banner_impression)은 2026-08-21에 붙였다. 그 전 기록에는 클릭만
# 있어 클릭률이 안 나온다 — 노출 0으로 찍히는 날은 그 이전이다.
set -euo pipefail

REMOTE_HOST="${AB_REPORT_HOST:-ubuntu@bebeggars.duckdns.org}"
REMOTE_KEY="${AB_REPORT_KEY:-$HOME/key_turbom_v0.key}"
REMOTE_PATH="${AB_REPORT_PATH:-/home/ubuntu/delivery-discount-api/data/events.jsonl}"

report_body() {
  cat <<'BODY'
set -eu
SRC="$1"

# ab_report.sh와 같은 개발 트래픽 판정. 다만 variant는 요구하지 않는다 —
# 배너는 두 갈래에 똑같이 뜨고, variant가 붙기 전 기록도 배너에는 쓸 수 있다.
KEEP='select(.dev != true)
      | select((.device == "desktop" and ((.viewport // "0x0") | split("x")[0] | tonumber) < 400) | not)'

echo
echo "== 1. 배너별 성적 =="
echo "   노출은 같은 사람 같은 자리를 한 번만 센다(프론트에서 중복 제거)."
printf '  %-22s %8s %8s %8s %8s\n' "배너" "노출" "클릭" "클릭률" "닫기"
jq -r "$KEEP | select(.event | startswith(\"banner_\")) | [.props.banner // \"?\", .event] | @tsv" "$SRC" \
  | awk -F'\t' '
      { c[$1 "\t" $2]++ }
      END {
        for (k in c) { split(k, p, "\t"); ids[p[1]] = 1 }
        for (id in ids) {
          imp = c[id "\tbanner_impression"] + 0
          clk = c[id "\tbanner_click"] + 0
          dis = c[id "\tbanner_dismiss"] + 0
          if (imp > 0) rate = sprintf("%.1f%%", 100 * clk / imp); else rate = "-"
          printf "  %-22s %8d %8d %8s %8d\n", id, imp, clk, rate, dis
        }
      }' | sort

echo
echo "== 2. 자리별(상단 고정 / 하단 플로팅) =="
echo "   하단이 노출만 많고 클릭이 안 붙으면 빼는 편이 낫다."
jq -r "$KEEP | select(.event == \"banner_impression\" or .event == \"banner_click\") | [.props.position // \"?\", .event] | @tsv" "$SRC" \
  | awk -F'\t' '
      { c[$1 "\t" $2]++; pos[$1] = 1 }
      END {
        for (p in pos) {
          imp = c[p "\tbanner_impression"] + 0
          clk = c[p "\tbanner_click"] + 0
          if (imp > 0) rate = sprintf("%.1f%%", 100 * clk / imp); else rate = "-"
          printf "  %-8s 노출 %d  클릭 %d  클릭률 %s\n", p, imp, clk, rate
        }
      }' | sort

echo
echo "== 3. 캐러셀 깊이 =="
echo "   한 방문에서 상단 배너를 몇 장까지 봤나. 대부분 1장이면 더 걸어야 소용없다."
jq -r "$KEEP | select(.event == \"banner_impression\" and (.props.position // \"\") == \"top\") | [.sessionId, .props.banner // \"?\"] | @tsv" "$SRC" \
  | sort -u | cut -f1 | uniq -c | awk '{ n[$1]++ } END { for (k in n) printf "  %s장  세션 %d개\n", k, n[k] }' | sort

echo
echo "== 4. 순증인가 잠식인가 =="
echo "   같은 기간, 배너를 누른 세션과 보고도 안 누른 세션의 오퍼 클릭률."
echo "   배너 클릭 세션의 오퍼 클릭률이 더 낮으면 잠식이다."
jq -r "$KEEP | [.sessionId, .event] | @tsv" "$SRC" \
  | awk -F'\t' '
      $2 == "banner_impression" { saw[$1] = 1 }
      $2 == "banner_click"      { clicked[$1] = 1 }
      $2 == "offer_link_click"  { offer[$1]++ }
      END {
        for (s in saw) {
          g = (s in clicked) ? "배너 누름" : "보고도 안 누름"
          people[g]++
          hits[g] += offer[s] + 0
          if (offer[s] > 0) converted[g]++
        }
        for (g in people)
          printf "  %-16s 세션 %d개  오퍼클릭 %d회  1세션당 %.2f  오퍼로 간 세션 %.1f%%\n",
                 g, people[g], hits[g] + 0, hits[g] / people[g],
                 100 * (converted[g] + 0) / people[g]
      }' | sort

echo
echo "== 5. 방해가 되나 =="
echo "   닫기는 '봤고, 싫다'는 뜻이다. 무시(노출만)와는 다르다."
jq -r "$KEEP | select(.event | startswith(\"banner_\")) | [.sessionId, .event] | @tsv" "$SRC" \
  | awk -F'\t' '
      $2 == "banner_impression" { saw[$1] = 1 }
      $2 == "banner_dismiss"    { closed[$1] = 1 }
      END {
        n = 0; d = 0
        for (s in saw) { n++; if (s in closed) d++ }
        if (n > 0) printf "  배너를 본 세션 %d개 중 %d개가 닫았다 (%.1f%%)\n", n, d, 100 * d / n
        else print "  아직 노출 기록이 없다."
      }'
BODY
}

if [ $# -gt 0 ]; then
  command -v jq >/dev/null || { echo "jq가 필요하다. 인자 없이 실행하면 서버에서 처리한다." >&2; exit 1; }
  report_body | bash -s "$1"
else
  report_body | ssh -i "$REMOTE_KEY" -o StrictHostKeyChecking=no "$REMOTE_HOST" "bash -s '$REMOTE_PATH'"
fi
