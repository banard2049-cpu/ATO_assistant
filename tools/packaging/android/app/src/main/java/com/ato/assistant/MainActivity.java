package com.ato.assistant;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
  private static final String ROOT = "file:///android_asset/web/";
  private static final int FILE_CHOOSER_REQUEST = 1001;
  private static final int ATOPACK_CHOOSER_REQUEST = 1002;
  private WebView webView;
  private ValueCallback<Uri[]> filePathCallback;
  private LocalCampaignApi localApi;
  private AtopackStore atopackStore;
  private LocalSecondScreenServer secondScreenServer;

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
        startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
        return true;
      }
    });

    webView.loadUrl(ROOT + "index.html");
  }

  @Override public void onBackPressed() {
    if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
  }

  @Override protected void onDestroy() {
    if (secondScreenServer != null) secondScreenServer.stop();
    if (webView != null) webView.destroy();
    super.onDestroy();
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
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
    filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
    filePathCallback = null;
  }

  private final class LocalApiBridge {
    @android.webkit.JavascriptInterface public String request(String url, String method, String body) {
      return localApi.handleForJavascript(Uri.parse(url), method, body == null ? "" : body);
    }

    @android.webkit.JavascriptInterface public String resourcePackStatus() {
      return atopackStore.status().toString();
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
}
