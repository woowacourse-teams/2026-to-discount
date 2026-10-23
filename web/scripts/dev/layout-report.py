"""iOS 배치 검사(layout-check.js)의 가짜 API와 결과 수신. ios-shot의 local 모드가 쓴다.

    python3 layout-report.py serve <폴더> [--live <운영 응답 폴더>]  # 127.0.0.1:8099. GET /api/*는 고정 또는 운영 응답, POST /report는 <폴더>/<n>.json
    python3 layout-report.py summary <폴더> <index.txt>  # 마크다운 요약. 고정 데이터 장면에 실패나 보고 없음이 있으면 종료 코드 1

index.txt 줄은 `<번호> <주소> data=<fixture|live> at=<날짜>`. 운영 데이터 장면(#146)은 날마다 데이터가 바뀌어
실패로 치면 검사가 흔들리므로 경고로만 적는다. 고정 데이터 기준일(fixtures/DATE)이 7일을 넘어도 경고.
POST /data?set=live|fixture 로 줄 데이터를 바꾼다. 상태가 서버에 하나라 장면을 한 번에 하나씩 연다는 전제다.
병렬로 찍으면 깨진다. live를 달라는데 운영 응답이 없으면 409이고 고정 데이터로 대체하지 않는다.

검사용 빌드는 VITE_API_BASE_URL=http://localhost:8099로 이 서버를 API로 쓴다. 운영 데이터는 날마다 바뀌어
넘김(동점 최고) 카드가 첫 화면에 없는 날은 검사가 헛돌았다(2026-10-15). fixtures/brands.json은 운영 응답을 잘라
넘김 카드(푸라닭)가 맨 위에 오고, 선착순 구간(긴 메모, 품절)이 붙은 카드(KFC, 두찜)를 넣었다.
"""
from __future__ import annotations

import http.server
import json
import sys
import time
from datetime import date
from urllib.parse import parse_qs, unquote, urlsplit
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"
GET = {"/api/brands": "brands.json", "/api/banners": "banners.json"}


def serve(out: Path, live: Path | None = None, port: int = 8099) -> http.server.ThreadingHTTPServer:
    out.mkdir(parents=True, exist_ok=True)
    state = {"data": "fixture"}

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
                folder = live if state["data"] == "live" else FIXTURES
                self._send(200, (folder / GET[path]).read_bytes())
            elif path == "/api/survey":
                self._send(200, b'{"eligible":false}')
            else:
                self._send(200, b"[]")

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("content-length") or 0))
            if self.path.startswith("/report"):
                (out / f"{time.time_ns()}.json").write_bytes(body)
            elif self.path.startswith("/data"):
                want = parse_qs(urlsplit(self.path).query).get("set", [""])[0]
                ok = want == "fixture" or (want == "live" and live and all((live / f).is_file() for f in GET.values()))
                if not ok:
                    return self._send(409)
                state["data"] = want
            self._send(204)

        def log_message(self, *args):
            pass

    return http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)


def summary(out: Path, index: Path, today: date | None = None) -> int:
    scenes = []   # (주소, data, at)
    switch_failed = {}   # 주소 -> 가짜 API 데이터 전환 응답 코드. 검사 자체의 고장이라 운영 장면도 실패다
    for line in index.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        kv = dict(x.split("=", 1) for x in parts[2:] if "=" in x)
        scenes.append((parts[1], kv.get("data", "fixture"), kv.get("at", "?")))
        if "switch" in kv:
            switch_failed[unquote(parts[1])] = kv["switch"]
    live_of = {unquote(u): d == "live" for u, d, _ in scenes}
    reports = []
    for f in sorted(out.glob("*.json")):
        try:
            reports.append(json.loads(f.read_text(encoding="utf-8")))
        except ValueError:
            reports.append({"url": f.name, "fails": ["보고를 못 읽었다"]})
    lines = ["## iOS 배치 검사", ""]
    live_at = sorted({a for _, d, a in scenes if d == "live"})
    fixture_at = sorted({a for _, d, a in scenes if d != "live"})
    lines.append(f"- 운영 데이터 받은 시각: {', '.join(live_at) or '없음'}")
    lines.append(f"- 고정 데이터 기준일: {', '.join(fixture_at) or '없음'}")
    for a in fixture_at:
        try:
            age = ((today or date.today()) - date.fromisoformat(a)).days
        except ValueError:
            continue
        if age > 7:
            lines.append(f"- 경고: 고정 데이터가 {age}일 지났다(fixtures/DATE). 고정 장면 사진은 그때 데이터다")
    lines.append("")
    bad = 0
    for r in reports:
        fails = r.get("fails") or []
        live = live_of.get(unquote(str(r.get("url"))), False)
        bad += bool(fails) and not live
        verdict = ("경고" if live else "실패") if fails else "통과"
        scene = f" {json.dumps(r['scene'], ensure_ascii=False)}" if r.get("scene") else ""
        lines.append(f"- {verdict} `{r.get('url')}` 넘김 {r.get('carousels')}{scene}")
        lines += [f"  - {x}" for x in fails]
    seen = {unquote(str(r.get("url"))) for r in reports}     # 사파리가 css= 인코딩을 바꿔 적을 수 있다
    for url, data, at in scenes:
        if unquote(url) in switch_failed:
            bad += 1
            lines.append(f"- 실패 `{url}` data={data}: 가짜 API 데이터 전환이 실패했다(응답 {switch_failed[unquote(url)]}). 검사가 안 돌았다")
        elif unquote(url) not in seen:
            live = data == "live"
            bad += not live
            lines.append(f"- {'경고' if live else '실패'} `{url}` data={data}: 보고가 없다. 페이지가 검사를 못 돌렸다(다시 열어도 안 왔다)")
    print("\n".join(lines))
    return 1 if bad else 0


if __name__ == "__main__":
    mode, folder = sys.argv[1], Path(sys.argv[2])
    if mode == "serve":
        live = Path(sys.argv[sys.argv.index("--live") + 1]) if "--live" in sys.argv else None
        serve(folder, live).serve_forever()
    else:
        sys.exit(summary(folder, Path(sys.argv[3])))
