package android.graphics;

public final class BitmapFactory {
  public static class Options {
    public boolean inJustDecodeBounds;
    public int outWidth = -1;
    public int outHeight = -1;
    public String outMimeType;
  }
  public static Object decodeByteArray(byte[] data, int offset, int length, Options options) {
    try {
      java.awt.image.BufferedImage image = javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(data, offset, length));
      if (image != null) {
        options.outWidth = image.getWidth();
        options.outHeight = image.getHeight();
        options.outMimeType = data[0] == (byte) 0x89 ? "image/png" : "image/jpeg";
      }
    } catch (java.io.IOException invalid) { }
    return null;
  }
}
