package com.ato.assistant;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

final class LocalCampaignApi {
  private static final String[] SECTIONS = {"dashboard", "map", "record", "technology", "heroes", "aibp", "story"};
  private static final int BACKUP_COUNT = 10;
  private final SharedPreferences store;
  private final java.io.File attachmentRoot;
  private final Object lock = new Object();
  private String currentUser;
  private LocalSecondScreenServer secondScreenServer;
  private java.util.concurrent.Callable<JSONObject> imageIndex;

  LocalCampaignApi(Context context) {
    store = context.getSharedPreferences("ato-local-store", Context.MODE_PRIVATE);
    attachmentRoot = new java.io.File(context.getFilesDir(), "record-attachments");
    currentUser = store.getString("currentUser", "");
  }

  void attachSecondScreenServer(LocalSecondScreenServer server) {
    secondScreenServer = server;
  }

  void attachImageIndex(java.util.concurrent.Callable<JSONObject> provider) {
    imageIndex = provider;
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
    if (path.endsWith("/api/aibp-image-index.php")) {
      if (!"GET".equalsIgnoreCase(method)) throw new ApiException(405, error("This endpoint requires GET."));
      if (imageIndex == null) throw new ApiException(503, error("Image index unavailable."));
      return imageIndex.call();
    }
    if (path.endsWith("/briefing/api.php")) {
      if (!"GET".equalsIgnoreCase(method)) throw new ApiException(405, error("This endpoint requires GET."));
      if (currentUser.isEmpty()) throw new ApiException(401, authRequired());
      return briefingSource(uri);
    }
    if (!path.endsWith("/api/campaign-state.php")) throw new ApiException(404, error("Unknown local endpoint."));

    String action = uri.getQueryParameter("action");
    if ("second-screen".equals(action) && "GET".equalsIgnoreCase(method)) return secondScreen();
    if ("me".equals(action)) return me();
    if ("logout".equals(action)) {
      if (!"POST".equalsIgnoreCase(method)) throw new ApiException(405, error("This action requires POST."));
      if (secondScreenServer != null) secondScreenServer.stop();
      commitPreferences(store.edit().remove("currentUser"));
      currentUser = "";
      return ok();
    }
    if ("login".equals(action) || "register".equals(action)) {
      if (!"POST".equalsIgnoreCase(method)) throw new ApiException(405, error("This action requires POST."));
      return authenticate(requestBody);
    }

    if (currentUser.isEmpty()) throw new ApiException(401, authRequired());

    if ("record-attachment".equals(action)) return recordAttachment(uri, method, requestBody);
    if ("second-screen-status".equals(action)) return secondScreenStatus(method, requestBody);
    if ("second-screen-mode".equals(action)) return secondScreenMode(method, requestBody);
    if ("restore-previous-day".equals(action)) return restorePreviousDay(method, requestBody);
    if ("import-sections".equals(action)) return importSections(method, requestBody);

    String section = uri.getQueryParameter("section");
    if ("GET".equalsIgnoreCase(method)) return read(section);
    if ("POST".equalsIgnoreCase(method)) return write(section, requestBody);
    throw new ApiException(405, error("Unsupported method."));
  }

  private JSONObject authenticate(String requestBody) throws Exception {
    JSONObject payload = requestBody.isEmpty() ? new JSONObject() : new JSONObject(requestBody);
    String username = payload.optString("username", "local").trim().toLowerCase();
    if (!username.matches("[a-z0-9][a-z0-9_-]{2,31}")) username = "local";
    commitPreferences(store.edit().putString("currentUser", username));
    currentUser = username;
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
      if (payload.has("theme")) settings.put("theme", normalizeTheme(payload.optJSONObject("theme")));
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
    put(response, "theme", normalizeTheme(settings.optJSONObject("theme")));
    put(response, "displayMode", settings.optString("displayMode", "map"));
    put(response, "urls", new JSONArray(urls));
    // 安卓的局域网入口和这台手机共用同一个登录态（能读也能写，登录/退出只在本机做）：
    // 主控台用它决定局域网那一行提示怎么写。
    put(response, "lanSharedAccount", true);
    return response;
  }

  private JSONObject secondScreenMode(String method, String requestBody) throws Exception {
    if (!"POST".equalsIgnoreCase(method)) throw new ApiException(405, error("This action requires POST."));
    JSONObject payload = requestBody.isEmpty() ? new JSONObject() : new JSONObject(requestBody);
    String requestedMode = payload.optString("mode").toLowerCase(java.util.Locale.ROOT);
    String mode = "aibp".equals(requestedMode) || "story".equals(requestedMode) || "blank".equals(requestedMode) ? requestedMode : "map";
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
    JSONObject mapDisplay = new JSONObject();
    mapDisplay.put("showBack", mapState.optBoolean("showBack", false));
    mapDisplay.put("onlyExplored", mapState.optBoolean("onlyExplored", false));
    mapDisplay.put("hideUnknown", mapState.optBoolean("hideUnknown", true));
    mapDisplay.put("showAdjacency", mapState.optBoolean("showAdjacency", false));
    mapDisplay.put("query", mapState.optString("query", ""));
    screen.put("mapDisplay", mapDisplay);
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
    screen.put("theme", normalizeTheme(settings.optJSONObject("theme")));

    JSONObject response = ok();
    response.put("screen", screen);
    return response;
  }

  // 第二屏在另一台设备上，读不到主控台浏览器 localStorage 里的主题偏好（assets/theme.js 的
  // ato-theme-v1），所以外观跟着第二屏设置走服务端：主控台改主题时写进来，第二屏轮询读回去。
  // 只认 theme.js 认得的模式，颜色夹到 0-255 的整数，坏值退回默认（与 api/campaign-state.php
  // 的 normalize_theme_setting 保持同一套规则）。
  private static JSONObject normalizeTheme(JSONObject value) throws Exception {
    String mode = value == null ? "" : value.optString("mode", "");
    List<String> modes = java.util.Arrays.asList("auto", "c1", "c2", "c3", "c4", "c5", "custom");
    JSONObject theme = new JSONObject();
    theme.put("mode", modes.contains(mode) ? mode : "auto");
    JSONArray rgb = value == null ? null : value.optJSONArray("rgb");
    JSONArray channels = new JSONArray();
    boolean valid = rgb != null && rgb.length() == 3;
    for (int index = 0; valid && index < 3; index += 1) {
      Object raw = rgb.opt(index);
      if (!(raw instanceof Number)) { valid = false; break; }
      channels.put(Math.max(0, Math.min(255, (int) Math.round(((Number) raw).doubleValue()))));
    }
    if (!valid) {
      channels = new JSONArray();
      channels.put(127);
      channels.put(75);
      channels.put(38);
    }
    theme.put("rgb", channels);
    return theme;
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
    settings.put("displayMode", "aibp".equals(displayMode) || "story".equals(displayMode) || "blank".equals(displayMode) ? displayMode : "map");
    settings.remove("displayScale");
    return settings;
  }

  private void saveSecondScreenSettings(JSONObject settings) throws java.io.IOException {
    commitPreferences(store.edit().putString(secondScreenKey(), settings.toString()));
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
    // 与 PHP 的 payload_expected_account_id() 及账号校验对齐：页面自己声明这份状态
    // 属于哪个账号，与当前登录不一致就绝不允许写入。旧客户端不发这个字段（或发空
    // 字符串）时按「未声明」处理，行为不变。
    String expectedAccountId = payload.has("expectedAccountId")
        ? payload.optString("expectedAccountId", "").trim() : "";
    if (!expectedAccountId.isEmpty() && !expectedAccountId.equals(currentUser)) {
      JSONObject mismatch = error("This page was loaded for another account. Reload it before saving.");
      put(mismatch, "code", "ACCOUNT_MISMATCH");
      put(mismatch, "section", section);
      put(mismatch, "revision", revision);
      put(mismatch, "updatedAt", campaign.opt("updatedAt"));
      throw new ApiException(409, mismatch);
    }
    if (payload.has("expectedRevision") && payload.optInt("expectedRevision", -1) != revision) {
      JSONObject conflict = error("This section was changed in another page.");
      put(conflict, "code", "SAVE_CONFLICT");
      put(conflict, "section", section);
      put(conflict, "revision", revision);
      throw new ApiException(409, conflict);
    }

    updateSection(campaign, section, payload.opt("state"), payload.optString("userId", "").trim());
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

  private JSONObject importSections(String method, String requestBody) throws Exception {
    if (!"POST".equalsIgnoreCase(method)) throw new ApiException(405, error("This action requires POST."));
    JSONObject payload;
    try {
      payload = new JSONObject(requestBody);
    } catch (JSONException invalid) {
      throw new ApiException(400, error("Request body must be JSON."));
    }
    JSONObject incoming = payload.optJSONObject("sections");
    if (incoming == null || incoming.length() == 0) throw new ApiException(400, error("Missing sections."));
    Iterator<String> names = incoming.keys();
    while (names.hasNext()) validateSection(names.next());

    JSONObject expectedRevisions = payload.has("expectedRevisions")
        ? payload.optJSONObject("expectedRevisions") : new JSONObject();
    if (expectedRevisions == null) throw new ApiException(400, error("expectedRevisions must be an object."));
    names = expectedRevisions.keys();
    while (names.hasNext()) {
      String name = names.next();
      validateSection(name);
      Object value = expectedRevisions.opt(name);
      // 与 PHP 一样只接受整数或数字字符串，不能用 optInt 将小数/大整数静默截断。
      if (!(value instanceof Integer) && !(value instanceof Long)
          && !(value instanceof String && ((String) value).matches("[0-9]+"))) {
        throw new ApiException(400, error("expectedRevisions values must be integers."));
      }
      try {
        Long.parseLong(String.valueOf(value));
      } catch (NumberFormatException invalid) {
        throw new ApiException(400, error("expectedRevisions values must be integers."));
      }
    }

    JSONObject campaign = loadCampaign();
    JSONObject revisions = campaign.getJSONObject("sectionRevisions");
    Object accountValue = payload.opt("expectedAccountId");
    String expectedAccountId = accountValue instanceof String ? ((String) accountValue).trim() : "";
    if (!expectedAccountId.isEmpty() && !expectedAccountId.equals(currentUser)) {
      JSONObject mismatch = error("This page was loaded for another account. Reload it before importing.");
      put(mismatch, "code", "ACCOUNT_MISMATCH");
      throw new ApiException(409, mismatch);
    }

    // dispatch 由同一把 lock 保护；全部校验通过后才更新内存并一次提交存档及备份。
    JSONObject conflicts = new JSONObject();
    names = incoming.keys();
    while (names.hasNext()) {
      String name = names.next();
      if (!expectedRevisions.has(name)) continue;
      long expected = Long.parseLong(String.valueOf(expectedRevisions.opt(name)));
      int revision = revisions.optInt(name, 0);
      if (expected != revision) {
        JSONObject conflict = new JSONObject();
        conflict.put("expected", expected);
        conflict.put("revision", revision);
        conflicts.put(name, conflict);
      }
    }
    if (conflicts.length() > 0) {
      JSONObject failure = error("Some sections were changed in another page. Nothing was written.");
      put(failure, "code", "SAVE_CONFLICT");
      put(failure, "sections", conflicts);
      put(failure, "updatedAt", campaign.opt("updatedAt"));
      throw new ApiException(409, failure);
    }

    JSONObject applied = new JSONObject();
    String userId = payload.optString("userId", "").trim();
    names = incoming.keys();
    while (names.hasNext()) {
      String name = names.next();
      updateSection(campaign, name, incoming.opt(name), userId);
      int revision = revisions.optInt(name, 0) + 1;
      revisions.put(name, revision);
      applied.put(name, revision);
    }
    campaign.put("updatedAt", System.currentTimeMillis());
    saveCampaign(campaign);
    JSONObject response = ok();
    put(response, "sections", applied);
    put(response, "updatedAt", campaign.opt("updatedAt"));
    put(response, "user", user());
    return response;
  }

  private void updateSection(JSONObject campaign, String section, Object state, String userId) throws JSONException {
    JSONObject sections = campaign.getJSONObject("sections");
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
  }

  private JSONObject restorePreviousDay(String method, String requestBody) throws Exception {
    if (!"POST".equalsIgnoreCase(method)) throw new ApiException(405, error("This action requires POST."));
    JSONObject payload = new JSONObject(requestBody);
    if (!currentUser.equals(payload.optString("expectedAccountId", ""))) {
      JSONObject failure = error("登录账号已变更，请刷新后重试。");
      failure.put("code", "ACCOUNT_MISMATCH");
      throw new ApiException(409, failure);
    }
    for (String field : new String[]{"profileId", "cycleId", "currentDay", "day"}) {
      Object value = payload.opt(field);
      if (!(value instanceof String) || ((String) value).isEmpty() || ((String) value).length() > 128) {
        throw new ApiException(400, error("恢复日期无效。"));
      }
    }
    String prefix = Uri.encode(payload.getString("profileId")) + "::" + Uri.encode(payload.getString("cycleId")) + "::";
    JSONObject campaign = loadCampaign();
    JSONObject revisions = campaign.getJSONObject("sectionRevisions");
    if (!gameDayKey(campaign).equals(prefix + Uri.encode(payload.getString("currentDay")))
        || payload.optInt("expectedRevision", -1) != revisions.optInt("dashboard", 0)) {
      JSONObject failure = error("当前存档已变更，请刷新后重试。");
      failure.put("code", "SAVE_CONFLICT");
      throw new ApiException(409, failure);
    }
    if (payload.getString("day").equals(payload.getString("currentDay"))) {
      throw new ApiException(400, error("恢复日期必须是前一天。"));
    }
    String targetDay = prefix + Uri.encode(payload.getString("day"));
    String backupPrefix = campaignKey() + "::daily::" + targetDay + "::";
    JSONObject restored = null;
    int latestRevision = -1;
    String latestKey = "";
    for (String key : store.getAll().keySet()) {
      if (!key.startsWith(backupPrefix)) continue;
      try {
        JSONObject candidate = normalizeCampaign(new JSONObject(store.getString(key, "")));
        if (!targetDay.equals(gameDayKey(candidate))) continue;
        int revision = candidate.getJSONObject("sectionRevisions").optInt("dashboard", 0);
        if (restored == null || revision > latestRevision || (revision == latestRevision && key.compareTo(latestKey) > 0)) {
          restored = candidate;
          latestRevision = revision;
          latestKey = key;
        }
      } catch (JSONException ignored) {
        // An incomplete archive must not prevent trying other backups of this day.
      }
    }
    if (restored == null) {
      JSONObject failure = error("没有找到前一天（Day " + payload.getString("day") + "）的可用备份。");
      failure.put("code", "BACKUP_NOT_FOUND");
      throw new ApiException(404, failure);
    }
    for (String section : SECTIONS) {
      restored.getJSONObject("sectionRevisions").put(section, revisions.optInt(section, 0) + 1);
    }
    restored.put("updatedAt", System.currentTimeMillis());
    saveCampaign(restored);
    JSONObject response = ok();
    response.put("campaign", restored);
    response.put("user", user());
    return response;
  }

  private JSONObject loadCampaign() throws JSONException {
    String raw = store.getString(campaignKey(), "");
    if (!raw.isEmpty()) return normalizeCampaign(new JSONObject(raw));
    return normalizeCampaign(new JSONObject());
  }

  private JSONObject recordAttachment(Uri uri, String method, String requestBody) throws Exception {
    boolean uploading = "POST".equalsIgnoreCase(method);
    if (!uploading && !"GET".equalsIgnoreCase(method)) throw new ApiException(405, error("Unsupported method."));
    if (requestBody.length() > 768 * 1024 * 4 / 3 + 1024) throw new ApiException(413, error("图片附件过大。"));
    JSONObject payload = uploading ? new JSONObject(requestBody) : new JSONObject();
    String account = uploading ? payload.optString("expectedAccountId", "") : uri.getQueryParameter("expectedAccountId");
    if (!currentUser.equals(account)) {
      JSONObject mismatch = error("登录账号已切换，请刷新后重试。");
      mismatch.put("code", "ACCOUNT_MISMATCH");
      throw new ApiException(409, mismatch);
    }
    java.io.File directory = new java.io.File(attachmentRoot, currentUser);
    JSONObject response = ok();
    response.put("user", user());
    if (!uploading) {
      String id = uri.getQueryParameter("id");
      if (id == null || !id.matches("[a-f0-9]{64}")) throw new ApiException(400, error("图片附件引用无效。"));
      java.io.File file = new java.io.File(directory, id + ".json");
      if (!file.isFile()) throw new ApiException(404, error("图片附件不存在，请从完整备份恢复。"));
      java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
      try (java.io.FileInputStream input = new java.io.FileInputStream(file)) {
        byte[] chunk = new byte[8192];
        for (int count; (count = input.read(chunk)) != -1;) buffer.write(chunk, 0, count);
      }
      byte[] raw = buffer.toByteArray();
      response.put("dataUrl", new JSONObject(new String(raw, java.nio.charset.StandardCharsets.UTF_8)).getString("dataUrl"));
      return response;
    }
    String dataUrl = payload.optString("dataUrl", "");
    if (dataUrl.length() > 768 * 1024 * 4 / 3 + 64
        || !dataUrl.matches("data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}")) {
      throw new ApiException(400, error("请选择压缩后不超过 768 KB 的 JPG、PNG 或 WebP 图片。"));
    }
    byte[] bytes;
    try { bytes = android.util.Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), android.util.Base64.DEFAULT); }
    catch (IllegalArgumentException invalid) { throw new ApiException(400, error("图片内容无效。")); }
    android.graphics.BitmapFactory.Options bounds = new android.graphics.BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
    String mime = dataUrl.substring(5, dataUrl.indexOf(';'));
    if (bytes.length > 768 * 1024 || !mime.equals(bounds.outMimeType)
        || bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 4096 || bounds.outHeight > 4096) {
      throw new ApiException(400, error("图片内容或尺寸无效。"));
    }
    byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
    StringBuilder hash = new StringBuilder();
    for (byte value : digest) hash.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
    String id = hash.toString();
    if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) throw new java.io.IOException("无法创建图片附件目录。");
    java.io.File file = new java.io.File(directory, id + ".json");
    if (!file.isFile()) {
      java.io.File temporary = java.io.File.createTempFile("upload-", ".tmp", directory);
      try {
        JSONObject blob = new JSONObject();
        blob.put("dataUrl", "data:" + mime + ";base64," + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(temporary)) {
          output.write(blob.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
          output.getFD().sync();
        }
        if (!temporary.renameTo(file)) throw new java.io.IOException("无法保存图片附件。");
      } finally { if (temporary.exists()) temporary.delete(); }
    }
    JSONObject attachment = new JSONObject();
    attachment.put("blobId", id);
    attachment.put("width", bounds.outWidth);
    attachment.put("height", bounds.outHeight);
    attachment.put("bytes", bytes.length);
    response.put("attachment", attachment);
    return response;
  }

  // Android has no PHP runtime. Return the daily archives to the pure JS briefing
  // builder, using the same revision/key ordering as restorePreviousDay. Reading
  // a briefing must never save, normalize on disk, or create a backup.
  private JSONObject briefingSource(Uri uri) throws Exception {
    JSONObject campaign = loadCampaign();
    JSONObject dashboard = campaign.getJSONObject("sections").optJSONObject("dashboard");
    if (dashboard == null) dashboard = new JSONObject();
    JSONObject profiles = dashboard.optJSONObject("profiles");
    if (profiles == null) profiles = new JSONObject();
    String profileId = uri.getQueryParameter("profile");
    if (profileId == null || profiles.optJSONObject(profileId) == null) {
      profileId = dashboard.optString("activeProfileId", "default");
    }
    if (profiles.optJSONObject(profileId) == null && profiles.keys().hasNext()) profileId = profiles.keys().next();
    JSONObject profile = profiles.optJSONObject(profileId);
    JSONObject cycles = profile == null ? null : profile.optJSONObject("cycles");
    if (cycles == null) cycles = new JSONObject();
    String cycleId = uri.getQueryParameter("cycle");
    if (cycleId == null || cycles.optJSONObject(cycleId) == null) {
      cycleId = profile == null ? "c1" : profile.optString("activeCycleId", "c1");
      if (cycles.optJSONObject(cycleId) == null) cycleId = cycles.keys().hasNext() ? cycles.keys().next() : "c1";
    }
    String prefix = campaignKey() + "::daily::" + Uri.encode(profileId) + "::" + Uri.encode(cycleId) + "::";
    Map<String, JSONObject> latest = new TreeMap<>();
    Map<String, String> latestKeys = new TreeMap<>();
    for (Map.Entry<String, ?> entry : store.getAll().entrySet()) {
      String key = entry.getKey();
      if (!key.startsWith(prefix) || !(entry.getValue() instanceof String)) continue;
      try {
        JSONObject candidate = new JSONObject((String) entry.getValue());
        String dayKey = gameDayKey(candidate);
        String expectedPrefix = Uri.encode(profileId) + "::" + Uri.encode(cycleId) + "::";
        if (!dayKey.startsWith(expectedPrefix) || !key.startsWith(campaignKey() + "::daily::" + dayKey + "::")) continue;
        JSONObject previous = latest.get(dayKey);
        int revision = candidate.optJSONObject("sectionRevisions") == null ? 0
          : candidate.getJSONObject("sectionRevisions").optInt("dashboard", 0);
        int previousRevision = previous == null || previous.optJSONObject("sectionRevisions") == null ? -1
          : previous.getJSONObject("sectionRevisions").optInt("dashboard", 0);
        if (previous == null || revision > previousRevision || (revision == previousRevision && key.compareTo(latestKeys.get(dayKey)) > 0)) {
          latest.put(dayKey, candidate);
          latestKeys.put(dayKey, key);
        }
      } catch (JSONException ignored) {
        // Keep reading when an individual archive is corrupt.
      }
    }
    JSONArray snapshots = new JSONArray();
    for (JSONObject snapshot : latest.values()) {
      // A briefing only needs this profile/cycle's dashboard state plus heroes
      // and story. Do not send inventory or unrelated profiles for every day.
      JSONObject sourceSections = snapshot.getJSONObject("sections");
      JSONObject sourceProfile = sourceSections.getJSONObject("dashboard").getJSONObject("profiles").getJSONObject(profileId);
      JSONObject slimProfile = new JSONObject().put("activeCycleId", cycleId)
        .put("cycles", new JSONObject().put(cycleId, sourceProfile.getJSONObject("cycles").getJSONObject(cycleId)));
      JSONObject sections = new JSONObject().put("dashboard", new JSONObject().put("activeProfileId", profileId)
        .put("profiles", new JSONObject().put(profileId, slimProfile)));
      sections.put("heroes", userSectionState(sourceSections.opt("heroes"), profileId));
      sections.put("story", userSectionState(sourceSections.opt("story"), profileId));
      snapshots.put(new JSONObject().put("sections", sections));
    }
    return ok().put("source", "android-daily-backups").put("user", user())
      .put("campaign", new JSONObject().put("sections", new JSONObject().put("dashboard", dashboard)))
      .put("profileId", profileId).put("cycleId", cycleId).put("snapshots", snapshots);
  }

  private String campaignKey() {
    return "campaign::" + currentUser;
  }

  private void saveCampaign(JSONObject campaign) throws java.io.IOException {
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
    // A successful API response must mean the save and its backups reached
    // disk. apply() only queues the write; an immediate process stop can lose
    // the last acknowledged revision (and even a recently switched account).
    commitPreferences(editor.putString(key, campaign.toString()));
  }

  private void commitPreferences(SharedPreferences.Editor editor) throws java.io.IOException {
    if (!editor.commit()) throw new java.io.IOException("本地存档写入失败，请检查可用空间后重试。");
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
