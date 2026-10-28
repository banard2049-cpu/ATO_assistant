package com.ato.assistant;

public final class MobileLayoutEnvironmentHarness {
  private static int checks;
  private static void equal(String actual, String expected, String message) {
    checks++;
    if (!actual.equals(expected)) throw new AssertionError(message + ": " + actual);
  }
  public static void main(String[] args) {
    equal(MobileLayoutEnvironment.forWindow(1080, 2400, 0, 72, 0, 72, 144, 3),
        "{\"apk\":true,\"portrait\":true,\"width\":360,\"height\":704}", "portrait window without IME");
    equal(MobileLayoutEnvironment.forWindow(2400, 1080, 72, 0, 72, 0, 144, 3),
        "{\"apk\":true,\"portrait\":false,\"width\":752,\"height\":312}", "landscape with side bars");
    equal(MobileLayoutEnvironment.forWindow(800, 848, 0, 0, 0, 0, 48, 1),
        "{\"apk\":true,\"portrait\":false,\"width\":800,\"height\":800}", "square content is not portrait");
    equal(MobileLayoutEnvironment.forWindow(800, 849, 0, 0, 0, 0, 48, 1),
        "{\"apk\":true,\"portrait\":true,\"width\":800,\"height\":801}", "strict content aspect ratio");
    equal(MobileLayoutEnvironment.forWindow(0, 0, 0, 0, 0, 0, 48, 1),
        "{\"apk\":true,\"portrait\":false,\"width\":0,\"height\":0}", "unmeasured content is not portrait");
    equal(MobileLayoutEnvironment.forWindow(100, 100, 60, 60, 60, 60, 48, 1),
        "{\"apk\":true,\"portrait\":false,\"width\":0,\"height\":0}", "insets clamp at zero");
    equal(MobileLayoutEnvironment.forWindow(360, 844, 0, 24, 0, 24, 48, 0),
        "{\"apk\":true,\"portrait\":true,\"width\":360,\"height\":748}", "invalid density fallback");
    equal(MobileLayoutEnvironment.eventScript("{\"apk\":true}"),
        "window.dispatchEvent(new CustomEvent('ato-android-layout-change',{detail:{\"apk\":true}}));", "event contract");
    System.out.println("Android mobile layout environment passed: " + checks + " checks");
  }
}
