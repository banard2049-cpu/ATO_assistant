package com.ato.assistant;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.HorizontalScrollView;
import android.view.Gravity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.TextUtils;
import android.widget.LinearLayout;
import java.util.ArrayList;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

public final class MainActivity extends Activity {
  private static final String ROOT = "file:///android_asset/web/";
  private static final int FILE_CHOOSER_REQUEST = 1001;
  private static final int ATOPACK_CHOOSER_REQUEST = 1002;
  private static final int EXPORT_CHOOSER_REQUEST = 1003;
  private static final int BACKUPS_EXPORT_REQUEST = 1004;
  private static final int BACKUPS_IMPORT_REQUEST = 1005;
  // 为旧页面保留崩溃标记；新版故事页使用逐条读取，无需关闭插图。
  private static volatile boolean rendererCrashedThisProcess;
  private final ExecutorService mixedMediaWorker = Executors.newSingleThreadExecutor();
  private static final int MAX_TABS = 6;
  private static final class PageTab {
    volatile boolean closed;
    volatile WebView view;
    StoryWebViewSession story;
    AtomicLong requests = new AtomicLong();
    String title = "新页面";
    boolean loginPage;
    boolean dashboardAuthenticated;
  }
  private final ArrayList<PageTab> tabs = new ArrayList<>();
  private PageTab activeTab;
  private HorizontalScrollView tabScroll;
  private LinearLayout tabStrip;
  private volatile WebView exportOwner;
  private volatile WebView atopackOwner;
  private volatile WebView webView;
  private volatile WebView retiringStoryWebView;
  private StoryWebViewSession currentStorySession;
  private FrameLayout rootView;
  private ValueCallback<Uri[]> filePathCallback;
  private Uri pendingCameraUri;
  private LocalCampaignApi localApi;
  private AtopackStore atopackStore;
  private LocalSecondScreenServer secondScreenServer;
  private LocalExportFile pendingExportFile;
  private final Object backupsOperationLock = new Object();
  private String backupsOperationUser;
  private String backupsOperationAction;
  private WebView backupsOperationOwner;
  private TextToSpeech storyTts;
  private volatile boolean storyTtsReady;
  private String storyTtsText = "";
  private String storyTtsId = "";
  private float storyTtsRate = 1f;
  private int storyTtsOffset;
  private int storyTtsSegmentStart;
  private String storyTtsSegmentId = "";
  private int storyTtsSegmentNumber;
  private boolean storyTtsPaused;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    atopackStore = new AtopackStore(this);
    localApi = new LocalCampaignApi(this);
    localApi.attachImageIndex(atopackStore::aibpImageIndex);
    secondScreenServer = new LocalSecondScreenServer(this, atopackStore, localApi);
    localApi.attachSecondScreenServer(secondScreenServer);
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    // Android 15 draws the status bar transparently over this root view.
    // Paint the inset area dark so the white system clock and icons stay legible.
    layout.setBackgroundColor(Color.rgb(31, 48, 45));
    // Android 15 enforces edge-to-edge for target SDK 35. Keep both the
    // toolbar and page contents clear of status/navigation bars and cutouts.
    layout.setOnApplyWindowInsetsListener((view, insets) -> {
      int left, top, right, bottom;
      if (android.os.Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets bars = insets.getInsets(
            android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
        android.graphics.Insets keyboard = insets.getInsets(android.view.WindowInsets.Type.ime());
        left = bars.left; top = bars.top; right = bars.right; bottom = Math.max(bars.bottom, keyboard.bottom);
      } else {
        left = insets.getSystemWindowInsetLeft(); top = insets.getSystemWindowInsetTop();
        right = insets.getSystemWindowInsetRight(); bottom = insets.getSystemWindowInsetBottom();
      }
      view.setPadding(left, top, right, bottom);
      return insets;
    });
    LinearLayout toolbar = new LinearLayout(this);
    toolbar.setBackgroundColor(Color.rgb(31, 48, 45));
    toolbar.setGravity(Gravity.CENTER_VERTICAL);
    tabScroll = new HorizontalScrollView(this);
    tabScroll.setHorizontalScrollBarEnabled(false);
    tabScroll.setFillViewport(false);
    tabStrip = new LinearLayout(this);
    tabStrip.setOrientation(LinearLayout.HORIZONTAL);
    tabScroll.addView(tabStrip);
    toolbar.addView(tabScroll, new LinearLayout.LayoutParams(0, dp(48), 1));
    TextView add = new TextView(this);
    add.setText("＋");
    add.setTextSize(24);
    add.setTextColor(Color.WHITE);
    add.setGravity(Gravity.CENTER);
    add.setContentDescription("打开新页面");
    add.setOnClickListener(v -> openNewTab());
    toolbar.addView(add, new LinearLayout.LayoutParams(dp(48), dp(48)));
    layout.addView(toolbar);
    rootView = new FrameLayout(this);
    layout.addView(rootView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
    setContentView(layout);
    openNewTab();

    storyTts = new TextToSpeech(this, status -> {
      if (status != TextToSpeech.SUCCESS || storyTts == null) return;
      storyTts.setLanguage(Locale.SIMPLIFIED_CHINESE);
      storyTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
        @Override public void onStart(String utteranceId) { }

        @Override public void onDone(String utteranceId) {
          if (utteranceId.equals(storyTtsSegmentId)) finishStoryTts(storyTtsId, true, "");
        }

        @Override public void onError(String utteranceId) {
          if (utteranceId.equals(storyTtsSegmentId)) finishStoryTts(storyTtsId, false, "Android 系统语音合成失败");
        }

        @Override public void onError(String utteranceId, int errorCode) {
          if (utteranceId.equals(storyTtsSegmentId)) finishStoryTts(storyTtsId, false, "Android 系统语音合成失败（" + errorCode + "）");
        }

        @Override public void onStop(String utteranceId, boolean interrupted) {
          if (utteranceId.equals(storyTtsSegmentId) && !storyTtsPaused) finishStoryTts(storyTtsId, false, "朗读已停止");
        }

        @Override public void onRangeStart(String utteranceId, int start, int end, int frame) {
          if (utteranceId.equals(storyTtsSegmentId)) storyTtsOffset = Math.max(storyTtsOffset, storyTtsSegmentStart + start);
        }
      });
      storyTtsReady = true;
      runOnUiThread(() -> {
        for (PageTab tab : tabs) if (!tab.closed) tab.view.evaluateJavascript("window.ATOAndroidTtsReady&&window.ATOAndroidTtsReady()", null);
      });
    });
  }

  private void openNewTab() {
    if (tabs.size() >= MAX_TABS) {
      Toast.makeText(this, "最多同时打开 6 个页面，请先关闭一个页面。", Toast.LENGTH_SHORT).show();
      return;
    }
    PageTab tab = new PageTab();
    tabs.add(tab);
    createWebView(tab, ROOT + "index.html");
    selectTab(tab);
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private void updateTabs(boolean revealActive) {
    tabStrip.removeAllViews();
    View selected = null;
    for (PageTab tab : tabs) {
      LinearLayout item = new LinearLayout(this);
      item.setOrientation(LinearLayout.HORIZONTAL);
      item.setGravity(Gravity.CENTER_VERTICAL);
      item.setBackgroundColor(tab == activeTab ? Color.rgb(245, 241, 232) : Color.rgb(53, 73, 69));
      LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(dp(150), dp(42));
      itemParams.setMargins(dp(4), dp(4), 0, dp(2));
      tabStrip.addView(item, itemParams);
      TextView label = new TextView(this);
      label.setText(tab.title);
      label.setTextSize(14);
      label.setSingleLine(true);
      label.setEllipsize(TextUtils.TruncateAt.END);
      label.setPadding(dp(12), 0, dp(4), 0);
      label.setGravity(Gravity.CENTER_VERTICAL);
      label.setTextColor(tab == activeTab ? Color.rgb(25, 47, 41) : Color.WHITE);
      label.setTypeface(null, tab == activeTab ? Typeface.BOLD : Typeface.NORMAL);
      label.setContentDescription("切换到 " + tab.title);
      label.setOnClickListener(v -> selectTab(tab));
      item.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
      TextView close = new TextView(this);
      close.setText("×");
      close.setTextSize(20);
      close.setTextColor(tab == activeTab ? Color.rgb(25, 47, 41) : Color.WHITE);
      close.setGravity(Gravity.CENTER);
      close.setContentDescription("关闭 " + tab.title);
      close.setOnClickListener(v -> closeTab(tab));
      item.addView(close, new LinearLayout.LayoutParams(dp(42), ViewGroup.LayoutParams.MATCH_PARENT));
      if (tab == activeTab) selected = item;
    }
    if (revealActive && selected != null) {
      final View target = selected;
      tabScroll.post(() -> tabScroll.smoothScrollTo(target.getLeft(), 0));
    }
  }

  private static String moduleForUrl(String url) {
    if (url == null || !url.startsWith(ROOT)) return "";
    String path = url.substring(ROOT.length()).split("[?#]", 2)[0];
    if (path.isEmpty() || path.equals("index.html")) return "dashboard";
    for (String module : new String[]{"story", "map", "record", "hero", "technology", "aibp", "briefing"})
      if (path.equals(module + "/") || path.equals(module + "/index.html")) return module;
    return "";
  }

  private void openModule(String url) {
    String module = moduleForUrl(url);
    if (module.isEmpty()) return;
    for (PageTab tab : tabs) {
      String currentUrl = tab.view.getUrl();
      if (!tab.closed && module.equals(moduleForUrl(currentUrl))) {
        // The dashboard is a single shared page. Other modules can carry a
        // different cycle/book/profile in the query and must keep that context.
        String currentQuery = Uri.parse(currentUrl).getEncodedQuery();
        String targetQuery = Uri.parse(url).getEncodedQuery();
        if ("dashboard".equals(module) || java.util.Objects.equals(currentQuery, targetQuery)) {
          selectTab(tab);
          return;
        }
      }
    }
    if (tabs.size() >= MAX_TABS) {
      Toast.makeText(this, "最多同时打开 6 个页面，请先关闭一个页面。", Toast.LENGTH_SHORT).show();
      return;
    }
    PageTab tab = new PageTab();
    tabs.add(tab);
    createWebView(tab, url);
    selectTab(tab);
  }

  private void selectTab(PageTab tab) {
    if (tab == null || tab.closed) return;
    if (activeTab != null && activeTab != tab && activeTab.view != null) {
      // The system TTS engine is shared; finish the old page's utterance before switching.
      if (!storyTtsId.isEmpty()) {
        String id = storyTtsId;
        storyTtsId = "";
        storyTtsText = "";
        storyTtsPaused = false;
        if (storyTts != null) storyTts.stop();
        notifyStoryTtsResult(id, false, "切换页面，朗读已停止");
      }
      activeTab.view.setVisibility(View.GONE);
    }
    activeTab = tab;
    webView = tab.view;
    currentStorySession = tab.story;
    tab.view.setVisibility(View.VISIBLE);
    updateTabs(true);
  }

  private void closeTab(PageTab tab) {
    if (tab == null || tab.closed) return;
    if (tabs.size() == 1) {
      Toast.makeText(this, "请至少保留一个页面。", Toast.LENGTH_SHORT).show();
      return;
    }
    int index = tabs.indexOf(tab);
    if (tab == activeTab) selectTab(tabs.get(index == 0 ? 1 : index - 1));
    tabs.remove(tab);
    tab.closed = true;
    tab.requests.incrementAndGet();
    if (tab.view.getParent() instanceof ViewGroup) ((ViewGroup) tab.view.getParent()).removeView(tab.view);
    tab.view.removeJavascriptInterface("ATOAndroid");
    tab.view.destroy();
    updateTabs(false);
  }

  private void createWebView(PageTab tab, String url) {
    final WebView view = new WebView(this);
    tab.view = view;
    tab.story = new StoryWebViewSession(ROOT);
    tab.requests = new AtomicLong();
    final StoryWebViewSession storySession = tab.story;
    final AtomicLong requests = tab.requests;
    // Only debug APKs expose their WebView to adb/Chrome inspection.
    if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
    rootView.addView(view, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

    WebSettings settings = view.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setAllowFileAccessFromFileURLs(true);
    settings.setAllowUniversalAccessFromFileURLs(true);
    settings.setMediaPlaybackRequiresUserGesture(false);

    view.addJavascriptInterface(new LocalApiBridge(tab, view, requests), "ATOAndroid");
    view.setWebViewClient(new WebViewClient() {
      @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        if (tab.closed || view != tab.view || view == retiringStoryWebView) return;
        // A navigation keeps the WebView but replaces its page. Stop the old page's scan.
        requests.incrementAndGet();
        tab.loginPage = false;
        tab.dashboardAuthenticated = false;
        // System Back/goBack does not necessarily pass through shouldOverrideUrlLoading.
        if (storySession.needsResetOnNavigation(url)) {
          resetStoryWebView(view, url);
          return;
        }
        super.onPageStarted(view, url, favicon);
      }

      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        try {
          WebResourceResponse override = atopackStore.intercept(request.getUrl());
          return override != null ? override : super.shouldInterceptRequest(view, request);
        } catch (RuntimeException error) {
          // 资料包里的文件损坏/被删时退回 APK 资源，不让回调线程把应用带走。
          return super.shouldInterceptRequest(view, request);
        }
      }

      @Override public void onPageFinished(WebView view, String url) {
        if (tab.closed || view != tab.view || view == retiringStoryWebView) return;
        if (storySession.needsResetOnNavigation(url)) {
          resetStoryWebView(view, url);
          return;
        }
        super.onPageFinished(view, url);
        // Navigation history only; story page resources are released by replacing its WebView.
        if (url != null && url.startsWith(ROOT + "index.html")) view.clearHistory();
      }

      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (tab.closed || view != tab.view || view == retiringStoryWebView) return true;
        Uri uri = request.getUrl();
        if (request.isForMainFrame() && storySession.needsResetOnNavigation(uri.toString())) {
          resetStoryWebView(view, uri.toString());
          return true;
        }
        if ("file".equals(uri.getScheme()) && uri.toString().startsWith(ROOT)) return false;
        try {
          startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
          Toast.makeText(MainActivity.this, "没有可以打开这个链接的应用。", Toast.LENGTH_SHORT).show();
        }
        return true;
      }

      // 故事书这类页面会把整本官方数据读进渲染进程；内存不足时 Android 会直接结束
      // 渲染进程。不处理这个回调，系统会连整个应用一起杀掉（用户看到的就是闪退）。
      // 这里销毁已失效的 WebView，回到主控台，至少不会丢应用。
      @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        if (tab.closed || view != tab.view) return true;
        android.app.ActivityManager.MemoryInfo memory = new android.app.ActivityManager.MemoryInfo();
        android.app.ActivityManager manager = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
        if (manager != null) manager.getMemoryInfo(memory);
        android.content.pm.PackageInfo provider = WebView.getCurrentWebViewPackage();
        android.util.Log.w("ATORenderer", "Renderer exited: crashed=" + detail.didCrash()
            + ", priority=" + detail.rendererPriorityAtExit() + ", lowMemory=" + memory.lowMemory
            + ", availableMiB=" + memory.availMem / (1024 * 1024)
            + ", webView=" + (provider == null ? "unknown" : provider.packageName + "/" + provider.versionName));
        requests.incrementAndGet();
        rendererCrashedThisProcess = true;
        tab.closed = true;
        tabs.remove(tab);
        if (view == webView) webView = null;
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        view.destroy();
        Toast.makeText(
            MainActivity.this,
            detail.didCrash()
                ? "页面渲染进程异常退出，已返回主控台，可重新打开页面继续。"
                : "页面渲染进程被系统结束，已返回主控台，可重新打开页面继续。",
            Toast.LENGTH_LONG).show();
        if (rootView != null) {
          rootView.post(() -> {
            if (!isFinishing() && !isDestroyed()) recreate();
          });
        }
        return true;
      }
    });
    view.setWebChromeClient(new WebChromeClient() {
      @Override public void onReceivedTitle(WebView page, String title) {
        if (!tab.closed && page == tab.view && title != null && !title.trim().isEmpty()) {
          tab.title = title;
          updateTabs(false);
        }
      }

      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        filePathCallback = callback;
        pendingCameraUri = null;
        try {
          if (params.isCaptureEnabled()) {
            java.io.File directory = new java.io.File(getCacheDir(), "note-camera");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException("无法创建拍照目录");
            // A URI unique to this capture avoids handing the camera a previous photo.
            for (java.io.File old : directory.listFiles() == null ? new java.io.File[0] : directory.listFiles()) old.delete();
            java.io.File file = java.io.File.createTempFile("capture-", ".jpg", directory);
            pendingCameraUri = new Uri.Builder().scheme("content").authority(getPackageName() + ".note-camera").appendPath(file.getName()).build();
            Intent camera = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, pendingCameraUri);
            camera.setClipData(ClipData.newRawUri("拍摄照片", pendingCameraUri));
            camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            startActivityForResult(camera, FILE_CHOOSER_REQUEST);
          } else {
            Intent picker;
            boolean image = false;
            for (String type : params.getAcceptTypes()) if (type.startsWith("image/")) image = true;
            if (image) {
              boolean album = params.getAcceptTypes().length == 1 && "image/*".equals(params.getAcceptTypes()[0]);
              picker = new Intent(album ? Intent.ACTION_GET_CONTENT : Intent.ACTION_OPEN_DOCUMENT);
              picker.addCategory(Intent.CATEGORY_OPENABLE);
              picker.setType("image/*");
              picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            } else {
              picker = params.createIntent();
            }
            startActivityForResult(picker, FILE_CHOOSER_REQUEST);
          }
        } catch (Exception error) {
          pendingCameraUri = null;
          filePathCallback.onReceiveValue(null);
          filePathCallback = null;
          android.widget.Toast.makeText(MainActivity.this, "无法打开相机或文件选择器，请使用其他选择方式。", android.widget.Toast.LENGTH_LONG).show();
        }
        return true;
      }
    });

    view.setVisibility(View.GONE);
    view.loadUrl(url);
  }

  private void resetStoryWebView(WebView oldView, String destination) {
    PageTab tab = null;
    for (PageTab candidate : tabs) if (candidate.view == oldView) { tab = candidate; break; }
    if (tab == null || oldView == retiringStoryWebView) return;
    final PageTab target = tab;
    retiringStoryWebView = oldView;
    target.requests.incrementAndGet();
    oldView.stopLoading();
    rootView.post(() -> {
      if (target.closed || target.view != oldView || isFinishing() || isDestroyed()) {
        if (retiringStoryWebView == oldView) retiringStoryWebView = null;
        return;
      }
      if (target == activeTab && !storyTtsId.isEmpty()) {
        String id = storyTtsId;
        storyTtsId = "";
        storyTtsText = "";
        storyTtsPaused = false;
        if (storyTts != null) storyTts.stop();
        notifyStoryTtsResult(id, false, "页面已关闭，朗读已停止");
      }
      if (oldView.getParent() instanceof ViewGroup) ((ViewGroup) oldView.getParent()).removeView(oldView);
      oldView.removeJavascriptInterface("ATOAndroid");
      oldView.destroy();
      retiringStoryWebView = null;
      createWebView(target, destination);
      if (target == activeTab) selectTab(target);
    });
  }

  @Override public void onBackPressed() {
    if (webView == retiringStoryWebView && webView != null) return;
    if (webView != null && webView.canGoBack()) {
      android.webkit.WebBackForwardList history = webView.copyBackForwardList();
      int previous = history.getCurrentIndex() - 1;
      String destination = previous >= 0 ? history.getItemAtIndex(previous).getUrl() : null;
      if (currentStorySession.needsResetOnNavigation(destination)) resetStoryWebView(webView, destination);
      else webView.goBack();
    } else if (tabs.size() > 1) closeTab(activeTab);
    else super.onBackPressed();
  }

  @Override protected void onDestroy() {
    for (PageTab tab : tabs) {
      tab.closed = true;
      tab.requests.incrementAndGet();
      tab.view.destroy();
    }
    tabs.clear();
    webView = null;
    mixedMediaWorker.shutdownNow();
    if (secondScreenServer != null) secondScreenServer.stop();
    if (storyTts != null) {
      storyTts.stop();
      storyTts.shutdown();
      storyTts = null;
    }
    super.onDestroy();
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == BACKUPS_EXPORT_REQUEST || requestCode == BACKUPS_IMPORT_REQUEST) {
      String action, account;
      synchronized (backupsOperationLock) { action = backupsOperationAction; account = backupsOperationUser; }
      if (action == null || account == null) return;
      if (resultCode != RESULT_OK || data == null || data.getData() == null) {
        org.json.JSONObject result = errorResult("已取消" + ("export".equals(action) ? "导出" : "导入"));
        try { result.put("cancelled", true); } catch (org.json.JSONException ignored) { }
        finishDailyBackups(result);
        return;
      }
      Uri chosen = data.getData();
      new Thread(() -> {
        try {
          org.json.JSONObject result;
          if ("export".equals(action)) {
            try (OutputStream output = getContentResolver().openOutputStream(chosen, "wt")) {
              if (output == null) throw new java.io.IOException("无法打开所选文件。");
              result = localApi.exportDailyBackups(account, output);
            }
          } else {
            try (InputStream input = getContentResolver().openInputStream(chosen)) {
              if (input == null) throw new java.io.IOException("无法打开所选压缩包。");
              result = localApi.importDailyBackups(account, input);
            }
          }
          finishDailyBackups(result);
        } catch (OutOfMemoryError error) {
          finishDailyBackups(errorResult("备份处理超出当前可用内存，请释放内存后重试。"));
        } catch (StackOverflowError error) {
          finishDailyBackups(errorResult("备份内容的嵌套层级过深，无法读取。"));
        } catch (Exception error) {
          finishDailyBackups(errorResult(error.getMessage() == null ? "每日备份处理失败。" : error.getMessage()));
        }
      }, "daily-backups-" + action).start();
      return;
    }
    if (requestCode == EXPORT_CHOOSER_REQUEST) {
      LocalExportFile file = pendingExportFile;
      if (resultCode != RESULT_OK || data == null || data.getData() == null) {
        pendingExportFile = null;
        notifyExportResult(errorResult("已取消导出"));
        return;
      }
      if (file == null) {
        notifyExportResult(errorResult("没有待保存的导出文件。"));
        return;
      }
      Uri destination = data.getData();
      new Thread(() -> {
        try (OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
          if (output == null) throw new java.io.IOException("无法打开所选文件");
          file.writeTo(output);
        } catch (Exception error) {
          finishFileExport(errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
          return;
        }
        try {
          org.json.JSONObject result = new org.json.JSONObject();
          result.put("ok", true);
          finishFileExport(result);
        } catch (org.json.JSONException ignored) {
          finishFileExport(errorResult("无法确认导出结果"));
        }
      }, "state-export").start();
      return;
    }
    if (requestCode == ATOPACK_CHOOSER_REQUEST) {
      if (resultCode != RESULT_OK || data == null || data.getData() == null) {
        notifyAtopackResult(errorResult("已取消导入"));
        return;
      }
      Uri packageUri = data.getData();
      new Thread(() -> {
        try {
          notifyAtopackResult(atopackStore.importPackage(getContentResolver(), packageUri).toJson());
        } catch (OutOfMemoryError error) {
          // 解析大型清单/故事索引时可能耗尽堆。把错误带回页面，至少让应用本身活下来。
          notifyAtopackMemoryError();
        } catch (Exception error) {
          notifyAtopackResult(errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
        }
      }, "atopack-import").start();
      return;
    }
    if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
    Uri[] selected = resultCode == RESULT_OK && pendingCameraUri != null
        ? new Uri[] { pendingCameraUri } : WebChromeClient.FileChooserParams.parseResult(resultCode, data);
    filePathCallback.onReceiveValue(selected);
    filePathCallback = null;
    pendingCameraUri = null;
  }

  private final class LocalApiBridge {
    private final WebView owner;
    private final AtomicLong requests;

    private final PageTab tab;

    LocalApiBridge(PageTab tab, WebView owner, AtomicLong requests) {
      this.tab = tab;
      this.owner = owner;
      this.requests = requests;
    }

    @android.webkit.JavascriptInterface public boolean openModuleTab(String url) {
      if (tab.closed || tab.view != owner || moduleForUrl(url).isEmpty()) return false;
      runOnUiThread(() -> { if (!tab.closed && tab.view == owner) openModule(url); });
      return true;
    }

    @android.webkit.JavascriptInterface public String rememberedSession() {
      return localApi.rememberedSession();
    }

    @android.webkit.JavascriptInterface public void dashboardAuthState(boolean authenticated) {
      runOnUiThread(() -> {
        if (tab.closed || tab.view != owner) return;
        tab.loginPage = !authenticated;
        tab.dashboardAuthenticated = authenticated;
        if (!authenticated) {
          if (localApi.dailyBackupUser().isEmpty()) return;
          for (PageTab other : tabs) {
            if (other != tab && other.dashboardAuthenticated) {
              closeTab(tab);
              return;
            }
          }
          return;
        }
        if (localApi.dailyBackupUser().isEmpty()) return;
        // A login screen is only the unauthenticated state of the dashboard.
        // Remove stale login-only tabs after another dashboard signs in.
        for (PageTab other : new ArrayList<>(tabs)) {
          if (other != tab && other.loginPage && other.view != retiringStoryWebView) closeTab(other);
        }
      });
    }

    @android.webkit.JavascriptInterface public boolean rendererCrashedThisProcess() {
      return rendererCrashedThisProcess;
    }

    @android.webkit.JavascriptInterface public void cancelMixedMediaMap() {
      if (!tab.closed && tab.view == owner && owner != retiringStoryWebView) requests.incrementAndGet();
    }

    @android.webkit.JavascriptInterface public boolean requestMixedMediaMap(
        String book, String variant, String key, String requestId) {
      if (tab.closed || tab.view != owner || owner == retiringStoryWebView || !MixedMediaMapReader.validContext(book, variant, key) || requestId == null
          || requestId.length() > 128 || mixedMediaWorker.isShutdown()) return false;
      long serial = requests.incrementAndGet();
      WebView target = owner;
      try {
        mixedMediaWorker.execute(() -> {
          if (tab.closed || tab.view != owner || serial != requests.get()) return;
          String result = "";
          AtopackStore.OpenedResource resource = atopackStore.open("story/assets/mixed-media/mapping.js");
          if (resource != null) {
            try (InputStream input = resource.input) {
              result = MixedMediaMapReader.read(input, book, variant, key,
                  () -> tab.closed || tab.view != owner || serial != requests.get());
            } catch (Exception ignored) {
              // Missing or incompatible optional materials leave the source text readable.
            }
          }
          String json = result;
          if (serial != requests.get()) return;
          runOnUiThread(() -> {
            if (tab.closed || tab.view != target || serial != requests.get()) return;
            target.evaluateJavascript("window.ATOAndroidMixedMediaMapResult&&window.ATOAndroidMixedMediaMapResult("
                + org.json.JSONObject.quote(requestId) + "," + org.json.JSONObject.quote(json) + ")", null);
          });
        });
        return true;
      } catch (java.util.concurrent.RejectedExecutionException ignored) { return false; }
    }

    @android.webkit.JavascriptInterface public boolean copyStoryTextToClipboard(String text) {
      if (text == null || text.isEmpty()) return false;
      runOnUiThread(() -> {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("故事段落", text));
      });
      return true;
    }

    @android.webkit.JavascriptInterface public String request(String url, String method, String body) {
      return localApi.handleForJavascript(Uri.parse(url), method, body == null ? "" : body);
    }

    @android.webkit.JavascriptInterface public String resourcePackStatus() {
      return atopackStore.status().toString();
    }

    @android.webkit.JavascriptInterface public boolean storyTtsReady() {
      return storyTtsReady;
    }

    @android.webkit.JavascriptInterface public boolean speakStoryText(String text, String utteranceId, float rate) {
      if (webView != owner || owner == retiringStoryWebView || !storyTtsReady || text == null || text.isEmpty() || utteranceId == null || utteranceId.isEmpty()) return false;
      runOnUiThread(() -> {
        if (webView != owner || owner == retiringStoryWebView) return;
        if (storyTts == null || !storyTtsReady) {
          finishStoryTts(utteranceId, false, "Android 系统语音尚未就绪");
          return;
        }
        storyTtsText = text;
        storyTtsId = utteranceId;
        storyTtsRate = Math.max(0.5f, Math.min(2f, rate));
        storyTtsOffset = 0;
        storyTtsSegmentNumber = 0;
        storyTtsPaused = false;
        speakStoryTtsFromOffset();
      });
      return true;
    }

    @android.webkit.JavascriptInterface public void pauseStoryTts() {
      runOnUiThread(() -> {
        if (webView != owner) return;
        if (storyTts == null || storyTtsId.isEmpty() || storyTtsPaused) return;
        storyTtsPaused = true;
        storyTts.stop();
      });
    }

    @android.webkit.JavascriptInterface public void resumeStoryTts() {
      runOnUiThread(() -> {
        if (webView != owner) return;
        if (storyTts == null || storyTtsId.isEmpty() || !storyTtsPaused) return;
        storyTtsPaused = false;
        speakStoryTtsFromOffset();
      });
    }

    @android.webkit.JavascriptInterface public void stopStoryTts() {
      runOnUiThread(() -> {
        if (webView != owner) return;
        if (storyTts == null || storyTtsId.isEmpty()) return;
        String id = storyTtsId;
        storyTtsPaused = false;
        storyTtsId = "";
        storyTtsText = "";
        storyTts.stop();
        notifyStoryTtsResult(id, false, "朗读已停止");
      });
    }

    @android.webkit.JavascriptInterface public String readBundledJson(String relative) {
      if (relative == null || !relative.toLowerCase(java.util.Locale.ROOT).endsWith(".json")) return "";
      String normalized = relative.replace('\\', '/');
      if (normalized.startsWith("/") || normalized.indexOf('\0') >= 0) return "";
      for (String part : normalized.split("/", -1)) {
        if (part.isEmpty() || ".".equals(part) || "..".equals(part)) return "";
      }
      try (InputStream input = getAssets().open("web/" + normalized);
           ByteArrayOutputStream output = new ByteArrayOutputStream()) {
        byte[] buffer = new byte[64 * 1024];
        int total = 0;
        for (int count; (count = input.read(buffer)) != -1;) {
          total += count;
          if (total > 8 * 1024 * 1024) return "";
          output.write(buffer, 0, count);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
      } catch (Exception ignored) {
        return "";
      }
    }

    @android.webkit.JavascriptInterface public String readExportImageData(String relative) {
      return atopackStore.readExportImageData(relative);
    }

    @android.webkit.JavascriptInterface public void importAtopack() {
      runOnUiThread(() -> {
        if (atopackOwner != null) {
          if (isLiveView(owner)) owner.evaluateJavascript("window.ATOAtopackImportResult&&window.ATOAtopackImportResult({\"ok\":false,\"error\":\"已有导入正在进行\"})", null);
          return;
        }
        atopackOwner = owner;
        try {
          Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.setType("application/octet-stream");
          intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"application/octet-stream", "application/zip", "application/x-zip-compressed"});
          startActivityForResult(intent, ATOPACK_CHOOSER_REQUEST);
        } catch (Exception error) {
          notifyAtopackResult(errorResult("无法打开系统文件选择器。"));
        }
      });
    }

    @android.webkit.JavascriptInterface public void exportStateJson(String filename, String json) {
      try {
        showFileExport(LocalExportFile.json(filename, json), owner);
      } catch (Exception error) {
        notifyExportResult(owner, errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
      }
    }

    @android.webkit.JavascriptInterface public void exportBriefingZip(String filename, String base64) {
      try {
        showFileExport(LocalExportFile.briefingZip(filename, base64), owner);
      } catch (Exception error) {
        notifyExportResult(owner, errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
      }
    }

    @android.webkit.JavascriptInterface public boolean exportDailyBackups() {
      return beginDailyBackups("export", owner);
    }

    @android.webkit.JavascriptInterface public boolean importDailyBackups() {
      return beginDailyBackups("import", owner);
    }
  }

  private boolean beginDailyBackups(String action, WebView owner) {
    if (owner != webView || owner == retiringStoryWebView) return false;
    String account = localApi.dailyBackupUser();
    if (account.isEmpty()) return false;
    synchronized (backupsOperationLock) {
      if (backupsOperationAction != null) return false;
      backupsOperationAction = action;
      backupsOperationUser = account;
      backupsOperationOwner = owner;
    }
    runOnUiThread(() -> {
      try {
        Intent intent = new Intent("export".equals(action) ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        if ("export".equals(action)) {
          java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT);
          intent.putExtra(Intent.EXTRA_TITLE, "ATO-daily-backups-" + format.format(new java.util.Date()) + ".zip");
        } else intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"application/zip", "application/x-zip-compressed", "application/octet-stream"});
        startActivityForResult(intent, "export".equals(action) ? BACKUPS_EXPORT_REQUEST : BACKUPS_IMPORT_REQUEST);
      } catch (Exception error) {
        finishDailyBackups(errorResult(error.getMessage() == null ? "无法打开系统文件选择器。" : error.getMessage()));
      }
    });
    return true;
  }

  private void finishDailyBackups(org.json.JSONObject result) {
    runOnUiThread(() -> {
      WebView owner;
      synchronized (backupsOperationLock) {
        owner = backupsOperationOwner;
        try {
          result.put("action", backupsOperationAction);
          for (String field : new String[] {"imported", "skipped", "total"}) if (!result.has(field)) result.put(field, 0);
        } catch (org.json.JSONException ignored) { }
        backupsOperationOwner = null;
        backupsOperationUser = null;
        backupsOperationAction = null;
      }
      if (isLiveView(owner) && owner != retiringStoryWebView)
        owner.evaluateJavascript("window.ATOAndroidBackupsResult&&window.ATOAndroidBackupsResult(" + result + ")", null);
    });
  }

  private void showFileExport(LocalExportFile file, WebView owner) {
    runOnUiThread(() -> {
      if (pendingExportFile != null) {
        notifyExportResult(owner, errorResult("已有导出正在进行"));
        return;
      }
      pendingExportFile = file;
      exportOwner = owner;
      try {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(file.mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, file.filename);
        startActivityForResult(intent, EXPORT_CHOOSER_REQUEST);
      } catch (Exception error) {
        finishFileExport(errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
      }
    });
  }

  private void finishFileExport(org.json.JSONObject result) {
    runOnUiThread(() -> {
      pendingExportFile = null;
      notifyExportResult(result);
    });
  }

  private void speakStoryTtsFromOffset() {
    if (storyTts == null || storyTtsId.isEmpty()) return;
    storyTts.setSpeechRate(storyTtsRate);
    int start = Math.max(0, Math.min(storyTtsOffset, storyTtsText.length()));
    String remaining = storyTtsText.substring(start);
    if (remaining.isEmpty()) {
      finishStoryTts(storyTtsId, true, "");
      return;
    }
    storyTtsSegmentStart = start;
    storyTtsSegmentId = storyTtsId + "-segment-" + (++storyTtsSegmentNumber);
    Bundle params = new Bundle();
    params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, storyTtsSegmentId);
    if (storyTts.speak(remaining, TextToSpeech.QUEUE_FLUSH, params, storyTtsSegmentId) == TextToSpeech.ERROR) {
      finishStoryTts(storyTtsId, false, "Android 系统语音无法开始朗读");
    }
  }

  private void finishStoryTts(String utteranceId, boolean success, String error) {
    runOnUiThread(() -> {
      if (!utteranceId.equals(storyTtsId) || storyTtsPaused) return;
      storyTtsId = "";
      storyTtsText = "";
      notifyStoryTtsResult(utteranceId, success, error);
    });
  }

  private void notifyStoryTtsResult(String utteranceId, boolean success, String error) {
    if (webView == null) return;
    webView.evaluateJavascript("window.ATOAndroidTtsResult&&window.ATOAndroidTtsResult(" +
      org.json.JSONObject.quote(utteranceId) + "," + success + "," + org.json.JSONObject.quote(error) + ")", null);
  }

  private org.json.JSONObject errorResult(String message) {
    org.json.JSONObject result = new org.json.JSONObject();
    try {
      result.put("ok", false);
      result.put("error", message);
    } catch (org.json.JSONException ignored) {
      // Fixed keys with string values cannot fail in practice.
    }
    return result;
  }

  private boolean isLiveView(WebView view) {
    if (view == null) return false;
    for (PageTab tab : tabs) if (!tab.closed && tab.view == view) return true;
    return false;
  }

  private void notifyAtopackResult(org.json.JSONObject result) {
    runOnUiThread(() -> {
      WebView owner = atopackOwner;
      atopackOwner = null;
      if (isLiveView(owner)) owner.evaluateJavascript(
        "window.ATOAtopackImportResult && window.ATOAtopackImportResult(" + result.toString() + ")", null);
    });
  }

  private void notifyAtopackMemoryError() {
    runOnUiThread(() -> {
      WebView owner = atopackOwner;
      atopackOwner = null;
      if (!isLiveView(owner)) return;
      // 用字面量而不是再构造 JSONObject，避免堆已经紧张时二次分配。
      owner.evaluateJavascript(
        "window.ATOAtopackImportResult && window.ATOAtopackImportResult({\"ok\":false,"
          + "\"error\":\"导入时可用内存不足。请重启 ATO 并关闭其他应用后重试；"
          + "若仍失败，请使用不含故事数据的较小资料包。\"})", null);
    });
  }

  private void notifyExportResult(org.json.JSONObject result) {
    notifyExportResult(exportOwner, result);
  }

  private void notifyExportResult(WebView owner, org.json.JSONObject result) {
    runOnUiThread(() -> {
      if (!isLiveView(owner)) return;
      owner.evaluateJavascript(
        "window.ATOAndroidExportResult && window.ATOAndroidExportResult(" + result.toString() + ")", null);
    });
  }
}
