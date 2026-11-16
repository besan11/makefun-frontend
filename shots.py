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


def wait_for_images(page, timeout=10000):
    """Wait until every in-viewport <img> has settled (loaded or failed).
    A slow image still loading at shot time shows as a plain grey box, so
    the shot waits for the real photo or the letter-tile fallback instead.
    Returns False on timeout; the caller decides whether that matters."""
    try:
        page.wait_for_function(
            """() => [...document.images].filter(i => {
                const r = i.getBoundingClientRect();
                return r.top < innerHeight && r.bottom > 0;
            }).every(i => i.complete)""",
            timeout=timeout,
        )
        return True
    except Exception:
        return False


def main():
    phone_only = "--phone" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    problems = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome",
            # The egress proxy presents its own cert for TLS hosts, which
            # this Chromium does not trust; ignoring cert errors here (a
            # local screenshot run only, never the app) lets the API's
            # GitHub avatars load instead of failing on the sandbox.
            args=["--no-sandbox", "--ignore-certificate-errors"],
            proxy=proxy_from_env(),
        )
        if phone_only:
            # Narrow-viewport check: the board at phone width, saved to /tmp
            # (not into screenshots/, which holds exactly the 3 entry shots).
            # Reports horizontal overflow, console errors and failed requests.
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors = []
            failed = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("requestfailed", lambda r: failed.append(r.url + " " + (r.failure or "")))
            page.goto(BASE + "/#/", wait_until="domcontentloaded", timeout=60000)
            try:
                page.wait_for_function("window.__shotReady === true", timeout=60000)
            except Exception:
                problems.append("phone: __shotReady never became true")
            if not wait_for_images(page):
                print("phone: warning: in-viewport images did not settle in time")
            page.wait_for_timeout(400)
            overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            print("phone horizontal overflow px:", overflow)
            if overflow > 0:
                problems.append(f"phone: page overflows horizontally by {overflow}px")
            netstat = page.evaluate("document.getElementById('netstat') ? document.getElementById('netstat').textContent : ''")
            print("phone netstat:", netstat or "(empty)")
            if not netstat:
                problems.append("phone: footer request counter is empty")
            page.screenshot(path="/tmp/phone-board.jpg", type="jpeg", quality=80)
            print("phone shot -> /tmp/phone-board.jpg")
            print("console errors:", errors if errors else "none")
            print("failed requests:", failed if failed else "none")
            if errors:
                problems.append("phone console errors: " + "; ".join(errors[:5]))
            if failed:
                problems.append("phone failed requests: " + "; ".join(failed[:5]))
            browser.close()
            if problems:
                print("PROBLEMS:")
                for problem in problems:
                    print(" -", problem)
                sys.exit(1)
            print("PHONE CHECK OK")
            return
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
            if not wait_for_images(page):
                print(shot["file"] + ": warning: in-viewport images did not settle in time")
            page.wait_for_timeout(400)
            # The footer request counter is part of the entry: a shot
            # with an empty counter means the counter never rendered.
            netstat = page.evaluate("document.getElementById('netstat') ? document.getElementById('netstat').textContent : ''")
            print(shot["file"], "netstat:", netstat or "(empty)")
            if not netstat:
                problems.append(shot["file"] + ": footer request counter is empty")
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
