package com.ato.assistant;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MixedMediaMapHarness {
  private static int checks;
  private static InputStream stream(String value) { return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)); }
  private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }
  private static JSONObject read(String source) throws Exception {
    return new JSONObject(MixedMediaMapReader.read(stream(source), "c2", "fan", "battle"));
  }
  private static String wrapper(JSONObject value) { return "/* local material */\nwindow.ATO_MIXED_MEDIA_MAP = " + value + ";"; }
  private static InputStream padding(int size) {
    return new InputStream() {
      int remaining = size;
      public int read() { return remaining-- > 0 ? 'x' : -1; }
      public int read(byte[] bytes, int offset, int length) {
        if (remaining <= 0) return -1;
        int count = Math.min(remaining, length);
        java.util.Arrays.fill(bytes, offset, offset + count, (byte) 'x'); remaining -= count; return count;
      }
    };
  }
  private static void rejects(String source) throws Exception {
    try { read(source); throw new AssertionError("Accepted incompatible material"); }
    catch (java.io.IOException | org.json.JSONException expected) { checks++; }
  }
  private static boolean equal(Object left, Object right) throws Exception {
    if (left instanceof JSONObject && right instanceof JSONObject) {
      JSONObject a = (JSONObject) left, b = (JSONObject) right;
      if (a.length() != b.length()) return false;
      var keys = a.keys();
      while (keys.hasNext()) { String key = (String) keys.next(); if (!b.has(key) || !equal(a.get(key), b.get(key))) return false; }
      return true;
    }
    if (left instanceof JSONArray && right instanceof JSONArray) {
      JSONArray a = (JSONArray) left, b = (JSONArray) right;
      if (a.length() != b.length()) return false;
      for (int i = 0; i < a.length(); i++) if (!equal(a.get(i), b.get(i))) return false;
      return true;
    }
    return left.equals(right);
  }
  public static void main(String[] args) throws Exception {
    JSONObject match = new JSONObject().put("book", "c2").put("variant", "fan").put("key", "battle")
        .put("anchor", "中文 \"引用\" \\ 🐳").put("contextBefore", "before").put("contextAfter", "after")
        .put("anchorOccurrence", 1).put("anchorCount", 1).put("textLength", 32).put("textFingerprint", "01234567")
        .put("position", "replace").put("replaceText", "□").put("path", "story/assets/mixed-media/images/c2/test.png")
        .put("layout", "inline").put("kind", "resource-icon").put("resourceLabel", "资源")
        .put("semanticLabel", "图形").put("alt", "原图").put("pdfPage", 12).put("printedPage", 10)
        .put("textAlreadyNamesResource", true).put("textAlreadyNamesMedia", false)
        .put("retainedNameText", "名字").put("retainedNameStart", 2).put("retainedNameEnd", 4);
    JSONObject material = new JSONObject().put("schema", 1).put("resourceSchema", 1).put("battleSchema", 1)
        .put("requestedSchema", 1).put("vectorSchema", 1).put("audit", new JSONObject().put("nested", new JSONArray().put("skip")));
    for (String ledger : new String[]{"rows", "resourceRows", "battleRows", "requestedRows", "resourceScopeExclusions"}) {
      JSONObject withAudit = new JSONObject(match.toString()).put("sourceReason", "discard this");
      material.put(ledger, new JSONArray().put(withAudit)
          .put(new JSONObject(match.toString()).put("book", "c1"))
          .put(new JSONObject(match.toString()).put("variant", "official"))
          .put(new JSONObject(match.toString()).put("key", "battle-other")).put(JSONObject.NULL));
    }
    JSONObject vector = new JSONObject().put("path", "test.png").put("vectorPath", "test.svg").put("width", 12)
        .put("height", 13).put("sourcePngSha256", "png-sha").put("svgSha256", "svg-sha");
    material.put("vectorAssets", new JSONArray().put(vector));
    JSONObject result = read(wrapper(material));
    check(equal(result, read("\uFEFF/* schema=1 */\n// local=1\nwindow.ATO_MIXED_MEDIA_MAP=" + material + ";")), "Legacy assignment comments/BOM rejected");
    for (String ledger : new String[]{"rows", "resourceRows", "battleRows", "requestedRows", "resourceScopeExclusions"}) {
      check(result.getJSONArray(ledger).length() == 1, "Context filtering: " + ledger);
      check(equal(match, result.getJSONArray(ledger).getJSONObject(0)), "Runtime fields changed: " + ledger);
    }
    check(!result.has("audit"), "Audit metadata leaked into WebView");
    check(equal(vector, result.getJSONArray("vectorAssets").getJSONObject(0)), "Vector fallback metadata changed");
    check(result.getInt("resourceSchema") == 1 && result.getInt("battleSchema") == 1
        && result.getInt("requestedSchema") == 1 && result.getInt("vectorSchema") == 1, "Optional schemas lost");
    check(new JSONObject(MixedMediaMapReader.read(stream(wrapper(material)), "c5", "official", "missing"))
        .getJSONArray("rows").length() == 0, "Unmapped entry received another entry's rows");
    rejects("window.WRONG={\"schema\":1}");
    rejects("window.ATO_MIXED_MEDIA_MAP={\"schema\":2}");
    rejects("window.ATO_MIXED_MEDIA_MAP={\"schema\":\"1\"}");
    rejects("window.ATO_MIXED_MEDIA_MAP={\"schema\":1,\"rows\":[");
    check(!MixedMediaMapReader.validContext("c6", "fan", "one")
        && !MixedMediaMapReader.validContext("c2", "other", "one")
        && !MixedMediaMapReader.validContext("c2", "fan", ""), "Invalid contexts accepted");

    // A 16 MiB audit string is skipped under a 48 MiB heap, never materialized as a JavaScript/object string.
    InputStream large = new SequenceInputStream(stream("window.ATO_MIXED_MEDIA_MAP={\"schema\":1,\"audit\":\""),
        new SequenceInputStream(padding(16 * 1024 * 1024), stream("\",\"rows\":[]};")));
    String compact = MixedMediaMapReader.read(large, "c2", "fan", "battle");
    check(compact.length() < 100, "Large metadata was retained");

    // Navigation can cancel in the middle of skipValue(), not only between records.
    int[] consumed = {0};
    boolean[] closed = {false};
    InputStream tracked = new java.io.FilterInputStream(new SequenceInputStream(
        stream("window.ATO_MIXED_MEDIA_MAP={\"schema\":1,\"audit\":\""),
        new SequenceInputStream(padding(16 * 1024 * 1024), stream("\",\"rows\":[]};")))) {
      @Override public int read() throws java.io.IOException {
        int value = in.read(); if (value >= 0) consumed[0]++; return value;
      }
      @Override public int read(byte[] bytes, int offset, int length) throws java.io.IOException {
        int count = in.read(bytes, offset, length); if (count > 0) consumed[0] += count; return count;
      }
      @Override public void close() throws java.io.IOException { closed[0] = true; super.close(); }
    };
    try {
      MixedMediaMapReader.read(tracked, "c2", "fan", "battle", () -> consumed[0] >= 16384);
      throw new AssertionError("Cancelled scan completed");
    } catch (java.io.IOException expected) {
      check(expected.getMessage().contains("cancelled"), "Cancellation reported as corrupt data");
    }
    check(consumed[0] < 128 * 1024 && closed[0], "Cancelled scan retained/read the rest of the blob");
    Thread.currentThread().interrupt();
    try { rejects(wrapper(material)); } finally { Thread.interrupted(); }

    if (args.length == 2) {
      JSONArray cases = new JSONArray(Files.readString(Path.of(args[1])));
      int maximum = 0;
      for (int i = 0; i < cases.length(); i++) {
        JSONObject sample = cases.getJSONObject(i);
        try (InputStream input = new FileInputStream(args[0])) {
          String json = MixedMediaMapReader.read(input, sample.getString("book"), sample.getString("variant"), sample.getString("key"));
          check(equal(new JSONObject(json), sample.getJSONObject("expected")), "Local projection differs: sample " + i);
          maximum = Math.max(maximum, json.getBytes(StandardCharsets.UTF_8).length);
        }
      }
      System.out.println("Local mapping: " + cases.length() + " entry/variant samples; largest response " + maximum + " bytes");
    }
    System.out.println("Android streaming mapping checks passed: " + checks);
  }
}
