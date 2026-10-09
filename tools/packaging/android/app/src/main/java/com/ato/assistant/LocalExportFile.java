package com.ato.assistant;

import android.util.Base64;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Bytes and MIME type passed to Android's document picker. */
final class LocalExportFile {
  final String filename;
  final String mimeType;
  private final byte[] bytes;

  private LocalExportFile(String filename, String mimeType, byte[] bytes) {
    if (filename == null || filename.isEmpty()) throw new IllegalArgumentException("导出文件名为空。");
    this.filename = filename;
    this.mimeType = mimeType;
    this.bytes = bytes;
  }

  static LocalExportFile json(String filename, String json) {
    if (json == null) throw new IllegalArgumentException("存档内容为空。");
    return new LocalExportFile(filename, "application/json", json.getBytes(StandardCharsets.UTF_8));
  }

  static LocalExportFile briefingZip(String filename, String base64) {
    if (base64 == null || base64.isEmpty()) throw new IllegalArgumentException("简报文件为空。");
    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
    if (bytes.length < 4 || bytes[0] != 'P' || bytes[1] != 'K') throw new IllegalArgumentException("简报 ZIP 内容无效。");
    return new LocalExportFile(filename, "application/zip", bytes);
  }

  void writeTo(OutputStream output) throws IOException {
    output.write(bytes);
    output.flush();
  }
}
