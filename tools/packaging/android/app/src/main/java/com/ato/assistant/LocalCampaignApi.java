package com.ato.assistant;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

final class LocalCampaignApi {
  private static final String[] SECTIONS = {"dashboard", "map", "record", "technology", "heroes", "aibp", "story"};
  private static final int BACKUP_COUNT = 10;
  private final SharedPreferences store;
  private final Object lock = new Object();
  private String currentUser;
  private LocalSecondScreenServer secondScreenServer;

  LocalCampaignApi(Context context) {
    store = context.getSharedPreferences("ato-local-store", Context.MODE_PRIVATE);
    currentUser = store.getString("currentUser", "");
  }

  void attachSecondScreenServer(LocalSecondScreenServer server) {
    secondScreenServer = server;
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
    if ("second-screen".equals(action) && "GET".equalsIgnoreCase(method)) return secondScreen();
    if ("me".equals(action)) return me();
    if ("logout".equals(action)) {
      if (secondScreenServer != null) secondScreenServer.stop();
      currentUser = "";
      store.edit().remove("currentUser").apply();
      return ok();
    }
    if ("login".equals(action) || "register".equals(action)) return authenticate(requestBody);

    if (currentUser.isEmpty()) throw new ApiException(401, authRequired());

    if ("second-screen-status".equals(action)) return secondScreenStatus(method, requestBody);
    if ("second-screen-mode".equals(action)) return secondScreenMode(method, requestBody);

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

  private JSONObject secondScreenStatus(String method, String requestBody) throws Exception {
    if (!"GET".equalsIgnoreCase(method) && !"POST".equalsIgnoreCase(method)) {
      throw new ApiException(405, error("Unsupported method."));
    }
    JSONObject settings = loadSecondScreenSettings();
    if ("POST".equalsIgnoreCase(method)) {
      JSONObject payload = requestBody.isEmpty() ? new JSONObject() : new JSONObject(requestBody);
      settings.put("enabled", payload.optBoolean("enabled", false));
      JSONObject scales = settings.getJSONObject("displayScales");
      JSONObject requestedScales = payload.optJSONObject("displayScales");
      if (requestedScales != null) {
        if (requestedScales.has("map")) scales.put("map", clampScale(requestedScales.optInt("map", 100)));
        if (requestedScales.has("battleBoard")) scales.put("battleBoard", clampScale(requestedScales.optInt("battleBoard", 100)));
      } else if (payload.has("displayScale")) {
        scales.put("map", clampScale(payload.optInt("displayScale", 100)));
      }
      if (payload.has("battleRotation")) {
        int rotation = payload.optInt("battleRotation", 0);
        if (validRotation(rotation)) settings.put("battleRotation", rotation);
      }
      if (payload.has("battleSwapped")) settings.put("battleSwapped", payload.optBoolean("battleSwapped"));
      if (payload.has("battleBoardVisible")) settings.put("battleBoardVisible", payload.optBoolean("battleBoardVisible", true));
    }

    boolean enabled = settings.optBoolean("enabled");
    List<String> urls;
    if (enabled) {
      if (secondScreenServer == null) throw new ApiException(500, error("Android second-screen server is unavailable."));
      urls = secondScreenServer.start();
    } else {
      if (secondScreenServer != null) secondScreenServer.stop();
      urls = java.util.Collections.emptyList();
    }
    saveSecondScreenSettings(settings);

    JSONObject response = ok();
    put(response, "enabled", enabled);
    put(response, "displayScales", settings.getJSONObject("displayScales"));
    put(response, "battleRotation", settings.optInt("battleRotation", 0));
    put(response, "battleSwapped", settings.optBoolean("battleSwapped"));
    put(response, "battleBoardVisible", settings.optBoolean("battleBoardVisible", true));
    put(response, "displayMode", settings.optString("displayMode", "map"));
    put(response, "urls", new JSONArray(urls));
    return response;
  }

  private JSONObject secondScreenMode(String method, String requestBody) throws Exception {
    if (!"POST".equalsIgnoreCase(method)) throw new ApiException(405, error("This action requires POST."));
    JSONObject payload = requestBody.isEmpty() ? new JSONObject() : new JSONObject(requestBody);
    String requestedMode = payload.optString("mode").toLowerCase(java.util.Locale.ROOT);
    String mode = "aibp".equals(requestedMode) || "story".equals(requestedMode) ? requestedMode : "map";
    JSONObject settings = loadSecondScreenSettings();
    settings.put("displayMode", mode);
    if ("aibp".equals(mode)) settings.put("battleBoardVisible", true);
    saveSecondScreenSettings(settings);
    JSONObject response = ok();
    put(response, "displayMode", mode);
    return response;
  }

  private JSONObject secondScreen() throws Exception {
    if (currentUser.isEmpty()) throw new ApiException(404, screenUnavailable());
    JSONObject settings = loadSecondScreenSettings();
    if (!settings.optBoolean("enabled")) throw new ApiException(404, screenUnavailable());
    JSONObject campaign = loadCampaign();
    JSONObject sections = campaign.getJSONObject("sections");
    JSONObject dashboard = sections.optJSONObject("dashboard");
    if (dashboard == null) dashboard = new JSONObject();
    JSONObject profiles = dashboard.optJSONObject("profiles");
    String profileId = dashboard.optString("activeProfileId", "");
    JSONObject profile = profiles == null ? null : profiles.optJSONObject(profileId);
    if (profile == null && profiles != null) {
      Iterator<String> profileIds = profiles.keys();
      if (profileIds.hasNext()) {
        profileId = profileIds.next();
        profile = profiles.optJSONObject(profileId);
      }
    }
    if (profile == null) profile = new JSONObject();
    String cycleId = profile.optString("activeCycleId", "c2");
    JSONObject cycles = profile.optJSONObject("cycles");
    JSONObject cycle = cycles == null ? null : cycles.optJSONObject(cycleId);
    JSONObject dashboardState = cycle == null ? null : cycle.optJSONObject("state");
    if (dashboardState == null) dashboardState = new JSONObject();

    JSONObject mapState = userSectionState(sections.opt("map"), profileId);
    JSONObject mapCycles = mapState.optJSONObject("cycles");
    JSONObject mapCycle = mapCycles == null ? null : mapCycles.optJSONObject(cycleId);
    if (mapCycle == null) mapCycle = new JSONObject();
    JSONObject aibpState = userSectionState(sections.opt("aibp"), profileId);
    JSONObject storyState = userSectionState(sections.opt("story"), profileId);
    JSONObject revisions = campaign.getJSONObject("sectionRevisions");

    JSONObject screen = new JSONObject();
    screen.put("profileName", profile.optString("name", "阿尔戈号"));
    screen.put("cycleId", cycleId);
    screen.put("day", dashboardState.has("day") ? dashboardState.opt("day") : 0);
    screen.put("map", mapCycle);
    screen.put("aibp", aibpState);
    screen.put("story", storyState);
    screen.put("displayMode", settings.optString("displayMode", "map"));
    screen.put("mapRevision", revisions.optInt("map", 0));
    screen.put("aibpRevision", revisions.optInt("aibp", 0));
    screen.put("storyRevision", revisions.optInt("story", 0));
    screen.put("dashboardRevision", revisions.optInt("dashboard", 0));
    screen.put("updatedAt", campaign.opt("updatedAt"));
    screen.put("displayScales", settings.getJSONObject("displayScales"));
    screen.put("battleRotation", settings.optInt("battleRotation", 0));
    screen.put("battleSwapped", settings.optBoolean("battleSwapped"));
    screen.put("battleBoardVisible", settings.optBoolean("battleBoardVisible", true));

    JSONObject response = ok();
    response.put("screen", screen);
    return response;
  }

  private JSONObject userSectionState(Object section, String userId) {
    if (!(section instanceof JSONObject)) return new JSONObject();
    JSONObject value = (JSONObject) section;
    JSONObject users = value.optJSONObject("users");
    if (users == null) return value;
    JSONObject userState = users.optJSONObject(userId);
    return userState == null ? new JSONObject() : userState;
  }

  private JSONObject loadSecondScreenSettings() throws JSONException {
    String raw = store.getString(secondScreenKey(), "");
    JSONObject settings = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
    settings.put("enabled", settings.optBoolean("enabled"));
    JSONObject scales = settings.optJSONObject("displayScales");
    if (scales == null) scales = new JSONObject();
    scales.put("map", clampScale(scales.optInt("map", settings.optInt("displayScale", 100))));
    scales.put("battleBoard", clampScale(scales.optInt("battleBoard", 100)));
    settings.put("displayScales", scales);
    int rotation = settings.optInt("battleRotation", 0);
    settings.put("battleRotation", validRotation(rotation) ? rotation : 0);
    settings.put("battleSwapped", settings.optBoolean("battleSwapped"));
    settings.put("battleBoardVisible", !settings.has("battleBoardVisible") || settings.optBoolean("battleBoardVisible"));
    String displayMode = settings.optString("displayMode");
    settings.put("displayMode", "aibp".equals(displayMode) || "story".equals(displayMode) ? displayMode : "map");
    settings.remove("displayScale");
    return settings;
  }

  private void saveSecondScreenSettings(JSONObject settings) {
    store.edit().putString(secondScreenKey(), settings.toString()).apply();
  }

  private String secondScreenKey() {
    return "second-screen::" + currentUser;
  }

  private static int clampScale(int value) {
    return Math.max(60, Math.min(200, value));
  }

  private static boolean validRotation(int value) {
    return value == 0 || value == 90 || value == 180 || value == 270;
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

  private static JSONObject screenUnavailable() {
    JSONObject body = error("Second screen is unavailable.");
    put(body, "code", "SCREEN_NOT_FOUND");
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
