package com.ato.assistant;

import android.content.Context;
import android.net.Uri;
import java.util.Map;
import org.json.JSONObject;

public final class CampaignImportHarness {
  private final Context context = new Context();
  private final LocalCampaignApi api = new LocalCampaignApi(context);
  private int checks;

  private JSONObject request(String query, String method, String raw, int status) throws Exception {
    JSONObject envelope = new JSONObject(api.handleForJavascript(
        Uri.parse("http://localhost/api/campaign-state.php" + query), method, raw));
    check(envelope.getInt("status") == status, "Expected HTTP " + status + ": " + envelope);
    return new JSONObject(envelope.getString("body"));
  }

  private void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
    checks++;
  }

  private JSONObject campaign() throws Exception {
    return request("", "GET", "", 200).getJSONObject("campaign");
  }

  private JSONObject rejected(String method, String raw, int status) throws Exception {
    Map<String, ?> before = context.store.getAll();
    int commits = context.store.commits;
    JSONObject response = request("?action=import-sections", method, raw, status);
    check(before.equals(context.store.getAll()), "Rejected import changed save or backups");
    check(commits == context.store.commits, "Rejected import submitted a preferences editor");
    return response;
  }

  private void run() throws Exception {
    JSONObject missingIndex = new JSONObject(api.handleForJavascript(Uri.parse("file:///android_asset/web/api/aibp-image-index.php"), "GET", ""));
    check(missingIndex.getInt("status") == 503, "Unavailable index must report failure");
    api.attachImageIndex(() -> new JSONObject().put("ok", true).put("version", 1)
        .put("images", new org.json.JSONArray().put("ps/TITAN_X/TITAN_X.jpg")));
    for (String base : new String[]{"file:///android_asset/web", "http://127.0.0.1"}) {
      JSONObject index = new JSONObject(api.handleForJavascript(Uri.parse(base + "/api/aibp-image-index.php"), "GET", ""));
      check(index.getInt("status") == 200, "Public index requires no login");
      check(new JSONObject(index.getString("body")).getJSONArray("images").length() == 1, "Index response contract mismatch");
    }
    check(context.store.commits == 0, "Image inventory must not change saves");
    JSONObject badMethod = new JSONObject(api.handleForJavascript(Uri.parse("http://localhost/api/aibp-image-index.php"), "POST", "{}"));
    check(badMethod.getInt("status") == 405, "Image inventory is read-only");
    request("?action=import-sections", "POST", "{}", 401);
    request("?action=login", "POST", "{\"username\":\"local\"}", 200);

    String full = "{\"dashboard\":{\"activeProfileId\":\"ship\",\"profiles\":{\"ship\":{"
        + "\"name\":\"阿尔戈号\",\"activeCycleId\":\"c5\",\"cycles\":{\"c5\":{\"state\":{\"day\":80}}}}}},"
        + "\"map\":{\"users\":{\"ship\":{\"cycles\":{\"c5\":{\"explored\":[1,2]}}}}},"
        + "\"record\":{\"users\":{\"ship\":{\"notes\":\"导入笔记\"}}},"
        + "\"technology\":{\"gear\":[\"test\"]},\"heroes\":{\"names\":[\"赫拉克勒斯\"]},"
        + "\"aibp\":null,\"story\":null}";
    JSONObject incoming = new JSONObject(full);
    JSONObject payload = new JSONObject().put("sections", incoming).put("expectedAccountId", "local");
    JSONObject expected = new JSONObject();
    for (String name : incoming.keySet()) expected.put(name, 0);
    payload.put("expectedRevisions", expected);
    int commits = context.store.commits;
    JSONObject result = request("?action=import-sections", "POST", payload.toString(), 200);
    check(context.store.commits == commits + 1, "Full import must commit only once");
    check(result.getJSONObject("sections").length() == 7, "Full import must report all seven revisions");
    JSONObject saved = campaign();
    for (String name : incoming.keySet()) {
      check(incoming.get(name).toString().equals(saved.getJSONObject("sections").get(name).toString()),
          "Full import did not preserve " + name);
      check(saved.getJSONObject("sectionRevisions").getInt(name) == 1, "Wrong revision for " + name);
    }
    JSONObject reopened = new JSONObject(new LocalCampaignApi(context).handleForJavascript(
        Uri.parse("http://localhost/api/campaign-state.php"), "GET", ""));
    check(new JSONObject(reopened.getString("body")).getJSONObject("campaign").toString().equals(saved.toString()),
        "Imported campaign did not survive API recreation");

    JSONObject partial = new JSONObject().put("sections", new JSONObject("{\"dashboard\":{\"new\":true},\"heroes\":null}"))
        .put("expectedRevisions", new JSONObject("{\"dashboard\":1,\"heroes\":99}"));
    JSONObject conflict = rejected("POST", partial.toString(), 409);
    check("SAVE_CONFLICT".equals(conflict.getString("code")), "Missing conflict code");
    check(conflict.getJSONObject("sections").getJSONObject("heroes").getInt("revision") == 1,
        "Conflict must report the current revision");
    payload.put("expectedAccountId", "other");
    check("ACCOUNT_MISMATCH".equals(rejected("POST", payload.toString(), 409).getString("code")),
        "Missing account mismatch code");

    for (String raw : new String[]{
        "not-json", "[]", "{}", "{\"sections\":{}}", "{\"sections\":[]}",
        "{\"sections\":{\"dashboard\":{},\"future\":{}}}",
        "{\"sections\":{\"map\":{}},\"expectedRevisions\":null}",
        "{\"sections\":{\"map\":{}},\"expectedRevisions\":[]}",
        "{\"sections\":{\"map\":{}},\"expectedRevisions\":{\"future\":0}}",
        "{\"sections\":{\"map\":{}},\"expectedRevisions\":{\"map\":1.5}}",
        "{\"sections\":{\"map\":{}},\"expectedRevisions\":{\"map\":true}}",
        "{\"sections\":{\"map\":{}},\"expectedRevisions\":{\"map\":\"oops\"}}"
    }) rejected("POST", raw, 400);
    rejected("GET", "", 405);
    rejected("POST", "{\"sections\":{\"map\":{}},\"expectedRevisions\":{\"map\":4294967297}}", 409);

    // Jsave-style partial import: untouched sections keep both state and revision.
    JSONObject subset = new JSONObject("{\"map\":{\"legacy\":true},\"record\":null}");
    String previousRaw = context.store.getString("campaign::local", "");
    payload = new JSONObject().put("sections", subset)
        .put("expectedRevisions", new JSONObject("{\"map\":\"1\",\"record\":1}"));
    commits = context.store.commits;
    request("?action=import-sections", "POST", payload.toString(), 200);
    check(context.store.commits == commits + 1, "Partial import must commit once");
    check(previousRaw.equals(context.store.getString("campaign::local::backup::1", "")),
        "Backup must contain the entire campaign before import");
    JSONObject after = campaign();
    check(after.getJSONObject("sections").getJSONObject("dashboard").toString()
        .equals(saved.getJSONObject("sections").getJSONObject("dashboard").toString()), "Partial import changed dashboard");
    check(after.getJSONObject("sectionRevisions").getInt("dashboard") == 1, "Partial import changed unrelated revision");
    check(after.getJSONObject("sections").isNull("record"), "Partial import lost explicit null");

    // Batch writes use the same profile bucket migration as ordinary writes.
    request("?section=heroes", "POST", "{\"state\":{\"accounts\":{\"old\":{\"name\":\"keep\"}}}}", 200);
    request("?action=import-sections", "POST",
        "{\"sections\":{\"heroes\":{\"name\":\"new\"},\"map\":{\"new\":true}},\"userId\":\"ship\"}", 200);
    after = campaign();
    JSONObject heroes = after.getJSONObject("sections").getJSONObject("heroes");
    check(!heroes.has("accounts"), "Legacy accounts bucket was not migrated");
    check(heroes.getJSONObject("users").getJSONObject("old").getString("name").equals("keep"), "Migration lost another profile");
    check(heroes.getJSONObject("users").getJSONObject("ship").getString("name").equals("new"), "Import missed target profile");
    request("?section=heroes", "POST", "{\"state\":{\"name\":\"single\"},\"userId\":\"ship\",\"expectedRevision\":3}", 200);
    check(campaign().getJSONObject("sections").getJSONObject("heroes").getJSONObject("users")
        .getJSONObject("ship").getString("name").equals("single"), "Single-section write regressed");

    // Two pages importing against the same revision: exactly one can succeed.
    int revision = campaign().getJSONObject("sectionRevisions").getInt("map");
    String racing = new JSONObject().put("sections", new JSONObject("{\"map\":{\"race\":true}}"))
        .put("expectedRevisions", new JSONObject().put("map", revision)).toString();
    int[] statuses = new int[2];
    Thread[] threads = new Thread[2];
    for (int i = 0; i < 2; i++) {
      final int index = i;
      threads[i] = new Thread(() -> {
        try {
          statuses[index] = new JSONObject(api.handleForJavascript(Uri.parse(
              "http://localhost/api/campaign-state.php?action=import-sections"), "POST", racing)).getInt("status");
        } catch (Exception failure) { statuses[index] = -1; }
      });
      threads[i].start();
    }
    for (Thread thread : threads) thread.join();
    check((statuses[0] == 200 && statuses[1] == 409) || (statuses[0] == 409 && statuses[1] == 200),
        "Concurrent imports must serialize validation and commit");
    check(campaign().getJSONObject("sectionRevisions").getInt("map") == revision + 1, "Race incremented revision twice");
    // 第二屏外观跟着设置走服务端（和 api/campaign-state.php、ss/app.js 同一套契约）：
    // 安卓侧没有 PHP，HTTP 接口是这里实现的，主题字段必须一并走通。
    api.attachSecondScreenServer(new LocalSecondScreenServer());
    JSONObject status = request("?action=second-screen-status", "POST",
        "{\"enabled\":true,\"theme\":{\"mode\":\"custom\",\"rgb\":[200,30,30]}}", 200);
    check(status.getJSONObject("theme").getString("mode").equals("custom"), "Theme mode must round-trip");
    JSONObject screen = request("?action=second-screen", "GET", "", 200).getJSONObject("screen");
    check(screen.getJSONObject("theme").getJSONArray("rgb").getInt(0) == 200
        && screen.getJSONObject("theme").getJSONArray("rgb").getInt(2) == 30, "Second screen must see the theme");
    check("c5".equals(screen.getString("cycleId")), "Second screen must see the active cycle");
    JSONObject badTheme = request("?action=second-screen-status", "POST",
        "{\"enabled\":true,\"theme\":{\"mode\":\"nope\",\"rgb\":[999,-5,12.6]}}", 200);
    check("auto".equals(badTheme.getJSONObject("theme").getString("mode")), "Unknown theme mode must fall back to auto");
    check(badTheme.getJSONObject("theme").getJSONArray("rgb").getInt(0) == 255
        && badTheme.getJSONObject("theme").getJSONArray("rgb").getInt(1) == 0
        && badTheme.getJSONObject("theme").getJSONArray("rgb").getInt(2) == 13, "Theme channels must clamp");
    JSONObject kept = request("?action=second-screen-status", "POST", "{\"enabled\":true,\"battleRotation\":90}", 200);
    check("auto".equals(kept.getJSONObject("theme").getString("mode"))
        && kept.getJSONObject("theme").getJSONArray("rgb").getInt(0) == 255,
        "A settings update without theme must keep the stored one");
    System.out.println("Android campaign import passed: " + checks + " checks");
  }

  public static void main(String[] args) throws Exception { new CampaignImportHarness().run(); }
}
