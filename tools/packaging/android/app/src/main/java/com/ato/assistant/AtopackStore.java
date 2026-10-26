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
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

final class AtopackStore {
  private static final int PACKAGE_VERSION = 3;
  private static final int MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
  private static final int MAX_ENTITY_INDEX_BYTES = 128 * 1024 * 1024;
  private static final byte[] ENTITY_INDEX_SCRIPT_PREFIX =
      "(function () {\n  window.STORY_ENTITY_INDEX = ".getBytes(StandardCharsets.UTF_8);
  private static final byte[] ENTITY_INDEX_SCRIPT_SUFFIX = ";\n})();\n".getBytes(StandardCharsets.UTF_8);
  private static final long MAX_BGM_BYTES = 32L * 1024 * 1024;
  private static final int MAX_BGM_FILES = 128;
  private static final long MAX_ICON_BYTES = 1024L * 1024;
  private static final int MAX_ICON_FILES = 256;
  private static final long MAX_CRYPTIC_BYTES = 128L * 1024;
  private static final int MAX_CRYPTIC_FILES = 256;
  private static final int MAX_MAP_FILES = 2048;
  private static final long MAX_MAP_BYTES = 8L * 1024 * 1024;
  private static final String MAP_IMAGE_PATTERN =
      "map/images/(?:hd1024/(?:base|overlay)/c[1-5]-tile-[A-Za-z0-9-]+\\.png"
      + "|hd1024/overlay/c[1-5]-tile-[A-Za-z0-9-]+-corners\\.svg"
      + "|card-backs/(?:c[1-4]-base\\.png|numbers/c[1-4]-tile-[A-Za-z0-9-]+\\.png"
      + "|vectors/c[1-5]-tile-[A-Za-z0-9-]+\\.svg))";
  // 混合媒体（私有映射表 + 书籍裁图）：上限与 asset-studio/app/mixed_media_resources.py 一致——
  // mapping.js 单份 ≤ 32MB，单张裁图 ≤ 8MB，成员总数 ≤ 2048 + 1（映射表一份）。
  // 两个字节上限分开写：合成一个 32MB 会把裁图的上限放宽 4 倍，合成一个 8MB 又会拒掉
  // 实测约 12MB 的映射表，都不安全。
  private static final long MAX_MIXED_MEDIA_MAPPING_BYTES = 32L * 1024 * 1024;
  private static final long MAX_MIXED_MEDIA_IMAGE_BYTES = 8L * 1024 * 1024;
  private static final int MAX_MIXED_MEDIA_FILES = 2048 + 1;
  // 与渲染器 story/assets/mixed-media/renderer.js 的 pathOK 逐字一致（小写名、不含点、
  // 后缀小写）；mapping.js 是这条通道里唯一允许的非图片目标。
  private static final String MIXED_MEDIA_MAPPING = "story/assets/mixed-media/mapping.js";
  private static final String MIXED_MEDIA_IMAGE_PATTERN =
      "story/assets/mixed-media/images/c[1-5]/[a-z0-9][a-z0-9_-]*\\.(?:png|svg)";
  private static final int MAX_ASSETS = 20_000;
  // Match Asset Studio's archive limits, including members outside known sections.
  private static final long MAX_MEMBER_BYTES = 128L * 1024 * 1024;
  private static final long MAX_PACKAGE_TOTAL_BYTES = 8L * 1024 * 1024 * 1024;
  private static final String WEB_PREFIX = "/android_asset/web/";
  // 二进制素材（不是图片）只允许落在这个前缀下，与 tools/build_fan_pack.py、
  // app/installer.py 的同名规则保持一致。
  private static final String BINARY_TARGET_PREFIX = "aibp/ps/other/";
  private static final String BOARD_SOURCE = "ss/battle-board/battle-board.jpg";
  private static final String LEGACY_BOARD_SOURCE = "ss/battle-board.jpg";

  private static String canonicalBoardPath(String path) {
    if (LEGACY_BOARD_SOURCE.equals(path) || (LEGACY_BOARD_SOURCE + ".preview.jpg").equals(path)) {
      return BOARD_SOURCE + path.substring(LEGACY_BOARD_SOURCE.length());
    }
    return path;
  }

  private static String alternateMapOverlayPath(String path) {
    if (!path.startsWith("map/images/hd1024/overlay/")) return null;
    if (path.endsWith("-corners.svg")) return path.substring(0, path.length() - "-corners.svg".length()) + ".png";
    if (path.endsWith(".png")) return path.substring(0, path.length() - 4) + "-corners.svg";
    return null;
  }
  // 页面从 web/index.html 加载，而 aibp/ 里的脚本按 ps/... 取资源；补全一层前缀：
  // 先按清单里的完整路径找，再按“页面视角的少一层路径”找。
  private static final String[] OPEN_PATH_PREFIXES = {"", "aibp/"};

  private final Context context;
  private final File root;
  private final File blobs;
  private final AtomicFile indexFile;
  private final AtomicFile storiesFile;
  private final Map<String, String> knownTargets;
  private final Map<String, String> retiredCardBackTargets = new HashMap<>();
  private final Map<String, String> retiredCardBackHashes = new HashMap<>();
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
    loadCardBackMapping();
    File[] leftovers = root.listFiles((directory, name) -> name.startsWith("import-") && name.endsWith(".staging"));
    if (leftovers != null) for (File leftover : leftovers) restoreInterruptedRepairs(leftover);
    resources = loadIndex();
    removeUnreferencedBlobs();
    if (leftovers != null) for (File leftover : leftovers) removeStaging(leftover);
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
    if (resource == null) return null;
    String encoding = encodingFor(resource.mimeType);
    if (resource.length < 0) return new WebResourceResponse(resource.mimeType, encoding, resource.input);
    // 故事书的官方正文/人物索引/mapping 都有十几兆：显式长度让 WebView 按流读取，
    // 不至于把整个响应当成未知长度缓冲在内存里。
    Map<String, String> headers = new HashMap<>();
    headers.put("Content-Length", Long.toString(resource.length));
    headers.put("Cache-Control", "no-store");
    return new WebResourceResponse(resource.mimeType, encoding, 200, "OK", headers, resource.input);
  }

  OpenedResource open(String relative) {
    String normalized;
    try {
      normalized = canonicalBoardPath(safePath(relative, "资源路径"));
    } catch (IOException ignored) {
      return null;
    }
    for (String prefix : OPEN_PATH_PREFIXES) {
      ResourceEntry entry = resources.get(prefix + normalized);
      // The bundled map registry may name the other mask generation. Serve the
      // installed generation with its own MIME type rather than requiring both
      // the legacy PNG and current SVG to be present in every pack.
      if (entry == null) {
        String alternate = alternateMapOverlayPath(prefix + normalized);
        if (alternate != null) entry = resources.get(alternate);
      }
      if (entry == null) continue;
      File blob = new File(blobs, entry.sha256);
      if (!blob.isFile()) continue;
      try {
        return new OpenedResource(entry.mimeType, new BufferedInputStream(new FileInputStream(blob)), blob.length());
      } catch (IOException ignored) {
        return null;
      }
    }
    return null;
  }

  JSONObject aibpImageIndex() throws IOException, JSONException {
    Set<String> images = new TreeSet<>();
    Set<String> bundledPreviews = new HashSet<>();
    // The catalog lists possible resources; only installed blobs count as present.
    for (Map.Entry<String, ResourceEntry> item : resources.entrySet()) {
      String target = item.getKey();
      if (isAibpImage(target) && new File(blobs, item.getValue().sha256).isFile()) {
        images.add(target.substring("aibp/".length()));
      }
    }
    // Include actual APK assets too, using the same public directories as PHP.
    List<String> directories = new ArrayList<>();
    directories.add("other");
    directories.add("other/trait");
    String[] rootNames = context.getAssets().list("web/aibp/ps");
    if (rootNames != null) for (String name : rootNames) {
      if (name.matches("[A-Z][A-Z0-9_]+")) directories.add(name);
    }
    for (String directory : directories) {
      String[] names = context.getAssets().list("web/aibp/ps/" + directory);
      if (names == null) continue;
      for (String name : names) {
        String target = "aibp/ps/" + directory + "/" + name;
        if (name.endsWith(".preview.jpg")) {
          bundledPreviews.add(target.substring("aibp/".length()));
          continue;
        }
        if (!isAibpImage(target)) continue;
        try (InputStream input = context.getAssets().open("web/" + target)) {
          images.add(target.substring("aibp/".length()));
        } catch (FileNotFoundException ignored) {
          // A directory whose name ends in .jpg is not an image file.
        }
      }
    }
    JSONObject previews = new JSONObject();
    for (String src : images) {
      String target = "aibp/" + src;
      ResourceEntry preview = resources.get(target + ".preview.jpg");
      if (preview != null && new File(blobs, preview.sha256).isFile()) {
        previews.put(src, src + ".preview.jpg");
      } else if (!resources.containsKey(target) && bundledPreviews.contains(src + ".preview.jpg")) {
        previews.put(src, src + ".preview.jpg");
      }
    }
    return new JSONObject().put("ok", true).put("version", 2).put("images", new JSONArray(images)).put("previews", previews);
  }

  private static boolean isAibpImage(String target) {
    return !target.endsWith(".preview.jpg")
        && target.matches("aibp/ps/(?:[A-Z][A-Z0-9_]+|other|other/trait)/[^/]+\\.(?i:jpg|jpeg|png)");
  }

  // Export canvases must decode image bytes from a data URL rather than use
  // file:// images. Prefer the installed pack, exactly as WebView interception
  // does, then fall back to APK assets. Never expose arbitrary app-private files.
  String readExportImageData(String relative) {
    try {
      String normalized = safePath(relative, "导出图片路径");
      String extension = normalized.substring(normalized.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
      String mime;
      switch (extension) {
        case "png": mime = "image/png"; break;
        case "jpg": case "jpeg": mime = "image/jpeg"; break;
        case "webp": mime = "image/webp"; break;
        case "gif": mime = "image/gif"; break;
        case "bmp": mime = "image/bmp"; break;
        case "svg":
          if (!normalized.matches(MAP_IMAGE_PATTERN)) return "";
          mime = "image/svg+xml"; break;
        default: return "";
      }
      OpenedResource resource = open(normalized);
      if (resource != null) mime = resource.mimeType;
      try (InputStream input = resource == null ? context.getAssets().open("web/" + normalized) : resource.input;
           ByteArrayOutputStream output = new ByteArrayOutputStream()) {
        if (!mime.matches("image/(?:png|jpeg|webp|gif|bmp|svg\\+xml)")) return "";
        if ("image/svg+xml".equals(mime) && !normalized.matches(MAP_IMAGE_PATTERN)) return "";
        byte[] buffer = new byte[64 * 1024];
        int total = 0;
        for (int count; (count = input.read(buffer)) != -1;) {
          total += count;
          if (total > MAX_MEMBER_BYTES) return "";
          output.write(buffer, 0, count);
        }
        if (total == 0) return "";
        return "data:" + mime + ";base64," + android.util.Base64.encodeToString(output.toByteArray(), android.util.Base64.NO_WRAP);
      }
    } catch (Exception ignored) {
      return "";
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
        copy(input, output, null, MAX_PACKAGE_TOTAL_BYTES, null);
      }
      return importZip(packageFile);
    } finally {
      packageFile.delete();
    }
  }

  private ImportResult importZip(File packageFile) throws Exception {
    try (ZipFile archive = new ZipFile(packageFile); ImportTransaction transaction = new ImportTransaction()) {
      validateArchive(archive);
      ZipArchiveEntry manifestEntry = archive.getEntry("manifest.json");
      if (manifestEntry == null) throw new IOException("资料包缺少 manifest.json");
      JSONObject manifest = new JSONObject(new String(readLimited(archive, manifestEntry, MAX_MANIFEST_BYTES, transaction), StandardCharsets.UTF_8));
      if (!"ato-asset-pack".equals(manifest.optString("format"))) throw new IOException("不是有效的 .atopack 资料包");
      int version = manifest.optInt("version", 0);
      if (version < 1 || version > PACKAGE_VERSION) throw new IOException("不支持的资料包版本：" + version);

      Map<String, JSONObject> items = catalogItems(manifest.optJSONArray("items"));
      JSONArray assets = manifest.optJSONArray("assets");
      if (assets == null) assets = new JSONArray();
      if (assets.length() > MAX_ASSETS) throw new IOException("资料包资源数量超过限制");

      Map<String, ResourceEntry> next = new HashMap<>(resources);
      Map<String, String> importedTargets = new HashMap<>();
      int importedAssets = 0;
      ImportStats stats = new ImportStats();
      for (int index = 0; index < assets.length(); index++) {
        JSONObject asset = assets.optJSONObject(index);
        if (asset == null) { stats.skipped++; continue; }
        String itemId = asset.optString("itemId");
        String face = asset.optString("face");
        JSONObject item = items.get(itemId);
        JSONObject faces = item == null ? null : item.optJSONObject("faces");
        String declaredTarget = faces == null ? "" : faces.optString(face);
        String target = knownTargets.get(catalogKey(itemId, face));
        if (target == null || !isImportableTarget(target)) { stats.skipped++; continue; }
        String member;
        String sha256;
        try {
          String declared = canonicalBoardPath(safePath(declaredTarget, "资源目标路径"));
          if (retiredCardBackTargets.containsKey(declared)) {
            stats.skipLegacyCardBack();
            continue;
          }
          if (!target.equals(declared)) {
            stats.skipped++;
            continue;
          }
          member = safePath(asset.optString("member"), "资料包成员路径");
          sha256 = validSha256(asset.optString("sha256"));
          if (sha256.equals(retiredCardBackHashes.get(target))) {
            stats.skipLegacyCardBack();
            continue;
          }
        } catch (IOException invalid) { stats.skipped++; continue; }
        ZipArchiveEntry entry = findEntry(archive, member, asset);
        if (entry == null || entry.isDirectory()) { stats.skipped++; continue; }
        String priorHash = importedTargets.get(target);
        if (priorHash != null && !priorHash.equals(sha256)) {
          throw new IOException("共享资源存在不同内容，无法导入：" + target);
        }
        try { installBlob(archive, entry, sha256, asset, MAX_MEMBER_BYTES, transaction); }
        catch (InvalidPackEntry invalid) { stats.skipped++; continue; }
        importedTargets.put(target, sha256);
        // An older resource pack can replace a face without supplying its new
        // preview. Discard the old preview rather than showing the wrong face.
        next.remove(target + ".preview.jpg");
        next.put(target, new ResourceEntry(sha256, safeMime(asset.optString("mimeType"), target)));
        importedAssets++;
      }

      JSONArray cardPreviews = manifest.optJSONArray("cardPreviewFiles");
      if (cardPreviews != null) {
        if (cardPreviews.length() > MAX_ASSETS) throw new IOException("卡牌预览图数量超过限制");
        for (int index = 0; index < cardPreviews.length(); index++) {
          JSONObject resource = cardPreviews.optJSONObject(index);
          if (resource == null) { stats.skipped++; continue; }
          String source;
          String target;
          String member;
          String sha256;
          try {
            source = canonicalBoardPath(safePath(resource.optString("source"), "卡牌原图路径"));
            target = canonicalBoardPath(safePath(resource.optString("target"), "卡牌预览路径"));
            member = safePath(resource.optString("member"), "卡牌预览成员路径");
            sha256 = validSha256(resource.optString("sha256"));
          } catch (IOException invalid) { stats.skipped++; continue; }
          ResourceEntry original = next.get(source);
          if (!(isAibpImage(source) || BOARD_SOURCE.equals(source)) || !target.equals(source + ".preview.jpg")
              || !target.equals(canonicalBoardPath(member)) || original == null
              || !original.sha256.equals(resource.optString("sourceSha256"))) {
            stats.skipped++;
            continue;
          }
          ZipArchiveEntry entry = findEntry(archive, member, resource);
          if (entry == null || entry.isDirectory() || entry.getSize() > 2L * 1024 * 1024) {
            stats.skipped++;
            continue;
          }
          try { installBlob(archive, entry, sha256, resource, 2L * 1024 * 1024, transaction); }
          catch (InvalidPackEntry invalid) { stats.skipped++; continue; }
          next.put(target, new ResourceEntry(sha256, "image/jpeg"));
        }
      }

      JSONObject incomingStories = manifest.optJSONObject("stories");
      boolean entityIndexImported = importStoryFiles(archive, manifest.optJSONArray("storyFiles"), next, stats, transaction);
      JSONArray officialFiles = manifest.optJSONArray("resourceFiles");
      if (officialFiles != null) {
        if (officialFiles.length() > MAX_ASSETS) throw new IOException("官方资料数量超过限制");
        for (int index = 0; index < officialFiles.length(); index++) {
          JSONObject resource = officialFiles.optJSONObject(index);
          if (resource == null) { stats.skipped++; continue; }
          String target;
          String sha256;
          try {
            target = safePath(resource.optString("target"), "官方资料路径");
            sha256 = validSha256(resource.optString("sha256"));
          } catch (IOException invalid) { stats.skipped++; continue; }
          boolean storyData = "story/data/storybook-official-data.js".equals(target);
          if (!storyData && !target.matches("(?i)story/data/ato-storybook-key-scans/c[123]-[A-Za-z0-9_-]+\\.(jpg|jpeg|png|webp)")) {
            stats.skipped++;
            continue;
          }
          if (!target.equals(resource.optString("member"))) { stats.skipped++; continue; }
          ZipArchiveEntry entry = findEntry(archive, target, resource);
          if (entry == null || entry.isDirectory() || entry.getSize() < 0 || entry.getSize() > MAX_ENTITY_INDEX_BYTES) { stats.skipped++; continue; }
          if (resource.has("bytes") && resource.optLong("bytes", -1) != entry.getSize()) {
            stats.skipped++;
            continue;
          }
          try { installBlob(archive, entry, sha256, resource, MAX_ENTITY_INDEX_BYTES, transaction); }
          catch (InvalidPackEntry invalid) { stats.skipped++; continue; }
          next.put(target, new ResourceEntry(sha256, storyData ? "application/javascript" : scanMime(target)));
        }
      }
      // 主控台背景音乐：APK 不带音频，随资料包的 bgmFiles 段解包到 web 根目录的
      // assets/bgm/，主控台按相对路径 ./assets/bgm/*.mp3 直接播放。
      JSONArray bgmFiles = manifest.optJSONArray("bgmFiles");
      if (bgmFiles != null) {
        if (bgmFiles.length() > MAX_BGM_FILES) throw new IOException("背景音乐数量超过限制");
        for (int index = 0; index < bgmFiles.length(); index++) {
          JSONObject resource = bgmFiles.optJSONObject(index);
          if (resource == null) { stats.skipped++; continue; }
          String target;
          String sha256;
          try {
            target = safePath(resource.optString("target"), "背景音乐路径");
            sha256 = validSha256(resource.optString("sha256"));
          } catch (IOException invalid) { stats.skipped++; continue; }
          if (!target.matches("assets/bgm/[A-Za-z0-9][A-Za-z0-9._-]*\\.(mp3|ogg)")) {
            stats.skipped++;
            continue;
          }
          if (!target.equals(resource.optString("member"))) { stats.skipped++; continue; }
          ZipArchiveEntry entry = findEntry(archive, target, resource);
          if (entry == null || entry.isDirectory() || entry.getSize() < 0 || entry.getSize() > MAX_BGM_BYTES) {
            stats.skipped++;
            continue;
          }
          if (resource.has("bytes") && resource.optLong("bytes", -1) != entry.getSize()) {
            stats.skipped++;
            continue;
          }
          try { installBlob(archive, entry, sha256, resource, MAX_BGM_BYTES, transaction); }
          catch (InvalidPackEntry invalid) { stats.skipped++; continue; }
          next.put(target, new ResourceEntry(sha256, safeMime(resource.optString("mimeType"), target)));
        }
      }
      // 主控台界面图标：APK 不带这些字形，随资料包的 iconFiles 段解包到 web 根目录的
      // assets/icons/，页面按相对路径 ./assets/icons/<名称>.svg 取用。
      JSONArray iconFiles = manifest.optJSONArray("iconFiles");
      if (iconFiles != null) {
        if (iconFiles.length() > MAX_ICON_FILES) throw new IOException("界面图标数量超过限制");
        for (int index = 0; index < iconFiles.length(); index++) {
          JSONObject resource = iconFiles.optJSONObject(index);
          if (resource == null) { stats.skipped++; continue; }
          String target;
          String sha256;
          try {
            target = safePath(resource.optString("target"), "界面图标路径");
            sha256 = validSha256(resource.optString("sha256"));
          } catch (IOException invalid) { stats.skipped++; continue; }
          if (!target.matches("assets/icons/[A-Za-z0-9][A-Za-z0-9._-]*\\.svg")) {
            stats.skipped++;
            continue;
          }
          if (!target.equals(resource.optString("member"))) { stats.skipped++; continue; }
          ZipArchiveEntry entry = findEntry(archive, target, resource);
          if (entry == null || entry.isDirectory() || entry.getSize() < 0 || entry.getSize() > MAX_ICON_BYTES) {
            stats.skipped++;
            continue;
          }
          if (resource.has("bytes") && resource.optLong("bytes", -1) != entry.getSize()) {
            stats.skipped++;
            continue;
          }
          try { installBlob(archive, entry, sha256, resource, MAX_ICON_BYTES, transaction); }
          catch (InvalidPackEntry invalid) { stats.skipped++; continue; }
          next.put(target, new ResourceEntry(sha256, safeMime(resource.optString("mimeType"), target)));
        }
      }
      // 密语字形：APK 不带巴别语／塞壬语字形，随资料包的 crypticFiles 段解包到 web 根目录的
      // story/assets/cryptic/glyphs/，故事书侧栏按相对路径 ./assets/cryptic/glyphs/<名称>.png 取用。
      JSONArray crypticFiles = manifest.optJSONArray("crypticFiles");
      if (crypticFiles != null) {
        if (crypticFiles.length() > MAX_CRYPTIC_FILES) throw new IOException("密语字形数量超过限制");
        for (int index = 0; index < crypticFiles.length(); index++) {
          JSONObject resource = crypticFiles.optJSONObject(index);
          if (resource == null) { stats.skipCryptic("", "字形条目不是对象"); continue; }
          String target;
          String sha256;
          try {
            target = safePath(resource.optString("target"), "密语字形路径");
            sha256 = validSha256(resource.optString("sha256"));
          } catch (IOException invalid) { stats.skipCryptic(resource.optString("target"), invalid.getMessage()); continue; }
          if (!target.matches("story/assets/cryptic/glyphs/[A-Za-z0-9][A-Za-z0-9._-]*\\.png")) {
            stats.skipCryptic(target, "字形目标路径不受支持");
            continue;
          }
          if (!target.equals(resource.optString("member"))) { stats.skipCryptic(target, "成员路径与字形目标不一致"); continue; }
          ZipArchiveEntry entry = findEntry(archive, target, resource);
          if (entry == null || entry.isDirectory() || entry.getSize() < 0 || entry.getSize() > MAX_CRYPTIC_BYTES) {
            stats.skipCryptic(target, "字形成员缺失、无效或超过大小限制");
            continue;
          }
          if (resource.has("bytes") && resource.optLong("bytes", -1) != entry.getSize()) {
            stats.skipCryptic(target, "字形声明大小与成员不一致");
            continue;
          }
          try { installBlob(archive, entry, sha256, resource, MAX_CRYPTIC_BYTES, transaction); }
          catch (InvalidPackEntry invalid) { stats.skipCryptic(target, invalid.getMessage()); continue; }
          next.put(target, new ResourceEntry(sha256, safeMime(resource.optString("mimeType"), target)));
        }
      }
      // 混合媒体：APK 不带私有映射表与书籍裁图（它们是 .gitignore 里的本机素材），随资料包的
      // mixedMediaFiles 段解包到 web 根目录的 story/assets/mixed-media/，故事书按相对路径
      // ./assets/mixed-media/images/c1/<名称>.png 取用；mapping.js 也在同一棵子树里。
      JSONArray mixedMediaFiles = manifest.optJSONArray("mixedMediaFiles");
      if (mixedMediaFiles != null) {
        if (mixedMediaFiles.length() > MAX_MIXED_MEDIA_FILES) throw new IOException("混合媒体文件数量超过限制");
        for (int index = 0; index < mixedMediaFiles.length(); index++) {
          JSONObject resource = mixedMediaFiles.optJSONObject(index);
          if (resource == null) { stats.skipMixedMedia("", "混合媒体条目不是对象"); continue; }
          String target;
          String sha256;
          try {
            target = safePath(resource.optString("target"), "混合媒体路径");
            sha256 = validSha256(resource.optString("sha256"));
          } catch (IOException invalid) { stats.skipMixedMedia(resource.optString("target"), invalid.getMessage()); continue; }
          boolean mapping = MIXED_MEDIA_MAPPING.equals(target);
          if (!mapping && !target.matches(MIXED_MEDIA_IMAGE_PATTERN)) {
            stats.skipMixedMedia(target, "混合媒体目标路径不受支持");
            continue;
          }
          if (!target.equals(resource.optString("member"))) { stats.skipMixedMedia(target, "成员路径与混合媒体目标不一致"); continue; }
          long maximum = mapping ? MAX_MIXED_MEDIA_MAPPING_BYTES : MAX_MIXED_MEDIA_IMAGE_BYTES;
          ZipArchiveEntry entry = findEntry(archive, target, resource);
          if (entry == null || entry.isDirectory() || entry.getSize() < 0 || entry.getSize() > maximum) {
            stats.skipMixedMedia(target, "混合媒体成员缺失、无效或超过大小限制");
            continue;
          }
          if (resource.has("bytes") && resource.optLong("bytes", -1) != entry.getSize()) {
            stats.skipMixedMedia(target, "混合媒体声明大小与成员不一致");
            continue;
          }
          try { installBlob(archive, entry, sha256, resource, maximum, transaction); }
          catch (InvalidPackEntry invalid) { stats.skipMixedMedia(target, invalid.getMessage()); continue; }
          next.put(target, new ResourceEntry(sha256, safeMime(resource.optString("mimeType"), target)));
        }
      }
      // Layered maps are an optional, byte-preserving resource channel. Legacy
      // card IDs above remain accepted. Reject incomplete/corrupt layer sets
      // before committing so a base never loses its matching icon mask.
      JSONArray mapFiles = manifest.optJSONArray("mapFiles");
      if (manifest.has("mapFiles") && mapFiles == null) throw new IOException("地图图层清单无效");
      if (mapFiles != null) {
        if (mapFiles.length() > MAX_MAP_FILES) throw new IOException("地图图层数量超过限制");
        Set<String> allowedMaps = new HashSet<>(knownTargets.values());
        Set<String> declaredMaps = new HashSet<>();
        for (int index = 0; index < mapFiles.length(); index++) {
          JSONObject resource = mapFiles.optJSONObject(index);
          if (resource == null) throw new IOException("地图图层条目无效");
          String target = safePath(resource.optString("target"), "地图图层路径");
          if (!target.matches(MAP_IMAGE_PATTERN) || !allowedMaps.contains(target)
              || !target.equals(resource.optString("member")) || !declaredMaps.add(target)) {
            throw new IOException("地图图层目标无效、重复或 APK 未支持：" + target);
          }
        }
        for (String target : declaredMaps) {
          String companion = null;
          if (target.startsWith("map/images/hd1024/base/")) {
            companion = target.replace("/base/", "/overlay/");
            String vector = companion.substring(0, companion.length() - 4) + "-corners.svg";
            if (declaredMaps.contains(vector)) companion = vector;
          }
          if (target.startsWith("map/images/hd1024/overlay/")) companion = target.replace("/overlay/", "/base/").replace("-corners.svg", ".png");
          if (target.startsWith("map/images/card-backs/numbers/") || target.startsWith("map/images/card-backs/vectors/")) {
            String cycle = target.substring(target.lastIndexOf('/') + 1, target.lastIndexOf('/') + 3);
            companion = "map/images/card-backs/" + cycle + "-base.png";
            if ("c5".equals(cycle)) companion = "map/images/card-backs/c1-base.png";
            // New C2/C3 backs recolor the common C1 texture; old packs retain
            // their independent base. Both complete forms remain importable.
            if (("c2".equals(cycle) || "c3".equals(cycle))
                && declaredMaps.contains("map/images/card-backs/c1-base.png")) {
              companion = "map/images/card-backs/c1-base.png";
            }
            // Special backs now use their complete instruction image alone.
            // Old separate number masks still require the instruction image.
            if (target.contains("/numbers/") && !target.endsWith("-instruction.png")) {
              String number = target.replace("-instruction.png", ".png");
              String instruction = number.substring(0, number.length() - 4) + "-instruction.png";
              for (String piece : new String[] {number, instruction}) {
                if (allowedMaps.contains(piece) && !declaredMaps.contains(piece)) throw new IOException("地图卡背缺少数字或说明蒙版：" + piece);
              }
            }
          }
          if (companion != null && !declaredMaps.contains(companion)) throw new IOException("地图图层缺少配套文件：" + companion);
        }
        for (int index = 0; index < mapFiles.length(); index++) {
          JSONObject resource = mapFiles.getJSONObject(index);
          String target = resource.getString("target");
          String sha256 = validSha256(resource.optString("sha256"));
          ZipArchiveEntry entry = findEntry(archive, target, resource);
          if (entry == null || entry.isDirectory() || entry.getSize() < 0 || entry.getSize() > MAX_MAP_BYTES
              || resource.optLong("bytes", -1) != entry.getSize()) throw new IOException("地图图层缺失或大小不符：" + target);
          installBlob(archive, entry, sha256, resource, MAX_MAP_BYTES, transaction);
          next.put(target, new ResourceEntry(sha256, target.endsWith(".svg") ? "image/svg+xml" : "image/png"));
          importedAssets++;
        }
        // A mask switch replaces the other generation for that face. Keeping
        // both would let the bundled registry select a stale SVG after a user
        // imports a legacy pack. Changes remain part of this transaction.
        for (String target : declaredMaps) {
          String alternate = alternateMapOverlayPath(target);
          if (alternate != null && !declaredMaps.contains(alternate)) next.remove(alternate);
        }
      }
      int importedBooks = mergeStories(incomingStories, next, stats, transaction);
      removeRetiredCardBacks(next);
      String nextUpdatedAt = Long.toString(System.currentTimeMillis());
      transaction.commit(next, nextUpdatedAt);
      resources = next;
      updatedAt = nextUpdatedAt;
      removeUnreferencedBlobs();
      return new ImportResult(importedAssets, importedBooks, entityIndexImported, next.size(), stats);
    }
  }

  private Map<String, JSONObject> catalogItems(JSONArray items) throws JSONException {
    Map<String, JSONObject> result = new HashMap<>();
    if (items == null) return result;
    for (int index = 0; index < items.length(); index++) {
      JSONObject item = items.optJSONObject(index);
      if (item == null) continue;
      String id = item.optString("id");
      if (!id.isEmpty()) result.put(id, item);
    }
    return result;
  }

  private int mergeStories(JSONObject incoming, Map<String, ResourceEntry> next, ImportStats stats, ImportTransaction transaction) throws Exception {
    JSONArray incomingBooks = incoming == null ? null : incoming.optJSONArray("books");
    if (incomingBooks == null || incomingBooks.length() == 0) return 0;
    JSONObject merged = transaction.stories;
    JSONArray currentBooks = merged.optJSONArray("books");
    if (currentBooks == null) currentBooks = new JSONArray();
    Map<String, JSONObject> byId = new TreeMap<>();
    for (int index = 0; index < currentBooks.length(); index++) {
      JSONObject book = currentBooks.optJSONObject(index);
      if (book != null && !book.optString("id").isEmpty()) byId.put(book.optString("id"), book);
    }
    int imported = 0;
    for (int index = 0; index < incomingBooks.length(); index++) {
      JSONObject book = incomingBooks.optJSONObject(index);
      if (book == null) { stats.skipped++; continue; }
      String id = book.optString("id");
      if (id.isEmpty()) { stats.skipped++; continue; }
      byId.put(id, book);
      imported++;
    }
    if (imported == 0) return 0;
    JSONArray books = new JSONArray();
    for (JSONObject book : byId.values()) books.put(book);
    JSONObject payload = new JSONObject();
    payload.put("generatedAt", incoming.optString("generatedAt", "Android .atopack import"));
    payload.put("books", books);
    transaction.stories = payload;
    // 不再先拼出整段 JS 字符串再转 byte[]：逐段写盘并边写边算哈希，峰值只多一份
    // payload.toString()，不再同时保留拼接结果和它的 UTF-8 副本。
    installText(next, "story/data/storybook-data.js", "application/javascript", transaction,
        "window.STORYBOOK_DATA = ", payload.toString(), ";\n");
    return imported;
  }

  private boolean importStoryFiles(ZipFile archive, JSONArray files, Map<String, ResourceEntry> next, ImportStats stats, ImportTransaction transaction) throws Exception {
    if (files == null) return false;
    if (files.length() > MAX_ASSETS) throw new IOException("故事附加文件数量超过限制");
    boolean imported = false;
    for (int index = 0; index < files.length(); index++) {
      JSONObject storyFile = files.optJSONObject(index);
      if (storyFile == null) { stats.skipped++; continue; }
      if (!"entity-index".equals(storyFile.optString("kind"))) {
        stats.skipped++;
        continue;
      }
      String member;
      String expected;
      try {
        member = safePath(storyFile.optString("member"), "故事附加文件路径");
        expected = validSha256(storyFile.optString("sha256"));
      } catch (IOException invalid) { stats.skipped++; continue; }
      if (!"story/entity-index.json".equals(member)) { stats.skipped++; continue; }
      ZipArchiveEntry entry = findEntry(archive, member, storyFile);
      if (entry == null || entry.isDirectory() || entry.getSize() <= 0) { stats.skipped++; continue; }
      try {
        // 人物小传索引可达十几 MB，旧实现会同时保留 byte[]、String、JSONObject
        // 以及两份重新序列化后的文本。这里只校验大小/SHA 并原样落盘，再由 WebView
        // 在页面里解析，导入器的内存占用与索引大小无关。
        stageBlob(archive, entry, expected, storyFile, MAX_ENTITY_INDEX_BYTES, transaction);
        installEntityIndexScript(archive, entry, storyFile, next, transaction);
      } catch (InvalidPackEntry invalid) { stats.skipped++; continue; }
      next.put("story/data/entity-index.json", new ResourceEntry(expected, "application/json"));
      imported = true;
    }
    return imported;
  }

  /** 逐段 UTF-8 写盘并计算哈希；避免把整段文本再复制成 byte[]。 */
  private void installText(Map<String, ResourceEntry> next, String target, String mimeType,
      ImportTransaction transaction, String... parts) throws Exception {
    File temporary = File.createTempFile("text-", ".tmp", transaction.staging);
    MessageDigest digest = sha256();
    long size;
    try {
      try (FileOutputStream file = new FileOutputStream(temporary);
           CountingOutputStream counted = new CountingOutputStream(file);
           DigestOutputStream output = new DigestOutputStream(counted, digest);
           Writer writer = new OutputStreamWriter(output, StandardCharsets.UTF_8)) {
        for (String part : parts) writer.write(part);
        writer.flush();
        size = counted.count;
      }
      if (size > MAX_MEMBER_BYTES) throw new IOException("生成的资源超过大小限制：" + target);
      transaction.account(size);
      String sha256 = hex(digest.digest());
      File blob = new File(transaction.staging, sha256);
      moveBlob(temporary, blob);
      next.put(target, new ResourceEntry(sha256, mimeType));
    } finally {
      if (temporary.exists()) temporary.delete();
    }
  }

  /**
   * 以流式方式生成 entity-index.js：prefix + 原始 JSON + suffix。
   * 不构造完整字符串，也不把 JSON 解析成对象。
   */
  private void installEntityIndexScript(ZipFile archive, ZipArchiveEntry entry, JSONObject resource,
      Map<String, ResourceEntry> next, ImportTransaction transaction) throws Exception {
    File temporary = File.createTempFile("entity-index-", ".tmp", transaction.staging);
    MessageDigest digest = sha256();
    long size;
    try {
      try (FileOutputStream file = new FileOutputStream(temporary);
           CountingOutputStream counted = new CountingOutputStream(file);
           DigestOutputStream output = new DigestOutputStream(counted, digest)) {
        output.write(ENTITY_INDEX_SCRIPT_PREFIX);
        long raw;
        try (InputStream input = archive.getInputStream(entry)) {
          raw = copy(input, output, null, MAX_ENTITY_INDEX_BYTES, null);
        }
        validateActualSize(entry, resource, raw);
        output.write(ENTITY_INDEX_SCRIPT_SUFFIX);
        output.flush();
        size = counted.count;
      }
      if (size > MAX_MEMBER_BYTES) throw new IOException("生成的人物小传脚本超过大小限制");
      transaction.account(size);
      String sha256 = hex(digest.digest());
      File blob = new File(transaction.staging, sha256);
      moveBlob(temporary, blob);
      next.put("story/data/entity-index.js", new ResourceEntry(sha256, "application/javascript"));
    } finally {
      if (temporary.exists()) temporary.delete();
    }
  }

  private void installBlob(ZipFile archive, ZipArchiveEntry entry, String expected, JSONObject resource, long maximum, ImportTransaction transaction) throws Exception {
    InvalidPackEntry failure = null;
    // Older exporters wrote catalog glyphs and crypticFiles under the same ZIP
    // member, sometimes with different encodings. Resolve each declaration by
    // its bytes and digest instead of trusting getEntry's first matching member.
    for (ZipArchiveEntry candidate : archive.getEntries(entry.getName())) {
      if (candidate.isDirectory()) continue;
      try {
        validateSize(candidate, resource, maximum);
        String verified = candidate.getName() + "\u0000" + expected + "\u0000" + candidate.getSize();
        if (transaction.verifiedMembers.contains(verified)) return;
        stageBlob(archive, candidate, expected, resource, maximum, transaction);
        transaction.verifiedMembers.add(verified);
        return;
      } catch (InvalidPackEntry invalid) {
        failure = invalid;
      }
    }
    throw failure == null ? new InvalidPackEntry("资料包成员缺失：" + entry.getName()) : failure;
  }

  private void stageBlob(ZipFile archive, ZipArchiveEntry entry, String expected, JSONObject resource, long maximum, ImportTransaction transaction) throws Exception {
    validateSize(entry, resource, maximum);
    File destination = new File(transaction.staging, expected);
    File temporary = File.createTempFile("blob-", ".tmp", transaction.staging);
    MessageDigest digest = sha256();
    try {
      long actual;
      try (InputStream input = archive.getInputStream(entry); FileOutputStream output = new FileOutputStream(temporary)) {
        actual = copy(input, output, digest, maximum, transaction);
      }
      validateActualSize(entry, resource, actual);
      if (!expected.equals(hex(digest.digest()))) throw new InvalidPackEntry("资料包文件校验失败：" + entry.getName());
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

  private static ZipArchiveEntry findEntry(ZipFile archive, String member, JSONObject resource) {
    for (ZipArchiveEntry entry : archive.getEntries(member)) {
      if (!entry.isDirectory() && matchesDeclaredSize(resource, entry.getSize())) return entry;
    }
    return archive.getEntry(member);
  }

  private static void validateArchive(ZipFile archive) throws IOException {
    Enumeration<ZipArchiveEntry> entries = archive.getEntries();
    long total = 0;
    int members = 0;
    while (entries.hasMoreElements()) {
      ZipArchiveEntry entry = entries.nextElement();
      if (++members > MAX_ASSETS) throw new IOException("资料包成员数量超过限制");
      long size = entry.getSize();
      if (size < 0 || size > MAX_MEMBER_BYTES) throw new IOException("资料包文件大小无效或超过限制：" + entry.getName());
      if (size > MAX_PACKAGE_TOTAL_BYTES - total) throw new IOException("资料包解压总量超过限制");
      total += size;
    }
  }

  private static void validateSize(ZipArchiveEntry entry, JSONObject resource, long maximum) throws IOException {
    if (entry.getSize() < 0 || entry.getSize() > maximum) throw new InvalidPackEntry("资料包文件大小无效或超过限制：" + entry.getName());
    if (!matchesDeclaredSize(resource, entry.getSize())) {
      throw new InvalidPackEntry("资料包声明大小与成员不一致：" + entry.getName());
    }
  }

  private static void validateActualSize(ZipArchiveEntry entry, JSONObject resource, long actual) throws IOException {
    if (actual != entry.getSize() || !matchesDeclaredSize(resource, actual)) {
      throw new InvalidPackEntry("资料包实际大小与声明不一致：" + entry.getName());
    }
  }

  private static boolean matchesDeclaredSize(JSONObject resource, long actual) {
    if (!resource.has("bytes")) return true; // Legacy packages did not declare sizes.
    Object value = resource.opt("bytes");
    if (!(value instanceof Number)) return false;
    Number declared = (Number) value;
    return declared.longValue() == actual && declared.doubleValue() == (double) actual;
  }

  private void removeUnreferencedBlobs() {
    Set<String> referenced = new HashSet<>();
    for (ResourceEntry entry : resources.values()) referenced.add(entry.sha256);
    File[] files = blobs.listFiles();
    if (files != null) for (File file : files) if (file.isFile() && !referenced.contains(file.getName())) file.delete();
  }

  private static void removeStaging(File staging) {
    File[] files = staging.listFiles();
    if (files != null) for (File file : files) if (file.isFile()) file.delete();
    staging.delete();
  }

  private void restoreInterruptedRepairs(File staging) {
    File[] previous = staging.listFiles((directory, name) -> name.matches("previous-[0-9a-f]{64}"));
    if (previous == null) return;
    for (File file : previous) {
      File destination = new File(blobs, file.getName().substring("previous-".length()));
      if (!destination.isFile()) file.renameTo(destination);
    }
  }

  // Only index.json is mutable committed state. Story metadata lives in that same
  // atomic commit; old stories.json remains a read-only migration fallback.
  private final class ImportTransaction implements AutoCloseable {
    final File staging;
    final List<File> created = new ArrayList<>();
    final Map<File, File> replaced = new HashMap<>();
    final Set<String> verifiedMembers = new HashSet<>();
    JSONObject stories;
    long readBytes;
    boolean committed;

    ImportTransaction() throws Exception {
      JSONObject current;
      try { current = readJson(indexFile, new JSONObject()); }
      catch (Exception damaged) { current = new JSONObject(); }
      stories = current.optJSONObject("stories");
      if (stories == null) {
        try { stories = readJson(storiesFile, new JSONObject().put("books", new JSONArray())); }
        catch (Exception damaged) { stories = new JSONObject().put("books", new JSONArray()); }
      }
      staging = File.createTempFile("import-", ".staging", root);
      if (!staging.delete() || !staging.mkdir()) throw new IOException("无法创建资料包暂存目录");
    }

    void account(long count) throws IOException {
      if (count > MAX_PACKAGE_TOTAL_BYTES - readBytes) throw new IOException("资料包解压总量超过限制");
      readBytes += count;
    }

    void commit(Map<String, ResourceEntry> next, String nextUpdatedAt) throws Exception {
      Set<String> hashes = new HashSet<>();
      for (ResourceEntry entry : next.values()) hashes.add(entry.sha256);
      for (String hash : hashes) {
        File temporary = new File(staging, hash);
        File destination = new File(blobs, hash);
        if (temporary.isFile() && !blobMatches(destination, hash)) {
          if (destination.isFile()) {
            File previous = new File(staging, "previous-" + hash);
            if (!destination.renameTo(previous)) throw new IOException("无法修复损坏的导入资源");
            replaced.put(destination, previous);
          }
          moveBlob(temporary, destination);
          created.add(destination);
        }
      }
      writeIndex(next, nextUpdatedAt, stories);
      committed = true;
    }

    @Override public void close() {
      if (!committed) {
        for (File file : created) file.delete();
        for (Map.Entry<File, File> previous : replaced.entrySet()) previous.getValue().renameTo(previous.getKey());
      }
      removeStaging(staging);
    }
  }

  private static boolean blobMatches(File file, String expected) throws Exception {
    if (!file.isFile() || file.length() > MAX_MEMBER_BYTES) return false;
    MessageDigest digest = sha256();
    try (InputStream input = new FileInputStream(file)) {
      byte[] buffer = new byte[64 * 1024];
      long total = 0;
      for (int count; (count = input.read(buffer)) != -1;) {
        if (count > MAX_MEMBER_BYTES - total) return false;
        total += count;
        digest.update(buffer, 0, count);
      }
      return expected.equals(hex(digest.digest()));
    } catch (IOException damaged) {
      return false;
    }
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
    // Reuse already imported blobs after upgrading the board's resource path.
    for (String oldPath : new String[]{LEGACY_BOARD_SOURCE, LEGACY_BOARD_SOURCE + ".preview.jpg"}) {
      ResourceEntry old = result.remove(oldPath);
      if (old != null) result.putIfAbsent(canonicalBoardPath(oldPath), old);
    }
    removeRetiredCardBacks(result);
    return result;
  }

  private void removeRetiredCardBacks(Map<String, ResourceEntry> entries) {
    // Old numbered backs may have the wrong special-card artwork. Do not guess
    // a shared replacement from them; a new pack supplies the authoritative JPG.
    for (String retired : retiredCardBackTargets.keySet()) {
      entries.remove(retired);
      entries.remove(retired + ".preview.jpg");
    }
  }

  private void loadCardBackMapping() {
    try (InputStream input = context.getAssets().open("web/aibp/card-backs.json")) {
      JSONObject mapping = new JSONObject(new String(readAll(input, MAX_MANIFEST_BYTES), StandardCharsets.UTF_8));
      if (mapping.optInt("version", 0) != 1) return;
      Set<String> allowed = new HashSet<>(knownTargets.values());
      JSONObject backs = mapping.optJSONObject("backs");
      if (backs != null) {
        Iterator<String> fronts = backs.keys();
        while (fronts.hasNext()) {
          String front = safePath(fronts.next(), "牌背正面路径");
          String target = "aibp/" + safePath(backs.optString(front), "共享牌背路径");
          if (!front.matches("ps/[A-Z][A-Z0-9_]+/[^/]+\\.(?i:jpg|jpeg|png)")
              || !allowed.contains(target)) continue;
          int extension = front.lastIndexOf('.');
          String retired = "aibp/" + front.substring(0, extension) + "_BACK" + front.substring(extension);
          // Dragon BP cards retain distinct effect backs under their old names.
          if (!retired.equals(target)) retiredCardBackTargets.put(retired, target);
        }
      }
      JSONObject revisions = mapping.optJSONObject("canonicalRevisions");
      if (revisions != null) {
        Iterator<String> targets = revisions.keys();
        while (targets.hasNext()) {
          String relative = targets.next();
          String target = "aibp/" + safePath(relative, "共享牌背路径");
          JSONObject revision = revisions.optJSONObject(relative);
          if (!allowed.contains(target) || revision == null) continue;
          String before = validSha256(revision.optString("fromSha256"));
          String after = validSha256(revision.optString("toSha256"));
          if (!before.equals(after)) retiredCardBackHashes.put(target, before);
        }
      }
    } catch (Exception ignored) {
      // A missing mapping never grants permission to import unknown targets.
    }
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
          String target = canonicalBoardPath(safePath(faces.optString(face), "Asset Studio 资源路径"));
          result.put(catalogKey(itemId, face), target);
        }
      }
    } catch (Exception ignored) {
      // Import reports unknown resources if the bundled catalog is unavailable.
    }
    return result;
  }

  private void writeIndex(Map<String, ResourceEntry> values, String nextUpdatedAt, JSONObject stories) throws Exception {
    JSONObject files = new JSONObject();
    for (Map.Entry<String, ResourceEntry> value : values.entrySet()) {
      files.put(value.getKey(), new JSONObject().put("sha256", value.getValue().sha256).put("mimeType", value.getValue().mimeType));
    }
    writeJson(indexFile, new JSONObject().put("version", 2).put("updatedAt", nextUpdatedAt).put("files", files).put("stories", stories));
  }

  private static JSONObject readJson(AtomicFile file, JSONObject fallback) throws Exception {
    try (InputStream input = file.openRead()) {
      return new JSONObject(new String(readAll(input, MAX_MANIFEST_BYTES), StandardCharsets.UTF_8));
    } catch (FileNotFoundException missing) {
      return fallback;
    }
  }

  private static void writeJson(AtomicFile file, JSONObject value) throws IOException {
    FileOutputStream output = null;
    try {
      byte[] bytes = value.toString().getBytes(StandardCharsets.UTF_8);
      if (bytes.length > MAX_MANIFEST_BYTES) throw new IOException("资料包安装索引超过大小限制");
      output = file.startWrite();
      output.write(bytes);
      file.finishWrite(output);
    } catch (IOException error) {
      if (output != null) file.failWrite(output);
      throw error;
    }
  }

  private static byte[] readLimited(ZipFile archive, ZipArchiveEntry entry, int maximum, ImportTransaction transaction) throws IOException {
    if (entry.getSize() < 0 || entry.getSize() > maximum) throw new InvalidPackEntry("资料包文件过大：" + entry.getName());
    try (InputStream input = archive.getInputStream(entry)) {
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      byte[] buffer = new byte[64 * 1024];
      long total = 0;
      for (int count; (count = readPackChunk(input, buffer)) != -1;) {
        if (count > maximum - total) throw new InvalidPackEntry("资料包文件过大：" + entry.getName());
        transaction.account(count);
        total += count;
        output.write(buffer, 0, count);
      }
      if (total != entry.getSize()) throw new InvalidPackEntry("资料包实际大小与成员不一致：" + entry.getName());
      return output.toByteArray();
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

  private static long copy(InputStream input, OutputStream output, MessageDigest digest, long maximum, ImportTransaction transaction) throws IOException {
    byte[] buffer = new byte[1024 * 1024];
    long total = 0;
    for (int count; (count = transaction == null ? input.read(buffer) : readPackChunk(input, buffer)) != -1;) {
      if (count > maximum - total) throw new InvalidPackEntry("资料包文件超过大小限制");
      if (transaction != null) transaction.account(count);
      total += count;
      output.write(buffer, 0, count);
      if (digest != null) digest.update(buffer, 0, count);
    }
    return total;
  }

  private static final class CountingOutputStream extends FilterOutputStream {
    long count;

    CountingOutputStream(OutputStream output) {
      super(output);
    }

    @Override public void write(int value) throws IOException {
      out.write(value);
      count++;
    }

    @Override public void write(byte[] buffer, int offset, int length) throws IOException {
      out.write(buffer, offset, length);
      count += length;
    }
  }

  private static int readPackChunk(InputStream input, byte[] buffer) throws IOException {
    try {
      return input.read(buffer);
    } catch (IOException damaged) {
      throw new InvalidPackEntry("无法解压资料包成员：" + damaged.getMessage());
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
    if (mimeType != null && (mimeType.toLowerCase(Locale.ROOT).startsWith("image/")
        || mimeType.toLowerCase(Locale.ROOT).startsWith("audio/"))) return mimeType;
    String extension = MimeTypeMap.getFileExtensionFromUrl(target);
    String detected = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));
    return detected == null ? "application/octet-stream" : detected;
  }

  /** 官方截图后缀不限于 .jpg（可能是 .png/.webp），MIME 跟着实际后缀走。 */
  private static String scanMime(String target) {
    String extension = MimeTypeMap.getFileExtensionFromUrl(target);
    String detected = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.ROOT));
    return detected == null ? "image/jpeg" : detected;
  }

  private static boolean isImageTarget(String target) {
    String lower = target.toLowerCase(Locale.ROOT);
    return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")
      || lower.endsWith(".webp") || lower.endsWith(".gif");
  }

  /** 图片照旧；另外放行约定目录下的二进制素材（由页面按固定路径取用）。 */
  private static boolean isImportableTarget(String target) {
    if (isImageTarget(target)) return true;
    String lower = target.toLowerCase(Locale.ROOT);
    return lower.startsWith(BINARY_TARGET_PREFIX) && lower.endsWith(".bin");
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

  private static String hex(byte[] bytes) {
    StringBuilder result = new StringBuilder(bytes.length * 2);
    for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
    return result.toString();
  }

  private static final class ImportStats {
    int skipped;
    int legacyCardBacksSkipped;
    final JSONArray crypticSkipped = new JSONArray();
    final JSONArray mixedMediaSkipped = new JSONArray();

    void skipLegacyCardBack() {
      skipped++;
      legacyCardBacksSkipped++;
    }

    void skipCryptic(String target, String reason) throws JSONException {
      skipped++;
      crypticSkipped.put(new JSONObject().put("target", target).put("reason", reason));
    }

    void skipMixedMedia(String target, String reason) throws JSONException {
      skipped++;
      mixedMediaSkipped.put(new JSONObject().put("target", target).put("reason", reason));
    }
  }

  private static final class InvalidPackEntry extends IOException {
    InvalidPackEntry(String message) { super(message); }
  }

  static final class ImportResult {
    final int assets;
    final int books;
    final boolean entityIndex;
    final int totalResources;
    final int skipped;
    final int legacyCardBacksSkipped;
    final JSONArray crypticSkipped;
    final JSONArray mixedMediaSkipped;

    ImportResult(int assets, int books, boolean entityIndex, int totalResources, ImportStats stats) {
      this.assets = assets;
      this.books = books;
      this.entityIndex = entityIndex;
      this.totalResources = totalResources;
      this.skipped = stats.skipped;
      this.legacyCardBacksSkipped = stats.legacyCardBacksSkipped;
      this.crypticSkipped = stats.crypticSkipped;
      this.mixedMediaSkipped = stats.mixedMediaSkipped;
    }

    JSONObject toJson() throws JSONException {
      return new JSONObject().put("ok", true).put("assets", assets).put("books", books)
        .put("entityIndex", entityIndex).put("totalResources", totalResources).put("skipped", skipped)
        .put("legacyCardBacksSkipped", legacyCardBacksSkipped).put("legacy_card_backs_skipped", legacyCardBacksSkipped)
        .put("cryptic_skipped", crypticSkipped.length()).put("cryptic_warnings", crypticSkipped)
        .put("mixed_media_skipped", mixedMediaSkipped.length()).put("mixed_media_warnings", mixedMediaSkipped);
    }
  }

  static final class OpenedResource {
    final String mimeType;
    final InputStream input;
    final long length;

    OpenedResource(String mimeType, InputStream input) {
      this(mimeType, input, -1);
    }

    OpenedResource(String mimeType, InputStream input, long length) {
      this.mimeType = mimeType;
      this.input = input;
      this.length = length;
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
