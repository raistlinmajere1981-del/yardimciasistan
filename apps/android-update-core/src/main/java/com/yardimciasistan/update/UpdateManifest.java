package com.yardimciasistan.update;
import java.net.URI;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Strict network-independent contract for public Android stable update feeds. */
public final class UpdateManifest {
  public final String applicationId, versionName, apkUrl, fileName, sha256, notes;
  public final long versionCode, size;
  private UpdateManifest(String app, String version, String url, String file, String hash, String notes, long code, long size) {
    applicationId=app; versionName=version; apkUrl=url; fileName=file; sha256=hash;
    this.notes=notes; versionCode=code; this.size=size;
  }
  public boolean newerThan(long installedCode) { return versionCode > installedCode; }
  public static UpdateManifest parse(String json,String feedUrl,String expectedAppId) throws Exception {
    String channel,prefix;
    if("com.yardimciasistan.android".equals(expectedAppId)) {
      channel="android-companion"; prefix="YardimciAsistan-Android-";
    } else if("com.yardimciasistan.dealer".equals(expectedAppId)) {
      channel="android-dealer"; prefix="YardimciAsistan-Bayi-Android-";
    } else throw new IllegalArgumentException("Unknown update application");
    URI feed=new URI(feedUrl);
    if(!"https".equals(feed.getScheme())||!"yardimciasistan.alwaysdata.net".equalsIgnoreCase(feed.getHost())||feed.getPort()!=-1||feed.getRawUserInfo()!=null
      ||feed.getRawQuery()!=null||feed.getRawFragment()!=null
      ||!feed.getRawPath().equals("/updates/stable/"+channel+"/release.json"))
      throw new IllegalArgumentException("Untrusted update feed");
    JSONObject root=new JSONObject(json);
    if(!"yardimci-asistan-update".equals(root.getString("format"))||root.getInt("version")!=1
       ||!"stable".equals(root.getString("channel"))||!"android".equals(root.getString("platform"))
       ||!expectedAppId.equals(root.getString("applicationId")))
       throw new IllegalArgumentException("Wrong update package/channel");
    String version=root.getString("versionName");
    if(!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+")||!version.equals(root.getString("appVersion")))
      throw new IllegalArgumentException("Wrong update version");
    Object rawCode=root.get("versionCode");
    if(!(rawCode instanceof Number)||!rawCode.toString().matches("[1-9][0-9]*"))
      throw new IllegalArgumentException("Wrong update code");
    long code=root.getLong("versionCode");
    if(code<1||code>Integer.MAX_VALUE)throw new IllegalArgumentException("Wrong update code");
    String publishedAt=root.getString("publishedAt");
    if(publishedAt.length()<10||publishedAt.length()>64)throw new IllegalArgumentException("Wrong publication date");
    JSONObject artifact=root.getJSONObject("artifact");
    String file=artifact.getString("file");
    if(!file.equals(prefix+version+".apk"))throw new IllegalArgumentException("Wrong APK filename");
    String hash=artifact.getString("sha256").toLowerCase(Locale.ROOT);
    if(!hash.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("Wrong APK hash");
    Object rawSize=artifact.get("size");
    if(!(rawSize instanceof Number)||!rawSize.toString().matches("[1-9][0-9]*"))
      throw new IllegalArgumentException("Wrong APK size");
    long size=artifact.getLong("size");
    if(size<1||size>250L*1024*1024)throw new IllegalArgumentException("Wrong APK size");
    URI apk=feed.resolve(artifact.getString("url")).normalize();
    if(!"https".equals(apk.getScheme())||!feed.getHost().equalsIgnoreCase(apk.getHost())
       ||feed.getPort()!=apk.getPort()||apk.getRawUserInfo()!=null||apk.getRawQuery()!=null
       ||apk.getRawFragment()!=null||!("/downloads/"+file).equals(apk.getRawPath()))
       throw new IllegalArgumentException("APK outside trusted downloads");
    JSONArray rawNotes=root.optJSONArray("notes");
    StringBuilder notes=new StringBuilder();
    if(rawNotes!=null){
      if(rawNotes.length()>20)throw new IllegalArgumentException("Too many update notes");
      for(int i=0;i<rawNotes.length();i++){
        String value=rawNotes.getString(i);
        if(value.length()>300)throw new IllegalArgumentException("Update note too long");
        if(notes.length()>0)notes.append("\n");
        notes.append(value);
      }
    }
    return new UpdateManifest(expectedAppId,version,apk.toASCIIString(),file,hash,notes.toString(),code,size);
  }
}
