package com.ato.assistant;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.webkit.MimeTypeMap;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 局域网入口：把整个应用（主控台、各模块、第二屏幕）开放给同一网段的其他设备，读和写都开放。
 *
 * 登录 / 注册 / 退出这三个 action 不转发：它们改的是这台手机的登录态（currentUser 存在
 * SharedPreferences 里），别的设备一提交就会把手机上的账号换掉或退出。局域网页面读到的
 * 「当前账号」就是手机上的账号，所以它本来也不需要登录。
 *
 * 静态文件直接来自 APK 的 assets/web（再加上导入的资源包）：/ 打开主控台，/ss/ 是第二屏。
 * 并发写入由 API 的 section 版本号（sectionRevisions）把关：版本对不上会回 409，页面自己重放。
 */
final class LocalSecondScreenServer {
  private final Context context;
  private final AtopackStore atopackStore;
  private final LocalCampaignApi localApi;

  // 不在局域网里转发的 action（见类注释）。
  private static final Set<String> LAN_BLOCKED_ACTIONS = new HashSet<>(Arrays.asList(
    "login", "register", "logout"));
  // 请求体上限：够放得下整份存档，又不至于让一次请求把内存吃光。
  private static final int MAX_BODY_BYTES = 32 * 1024 * 1024;

  private final Object lock = new Object();
  private volatile ServerSocket serverSocket;
  private volatile ExecutorService executor;

  LocalSecondScreenServer(Context context, AtopackStore atopackStore, LocalCampaignApi localApi) {
    this.context = context.getApplicationContext();
    this.atopackStore = atopackStore;
    this.localApi = localApi;
  }

  List<String> start() throws IOException {
    synchronized (lock) {
      if (serverSocket != null && !serverSocket.isClosed()) return urls();
      ServerSocket next = new ServerSocket();
      next.setReuseAddress(true);
      next.bind(new InetSocketAddress("0.0.0.0", 0));
      serverSocket = next;
      executor = Executors.newCachedThreadPool();
      executor.execute(this::acceptLoop);
      return urls();
    }
  }

  void stop() {
    synchronized (lock) {
      if (serverSocket != null) {
        try { serverSocket.close(); } catch (IOException ignored) {}
        serverSocket = null;
      }
      if (executor != null) {
        // 只 shutdown 不 shutdownNow：局域网页面也可能提交「关闭第二屏幕」（这会走到这里），
        // 打断正在处理的那个请求会让它连响应都收不到。排空在跑的请求即可，
        // accept 循环会因为 socket 关闭而退出。
        executor.shutdown();
        executor = null;
      }
    }
  }

  List<String> urls() {
    ServerSocket current = serverSocket;
    if (current == null || current.isClosed()) return Collections.emptyList();
    int port = current.getLocalPort();
    Set<String> values = new LinkedHashSet<>();
    addConnectedLanAddresses(values, port);
    try {
      Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
      while (interfaces != null && interfaces.hasMoreElements()) {
        NetworkInterface network = interfaces.nextElement();
        if (!network.isUp() || network.isLoopback()) continue;
        Enumeration<InetAddress> addresses = network.getInetAddresses();
        while (addresses.hasMoreElements()) {
          addLanAddress(values, port, addresses.nextElement());
        }
      }
    } catch (Exception ignored) {
      // ConnectivityManager results above remain available on normal Android networks.
    }
    return new ArrayList<>(values);
  }

  private void addConnectedLanAddresses(Set<String> values, int port) {
    try {
      ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (manager == null) return;
      Network active = manager.getActiveNetwork();
      if (active != null) addNetworkAddresses(manager, active, values, port, true);
      for (Network network : manager.getAllNetworks()) {
        if (active != null && active.equals(network)) continue;
        addNetworkAddresses(manager, network, values, port, false);
      }
    } catch (Exception ignored) {
      // NetworkInterface enumeration below is the compatibility fallback.
    }
  }

  private static void addNetworkAddresses(
    ConnectivityManager manager, Network network, Set<String> values, int port, boolean active
  ) {
    NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
    boolean lanTransport = capabilities != null && (
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    );
    if (!active && !lanTransport) return;
    LinkProperties properties = manager.getLinkProperties(network);
    if (properties == null) return;
    for (LinkAddress linkAddress : properties.getLinkAddresses()) {
      addLanAddress(values, port, linkAddress.getAddress());
    }
  }

  private static void addLanAddress(Set<String> values, int port, InetAddress address) {
    if (!(address instanceof Inet4Address)
      || address.isAnyLocalAddress()
      || address.isLoopbackAddress()
      || address.isLinkLocalAddress()
      || !address.isSiteLocalAddress()) return;
    values.add("http://" + address.getHostAddress() + ":" + port + "/ss/");
  }

  private void acceptLoop() {
    while (true) {
      ServerSocket current = serverSocket;
      if (current == null || current.isClosed()) return;
      try {
        Socket socket = current.accept();
        ExecutorService pool = executor;
        if (pool != null) pool.execute(() -> handle(socket));
        else socket.close();
      } catch (IOException error) {
        if (current.isClosed()) return;
      }
    }
  }

  private void handle(Socket socket) {
    try (Socket connection = socket) {
      connection.setSoTimeout(10_000);
      // 表头用 ISO-8859-1 读：1 字节 = 1 字符，无损，所以后面能按字符读请求体再还原成 UTF-8。
      BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.ISO_8859_1));
      String requestLine = reader.readLine();
      if (requestLine == null) return;
      String[] request = requestLine.split(" ", 3);
      if (request.length < 2) {
        sendText(connection.getOutputStream(), 400, "text/plain; charset=utf-8", "Bad Request", false);
        return;
      }
      long contentLength = -1;
      boolean chunked = false;
      for (String header; (header = reader.readLine()) != null && !header.isEmpty();) {
        int separator = header.indexOf(':');
        if (separator <= 0) continue;
        String name = header.substring(0, separator).trim().toLowerCase(Locale.ROOT);
        String value = header.substring(separator + 1).trim();
        if ("content-length".equals(name)) {
          try { contentLength = Long.parseLong(value); } catch (NumberFormatException ignored) { contentLength = -1; }
        } else if ("transfer-encoding".equals(name) && value.toLowerCase(Locale.ROOT).contains("chunked")) {
          chunked = true;
        }
      }
      URI uri;
      try {
        uri = URI.create(request[1]);
      } catch (IllegalArgumentException error) {
        sendText(connection.getOutputStream(), 400, "text/plain; charset=utf-8", "Bad Request", false);
        return;
      }
      String method = request[0];
      boolean head = "HEAD".equals(method);
      boolean get = "GET".equals(method);
      boolean post = "POST".equals(method);
      boolean api = "/api/campaign-state.php".equals(uri.getPath()) || "/briefing/api.php".equals(uri.getPath())
          || "/api/aibp-image-index.php".equals(uri.getPath());
      if (!get && !head && !post) {
        // 页面只用 GET 和 POST：其它方法按 HTTP 语义回 405（API 也用 JSON 说明一下）。
        if (api) sendText(connection.getOutputStream(), 405, "application/json; charset=utf-8", apiMethodNotAllowed(), head);
        else sendText(connection.getOutputStream(), 405, "text/plain; charset=utf-8", "Method Not Allowed", false);
        return;
      }
      if (api && !allowedApiAction(uri)) {
        sendText(connection.getOutputStream(), 403, "application/json; charset=utf-8", apiBlocked(), head);
        return;
      }
      String body = "";
      if (post) {
        try {
          body = readBody(reader, contentLength, chunked);
        } catch (IOException tooLarge) {
          sendText(connection.getOutputStream(), 413, "text/plain; charset=utf-8", "Payload Too Large", false);
          return;
        }
      }
      if (api) {
        serveApi(connection.getOutputStream(), request[1], method, body, head);
      } else {
        serveStatic(connection.getOutputStream(), uri.getRawPath(), head);
      }
    } catch (IOException ignored) {
      // Browsers commonly close stale image requests during a screen refresh.
    }
  }

  // 局域网里读写都放行，只有登录 / 注册 / 退出不在局域网转发（见类注释）。
  // 这里用的是 java.net.URI（见文件顶部的 import），它没有 getQueryParameter —— 那是
  // android.net.Uri 的方法。手写查询串解析，只依赖 JDK 的 getRawQuery / URLDecoder（两者都已导入）。
  private static boolean allowedApiAction(URI uri) {
    try {
      String action = queryParameter(uri.getRawQuery(), "action");
      return action == null || !LAN_BLOCKED_ACTIONS.contains(action);
    } catch (IllegalArgumentException error) {
      return false;
    }
  }

  /**
   * 读出请求体（GET/HEAD 之外只有 POST 会走到这里）。
   *
   * 表头是 ISO-8859-1 读的，所以每个字符就是原始的一个字节；请求体是 UTF-8 的 JSON，
   * 按字符读出后再按 ISO-8859-1 还原字节、用 UTF-8 解码，中文才不会变乱码。
   * 浏览器用 fetch 发字符串时都会带 Content-Length；万一遇到 chunked 也顺手支持。
   */
  private static String readBody(BufferedReader reader, long contentLength, boolean chunked) throws IOException {
    StringBuilder raw = new StringBuilder();
    if (chunked) {
      while (true) {
        String sizeLine = reader.readLine();
        if (sizeLine == null) break;
        int extension = sizeLine.indexOf(';');
        String sizeText = (extension < 0 ? sizeLine : sizeLine.substring(0, extension)).trim();
        int size;
        try {
          size = Integer.parseInt(sizeText, 16);
        } catch (NumberFormatException error) {
          break;
        }
        if (size <= 0) break;
        if (raw.length() + size > MAX_BODY_BYTES) throw new IOException("Request body too large.");
        char[] chunk = new char[size];
        int read = 0;
        while (read < chunk.length) {
          int count = reader.read(chunk, read, chunk.length - read);
          if (count < 0) break;
          read += count;
        }
        raw.append(chunk, 0, read);
        reader.readLine();
      }
    } else if (contentLength > 0) {
      if (contentLength > MAX_BODY_BYTES) throw new IOException("Request body too large.");
      char[] buffer = new char[(int) contentLength];
      int read = 0;
      while (read < buffer.length) {
        int count = reader.read(buffer, read, buffer.length - read);
        if (count < 0) break;
        read += count;
      }
      raw.append(buffer, 0, read);
    }
    if (raw.length() == 0) return "";
    return new String(raw.toString().getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8);
  }

  // URLDecoder.decode(String, Charset) 是 Android 13（API 33）才加入的重载，而本项目
  // 最低支持 API 24（见 app/build.gradle.kts）。用新重载能让编译通过，旧手机运行到这一行
  // 却会抛 NoSuchMethodError；这里是后台线程，只 catch IOException 的 handle() 拦不住它，
  // 未捕获异常会把整个应用结束掉。固定走 API 1 起就存在的 decode(String, String) 重载。
  private static String decodeQueryPart(String value) {
    try {
      return URLDecoder.decode(value, "UTF-8");
    } catch (UnsupportedEncodingException error) {
      // UTF-8 是 JDK 规定必须支持的编码，正常到不了这里；转成调用方已处理的
      // IllegalArgumentException，避免把受检异常扩散到整个请求处理链路。
      throw new IllegalArgumentException("Unsupported encoding: UTF-8", error);
    }
  }

  // rawQuery 是已编码的查询串（不含 '?'），可能为 null。
  private static String queryParameter(String rawQuery, String name) {
    if (rawQuery == null || rawQuery.isEmpty()) return null;
    for (String pair : rawQuery.split("&")) {
      if (pair.isEmpty()) continue;
      int separator = pair.indexOf('=');
      String key = separator < 0 ? pair : pair.substring(0, separator);
      if (!name.equals(decodeQueryPart(key))) continue;
      String value = separator < 0 ? "" : pair.substring(separator + 1);
      return decodeQueryPart(value);
    }
    return null;
  }

  private static String apiBlocked() {
    return "{\"ok\":false,\"code\":\"LAN_SESSION_LOCAL\",\"error\":\"登录、注册、退出只能在这台手机上操作。\"}";
  }

  private static String apiMethodNotAllowed() {
    return "{\"ok\":false,\"error\":\"Unsupported method.\"}";
  }

  private void serveApi(OutputStream output, String target, String method, String body, boolean head) throws IOException {
    String resultText = localApi.handleForJavascript(android.net.Uri.parse("http://127.0.0.1" + target), method, body);
    try {
      JSONObject result = new JSONObject(resultText);
      sendText(output, result.optInt("status", 500), "application/json; charset=utf-8", result.optString("body", "{}"), head);
    } catch (Exception error) {
      sendText(output, 500, "application/json; charset=utf-8", "{\"ok\":false,\"error\":\"Local API failed.\"}", head);
    }
  }

  private void serveStatic(OutputStream output, String rawPath, boolean head) throws IOException {
    String path;
    try {
      path = URLDecoder.decode(rawPath == null ? "/" : rawPath, "UTF-8");
    } catch (IllegalArgumentException error) {
      sendText(output, 400, "text/plain; charset=utf-8", "Bad Request", head);
      return;
    }
    if ("/".equals(path)) path = "/index.html";
    if (path.endsWith("/")) path += "index.html";
    String relative = path.startsWith("/") ? path.substring(1) : path;
    if (!safeRelative(relative)) {
      sendText(output, 400, "text/plain; charset=utf-8", "Bad Request", head);
      return;
    }

    AtopackStore.OpenedResource imported = atopackStore.open(relative);
    InputStream input = imported == null ? null : imported.input;
    String mimeType = imported == null ? mimeType(relative) : imported.mimeType;
    if (input == null) {
      try {
        input = new BufferedInputStream(context.getAssets().open("web/" + relative));
      } catch (IOException missing) {
        sendText(output, 404, "text/plain; charset=utf-8", "Not Found", head);
        return;
      }
    }

    try (InputStream resource = input) {
      writeHeaders(output, 200, mimeType, -1);
      if (!head) copy(resource, output);
    }
  }

  private static boolean safeRelative(String path) {
    if (path.isEmpty() || path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) return false;
    for (String part : path.split("/", -1)) {
      if (part.isEmpty() || ".".equals(part) || "..".equals(part)) return false;
    }
    return true;
  }

  private static String mimeType(String path) {
    String lower = path.toLowerCase(Locale.ROOT);
    if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (lower.endsWith(".json")) return "application/json; charset=utf-8";
    if (lower.endsWith(".css")) return "text/css; charset=utf-8";
    if (lower.endsWith(".html")) return "text/html; charset=utf-8";
    String extension = MimeTypeMap.getFileExtensionFromUrl(path);
    String detected = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));
    return detected == null ? "application/octet-stream" : detected;
  }

  private static void sendText(OutputStream output, int status, String contentType, String body, boolean head) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    writeHeaders(output, status, contentType, bytes.length);
    if (!head) output.write(bytes);
  }

  private static void writeHeaders(OutputStream output, int status, String contentType, long length) throws IOException {
    String reason = status == 200 ? "OK" : status == 400 ? "Bad Request" : status == 403 ? "Forbidden"
      : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed"
      : status == 413 ? "Payload Too Large" : "Error";
    StringBuilder headers = new StringBuilder("HTTP/1.1 ").append(status).append(' ').append(reason).append("\r\n")
      .append("Content-Type: ").append(contentType).append("\r\n")
      .append("Cache-Control: no-store\r\n")
      .append("X-Content-Type-Options: nosniff\r\n")
      .append("Connection: close\r\n");
    if (length >= 0) headers.append("Content-Length: ").append(length).append("\r\n");
    headers.append("\r\n");
    output.write(headers.toString().getBytes(StandardCharsets.US_ASCII));
  }

  private static void copy(InputStream input, OutputStream output) throws IOException {
    byte[] buffer = new byte[64 * 1024];
    for (int count; (count = input.read(buffer)) != -1;) output.write(buffer, 0, count);
  }
}
