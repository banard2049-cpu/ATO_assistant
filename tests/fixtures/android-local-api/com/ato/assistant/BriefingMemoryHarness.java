package com.ato.assistant;

import android.content.Context;
import android.net.Uri;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Real API regression: reading large archives must fit a small Android-like heap. */
public final class BriefingMemoryHarness {
  private static final int DAYS = 80;
  private static final int PADDING_BYTES = 384 * 1024;
  private final Context context = new Context();

  private static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }

  private static String campaign(int day, String padding) {
    return "{\"sections\":{\"dashboard\":{\"activeProfileId\":\"ship\",\"profiles\":{\"ship\":{"
      + "\"name\":\"Memory test\",\"activeCycleId\":\"c1\",\"cycles\":{\"c1\":{\"state\":{"
      + "\"day\":\"" + day + "\",\"notes\":\"Day " + day + "\","
      + "\"mapSnapshot\":{\"exploredIds\":[\"T00\"],\"currentTileId\":\"T00\"},"
      + "\"unlockedTech\":{\"unlockedKeys\":[\"test tech\"]}}}}}}},"
      + "\"heroes\":{\"heroes\":[{\"argonaut\":\"Test hero\"}]},"
      + "\"story\":{\"section\":\"" + day + "\",\"title\":\"History\"},"
      + "\"record\":{\"unusedPayload\":\"" + padding + "\"}},\"sectionRevisions\":{\"dashboard\":1}}";
  }

  private void run(boolean legacyProbe) throws Exception {
    context.store.edit().putString("currentUser", "memory")
      .putString("campaign::memory", campaign(DAYS, "")).commit();
    // Reopen after setting currentUser, as on an actual process restart.
    LocalCampaignApi loggedIn = new LocalCampaignApi(context);
    String padding = "x".repeat(PADDING_BYTES);
    for (int day = 0; day < DAYS; day++) {
      context.store.edit().putString("campaign::memory::daily::ship::c1::" + day + "::archive",
        campaign(day, padding)).commit();
    }
    padding = null;
    Map<String, ?> before = context.store.getAll();
    int commits = context.store.commits;
    Set<String> seen = new HashSet<>();
    String cursor = null;
    int pages = 0;
    do {
      String query = cursor == null ? "" : "?cursor=" + Uri.encode(cursor);
      JSONObject envelope = new JSONObject(loggedIn.handleForJavascript(
        Uri.parse("file:///android_asset/web/briefing/api.php" + query), "GET", ""));
      check(envelope.getInt("status") == 200, "Briefing request failed");
      String body = envelope.getString("body");
      JSONObject source = new JSONObject(body);
      JSONArray snapshots = source.getJSONArray("snapshots");
      if (!legacyProbe) {
        check(snapshots.length() <= 4, "Response retained more than one page of archives");
        check(body.length() < 128 * 1024, "Unrelated archive payload leaked into response");
      }
      for (int i = 0; i < snapshots.length(); i++) {
        JSONObject sections = snapshots.getJSONObject(i).getJSONObject("sections");
        String day = sections.getJSONObject("dashboard").getJSONObject("profiles").getJSONObject("ship")
          .getJSONObject("cycles").getJSONObject("c1").getJSONObject("state").getString("day");
        check(seen.add(day), "Archive repeated across pages");
        check(!sections.has("record"), "Unrelated record section retained");
      }
      cursor = source.isNull("nextCursor") ? null : source.optString("nextCursor", null);
      pages++;
      check(pages <= DAYS, "Cursor did not advance");
    } while (cursor != null);
    check(seen.size() == DAYS, "Archives missing from briefing");
    check(before.equals(context.store.getAll()) && commits == context.store.commits,
      "Reading briefing changed stored campaign or daily archives");
    System.out.println("Android briefing memory passed: " + DAYS + " archives, " + pages
      + " pages, " + (DAYS * PADDING_BYTES / 1024 / 1024) + " MiB unrelated payload");
  }

  public static void main(String[] args) throws Exception {
    new BriefingMemoryHarness().run(args.length > 0 && "legacy-probe".equals(args[0]));
  }
}
