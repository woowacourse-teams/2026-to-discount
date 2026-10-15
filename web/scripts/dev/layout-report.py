"""iOS 배치 검사(layout-check.js)의 가짜 API와 결과 수신. ios-shot의 local 모드가 쓴다.

    python3 layout-report.py serve <폴더>        # 127.0.0.1:8099. GET /api/*는 fixtures/의 고정 응답, POST /report는 <폴더>/<n>.json
    python3 layout-report.py summary <폴더> <수>  # 마크다운 요약을 찍고, 실패가 있거나 보고가 <수>보다 적으면 종료 코드 1

검사용 빌드는 VITE_API_BASE_URL=http://localhost:8099로 이 서버를 API로 쓴다. 운영 데이터는 날마다 바뀌어
넘김(동점 최고) 카드가 첫 화면에 없는 날은 검사가 헛돌았다(2026-10-15). fixtures/brands.json은 운영 응답을 잘라
넘김 카드(푸라닭)가 맨 위에 오고, 선착순 구간(긴 메모, 품절)이 붙은 카드(KFC, 두찜)를 넣었다.
"""
import http.server
import json
import sys
import time
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"
GET = {"/api/brands": "brands.json", "/api/banners": "banners.json"}


def serve(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)

    class Handler(http.server.BaseHTTPRequestHandler):
        def _send(self, code: int, body: bytes = b"") -> None:
            self.send_response(code)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "*")
            if body:
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if body:
                self.wfile.write(body)

        def do_OPTIONS(self):
            self._send(204)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in GET:
                self._send(200, (FIXTURES / GET[path]).read_bytes())
            elif path == "/api/survey":
                self._send(200, b'{"eligible":false}')
            else:
                self._send(200, b"[]")

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("content-length") or 0))
            if self.path.startswith("/report"):
                (out / f"{time.time_ns()}.json").write_bytes(body)
            self._send(204)

        def log_message(self, *args):
            pass

    http.server.ThreadingHTTPServer(("127.0.0.1", 8099), Handler).serve_forever()


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
        lines.append(f"- {'실패' if fails else '통과'} `{r.get('url')}` 넘김 {r.get('carousels')}")
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
