package android.content.res;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.FileNotFoundException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class AssetManager {
  public final Map<String, byte[]> files = new HashMap<>();
  public AssetManager(String catalog) { files.put("atopack-catalog.json", catalog.getBytes(StandardCharsets.UTF_8)); }
  public String[] list(String directory) {
    java.util.Set<String> children = new java.util.TreeSet<>();
    String prefix = directory + "/";
    for (String path : files.keySet()) {
      if (!path.startsWith(prefix)) continue;
      children.add(path.substring(prefix.length()).split("/", 2)[0]);
    }
    return children.toArray(new String[0]);
  }
  public InputStream open(String path) throws FileNotFoundException {
    byte[] bytes = files.get(path);
    if (bytes == null) throw new FileNotFoundException(path);
    return new ByteArrayInputStream(bytes);
  }
}
