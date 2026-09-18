#!/usr/bin/env python3
"""Read only: locate four archived UFO trajectories; never execute their commands.

Usage: python3 extract-events.py LOCAL_CAMPAIGN_ROOT P1/27 H2/57
Without selectors, print a compact tool index. No provider response/reasoning is
exported. Run paths come from the frozen assignment and continuation amendment.
"""
import hashlib
import json
import pathlib
import sys


RUNS = {
    "P1": (8, "runs/url-search-params-r1-P"),
    "H1": (7, "runs/url-search-params-r1-Hbase"),
    "P2": (11, "continuation-11-12/runs/url-search-params-r2-P"),
    "H2": (12, "continuation-11-12/runs/url-search-params-r2-Hbase"),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(root, label):
    slot, relative = RUNS[label]
    run = root / relative
    assert json.loads((run / "started.json").read_text())["slot"] == slot
    raw = (run / "native-evidence.json").read_bytes()
    native = json.loads(raw)
    events = [t for t in native["tools"] if t["data"]["tool"] != "harness_task"]
    events.sort(key=lambda t: (t["data"]["state"].get("time", {}).get("start", 0), t["id"]))
    received = {}
    for file in sorted(run.glob("request-*.json"), key=lambda f: int(f.stem.split("-")[1])):
        for item in json.loads(file.read_text())["input"]:
            if item.get("type") == "function_call_output":
                received.setdefault(item["call_id"], (file.name, item["output"]))
    snapshots = {}
    artifacts = list((run / "candidate/.git/harness-task").glob("*/tool-events.json"))
    if artifacts:
        assert len(artifacts) == 1
        for event in json.loads(artifacts[0].read_text()):
            snapshots[event["callID"]] = {
                "source": str(artifacts[0].relative_to(run)),
                "before": event.get("before"), "after": event.get("after"),
            }
    else:
        stream = [json.loads(line) for line in (run / "session/events.jsonl").read_text().splitlines()]
        starts, ends = {}, {}
        for event in stream:
            part = event.get("part", {})
            if event["type"] == "step_start":
                starts[part["messageID"]] = part.get("snapshot")
            if event["type"] == "step_finish":
                ends[part["messageID"]] = part.get("snapshot")
        for event in events:
            snapshots[event["data"]["callID"]] = {
                "source": "session/events.jsonl", "granularity": "whole native step, not each call",
                "before": starts.get(event["message_id"]), "after": ends.get(event["message_id"]),
            }
    result = []
    for number, event in enumerate(events, 1):
        data = event["data"]
        state = data["state"]
        call = data["callID"]
        output = state.get("output", state.get("error", ""))
        receipt = received.get(call)
        result.append({
            "event": f"{label}/{number}", "file": f"{relative}/native-evidence.json",
            "fileSha256": sha(raw), "partID": event["id"], "messageID": event["message_id"],
            "sessionID": event["session_id"], "callID": call, "tool": data["tool"],
            "time": state.get("time"), "input": state.get("input"),
            "state": state["status"], "exit": state.get("metadata", {}).get("exit"),
            "nativeTruncated": state.get("metadata", {}).get("truncated"),
            "snapshot": snapshots.get(call),
            "firstReturnedRequest": receipt[0] if receipt else None,
            "returnedContainsNativeOutput": output in receipt[1] if receipt and isinstance(receipt[1], str) else None,
            "output": output,
        })
    return result


if __name__ == "__main__":
    root = pathlib.Path(sys.argv[1]).resolve()
    selectors = sys.argv[2:]
    labels = list(dict.fromkeys(s.split("/")[0] for s in selectors)) if selectors else list(RUNS)
    for label in labels:
        for event in load(root, label):
            if selectors and event["event"] not in selectors:
                continue
            if selectors:
                print(json.dumps(event, ensure_ascii=False, indent=2))
            else:
                arg = event["input"]
                description = arg.get("command", arg.get("filePath", arg.get("pattern", event["tool"])))
                print(event["event"], event["callID"], event["tool"], event["exit"], description)
