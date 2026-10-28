"""Verify compact layout in the installed APK on the dedicated debug emulator.

Uses a new synthetic account and never connects to a physical phone.
"""
from __future__ import annotations

import json
import time

from debug_android import adb, environment
from packaging.package_common import PROJECT_ROOT
from test_android_emulator import WebView


def main():
    environment()
    client = adb()  # Verifies emulator-5554 belongs to this project's AVD.
    previous_rotation = client.shell("settings get system user_rotation").strip()
    previous_auto = client.shell("settings get system accelerometer_rotation").strip()
    report = {"checks": [], "pages": []}
    view = None

    def check(condition, name):
        report["checks"].append({"name": name, "ok": bool(condition)})
        print(("PASS " if condition else "FAIL ") + name, flush=True)
        if not condition:
            raise AssertionError(name)

    def wait_for(expression, seconds=12):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if view.evaluate(expression):
                return True
            time.sleep(0.2)
        return False

    def rotate(rotation):
        client.shell(f"settings put system user_rotation {rotation}")
        wanted = "true" if rotation == 0 else "false"
        return wait_for(f"window.ATO_MOBILE_LAYOUT?.active==={wanted}")

    try:
        client.shell("settings put system accelerometer_rotation 0")
        client.shell("settings put system user_rotation 0")
        # Start from the dashboard, avoiding a debugger attached to the deliberately
        # retired story WebView left by an earlier run. App data is preserved.
        client.shell("am force-stop com.ato.assistant")
        client.shell("am start -n com.ato.assistant/.MainActivity")
        time.sleep(1)
        view = WebView(client)
        view.call("Page.navigate", {"url": "about:blank"})
        time.sleep(0.3)
        # No prior account is read or edited: stop its page, then select a unique account.
        account = "layout-" + str(time.time_ns())
        login = view.evaluate("JSON.parse(ATOAndroid.request('file:///android_asset/web/api/campaign-state.php?action=login','POST'," +
                              json.dumps(json.dumps({"username": account})) + "))")
        check(login["status"] == 200, "native test account created")
        report["account"] = account
        view.navigate("index.html")
        check(wait_for("window.ATO_MOBILE_LAYOUT?.active===true"), "installed APK enters portrait layout")
        report["nativeEnvironment"] = view.evaluate("JSON.parse(ATOAndroid.mobileLayoutEnvironment())")
        view.evaluate("window.__layoutDocument=document;window.__layoutDraft=document.querySelector('#dayInput');if(__layoutDraft)__layoutDraft.value='7';")
        check(view.evaluate("!!window.__layoutDraft"), "original editable control available")
        view.evaluate("document.querySelector('.source-tools-trigger').click()")
        check(view.evaluate("document.querySelector('.source-tools').open"), "original tools open")
        before = view.evaluate("location.href")
        client.shell("input keyevent 4")
        check(wait_for("!document.querySelector('.source-tools')?.open"), "Android Back closes tools")
        check(view.evaluate("location.href") == before, "Back keeps the current page")
        check(rotate(1), "landscape restores original composition")
        check(view.evaluate("document===__layoutDocument&&__layoutDraft.isConnected&&__layoutDraft.value==='7'"), "rotation retains document, control and unsaved input")
        check(rotate(0), "portrait re-enables without reload")
        check(view.evaluate("document===__layoutDocument&&__layoutDraft.isConnected&&__layoutDraft.value==='7'"), "portrait return retains the same editable control")
        # Open the real keyboard from the original day field.
        view.evaluate("__layoutDraft.scrollIntoView({block:'center'});__layoutDraft.focus();")
        bounds = view.evaluate("(()=>{const r=__layoutDraft.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
        for event in ["mousePressed", "mouseReleased"]:
            view.call("Input.dispatchMouseEvent", {"type": event, **bounds, "button": "left", "clickCount": 1})
        time.sleep(0.7)
        ime = client.shell("dumpsys input_method")
        report["keyboardVisible"] = "mInputShown=true" in ime or "isInputViewShown=true" in ime
        check(report["keyboardVisible"], "actual Android keyboard opens")
        check(view.evaluate("ATO_MOBILE_LAYOUT.active&&JSON.parse(ATOAndroid.mobileLayoutEnvironment()).portrait"), "keyboard leaves native portrait decision unchanged")
        client.shell("input keyevent 111")
        view.evaluate("ATO_MOBILE_LAYOUT.back()")
        # Story runs last to avoid reusing its intentionally retired WebView session.
        for path in ["index.html", "record/index.html", "hero/index.html", "aibp/index.html",
                     "technology/index.html", "map/index.html", "briefing/index.html", "story/index.html"]:
            view.navigate(path)
            check(wait_for("window.ATO_MOBILE_LAYOUT?.active===true"), path + " portrait enabled")
            info = view.evaluate("({path:location.pathname,title:document.title,tools:document.querySelectorAll('.source-tools-trigger').length,width:innerWidth,height:innerHeight})")
            info["exceptions"] = view.exceptions
            report["pages"].append(info)
            check(info["tools"] == 1 and not info["exceptions"], path + " original page and tools load")
        report["success"] = True
    except Exception as error:
        report["success"] = False
        report["error"] = str(error)
        raise
    finally:
        if view:
            view.ws.close()
        for key, value in [("user_rotation", previous_rotation), ("accelerometer_rotation", previous_auto)]:
            if value == "null":
                client.shell("settings delete system " + key)
            else:
                client.shell("settings put system " + key + " " + value)
        destination = PROJECT_ROOT / "output/apk-native-layout-verification.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Report:", destination, flush=True)


if __name__ == "__main__":
    main()
