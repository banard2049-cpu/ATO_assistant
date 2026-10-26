package com.ato.assistant;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.ViewGroup;
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
  // 为旧页面保留崩溃标记；新版故事页使用逐条读取，无需关闭插图。
  private static volatile boolean rendererCrashedThisProcess;
  private final ExecutorService mixedMediaWorker = Executors.newSingleThreadExecutor();
  private AtomicLong mixedMediaRequest = new AtomicLong();
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
    rootView = new FrameLayout(this);
    setContentView(rootView);
    createWebView(ROOT + "index.html");

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
        if (webView != null) webView.evaluateJavascript("window.ATOAndroidTtsReady&&window.ATOAndroidTtsReady()", null);
      });
    });
  }

  private void createWebView(String url) {
    mixedMediaRequest = new AtomicLong();
    webView = new WebView(this);
    final StoryWebViewSession storySession = new StoryWebViewSession(ROOT);
    currentStorySession = storySession;
    // Only debug APKs expose their WebView to adb/Chrome inspection.
    if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
    rootView.addView(webView, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setAllowFileAccessFromFileURLs(true);
    settings.setAllowUniversalAccessFromFileURLs(true);
    settings.setMediaPlaybackRequiresUserGesture(false);

    webView.addJavascriptInterface(new LocalApiBridge(webView), "ATOAndroid");
    webView.setWebViewClient(new WebViewClient() {
      @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        if (view != webView || view == retiringStoryWebView) return;
        // A navigation keeps the WebView but replaces its page. Stop the old page's scan.
        mixedMediaRequest.incrementAndGet();
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
        if (view != webView || view == retiringStoryWebView) return;
        if (storySession.needsResetOnNavigation(url)) {
          resetStoryWebView(view, url);
          return;
        }
        super.onPageFinished(view, url);
        // Navigation history only; story page resources are released by replacing its WebView.
        if (url != null && url.startsWith(ROOT + "index.html")) view.clearHistory();
      }

      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (view != webView || view == retiringStoryWebView) return true;
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
        if (view != webView) return true;
        android.app.ActivityManager.MemoryInfo memory = new android.app.ActivityManager.MemoryInfo();
        android.app.ActivityManager manager = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
        if (manager != null) manager.getMemoryInfo(memory);
        android.content.pm.PackageInfo provider = WebView.getCurrentWebViewPackage();
        android.util.Log.w("ATORenderer", "Renderer exited: crashed=" + detail.didCrash()
            + ", priority=" + detail.rendererPriorityAtExit() + ", lowMemory=" + memory.lowMemory
            + ", availableMiB=" + memory.availMem / (1024 * 1024)
            + ", webView=" + (provider == null ? "unknown" : provider.packageName + "/" + provider.versionName));
        mixedMediaRequest.incrementAndGet();
        rendererCrashedThisProcess = true;
        webView = null;
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
    webView.setWebChromeClient(new WebChromeClient() {
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

    webView.loadUrl(url);
  }

  private void resetStoryWebView(WebView oldView, String destination) {
    if (oldView != webView || oldView == retiringStoryWebView) return;
    retiringStoryWebView = oldView;
    mixedMediaRequest.incrementAndGet();
    oldView.stopLoading();
    // Destroy outside WebView's navigation callback; keep the native API, imported
    // resources and second-screen server alive while replacing only the page host.
    rootView.post(() -> {
      if (webView != oldView || isFinishing() || isDestroyed()) return;
      webView = null;
      storyTtsPaused = false;
      storyTtsId = "";
      storyTtsText = "";
      if (storyTts != null) storyTts.stop();
      if (oldView.getParent() instanceof ViewGroup) ((ViewGroup) oldView.getParent()).removeView(oldView);
      oldView.removeJavascriptInterface("ATOAndroid");
      oldView.destroy();
      retiringStoryWebView = null;
      createWebView(destination);
      android.util.Log.i("ATOStoryWebView", "Released story WebView and created dashboard WebView");
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
    } else super.onBackPressed();
  }

  @Override protected void onDestroy() {
    mixedMediaRequest.incrementAndGet();
    mixedMediaWorker.shutdownNow();
    if (secondScreenServer != null) secondScreenServer.stop();
    if (storyTts != null) {
      storyTts.stop();
      storyTts.shutdown();
      storyTts = null;
    }
    if (webView != null) {
      webView.destroy();
      // 延迟的 TTS / 导入 / 导出回调仍可能排队到 UI 线程；置空让它们安静退出。
      webView = null;
    }
    super.onDestroy();
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
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

    LocalApiBridge(WebView owner) {
      this.owner = owner;
      this.requests = mixedMediaRequest;
    }

    @android.webkit.JavascriptInterface public boolean rendererCrashedThisProcess() {
      return rendererCrashedThisProcess;
    }

    @android.webkit.JavascriptInterface public void cancelMixedMediaMap() {
      if (webView == owner && owner != retiringStoryWebView) requests.incrementAndGet();
    }

    @android.webkit.JavascriptInterface public boolean requestMixedMediaMap(
        String book, String variant, String key, String requestId) {
      if (webView != owner || owner == retiringStoryWebView || !MixedMediaMapReader.validContext(book, variant, key) || requestId == null
          || requestId.length() > 128 || mixedMediaWorker.isShutdown()) return false;
      long serial = requests.incrementAndGet();
      WebView target = owner;
      try {
        mixedMediaWorker.execute(() -> {
          if (webView != owner || serial != requests.get()) return;
          String result = "";
          AtopackStore.OpenedResource resource = atopackStore.open("story/assets/mixed-media/mapping.js");
          if (resource != null) {
            try (InputStream input = resource.input) {
              result = MixedMediaMapReader.read(input, book, variant, key,
                  () -> webView != owner || serial != requests.get());
            } catch (Exception ignored) {
              // Missing or incompatible optional materials leave the source text readable.
            }
          }
          String json = result;
          if (serial != requests.get()) return;
          runOnUiThread(() -> {
            if (webView == null || webView != target || serial != requests.get()) return;
            webView.evaluateJavascript("window.ATOAndroidMixedMediaMapResult&&window.ATOAndroidMixedMediaMapResult("
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
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"application/octet-stream", "application/zip", "application/x-zip-compressed"});
        startActivityForResult(intent, ATOPACK_CHOOSER_REQUEST);
      });
    }

    @android.webkit.JavascriptInterface public void exportStateJson(String filename, String json) {
      try {
        showFileExport(LocalExportFile.json(filename, json));
      } catch (Exception error) {
        notifyExportResult(errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
      }
    }

    @android.webkit.JavascriptInterface public void exportBriefingZip(String filename, String base64) {
      try {
        showFileExport(LocalExportFile.briefingZip(filename, base64));
      } catch (Exception error) {
        notifyExportResult(errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
      }
    }
  }

  private void showFileExport(LocalExportFile file) {
    runOnUiThread(() -> {
      if (pendingExportFile != null) {
        notifyExportResult(errorResult("已有导出正在进行"));
        return;
      }
      pendingExportFile = file;
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

  private void notifyAtopackResult(org.json.JSONObject result) {
    runOnUiThread(() -> {
      if (webView == null) return;
      webView.evaluateJavascript(
        "window.ATOAtopackImportResult && window.ATOAtopackImportResult(" + result.toString() + ")", null);
    });
  }

  private void notifyAtopackMemoryError() {
    runOnUiThread(() -> {
      if (webView == null) return;
      // 用字面量而不是再构造 JSONObject，避免堆已经紧张时二次分配。
      webView.evaluateJavascript(
        "window.ATOAtopackImportResult && window.ATOAtopackImportResult({\"ok\":false,"
          + "\"error\":\"导入时可用内存不足。请重启 ATO 并关闭其他应用后重试；"
          + "若仍失败，请使用不含故事数据的较小资料包。\"})", null);
    });
  }

  private void notifyExportResult(org.json.JSONObject result) {
    runOnUiThread(() -> {
      if (webView == null) return;
      webView.evaluateJavascript(
        "window.ATOAndroidExportResult && window.ATOAndroidExportResult(" + result.toString() + ")", null);
    });
  }
}
