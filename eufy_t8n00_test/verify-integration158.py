"""My exact-source integration caller qualification. Created with Codex."""

import json
from pathlib import Path
import subprocess
import urllib.request
import xml.etree.ElementTree as ET

BASE = "775560f561b76bd4a13da762a5d8e9cf4ca32ad9"
CANDIDATE = "3b0c48dc39e29df6cef99ce1bebeeba5c3918d7f"
FILES = ["custom_components/eufy_sdk/camera.py", "custom_components/eufy_sdk/snapshot_policy.py"]


def run(*args):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, flush=True)
    return result.returncode


def totals(path):
    return ET.parse(path).getroot().find("testsuite").attrib


saved = {name: Path(name).read_bytes() for name in FILES}
try:
    for name in FILES:
        with urllib.request.urlopen(f"https://raw.githubusercontent.com/mega-yfue/ha-eufy-sdk/{BASE}/{name}") as response:
            Path(name).write_bytes(response.read())
    before = run("python", "-m", "pytest", "tests/test_camera_views.py", "-q", "--junitxml=/tmp/integration-before.xml")
    counts = totals("/tmp/integration-before.xml")
    assert before == 1 and counts["tests"] == "11" and counts["failures"] == "7" and counts["errors"] == "0", counts
finally:
    for name, source in saved.items():
        Path(name).write_bytes(source)

assert run("python", "-m", "ruff", "check", ".") == 0
assert run("python", "-m", "ruff", "format", ".", "--check") == 0
assert run("python", "-m", "pytest", "tests/test_camera_views.py", "-q", "--junitxml=/tmp/integration-after.xml") == 0
assert run("python", "-m", "pytest", "tests/", "-q", "--junitxml=/tmp/integration-full.xml") == 0
report = {"base": BASE, "candidate": CANDIDATE, "before": counts,
          "after": totals("/tmp/integration-after.xml"), "full": totals("/tmp/integration-full.xml")}
Path("/integration-validation-result.json").write_text(json.dumps(report), encoding="utf-8")
print("[integration158-qualification] " + json.dumps(report), flush=True)
