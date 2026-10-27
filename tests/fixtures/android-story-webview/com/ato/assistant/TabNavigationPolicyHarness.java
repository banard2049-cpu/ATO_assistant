package com.ato.assistant;

public final class TabNavigationPolicyHarness {
  private static int checks;
  private static void check(boolean condition, String message) {
    checks++;
    if (!condition) throw new AssertionError(message);
  }
  public static void main(String[] args) {
    String root = "file:///android_asset/web/";
    check(TabNavigationPolicy.canReuse("dashboard", root + "index.html?cycle=c1", root + "index.html"), "dashboard singleton");
    check(TabNavigationPolicy.canReuse("map", root + "map/index.html?cycle=c2", root + "map/index.html?cycle=c2"), "same map");
    check(!TabNavigationPolicy.canReuse("map", root + "map/index.html?cycle=c2", root + "map/index.html?cycle=c3"), "different cycle");
    check(TabNavigationPolicy.canReuse("story", root + "story/index.html?book=c2", root + "story/index.html?book=c2"), "same general story");
    for (String suffix : new String[]{"chapter=battle", "module=battle", "encounter=dahaka", "battle=dahaka", "entry=123", "id=123", "key=abc", "q=test", "search=test", "%65ntry=123"}) {
      String targeted = root + "story/index.html?book=c2&" + suffix;
      check(!TabNavigationPolicy.canReuse("story", targeted, targeted), "explicit target must not reuse a reader: " + suffix);
    }
    String boss = root + "aibp/index.html#DAHAKA";
    check(!TabNavigationPolicy.canReuse("aibp", boss, boss), "explicit boss must not silently reuse old state");
    check(!TabNavigationPolicy.canReuse("story", root + "story/index.html", root + "story/index.html#c2"), "story fragment");
    check(!TabNavigationPolicy.canReuse("story", root + "story/index.html", "not a valid uri %"), "invalid URL");
    System.out.println("Android tab navigation policy passed: " + checks + " checks");
  }
}
