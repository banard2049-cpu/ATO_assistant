package com.ato.assistant;

/** Stable page geometry: system bars and native tabs count; the IME does not. */
final class MobileLayoutEnvironment {
  static final String UNAVAILABLE = "{\"apk\":false,\"portrait\":false,\"width\":0,\"height\":0}";
  static final String BACK_SCRIPT = "(function(){try{return !!(window.ATO_MOBILE_LAYOUT&&typeof window.ATO_MOBILE_LAYOUT.back==='function'&&window.ATO_MOBILE_LAYOUT.back()===true);}catch(error){return false;}})()";

  private MobileLayoutEnvironment() { }

  static String forWindow(int width, int height, int left, int top, int right, int bottom,
      int nativeTabsHeight, float density) {
    float scale = density > 0 && Float.isFinite(density) ? density : 1f;
    int contentWidth = Math.max(0, Math.round(Math.max(0, width - left - right) / scale));
    int contentHeight = Math.max(0, Math.round(Math.max(0, height - top - bottom - nativeTabsHeight) / scale));
    boolean portrait = contentWidth > 0 && contentHeight > contentWidth;
    return "{\"apk\":true,\"portrait\":" + portrait + ",\"width\":" + contentWidth
        + ",\"height\":" + contentHeight + "}";
  }

  static String eventScript(String environment) {
    return "window.dispatchEvent(new CustomEvent('ato-android-layout-change',{detail:" + environment + "}));";
  }
}
