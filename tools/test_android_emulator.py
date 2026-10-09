"""Run real-device API and page smoke checks on the project's debug emulator.

Requires websocket-client. Uses a new synthetic account; never targets a phone.
"""
from __future__ import annotations

import json
import http.client
import socket
import time
import urllib.request
from pathlib import Path

import websocket

from debug_android import CACHE, adb, environment
from packaging.package_common import PROJECT_ROOT


class WebView:
    def __init__(self, client, accept_dialogs=False):
        pid = client.shell("pidof com.ato.assistant").strip().split()[0]
        with socket.socket() as port_socket:
            port_socket.bind(("127.0.0.1", 0))
            port = port_socket.getsockname()[1]
        client.forward(f"tcp:{port}", f"localabstract:webview_devtools_remote_{pid}")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for attempt in range(50):
            try:
                with opener.open(f"http://127.0.0.1:{port}/json", timeout=2) as response:
                    targets = json.load(response)
                if targets:
                    break
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(0.2)
        else:
            raise RuntimeError("WebView debugger did not become ready")
        self.ws = websocket.create_connection(targets[0]["webSocketDebuggerUrl"],
                                              suppress_origin=True, timeout=60)
        self.next_id = 0
        self.exceptions = []
        self.dialogs = []
        self.accept_dialogs = accept_dialogs
        self.call("Page.enable")
        self.call("Runtime.enable")

    def call(self, method, params=None):
        self.next_id += 1
        identifier = self.next_id
        self.ws.send(json.dumps({"id": identifier, "method": method, "params": params or {}}))
        while True:
            event = json.loads(self.ws.recv())
            if event.get("method") == "Runtime.exceptionThrown":
                self.exceptions.append(event["params"]["exceptionDetails"])
            if event.get("method") == "Page.javascriptDialogOpening" and self.accept_dialogs:
                self.dialogs.append(event["params"])
                self.next_id += 1
                self.ws.send(json.dumps({"id": self.next_id, "method": "Page.handleJavaScriptDialog",
                                         "params": {"accept": True}}))
            if event.get("id") == identifier:
                if "error" in event:
                    raise RuntimeError(event["error"])
                return event.get("result", {})

    def evaluate(self, expression):
        result = self.call("Runtime.evaluate", {"expression": expression, "awaitPromise": True,
                                                "returnByValue": True, "userGesture": True})
        if "exceptionDetails" in result:
            raise RuntimeError(json.dumps(result["exceptionDetails"], ensure_ascii=False))
        return result.get("result", {}).get("value")

    def navigate(self, path):
        self.exceptions = []
        self.call("Page.navigate", {"url": "file:///android_asset/web/" + path})
        for _ in range(50):
            time.sleep(0.2)
            if self.evaluate("document.readyState==='complete' && !!window.ATOAndroid"):
                time.sleep(0.5)
                return
        raise RuntimeError("Page did not load: " + path)


def main():
    environment()
    client = adb()
    client.shell("am start -n com.ato.assistant/.MainActivity")
    time.sleep(1)
    view = WebView(client)
    view.navigate("index.html")
    report = {"device": client.shell("getprop ro.build.version.release").strip(),
              "webview": view.evaluate("navigator.userAgent")}
    # Isolate native API tests from a previously logged-in dashboard's timers.
    view.call("Page.navigate", {"url": "about:blank"})
    time.sleep(0.2)
    view.evaluate((PROJECT_ROOT / "tools/packaging/android/fetch-bridge.js").read_text(encoding="utf-8"))
    api = view.evaluate((PROJECT_ROOT / "tests/android-emulator-api.js").read_text(encoding="utf-8"))
    report["api"] = {"checks": api["checks"], "results": api["results"], "account": api["account"]}
    for result in api["results"]:
        print(("PASS " if result["ok"] else "FAIL ") + result["name"], flush=True)
        if not result["ok"]:
            print(result["error"], flush=True)
    print(f"Actual Android API checks: {api['checks']}", flush=True)
    # Force process recreation, then verify actual SharedPreferences/files survive.
    view.ws.close()
    client.shell("am force-stop com.ato.assistant")
    client.shell("am start -n com.ato.assistant/.MainActivity")
    time.sleep(2)
    view = WebView(client)
    campaign = view.evaluate("JSON.parse(JSON.parse(ATOAndroid.request('file:///android_asset/web/api/campaign-state.php','GET','')).body).campaign")
    report["persistence"] = {"ok": campaign == api["campaign"]}
    if api.get("attachment"):
        query = f"?action=record-attachment&id={api['attachment']['blobId']}&expectedAccountId={api['account']}"
        attachment = view.evaluate("JSON.parse(ATOAndroid.request(" + json.dumps("file:///android_asset/web/api/campaign-state.php" + query) + ",'GET','')).status")
        report["persistence"]["attachment"] = attachment == 200
    print("Persistence: " + json.dumps(report["persistence"]), flush=True)
    pages = []
    for path in ["index.html", "map/index.html", "technology/index.html", "record/index.html",
                 "hero/index.html", "aibp/index.html", "story/index.html", "briefing/index.html"]:
        view.navigate(path)
        info = view.evaluate("({title:document.title,body:document.body.innerText.length,text:document.body.innerText.slice(0,1500),buttons:document.querySelectorAll('button').length,url:location.href})")
        info.update(path=path, exceptions=view.exceptions)
        info["ok"] = info["body"] > 50 and not view.exceptions
        pages.append(info)
        print(("PASS " if info["ok"] else "FAIL ") + "page " + path, flush=True)
        if view.exceptions:
            print(json.dumps(view.exceptions, ensure_ascii=False), flush=True)
    report["pages"] = pages
    report["ok"] = all(item["ok"] for item in api["results"] + pages) and all(report["persistence"].values())
    destination = CACHE / "emulator-test-results.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    view.ws.close()
    print("Report:", destination, flush=True)
    if not report["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
