package com.ato.assistant;

import java.net.URI;
import java.net.URLDecoder;
import java.util.Objects;

/** Determines whether a previously opened module can satisfy a navigation. */
final class TabNavigationPolicy {
  private TabNavigationPolicy() { }

  static boolean canReuse(String module, String currentUrl, String targetUrl) {
    if ("dashboard".equals(module)) return true;
    try {
      URI current = URI.create(currentUrl);
      URI target = URI.create(targetUrl);
      // A fragment may select a specific AIBP boss even if an older tab was
      // originally opened with the same URL and has since changed state.
      if (target.getRawFragment() != null && !target.getRawFragment().isEmpty()) return false;
      if ("story".equals(module) && hasStoryTarget(target)) return false;
      return Objects.equals(current.getRawQuery(), target.getRawQuery());
    } catch (IllegalArgumentException error) {
      return false;
    }
  }

  private static boolean hasStoryTarget(URI uri) {
    String query = uri.getRawQuery();
    if (query == null) return false;
    for (String part : query.split("&")) {
      String rawKey = part.split("=", 2)[0];
      String key;
      try { key = URLDecoder.decode(rawKey, "UTF-8"); }
      catch (Exception invalid) { return true; }
      for (String targeted : new String[]{"chapter", "module", "encounter", "battle", "entry", "id", "key", "q", "search"})
        if (targeted.equals(key)) return true;
    }
    return false;
  }
}
