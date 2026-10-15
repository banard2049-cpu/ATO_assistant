package com.ato.assistant;

import android.content.Context;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;

public final class CampaignNotesHarness {
  private final Context context = new Context();
  private final LocalCampaignApi api = new LocalCampaignApi(context);
  private JSONObject call(String query, String method, JSONObject payload, int expected) throws Exception {
    JSONObject result = new JSONObject(api.handleForJavascript(Uri.parse("http://local/api/campaign-state.php" + query), method,
        payload == null ? "" : payload.toString()));
    if (result.getInt("status") != expected) throw new AssertionError(result.toString());
    return new JSONObject(result.getString("body"));
  }
  private JSONObject campaign() throws Exception { return call("", "GET", null, 200).getJSONObject("campaign"); }
  private JSONObject event(String cycle, String message) throws Exception {
    return new JSONObject().put("cycleId", cycle).put("source", "记录表").put("text", message);
  }
  private void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  private void run() throws Exception {
    call("?action=login", "POST", new JSONObject().put("username", "alpha"), 200);
    call("", "POST", new JSONObject().put("section", "dashboard").put("state", new JSONObject(
        "{\"activeProfileId\":\"B\",\"profiles\":{\"A\":{\"activeCycleId\":\"c2\",\"cycles\":{\"c2\":{\"state\":{\"day\":7,\"notes\":\"手写内容\"}}}},\"B\":{\"activeCycleId\":\"c1\",\"cycles\":{}}}}")), 200);
    JSONObject before = campaign();
    JSONObject payload = new JSONObject().put("section", "record").put("userId", "A")
        .put("state", new JSONObject().put("resources", new JSONObject().put("trireme", 2)))
        .put("expectedRevision", before.getJSONObject("sectionRevisions").getInt("record")).put("expectedAccountId", "alpha")
        .put("campaignNotes", new JSONObject().put("profileId", "A").put("entries", new JSONArray().put(event("c2", "船材 1 → 2"))));
    call("", "POST", payload, 200);
    JSONObject after = campaign();
    String notes = after.getJSONObject("sections").getJSONObject("dashboard").getJSONObject("profiles").getJSONObject("A")
        .getJSONObject("cycles").getJSONObject("c2").getJSONObject("state").getString("notes");
    check(notes.startsWith("手写内容\n["), "Existing notes lost");
    check(notes.contains("C2 第7天 · 记录表] 船材 1 → 2"), "Missing campaign context");
    check(after.getJSONObject("sectionRevisions").getInt("dashboard") == before.getJSONObject("sectionRevisions").getInt("dashboard") + 1,
        "Dashboard revision was not incremented");
    call("", "POST", payload, 409);
    check(after.toString().equals(campaign().toString()), "Conflict duplicated notes");
    payload.put("expectedRevision", after.getJSONObject("sectionRevisions").getInt("record"));
    payload.getJSONObject("campaignNotes").getJSONArray("entries").put(event("wrong", "invalid"));
    call("", "POST", payload, 400);
    check(after.toString().equals(campaign().toString()), "Invalid entry partially committed");
    payload.getJSONObject("campaignNotes").put("entries", new JSONArray().put(event("c1", "回忆突破")));
    context.store.failNextCommit = true;
    call("", "POST", payload, 500);
    context.store.crash();
    check(after.toString().equals(campaign().toString()), "Storage failure partially committed notes");
    call("?action=login", "POST", new JSONObject().put("username", "bravo"), 200);
    call("", "POST", payload, 409);
    System.out.println("Android campaign notes passed: atomic commit, context, conflict, validation, failure and account isolation.");
  }
  public static void main(String[] args) throws Exception { new CampaignNotesHarness().run(); }
}
