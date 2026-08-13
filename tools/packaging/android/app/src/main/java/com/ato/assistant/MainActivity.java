package com.ato.assistant;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
  private static final String ROOT = "file:///android_asset/web/";
  private static final int FILE_CHOOSER_REQUEST = 1001;
  private WebView webView;
  private ValueCallback<Uri[]> filePathCallback;
  private LocalCampaignApi localApi;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    localApi = new LocalCampaignApi(this);
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

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
    filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
    filePathCallback = null;
  }

  private final class LocalApiBridge {
    @android.webkit.JavascriptInterface public String request(String url, String method, String body) {
      return localApi.handleForJavascript(Uri.parse(url), method, body == null ? "" : body);
    }
  }
}
