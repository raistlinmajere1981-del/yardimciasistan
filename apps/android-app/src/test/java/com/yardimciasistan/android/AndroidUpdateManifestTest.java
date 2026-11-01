package com.yardimciasistan.android;

import static org.junit.Assert.*;
import com.yardimciasistan.update.UpdateManifest;
import org.json.JSONObject;
import org.junit.Test;

public class AndroidUpdateManifestTest {
  private static final String ORIGIN="https://yardimciasistan.alwaysdata.net";
  private static final String COMPANION="com.yardimciasistan.android";
  private static final String DEALER="com.yardimciasistan.dealer";
  private static final String HASH="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  private JSONObject manifest(String app) throws Exception {
    boolean dealer=DEALER.equals(app);
    String file=(dealer?"YardimciAsistan-Bayi-Android-":"YardimciAsistan-Android-")+"2.1.1.apk";
    return new JSONObject().put("format","yardimci-asistan-update").put("version",1)
        .put("channel","stable").put("platform","android").put("applicationId",app)
        .put("versionName","2.1.1").put("appVersion","2.1.1").put("versionCode",17)
        .put("publishedAt","2026-11-01T00:00:00.000Z").put("notes",new org.json.JSONArray().put("Güncelleme"))
        .put("artifact",new JSONObject().put("file",file).put("size",20000000)
            .put("sha256",HASH).put("url","../../../downloads/"+file));
  }
  private String feed(String channel){return ORIGIN+"/updates/stable/"+channel+"/release.json";}
  private void rejected(JSONObject candidate,String path,String app){
    try{UpdateManifest.parse(candidate.toString(),path,app);fail("Malformed feed accepted");}
    catch(AssertionError expected){throw expected;}catch(Exception expected){}
  }
  @Test public void stableCompanionAndDealerOwnDistinctPackages() throws Exception {
    UpdateManifest a=UpdateManifest.parse(manifest(COMPANION).toString(),feed("android-companion"),COMPANION);
    UpdateManifest b=UpdateManifest.parse(manifest(DEALER).toString(),feed("android-dealer"),DEALER);
    assertEquals(COMPANION,a.applicationId);
    assertEquals(DEALER,b.applicationId);
    assertEquals(17,a.versionCode);
    assertTrue(a.newerThan(16));
    assertFalse(a.newerThan(17));
    assertEquals(ORIGIN+"/downloads/"+a.fileName,a.apkUrl);
    assertEquals(ORIGIN+"/downloads/"+b.fileName,b.apkUrl);
    assertEquals(HASH,a.sha256);
    rejected(manifest(COMPANION),feed("android-dealer"),COMPANION);
    rejected(manifest(COMPANION),feed("android-companion"),DEALER);
  }
  @Test public void redirectsAndUntrustedDownloadOriginsFailClosed() throws Exception {
    JSONObject valid=manifest(COMPANION);
    for(String url:new String[]{
        "http://yardimciasistan.alwaysdata.net/downloads/"+valid.getJSONObject("artifact").getString("file"),
        "https://evil.example/download.apk",
        "//evil.example/download.apk",
        "../../../admin/config.json",
        "../../../../other.apk",
        "../../../downloads/evil.apk",
        "../../../downloads/../secret.apk",
        "../../../downloads/YardimciAsistan-Android-2.1.1.apk?token=1"
    }){
      JSONObject mutated=new JSONObject(valid.toString());
      mutated.getJSONObject("artifact").put("url",url);
      rejected(mutated,feed("android-companion"),COMPANION);
    }
    rejected(valid,"http://yardimciasistan.alwaysdata.net/updates/stable/android-companion/release.json",COMPANION);
    rejected(valid,"https://evil.example/updates/stable/android-companion/release.json",COMPANION);
    rejected(valid,"https://yardimciasistan.alwaysdata.net:8443/updates/stable/android-companion/release.json",COMPANION);
  }
  @Test public void packageVersionAndDigestCannotBeForged() throws Exception {
    JSONObject valid=manifest(COMPANION);
    for(String field:new String[]{"applicationId","versionName","versionCode","channel","format"}){
      JSONObject mutated=new JSONObject(valid.toString());
      mutated.put(field,field.equals("versionCode")?0:"untrusted");
      rejected(mutated,feed("android-companion"),COMPANION);
    }
    for(String field:new String[]{"size","sha256","file"}){
      JSONObject mutated=new JSONObject(valid.toString());
      mutated.getJSONObject("artifact").put(field,field.equals("size")?0:"untrusted");
      rejected(mutated,feed("android-companion"),COMPANION);
    }
  }
}
