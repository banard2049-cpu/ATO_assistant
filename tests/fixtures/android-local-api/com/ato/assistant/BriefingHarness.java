package com.ato.assistant;

import android.content.Context;
import android.net.Uri;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

public final class BriefingHarness {
  private final Context context = new Context();
  private final LocalCampaignApi api = new LocalCampaignApi(context);
  private int checks;

  private void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
    checks++;
  }

  private JSONObject request(String path, String method, String body, int status) throws Exception {
    JSONObject envelope = new JSONObject(api.handleForJavascript(Uri.parse("file:///android_asset/web/" + path), method, body));
    check(envelope.getInt("status") == status, "HTTP " + status + " expected: " + envelope);
    return new JSONObject(envelope.getString("body"));
  }

  private JSONObject briefing(String query) throws Exception {
    Map<String, ?> before = context.store.getAll();
    int commits = context.store.commits;
    JSONObject result = request("briefing/api.php" + query, "GET", "", 200);
    check(before.equals(context.store.getAll()) && commits == context.store.commits, "Briefing changed save/backups");
    return result;
  }

  private JSONObject dashboard(String day, String profileId, String cycleId) throws Exception {
    JSONObject state = new JSONObject().put("day", day).put("notes", "Day " + day)
      .put("mapSnapshot", new JSONObject().put("exploredIds", new JSONArray().put("T00").put(day))
        .put("currentTileId", "T00").put("savedAt", "2026-10-09T00:00:00Z"))
      .put("unlockedTech", new JSONObject().put("unlockedKeys", new JSONArray().put("Test Tech")))
      .put("cardTracksVersion", 2).put("cardTracks", new JSONObject().put("story", new JSONObject().put("position", "1A").put("progress", 2)));
    JSONObject cycles = new JSONObject().put(cycleId, new JSONObject().put("state", state))
      .put("c2", new JSONObject().put("state", new JSONObject().put("day", "0")));
    return new JSONObject().put("activeProfileId", profileId)
      .put("profiles", new JSONObject().put(profileId, new JSONObject().put("name", "测试船").put("activeCycleId", cycleId).put("cycles", cycles)));
  }

  private void day(String day, String profileId, String cycleId) throws Exception {
    request("api/campaign-state.php?section=dashboard", "POST", new JSONObject().put("state", dashboard(day, profileId, cycleId)).toString(), 200);
  }

  private String snapshotDay(JSONObject snapshot, String profileId, String cycleId) throws Exception {
    return snapshot.getJSONObject("sections").getJSONObject("dashboard").getJSONObject("profiles")
      .getJSONObject(profileId).getJSONObject("cycles").getJSONObject(cycleId).getJSONObject("state").getString("day");
  }

  private void run(String destination) throws Exception {
    check("AUTH_REQUIRED".equals(request("briefing/api.php", "GET", "", 401).getString("code")), "Missing auth guard");
    request("api/campaign-state.php?action=login", "POST", "{\"username\":\"local\"}", 200);
    request("briefing/api.php", "POST", "{}", 405);
    check(briefing("").getJSONArray("snapshots").length() == 0, "Fresh account has fabricated history");
    day("T6/00", "ship::one", "c1");
    request("api/campaign-state.php?section=heroes", "POST", "{\"userId\":\"ship::one\",\"state\":{\"heroes\":[{\"argonaut\":\"赫拉克勒斯\"}]}}", 200);
    request("api/campaign-state.php?section=story", "POST", "{\"userId\":\"ship::one\",\"state\":{\"section\":\"1\",\"title\":\"序章\"}}", 200);
    day("2", "ship::one", "c1");
    day("4", "ship::one", "c1");
    JSONObject source = briefing("");
    check("android-daily-backups".equals(source.getString("source")), "Missing source discriminator");
    check(source.getJSONArray("snapshots").length() == 2, "Daily archives missing or duplicate day");
    check(source.getJSONArray("snapshots").toString().contains("赫拉克勒斯"), "Profile heroes missing");
    check(source.getJSONArray("snapshots").toString().contains("序章"), "Profile story missing");
    check(briefing("?cycle=c2").getJSONArray("snapshots").length() == 0, "Other cycle leaked history");
    check("c1".equals(briefing("?cycle=invalid&profile=invalid").getString("cycleId")), "Invalid selection did not fall back");

    String key = "campaign::local::daily::" + Uri.encode("ship::one") + "::c1::2::";
    JSONObject best = null;
    for (Map.Entry<String, ?> entry : context.store.getAll().entrySet()) if (entry.getKey().startsWith(key)) best = new JSONObject((String) entry.getValue());
    check(best != null, "Actual write did not create daily archive");
    best.getJSONObject("sectionRevisions").put("dashboard", 99);
    best.getJSONObject("sections").getJSONObject("dashboard").getJSONObject("profiles").getJSONObject("ship::one")
      .getJSONObject("cycles").getJSONObject("c1").getJSONObject("state").put("notes", "newest revision");
    context.store.edit().putString(key + "000-best", best.toString()).putString(key + "zzz-corrupt", "invalid json").apply();
    source = briefing("");
    check(source.getJSONArray("snapshots").length() == 2, "Corrupt backup disrupted briefing");
    check(source.getJSONArray("snapshots").toString().contains("newest revision"), "Did not choose highest revision");
    best.getJSONObject("sections").getJSONObject("dashboard").getJSONObject("profiles").getJSONObject("ship::one")
      .getJSONObject("cycles").getJSONObject("c1").getJSONObject("state").put("notes", "latest tied revision");
    context.store.edit().putString(key + "001-best", best.toString()).apply();
    source = briefing("");
    check(source.getJSONArray("snapshots").toString().contains("latest tied revision"), "Tied revisions must choose newest archive key");
    for (int i = 0; i < source.getJSONArray("snapshots").length(); i++) {
      check(!"4".equals(snapshotDay(source.getJSONArray("snapshots").getJSONObject(i), "ship::one", "c1")), "Current save fabricated a historical day");
    }
    Files.write(Paths.get(destination), source.toString().getBytes(StandardCharsets.UTF_8));
    request("api/campaign-state.php?action=login", "POST", "{\"username\":\"other\"}", 200);
    day("1", "ship::one", "c1");
    check(briefing("").getJSONArray("snapshots").length() == 0, "Another account read local account history");
    request("api/campaign-state.php?action=login", "POST", "{\"username\":\"local\"}", 200);
    day("5", "second-ship", "c1");
    check(briefing("").getJSONArray("snapshots").length() == 0, "Another profile read original profile history");
    JSONObject reopened = new JSONObject(new LocalCampaignApi(context).handleForJavascript(Uri.parse("http://localhost/briefing/api.php"), "GET", ""));
    check(reopened.getInt("status") == 200, "Reopened API cannot read briefing");
    paginationAndProjection();
    System.out.println("Android briefing passed: " + checks + " checks");
  }

  private void paginationAndProjection() throws Exception {
    request("api/campaign-state.php?action=login", "POST", "{\"username\":\"paging\"}", 200);
    for (int day = 1; day <= 11; day++) day(String.valueOf(day), "ship", "c1");
    JSONObject first = briefing("");
    check(first.getJSONArray("snapshots").length() == 4 && "4".equals(first.getString("nextCursor")), "First page was not bounded to four days");
    JSONObject second = briefing("?cursor=4&profile=ship&cycle=c1");
    check(second.getJSONArray("snapshots").length() == 4 && "8".equals(second.getString("nextCursor")), "Second page missing");
    JSONObject last = briefing("?cursor=8&profile=ship&cycle=c1");
    check(last.getJSONArray("snapshots").length() == 2 && last.isNull("nextCursor"), "Last page did not terminate");
    java.util.Set<String> seen = new java.util.HashSet<>();
    for (JSONObject page : new JSONObject[] {first, second, last}) {
      JSONArray entries = page.getJSONArray("snapshots");
      for (int i = 0; i < entries.length(); i++) check(seen.add(snapshotDay(entries.getJSONObject(i), "ship", "c1")), "Pagination repeated a day");
    }
    check(seen.size() == 10 && !seen.contains("11"), "Pagination omitted a daily archive or fabricated today");
    request("briefing/api.php?cursor=-1", "GET", "", 400);
    request("briefing/api.php?cursor=invalid", "GET", "", 400);
    request("briefing/api.php?cursor=2147483647", "GET", "", 400);

    JSONObject campaign = new JSONObject(context.store.getString("campaign::paging", ""));
    JSONObject currentState = campaign.getJSONObject("sections").getJSONObject("dashboard").getJSONObject("profiles")
      .getJSONObject("ship").getJSONObject("cycles").getJSONObject("c1").getJSONObject("state");
    currentState.put("notes", "TODAYS PRIVATE NOTES").put("history", "UNUSED CURRENT HISTORY");
    context.store.edit().putString("campaign::paging", campaign.toString()).apply();
    String target = "campaign::paging::daily::ship::c1::1::";
    String originalKey = null;
    for (String key : context.store.getAll().keySet()) if (key.startsWith(target)) originalKey = key;
    JSONObject archive = new JSONObject(context.store.getString(originalKey, ""));
    JSONObject sections = archive.getJSONObject("sections");
    JSONObject state = sections.getJSONObject("dashboard").getJSONObject("profiles").getJSONObject("ship")
      .getJSONObject("cycles").getJSONObject("c1").getJSONObject("state");
    state.put("history", "UNUSED DASHBOARD HISTORY").put("dateNotes", new JSONObject().put("day:1", "preserved keyed note"))
      .put("cardCounters", new JSONObject().put("storyCount", 3).put("ignored", "UNUSED COUNTER DATA"))
      .put("surveyConstants", new JSONObject().put("hubs", new JSONObject().put("hub1", new JSONObject().put("box1", true)))
        .put("activeHub", new JSONObject().put("itemId", "hub1").put("boxId", "box1").put("ignored", "UNUSED HUB DATA")))
      .put("exploration", new JSONObject().put("drawStateByCycle", new JSONObject().put("c1", new JSONObject().put("history", new JSONArray()
        .put(new JSONObject().put("day", "1").put("name", "preserved draw").put("ignored", "UNUSED DRAW DATA"))
        .put(new JSONObject().put("day", "0").put("name", "PAST DRAW"))))));
    state.getJSONObject("mapSnapshot").put("tileNotes", new JSONArray().put(new JSONObject().put("tileId", "T00").put("note", "preserved tile note").put("image", "UNUSED MAP IMAGE")));
    sections.put("heroes", new JSONObject().put("users", new JSONObject().put("ship", new JSONObject().put("heroes", new JSONArray()
      .put(new JSONObject().put("customName", "preserved hero").put("equipment", "UNUSED HERO DATA"))))));
    sections.put("story", new JSONObject().put("users", new JSONObject().put("ship", new JSONObject().put("section", "7").put("title", "preserved story").put("body", "UNUSED STORY BODY"))));
    sections.put("record", new JSONObject().put("inventory", "UNUSED INVENTORY"));
    context.store.edit().putString(originalKey, archive.toString()).apply();
    String projected = briefing("").toString();
    for (String required : new String[] {"preserved keyed note", "preserved draw", "preserved tile note", "preserved hero", "preserved story", "box1", "storyCount"})
      check(projected.contains(required), "Projection lost " + required);
    check(!projected.contains("UNUSED") && !projected.contains("TODAYS PRIVATE NOTES") && !projected.contains("PAST DRAW"), "Projection leaked unrelated/current campaign data");

    // A structurally incomplete highest revision must not suppress the valid day.
    JSONObject broken = new JSONObject(archive.toString());
    broken.getJSONObject("sectionRevisions").put("dashboard", 9999);
    broken.getJSONObject("sections").getJSONObject("dashboard").getJSONObject("profiles").getJSONObject("ship")
      .getJSONObject("cycles").getJSONObject("c1").put("state", new JSONObject().put("day", "2"));
    context.store.edit().putString(target + "zzz-mismatched-day", broken.toString()).apply();
    check(briefing("").toString().contains("preserved keyed note"), "Mismatched-day archive hid valid history");

    int commits = context.store.commits;
    context.store.failNextGetAll = new OutOfMemoryError("Simulated archive pressure");
    JSONObject memoryError = request("briefing/api.php", "GET", "", 503);
    check("LOCAL_MEMORY_LIMIT".equals(memoryError.getString("code")) && !memoryError.getBoolean("ok"), "Memory fallback was not valid JSON");
    context.store.failNextGetAll = new StackOverflowError("Simulated malformed archive");
    JSONObject structureError = request("briefing/api.php", "GET", "", 422);
    check("INVALID_LOCAL_ARCHIVE".equals(structureError.getString("code")) && !structureError.getBoolean("ok"), "Structure fallback was not valid JSON");
    check(briefing("").getJSONArray("snapshots").length() == 4 && commits == context.store.commits, "Bridge did not recover without save writes");
  }

  public static void main(String[] args) throws Exception { new BriefingHarness().run(args[0]); }
}
