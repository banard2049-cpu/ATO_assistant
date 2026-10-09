package com.ato.assistant;

import android.content.Context;
import android.net.Uri;
import org.json.JSONObject;

public final class RecordAttachmentHarness {
  private static final String URL = "http://local/api/campaign-state.php";
  private static final String PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1sAAAAASUVORK5CYII=";
  private static JSONObject call(LocalCampaignApi api, String query, String method, String body, int expected) throws Exception {
    JSONObject result = new JSONObject(api.handleForJavascript(Uri.parse(URL + query), method, body));
    if (result.getInt("status") != expected) throw new AssertionError(result.toString());
    return new JSONObject(result.getString("body"));
  }
  public static void main(String[] args) throws Exception {
    LocalCampaignApi api = new LocalCampaignApi(new Context());
    call(api, "?action=login", "POST", "{\"username\":\"alpha\"}", 200);
    JSONObject upload = new JSONObject().put("dataUrl", "data:image/png;base64," + PNG).put("expectedAccountId", "alpha");
    JSONObject attachment = call(api, "?action=record-attachment", "POST", upload.toString(), 200).getJSONObject("attachment");
    String id = attachment.getString("blobId");
    if (attachment.getInt("width") != 1 || attachment.getInt("height") != 1) throw new AssertionError("dimensions");
    JSONObject read = call(api, "?action=record-attachment&id=" + id + "&expectedAccountId=alpha", "GET", "", 200);
    if (!read.getString("dataUrl").equals(upload.getString("dataUrl"))) throw new AssertionError("image round trip");
    api = new LocalCampaignApi(new Context());
    call(api, "?action=login", "POST", "{\"username\":\"alpha\"}", 200);
    call(api, "?action=record-attachment&id=" + id + "&expectedAccountId=alpha", "GET", "", 200);
    call(api, "?action=login", "POST", "{\"username\":\"bravo\"}", 200);
    call(api, "?action=record-attachment", "POST", upload.toString(), 409);
    call(api, "?action=record-attachment&id=" + id + "&expectedAccountId=bravo", "GET", "", 404);
    upload.put("expectedAccountId", "bravo").put("dataUrl", "data:image/png;base64,bm90LWltYWdl");
    call(api, "?action=record-attachment", "POST", upload.toString(), 400);
    call(api, "?action=record-attachment&id=../alpha&expectedAccountId=bravo", "GET", "", 400);
    System.out.println("Android attachment checks passed: persistence, account isolation, invalid images.");
  }
}
