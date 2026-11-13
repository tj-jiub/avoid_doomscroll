#!/usr/bin/env python3
"""헤드리스로 자체 검증을 실행한다(선택).

브라우저에서 직접 보려면 ./serve.sh 후 http://localhost:5173/tests/ 를 열면 된다.
이 스크립트는 CI나 터미널에서 한 줄로 결과를 확인할 때 쓴다.

준비: pip install playwright && playwright install chromium
사용: python3 tools/run_tests.py
"""
import functools
import http.server
import json
import os
import socketserver
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("SL_PORT", "5174"))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright가 없습니다. 브라우저에서 ./serve.sh 후 /tests/ 를 열어 주세요.")
        return 2

    serve()
    url = "http://127.0.0.1:%d/tests/index.html" % PORT
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1100, "height": 1200})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url, wait_until="load")
        page.wait_for_function("() => window.__SL_TEST_RESULTS__", timeout=120000)
        res = page.evaluate("() => window.__SL_TEST_RESULTS__")
        browser.close()

    print(json.dumps({k: res[k] for k in ("passed", "failed", "total", "ms")}, ensure_ascii=False))
    for group in res["groups"]:
        for item in group["items"]:
            if not item["ok"]:
                print("FAIL | %s | %s | %s" % (group["name"], item["name"], item["detail"]))
    for e in errors:
        print("ERROR", e)
    return 0 if res["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
