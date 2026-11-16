# Retakes the entry's 3 screenshots from the running app on live
# make.fun data. Serves app/ on http://localhost:8081 and captures
# each route from shots.json at 1280x800, waiting for
# window.__shotReady before each shot. If the app server or the local
# proxy relay is not already running, it starts them itself and stops
# them again at the end. Reports console errors and failed requests,
# so a broken render is caught, not shipped.
#
#   python3 shots.py          retake the 3 entry shots
#   python3 shots.py --phone  board at 390x844 into /tmp/phone-board.jpg,
#                             checking horizontal overflow instead

import json
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ENTRY = Path(__file__).resolve().parent
SHOTS = json.loads((ENTRY / "shots.json").read_text())
BASE = "http://localhost:8081"
OUT = ENTRY / "screenshots"
CHROME = "/home/hatch/.cache/chrome-for-testing/chrome-linux64/chrome"
RELAY = "/tmp/proxy-relay.py"
CAP = 262144


def listening(port):
    """True when something answers on the given localhost port."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def wait_port(port, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if listening(port):
            return True
        time.sleep(0.2)
    return False


def wait_http(url, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def start_server():
    """Start serve.ts on port 8081 when nothing serves there yet.
    Returns the process, or None when the server was already up."""
    if wait_http(BASE + "/", timeout=2):
        return None
    proc = subprocess.Popen(
        ["node", "serve.ts"],
        cwd=ENTRY,
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", "MAKEFUN_PORT": "8081"},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not wait_http(BASE + "/", timeout=10):
        proc.kill()
        raise RuntimeError("serve.ts did not come up on port 8081")
    return proc


def start_relay():
    """Start the local CONNECT relay when nothing listens on 8899.
    Chrome cannot do proxy auth, so the relay adds the
    Proxy-Authorization header itself. Returns the process, or None
    when the relay was already up."""
    if listening(8899):
        return None
    proc = subprocess.Popen(
        ["python3", RELAY],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not wait_port(8899, timeout=5):
        proc.kill()
        raise RuntimeError("proxy relay did not come up on port 8899")
    return proc


def watch(page):
    """Collect console errors, page errors and failed requests for one
    page. Returns the two lists; the handlers append to them."""
    errors = []
    failed = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("requestfailed", lambda r: failed.append(r.url + " " + (r.failure or "")))
    return errors, failed


def images_settled(page, timeout=10000):
    """Wait until every in-viewport <img> has finished loading or
    failed. A slow image still loading at shot time shows as a plain
    grey box, so the shot waits for the real photo or the letter-tile
    fallback instead. Returns False on timeout."""
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


def counter_text(page):
    el = page.evaluate("document.getElementById('netstat') ? document.getElementById('netstat').textContent : ''")
    return (el or "").strip()


def take_shot(page, shot):
    """Capture one route from shots.json. Returns a list of problems
    (empty when the shot is good)."""
    problems = []
    page.goto(BASE + "/" + shot["path"], wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_function("window.__shotReady === true", timeout=60000)
    except Exception:
        problems.append(shot["file"] + ": __shotReady never became true")
    if not images_settled(page):
        print(shot["file"] + ": warning: in-viewport images did not settle in time")
    page.wait_for_timeout(400)
    # The footer request counter is part of the entry: a shot with an
    # empty counter means the counter never rendered.
    netstat = counter_text(page)
    print(shot["file"], "netstat:", netstat or "(empty)")
    if not netstat:
        problems.append(shot["file"] + ": footer request counter is empty")
    path = OUT / shot["file"]
    page.screenshot(path=str(path), type="jpeg", quality=80)
    size = path.stat().st_size
    print(shot["file"], "->", size, "bytes", "OK" if size <= CAP else "TOO BIG")
    if size > CAP:
        problems.append(shot["file"] + ": over 256 KiB")
    return problems


def phone_check(browser):
    """The board at phone width, saved to /tmp (not into screenshots/,
    which holds exactly the 3 entry shots). Reports horizontal
    overflow, console errors and failed requests."""
    problems = []
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors, failed = watch(page)
    page.goto(BASE + "/#/", wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_function("window.__shotReady === true", timeout=60000)
    except Exception:
        problems.append("phone: __shotReady never became true")
    if not images_settled(page):
        print("phone: warning: in-viewport images did not settle in time")
    page.wait_for_timeout(400)
    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    print("phone horizontal overflow px:", overflow)
    if overflow > 0:
        problems.append(f"phone: page overflows horizontally by {overflow}px")
    netstat = counter_text(page)
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
    return problems


def main():
    phone_only = "--phone" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    server = start_server()
    relay = start_relay()
    problems = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=CHROME,
                # The egress proxy presents its own cert for TLS hosts,
                # which this Chromium does not trust; ignoring cert
                # errors here (a local screenshot run only, never the
                # app) lets the API's GitHub avatars load instead of
                # failing on the sandbox.
                args=["--no-sandbox", "--ignore-certificate-errors"],
                proxy={"server": "http://127.0.0.1:8899", "bypass": "localhost,127.0.0.1"},
            )
            if phone_only:
                problems += phone_check(browser)
                browser.close()
                if problems:
                    print("PROBLEMS:")
                    for problem in problems:
                        print(" -", problem)
                    sys.exit(1)
                print("PHONE CHECK OK")
                return
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            errors, failed = watch(page)
            for shot in SHOTS:
                problems += take_shot(page, shot)
            print("console errors:", errors if errors else "none")
            print("failed requests:", failed if failed else "none")
            if errors:
                problems.append("console errors: " + "; ".join(errors[:5]))
            if failed:
                problems.append("failed requests: " + "; ".join(failed[:5]))
            browser.close()
    finally:
        for proc in (server, relay):
            if proc is not None:
                proc.kill()
    if problems:
        print("PROBLEMS:")
        for problem in problems:
            print(" -", problem)
        sys.exit(1)
    print("ALL SHOTS OK")


if __name__ == "__main__":
    main()
