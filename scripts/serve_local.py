"""Serve web/ at / and a data directory at /data/ (gzip files get Content-Encoding like Blob).

    python scripts/serve_local.py [--data .localdata/web/data] [--port 8080]
"""
import argparse
import functools
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    data_dir: Path = ROOT / ".localdata/web/data"

    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        if p.startswith("/data/"):
            return str(self.data_dir / p[len("/data/"):])
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.is_file() and path.suffix == ".json":
            data = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            if data[:2] == b"\x1f\x8b":
                self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            import io
            return io.BytesIO(data)
        return super().send_head()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / ".localdata/web/data"))
    ap.add_argument("--port", type=int, default=8080)
    a = ap.parse_args()
    Handler.data_dir = Path(a.data).resolve()
    handler = functools.partial(Handler, directory=str(ROOT / "web"))
    print(f"http://localhost:{a.port}/  (data: {Handler.data_dir})", flush=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), handler, bind_and_activate=False)
    server.request_queue_size = 64  # the dashboard fetches several weeks of day files at once
    server.server_bind()
    server.server_activate()
    server.serve_forever()


if __name__ == "__main__":
    main()
