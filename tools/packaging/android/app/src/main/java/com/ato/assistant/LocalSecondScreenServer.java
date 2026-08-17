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
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class LocalSecondScreenServer {
  private final Context context;
  private final AtopackStore atopackStore;
  private final LocalCampaignApi localApi;
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
        executor.shutdownNow();
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
      BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.US_ASCII));
      String requestLine = reader.readLine();
      if (requestLine == null) return;
      String[] request = requestLine.split(" ", 3);
      if (request.length < 2 || !("GET".equals(request[0]) || "HEAD".equals(request[0]))) {
        sendText(connection.getOutputStream(), 405, "text/plain; charset=utf-8", "Method Not Allowed", false);
        return;
      }
      for (String header; (header = reader.readLine()) != null && !header.isEmpty();) {
        // Consume request headers before writing the response.
      }
      URI uri;
      try {
        uri = URI.create(request[1]);
      } catch (IllegalArgumentException error) {
        sendText(connection.getOutputStream(), 400, "text/plain; charset=utf-8", "Bad Request", false);
        return;
      }
      boolean head = "HEAD".equals(request[0]);
      if ("/api/campaign-state.php".equals(uri.getPath())) {
        serveApi(connection.getOutputStream(), request[1], head);
      } else {
        serveStatic(connection.getOutputStream(), uri.getRawPath(), head);
      }
    } catch (IOException ignored) {
      // Browsers commonly close stale image requests during a screen refresh.
    }
  }

  private void serveApi(OutputStream output, String target, boolean head) throws IOException {
    String resultText = localApi.handleForJavascript(android.net.Uri.parse("http://127.0.0.1" + target), "GET", "");
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
    if ("/".equals(path)) path = "/ss/";
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
    String reason = status == 200 ? "OK" : status == 400 ? "Bad Request" : status == 404 ? "Not Found"
      : status == 405 ? "Method Not Allowed" : "Error";
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
