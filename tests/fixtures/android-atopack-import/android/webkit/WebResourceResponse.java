package android.webkit;

import java.io.InputStream;
import java.util.Map;

public class WebResourceResponse {
  public WebResourceResponse(String mime, String encoding, InputStream input) {}

  public WebResourceResponse(String mime, String encoding, int statusCode, String reasonPhrase,
                             Map<String, String> responseHeaders, InputStream input) {}
}
