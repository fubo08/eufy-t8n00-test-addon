"""Run isolated RTC checks and restore my normal bridge. Created with Codex."""
import json
import os
from pathlib import Path
import time
import urllib.request

MAIN = "b8ab9abc_eufy_t8n00_test"


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
assert before["version"] == "0.3.76" and before["state"] == "started"
assert before["options"]["qualification_profile"] == "combined78"
profiles = ("sdkPersistPair",) if os.environ.get("QUALIFICATION_PHASE") == "pair" else ("sdkPersistCold", "sdkPersistRestored")
report = {"artifact": os.environ["QUALIFICATION_ARTIFACT"], "phases": []}
try:
    call(MAIN, "options", {"watchdog": False})
    call(MAIN, "stop", {})
    for profile in profiles:
        phase = {"profile": profile, "started": time.time()}
        report["phases"].append(phase)
        run(MAIN, profile)
        phase["finished"] = time.time()
        time.sleep(5)
finally:
    if call(MAIN, "info")["state"] == "started":
        call(MAIN, "stop", {})
    call(MAIN, "options", {"options": before["options"], "boot": before["boot"], "watchdog": before["watchdog"]})
    call(MAIN, "start", {})
    after = call(MAIN, "info")
    report["restored"] = after["state"] == "started" and after["options"]["qualification_profile"] == "combined78"
    Path("/tmp/eufy-review-076.json").write_text(json.dumps(report))
