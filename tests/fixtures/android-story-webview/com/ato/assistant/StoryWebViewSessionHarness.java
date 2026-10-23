package com.ato.assistant;

public final class StoryWebViewSessionHarness {
  private static final String ROOT = "file:///android_asset/web/";
  private static int checks;

  private static void check(boolean value, String message) {
    checks++;
    if (!value) throw new AssertionError(message);
  }

  public static void main(String[] args) {
    StoryWebViewSession session = new StoryWebViewSession(ROOT);
    check(!session.needsResetOnNavigation(ROOT + "index.html"), "Startup loop");
    check(!session.needsResetOnNavigation(ROOT + "map/index.html"), "Map navigation reset");
    check(!session.needsResetOnNavigation(ROOT + "index.html"), "Non-story round trip reset");
    for (int visit = 0; visit < 5; visit++) {
      check(!session.needsResetOnNavigation(ROOT + "story/index.html?book=c2#730"), "Story entry reset");
      check(!session.needsResetOnNavigation(ROOT + "story/index.html?book=c3"), "Story deep link reset");
      check(!session.needsResetOnNavigation(ROOT + "hero/index.html"), "Intervening module reset");
      check(session.needsResetOnNavigation(ROOT + "index.html?cycle=c2#dashboard"), "Story WebView retained");
      // The old WebView must remain marked until the replacement has actually been created.
      check(session.needsResetOnNavigation(ROOT + "index.html"), "Duplicate callback lost reset");
      session = new StoryWebViewSession(ROOT);
      check(!session.needsResetOnNavigation(ROOT + "index.html"), "Replacement reset itself");
    }
    session.needsResetOnNavigation(ROOT + "story/");
    check(!session.needsResetOnNavigation(null), "Null URL reset");
    check(!session.needsResetOnNavigation("https://example.invalid/index.html"), "External URL reset");
    check(!session.needsResetOnNavigation(ROOT + "index.html.backup"), "Prefix URL reset");
    check(!session.needsResetOnNavigation(ROOT + "map/index.html"), "Nested index reset");
    check(session.needsResetOnNavigation(ROOT), "Directory home missed");
    System.out.println("Story WebView navigation checks passed: " + checks);
  }
}
