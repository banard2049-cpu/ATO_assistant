package android.content;

import java.util.Map;

public interface SharedPreferences {
  String getString(String key, String fallback);
  boolean contains(String key);
  Map<String, ?> getAll();
  Editor edit();

  interface Editor {
    Editor putString(String key, String value);
    Editor remove(String key);
    void apply();
    boolean commit();
  }
}
