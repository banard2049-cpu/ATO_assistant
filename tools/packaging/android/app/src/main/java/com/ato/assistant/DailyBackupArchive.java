package com.ato.assistant;

import android.net.Uri;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.zip.*;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Shared ZIP contract. Raw daily saves live on disk during validation/import. */
final class DailyBackupArchive {
  static final int MAX_ENTRIES = 10000;
  static final int MAX_MANIFEST = 4 * 1024 * 1024;
  static final int MAX_JSON = 16 * 1024 * 1024;
  static final long MAX_EXPANDED = 1024L * 1024 * 1024;
  static final long MAX_ZIP = 512L * 1024 * 1024;
  private static final String ENTRY_PATTERN = "backups/[0-9]{8}\\.json";

  static final class Source {
    final String key;
    final String raw;
    final File file;
    final JSONObject metadata;
    Source(String key, String raw, File file, JSONObject metadata) {
      this.key = key; this.raw = raw; this.file = file; this.metadata = metadata;
    }
    String read() throws IOException { return raw != null ? raw : readText(file, MAX_JSON); }
    InputStream open() throws IOException {
      if (file != null) return new FileInputStream(file);
      throw new IOException("此备份需要按字符读取。");
    }
  }

  static String dayKey(String profile, String cycle, String day) {
    return Uri.encode(profile) + "::" + Uri.encode(cycle) + "::" + Uri.encode(day);
  }

  static String hex(byte[] bytes) {
    StringBuilder text = new StringBuilder(bytes.length * 2);
    for (byte value : bytes) text.append(String.format(Locale.ROOT, "%02x", value & 255));
    return text.toString();
  }

  static String sha(String raw) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    Writer writer = new OutputStreamWriter(new DigestOutputStream(new OutputStream() {
      @Override public void write(int value) { }
      @Override public void write(byte[] bytes, int offset, int length) { }
    }, digest), StandardCharsets.UTF_8);
    writer.write(raw); writer.flush();
    return hex(digest.digest());
  }

  static JSONObject metadata(String raw) throws Exception {
    // One decoded save at a time; the ZIP and all other imported saves stay on disk.
    long available = Runtime.getRuntime().maxMemory() - (Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory());
    if ((long) raw.length() * 6 + 2 * 1024 * 1024 > available) throw new IOException("单份备份超过当前可用内存，请释放内存后重试。");
    JSONObject campaign = new JSONObject(raw);
    JSONObject dashboard = campaign.getJSONObject("sections").getJSONObject("dashboard");
    JSONObject profiles = dashboard.getJSONObject("profiles");
    String profileId = identityText(dashboard.get("activeProfileId"), 256);
    JSONObject profile = profiles.getJSONObject(profileId);
    String cycleId = identityText(profile.get("activeCycleId"), 256);
    Object dayValue = profile.getJSONObject("cycles").getJSONObject(cycleId).getJSONObject("state").opt("day");
    if (!(dayValue instanceof String || dayValue instanceof Number || dayValue instanceof Boolean)) throw new IOException("备份没有有效日期。");
    String day = identityText(dayValue instanceof Boolean ? ((Boolean) dayValue ? "1" : "") : String.valueOf(dayValue), 128);
    return new JSONObject().put("profileId", profileId).put("cycleId", cycleId).put("day", day)
      .put("profileName", profile.optString("name", profileId));
  }

  private static long timestamp(String key) {
    String suffix = key.substring(key.lastIndexOf("::") + 2);
    int dash = suffix.indexOf('-');
    String value = dash < 0 ? suffix : suffix.substring(0, dash);
    try { return Math.max(0, Long.parseLong(value)); } catch (NumberFormatException ignored) { return 0; }
  }

  static int compareSources(Source left, Source right) throws JSONException {
    if (right == null) return 1;
    long a = left.metadata == null ? timestamp(left.key) : left.metadata.getLong("timestamp");
    long b = right.metadata == null ? timestamp(right.key) : right.metadata.getLong("timestamp");
    int order = Long.compare(a, b);
    return order != 0 ? order : left.key.compareTo(right.key);
  }

  static JSONObject exportZip(Map<String, Source> sources, String prefix, JSONArray cycles, OutputStream destination) throws Exception {
    if (sources.size() > MAX_ENTRIES) throw new IOException("每日备份超过 10000 份，无法一次导出。");
    JSONArray entries = new JSONArray();
    Map<String, JSONObject> cycleIndex = new LinkedHashMap<>();
    for (int i = 0; i < cycles.length(); i++) {
      JSONObject cycle = new JSONObject(cycles.getJSONObject(i).toString());
      cycleIndex.put(dayKey(cycle.getString("profileId"), cycle.getString("cycleId"), ""), cycle);
    }
    long expanded = 0;
    try (ZipOutputStream zip = new ZipOutputStream(new LimitedOutput(destination, MAX_ZIP))) {
      int index = 0;
      for (Source source : sources.values()) {
        String raw = source.read();
        JSONObject info = metadata(raw);
        String cycleKey = dayKey(info.getString("profileId"), info.getString("cycleId"), "");
        JSONObject cycle = cycleIndex.get(cycleKey);
        if (cycle == null) {
          cycle = new JSONObject().put("profileId", info.getString("profileId")).put("profileName", info.getString("profileName"))
            .put("cycleId", info.getString("cycleId")).put("label", cycleLabel(info.getString("cycleId"))).put("day", info.getString("day"));
          cycleIndex.put(cycleKey, cycle);
        } else if (compareDays(info.getString("day"), cycle.optString("day", "")) > 0) cycle.put("day", info.getString("day"));
        String expected = prefix + dayKey(info.getString("profileId"), info.getString("cycleId"), info.getString("day")) + "::";
        if (!source.key.startsWith(expected)) throw new IOException("每日备份的索引与内容不一致，导出已停止。");
        String name = String.format(Locale.ROOT, "backups/%08d.json", ++index);
        long stamp = source.metadata == null ? timestamp(source.key) : source.metadata.getLong("timestamp");
        if (stamp > 253402300799000L) throw new IOException("每日备份的时间超出支持范围。");
        ZipEntry item = new ZipEntry(name); item.setTime(stamp);
        zip.putNextEntry(item);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        LimitedOutput counter = new LimitedOutput(new DigestOutputStream(zip, digest), MAX_JSON);
        Writer writer = new OutputStreamWriter(counter, StandardCharsets.UTF_8);
        writer.write(raw); writer.flush();
        expanded += counter.count;
        if (expanded > MAX_EXPANDED) throw new IOException("每日备份解压后超过 1 GiB。");
        zip.closeEntry();
        entries.put(new JSONObject().put("file", name).put("profileId", info.getString("profileId"))
          .put("cycleId", info.getString("cycleId")).put("day", info.getString("day"))
          .put("sha256", hex(digest.digest())).put("timestamp", stamp));
      }
      SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.ROOT);
      format.setTimeZone(TimeZone.getTimeZone("UTC"));
      JSONObject manifest = new JSONObject().put("format", "ato-daily-backups").put("version", 1)
        .put("createdAt", format.format(new Date())).put("cycles", new JSONArray(cycleIndex.values())).put("entries", entries);
      zip.putNextEntry(new ZipEntry("manifest.json"));
      Writer writer = new OutputStreamWriter(new LimitedOutput(zip, Math.min(MAX_MANIFEST, MAX_EXPANDED - expanded)), StandardCharsets.UTF_8);
      writer.write(manifest.toString()); writer.flush(); zip.closeEntry();
    }
    return new JSONObject().put("ok", true).put("action", "export").put("total", entries.length()).put("imported", 0).put("skipped", 0);
  }

  static final class Staged {
    final File directory;
    final JSONObject manifest;
    Staged(File directory, JSONObject manifest) { this.directory = directory; this.manifest = manifest; }
  }

  static Staged stage(InputStream source, File directory) throws Exception {
    if (!directory.mkdirs() && !directory.isDirectory()) throw new IOException("无法创建备份导入临时目录。");
    Set<String> names = new HashSet<>();
    long expanded = 0;
    try {
      File packageFile = new File(directory, "package.zip");
      try (InputStream input = new LimitedInput(source, MAX_ZIP); OutputStream output = new FileOutputStream(packageFile)) {
        byte[] buffer = new byte[32 * 1024];
        for (int count; (count = input.read(buffer)) != -1;) output.write(buffer, 0, count);
      }
      try (ZipFile zip = new ZipFile(packageFile)) {
        for (Enumeration<? extends ZipEntry> items = zip.entries(); items.hasMoreElements();) {
          ZipEntry item = items.nextElement();
          String name = item.getName();
          if (item.isDirectory() || !(name.equals("manifest.json") || name.matches(ENTRY_PATTERN)) || !names.add(name))
            throw new IOException("压缩包包含未知路径或重复文件。");
          if (names.size() > MAX_ENTRIES + 1) throw new IOException("压缩包中的备份超过 10000 份。");
          int limit = name.equals("manifest.json") ? MAX_MANIFEST : MAX_JSON;
          if (item.getSize() > limit) throw new IOException("压缩包中的单份文件过大。");
          File output = new File(directory, name);
          File parent = output.getParentFile();
          if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("无法创建导入临时文件。");
          long size = 0;
          CRC32 crc = new CRC32();
          try (InputStream input = zip.getInputStream(item); OutputStream file = new FileOutputStream(output)) {
            byte[] buffer = new byte[32 * 1024];
            for (int count; (count = input.read(buffer)) != -1;) {
              size += count; expanded += count;
              if (size > limit || expanded > MAX_EXPANDED) throw new IOException("压缩包解压内容超过允许大小。");
              file.write(buffer, 0, count);
              crc.update(buffer, 0, count);
            }
          }
          if (item.getSize() != size || item.getCrc() != crc.getValue()) throw new IOException("ZIP 文件大小或 CRC 校验失败。");
        }
      }
      if (!packageFile.delete()) throw new IOException("无法清理导入临时压缩包。");
      if (!names.contains("manifest.json")) throw new IOException("压缩包缺少 manifest.json。");
      JSONObject manifest = new JSONObject(readText(new File(directory, "manifest.json"), MAX_MANIFEST));
      if (!"ato-daily-backups".equals(manifest.optString("format")) || !(manifest.opt("version") instanceof Number)
          || ((Number) manifest.get("version")).doubleValue() != 1
          || manifest.optJSONArray("entries") == null || manifest.optJSONArray("cycles") == null)
        throw new IOException("不是受支持的每日备份压缩包。");
      JSONArray entries = manifest.getJSONArray("entries");
      if (entries.length() > MAX_ENTRIES || names.size() != entries.length() + 1) throw new IOException("压缩包清单与文件数量不一致。");
      Set<String> declared = new HashSet<>();
      validateCycles(manifest.getJSONArray("cycles"));
      // Recover selectors from verified saves when another platform omitted them.
      Map<String, JSONObject> cycleIndex = new LinkedHashMap<>();
      for (int i = 0; i < entries.length(); i++) {
        JSONObject entry = entries.getJSONObject(i);
        String name = requiredString(entry, "file");
        String expectedHash = requiredString(entry, "sha256");
        if (!name.matches(ENTRY_PATTERN) || !expectedHash.matches("[0-9a-f]{64}") || !declared.add(name) || !names.contains(name))
          throw new IOException("备份清单的文件名或校验值无效。");
        for (String field : new String[] {"profileId", "cycleId", "day"}) identityText(entry.opt(field), field.equals("day") ? 128 : 256);
        Object stamp = entry.opt("timestamp");
        if (!(stamp instanceof Number) || ((Number) stamp).doubleValue() != ((Number) stamp).longValue()
            || ((Number) stamp).longValue() < 0 || ((Number) stamp).longValue() > 253402300799000L)
          throw new IOException("备份时间无效。");
        File file = new File(directory, name);
        String actual = fileSha(file);
        if (!expectedHash.equals(actual)) throw new IOException("备份校验失败，压缩包可能已损坏。");
        JSONObject actualMetadata = metadata(readText(file, MAX_JSON));
        for (String field : new String[] {"profileId", "cycleId", "day"}) {
          if (!entry.getString(field).equals(actualMetadata.getString(field))) throw new IOException("备份清单与实际战役、循环或日期不一致。");
        }
        String cycleKey = dayKey(entry.getString("profileId"), entry.getString("cycleId"), "");
        JSONObject previous = cycleIndex.get(cycleKey);
        if (previous == null || compareDays(entry.getString("day"), previous.getString("day")) > 0) {
          actualMetadata.put("label", cycleLabel(entry.getString("cycleId")));
          cycleIndex.put(cycleKey, actualMetadata);
        }
      }
      manifest.put("cycles", new JSONArray(cycleIndex.values()));
      return new Staged(directory, manifest);
    } catch (Exception | OutOfMemoryError | StackOverflowError error) {
      deleteTree(directory);
      throw error;
    }
  }

  private static String identityText(Object value, int limit) throws IOException {
    if (!(value instanceof String) || ((String) value).isEmpty()
        || ((String) value).getBytes(StandardCharsets.UTF_8).length > limit
        || java.util.regex.Pattern.compile("[\\x00-\\x1f\\x7f]").matcher((String) value).find())
      throw new IOException("备份中的战役、循环或日期信息无效。");
    return (String) value;
  }

  static String cycleLabel(String cycle) {
    String[] ids = {"c1", "c2", "c3", "c4", "c5"}, labels = {"循环 I", "循环 II", "循环 III", "循环 IV", "循环 V"};
    for (int i = 0; i < ids.length; i++) if (ids[i].equals(cycle)) return labels[i];
    return cycle;
  }

  static int compareDays(String left, String right) {
    java.util.regex.Pattern prologue = java.util.regex.Pattern.compile("^T([0-9]+)(?:[/-]([0-9]+))?$");
    java.util.regex.Matcher a = prologue.matcher(left), b = prologue.matcher(right);
    boolean ap = a.matches(), bp = b.matches();
    int ak = ap ? 0 : left.matches("-?[0-9]+") ? 1 : 2;
    int bk = bp ? 0 : right.matches("-?[0-9]+") ? 1 : 2;
    if (ak != bk) return Integer.compare(ak, bk);
    if (ak == 2) return left.compareTo(right);
    int main = new java.math.BigInteger(ap ? a.group(1) : left).compareTo(new java.math.BigInteger(bp ? b.group(1) : right));
    if (main != 0 || !ap) return main;
    return new java.math.BigInteger(a.group(2) == null ? "0" : a.group(2))
      .compareTo(new java.math.BigInteger(b.group(2) == null ? "0" : b.group(2)));
  }

  private static String requiredString(JSONObject item, String field) throws Exception {
    Object value = item.opt(field);
    if (!(value instanceof String) || ((String) value).isEmpty() || ((String) value).length() > 4096) throw new IOException("备份清单字段无效：" + field);
    return (String) value;
  }

  private static void validateCycles(JSONArray cycles) throws Exception {
    if (cycles.length() > MAX_ENTRIES) throw new IOException("备份清单循环数量过多。");
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < cycles.length(); i++) {
      JSONObject cycle = cycles.getJSONObject(i);
      String profile = requiredString(cycle, "profileId"), id = requiredString(cycle, "cycleId");
      for (String field : new String[] {"profileName", "label", "day"}) {
        if (!(cycle.opt(field) instanceof String)) throw new IOException("备份清单的循环信息无效。");
      }
      if (!seen.add(Uri.encode(profile) + "::" + Uri.encode(id))) throw new IOException("备份清单包含重复循环。");
    }
  }

  static String fileSha(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) {
      byte[] buffer = new byte[32 * 1024];
      for (int count; (count = input.read(buffer)) != -1;) digest.update(buffer, 0, count);
    }
    return hex(digest.digest());
  }

  static String readText(File file, int limit) throws IOException {
    if (!file.isFile() || file.length() > limit) throw new IOException("备份文件不存在或过大。");
    StringBuilder result = new StringBuilder((int) Math.min(file.length(), 64 * 1024));
    try (Reader input = new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8.newDecoder()
        .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT))) {
      char[] buffer = new char[16 * 1024];
      for (int count; (count = input.read(buffer)) != -1;) {
        if ((long) result.length() + count > limit) throw new IOException("备份文件过大。");
        result.append(buffer, 0, count);
      }
    }
    return result.toString();
  }

  static void writeJson(File file, JSONObject json) throws Exception {
    try (OutputStream output = new LimitedOutput(new FileOutputStream(file), MAX_MANIFEST); Writer writer = new OutputStreamWriter(output, StandardCharsets.UTF_8)) {
      writer.write(json.toString());
    }
  }

  static void deleteTree(File file) {
    if (file == null || !file.exists()) return;
    File[] children = file.listFiles();
    if (children != null) for (File child : children) deleteTree(child);
    file.delete();
  }

  private static final class LimitedOutput extends FilterOutputStream {
    final long limit; long count;
    LimitedOutput(OutputStream output, long limit) { super(output); this.limit = limit; }
    @Override public void write(int value) throws IOException { if (++count > limit) throw new IOException("导出文件超过允许大小。"); out.write(value); }
    @Override public void write(byte[] bytes, int offset, int length) throws IOException {
      count += length; if (count > limit) throw new IOException("导出文件超过允许大小。"); out.write(bytes, offset, length);
    }
  }

  private static final class LimitedInput extends FilterInputStream {
    final long limit; long count;
    LimitedInput(InputStream input, long limit) { super(input); this.limit = limit; }
    @Override public int read() throws IOException { int value = in.read(); if (value >= 0 && ++count > limit) throw new IOException("ZIP 文件超过 512 MiB。"); return value; }
    @Override public int read(byte[] bytes, int offset, int length) throws IOException {
      int size = in.read(bytes, offset, length); if (size > 0 && (count += size) > limit) throw new IOException("ZIP 文件超过 512 MiB。"); return size;
    }
  }
}
