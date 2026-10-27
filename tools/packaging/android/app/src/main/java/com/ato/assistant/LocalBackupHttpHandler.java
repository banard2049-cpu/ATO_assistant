package com.ato.assistant;

import java.io.BufferedReader;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.LongSupplier;
import org.json.JSONObject;

/** Stream the phone's daily-backup ZIPs to LAN browsers without a JS or body buffer. */
final class LocalBackupHttpHandler {
  interface Backend {
    String currentUser();
    JSONObject exportZip(String expectedUser, OutputStream destination) throws Exception;
    JSONObject importZip(String expectedUser, InputStream source) throws Exception;
  }

  private static final long MAX_ZIP = 512L * 1024 * 1024;
  private static final long TTL = 15 * 60 * 1000;
  private static final int MAX_READY = 4;
  private final File root;
  private final Backend backend;
  private final LongSupplier clock;
  private final Map<String, Download> downloads = new LinkedHashMap<>();

  private static final class Download {
    final File file;
    final String user;
    final long created;
    Download(File file, String user, long created) { this.file = file; this.user = user; this.created = created; }
  }

  LocalBackupHttpHandler(File root, Backend backend) { this(root, backend, System::currentTimeMillis); }

  LocalBackupHttpHandler(File root, Backend backend, LongSupplier clock) {
    this.root = root;
    this.backend = backend;
    this.clock = clock;
    File[] previous = root.listFiles(file -> file.isFile() && file.getName().startsWith("backup-") && file.getName().endsWith(".zip"));
    if (previous != null) for (File file : previous) if (clock.getAsLong() - file.lastModified() >= TTL) file.delete();
  }

  void handle(URI uri, String method, Map<String, String> headers, long contentLength, boolean chunked,
      BufferedReader reader, OutputStream output) throws IOException {
    Response response = new Response(output);
    try {
      String user = backend.currentUser();
      if (user == null || user.isEmpty()) throw new Failure(401, "请先在手机上登录主控台。");
      String action = query(uri, "action");
      boolean prepare = "prepare-export".equals(action);
      boolean importing = "import".equals(action);
      boolean downloading = "download".equals(action);
      if (!prepare && !importing && !downloading) throw new Failure(400, "未知备份操作。");
      if (!(prepare ? "POST".equals(method) : importing ? "PUT".equals(method) : "GET".equals(method)))
        throw new Failure(405, "不支持这种备份操作方式。");
      if (!downloading) checkOrigin(headers);
      if (downloading) {
        String token = query(uri, "token");
        if (token == null || !token.matches("[a-f0-9]{32}")) throw new Failure(404, "备份下载地址无效或已过期。");
        Download download;
        synchronized (downloads) {
          prune();
          download = downloads.get(token);
          if (download == null || !user.equals(download.user)) throw new Failure(404, "备份下载地址无效或已过期。");
          downloads.remove(token); // A successful claim consumes the token exactly once.
        }
        try { response.download(download.file); }
        finally { download.file.delete(); }
        return;
      }
      if (importing) {
        String suppliedLength = headers.get("content-length");
        if (chunked || suppliedLength == null || !suppliedLength.matches("[0-9]+") || contentLength < 0)
          throw new Failure(411, "请以带有文件长度的 ZIP 上传方式导入备份。");
        if (contentLength > MAX_ZIP) throw new Failure(413, "备份压缩包超过 512 MB。");
        if (contentLength < 22) throw new Failure(400, "不是有效的备份 ZIP 压缩包。");
        ReaderBody input = new ReaderBody(reader, contentLength);
        JSONObject result = backend.importZip(user, input);
        if (input.remaining != 0) throw new Failure(400, "备份上传未完整读取，请重新导入。");
        response.json(200, result.toString());
        return;
      }
      if (chunked || contentLength > 0) throw new Failure(400, "导出请求不应包含上传文件。");
      if (!root.isDirectory() && !root.mkdirs() && !root.isDirectory()) throw new Failure(500, "无法创建备份临时目录。");
      File file = File.createTempFile("backup-", ".zip", root);
      boolean ready = false;
      try {
        JSONObject result;
        try (OutputStream destination = new FileOutputStream(file)) { result = backend.exportZip(user, destination); }
        if (file.length() > MAX_ZIP) throw new Failure(413, "备份压缩包超过 512 MB。");
        String token = UUID.randomUUID().toString().replace("-", "");
        synchronized (downloads) {
          prune();
          while (downloads.size() >= MAX_READY) {
            Iterator<Download> oldest = downloads.values().iterator();
            oldest.next().file.delete(); oldest.remove();
          }
          downloads.put(token, new Download(file, user, clock.getAsLong()));
        }
        ready = true;
        result.put("ok", true).put("downloadUrl", "backups.php?action=download&token=" + token)
          .put("filename", "ATO-daily-backups.zip");
        response.json(200, result.toString());
      } finally { if (!ready) file.delete(); }
    } catch (Failure error) {
      response.error(error.status, error.getMessage());
    } catch (OutOfMemoryError | StackOverflowError error) {
      response.json(503, "{\"ok\":false,\"error\":\"备份处理超出当前可用内存，请释放内存后重试。\"}");
    } catch (Exception error) {
      response.error(400, error.getMessage() == null ? "备份操作失败，请检查可用空间后重试。" : error.getMessage());
    }
  }

  private void checkOrigin(Map<String, String> headers) throws Failure {
    if (!"1".equals(headers.get("x-ato-backup")) || "cross-site".equalsIgnoreCase(headers.get("sec-fetch-site")))
      throw new Failure(403, "请从当前程序的战役简报页面操作备份。");
    String origin = headers.get("origin");
    if (origin == null || origin.isEmpty()) return;
    try {
      URI address = URI.create(origin);
      String host = headers.get("host");
      if (!("http".equals(address.getScheme()) || "https".equals(address.getScheme())) || address.getUserInfo() != null
          || host == null || !host.equalsIgnoreCase(address.getRawAuthority())) throw new IllegalArgumentException();
    } catch (IllegalArgumentException error) { throw new Failure(403, "请从当前程序的战役简报页面操作备份。"); }
  }

  private void prune() {
    long now = clock.getAsLong();
    for (Iterator<Download> items = downloads.values().iterator(); items.hasNext();) {
      Download item = items.next();
      if (now - item.created >= TTL || !item.file.isFile()) { item.file.delete(); items.remove(); }
    }
  }

  void clear() {
    synchronized (downloads) { for (Download item : downloads.values()) item.file.delete(); downloads.clear(); }
  }

  private static String query(URI uri, String key) throws Failure {
    String query = uri.getRawQuery();
    if (query == null) return null;
    try {
      for (String pair : query.split("&")) {
        String[] parts = pair.split("=", 2);
        if (key.equals(URLDecoder.decode(parts[0], "UTF-8"))) return parts.length == 2 ? URLDecoder.decode(parts[1], "UTF-8") : "";
      }
      return null;
    } catch (Exception error) { throw new Failure(400, "备份请求参数无效。"); }
  }

  /** Header parsing uses ISO-8859-1, so each buffered character is one original byte. */
  static final class ReaderBody extends InputStream {
    private final BufferedReader reader;
    private final char[] buffer = new char[32 * 1024];
    long remaining;
    ReaderBody(BufferedReader reader, long length) { this.reader = reader; this.remaining = length; }
    @Override public int read() throws IOException {
      if (remaining == 0) return -1;
      int value = reader.read();
      if (value < 0) throw new EOFException("备份上传中断，请重新导入。");
      remaining--; return value;
    }
    @Override public int read(byte[] bytes, int offset, int length) throws IOException {
      if (length == 0) return 0;
      if (remaining == 0) return -1;
      int count = reader.read(buffer, 0, (int) Math.min(Math.min(length, buffer.length), remaining));
      if (count < 0) throw new EOFException("备份上传中断，请重新导入。");
      for (int i = 0; i < count; i++) bytes[offset + i] = (byte) buffer[i];
      remaining -= count; return count;
    }
  }

  private static final class Failure extends Exception {
    final int status;
    Failure(int status, String message) { super(message); this.status = status; }
  }

  private static final class Response {
    private final OutputStream output;
    private boolean started;
    Response(OutputStream output) { this.output = output; }
    void error(int status, String message) throws IOException {
      if (started) return;
      try { json(status, new JSONObject().put("ok", false).put("error", message).toString()); }
      catch (org.json.JSONException impossible) { json(status, "{\"ok\":false,\"error\":\"备份操作失败。\"}"); }
    }
    void json(int status, String json) throws IOException {
      if (started) return;
      byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
      headers(status, "application/json; charset=utf-8", bytes.length, false); output.write(bytes);
    }
    void download(File file) throws IOException {
      try (InputStream input = new FileInputStream(file)) {
        headers(200, "application/zip", file.length(), true);
        byte[] bytes = new byte[64 * 1024];
        for (int count; (count = input.read(bytes)) != -1;) output.write(bytes, 0, count);
      }
    }
    private void headers(int status, String mime, long length, boolean attachment) throws IOException {
      started = true;
      String reason = status == 200 ? "OK" : status == 400 ? "Bad Request" : status == 401 ? "Unauthorized"
        : status == 403 ? "Forbidden" : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed"
        : status == 411 ? "Length Required" : status == 413 ? "Payload Too Large" : "Error";
      String text = "HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + mime + "\r\nContent-Length: " + length
        + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n"
        + (attachment ? "Content-Disposition: attachment; filename=\"ATO-daily-backups.zip\"\r\n" : "") + "\r\n";
      output.write(text.getBytes(StandardCharsets.US_ASCII));
    }
  }
}
