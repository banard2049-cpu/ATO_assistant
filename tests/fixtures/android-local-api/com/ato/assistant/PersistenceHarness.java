package com.ato.assistant;

import android.content.Context;
import android.net.Uri;
import org.json.JSONObject;

public final class PersistenceHarness {
  private final Context context = new Context();
  private LocalCampaignApi api = new LocalCampaignApi(context);
  private int checks;
  private void check(boolean value, String message) {
    checks++;
    if (!value) throw new AssertionError(message);
  }
  private JSONObject call(String query, String method, String body, int expected) throws Exception {
    JSONObject result = new JSONObject(api.handleForJavascript(Uri.parse("file:///android_asset/web/api/campaign-state.php" + query), method, body));
    check(result.getInt("status") == expected, result.toString());
    return new JSONObject(result.getString("body"));
  }
  private void restart() { context.store.crash(); api = new LocalCampaignApi(context); }
  private void run() throws Exception {
    call("?action=login", "POST", "{\"username\":\"alpha\"}", 200);
    call("?section=dashboard", "POST", "{\"state\":{\"activeProfileId\":\"ship\",\"profiles\":{\"ship\":{\"activeCycleId\":\"c1\",\"cycles\":{\"c1\":{\"state\":{\"day\":\"1\"}}}}}}}", 200);
    call("?section=heroes", "POST", "{\"state\":{\"notes\":\"day one\"}}", 200);
    call("?section=dashboard", "POST", "{\"state\":{\"activeProfileId\":\"ship\",\"profiles\":{\"ship\":{\"activeCycleId\":\"c1\",\"cycles\":{\"c1\":{\"state\":{\"day\":\"2\"}}}}}}}", 200);
    for (int index = 0; index < 40; index++) {
      call("?section=record", "POST", "{\"state\":{\"index\":" + index + "}}", 200);
    }
    String saved = call("", "GET", "", 200).getJSONObject("campaign").toString();
    restart();
    check(saved.equals(call("", "GET", "", 200).getJSONObject("campaign").toString()), "Acknowledged save lost at process stop");
    JSONObject source = new JSONObject(api.handleForJavascript(Uri.parse("file:///android_asset/web/briefing/api.php"), "GET", ""));
    check(source.getInt("status") == 200 && new JSONObject(source.getString("body")).getJSONArray("snapshots").length() == 2,
        "Daily archives were not durable");
    context.store.failNextCommit = true;
    call("?section=record", "POST", "{\"state\":{\"index\":99}}", 500);
    restart();
    check(saved.equals(call("", "GET", "", 200).getJSONObject("campaign").toString()), "Failed write corrupted durable save");
    context.store.failNextCommit = true;
    call("?action=login", "POST", "{\"username\":\"bravo\"}", 500);
    check("alpha".equals(call("?action=me", "GET", "", 200).getJSONObject("user").getString("id")), "Failed login changed active account");
    restart();
    context.store.failNextCommit = true;
    call("?action=logout", "POST", "", 500);
    check(call("?action=me", "GET", "", 200).getBoolean("authenticated"), "Failed logout changed session");
    restart();
    call("?action=logout", "POST", "", 200);
    restart();
    check(!call("?action=me", "GET", "", 200).getBoolean("authenticated"), "Logout was not durable");
    System.out.println("Android persistence passed: " + checks + " checks");
  }
  public static void main(String[] args) throws Exception { new PersistenceHarness().run(); }
}
