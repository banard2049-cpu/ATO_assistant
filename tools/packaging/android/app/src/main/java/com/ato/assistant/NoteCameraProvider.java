package com.ato.assistant;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

// Only temporary capture files are shared, never campaign data or other cache files.
public final class NoteCameraProvider extends ContentProvider {
  @Override public boolean onCreate() { return true; }

  private File file(Uri uri) throws FileNotFoundException {
    String name = uri.getLastPathSegment();
    if (uri.getPathSegments().size() != 1 || name == null || !name.matches("capture-[A-Za-z0-9-]+\\.jpg")) {
      throw new FileNotFoundException("Invalid capture URI");
    }
    File file = new File(new File(getContext().getCacheDir(), "note-camera"), name);
    if (!file.isFile()) throw new FileNotFoundException("Capture file does not exist");
    return file;
  }

  @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.parseMode(mode));
  }
  @Override public String getType(Uri uri) { return "image/jpeg"; }
  @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
    try {
      File file = file(uri);
      String[] columns = projection == null ? new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE } : projection;
      MatrixCursor cursor = new MatrixCursor(columns);
      Object[] values = new Object[columns.length];
      for (int index = 0; index < columns.length; index++) {
        if (OpenableColumns.DISPLAY_NAME.equals(columns[index])) values[index] = "拍摄照片.jpg";
        if (OpenableColumns.SIZE.equals(columns[index])) values[index] = file.length();
      }
      cursor.addRow(values);
      return cursor;
    } catch (FileNotFoundException missing) { return null; }
  }
  @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
  @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
  @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
