"""iOS 배치 검사(layout-check.js)의 결과를 받고 모은다. ios-shot의 local 모드가 쓴다.

    python3 layout-report.py serve <폴더>        # 127.0.0.1:8099 에서 POST 본문을 <폴더>/<n>.json 으로 적는다
    python3 layout-report.py summary <폴더> <수>  # 마크다운 요약을 찍고, 실패가 있거나 보고가 <수>보다 적으면 종료 코드 1
"""
import http.server
import json
import sys
import time
from pathlib import Path


def serve(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("content-length") or 0))
            (out / f"{time.time_ns()}.json").write_bytes(body)
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

        def log_message(self, *args):
            pass

    http.server.HTTPServer(("127.0.0.1", 8099), Handler).serve_forever()


def summary(out: Path, expected: int) -> int:
    reports = []
    for f in sorted(out.glob("*.json")):
        try:
            reports.append(json.loads(f.read_text(encoding="utf-8")))
        except ValueError:
            reports.append({"url": f.name, "fails": ["보고를 못 읽었다"]})
    lines = ["## iOS 배치 검사", ""]
    bad = 0
    for r in reports:
        fails = r.get("fails") or []
        bad += bool(fails)
        lines.append(f"- {'실패' if fails else '통과'} `{r.get('url')}`")
        lines += [f"  - {x}" for x in fails]
    if len(reports) < expected:
        bad += 1
        lines.append(f"- 실패: 보고가 {len(reports)}건이다({expected}건 기대). 페이지가 검사를 못 돌렸다")
    print("\n".join(lines))
    return 1 if bad else 0


if __name__ == "__main__":
    mode, folder = sys.argv[1], Path(sys.argv[2])
    if mode == "serve":
        serve(folder)
    else:
        sys.exit(summary(folder, int(sys.argv[3])))
