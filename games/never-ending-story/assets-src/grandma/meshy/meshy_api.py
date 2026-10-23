"""Re-run the Meshy steps for Grandma Mali (costs credits; see tasks.json).

    MESHY_API_KEY=... python meshy_api.py balance
    python meshy_api.py image-to-3d          # 30 credits, uses ../ref/grandma-cutout.png
    python meshy_api.py rigging <image_task_id>
    python meshy_api.py animations <rig_task_id> request-animations-1.json
    python meshy_api.py poll <kind> <task_id> # kind: image-to-3d | rigging | animations
    python meshy_api.py download <url> <file> # result URLs are in the polled task JSON

The key is only read from the environment. It is never printed or written to disk.
"""
import base64, json, os, sys, time
from pathlib import Path

import requests

API = "https://api.meshy.ai/openapi/v1"
HERE = Path(__file__).parent
RAW = HERE / "raw"  # git-ignored: raw Meshy downloads and task JSON


def headers():
    return {"Authorization": f"Bearer {os.environ['MESHY_API_KEY']}"}


def post(path, body):
    r = requests.post(f"{API}/{path}", headers=headers(), json=body, timeout=120)
    r.raise_for_status()
    print(path, "->", r.json()["result"])


def main(cmd, *args):
    RAW.mkdir(exist_ok=True)
    if cmd == "balance":
        print(requests.get(f"{API}/balance", headers=headers(), timeout=30).json())
    elif cmd == "image-to-3d":
        png = (HERE.parent / "ref" / "grandma-cutout.png").read_bytes()
        body = json.loads((HERE / "request-image-to-3d.json").read_text())
        body["image_url"] = "data:image/png;base64," + base64.b64encode(png).decode()
        post("image-to-3d", body)
    elif cmd == "rigging":
        body = json.loads((HERE / "request-rigging.json").read_text())
        body["input_task_id"] = args[0]
        post("rigging", body)
    elif cmd == "animations":
        body = json.loads((HERE / args[1]).read_text())
        body["rig_task_id"] = args[0]
        post("animations", body)
    elif cmd == "poll":
        kind, task_id = args
        while True:
            r = requests.get(f"{API}/{kind}/{task_id}", headers=headers(), timeout=30)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(5)
                continue
            task = r.json()
            print(task["status"], task.get("progress"), flush=True)
            if task["status"] in ("SUCCEEDED", "FAILED", "CANCELED"):
                (RAW / f"task-{task_id}.json").write_text(json.dumps(task, indent=1))
                break
            time.sleep(max(5, int(r.headers.get("Retry-After", 5))))
    elif cmd == "download":
        url, name = args
        (RAW / name).write_bytes(requests.get(url, timeout=300).content)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(*sys.argv[1:]) if len(sys.argv) > 1 else sys.exit(__doc__)
