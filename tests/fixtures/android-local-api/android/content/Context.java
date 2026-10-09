package android.content;

import java.util.HashMap;
import java.util.Map;

public class Context {
  public static final int MODE_PRIVATE = 0;
  public final MemoryStore store = new MemoryStore();

  public SharedPreferences getSharedPreferences(String name, int mode) { return store; }
  public java.io.File getFilesDir() { return new java.io.File(System.getProperty("ato.test.files", System.getProperty("java.io.tmpdir") + "/ato-local-api-test")); }

  public static class MemoryStore implements SharedPreferences {
    private final Map<String, String> values = new HashMap<>();
    public int commits;
    public String getString(String key, String fallback) { return values.getOrDefault(key, fallback); }
    public boolean contains(String key) { return values.containsKey(key); }
    public Map<String, ?> getAll() { return new HashMap<>(values); }
    public Editor edit() {
      return new Editor() {
        private final Map<String, String> pending = new HashMap<>();
        public Editor putString(String key, String value) { pending.put(key, value); return this; }
        public Editor remove(String key) { pending.put(key, null); return this; }
        public void apply() {
          for (Map.Entry<String, String> entry : pending.entrySet()) {
            if (entry.getValue() == null) values.remove(entry.getKey());
            else values.put(entry.getKey(), entry.getValue());
          }
          commits++;
        }
      };
    }
  }
}
