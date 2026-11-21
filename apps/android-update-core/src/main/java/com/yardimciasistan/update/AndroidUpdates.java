package com.yardimciasistan.update;

import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.Gravity;
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

  /** Host-owned semantic theme colors. The update mechanism remains shared. */
  public static final class Palette {
    public final int surface, border, text, secondary, accent, onAccent, soft, success, warning, danger;
    public Palette(int surface, int border, int text, int secondary, int accent, int onAccent,
                   int soft, int success, int warning, int danger) {
      this.surface=surface;this.border=border;this.text=text;this.secondary=secondary;
      this.accent=accent;this.onAccent=onAccent;this.soft=soft;
      this.success=success;this.warning=warning;this.danger=danger;
    }
  }
  private static int dp(Activity activity,int size) {
    return Math.round(size*activity.getResources().getDisplayMetrics().density);
  }
  private static GradientDrawable shape(Activity activity,int fill,int outline,int radius) {
    GradientDrawable background=new GradientDrawable();
    background.setColor(fill); background.setCornerRadius(dp(activity,radius));
    background.setStroke(dp(activity,1),outline);
    return background;
  }
  private static TextView label(Activity activity,String value,int size,int color,boolean bold) {
    TextView text=new TextView(activity);
    text.setText(value);text.setTextSize(size);text.setTextColor(color);
    text.setTypeface(Typeface.create("sans",bold?Typeface.BOLD:Typeface.NORMAL));
    text.setLineSpacing(0,1.08f);
    return text;
  }
  private static Button action(Activity activity,String title,Palette colors,boolean primary) {
    Button button=new Button(activity);
    button.setText(title);button.setAllCaps(false);button.setTextSize(14);
    button.setTypeface(Typeface.create("sans",Typeface.BOLD));
    int normalText=primary?colors.onAccent:colors.accent;
    button.setTextColor(new ColorStateList(
        new int[][]{new int[]{-android.R.attr.state_enabled},new int[]{}},
        new int[]{colors.secondary,normalText}));
    StateListDrawable background=new StateListDrawable();
    background.addState(new int[]{-android.R.attr.state_enabled},
        shape(activity,colors.soft,colors.border,12));
    background.addState(new int[]{},new RippleDrawable(
        ColorStateList.valueOf((colors.accent&0x00ffffff)|0x28000000),
        shape(activity,primary?colors.accent:colors.soft,
            primary?colors.accent:colors.border,12),null));
    button.setBackground(background);
    button.setMinHeight(dp(activity,48));button.setMinimumHeight(dp(activity,48));
    button.setPadding(dp(activity,12),dp(activity,9),dp(activity,12),dp(activity,9));
    return button;
  }
  private static void showStatus(Activity activity,TextView status,String message,int tone,Palette colors) {
    status.setVisibility(View.VISIBLE);
    status.setText(message);
    status.setTextColor(tone==0?colors.secondary:tone==1?colors.success:
        tone==2?colors.warning:colors.danger);
    status.setBackground(shape(activity,colors.soft,colors.border,12));
  }

  /** Only a subsequently launched APK with the expected version can confirm installation. */
  public static void confirmInstalledOnLaunch(Activity activity){
    SharedPreferences state=activity.getSharedPreferences("android_updates_v1",Activity.MODE_PRIVATE);
    int pending=state.getInt("pending_version",0);
    if(pending>0 && installedVersion(activity)>=pending)
      state.edit().remove("pending_version").putInt("installed_success_version",pending).apply();
  }

  public static View settingsView(Activity activity,String channel,String fileProviderSuffix,Palette colors) {
    String packageId=activity.getPackageName();
    String feed=BASE+"/updates/stable/"+channel+"/release.json";
    LinearLayout panel=new LinearLayout(activity);
    panel.setOrientation(LinearLayout.VERTICAL);
    panel.setPadding(dp(activity,16),dp(activity,15),dp(activity,16),dp(activity,16));
    panel.setBackground(shape(activity,colors.surface,colors.border,16));
    LinearLayout.LayoutParams panelParams=new LinearLayout.LayoutParams(-1,-2);
    panelParams.setMargins(0,dp(activity,10),0,dp(activity,12));
    panel.setLayoutParams(panelParams);
    LinearLayout header=new LinearLayout(activity);
    header.setOrientation(LinearLayout.HORIZONTAL);
    header.setGravity(Gravity.CENTER_VERTICAL);
    TextView icon=label(activity,"↻",24,colors.accent,true);
    icon.setGravity(Gravity.CENTER);
    icon.setBackground(shape(activity,colors.soft,colors.border,12));
    header.addView(icon,new LinearLayout.LayoutParams(dp(activity,42),dp(activity,42)));
    LinearLayout identity=new LinearLayout(activity);
    identity.setOrientation(LinearLayout.VERTICAL);
    identity.setPadding(dp(activity,12),0,0,0);
    identity.addView(label(activity,"Güncellemeler",17,colors.text,true));
    long installed=installedVersion(activity);
    TextView version=label(activity,"Kurulu sürüm: "+installedName(activity)+" ("+installed+")",12,colors.secondary,false);
    identity.addView(version);
    header.addView(identity,new LinearLayout.LayoutParams(0,-2,1f));
    panel.addView(header);
    TextView status=label(activity,"",13,colors.secondary,false);
    status.setPadding(dp(activity,12),dp(activity,10),dp(activity,12),dp(activity,10));
    LinearLayout.LayoutParams statusParams=new LinearLayout.LayoutParams(-1,-2);
    statusParams.setMargins(0,dp(activity,12),0,0);
    status.setLayoutParams(statusParams);
    status.setVisibility(View.GONE);
    status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    panel.addView(status);
    SharedPreferences progress=activity.getSharedPreferences("android_updates_v1",Activity.MODE_PRIVATE);
    int confirmed=progress.getInt("installed_success_version",0);
    if(confirmed>0 && installed>=confirmed){
      showStatus(activity,status,"Yeni sürüm kuruldu: "+installedName(activity)+" ("+installed+")",1,colors);
      progress.edit().remove("installed_success_version").apply();
    }
    AtomicReference<UpdateManifest> offered=new AtomicReference<>();
    Button check=action(activity,"Güncellemeyi denetle",colors,false);
    LinearLayout.LayoutParams checkParams=new LinearLayout.LayoutParams(-1,-2);
    checkParams.setMargins(0,dp(activity,12),0,0);
    panel.addView(check,checkParams);
    Button install=action(activity,"İndir ve yükle",colors,true);
    LinearLayout.LayoutParams installParams=new LinearLayout.LayoutParams(-1,-2);
    installParams.setMargins(0,dp(activity,8),0,0);
    install.setVisibility(View.GONE);
    panel.addView(install,installParams);
    check.setOnClickListener(v->{
      check.setEnabled(false);
      install.setVisibility(View.GONE);
      offered.set(null);
      showStatus(activity,status,"Sürüm denetleniyor…",0,colors);
      new Thread(()->{
        try {
          byte[] body=readHttps(feed,16384);
          UpdateManifest latest=UpdateManifest.parse(new String(body,java.nio.charset.StandardCharsets.UTF_8),feed,packageId);
          activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed())return;
            check.setEnabled(true);
            if(latest.newerThan(installedVersion(activity))){
              offered.set(latest);
              showStatus(activity,status,"Yeni sürüm: "+latest.versionName+" ("+latest.versionCode+")"
                  +(latest.notes.isEmpty()?"":"\n"+latest.notes),1,colors);
              install.setVisibility(View.VISIBLE);
            }else showStatus(activity,status,"Kurulu sürüm güncel.",1,colors);
          });
        } catch(Exception error){
          activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed())return;
            check.setEnabled(true);
            showStatus(activity,status,"Güncelleme kontrolü başarısız. İnternet veya yayın daha sonra yeniden denenebilir.",3,colors);
          });
        }
      },"ya-update-check").start();
    });
    install.setOnClickListener(v->{
      UpdateManifest update=offered.get();
      if(update==null||!update.newerThan(installedVersion(activity)))return;
      install.setEnabled(false);
      check.setEnabled(false);
      showStatus(activity,status,"İmzalı APK indiriliyor ve doğrulanıyor…",0,colors);
      new Thread(()->{
        try{
          File apk=downloadAndVerify(activity,update);
          activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed())return;
            check.setEnabled(true);install.setEnabled(true);
            if(!update.newerThan(installedVersion(activity))){
              showStatus(activity,status,"Kurulu sürüm güncel.",1,colors);return;
            }
            if(!activity.getPackageManager().canRequestPackageInstalls()){
              showStatus(activity,status,"Android kurulum izni gerekiyor. İzin verip İndir ve yükle seçeneğini yeniden açın.",2,colors);
              Intent permission=new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                  Uri.parse("package:"+packageId));
              activity.startActivity(permission);
              return;
            }
            try{
              Uri uri=FileProvider.getUriForFile(activity,packageId+fileProviderSuffix,apk);
              activity.startActivity(ApkInstallIntent.forVerifiedApk(activity.getPackageManager(),uri));
              progress.edit().putInt("pending_version",(int)update.versionCode).apply();
              showStatus(activity,status,"Android kurulum onayı bekleniyor; yükleme ancak yeni sürüm açılınca doğrulanacak.",2,colors);
            }catch(ApkInstallIntent.SystemInstallerUnavailableException error){
              showStatus(activity,status,"Sistem paket yükleyicisi bulunamadı. Kurulum başlatılmadı.",3,colors);
            }catch(Exception error){showStatus(activity,status,"Android kurulum ekranı açılamadı. Kurulum başlatılmadı.",3,colors);}
          });
        }catch(Exception error){
          activity.runOnUiThread(()->{
            if(activity.isFinishing()||activity.isDestroyed())return;
            install.setEnabled(true);check.setEnabled(true);
            showStatus(activity,status,"İndirme veya APK doğrulaması başarısız. Kurulum başlatılmadı.",3,colors);
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
