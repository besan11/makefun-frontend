# Takes the entry's 3 screenshots of the running app on live make.fun data.
# Serves app/ on http://localhost:8081 (already running via serve.ts) and
# captures each route from shots.json at 1280x800, waiting for
# window.__shotReady before each shot. Reports console errors and failed
# requests so a broken render is caught, not shipped.

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ENTRY = Path(__file__).resolve().parent
SHOTS = json.loads((ENTRY / "shots.json").read_text())
BASE = "http://localhost:8081"
OUT = ENTRY / "screenshots"


def proxy_from_env():
    """Local unauthenticated CONNECT relay (see /tmp/proxy-relay.py) that
    forwards to this VM's authenticated egress proxy. Chrome cannot do
    proxy auth, so the relay adds the Proxy-Authorization header."""
    return {
        "server": "http://127.0.0.1:8899",
        "bypass": "localhost,127.0.0.1",
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    problems = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome",
            args=["--no-sandbox"],
            proxy=proxy_from_env(),
        )
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        errors = []
        failed = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("requestfailed", lambda r: failed.append(r.url + " " + (r.failure or "")))
        for shot in SHOTS:
            url = BASE + "/" + shot["path"]
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            try:
                page.wait_for_function("window.__shotReady === true", timeout=60000)
            except Exception:
                problems.append(shot["file"] + ": __shotReady never became true")
            page.wait_for_timeout(400)
            path = OUT / shot["file"]
            page.screenshot(path=str(path), type="jpeg", quality=80)
            size = path.stat().st_size
            print(shot["file"], "->", size, "bytes", "OK" if size <= 262144 else "TOO BIG")
            if size > 262144:
                problems.append(shot["file"] + ": over 256 KiB")
        print("console errors:", errors if errors else "none")
        print("failed requests:", failed if failed else "none")
        if errors:
            problems.append("console errors: " + "; ".join(errors[:5]))
        if failed:
            problems.append("failed requests: " + "; ".join(failed[:5]))
        browser.close()
    if problems:
        print("PROBLEMS:")
        for problem in problems:
            print(" -", problem)
        sys.exit(1)
    print("ALL SHOTS OK")


if __name__ == "__main__":
    main()
