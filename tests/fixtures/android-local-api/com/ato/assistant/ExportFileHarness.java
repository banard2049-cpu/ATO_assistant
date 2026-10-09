package com.ato.assistant;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class ExportFileHarness {
  private static int checks;
  private static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
    checks++;
  }

  public static void main(String[] args) throws Exception {
    ByteArrayOutputStream original = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(original)) {
      for (String name : new String[]{"map-replay-c1.gif", "tech-replay-c1.gif", "daily-briefing-c1.pdf"}) {
        zip.putNextEntry(new ZipEntry(name));
        byte[] data = new byte[65539];
        for (int i = 0; i < data.length; i++) data[i] = (byte) i;
        zip.write(data);
        zip.closeEntry();
      }
    }
    LocalExportFile file = LocalExportFile.briefingZip("ATO-简报-c1.zip", java.util.Base64.getEncoder().encodeToString(original.toByteArray()));
    check("application/zip".equals(file.mimeType), "ZIP picker MIME type changed");
    check("ATO-简报-c1.zip".equals(file.filename), "ZIP filename changed");
    ByteArrayOutputStream saved = new ByteArrayOutputStream();
    file.writeTo(saved);
    check(Arrays.equals(original.toByteArray(), saved.toByteArray()), "Binary ZIP bytes changed during Android export");
    LocalExportFile json = LocalExportFile.json("save.json", "{\"name\":\"阿尔戈号\"}");
    saved.reset();
    json.writeTo(saved);
    check("application/json".equals(json.mimeType), "Existing JSON picker MIME type regressed");
    check("{\"name\":\"阿尔戈号\"}".equals(saved.toString(StandardCharsets.UTF_8)), "Existing UTF-8 JSON export regressed");
    for (String raw : new String[]{null, "", "!invalid", "bm90IGEgemlw"}) {
      try {
        LocalExportFile.briefingZip("bad.zip", raw);
        throw new AssertionError("Invalid ZIP accepted: " + raw);
      } catch (IllegalArgumentException expected) { checks++; }
    }
    try {
      file.writeTo(new OutputStream() { @Override public void write(int value) throws IOException { throw new IOException("disk full"); } });
      throw new AssertionError("Write failure was swallowed");
    } catch (IOException expected) { check("disk full".equals(expected.getMessage()), "Wrong write failure"); }
    System.out.println("Android file export passed: " + checks + " checks");
  }
}
