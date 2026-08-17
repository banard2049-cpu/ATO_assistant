package com.ato.assistant;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.util.AtomicFile;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipFile;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

final class AtopackStore {
  private static final int PACKAGE_VERSION = 2;
  private static final int MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
  private static final int MAX_ENTITY_INDEX_BYTES = 128 * 1024 * 1024;
  private static final int MAX_ASSETS = 20_000;
  private static final String WEB_PREFIX = "/android_asset/web/";

  private final Context context;
  private final File root;
  private final File blobs;
  private final AtomicFile indexFile;
  private final AtomicFile storiesFile;
  private final Map<String, String> knownTargets;
  private volatile Map<String, ResourceEntry> resources;
  private volatile String updatedAt = "";

  AtopackStore(Context context) {
    this.context = context.getApplicationContext();
    root = new File(this.context.getFilesDir(), "atopack");
    blobs = new File(root, "blobs");
    if (!blobs.exists()) blobs.mkdirs();
    indexFile = new AtomicFile(new File(root, "index.json"));
    storiesFile = new AtomicFile(new File(root, "stories.json"));
    knownTargets = loadCatalog();
    resources = loadIndex();
  }

  WebResourceResponse intercept(Uri uri) {
    if (!"file".equals(uri.getScheme())) return null;
    String path = uri.getPath();
    if (path == null || !path.startsWith(WEB_PREFIX)) return null;
    String relative;
    try {
      relative = safePath(path.substring(WEB_PREFIX.length()), "资源路径");
    } catch (IOException ignored) {
      return null;
    }
    OpenedResource resource = open(relative);
    return resource == null ? null : new WebResourceResponse(resource.mimeType, encodingFor(resource.mimeType), resource.input);
  }

  OpenedResource open(String relative) {
    ResourceEntry entry = resources.get(relative);
    if (entry == null) return null;
    File blob = new File(blobs, entry.sha256);
    if (!blob.isFile()) return null;
    try {
      return new OpenedResource(entry.mimeType, new BufferedInputStream(new FileInputStream(blob)));
    } catch (IOException ignored) {
      return null;
    }
  }

  JSONObject status() {
    JSONObject result = new JSONObject();
    try {
      result.put("installed", !resources.isEmpty());
      result.put("resources", resources.size());
      result.put("updatedAt", updatedAt);
    } catch (JSONException ignored) {
      // These fixed keys and primitive values cannot fail in practice.
    }
    return result;
  }

  synchronized ImportResult importPackage(ContentResolver resolver, Uri sourceUri) throws Exception {
    if (!root.exists() && !root.mkdirs()) throw new IOException("无法创建资料包存储目录");
    File packageFile = File.createTempFile("import-", ".atopack", context.getCacheDir());
    try {
      try (InputStream input = resolver.openInputStream(sourceUri); FileOutputStream output = new FileOutputStream(packageFile)) {
        if (input == null) throw new IOException("无法读取所选资料包");
        copy(input, output, null);
      }
      return importZip(packageFile);
    } finally {
      packageFile.delete();
    }
  }

  private ImportResult importZip(File packageFile) throws Exception {
    try (ZipFile archive = new ZipFile(packageFile)) {
      ZipArchiveEntry manifestEntry = archive.getEntry("manifest.json");
      if (manifestEntry == null) throw new IOException("资料包缺少 manifest.json");
      JSONObject manifest = new JSONObject(new String(readLimited(archive, manifestEntry, MAX_MANIFEST_BYTES), StandardCharsets.UTF_8));
      if (!"ato-asset-pack".equals(manifest.optString("format"))) throw new IOException("不是有效的 .atopack 资料包");
      int version = manifest.optInt("version", 0);
      if (version < 1 || version > PACKAGE_VERSION) throw new IOException("不支持的资料包版本：" + version);

      Map<String, JSONObject> items = catalogItems(manifest.optJSONArray("items"));
      JSONArray assets = manifest.optJSONArray("assets");
      if (assets == null) assets = new JSONArray();
      if (assets.length() > MAX_ASSETS) throw new IOException("资料包资源数量超过限制");

      Map<String, ResourceEntry> next = new HashMap<>(resources);
      int importedAssets = 0;
      for (int index = 0; index < assets.length(); index++) {
        JSONObject asset = assets.getJSONObject(index);
        String itemId = asset.optString("itemId");
        String face = asset.optString("face");
        JSONObject item = items.get(itemId);
        JSONObject faces = item == null ? null : item.optJSONObject("faces");
        String declaredTarget = faces == null ? "" : faces.optString(face);
        String target = knownTargets.get(catalogKey(itemId, face));
        if (target == null) throw new IOException("资源不在当前 Asset Studio 名单中：" + itemId + "/" + face);
        if (declaredTarget.isEmpty() || !target.equals(safePath(declaredTarget, "资源目标路径"))) {
          throw new IOException("资料包资源映射与 Asset Studio 名单不一致：" + itemId + "/" + face);
        }
        if (!isImageTarget(target)) throw new IOException("资料包图片目标类型不受支持：" + target);
        String member = safePath(asset.optString("member"), "资料包成员路径");
        String sha256 = validSha256(asset.optString("sha256"));
        ZipArchiveEntry entry = archive.getEntry(member);
        if (entry == null || entry.isDirectory()) throw new IOException("资料包文件缺失：" + member);
        installBlob(archive, entry, sha256);
        next.put(target, new ResourceEntry(sha256, safeMime(asset.optString("mimeType"), target)));
        importedAssets++;
      }

      JSONObject incomingStories = manifest.optJSONObject("stories");
      JSONArray incomingBooks = incomingStories == null ? null : incomingStories.optJSONArray("books");
      int incomingBookCount = incomingBooks == null ? 0 : incomingBooks.length();
      boolean entityIndexImported = importStoryFiles(archive, manifest.optJSONArray("storyFiles"), next);
      if (version >= 2 && incomingBookCount > 0 && !entityIndexImported) {
        throw new IOException("新版资料包含有故事，但没有人物小传索引");
      }
      int importedBooks = mergeStories(incomingStories, next);

      updatedAt = Long.toString(System.currentTimeMillis());
      writeIndex(next);
      resources = next;
      return new ImportResult(importedAssets, importedBooks, entityIndexImported, next.size());
    }
  }

  private Map<String, JSONObject> catalogItems(JSONArray items) throws JSONException {
    Map<String, JSONObject> result = new HashMap<>();
    if (items == null) return result;
    for (int index = 0; index < items.length(); index++) {
      JSONObject item = items.getJSONObject(index);
      String id = item.optString("id");
      if (!id.isEmpty()) result.put(id, item);
    }
    return result;
  }

  private int mergeStories(JSONObject incoming, Map<String, ResourceEntry> next) throws Exception {
    JSONArray incomingBooks = incoming == null ? null : incoming.optJSONArray("books");
    if (incomingBooks == null || incomingBooks.length() == 0) return 0;
    JSONObject merged = readJson(storiesFile, new JSONObject().put("books", new JSONArray()));
    JSONArray currentBooks = merged.optJSONArray("books");
    if (currentBooks == null) currentBooks = new JSONArray();
    Map<String, JSONObject> byId = new TreeMap<>();
    for (int index = 0; index < currentBooks.length(); index++) {
      JSONObject book = currentBooks.optJSONObject(index);
      if (book != null && !book.optString("id").isEmpty()) byId.put(book.optString("id"), book);
    }
    for (int index = 0; index < incomingBooks.length(); index++) {
      JSONObject book = incomingBooks.getJSONObject(index);
      String id = book.optString("id");
      if (id.isEmpty()) throw new IOException("故事册缺少 id");
      byId.put(id, book);
    }
    JSONArray books = new JSONArray();
    for (JSONObject book : byId.values()) books.put(book);
    JSONObject payload = new JSONObject();
    payload.put("generatedAt", incoming.optString("generatedAt", "Android .atopack import"));
    payload.put("books", books);
    writeJson(storiesFile, payload);
    installGenerated(next, "story/data/storybook-data.js", "application/javascript", "window.STORYBOOK_DATA = " + payload + ";\n");
    return incomingBooks.length();
  }

  private boolean importStoryFiles(ZipFile archive, JSONArray files, Map<String, ResourceEntry> next) throws Exception {
    if (files == null) return false;
    boolean imported = false;
    for (int index = 0; index < files.length(); index++) {
      JSONObject storyFile = files.getJSONObject(index);
      if (!"entity-index".equals(storyFile.optString("kind"))) {
        throw new IOException("不支持的故事附加文件：" + storyFile.optString("kind"));
      }
      String member = safePath(storyFile.optString("member"), "故事附加文件路径");
      if (!"story/entity-index.json".equals(member)) throw new IOException("人物小传索引路径无效");
      ZipArchiveEntry entry = archive.getEntry(member);
      if (entry == null || entry.isDirectory()) throw new IOException("资料包声明的人物小传索引缺失");
      byte[] raw = readLimited(archive, entry, MAX_ENTITY_INDEX_BYTES);
      String expected = validSha256(storyFile.optString("sha256"));
      if (!expected.equals(hex(digest(raw)))) throw new IOException("人物小传索引校验失败");
      JSONObject entityIndex = new JSONObject(new String(raw, StandardCharsets.UTF_8));
      JSONArray entities = entityIndex.optJSONArray("entities");
      if (entities == null || entities.length() == 0) throw new IOException("人物小传索引没有实体数据");
      installGenerated(next, "story/data/entity-index.json", "application/json", entityIndex.toString());
      installGenerated(next, "story/data/entity-index.js", "application/javascript", "(function () {\n  window.STORY_ENTITY_INDEX = " + entityIndex + ";\n})();\n");
      imported = true;
    }
    return imported;
  }

  private void installGenerated(Map<String, ResourceEntry> next, String target, String mimeType, String content) throws Exception {
    byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
    String sha256 = hex(digest(bytes));
    File blob = new File(blobs, sha256);
    if (!blob.isFile()) {
      File temporary = File.createTempFile("blob-", ".tmp", blobs);
      try (FileOutputStream output = new FileOutputStream(temporary)) {
        output.write(bytes);
      }
      moveBlob(temporary, blob);
    }
    next.put(target, new ResourceEntry(sha256, mimeType));
  }

  private void installBlob(ZipFile archive, ZipArchiveEntry entry, String expected) throws Exception {
    File destination = new File(blobs, expected);
    if (destination.isFile()) return;
    File temporary = File.createTempFile("blob-", ".tmp", blobs);
    MessageDigest digest = sha256();
    try {
      try (InputStream input = archive.getInputStream(entry); FileOutputStream output = new FileOutputStream(temporary)) {
        copy(input, output, digest);
      }
      if (!expected.equals(hex(digest.digest()))) throw new IOException("资料包文件校验失败：" + entry.getName());
      moveBlob(temporary, destination);
    } finally {
      if (temporary.exists()) temporary.delete();
    }
  }

  private void moveBlob(File temporary, File destination) throws IOException {
    if (destination.isFile()) {
      temporary.delete();
      return;
    }
    if (!temporary.renameTo(destination)) throw new IOException("无法保存导入资源");
  }

  private Map<String, ResourceEntry> loadIndex() {
    Map<String, ResourceEntry> result = new HashMap<>();
    try {
      JSONObject index = readJson(indexFile, new JSONObject());
      updatedAt = index.optString("updatedAt");
      JSONObject files = index.optJSONObject("files");
      if (files == null) return result;
      Iterator<String> paths = files.keys();
      while (paths.hasNext()) {
        String path = paths.next();
        JSONObject value = files.optJSONObject(path);
        if (value == null) continue;
        String sha256 = validSha256(value.optString("sha256"));
        if (new File(blobs, sha256).isFile()) result.put(path, new ResourceEntry(sha256, value.optString("mimeType", "application/octet-stream")));
      }
    } catch (Exception ignored) {
      // A damaged index disables overrides; the bundled application remains usable.
    }
    return result;
  }

  private Map<String, String> loadCatalog() {
    Map<String, String> result = new HashMap<>();
    try (InputStream input = context.getAssets().open("atopack-catalog.json")) {
      JSONObject catalog = new JSONObject(new String(readAll(input, MAX_MANIFEST_BYTES), StandardCharsets.UTF_8));
      if (!"ato-android-resource-catalog".equals(catalog.optString("format"))) return result;
      JSONArray items = catalog.optJSONArray("items");
      if (items == null) return result;
      for (int itemIndex = 0; itemIndex < items.length(); itemIndex++) {
        JSONObject item = items.getJSONObject(itemIndex);
        String itemId = item.optString("id");
        JSONObject faces = item.optJSONObject("faces");
        if (itemId.isEmpty() || faces == null) continue;
        Iterator<String> faceNames = faces.keys();
        while (faceNames.hasNext()) {
          String face = faceNames.next();
          String target = safePath(faces.optString(face), "Asset Studio 资源路径");
          result.put(catalogKey(itemId, face), target);
        }
      }
    } catch (Exception ignored) {
      // Import reports unknown resources if the bundled catalog is unavailable.
    }
    return result;
  }

  private void writeIndex(Map<String, ResourceEntry> values) throws Exception {
    JSONObject files = new JSONObject();
    for (Map.Entry<String, ResourceEntry> value : values.entrySet()) {
      files.put(value.getKey(), new JSONObject().put("sha256", value.getValue().sha256).put("mimeType", value.getValue().mimeType));
    }
    writeJson(indexFile, new JSONObject().put("version", 1).put("updatedAt", updatedAt).put("files", files));
  }

  private static JSONObject readJson(AtomicFile file, JSONObject fallback) throws Exception {
    if (!file.getBaseFile().isFile()) return fallback;
    try (InputStream input = file.openRead()) {
      return new JSONObject(new String(readAll(input, MAX_MANIFEST_BYTES), StandardCharsets.UTF_8));
    }
  }

  private static void writeJson(AtomicFile file, JSONObject value) throws IOException {
    FileOutputStream output = null;
    try {
      output = file.startWrite();
      output.write(value.toString().getBytes(StandardCharsets.UTF_8));
      file.finishWrite(output);
    } catch (IOException error) {
      if (output != null) file.failWrite(output);
      throw error;
    }
  }

  private static byte[] readLimited(ZipFile archive, ZipArchiveEntry entry, int maximum) throws IOException {
    if (entry.getSize() > maximum) throw new IOException("资料包文件过大：" + entry.getName());
    try (InputStream input = archive.getInputStream(entry)) {
      return readAll(input, maximum);
    }
  }

  private static byte[] readAll(InputStream input, int maximum) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[64 * 1024];
    int total = 0;
    for (int count; (count = input.read(buffer)) != -1;) {
      total += count;
      if (total > maximum) throw new IOException("资料包元数据过大");
      output.write(buffer, 0, count);
    }
    return output.toByteArray();
  }

  private static void copy(InputStream input, FileOutputStream output, MessageDigest digest) throws IOException {
    byte[] buffer = new byte[1024 * 1024];
    for (int count; (count = input.read(buffer)) != -1;) {
      output.write(buffer, 0, count);
      if (digest != null) digest.update(buffer, 0, count);
    }
  }

  private static String safePath(String raw, String label) throws IOException {
    String value = raw == null ? "" : raw.trim().replace('\\', '/');
    if (value.isEmpty() || value.startsWith("/") || value.contains(":")) throw new IOException(label + "无效：" + raw);
    String[] parts = value.split("/", -1);
    StringBuilder normalized = new StringBuilder();
    for (String part : parts) {
      if (part.isEmpty() || ".".equals(part) || "..".equals(part)) throw new IOException(label + "不安全：" + raw);
      if (normalized.length() > 0) normalized.append('/');
      normalized.append(part);
    }
    return normalized.toString();
  }

  private static String validSha256(String value) throws IOException {
    String normalized = value == null ? "" : value.toLowerCase(Locale.ROOT);
    if (!normalized.matches("[0-9a-f]{64}")) throw new IOException("资料包 SHA-256 无效");
    return normalized;
  }

  private static String safeMime(String mimeType, String target) {
    if (mimeType != null && mimeType.toLowerCase(Locale.ROOT).startsWith("image/")) return mimeType;
    String extension = MimeTypeMap.getFileExtensionFromUrl(target);
    String detected = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));
    return detected == null ? "application/octet-stream" : detected;
  }

  private static boolean isImageTarget(String target) {
    String lower = target.toLowerCase(Locale.ROOT);
    return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")
      || lower.endsWith(".webp") || lower.endsWith(".gif");
  }

  private static String catalogKey(String itemId, String face) {
    return itemId + "\n" + face;
  }

  private static String encodingFor(String mimeType) {
    return mimeType.startsWith("text/") || mimeType.contains("javascript") || mimeType.contains("json") ? "UTF-8" : null;
  }

  private static MessageDigest sha256() throws NoSuchAlgorithmException {
    return MessageDigest.getInstance("SHA-256");
  }

  private static byte[] digest(byte[] value) throws NoSuchAlgorithmException {
    return sha256().digest(value);
  }

  private static String hex(byte[] bytes) {
    StringBuilder result = new StringBuilder(bytes.length * 2);
    for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
    return result.toString();
  }

  static final class ImportResult {
    final int assets;
    final int books;
    final boolean entityIndex;
    final int totalResources;

    ImportResult(int assets, int books, boolean entityIndex, int totalResources) {
      this.assets = assets;
      this.books = books;
      this.entityIndex = entityIndex;
      this.totalResources = totalResources;
    }

    JSONObject toJson() throws JSONException {
      return new JSONObject().put("ok", true).put("assets", assets).put("books", books)
        .put("entityIndex", entityIndex).put("totalResources", totalResources);
    }
  }

  static final class OpenedResource {
    final String mimeType;
    final InputStream input;

    OpenedResource(String mimeType, InputStream input) {
      this.mimeType = mimeType;
      this.input = input;
    }
  }

  private static final class ResourceEntry {
    final String sha256;
    final String mimeType;

    ResourceEntry(String sha256, String mimeType) {
      this.sha256 = sha256;
      this.mimeType = mimeType;
    }
  }
}
