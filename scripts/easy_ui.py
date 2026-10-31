"""Minimal MCP-over-HTTP client for the local easy-ui container (one MCP session per run).
Usage: easyui.py list | easyui.py call TOOL 'JSON_ARGS' | easyui.py batch steps.json  ([{"tool":..,"args":{..}}, ...])"""
import json, sys, urllib.request
URL = "http://127.0.0.1:8765/mcp"
HDR = {"content-type": "application/json", "accept": "application/json, text/event-stream"}
def post(body, sid=None):
    h = dict(HDR)
    if sid: h["mcp-session-id"] = sid
    req = urllib.request.Request(URL, json.dumps(body).encode(), h)
    with urllib.request.urlopen(req, timeout=300) as r:
        sid = r.headers.get("mcp-session-id") or sid
        txt = r.read().decode()
    msgs = [json.loads(l[5:]) for l in txt.splitlines() if l.startswith("data:")] or ([json.loads(txt)] if txt.strip() else [])
    return sid, msgs
sid, _ = post({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "cli", "version": "0"}}})
post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
if sys.argv[1] == "list":
    _, m = post({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, sid)
    for t in m[-1]["result"]["tools"]:
        print(t["name"], "-", t.get("description", "")[:200]); print("   args:", json.dumps(t.get("inputSchema", {}).get("properties", {}))[:400])
elif sys.argv[1] == "batch":
    for i, st in enumerate(json.load(open(sys.argv[2]))):
        _, m = post({"jsonrpc": "2.0", "id": 10 + i, "method": "tools/call", "params": {"name": st["tool"], "arguments": st.get("args", {})}}, sid)
        res = m[-1].get("result", m[-1])
        txt = " ".join(c.get("text", "") for c in res.get("content", [])) if isinstance(res, dict) else str(res)
        print(f"[{st['tool']}] {'ERROR ' if res.get('isError') else ''}{txt[:1500]}")
else:
    _, m = post({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": sys.argv[2], "arguments": json.loads(sys.argv[3] if len(sys.argv) > 3 else "{}")}}, sid)
    print(json.dumps(m[-1], indent=1)[:20000])
