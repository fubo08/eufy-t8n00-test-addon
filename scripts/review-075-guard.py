"""Run isolated RTC checks and restore my normal bridge. Created with Codex."""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
import urllib.request

MAIN = "b8ab9abc_eufy_t8n00_test"
HOST = "b8ab9abc_eufy_rtc_host_probe"


def call(slug, action, body=None):
    request = urllib.request.Request(
        f"http://supervisor/addons/{slug}/{action}",
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + os.environ["SUPERVISOR_TOKEN"],
                 "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        result = json.load(response)
    if result.get("result") != "ok":
        raise RuntimeError("supervisor_request_failed")
    return result.get("data")


def run(slug, profile):
    if profile:
        call(slug, "options", {"options": dict(before["options"], qualification_profile=profile)})
    call(slug, "start", {})
    deadline = time.monotonic() + 175
    while time.monotonic() < deadline:
        time.sleep(2)
        if call(slug, "info")["state"] != "started":
            return
    call(slug, "stop", {})
    raise TimeoutError("probe_deadline")


before = call(MAIN, "info")
assert before["version"] == "0.3.75" and before["state"] == "started"
assert before["options"]["qualification_profile"] == "combined78"
phase = os.environ.get("QUALIFICATION_PHASE", "warm")
assert phase in ("warm", "cold", "hostCold")
target = HOST if phase == "hostCold" else MAIN
host_options = call(HOST, "info")["options"] if target == HOST else None
report = {"phase": phase, "artifact": os.environ["QUALIFICATION_ARTIFACT"], "started": time.time()}
path = Path(f"/tmp/eufy-review-075-{phase}.json")
capture = None
try:
    call(MAIN, "options", {"watchdog": False})
    call(MAIN, "stop", {})
    if phase != "warm":
        time.sleep(300)
        report["idleSeconds"] = 300
    if target == HOST:
        call(HOST, "options", {"options": {key: before["options"][key] for key in ("email", "password", "country")}})
    if phase != "warm":
        capture = subprocess.Popen(
            ["tcpdump", "-nn", "-l", "-i", "any", "-s", "96", "-c", "500", "udp port 5062"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        time.sleep(1)
    run(target, {"warm": "sdkWarm", "cold": "sdkCold", "hostCold": None}[phase])
except Exception as exc:
    report["error"] = type(exc).__name__
finally:
    try:
        if capture:
            if capture.poll() is None:
                capture.send_signal(signal.SIGINT)
            out, err = capture.communicate(timeout=5)
            report["capture"] = {
                "listening": "listening on any" in err,
                "fromPort5062": sum(bool(re.search(r"\.5062 >", line)) for line in out.splitlines()),
                "toPort5062": sum(bool(re.search(r" > \S+\.5062:", line)) for line in out.splitlines()),
            }
        if target == HOST:
            if call(HOST, "info")["state"] == "started":
                call(HOST, "stop", {})
            call(HOST, "options", {"options": host_options})
    finally:
        if call(MAIN, "info")["state"] == "started":
            call(MAIN, "stop", {})
        call(MAIN, "options", {"options": before["options"], "boot": before["boot"], "watchdog": before["watchdog"]})
        call(MAIN, "start", {})
        report["finished"] = time.time()
        after = call(MAIN, "info")
        report["restored"] = after["state"] == "started" and after["options"]["qualification_profile"] == "combined78"
        path.write_text(json.dumps(report))
