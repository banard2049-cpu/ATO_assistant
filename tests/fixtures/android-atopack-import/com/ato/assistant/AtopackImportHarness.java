package com.ato.assistant;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.util.AtomicFile;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

public final class AtopackImportHarness {
  private static final String ASSET = "assets/cards/test.png";
  private static final String MAP_BASE = "map/images/hd1024/base/c1-tile-001-front.png";
  private static final String MAP_MASK = "map/images/hd1024/overlay/c1-tile-001-front.png";
  private static final String MAP_VECTOR = "map/images/hd1024/overlay/c1-tile-001-front-corners.svg";
  private static final String BACK_VECTOR = "map/images/card-backs/vectors/c1-tile-001-back.svg";
  private static final String C4_VECTOR = "map/images/card-backs/vectors/c4-tile-011-back.svg";
  private static final String C5_VECTOR = "map/images/card-backs/vectors/c5-tile-080-front-cover.svg";
  private static final String BACK_BASE = "map/images/card-backs/c1-base.png";
  private static final String BACK_NUMBER = "map/images/card-backs/numbers/c1-tile-001-back.png";
  private static final String C4_BASE = "map/images/card-backs/c4-base.png";
  private static final String C4_MASK = "map/images/card-backs/numbers/c4-tile-011-back.png";
  private static final String ALT_NUMBER = "map/images/card-backs/numbers/c1-tile-009-alt-back.png";
  private static final String ALT_INSTRUCTION = "map/images/card-backs/numbers/c1-tile-009-alt-back-instruction.png";
  private static final String LEGACY_MAP = "map/images/c1-tile-001-front.jpg";
  private static final String GLYPH = "story/assets/cryptic/glyphs/babelian-1.png";
  private static final String MIXED_MAPPING = "story/assets/mixed-media/mapping.js";
  private static final String MIXED_PNG = "story/assets/mixed-media/images/c1/c1-p001-block.png";
  private static final String MIXED_SVG = "story/assets/mixed-media/images/c5/c5-p001-inline.svg";
  private final File directory;
  private final Context context;
  private AtopackStore store;
  private int checks;
  private int packNumber;

  private record Member(String name, byte[] bytes) {}

  private AtopackImportHarness(File directory) {
    this.directory = directory;
    JSONObject catalog = new JSONObject().put("format", "ato-android-resource-catalog")
        .put("items", new JSONArray().put(item("test", ASSET)).put(item("glyph", GLYPH))
          .put(item("map-base", MAP_BASE)).put(item("map-mask", MAP_MASK))
          .put(item("map-vector", MAP_VECTOR)).put(item("back-vector", BACK_VECTOR)).put(item("c4-vector", C4_VECTOR))
          .put(item("c5-vector", C5_VECTOR))
          .put(item("back-base", BACK_BASE)).put(item("back-number", BACK_NUMBER))
          .put(item("c4-base", C4_BASE)).put(item("c4-mask", C4_MASK))
          .put(item("c2-base", "map/images/card-backs/c2-base.png"))
          .put(item("c3-base", "map/images/card-backs/c3-base.png"))
          .put(item("c2-mask", "map/images/card-backs/numbers/c2-tile-001-back.png"))
          .put(item("c3-mask", "map/images/card-backs/numbers/c3-tile-001-back.png"))
          .put(item("alt-number", ALT_NUMBER)).put(item("alt-instruction", ALT_INSTRUCTION))
          .put(item("legacy-map", LEGACY_MAP)));
    context = new Context(new File(directory, "app"), catalog.toString());
    store = new AtopackStore(context);
  }

  private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
  private static String sha(byte[] value) throws Exception {
    return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
  }
  private static JSONObject item(String id, String target) {
    return new JSONObject().put("id", id).put("faces", new JSONObject().put("front", target));
  }
  private static JSONObject manifest() {
    return new JSONObject().put("format", "ato-asset-pack").put("version", 3)
        .put("items", new JSONArray().put(item("test", ASSET)).put(item("glyph", GLYPH)))
        .put("assets", new JSONArray());
  }
  private static JSONObject resource(String member, byte[] content) throws Exception {
    return new JSONObject().put("target", member).put("member", member)
        .put("sha256", sha(content)).put("bytes", content.length);
  }
  private static JSONObject asset(String id, String member, byte[] content) throws Exception {
    return resource(member, content).put("itemId", id).put("face", "front");
  }
  private static JSONObject stories(String id) {
    return new JSONObject().put("books", new JSONArray().put(new JSONObject().put("id", id).put("title", id)));
  }
  private File pack(JSONObject manifest, Member... members) throws Exception {
    File file = new File(directory, "test-" + (++packNumber) + ".atopack");
    try (ZipArchiveOutputStream output = new ZipArchiveOutputStream(file)) {
      List<Member> all = new ArrayList<>();
      all.add(new Member("manifest.json", bytes(manifest.toString())));
      all.addAll(Arrays.asList(members));
      for (Member member : all) {
        output.putArchiveEntry(new ZipArchiveEntry(member.name));
        output.write(member.bytes);
        output.closeArchiveEntry();
      }
    }
    return file;
  }
  private AtopackStore.ImportResult install(File pack) throws Exception {
    return store.importPackage(new ContentResolver(), Uri.parse(pack.toURI().toString()));
  }
  private void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
    checks++;
  }
  private String open(String target) throws Exception {
    AtopackStore.OpenedResource resource = store.open(target);
    if (resource == null) return null;
    try (InputStream input = resource.input) { return new String(input.readAllBytes(), StandardCharsets.UTF_8); }
  }
  private File root() { return new File(context.getFilesDir(), "atopack"); }
  private Map<String, String> snapshot() throws Exception {
    Map<String, String> result = new TreeMap<>();
    try (var files = Files.walk(root().toPath())) {
      for (var file : files.filter(Files::isRegularFile).toList()) {
        result.put(root().toPath().relativize(file).toString(), sha(Files.readAllBytes(file)));
      }
    }
    return result;
  }
  private void reject(File pack) throws Exception {
    Map<String, String> before = snapshot();
    String status = store.status().toString();
    try { install(pack); throw new AssertionError("Invalid ZIP import succeeded"); }
    catch (java.io.IOException expected) { checks++; }
    check(before.equals(snapshot()), "Failed import changed persistent resources/stories/index or left blobs");
    check(status.equals(store.status().toString()), "Failed import changed active catalog or updatedAt");
    File[] staging = root().listFiles((dir, name) -> name.endsWith(".staging"));
    check(staging != null && staging.length == 0, "Import staging directory leaked");
    check(context.getCacheDir().list().length == 0, "Copied package cache leaked");
  }
  private static void patchCentralSizes(File file, long size) throws Exception {
    byte[] zip = Files.readAllBytes(file.toPath());
    ByteBuffer buffer = ByteBuffer.wrap(zip).order(ByteOrder.LITTLE_ENDIAN);
    for (int index = 0; index + 46 < zip.length; index++) {
      if (buffer.getInt(index) != 0x02014b50) continue;
      int nameLength = Short.toUnsignedInt(buffer.getShort(index + 28));
      String name = new String(zip, index + 46, nameLength, StandardCharsets.UTF_8);
      if (!name.equals("manifest.json")) buffer.putInt(index + 24, (int) size);
    }
    Files.write(file.toPath(), zip);
  }

  private void imageIndex() throws Exception {
    String front = "aibp/ps/TITAN_X/TITAN_X_AI_X_017.jpg";
    String back = "aibp/ps/TITAN_X/TITAN_X_AI_X_017_BACK.jpg";
    String absent = "aibp/ps/TITAN_X/TITAN_X_BP_X_006.jpg";
    JSONObject catalog = new JSONObject().put("format", "ato-android-resource-catalog").put("items", new JSONArray()
        .put(item("front", front)).put(item("back", back)).put(item("absent", absent))
        .put(item("board", "ss/battle-board/battle-board.jpg")));
    Context imageContext = new Context(new File(directory, "image-index"), catalog.toString());
    AtopackStore imageStore = new AtopackStore(imageContext);
    check(imageStore.aibpImageIndex().getJSONArray("images").isEmpty(), "Catalog entries are not installed images");
    byte[] frontBytes = bytes("actual-front"), backBytes = bytes("actual-back");
    JSONObject manifest = new JSONObject().put("format", "ato-asset-pack").put("version", 3)
        .put("items", catalog.getJSONArray("items"))
        .put("assets", new JSONArray().put(asset("front", front, frontBytes)).put(asset("back", back, backBytes)));
    String previewTarget = front + ".preview.jpg";
    byte[] previewBytes = bytes("small-front");
    JSONObject preview = new JSONObject().put("source", front).put("sourceSha256", sha(frontBytes))
        .put("target", previewTarget).put("member", previewTarget).put("sha256", sha(previewBytes))
        .put("bytes", previewBytes.length).put("mimeType", "image/jpeg");
    manifest.put("cardPreviewFiles", new JSONArray().put(preview));
    File packageFile = pack(manifest, new Member(front, frontBytes), new Member(back, backBytes), new Member(previewTarget, previewBytes));
    imageStore.importPackage(new ContentResolver(), Uri.parse(packageFile.toURI().toString()));
    imageContext.getAssets().files.put("web/aibp/ps/other/trait/COMMON_TR_025.png", bytes("common"));
    imageContext.getAssets().files.put("web/" + front, frontBytes);
    imageContext.getAssets().files.put("web/aibp/ps/other/private/index.json", bytes("private"));
    imageContext.getAssets().files.put("web/aibp/ps/other/private/secret.jpg", bytes("private"));
    imageContext.getAssets().files.put("web/aibp/ps/other/folder.jpg/child.txt", bytes("directory"));
    JSONArray images = imageStore.aibpImageIndex().getJSONArray("images");
    check(images.length() == 3, "Inventory must merge actual installed/bundled files and deduplicate");
    check(images.toList().contains(front.substring(5)) && images.toList().contains(back.substring(5)), "Installed faces missing");
    check(!images.toList().contains(absent.substring(5)), "Uninstalled catalog filename leaked");
    check(images.toList().contains("ps/other/trait/COMMON_TR_025.png"), "Bundled traits missing");
    check(imageStore.aibpImageIndex().getJSONObject("previews").getString(front.substring(5)).equals(previewTarget.substring(5)),
        "Installed preview must be linked to its original, without appearing as a card");
    JSONObject replacement = new JSONObject().put("format", "ato-asset-pack").put("version", 3)
        .put("items", catalog.getJSONArray("items")).put("assets", new JSONArray().put(asset("front", front, bytes("replaced-front"))))
        .put("cardPreviewFiles", new JSONArray().put(preview));
    File replacementFile = pack(replacement, new Member(front, bytes("replaced-front")), new Member(previewTarget, previewBytes));
    imageStore.importPackage(new ContentResolver(), Uri.parse(replacementFile.toURI().toString()));
    check(!imageStore.aibpImageIndex().getJSONObject("previews").has(front.substring(5)), "Mismatched old preview must be discarded");
    Files.delete(new File(imageContext.getFilesDir(), "atopack/blobs/" + sha(backBytes)).toPath());
    check(!imageStore.aibpImageIndex().getJSONArray("images").toList().contains(back.substring(5)), "Deleted blob must not be advertised");

    String board = "ss/battle-board/battle-board.jpg", boardPreview = board + ".preview.jpg";
    byte[] boardBytes = bytes("large-board"), thumbnail = bytes("small-board");
    JSONObject boardManifest = new JSONObject().put("format", "ato-asset-pack").put("version", 3)
        .put("items", new JSONArray().put(item("board", board)))
        .put("assets", new JSONArray().put(asset("board", board, boardBytes)))
        .put("cardPreviewFiles", new JSONArray().put(resource(boardPreview, thumbnail)
            .put("source", board).put("sourceSha256", sha(boardBytes))));
    File boardFile = pack(boardManifest, new Member(board, boardBytes), new Member(boardPreview, thumbnail));
    imageStore.importPackage(new ContentResolver(), Uri.parse(boardFile.toURI().toString()));
    AtopackStore.OpenedResource smallBoard = imageStore.open(boardPreview);
    check(smallBoard != null, "Battle board thumbnail must be imported");
    try (InputStream input = smallBoard.input) {
      check(Arrays.equals(input.readAllBytes(), thumbnail), "Board thumbnail must roundtrip independently from original");
    }
    check(!imageStore.aibpImageIndex().getJSONArray("images").toList().contains(boardPreview),
        "Board thumbnail must not appear in the Boss card inventory");
    boardManifest.put("assets", new JSONArray().put(asset("board", board, bytes("new-board"))));
    File newBoardFile = pack(boardManifest, new Member(board, bytes("new-board")), new Member(boardPreview, thumbnail));
    imageStore.importPackage(new ContentResolver(), Uri.parse(newBoardFile.toURI().toString()));
    check(imageStore.open(boardPreview) == null, "Replacing the board must discard its mismatched thumbnail");

    String legacyBoard = "ss/battle-board.jpg", legacyPreview = legacyBoard + ".preview.jpg";
    JSONObject legacyManifest = new JSONObject().put("format", "ato-asset-pack").put("version", 3)
        .put("items", new JSONArray().put(item("board", legacyBoard)))
        .put("assets", new JSONArray().put(asset("board", legacyBoard, boardBytes)))
        .put("cardPreviewFiles", new JSONArray().put(resource(legacyPreview, thumbnail)
            .put("source", legacyBoard).put("sourceSha256", sha(boardBytes))));
    File legacyFile = pack(legacyManifest, new Member(legacyBoard, boardBytes), new Member(legacyPreview, thumbnail));
    AtopackStore.ImportResult migrated = imageStore.importPackage(new ContentResolver(), Uri.parse(legacyFile.toURI().toString()));
    check(migrated.assets == 1 && migrated.skipped == 0, "Old board packs must import into the new directory");
    try (InputStream input = imageStore.open(boardPreview).input) {
      check(Arrays.equals(input.readAllBytes(), thumbnail), "Legacy thumbnail must be served under the new path");
    }
    File boardIndex = new File(imageContext.getFilesDir(), "atopack/index.json");
    JSONObject oldIndex = new JSONObject(Files.readString(boardIndex.toPath()));
    JSONObject indexedFiles = oldIndex.getJSONObject("files");
    indexedFiles.put(legacyBoard, indexedFiles.remove(board));
    indexedFiles.put(legacyPreview, indexedFiles.remove(boardPreview));
    Files.writeString(boardIndex.toPath(), oldIndex.toString());
    imageStore = new AtopackStore(imageContext);
    try (InputStream input = imageStore.open(boardPreview).input) {
      check(Arrays.equals(input.readAllBytes(), thumbnail), "Previously imported legacy thumbnail must survive app upgrade");
    }
    check(imageStore.open(legacyBoard) != null, "Legacy board requests must still read the migrated resource");
  }

  private void mapLayers() throws Exception {
    byte[] base=bytes("original-base"), mask=bytes("original-transparent-mask"), number=bytes("printed-number");
    JSONArray layers=new JSONArray().put(resource(MAP_BASE,base)).put(resource(MAP_MASK,mask))
        .put(resource(BACK_BASE,base)).put(resource(BACK_NUMBER,number))
        .put(resource(C4_BASE,base)).put(resource(C4_MASK,mask));
    JSONObject good=manifest().put("mapFiles",layers);
    Member[] members={new Member(MAP_BASE,base),new Member(MAP_MASK,mask),new Member(BACK_BASE,base),new Member(BACK_NUMBER,number),
        new Member(C4_BASE,base),new Member(C4_MASK,mask)};
    check(install(pack(good,members)).assets==6,"Layered map files not installed");
    check("original-base".equals(open(MAP_BASE)),"Map base bytes changed");
    check("original-transparent-mask".equals(open(MAP_MASK)),"Transparent mask bytes changed");
    check("printed-number".equals(open(BACK_NUMBER)),"Shared-back number missing");
    check("original-transparent-mask".equals(open(C4_MASK)),"C4 direction mask bytes changed");
    store=new AtopackStore(context);
    check("printed-number".equals(open(BACK_NUMBER)),"Layered maps did not survive restart");
    for (String cycle : new String[] {"c2", "c3"}) {
      String cycleMask = "map/images/card-backs/numbers/" + cycle + "-tile-001-back.png";
      for (String cycleBase : new String[] {BACK_BASE, "map/images/card-backs/" + cycle + "-base.png"}) {
        JSONArray recolored = new JSONArray().put(resource(cycleBase,base)).put(resource(cycleMask,number));
        check(install(pack(manifest().put("mapFiles",recolored),new Member(cycleBase,base),new Member(cycleMask,number))).assets==2,
            "Shared or legacy cycle base rejected: " + cycleBase);
      }
      reject(pack(manifest().put("mapFiles",new JSONArray().put(resource(cycleMask,number))),new Member(cycleMask,number)));
    }
    reject(pack(manifest().put("mapFiles",new JSONArray().put(resource(MAP_BASE,base))),new Member(MAP_BASE,base)));
    reject(pack(manifest().put("mapFiles",new JSONArray().put(resource(BACK_NUMBER,number))),new Member(BACK_NUMBER,number)));
    reject(pack(manifest().put("mapFiles",new JSONArray().put(resource(C4_MASK,mask))),new Member(C4_MASK,mask)));
    reject(pack(manifest().put("mapFiles",new JSONArray().put(resource(BACK_BASE,base)).put(resource(ALT_NUMBER,number))),
        new Member(BACK_BASE,base),new Member(ALT_NUMBER,number)));
    check(install(pack(manifest().put("mapFiles",new JSONArray().put(resource(BACK_BASE,base))
        .put(resource(ALT_INSTRUCTION,mask))),new Member(BACK_BASE,base),new Member(ALT_INSTRUCTION,mask))).assets==2,
        "Complete special back image must import without obsolete separate number");
    check(install(pack(manifest().put("mapFiles",new JSONArray().put(resource(BACK_BASE,base))
        .put(resource(ALT_NUMBER,number)).put(resource(ALT_INSTRUCTION,mask))),new Member(BACK_BASE,base),
        new Member(ALT_NUMBER,number),new Member(ALT_INSTRUCTION,mask))).assets==3,"Old special back layers rejected");
    JSONObject broken=new JSONObject(good.toString());broken.getJSONArray("mapFiles").getJSONObject(0).put("sha256","0".repeat(64));
    reject(pack(broken,members));
    broken=new JSONObject(good.toString());broken.getJSONArray("mapFiles").getJSONObject(0).put("bytes",base.length+1);
    reject(pack(broken,members));
    broken=new JSONObject(good.toString());broken.getJSONArray("mapFiles").put(resource(MAP_BASE,base));
    reject(pack(broken,members));
    reject(pack(manifest().put("mapFiles",new JSONArray().put(resource("map/app.js",base))),new Member("map/app.js",base)));
    reject(pack(manifest().put("mapFiles","not-an-array")));
    JSONObject legacy=manifest().put("items",new JSONArray().put(item("legacy-map",LEGACY_MAP)))
        .put("assets",new JSONArray().put(asset("legacy-map",LEGACY_MAP,number)));
    check(install(pack(legacy,new Member(LEGACY_MAP,number))).assets==1,"Old flat map pack no longer imports");
    check("printed-number".equals(open(LEGACY_MAP)),"Legacy map fallback resource unreadable");
    byte[] svg = bytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0h2v2z\"/></svg>");
    JSONArray vectors = new JSONArray().put(resource(MAP_BASE,base)).put(resource(MAP_VECTOR,svg))
        .put(resource(BACK_BASE,base)).put(resource(BACK_VECTOR,svg))
        .put(resource(C4_BASE,base)).put(resource(C4_VECTOR,svg));
    Member[] vectorMembers = {new Member(MAP_BASE,base),new Member(MAP_VECTOR,svg),new Member(BACK_BASE,base),
        new Member(BACK_VECTOR,svg),new Member(C4_BASE,base),new Member(C4_VECTOR,svg)};
    check(install(pack(manifest().put("mapFiles",vectors),vectorMembers)).assets==6,"SVG maps not installed");
    for (String target : new String[] {MAP_VECTOR,BACK_VECTOR,C4_VECTOR}) {
      check(new String(svg,StandardCharsets.UTF_8).equals(open(target)),"SVG map bytes changed");
      check("image/svg+xml".equals(store.open(target).mimeType),"SVG MIME must remain image/svg+xml");
      reject(pack(manifest().put("mapFiles",new JSONArray().put(resource(target,svg))),new Member(target,svg)));
    }
    store=new AtopackStore(context);
    check(new String(svg,StandardCharsets.UTF_8).equals(open(MAP_VECTOR)),"SVG map lost after restart");
    check(install(pack(manifest().put("mapFiles",new JSONArray().put(resource(BACK_BASE,base))
        .put(resource(C5_VECTOR,svg))),new Member(BACK_BASE,base),new Member(C5_VECTOR,svg))).assets==2,
        "C5 vector cover not imported with shared base");
    check("image/svg+xml".equals(store.open(C5_VECTOR).mimeType),"C5 cover MIME incorrect");
    reject(pack(manifest().put("mapFiles",new JSONArray().put(resource(C5_VECTOR,svg))),new Member(C5_VECTOR,svg)));
    JSONObject badVector = manifest().put("mapFiles",new JSONArray().put(resource(MAP_BASE,base))
        .put(resource(MAP_VECTOR,svg).put("sha256","0".repeat(64))));
    reject(pack(badVector,new Member(MAP_BASE,base),new Member(MAP_VECTOR,svg)));
    System.out.println("Layered map import passed: "+checks+" behavioral checks.");
  }

  private File mapVariant(boolean current, String edition) throws Exception {
    byte[] base = bytes(edition + "-base"), overlay = bytes(edition + (current ? "-svg" : "-png"));
    byte[] backBase = bytes("shared-back-base"), back = bytes("shared-back-svg");
    String target = current ? MAP_VECTOR : MAP_MASK;
    JSONObject manifest = manifest().put("build", new JSONObject().put("edition", edition)
        .put("mapMaskVersion", current ? "current" : "legacy"))
        .put("mapFiles", new JSONArray().put(resource(MAP_BASE, base)).put(resource(target, overlay))
            .put(resource(BACK_BASE, backBase)).put(resource(BACK_VECTOR, back)));
    return pack(manifest, new Member(MAP_BASE, base), new Member(target, overlay),
        new Member(BACK_BASE, backBase), new Member(BACK_VECTOR, back));
  }

  private void checkMapVariant(boolean current, String edition) throws Exception {
    String expected = edition + (current ? "-svg" : "-png");
    String mime = current ? "image/svg+xml" : "image/png";
    check((edition + "-base").equals(open(MAP_BASE)), "Variant base does not match the imported edition");
    for (String request : new String[] {MAP_MASK, MAP_VECTOR}) {
      check(expected.equals(open(request)), "Map registry request served the wrong mask generation");
      AtopackStore.OpenedResource opened = store.open(request);
      try (InputStream input = opened.input) {
        check(mime.equals(opened.mimeType), "Aliased map mask has the wrong MIME");
      }
      String data = store.readExportImageData(request);
      check(data.startsWith("data:" + mime + ";base64,"), "Export data URL has the requested extension instead of installed mask MIME");
      check(expected.equals(new String(java.util.Base64.getDecoder().decode(data.substring(data.indexOf(',') + 1)),
          StandardCharsets.UTF_8)), "Map export changed the installed mask bytes");
    }
    check("shared-back-svg".equals(open(BACK_VECTOR)), "Legacy front mask must keep the current vector back");
    JSONObject files = new JSONObject(Files.readString(new File(root(), "index.json").toPath())).getJSONObject("files");
    check(files.has(current ? MAP_VECTOR : MAP_MASK), "Selected mask generation is missing from persistent index");
    check(!files.has(current ? MAP_MASK : MAP_VECTOR), "Superseded map mask remains in persistent index");
  }

  private void mapVariants() throws Exception {
    File fanLegacy = mapVariant(false, "fan"), officialLegacy = mapVariant(false, "official"),
        fanCurrent = mapVariant(true, "fan");
    check(install(fanLegacy).assets == 4, "Legacy fan pack did not import");
    checkMapVariant(false, "fan");
    check(install(officialLegacy).assets == 4, "Legacy official pack did not import");
    checkMapVariant(false, "official");
    check(install(fanCurrent).assets == 4, "Current fan pack did not import");
    checkMapVariant(true, "fan");
    store = new AtopackStore(context);
    checkMapVariant(true, "fan");
    AtomicFile.failDuringWrite = true;
    reject(fanLegacy);
    checkMapVariant(true, "fan");
    check(install(fanLegacy).assets == 4, "Current-to-legacy mask switch failed");
    checkMapVariant(false, "fan");
    store = new AtopackStore(context);
    checkMapVariant(false, "fan");
    AtomicFile.failNextWrite = "index.json";
    reject(fanCurrent);
    checkMapVariant(false, "fan");
    check(install(fanCurrent).assets == 4, "Legacy-to-current mask switch failed");
    checkMapVariant(true, "fan");
    context.getAssets().files.put("web/assets/cards/external.svg", bytes("<svg/>"));
    check(store.readExportImageData("assets/cards/external.svg").isEmpty(), "SVG export must remain limited to map resources");
    context.getAssets().files.put("web/" + C4_VECTOR, bytes("<svg/>"));
    check(store.readExportImageData(C4_VECTOR).startsWith("data:image/svg+xml;base64,"), "Bundled map SVG export failed");
    System.out.println("Three map pack variants passed: " + checks + " behavioral checks.");
  }

  private void sharedCardBacks() throws Exception {
    String prefix = "aibp/ps/ALPHA_TEMENOS/ALPHA_TEMENOS_AI_III_";
    String first = prefix + "001.jpg", second = prefix + "003.jpg", special = prefix + "002.jpg";
    String ordinaryBack = prefix + "BACK.jpg", specialBack = prefix + "SPECIAL_BACK.jpg";
    String retired = prefix + "001_BACK.jpg", retiredPreview = retired + ".preview.jpg";
    String dragonFront = "aibp/ps/DRAGON_OF_PHOBOS/DRAGON_OF_PHOBOS_BP_I_001.jpg";
    String dragonBack = dragonFront.replace(".jpg", "_BACK.jpg");
    byte[] ordinary = bytes("corrected-common-back"), unique = bytes("correct-special-back");
    byte[] oldTone = bytes("old-white-common-back"), dragonOld = bytes("old-dragon-effect");
    byte[] dragon = bytes("corrected-dragon-effect"), stale = bytes("wrong-old-numbered-back");
    JSONArray items = new JSONArray()
        .put(item("one", first).put("faces", new JSONObject().put("front", first).put("back", ordinaryBack)))
        .put(item("two", second).put("faces", new JSONObject().put("front", second).put("back", ordinaryBack)))
        .put(item("special", special).put("faces", new JSONObject().put("front", special).put("back", specialBack)))
        .put(item("dragon", dragonFront).put("faces", new JSONObject().put("front", dragonFront).put("back", dragonBack)));
    JSONObject catalog = new JSONObject().put("format", "ato-android-resource-catalog").put("items", items);
    Context sharedContext = new Context(new File(directory, "shared-backs"), catalog.toString());
    JSONObject mapping = new JSONObject().put("version", 1).put("backs", new JSONObject()
        .put(first.substring(5), ordinaryBack.substring(5)).put(second.substring(5), ordinaryBack.substring(5))
        .put(special.substring(5), specialBack.substring(5)).put(dragonFront.substring(5), dragonBack.substring(5)))
        .put("canonicalRevisions", new JSONObject()
          .put(ordinaryBack.substring(5), new JSONObject().put("fromSha256", sha(oldTone)).put("toSha256", sha(ordinary)))
          .put(dragonBack.substring(5), new JSONObject().put("fromSha256", sha(dragonOld)).put("toSha256", sha(dragon))));
    sharedContext.getAssets().files.put("web/aibp/card-backs.json", bytes(mapping.toString()));
    File sharedRoot = new File(sharedContext.getFilesDir(), "atopack");
    File sharedBlobs = new File(sharedRoot, "blobs");
    sharedBlobs.mkdirs();
    Files.write(new File(sharedBlobs, sha(stale)).toPath(), stale);
    Files.write(new File(sharedBlobs, sha(dragon)).toPath(), dragon);
    JSONObject seedFiles = new JSONObject()
        .put(retired, new JSONObject().put("sha256", sha(stale)).put("mimeType", "image/jpeg"))
        .put(retiredPreview, new JSONObject().put("sha256", sha(stale)).put("mimeType", "image/jpeg"))
        .put(dragonBack, new JSONObject().put("sha256", sha(dragon)).put("mimeType", "image/jpeg"));
    File sharedIndex = new File(sharedRoot, "index.json");
    Files.writeString(sharedIndex.toPath(), new JSONObject().put("files", seedFiles).toString());
    AtopackStore sharedStore = new AtopackStore(sharedContext);
    check(sharedStore.open(retired) == null && sharedStore.open(retiredPreview) == null,
        "Retired numbered backs and their previews must not survive an app upgrade");
    check(!new File(sharedBlobs, sha(stale)).exists(), "Unreferenced retired numbered blob was retained");
    check(sharedStore.open(dragonBack) != null, "Distinct Dragon BP effect backs must survive an app upgrade");

    JSONObject good = manifest().put("items", items).put("assets", new JSONArray()
        .put(asset("one", ordinaryBack, ordinary).put("face", "back"))
        .put(asset("two", ordinaryBack, ordinary).put("face", "back"))
        .put(asset("special", specialBack, unique).put("face", "back"))
        .put(asset("dragon", dragonBack, dragon).put("face", "back")));
    File goodFile = pack(good, new Member(ordinaryBack, ordinary), new Member(specialBack, unique), new Member(dragonBack, dragon));
    AtopackStore.ImportResult installed = sharedStore.importPackage(new ContentResolver(), Uri.parse(goodFile.toURI().toString()));
    check(installed.assets == 4 && installed.skipped == 0 && installed.totalResources == 3,
        "Shared back associations must import one physical target per unique back");
    check(sharedBlobs.list().length == 3, "Shared cards must reference a single blob per distinct artwork");
    try (InputStream input = sharedStore.open(specialBack).input) {
      check(Arrays.equals(input.readAllBytes(), unique), "Special AI III back was replaced by the common artwork");
    }
    JSONObject oldItems = new JSONArray(items.toString()).getJSONObject(0);
    oldItems.getJSONObject("faces").put("back", retired);
    JSONObject old = manifest().put("items", new JSONArray().put(oldItems)).put("assets", new JSONArray()
        .put(asset("one", retired, stale).put("face", "back")));
    File oldFile = pack(old, new Member(retired, stale));
    AtopackStore.ImportResult skipped = sharedStore.importPackage(new ContentResolver(), Uri.parse(oldFile.toURI().toString()));
    check(skipped.assets == 0 && skipped.legacyCardBacksSkipped == 1 && skipped.skipped == 1,
        "Old per-card backs must be reported separately and skipped");
    check(skipped.toJson().getInt("legacy_card_backs_skipped") == 1,
        "Import result must expose the legacy back counter to the UI");
    JSONObject faded = manifest().put("items", items).put("assets", new JSONArray()
        .put(asset("one", ordinaryBack, oldTone).put("face", "back"))
        .put(asset("dragon", dragonBack, dragonOld).put("face", "back")));
    File fadedFile = pack(faded, new Member(ordinaryBack, oldTone), new Member(dragonBack, dragonOld));
    skipped = sharedStore.importPackage(new ContentResolver(), Uri.parse(fadedFile.toURI().toString()));
    check(skipped.assets == 0 && skipped.legacyCardBacksSkipped == 2,
        "Known faded JPEG revisions must not overwrite corrected common or Dragon backs");
    try (InputStream input = sharedStore.open(ordinaryBack).input) {
      check(Arrays.equals(input.readAllBytes(), ordinary), "Importing an older tone reverted the corrected original JPG");
    }
    byte[] beforeIndex = Files.readAllBytes(sharedIndex.toPath());
    String beforeStatus = sharedStore.status().toString();
    byte[] conflict = bytes("different-shared-back");
    JSONObject ambiguous = manifest().put("items", items).put("assets", new JSONArray()
        .put(asset("one", ordinaryBack, ordinary).put("face", "back"))
        .put(asset("two", "other-shared.jpg", conflict).put("face", "back")));
    File ambiguousFile = pack(ambiguous, new Member(ordinaryBack, ordinary), new Member("other-shared.jpg", conflict));
    try {
      sharedStore.importPackage(new ContentResolver(), Uri.parse(ambiguousFile.toURI().toString()));
      throw new AssertionError("Conflicting bytes for a shared target must reject the entire package");
    } catch (java.io.IOException expected) { checks++; }
    check(Arrays.equals(beforeIndex, Files.readAllBytes(sharedIndex.toPath())) && beforeStatus.equals(sharedStore.status().toString()),
        "Conflicting shared back changed the committed index or active resources");
    check(sharedBlobs.list().length == 3, "Failed shared-back import leaked a conflicting blob");

    byte[] replacement = bytes("new-custom-common-back");
    JSONObject custom = manifest().put("items", items).put("assets", new JSONArray()
        .put(asset("one", ordinaryBack, replacement).put("face", "back"))
        .put(asset("two", ordinaryBack, replacement).put("face", "back")));
    File customFile = pack(custom, new Member(ordinaryBack, replacement));
    check(sharedStore.importPackage(new ContentResolver(), Uri.parse(customFile.toURI().toString())).assets == 2,
        "Unknown custom revisions must retain normal replacement behavior");
    check(!new File(sharedBlobs, sha(ordinary)).exists() && sharedBlobs.list().length == 3,
        "Replacing a shared back must remove its now-unreferenced old blob");
    sharedStore = new AtopackStore(sharedContext);
    try (InputStream input = sharedStore.open(ordinaryBack).input) {
      check(Arrays.equals(input.readAllBytes(), replacement), "Shared back replacement did not survive restart");
    }
    System.out.println("Shared card back import passed: " + checks + " behavioral checks.");
  }

  private void run() throws Exception {
    imageIndex();
    sharedCardBacks();
    byte[] old = bytes("old-card"), fresh = bytes("new-card"), glyph = bytes("original-glyph");
    JSONObject first = manifest().put("assets", new JSONArray().put(asset("test", ASSET, old)))
        .put("stories", stories("first"));
    check(install(pack(first, new Member(ASSET, old))).assets == 1, "Baseline asset not installed");
    check("old-card".equals(open(ASSET)), "Baseline resource unreadable");
    context.getAssets().files.put("web/" + ASSET, bytes("bundled-card"));
    String imageData = store.readExportImageData(ASSET);
    check(imageData.startsWith("data:image/png;base64,"), "Export image must be a raster data URL");
    check(Arrays.equals(old, java.util.Base64.getDecoder().decode(imageData.substring(imageData.indexOf(',') + 1))),
      "Export must prefer installed pack bytes over bundled image");
    byte[] bundled = new byte[]{0, 1, (byte) 255, (byte) 128};
    context.getAssets().files.put("web/assets/cards/bundled.jpg", bundled);
    imageData = store.readExportImageData("assets/cards/bundled.jpg");
    check(imageData.startsWith("data:image/jpeg;base64,"), "Bundled JPEG has wrong MIME");
    check(Arrays.equals(bundled, java.util.Base64.getDecoder().decode(imageData.substring(imageData.indexOf(',') + 1))),
      "Bundled raster bytes changed during export");
    for (String invalid : new String[]{null, "", "../private.png", "/private.png", "file:///private.png", "assets/cards/missing.png", "story/data/storybook-data.js", "assets/cards/external.svg"}) {
      check(store.readExportImageData(invalid).isEmpty(), "Export image reader accepted missing or non-raster/private path: " + invalid);
    }
    check(open("story/data/storybook-data.js").contains("first"), "Baseline story missing");
    check(!new File(root(), "stories.json").exists(), "Stories must commit inside index, not a second mutable file");
    File cachedBlob = new File(root(), "blobs/" + sha(old));
    Files.write(cachedBlob.toPath(), bytes("disk-damage"));
    AtomicFile.failDuringWrite = true;
    reject(pack(first, new Member(ASSET, old)));
    check("disk-damage".equals(open(ASSET)), "Failed repair did not restore the pre-import disk state");
    check(install(pack(first, new Member(ASSET, old))).assets == 1, "Valid reimport failed to repair cached content");
    check("old-card".equals(open(ASSET)), "Corrupt destination blob was retained on reimport");

    JSONObject lateFailure = manifest().put("assets", new JSONArray().put(asset("test", ASSET, fresh)))
        .put("stories", stories("failed"));
    JSONArray oversizedBgmList = new JSONArray();
    for (int i = 0; i < 129; i++) oversizedBgmList.put(JSONObject.NULL);
    lateFailure.put("bgmFiles", oversizedBgmList);
    reject(pack(lateFailure, new Member(ASSET, fresh)));
    check("old-card".equals(open(ASSET)), "Late validation failure replaced active card");

    JSONObject next = manifest().put("assets", new JSONArray().put(asset("test", ASSET, fresh)))
        .put("stories", stories("second"));
    AtomicFile.failNextWrite = "index.json";
    reject(pack(next, new Member(ASSET, fresh)));
    AtomicFile.failDuringWrite = true;
    reject(pack(next, new Member(ASSET, fresh)));
    store = new AtopackStore(context);
    check("old-card".equals(open(ASSET)), "Commit failure did not preserve old catalog after restart");
    check(!open("story/data/storybook-data.js").contains("second"), "Commit failure persisted new story");

    // Always verify the selected archive bytes, even if the declared hash is cached.
    JSONObject cachedHash = manifest().put("assets", new JSONArray().put(asset("test", ASSET, old)));
    byte[] forged = bytes("bad-card");
    check(install(pack(cachedHash, new Member(ASSET, forged))).skipped == 1, "Cached hash bypassed SHA verification");
    check("old-card".equals(open(ASSET)), "Forged cached content changed resource");

    JSONObject wrongBytes = manifest().put("assets", new JSONArray().put(asset("test", ASSET, fresh).put("bytes", fresh.length + 1)));
    check(install(pack(wrongBytes, new Member(ASSET, fresh))).skipped == 1, "Assets ignored declared bytes");
    JSONObject fractionalBytes = manifest().put("assets", new JSONArray().put(asset("test", ASSET, fresh).put("bytes", fresh.length + 0.5)));
    check(install(pack(fractionalBytes, new Member(ASSET, fresh))).skipped == 1, "Fractional bytes were truncated and accepted");
    File wrongCentral = pack(manifest().put("assets", new JSONArray().put(asset("test", ASSET, fresh).put("bytes", 1))), new Member(ASSET, fresh));
    patchCentralSizes(wrongCentral, 1);
    check(install(wrongCentral).skipped == 1, "Actual decompressed bytes were not checked against entry size");

    JSONObject segments = manifest();
    List<Member> payloads = new ArrayList<>();
    for (String[] segment : new String[][] {
        {"resourceFiles", "story/data/storybook-official-data.js"},
        {"bgmFiles", "assets/bgm/test.mp3"}, {"iconFiles", "assets/icons/test.svg"},
        {"crypticFiles", GLYPH}, {"mixedMediaFiles", MIXED_PNG},
        {"storyFiles", "story/entity-index.json"}}) {
      byte[] payload = bytes("{\"entities\":[{\"id\":\"one\"}]}");
      JSONObject declaration = resource(segment[1], payload).put("bytes", payload.length + 1).put("kind", "entity-index");
      segments.put(segment[0], new JSONArray().put(declaration));
      payloads.add(new Member(segment[1], payload));
    }
    JSONObject skipped = install(pack(segments, payloads.toArray(Member[]::new))).toJson();
    check(skipped.getInt("skipped") == 6, "All segments must validate bytes");
    check(skipped.getInt("cryptic_skipped") == 1, "Invalid glyph missing separate count");
    check(skipped.getJSONArray("cryptic_warnings").getJSONObject(0).getString("target").equals(GLYPH), "Glyph warning lacks target");
    check(!skipped.getJSONArray("cryptic_warnings").getJSONObject(0).getString("reason").isEmpty(), "Glyph warning lacks reason");
    check(skipped.getInt("mixed_media_skipped") == 1, "Invalid mixed-media entry missing separate count");
    check(skipped.getJSONArray("mixed_media_warnings").getJSONObject(0).getString("target").equals(MIXED_PNG), "Mixed-media warning lacks target");
    check(!skipped.getJSONArray("mixed_media_warnings").getJSONObject(0).getString("reason").isEmpty(), "Mixed-media warning lacks reason");
    for (String section : new String[] {"resourceFiles", "bgmFiles", "iconFiles", "crypticFiles", "mixedMediaFiles", "storyFiles"}) {
      JSONObject declaration = segments.getJSONArray(section).getJSONObject(0);
      declaration.put("bytes", payloads.stream().filter(member -> member.name.equals(declaration.getString("member"))).findFirst().orElseThrow().bytes.length);
    }
    AtopackStore.ImportResult validSegments = install(pack(segments, payloads.toArray(Member[]::new)));
    check(validSegments.skipped == 0 && validSegments.entityIndex, "Valid segment files were not staged/committed");
    for (Member member : payloads) {
      String target = member.name.equals("story/entity-index.json") ? "story/data/entity-index.json" : member.name;
      check(new String(member.bytes, StandardCharsets.UTF_8).equals(open(target)), "Valid segment failed roundtrip: " + target);
    }

    // 混合媒体（mapping.js + 书籍裁图）：合法目标要能落地（PNG 与 SVG 都收），
    // 白名单外的路径、路径与成员不一致的声明只跳过，不打断其余素材。
    byte[] mapping = bytes("window.ATO_MIXED_MEDIA_MAP = {};");
    String outsideCycle = "story/assets/mixed-media/images/c6/c6-p001-block.png";
    String upperName = "story/assets/mixed-media/images/c1/UPPER.png";
    String rendererCode = "story/assets/mixed-media/renderer.js";
    String elsewhere = "story/assets/mixed-media/images/c2/other.png";
    JSONObject mixed = manifest().put("mixedMediaFiles", new JSONArray()
        .put(resource(MIXED_MAPPING, mapping))
        .put(resource(MIXED_PNG, glyph))
        .put(resource(MIXED_SVG, glyph))
        .put(resource(outsideCycle, glyph))
        .put(resource(upperName, glyph))
        .put(resource(rendererCode, glyph))
        .put(new JSONObject().put("target", MIXED_PNG).put("member", elsewhere)
            .put("sha256", sha(glyph)).put("bytes", glyph.length)));
    AtopackStore.ImportResult mixedMedia = install(pack(mixed,
        new Member(MIXED_MAPPING, mapping), new Member(MIXED_PNG, glyph), new Member(MIXED_SVG, glyph),
        new Member(outsideCycle, glyph), new Member(upperName, glyph), new Member(rendererCode, glyph),
        new Member(elsewhere, glyph)));
    JSONObject mixedJson = mixedMedia.toJson();
    check(mixedJson.getInt("mixed_media_skipped") == 4, "Illegal mixed-media entries must be skipped and counted separately");
    check(mixedJson.getJSONArray("mixed_media_warnings").length() == 4, "Mixed-media warnings missing");
    for (int index = 0; index < mixedJson.getJSONArray("mixed_media_warnings").length(); index++) {
      JSONObject warning = mixedJson.getJSONArray("mixed_media_warnings").getJSONObject(index);
      check(!warning.getString("target").isEmpty() && !warning.getString("reason").isEmpty(),
          "Mixed-media warning lacks target or reason");
    }
    check("window.ATO_MIXED_MEDIA_MAP = {};".equals(open(MIXED_MAPPING)), "Mixed-media mapping.js did not land");
    check("original-glyph".equals(open(MIXED_PNG)), "Mixed-media PNG did not land");
    check("original-glyph".equals(open(MIXED_SVG)), "Mixed-media SVG did not land");
    check(open(outsideCycle) == null, "Mixed media outside c1..c5 was indexed");
    check(open(upperName) == null, "Mixed-media name outside the renderer whitelist was indexed");
    check(open(rendererCode) == null, "Program code must never be imported from a pack");
    check(open(elsewhere) == null, "Member/target mismatch landed under the declared member");
    check(open(MIXED_PNG) != null, "Target/member mismatch dropped the valid declaration too");

    // 单张裁图上限 8MB、映射表单份 32MB：只把目录里的声明大小抬到上限之上，成员本身很小。
    File oversizedImage = pack(
        manifest().put("mixedMediaFiles", new JSONArray().put(resource(MIXED_PNG, glyph))),
        new Member(MIXED_PNG, glyph));
    patchCentralSizes(oversizedImage, 8L * 1024 * 1024 + 1);
    check(install(oversizedImage).toJson().getInt("mixed_media_skipped") == 1, "Oversized mixed-media image must be skipped");
    File oversizedMapping = pack(
        manifest().put("mixedMediaFiles", new JSONArray().put(resource(MIXED_MAPPING, mapping))),
        new Member(MIXED_MAPPING, mapping));
    patchCentralSizes(oversizedMapping, 32L * 1024 * 1024 + 1);
    check(install(oversizedMapping).toJson().getInt("mixed_media_skipped") == 1, "Oversized mapping.js must be skipped");
    // 成员数上限 2048 + 1：整段超限直接拒收，和 BGM／字形一样不让它改到任何状态。
    JSONArray oversizedMixedList = new JSONArray();
    for (int index = 0; index < 2050; index++) oversizedMixedList.put(JSONObject.NULL);
    reject(pack(manifest().put("mixedMediaFiles", oversizedMixedList)));

    // Old packs used one name twice: identical content and reencoded/original glyphs.
    for (byte[] catalogGlyph : new byte[][] {glyph, bytes("reencoded-glyph"), bytes("ORIGINAL-GLYPH")}) {
      JSONObject legacy = manifest().put("assets", new JSONArray().put(asset("glyph", GLYPH, catalogGlyph)))
          .put("crypticFiles", new JSONArray().put(resource(GLYPH, glyph)));
      check(install(pack(legacy, new Member(GLYPH, catalogGlyph), new Member(GLYPH, glyph))).skipped == 0,
          "Legacy duplicate members could not be resolved");
      check("original-glyph".equals(open(GLYPH)), "Dedicated glyph declaration did not retain original bytes");
    }

    File tooLarge = pack(manifest(), new Member("unreferenced.bin", new byte[] {1}));
    patchCentralSizes(tooLarge, 128L * 1024 * 1024 + 1);
    reject(tooLarge);
    Member[] aggregate = new Member[65];
    for (int index = 0; index < aggregate.length; index++) aggregate[index] = new Member("unreferenced-" + index, new byte[] {1});
    File tooMuch = pack(manifest(), aggregate);
    patchCentralSizes(tooMuch, 128L * 1024 * 1024);
    reject(tooMuch);
    Member[] many = new Member[20_000];
    for (int index = 0; index < many.length; index++) many[index] = new Member("entry-" + index, new byte[0]);
    reject(pack(manifest(), many));

    // A lying ZIP directory cannot evade the stream bound; exercise the same copier.
    Method copy = Arrays.stream(AtopackStore.class.getDeclaredMethods()).filter(method -> method.getName().equals("copy")).findFirst().orElseThrow();
    copy.setAccessible(true);
    File streamFile = new File(directory, "stream.tmp");
    try (FileOutputStream output = new FileOutputStream(streamFile)) {
      try {
        copy.invoke(null, new ByteArrayInputStream(new byte[] {1, 2, 3}), output, null, 2L, null);
        throw new AssertionError("Oversized stream was accepted");
      } catch (InvocationTargetException expected) {
        check(expected.getCause() instanceof java.io.IOException, "Stream limit raised the wrong error");
        check(streamFile.length() == 0, "Oversized stream wrote beyond its cap");
      }
    }
    Class<?> transactionClass = Arrays.stream(AtopackStore.class.getDeclaredClasses()).filter(type -> type.getSimpleName().equals("ImportTransaction")).findFirst().orElseThrow();
    var constructor = transactionClass.getDeclaredConstructor(AtopackStore.class);
    constructor.setAccessible(true);
    Object transaction = constructor.newInstance(store);
    var readBytes = transactionClass.getDeclaredField("readBytes");
    readBytes.setAccessible(true);
    readBytes.setLong(transaction, 8L * 1024 * 1024 * 1024 - 1);
    try (FileOutputStream output = new FileOutputStream(streamFile)) {
      try {
        copy.invoke(null, new ByteArrayInputStream(new byte[] {1, 2, 3}), output, null, 100L, transaction);
        throw new AssertionError("Aggregate stream budget was ignored");
      } catch (InvocationTargetException expected) {
        check(expected.getCause() instanceof java.io.IOException, "Aggregate stream budget raised wrong error");
        check(streamFile.length() == 0, "Aggregate oversized stream wrote past budget");
      }
    } finally { ((AutoCloseable) transaction).close(); }

    check(install(pack(next, new Member(ASSET, fresh))).books == 1, "Successful replacement story missing");
    store = new AtopackStore(context);
    check("new-card".equals(open(ASSET)), "Replacement did not survive restart");
    String merged = open("story/data/storybook-data.js");
    check(merged.contains("first") && merged.contains("second") && !merged.contains("failed"), "Stories did not merge atomically");

    // Recover an interrupted pre-commit import and AtomicFile's previous index.
    File orphan = new File(root(), "blobs/" + "a".repeat(64));
    Files.write(orphan.toPath(), new byte[] {9});
    File stale = new File(root(), "import-killed.staging");
    stale.mkdir();
    Files.write(new File(stale, "pending").toPath(), new byte[] {9});
    File interruptedRepair = new File(root(), "blobs/" + sha(fresh));
    Files.move(interruptedRepair.toPath(), new File(stale, "previous-" + sha(fresh)).toPath());
    File index = new File(root(), "index.json");
    Files.move(index.toPath(), new File(root(), "index.json.bak").toPath());
    store = new AtopackStore(context);
    check("new-card".equals(open(ASSET)), "Atomic backup index was not recovered");
    check(!orphan.exists() && !stale.exists(), "Interrupted import left orphan storage after restart");
    Context legacyContext = new Context(new File(directory, "legacy-app"), new JSONObject().put("format", "ato-android-resource-catalog").put("items", new JSONArray()).toString());
    File legacyRoot = new File(legacyContext.getFilesDir(), "atopack");
    legacyRoot.mkdirs();
    File legacyStories = new File(legacyRoot, "stories.json");
    byte[] oldStories = bytes(stories("legacy").toString());
    Files.write(legacyStories.toPath(), oldStories);
    store = new AtopackStore(legacyContext);
    check(install(pack(manifest().put("stories", stories("migrated")))).books == 1, "Legacy stories migration failed");
    check(open("story/data/storybook-data.js").contains("legacy") && open("story/data/storybook-data.js").contains("migrated"), "Legacy stories were lost during migration");
    check(Arrays.equals(oldStories, Files.readAllBytes(legacyStories.toPath())), "Import mutated legacy stories.json outside atomic index");
    Files.write(new File(legacyRoot, "index.json").toPath(), bytes("damaged-index"));
    store = new AtopackStore(legacyContext);
    check(install(pack(manifest().put("stories", stories("recovered")))).books == 1, "Damaged index blocked a future valid import");
    check(open("story/data/storybook-data.js").contains("recovered"), "Valid import did not replace damaged index");
    System.out.println("Android .atopack import passed: " + checks + " behavioral checks.");
  }

  public static void main(String[] args) throws Exception {
    new AtopackImportHarness(new File(args[0])).run();
    new AtopackImportHarness(new File(args[0],"layered-maps")).mapLayers();
    new AtopackImportHarness(new File(args[0],"map-variants")).mapVariants();
  }
}
