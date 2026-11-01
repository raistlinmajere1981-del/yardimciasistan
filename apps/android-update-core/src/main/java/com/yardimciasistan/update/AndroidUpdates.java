package com.yardimciasistan.update;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicReference;

/** A single shared updater, installed separately into Companion and Dealer APKs. */
public final class AndroidUpdates {
  private static final String BASE="https://yardimciasistan.alwaysdata.net";
  private static final String APK_TYPE="application/vnd.android.package-archive";
  private AndroidUpdates(){}

  /** Only a subsequently launched APK with the expected version can confirm installation. */
  public static void confirmInstalledOnLaunch(Activity activity){
    SharedPreferences state=activity.getSharedPreferences("android_updates_v1",Activity.MODE_PRIVATE);
    int pending=state.getInt("pending_version",0);
    if(pending>0 && installedVersion(activity)>=pending)
      state.edit().remove("pending_version").putInt("installed_success_version",pending).apply();
  }

  public static View settingsView(Activity activity,String channel,String fileProviderSuffix) {
    String packageId=activity.getPackageName();
    String feed=BASE+"/updates/stable/"+channel+"/release.json";
    LinearLayout panel=new LinearLayout(activity);
    panel.setOrientation(LinearLayout.VERTICAL);
    int pad=(int)(12*activity.getResources().getDisplayMetrics().density);
    panel.setPadding(pad,pad,pad,pad);
    TextView title=new TextView(activity);
    title.setText("Güncellemeler");
    title.setTextSize(18);
    panel.addView(title);
    long installed=installedVersion(activity);
    TextView status=new TextView(activity);
    status.setText("Kurulu sürüm: "+installedName(activity)+" ("+installed+")");
    panel.addView(status);
    SharedPreferences progress=activity.getSharedPreferences("android_updates_v1",Activity.MODE_PRIVATE);
    int confirmed=progress.getInt("installed_success_version",0);
    if(confirmed>0 && installed>=confirmed){
      status.setText("Yeni sürüm kuruldu: "+installedName(activity)+" ("+installed+")");
      progress.edit().remove("installed_success_version").apply();
    }
    AtomicReference<UpdateManifest> offered=new AtomicReference<>();
    Button check=new Button(activity);
    check.setText("Güncellemeyi denetle");
    panel.addView(check);
    Button install=new Button(activity);
    install.setText("İndir ve yükle");
    install.setVisibility(View.GONE);
    panel.addView(install);
    check.setOnClickListener(v->{
      check.setEnabled(false);
      install.setVisibility(View.GONE);
      offered.set(null);
      status.setText("Sürüm denetleniyor…");
      new Thread(()->{
        try {
          byte[] body=readHttps(feed,16384);
          UpdateManifest latest=UpdateManifest.parse(new String(body,java.nio.charset.StandardCharsets.UTF_8),feed,packageId);
          activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed())return;
            check.setEnabled(true);
            if(latest.newerThan(installedVersion(activity))){
              offered.set(latest);
              status.setText("Yeni sürüm: "+latest.versionName+" ("+latest.versionCode+")"
                  +(latest.notes.isEmpty()?"":"\n"+latest.notes));
              install.setVisibility(View.VISIBLE);
            }else status.setText("Güncel sürüm: "+installedName(activity));
          });
        } catch(Exception error){
          activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed())return;
            check.setEnabled(true);
            status.setText("Güncelleme kontrolü başarısız. İnternet veya yayın daha sonra yeniden denenebilir.");
          });
        }
      },"ya-update-check").start();
    });
    install.setOnClickListener(v->{
      UpdateManifest update=offered.get();
      if(update==null||!update.newerThan(installedVersion(activity)))return;
      install.setEnabled(false);
      check.setEnabled(false);
      status.setText("İmzalı APK indiriliyor ve doğrulanıyor…");
      new Thread(()->{
        try{
          File apk=downloadAndVerify(activity,update);
          activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed())return;
            check.setEnabled(true);install.setEnabled(true);
            if(!update.newerThan(installedVersion(activity))){
              status.setText("Kurulu sürüm güncel.");return;
            }
            if(!activity.getPackageManager().canRequestPackageInstalls()){
              status.setText("Android kurulum izni gerekiyor. İzin verip İndir ve yükle seçeneğini yeniden açın.");
              Intent permission=new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                  Uri.parse("package:"+packageId));
              activity.startActivity(permission);
              return;
            }
            try{
              Uri uri=FileProvider.getUriForFile(activity,packageId+fileProviderSuffix,apk);
              activity.startActivity(ApkInstallIntent.forVerifiedApk(activity.getPackageManager(),uri));
              progress.edit().putInt("pending_version",(int)update.versionCode).apply();
              status.setText("Android kurulum onayı bekleniyor; yükleme ancak yeni sürüm açılınca doğrulanacak.");
            }catch(ApkInstallIntent.SystemInstallerUnavailableException error){
              status.setText("Sistem paket yükleyicisi bulunamadı. Kurulum başlatılmadı.");
            }catch(Exception error){status.setText("Android kurulum ekranı açılamadı. Kurulum başlatılmadı.");}
          });
        }catch(Exception error){
          activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed())return;
            install.setEnabled(true);check.setEnabled(true);
            status.setText("İndirme veya APK doğrulaması başarısız. Kurulum başlatılmadı.");
          });
        }
      },"ya-update-download").start();
    });
    return panel;
  }

  private static File downloadAndVerify(Activity activity,UpdateManifest update) throws Exception {
    File dir=new File(activity.getCacheDir(),"updates");
    if(!dir.isDirectory()&&!dir.mkdirs())throw new IllegalStateException("Update cache unavailable");
    File partial=new File(dir,"incoming.apk.part"), ready=new File(dir,"verified.apk");
    if(partial.exists()&&!partial.delete())throw new IllegalStateException("Stale partial APK");
    MessageDigest digest=MessageDigest.getInstance("SHA-256");
    HttpURLConnection connection=openHttps(update.apkUrl);
    try{
      String mime=connection.getContentType();
      if(mime==null||(!mime.startsWith(APK_TYPE)&&!mime.startsWith("application/octet-stream")))
        throw new IllegalStateException("Unexpected APK type");
      long length=connection.getContentLengthLong();
      if(length>0&&length!=update.size)throw new IllegalStateException("Unexpected download size");
      long total=0;
      try(InputStream input=connection.getInputStream();FileOutputStream output=new FileOutputStream(partial)){
        byte[] chunk=new byte[16384];int count;
        while((count=input.read(chunk))!=-1){
          total+=count;
          if(total>update.size)throw new IllegalStateException("APK too large");
          digest.update(chunk,0,count);output.write(chunk,0,count);
        }
        output.getFD().sync();
      }
      if(total!=update.size||!hex(digest.digest()).equals(update.sha256))
        throw new IllegalStateException("APK hash mismatch");
      verifyApk(activity,partial,update);
      if(ready.exists()&&!ready.delete())throw new IllegalStateException("Old APK busy");
      if(!partial.renameTo(ready))throw new IllegalStateException("APK move failed");
      return ready;
    }finally{
      connection.disconnect();
      if(partial.exists())partial.delete();
    }
  }

  private static void verifyApk(Activity activity,File file,UpdateManifest update) throws Exception {
    PackageManager manager=activity.getPackageManager();
    int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;
    PackageInfo installed=manager.getPackageInfo(activity.getPackageName(),flags);
    PackageInfo archive=manager.getPackageArchiveInfo(file.getAbsolutePath(),flags);
    if(archive==null||!update.applicationId.equals(archive.packageName)
       ||longCode(archive)!=update.versionCode
       ||!update.versionName.equals(archive.versionName)
       ||longCode(archive)<=longCode(installed))
      throw new IllegalStateException("APK identity/version mismatch");
    Signature[] oldSigners=signatures(installed), newSigners=signatures(archive);
    if(oldSigners==null||newSigners==null||oldSigners.length!=1||newSigners.length!=1
       ||!MessageDigest.isEqual(MessageDigest.getInstance("SHA-256").digest(oldSigners[0].toByteArray()),
           MessageDigest.getInstance("SHA-256").digest(newSigners[0].toByteArray())))
      throw new IllegalStateException("APK signer mismatch");
  }
  @SuppressWarnings("deprecation")
  private static long longCode(PackageInfo pkg){
    return Build.VERSION.SDK_INT>=28?pkg.getLongVersionCode():pkg.versionCode;
  }
  private static Signature[] signatures(PackageInfo pkg){
    if(Build.VERSION.SDK_INT>=28)return pkg.signingInfo==null?null:pkg.signingInfo.getApkContentsSigners();
    return pkg.signatures;
  }
  private static String hex(byte[] bytes){
    StringBuilder result=new StringBuilder(bytes.length*2);
    for(byte b:bytes)result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
    return result.toString();
  }
  private static long installedVersion(Activity activity){
    try{return longCode(activity.getPackageManager().getPackageInfo(activity.getPackageName(),0));}
    catch(Exception ignored){return 0;}
  }
  private static String installedName(Activity activity){
    try{return activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionName;}
    catch(Exception ignored){return "bilinmiyor";}
  }
  private static HttpURLConnection openHttps(String url) throws Exception {
    URL target=new URL(url);
    if(!"https".equals(target.getProtocol())||!BASE.equals(target.getProtocol()+"://"+target.getHost())
       ||target.getPort()!=-1||target.getUserInfo()!=null)
      throw new IllegalArgumentException("Untrusted release origin");
    HttpURLConnection connection=(HttpURLConnection)target.openConnection();
    connection.setInstanceFollowRedirects(false);
    connection.setConnectTimeout(10000);connection.setReadTimeout(30000);
    connection.setRequestProperty("Cache-Control","no-cache");
    if(connection.getResponseCode()!=200){
      connection.disconnect();throw new IllegalStateException("Update request denied");
    }
    return connection;
  }
  private static byte[] readHttps(String url,int limit) throws Exception {
    HttpURLConnection connection=openHttps(url);
    try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
      byte[] chunk=new byte[4096];int count;
      while((count=input.read(chunk))!=-1){
        if(output.size()+count>limit)throw new IllegalStateException("Manifest too large");
        output.write(chunk,0,count);
      }
      return output.toByteArray();
    }finally{connection.disconnect();}
  }
}
