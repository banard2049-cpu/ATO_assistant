package com.ato.assistant;

import android.util.JsonReader;
import android.util.JsonToken;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.function.BooleanSupplier;

/** Reads an existing private mapping.js as data, without loading its script into WebView. */
final class MixedMediaMapReader {
  private static final Set<String> LEDGERS = fields("rows resourceRows battleRows requestedRows resourceScopeExclusions");
  private static final Set<String> SCHEMAS = fields("schema resourceSchema battleSchema requestedSchema vectorSchema");
  // Audit notes/hashes/coverage are deliberately skipped. Keep every field consumed by renderer.js.
  private static final Set<String> TEXT = fields("book key variant kind path anchor position replaceText contextBefore contextAfter textFingerprint layout alt resourceLabel semanticLabel retainedNameText scope vectorPath sourcePngSha256 svgSha256");
  private static final Set<String> NUMBERS = fields("anchorOccurrence anchorCount textLength retainedNameStart retainedNameEnd pdfPage printedPage start end width height");
  private static final Set<String> FLAGS = fields("textAlreadyNamesResource textAlreadyNamesMedia");

  private static Set<String> fields(String names) { return new HashSet<>(Arrays.asList(names.split(" "))); }

  static boolean validContext(String book, String variant, String key) {
    return book != null && book.matches("c[1-5]") && ("fan".equals(variant) || "official".equals(variant))
        && key != null && !key.isEmpty() && key.length() <= 256;
  }

  static String read(InputStream input, String book, String variant, String key) throws IOException, JSONException {
    return read(input, book, variant, key, () -> false);
  }

  static String read(InputStream input, String book, String variant, String key, BooleanSupplier cancelled)
      throws IOException, JSONException {
    if (!validContext(book, variant, key)) throw new IOException("Invalid mixed-media context");
    // Check cancellation during I/O too: skipValue() can consume a large audit field
    // without returning to the record loop. Closing this wrapper also closes the blob.
    InputStream cancellable = new java.io.FilterInputStream(input) {
      @Override public int read() throws IOException {
        checkCancelled(cancelled);
        return in.read();
      }
      @Override public int read(byte[] bytes, int offset, int length) throws IOException {
        checkCancelled(cancelled);
        return in.read(bytes, offset, length);
      }
    };
    try (BufferedReader source = new BufferedReader(new InputStreamReader(cancellable, StandardCharsets.UTF_8), 64 * 1024)) {
      // The material format is a JSON object assigned to this one global, optionally preceded by a comment.
      // No JavaScript is evaluated, including any text after the JSON object.
      StringBuilder prefix = new StringBuilder();
      int ch;
      boolean assignment = false;
      while (prefix.length() < 4096 && (ch = source.read()) != -1) {
        if (ch == '=' && prefix.toString().matches("(?s)[\\s\\uFEFF]*(?:(?:/\\*.*?\\*/|//[^\\r\\n]*)\\s*)*window\\.ATO_MIXED_MEDIA_MAP\\s*")) {
          assignment = true;
          break;
        }
        prefix.append((char) ch);
      }
      if (!assignment) {
        throw new IOException("Invalid mixed-media assignment");
      }
      JsonReader reader = new JsonReader(source);
      JSONObject result = new JSONObject();
      reader.beginObject();
      while (reader.hasNext()) {
        checkCancelled(cancelled);
        String name = reader.nextName();
        if (SCHEMAS.contains(name)) result.put(name, readScalar(reader));
        else if ((LEDGERS.contains(name) || "vectorAssets".equals(name)) && reader.peek() == JsonToken.BEGIN_ARRAY) {
          JSONArray records = new JSONArray();
          reader.beginArray();
          while (reader.hasNext()) {
            checkCancelled(cancelled);
            if (reader.peek() != JsonToken.BEGIN_OBJECT) { reader.skipValue(); continue; }
            JSONObject record = readRecord(reader);
            if ("vectorAssets".equals(name) || (book.equals(record.optString("book"))
                && variant.equals(record.optString("variant")) && key.equals(record.optString("key")))) {
              if (records.length() >= 1024) throw new IOException("Mixed-media entry is too large");
              records.put(record);
            }
          }
          reader.endArray();
          result.put(name, records);
        } else reader.skipValue();
      }
      reader.endObject();
      checkCancelled(cancelled);
      Object schema = result.opt("schema");
      if (!(schema instanceof Number) || ((Number) schema).doubleValue() != 1) throw new IOException("Unsupported mixed-media schema");
      String json = result.toString();
      if (json.length() > 1024 * 1024) throw new IOException("Mixed-media entry is too large");
      return json;
    }
  }

  private static void checkCancelled(BooleanSupplier cancelled) throws IOException {
    if (Thread.currentThread().isInterrupted() || cancelled.getAsBoolean()) {
      throw new IOException("Mixed-media request cancelled");
    }
  }

  private static JSONObject readRecord(JsonReader reader) throws IOException, JSONException {
    JSONObject record = new JSONObject();
    reader.beginObject();
    while (reader.hasNext()) {
      String name = reader.nextName();
      if (TEXT.contains(name) || NUMBERS.contains(name) || FLAGS.contains(name)) record.put(name, readScalar(reader));
      else reader.skipValue();
    }
    reader.endObject();
    return record;
  }

  private static Object readScalar(JsonReader reader) throws IOException, JSONException {
    switch (reader.peek()) {
      case STRING: return reader.nextString();
      case NUMBER: return new org.json.JSONTokener(reader.nextString()).nextValue();
      case BOOLEAN: return reader.nextBoolean();
      case NULL: reader.nextNull(); return JSONObject.NULL;
      default: reader.skipValue(); return JSONObject.NULL;
    }
  }
}
