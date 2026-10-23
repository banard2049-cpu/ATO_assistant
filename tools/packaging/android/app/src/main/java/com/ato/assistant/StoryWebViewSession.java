package com.ato.assistant;

/** One instance per WebView; only main-frame navigations are passed here. */
final class StoryWebViewSession {
  private final String root;
  private boolean storyLoaded;

  StoryWebViewSession(String root) { this.root = root; }

  boolean needsResetOnNavigation(String url) {
    if (url == null) return false;
    String page = url.split("[?#]", 2)[0];
    if (page.equals(root + "story/index.html") || page.equals(root + "story/")) storyLoaded = true;
    return storyLoaded && (page.equals(root + "index.html") || page.equals(root));
  }
}
