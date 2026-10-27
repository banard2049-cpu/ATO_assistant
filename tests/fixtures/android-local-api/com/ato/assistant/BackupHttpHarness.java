package com.ato.assistant;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;

/** Exercise real HTTP sockets and byte-preserving streamed backup request bodies. */
public final class BackupHttpHarness {
  private int checks;
  private final File directory = new File(System.getProperty("ato.test.files"), "backup-http");
  private final byte[] bytes = new byte[131083];
  private final FakeBackend backend = new FakeBackend();
  private long now = System.currentTimeMillis();
  private final LocalBackupHttpHandler handler = new LocalBackupHttpHandler(directory, backend, () -> now);

  private final class FakeBackend implements LocalBackupHttpHandler.Backend {
    String user = "local";
    int exports, imports;
    byte[] uploaded;
    String failure;
    public String currentUser() { return user; }
    public JSONObject exportZip(String expected, OutputStream output) throws Exception {
      check(expected.equals(user), "Export account was not bound");
      exports++; output.write(bytes);
      return new JSONObject().put("ok", true).put("total", 80);
    }
    public JSONObject importZip(String expected, InputStream input) throws Exception {
      check(expected.equals(user), "Import account was not bound");
      if (failure != null) throw new IOException(failure);
      ByteArrayOutputStream value = new ByteArrayOutputStream(); byte[] buffer = new byte[65536];
      for (int count; (count = input.read(buffer)) != -1;) value.write(buffer, 0, count);
      uploaded = value.toByteArray(); imports++;
      return new JSONObject().put("ok", true).put("imported", 80).put("skipped", 2);
    }
  }

  private void check(boolean value, String message) { if (!value) throw new AssertionError(message); checks++; }

  private final class Reply {
    final String headers;
    final byte[] body;
    final int status;
    Reply(byte[] raw) {
      String text = new String(raw, StandardCharsets.ISO_8859_1);
      int separator = text.indexOf("\r\n\r\n");
      if (separator < 0) throw new AssertionError("HTTP response headers missing");
      headers = text.substring(0, separator);
      status = Integer.parseInt(headers.split(" ", 3)[1]);
      body = Arrays.copyOfRange(raw, separator + 4, raw.length);
    }
    JSONObject json() throws Exception { return new JSONObject(new String(body, StandardCharsets.UTF_8)); }
  }

  private Reply request(String method, String action, Map<String, String> extra, byte[] body, String length) throws Exception {
    try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
      Throwable[] problem = new Throwable[1];
      Thread worker = new Thread(() -> {
        try (Socket connection = server.accept()) {
          connection.setSoTimeout(5000);
          BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.ISO_8859_1));
          String[] request = reader.readLine().split(" ", 3);
          Map<String, String> headers = new HashMap<>();
          for (String line; (line = reader.readLine()) != null && !line.isEmpty();) {
            int separator = line.indexOf(':');
            headers.put(line.substring(0, separator).toLowerCase(Locale.ROOT), line.substring(separator + 1).trim());
          }
          long size = -1;
          try { size = Long.parseLong(headers.getOrDefault("content-length", "-1")); } catch (NumberFormatException ignored) { }
          handler.handle(URI.create(request[1]), request[0], headers, size,
            headers.getOrDefault("transfer-encoding", "").contains("chunked"), reader, connection.getOutputStream());
        } catch (Throwable error) { problem[0] = error; }
      });
      worker.start();
      byte[] result;
      try (Socket client = new Socket(InetAddress.getLoopbackAddress(), server.getLocalPort())) {
        client.setSoTimeout(5000);
        StringBuilder head = new StringBuilder(method + " /briefing/backups.php?" + action + " HTTP/1.1\r\nHost: localhost:8793\r\n");
        if (length != null) head.append("Content-Length: ").append(length).append("\r\n");
        for (Map.Entry<String, String> item : extra.entrySet()) head.append(item.getKey()).append(": ").append(item.getValue()).append("\r\n");
        client.getOutputStream().write(head.append("\r\n").toString().getBytes(StandardCharsets.ISO_8859_1));
        if (body != null) client.getOutputStream().write(body);
        client.shutdownOutput();
        ByteArrayOutputStream response = new ByteArrayOutputStream(); byte[] buffer = new byte[32768];
        for (int count; (count = client.getInputStream().read(buffer)) != -1;) response.write(buffer, 0, count);
        result = response.toByteArray();
      }
      worker.join(5000);
      check(!worker.isAlive(), "HTTP worker did not finish");
      if (problem[0] != null) throw new AssertionError("HTTP worker failed", problem[0]);
      return new Reply(result);
    }
  }

  private Reply prepare() throws Exception {
    return request("POST", "action=prepare-export", Map.of("X-ATO-Backup", "1", "Origin", "http://localhost:8793"), null, "0");
  }

  private String token(Reply prepared) throws Exception { return prepared.json().getString("downloadUrl").split("\\?", 2)[1]; }

  private void run() throws Exception {
    for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) (i % 256);
    Map<String, String> sameOrigin = Map.of("X-ATO-Backup", "1", "Origin", "http://localhost:8793");
    backend.user = ""; check(prepare().status == 401, "Anonymous ZIP export allowed"); backend.user = "local";
    check(request("POST", "action=prepare-export", Map.of(), null, "0").status == 403, "Missing operation header allowed");
    check(request("POST", "action=prepare-export", Map.of("X-ATO-Backup", "1", "Origin", "http://foreign.invalid"), null, "0").status == 403, "Cross origin request allowed");
    check(request("POST", "action=prepare-export", Map.of("X-ATO-Backup", "1", "Sec-Fetch-Site", "cross-site"), null, "0").status == 403, "Cross-site request allowed");
    Reply prepared = prepare(); check(prepared.status == 200 && prepared.json().getInt("total") == 80, "Prepare failed");
    String download = token(prepared);
    backend.user = "other"; check(request("GET", download, Map.of(), null, null).status == 404, "Other account downloaded ZIP"); backend.user = "local";
    Reply zip = request("GET", download, Map.of(), null, null);
    check(zip.status == 200 && Arrays.equals(zip.body, bytes), "ZIP download bytes corrupted");
    check(zip.headers.contains("application/zip") && zip.headers.contains("attachment;"), "ZIP download headers incorrect");
    check(request("GET", download, Map.of(), null, null).status == 404, "Download token reused");
    check(request("PUT", "action=import", sameOrigin, bytes, String.valueOf(bytes.length)).status == 200, "ZIP import failed");
    check(Arrays.equals(backend.uploaded, bytes), "ISO-8859-1 body buffer changed binary ZIP bytes");
    check(request("POST", "action=import", sameOrigin, null, "0").status == 405, "Wrong upload method allowed");
    check(request("PUT", "action=import", sameOrigin, null, null).status == 411, "Missing upload length allowed");
    check(request("PUT", "action=import", Map.of("X-ATO-Backup", "1", "Transfer-Encoding", "chunked"), null, "100").status == 411, "Chunked input was treated as raw ZIP");
    check(request("PUT", "action=import", sameOrigin, null, String.valueOf(512L * 1024 * 1024 + 1)).status == 413, "Oversized upload allowed");
    check(request("PUT", "action=import", sameOrigin, null, "4,4").status == 411, "Ambiguous content length allowed");
    int previousImports = backend.imports;
    check(request("PUT", "action=import", sameOrigin, Arrays.copyOf(bytes, 50), "100").status == 400, "Truncated upload accepted");
    check(backend.imports == previousImports, "Truncated upload committed");
    backend.failure = "错误含引号 \" 和换行\n测试";
    Reply invalid = request("PUT", "action=import", sameOrigin, null, "30");
    check(invalid.status == 400 && invalid.json().getString("error").equals(backend.failure), "Import error JSON corrupted"); backend.failure = null;
    String expired = token(prepare()); now += 15 * 60 * 1000 + 1;
    check(request("GET", expired, Map.of(), null, null).status == 404, "Expired download allowed");
    String oldest = token(prepare());
    for (int i = 0; i < 4; i++) prepare();
    check(request("GET", oldest, Map.of(), null, null).status == 404, "Unbounded prepared ZIPs retained");
    handler.clear();
    check(directory.listFiles() != null && directory.listFiles().length == 0, "Prepared ZIPs not removed on server stop");
    directory.delete();
    System.out.println("Android backup LAN HTTP passed: " + checks + " checks");
  }

  public static void main(String[] args) throws Exception { new BackupHttpHarness().run(); }
}
