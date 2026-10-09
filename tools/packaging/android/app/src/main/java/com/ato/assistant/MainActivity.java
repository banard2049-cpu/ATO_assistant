package com.ato.assistant;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class MainActivity extends Activity {
  private static final String ROOT = "file:///android_asset/web/";
  private static final int FILE_CHOOSER_REQUEST = 1001;
  private static final int ATOPACK_CHOOSER_REQUEST = 1002;
  private static final int EXPORT_CHOOSER_REQUEST = 1003;
  private WebView webView;
  private ValueCallback<Uri[]> filePathCallback;
  private Uri pendingCameraUri;
  private LocalCampaignApi localApi;
  private AtopackStore atopackStore;
  private LocalSecondScreenServer secondScreenServer;
  private String pendingExportJson;
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
    secondScreenServer = new LocalSecondScreenServer(this, atopackStore, localApi);
    localApi.attachSecondScreenServer(secondScreenServer);
    webView = new WebView(this);
    setContentView(webView);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setAllowFileAccessFromFileURLs(true);
    settings.setAllowUniversalAccessFromFileURLs(true);
    settings.setMediaPlaybackRequiresUserGesture(false);

    webView.addJavascriptInterface(new LocalApiBridge(), "ATOAndroid");
    webView.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse override = atopackStore.intercept(request.getUrl());
        return override != null ? override : super.shouldInterceptRequest(view, request);
      }

      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if ("file".equals(uri.getScheme()) && uri.toString().startsWith(ROOT)) return false;
        startActivity(new Intent(Intent.ACTION_VIEW, uri));
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

    webView.loadUrl(ROOT + "index.html");
  }

  @Override public void onBackPressed() {
    if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
  }

  @Override protected void onDestroy() {
    if (secondScreenServer != null) secondScreenServer.stop();
    if (storyTts != null) {
      storyTts.stop();
      storyTts.shutdown();
      storyTts = null;
    }
    if (webView != null) webView.destroy();
    super.onDestroy();
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == EXPORT_CHOOSER_REQUEST) {
      String json = pendingExportJson;
      pendingExportJson = null;
      if (resultCode != RESULT_OK || data == null || data.getData() == null) {
        notifyExportResult(errorResult("已取消导出"));
        return;
      }
      Uri destination = data.getData();
      new Thread(() -> {
        try (OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
          if (output == null) throw new java.io.IOException("无法打开所选文件");
          output.write(json.getBytes(StandardCharsets.UTF_8));
          output.flush();
        } catch (Exception error) {
          notifyExportResult(errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
          return;
        }
        try {
          org.json.JSONObject result = new org.json.JSONObject();
          result.put("ok", true);
          notifyExportResult(result);
        } catch (org.json.JSONException ignored) {
          notifyExportResult(errorResult("无法确认导出结果"));
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
      if (!storyTtsReady || text == null || text.isEmpty() || utteranceId == null || utteranceId.isEmpty()) return false;
      runOnUiThread(() -> {
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
        if (storyTts == null || storyTtsId.isEmpty() || storyTtsPaused) return;
        storyTtsPaused = true;
        storyTts.stop();
      });
    }

    @android.webkit.JavascriptInterface public void resumeStoryTts() {
      runOnUiThread(() -> {
        if (storyTts == null || storyTtsId.isEmpty() || !storyTtsPaused) return;
        storyTtsPaused = false;
        speakStoryTtsFromOffset();
      });
    }

    @android.webkit.JavascriptInterface public void stopStoryTts() {
      runOnUiThread(() -> {
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
      runOnUiThread(() -> {
        if (pendingExportJson != null) {
          notifyExportResult(errorResult("已有导出正在进行"));
          return;
        }
        pendingExportJson = json;
        try {
          Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          intent.setType("application/json");
          intent.putExtra(Intent.EXTRA_TITLE, filename);
          startActivityForResult(intent, EXPORT_CHOOSER_REQUEST);
        } catch (Exception error) {
          pendingExportJson = null;
          notifyExportResult(errorResult(error.getMessage() == null ? error.toString() : error.getMessage()));
        }
      });
    }
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
    runOnUiThread(() -> webView.evaluateJavascript(
      "window.ATOAtopackImportResult && window.ATOAtopackImportResult(" + result.toString() + ")", null));
  }

  private void notifyExportResult(org.json.JSONObject result) {
    runOnUiThread(() -> webView.evaluateJavascript(
      "window.ATOAndroidExportResult && window.ATOAndroidExportResult(" + result.toString() + ")", null));
  }
}
