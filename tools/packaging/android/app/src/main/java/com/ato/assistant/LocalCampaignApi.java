package com.ato.assistant;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.UUID;

final class LocalCampaignApi {
  private static final String[] SECTIONS = {"dashboard", "map", "record", "technology", "heroes"};
  private static final int BACKUP_COUNT = 10;
  private final SharedPreferences store;
  private final Object lock = new Object();
  private String currentUser;

  LocalCampaignApi(Context context) {
    store = context.getSharedPreferences("ato-local-store", Context.MODE_PRIVATE);
    currentUser = store.getString("currentUser", "");
  }

  String handleForJavascript(Uri uri, String method, String requestBody) {
    synchronized (lock) {
      int status = 200;
      JSONObject response;
      try {
        response = dispatch(uri, method, requestBody == null ? "" : requestBody);
      } catch (ApiException error) {
        status = error.status;
        response = error.body;
      } catch (Exception error) {
        status = 500;
        response = new JSONObject();
        put(response, "ok", false);
        put(response, "error", error.getMessage() == null ? "Local save failed." : error.getMessage());
      }
      JSONObject result = new JSONObject();
      put(result, "status", status);
      put(result, "body", response.toString());
      return result.toString();
    }
  }

  private JSONObject dispatch(Uri uri, String method, String requestBody) throws Exception {
    String path = uri.getPath() == null ? "" : uri.getPath();
    if (!path.endsWith("/api/campaign-state.php")) throw new ApiException(404, error("Unknown local endpoint."));

    String action = uri.getQueryParameter("action");
    if ("me".equals(action)) return me();
    if ("logout".equals(action)) {
      currentUser = "";
      store.edit().remove("currentUser").apply();
      return ok();
    }
    if ("login".equals(action) || "register".equals(action)) return authenticate(requestBody);

    if (currentUser.isEmpty()) throw new ApiException(401, authRequired());

    String section = uri.getQueryParameter("section");
    if ("GET".equalsIgnoreCase(method)) return read(section);
    if ("POST".equalsIgnoreCase(method)) return write(section, requestBody);
    throw new ApiException(405, error("Unsupported method."));
  }

  private JSONObject authenticate(String requestBody) throws Exception {
    JSONObject payload = requestBody.isEmpty() ? new JSONObject() : new JSONObject(requestBody);
    String username = payload.optString("username", "local").trim().toLowerCase();
    if (!username.matches("[a-z0-9][a-z0-9_-]{2,31}")) username = "local";
    currentUser = username;
    store.edit().putString("currentUser", currentUser).apply();
    JSONObject response = ok();
    put(response, "user", user());
    return response;
  }

  private JSONObject me() throws JSONException {
    JSONObject response = ok();
    put(response, "authenticated", !currentUser.isEmpty());
    put(response, "user", currentUser.isEmpty() ? JSONObject.NULL : user());
    return response;
  }

  private JSONObject read(String section) throws Exception {
    JSONObject campaign = loadCampaign();
    if (section == null || section.isEmpty()) {
      JSONObject response = ok();
      put(response, "exists", store.contains(campaignKey()));
      put(response, "campaign", campaign);
      put(response, "user", user());
      return response;
    }
    validateSection(section);
    JSONObject sections = campaign.getJSONObject("sections");
    JSONObject revisions = campaign.getJSONObject("sectionRevisions");
    Object state = sections.opt(section);
    JSONObject response = ok();
    put(response, "exists", state != null && state != JSONObject.NULL);
    put(response, "section", section);
    put(response, "state", state == null ? JSONObject.NULL : state);
    put(response, "revision", revisions.optInt(section, 0));
    put(response, "updatedAt", campaign.opt("updatedAt"));
    put(response, "user", user());
    return response;
  }

  private JSONObject write(String querySection, String requestBody) throws Exception {
    JSONObject payload = new JSONObject(requestBody);
    String section = payload.optString("section", querySection == null ? "" : querySection);
    validateSection(section);
    if (!payload.has("state")) throw new ApiException(400, error("Missing state."));

    JSONObject campaign = loadCampaign();
    JSONObject revisions = campaign.getJSONObject("sectionRevisions");
    int revision = revisions.optInt(section, 0);
    if (payload.has("expectedRevision") && payload.optInt("expectedRevision", -1) != revision) {
      JSONObject conflict = error("This section was changed in another page.");
      put(conflict, "code", "SAVE_CONFLICT");
      put(conflict, "section", section);
      put(conflict, "revision", revision);
      throw new ApiException(409, conflict);
    }

    Object state = payload.opt("state");
    JSONObject sections = campaign.getJSONObject("sections");
    String userId = payload.optString("userId", "").trim();
    if (!userId.isEmpty() && !"dashboard".equals(section)) {
      Object current = sections.opt(section);
      JSONObject bucket = current instanceof JSONObject ? (JSONObject) current : new JSONObject();
      JSONObject users = bucket.optJSONObject("users");
      JSONObject accounts = bucket.optJSONObject("accounts");
      boolean alreadyBucketed = users != null || accounts != null;
      if (users == null) users = new JSONObject();
      if (accounts != null) {
        Iterator<String> accountKeys = accounts.keys();
        while (accountKeys.hasNext()) {
          String key = accountKeys.next();
          if (!users.has(key)) users.put(key, accounts.opt(key));
        }
      }
      if (!alreadyBucketed && current != null && current != JSONObject.NULL) users.put(userId, current);
      users.put(userId, state == null ? JSONObject.NULL : state);
      bucket.put("users", users);
      bucket.remove("accounts");
      sections.put(section, bucket);
    } else {
      sections.put(section, state == null ? JSONObject.NULL : state);
    }
    revisions.put(section, revision + 1);
    campaign.put("updatedAt", System.currentTimeMillis());
    saveCampaign(campaign);

    JSONObject response = ok();
    put(response, "section", section);
    put(response, "revision", revision + 1);
    put(response, "updatedAt", campaign.opt("updatedAt"));
    put(response, "user", user());
    return response;
  }

  private JSONObject loadCampaign() throws JSONException {
    String raw = store.getString(campaignKey(), "");
    if (!raw.isEmpty()) return normalizeCampaign(new JSONObject(raw));
    return normalizeCampaign(new JSONObject());
  }

  private String campaignKey() {
    return "campaign::" + currentUser;
  }

  private void saveCampaign(JSONObject campaign) {
    String key = campaignKey();
    String currentRaw = store.getString(key, "");
    String currentDay = gameDayKey(currentRaw);
    String nextDay = gameDayKey(campaign);
    String markerKey = key + "::backup-current-day";
    String archiveMarkerKey = key + "::backup-current-archive";
    boolean markerMatches = currentDay.equals(store.getString(markerKey, ""));
    String archiveId = markerMatches
      ? store.getString(archiveMarkerKey, "")
      : "";
    SharedPreferences.Editor editor = store.edit();

    if (!currentRaw.isEmpty()) {
      if (!markerMatches) clearRecentBackups(editor, key);
      if (!"unknown".equals(currentDay)) {
        if (archiveId.isEmpty()) archiveId = System.currentTimeMillis() + "-" + UUID.randomUUID().toString();
        editor.putString(key + "::daily::" + currentDay + "::" + archiveId, currentRaw);
      }

      if (currentDay.equals(nextDay)) {
        if (markerMatches) {
          for (int index = BACKUP_COUNT; index >= 2; index--) {
            String previous = key + "::backup::" + (index - 1);
            String next = key + "::backup::" + index;
            if (store.contains(previous)) editor.putString(next, store.getString(previous, ""));
            else editor.remove(next);
          }
        }
        editor.putString(key + "::backup::1", currentRaw);
      } else {
        clearRecentBackups(editor, key);
      }
    }
    editor.putString(markerKey, nextDay);
    if (currentDay.equals(nextDay) && !archiveId.isEmpty()) editor.putString(archiveMarkerKey, archiveId);
    else editor.remove(archiveMarkerKey);
    editor.putString(key, campaign.toString()).apply();
  }

  private void clearRecentBackups(SharedPreferences.Editor editor, String key) {
    for (int index = 1; index <= BACKUP_COUNT; index++) {
      editor.remove(key + "::backup::" + index);
    }
  }

  private String gameDayKey(String raw) {
    if (raw.isEmpty()) return "unknown";
    try {
      return gameDayKey(new JSONObject(raw));
    } catch (JSONException ignored) {
      return "unknown";
    }
  }

  private String gameDayKey(JSONObject campaign) {
    JSONObject sections = campaign.optJSONObject("sections");
    JSONObject dashboard = sections == null ? null : sections.optJSONObject("dashboard");
    JSONObject profiles = dashboard == null ? null : dashboard.optJSONObject("profiles");
    String profileId = dashboard == null ? "default" : dashboard.optString("activeProfileId", "default");
    JSONObject profile = profiles == null ? null : profiles.optJSONObject(profileId);
    if (profile == null && profiles != null) {
      Iterator<String> profileIds = profiles.keys();
      if (profileIds.hasNext()) {
        profileId = profileIds.next();
        profile = profiles.optJSONObject(profileId);
      }
    }
    String cycleId = profile == null ? "unknown" : profile.optString("activeCycleId", "unknown");
    JSONObject cycles = profile == null ? null : profile.optJSONObject("cycles");
    JSONObject cycle = cycles == null ? null : cycles.optJSONObject(cycleId);
    JSONObject state = cycle == null ? null : cycle.optJSONObject("state");
    Object dayValue = state == null ? null : state.opt("day");
    if (profile == null || cycle == null || dayValue == null || dayValue == JSONObject.NULL) return "unknown";
    String day = String.valueOf(dayValue);
    return Uri.encode(profileId) + "::" + Uri.encode(cycleId) + "::" + Uri.encode(day);
  }

  private JSONObject normalizeCampaign(JSONObject campaign) throws JSONException {
    if (!campaign.has("version")) campaign.put("version", 1);
    if (!campaign.has("updatedAt")) campaign.put("updatedAt", JSONObject.NULL);
    JSONObject sections = campaign.optJSONObject("sections");
    JSONObject revisions = campaign.optJSONObject("sectionRevisions");
    if (sections == null) sections = new JSONObject();
    if (revisions == null) revisions = new JSONObject();
    for (String section : SECTIONS) {
      if (!sections.has(section)) sections.put(section, JSONObject.NULL);
      if (!revisions.has(section)) revisions.put(section, 0);
    }
    campaign.put("sections", sections);
    campaign.put("sectionRevisions", revisions);
    return campaign;
  }

  private void validateSection(String section) throws ApiException {
    for (String candidate : SECTIONS) if (candidate.equals(section)) return;
    throw new ApiException(400, error("Unknown section."));
  }

  private JSONObject user() throws JSONException {
    JSONObject user = new JSONObject();
    put(user, "id", currentUser);
    put(user, "username", currentUser);
    put(user, "createdAt", JSONObject.NULL);
    return user;
  }

  private static JSONObject ok() throws JSONException {
    JSONObject body = new JSONObject();
    put(body, "ok", true);
    return body;
  }

  private static JSONObject error(String message) {
    JSONObject body = new JSONObject();
    put(body, "ok", false);
    put(body, "error", message);
    return body;
  }

  private static JSONObject authRequired() {
    JSONObject body = error("Please log in first.");
    put(body, "code", "AUTH_REQUIRED");
    return body;
  }

  private static void put(JSONObject target, String key, Object value) {
    try { target.put(key, value); } catch (JSONException ignored) {}
  }

  private static final class ApiException extends Exception {
    final int status;
    final JSONObject body;
    ApiException(int status, JSONObject body) { this.status = status; this.body = body; }
  }
}
