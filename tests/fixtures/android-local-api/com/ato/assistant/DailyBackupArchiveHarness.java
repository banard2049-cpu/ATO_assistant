package com.ato.assistant;

import android.content.Context;
import android.net.Uri;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.zip.*;
import org.json.JSONArray;
import org.json.JSONObject;

public final class DailyBackupArchiveHarness {
  private static int checks;
  private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
  private static JSONObject request(LocalCampaignApi api, String query, String body) throws Exception {
    JSONObject envelope = new JSONObject(api.handleForJavascript(Uri.parse("file:///android_asset/web/api/campaign-state.php" + query), body == null ? "GET" : "POST", body));
    check(envelope.getInt("status") == 200, "Request failed: " + envelope);
    return new JSONObject(envelope.getString("body"));
  }
  private static void login(LocalCampaignApi api, String user) throws Exception { request(api, "?action=login", new JSONObject().put("username", user).toString()); }
  private static JSONObject campaign(String profile, String cycle, String day, int revision, String note) throws Exception {
    JSONObject state = new JSONObject().put("day", day).put("notes", note)
      .put("mapSnapshot", new JSONObject().put("exploredIds", new JSONArray().put("T00")))
      .put("unlockedTech", new JSONObject().put("unlockedKeys", new JSONArray()));
    JSONObject selected = new JSONObject().put("name", "船 " + profile).put("activeCycleId", cycle)
      .put("cycles", new JSONObject().put(cycle, new JSONObject().put("state", state)));
    JSONObject dashboard = new JSONObject().put("activeProfileId", profile).put("profiles", new JSONObject().put(profile, selected));
    return new JSONObject().put("sections", new JSONObject().put("dashboard", dashboard)
      .put("record", new JSONObject().put("inventory", "FULL RAW INVENTORY")))
      .put("sectionRevisions", new JSONObject().put("dashboard", revision));
  }
  private static void backup(Context context, String user, String profile, String cycle, String day, int revision, long stamp, String note) throws Exception {
    context.store.edit().putString("campaign::" + user + "::daily::" + DailyBackupArchive.dayKey(profile, cycle, day) + "::" + stamp + "-original",
      campaign(profile, cycle, day, revision, note).toString()).commit();
  }
  private static Context context(File root) { System.setProperty("ato.test.files", root.getAbsolutePath()); return new Context(); }
  private static JSONObject briefing(LocalCampaignApi api, String query) throws Exception {
    JSONObject envelope = new JSONObject(api.handleForJavascript(Uri.parse("file:///android_asset/web/briefing/api.php" + query), "GET", ""));
    check(envelope.getInt("status") == 200, "Briefing failed: " + envelope);
    return new JSONObject(envelope.getString("body"));
  }
  private static Map<String, byte[]> contents(File zip) throws Exception {
    Map<String, byte[]> result = new LinkedHashMap<>();
    try (ZipFile archive = new ZipFile(zip)) {
      for (Enumeration<? extends ZipEntry> entries = archive.entries(); entries.hasMoreElements();) {
        ZipEntry entry = entries.nextElement();
        try (InputStream input = archive.getInputStream(entry)) { result.put(entry.getName(), input.readAllBytes()); }
      }
    }
    return result;
  }
  private static File zip(File target, Map<String, byte[]> files) throws Exception {
    try (ZipOutputStream output = new ZipOutputStream(new FileOutputStream(target))) {
      for (Map.Entry<String, byte[]> file : files.entrySet()) {
        output.putNextEntry(new ZipEntry(file.getKey())); output.write(file.getValue()); output.closeEntry();
      }
    }
    return target;
  }
  private static void rejected(LocalCampaignApi api, File file, String message) throws Exception {
    boolean failed = false;
    try (InputStream input = new FileInputStream(file)) { api.importDailyBackups("destination", input); }
    catch (Exception expected) { failed = true; }
    check(failed, message);
  }

  private static void run(File root) throws Exception {
    root.mkdirs();
    check(DailyBackupArchive.compareSources(new DailyBackupArchive.Source("prefix::80-file", "", null, new JSONObject().put("timestamp", 80)),
      new DailyBackupArchive.Source("prefix::9-original", "", null, null)) > 0, "Imported timestamp used lexicographic ordering");
    Context source = context(new File(root, "source")); LocalCampaignApi sourceApi = new LocalCampaignApi(source); login(sourceApi, "source");
    backup(source, "source", "中文::船", "c2", "T6/00", 1, 1700000000001L, "older");
    backup(source, "source", "中文::船", "c2", "T6/00", 2, 1700000000002L, "newer");
    backup(source, "source", "ship", "c1", "80", 3, 1700000000003L, "day eighty");
    backup(source, "source", "ship", "c1", "9", 2, 1700000000004L, "day nine");
    source.store.edit().putString("campaign::source", campaign("today", "c5", "99", 10, "TODAY MUST NOT CHANGE").toString()).commit();
    Map<String, ?> sourceBefore = source.store.getAll();
    File exported = new File(root, "native-backups.zip");
    try (OutputStream output = new FileOutputStream(exported)) { check(sourceApi.exportDailyBackups("source", output).getInt("total") == 4, "Export missed revisions"); }
    check(sourceBefore.equals(source.store.getAll()), "Export changed save");
    Map<String, byte[]> files = contents(exported);
    JSONObject manifest = new JSONObject(new String(files.get("manifest.json"), StandardCharsets.UTF_8));
    check(manifest.getJSONArray("entries").length() == 4 && files.size() == 5, "ZIP manifest mismatch");
    boolean deletedProfile = false;
    for (int i = 0; i < manifest.getJSONArray("cycles").length(); i++) {
      JSONObject cycle = manifest.getJSONArray("cycles").getJSONObject(i);
      if (cycle.getString("profileId").equals("中文::船")) deletedProfile = true;
      if (cycle.getString("profileId").equals("ship")) check(cycle.getString("day").equals("80"), "Lexicographic day replaced highest day");
    }
    check(deletedProfile, "Deleted profile missing from manifest catalog");
    Context destination = context(new File(root, "destination")); LocalCampaignApi destinationApi = new LocalCampaignApi(destination); login(destinationApi, "destination");
    Map<String, ?> before = destination.store.getAll();
    try (InputStream input = new FileInputStream(exported)) { check(destinationApi.importDailyBackups("destination", input).getInt("imported") == 4, "Import count"); }
    check(before.equals(destination.store.getAll()), "Import changed current campaign or prefs");
    JSONObject replay = briefing(destinationApi, "?profile=" + Uri.encode("中文::船") + "&cycle=c2");
    check(replay.getJSONArray("snapshots").length() == 1 && replay.toString().contains("newer"), "Imported fresh-account history unavailable");
    check(!replay.toString().contains("FULL RAW INVENTORY"), "Briefing leaked raw inventory");
    try (InputStream input = new FileInputStream(exported)) {
      JSONObject result = destinationApi.importDailyBackups("destination", input);
      check(result.getInt("imported") == 0 && result.getInt("skipped") == 4, "Repeated import not deduplicated");
    }
    File reexport = new File(root, "native-roundtrip.zip");
    try (OutputStream output = new FileOutputStream(reexport)) { check(destinationApi.exportDailyBackups("destination", output).getInt("total") == 4, "File archives omitted on re-export"); }
    JSONObject roundtrip = new JSONObject(new String(contents(reexport).get("manifest.json"), StandardCharsets.UTF_8));
    Set<String> originalHashes = new HashSet<>(), roundtripHashes = new HashSet<>();
    for (int i = 0; i < 4; i++) {
      originalHashes.add(manifest.getJSONArray("entries").getJSONObject(i).getString("sha256"));
      roundtripHashes.add(roundtrip.getJSONArray("entries").getJSONObject(i).getString("sha256"));
    }
    check(originalHashes.equals(roundtripHashes), "Raw archive bytes changed across import/export");
    Map<String, byte[]> malicious = new LinkedHashMap<>(files); malicious.put("../outside.json", new byte[] {1});
    rejected(destinationApi, zip(new File(root, "traversal.zip"), malicious), "Accepted traversal");
    malicious = new LinkedHashMap<>(files);
    JSONObject invalid = new JSONObject(manifest.toString()); invalid.getJSONArray("entries").getJSONObject(3).put("sha256", "0".repeat(64));
    malicious.put("manifest.json", invalid.toString().getBytes(StandardCharsets.UTF_8));
    rejected(destinationApi, zip(new File(root, "bad-hash.zip"), malicious), "Accepted SHA mismatch");
    invalid = new JSONObject(manifest.toString()); invalid.getJSONArray("entries").getJSONObject(0).put("day", "wrong");
    malicious.put("manifest.json", invalid.toString().getBytes(StandardCharsets.UTF_8));
    rejected(destinationApi, zip(new File(root, "bad-day.zip"), malicious), "Accepted metadata mismatch");
    invalid = new JSONObject(manifest.toString()); invalid.getJSONArray("entries").put(invalid.getJSONArray("entries").getJSONObject(0));
    malicious.put("manifest.json", invalid.toString().getBytes(StandardCharsets.UTF_8));
    rejected(destinationApi, zip(new File(root, "duplicate.zip"), malicious), "Accepted repeated manifest entry");
    invalid = new JSONObject(manifest.toString()); invalid.put("cycles", new JSONArray());
    malicious.put("manifest.json", invalid.toString().getBytes(StandardCharsets.UTF_8));
    try (InputStream input = new FileInputStream(zip(new File(root, "missing-cycle.zip"), malicious))) {
      check(destinationApi.importDailyBackups("destination", input).getJSONArray("cycles").length() == 2, "Missing cycle catalog was not recovered from raw saves");
    }
    byte[] truncated = Files.readAllBytes(exported.toPath());
    File truncatedFile = new File(root, "truncated.zip"); Files.write(truncatedFile.toPath(), Arrays.copyOf(truncated, truncated.length - 30));
    rejected(destinationApi, truncatedFile, "Accepted truncated ZIP central directory");
    byte[] crc = Files.readAllBytes(exported.toPath());
    for (int i = 0; i < crc.length - 20; i++) if (crc[i] == 'P' && crc[i + 1] == 'K' && crc[i + 2] == 1 && crc[i + 3] == 2) { crc[i + 16] ^= 1; break; }
    File crcFile = new File(root, "bad-crc.zip"); Files.write(crcFile.toPath(), crc);
    rejected(destinationApi, crcFile, "Accepted invalid ZIP CRC");
    check(before.equals(destination.store.getAll()), "Rejected import changed prefs");
    try (OutputStream output = new FileOutputStream(new File(root, "after-rejection.zip"))) { check(destinationApi.exportDailyBackups("destination", output).getInt("total") == 4, "Rejected import partially saved history"); }

    // Import streams are read before the publish lock; changing accounts must abort publication.
    try (InputStream input = new FilterInputStream(new FileInputStream(exported)) {
      boolean changed;
      @Override public int read(byte[] bytes, int offset, int length) throws IOException {
        if (!changed) { changed = true; try { login(destinationApi, "other"); } catch (Exception e) { throw new IOException(e); } }
        return super.read(bytes, offset, length);
      }
    }) {
      boolean mismatch = false;
      try { destinationApi.importDailyBackups("destination", input); } catch (IOException expected) { mismatch = true; }
      check(mismatch, "Account switch during import accepted");
    }
    check(briefing(destinationApi, "").getJSONArray("snapshots").length() == 0, "Account history leaked");
    login(destinationApi, "destination");
    destination.store.edit().putString("campaign::destination", campaign("ship", "c1", "81", 20, "current").toString()).commit();
    JSONObject restored = request(destinationApi, "?action=restore-previous-day", new JSONObject().put("expectedAccountId", "destination")
      .put("profileId", "ship").put("cycleId", "c1").put("currentDay", "81").put("day", "80").put("expectedRevision", 20).toString());
    check(restored.toString().contains("day eighty"), "Restore previous day did not read file-backed imported backup");
    System.out.println("Android daily backup ZIP passed: " + checks + " checks; export=" + exported);
  }

  private static void memory(File root) throws Exception {
    root.mkdirs();
    File zip = new File(root, "large-history.zip");
    JSONArray entries = new JSONArray();
    String padding = "x".repeat(384 * 1024);
    try (ZipOutputStream output = new ZipOutputStream(new FileOutputStream(zip))) {
      for (int day = 0; day < 80; day++) {
        JSONObject snapshot = campaign("memory-ship", "c1", String.valueOf(day), day, padding);
        snapshot.getJSONObject("sections").getJSONObject("record").put("inventory", padding);
        String raw = snapshot.toString(), name = String.format(Locale.ROOT, "backups/%08d.json", day + 1);
        output.putNextEntry(new ZipEntry(name));
        Writer writer = new OutputStreamWriter(output, StandardCharsets.UTF_8); writer.write(raw); writer.flush(); output.closeEntry();
        entries.put(new JSONObject().put("file", name).put("profileId", "memory-ship").put("cycleId", "c1")
          .put("day", String.valueOf(day)).put("timestamp", 1700000000000L + day).put("sha256", DailyBackupArchive.sha(raw)));
      }
      JSONObject manifest = new JSONObject().put("format", "ato-daily-backups").put("version", 1)
        .put("createdAt", "2026-10-26T00:00:00Z").put("cycles", new JSONArray()).put("entries", entries);
      output.putNextEntry(new ZipEntry("manifest.json")); output.write(manifest.toString().getBytes(StandardCharsets.UTF_8)); output.closeEntry();
    }
    padding = null;
    Context destination = context(new File(root, "destination")); LocalCampaignApi api = new LocalCampaignApi(destination); login(api, "memory");
    Map<String, ?> before = destination.store.getAll();
    try (InputStream input = new FileInputStream(zip)) { check(api.importDailyBackups("memory", input).getInt("imported") == 80, "Memory import omitted archives"); }
    check(before.equals(destination.store.getAll()), "Large import stored raw JSON in SharedPreferences");
    Set<String> days = new HashSet<>(); String cursor = null; int pages = 0;
    do {
      JSONObject body = briefing(api, "?profile=memory-ship&cycle=c1" + (cursor == null ? "" : "&cursor=" + cursor));
      JSONArray snapshots = body.getJSONArray("snapshots");
      check(snapshots.length() <= 4, "Large history did not page");
      for (int i = 0; i < snapshots.length(); i++) {
        JSONObject state = snapshots.getJSONObject(i).getJSONObject("sections").getJSONObject("dashboard").getJSONObject("profiles")
          .getJSONObject("memory-ship").getJSONObject("cycles").getJSONObject("c1").getJSONObject("state");
        check(days.add(state.getString("day")), "Duplicate day in disk history");
        check(state.getString("notes").length() == 384 * 1024, "Large note truncated");
      }
      cursor = body.isNull("nextCursor") ? null : body.getString("nextCursor"); pages++;
    } while (cursor != null);
    check(days.size() == 80 && pages == 20, "Large disk history incomplete");
    try (OutputStream output = new FileOutputStream(new File(root, "large-roundtrip.zip"))) { check(api.exportDailyBackups("memory", output).getInt("total") == 80, "Large disk history re-export incomplete"); }
    System.out.println("Android daily backup memory passed: 80 full saves, 60 MiB raw, 20 pages, file-backed import and re-export, max heap=" + Runtime.getRuntime().maxMemory());
  }

  public static void main(String[] args) throws Exception {
    File root = new File(System.getProperty("ato.test.files"), "daily-backup-harness");
    if (args.length > 0 && args[0].equals("memory")) { memory(new File(root, UUID.randomUUID().toString())); return; }
    if (args.length >= 2 && args[0].equals("import")) {
      root.mkdirs(); Context context = context(root); LocalCampaignApi api = new LocalCampaignApi(context); login(api, "interop");
      try (InputStream input = new FileInputStream(args[1])) { System.out.println(api.importDailyBackups("interop", input)); }
      JSONObject replay = briefing(api, "?profile=" + Uri.encode("中文::船") + "&cycle=c2");
      check(replay.toString().contains("T6/00"), "Cross-platform profile/date missing");
      File output = new File(root, "native-interop.zip");
      try (OutputStream stream = new FileOutputStream(output)) { System.out.println(api.exportDailyBackups("interop", stream)); }
      System.out.println("Native cross-platform ZIP=" + output);
      return;
    }
    run(new File(root, UUID.randomUUID().toString()));
  }
}
