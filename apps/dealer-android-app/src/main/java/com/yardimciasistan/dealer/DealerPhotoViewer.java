package com.yardimciasistan.dealer;

import android.annotation.SuppressLint;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import java.io.*;
import java.net.URI;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local-only shell. Pixels, transforms, gestures and session rules live in packages/image-inspector. */
final class DealerPhotoViewer {
  private static final String ORIGIN = "https://inspector.invalid";
  private static final Set<String> ASSETS = new HashSet<>(Arrays.asList(
      "android.html", "android.js", "android.css", "core.js", "inspector.js", "inspector.css", "worker.js"));
  private final ComponentActivity activity;
  private final DealerImages images;
  private final Runnable onClose;
  private final File directory;
  private final ActivityResultLauncher<String[]> picker;
  private final ActivityResultLauncher<Uri> camera;
  private final List<DealerImages.Request> requests = new CopyOnWriteArrayList<>();
  private final int imageEdge;
  private ArrayList<String> urls = new ArrayList<>();
  private volatile boolean active;
  private volatile int generation;
  private WebView web;
  private String name = "", cameraPath = "", state = "";
  private volatile String personalPath = "";
  private volatile int personalRevision;
  private DealerImages.Request importRequest;

  DealerPhotoViewer(ComponentActivity activity, DealerImages images, Runnable onClose, Bundle saved) {
    this.activity = activity;
    this.images = images;
    this.onClose = onClose;
    directory = new File(activity.getCacheDir(), "photo-comparison");
    directory.mkdirs();
    // Two canvases + worker source/output + WebView itself: conservative on small native heaps.
    imageEdge = Runtime.getRuntime().maxMemory() >= 256L * 1024 * 1024 ? 1440 : 1024;
    if (saved != null) {
      active = saved.getBoolean("photo.active");
      ArrayList<String> previous = saved.getStringArrayList("photo.urls");
      if (previous != null) for (String url : previous) if (https(url) && urls.size() < 12) urls.add(url);
      name = saved.getString("photo.name", "");
      state = saved.getString("photo.state", "");
      personalPath = privatePath(saved.getString("photo.personal", ""));
      cameraPath = privatePath(saved.getString("photo.camera", ""));
    }
    cleanupExcept(personalPath, cameraPath);
    picker = activity.registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
      if (active && uri != null) importPersonal(uri);
    });
    camera = activity.registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
      if (!active) return;
      if (ok && !cameraPath.isEmpty()) {
        String previous = personalPath;
        clearPreparedPersonal();
        personalPath = cameraPath;
        cameraPath = "";
        delete(previous);
        personalRevision++;
        notifyPersonal();
      } else { delete(cameraPath); cameraPath = ""; }
    });
  }
  static ArrayList<String> sources(JSONObject product) {
    LinkedHashSet<String> result = new LinkedHashSet<>();
    String primary = product.optString("image_url");
    if (https(primary)) result.add(primary);
    JSONArray values = product.optJSONArray("image_urls");
    if (values != null) for (int i = 0; i < values.length() && result.size() < 12; i++) {
      String value = values.optString(i);
      if (https(value)) result.add(value);
    }
    return new ArrayList<>(result);
  }
  private static boolean https(String value) {
    try {
      URI uri = new URI(value);
      return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null;
    } catch (Exception error) { return false; }
  }
  boolean active() { return active; }
  void open(JSONObject product) {
    dispose(true);
    urls = sources(product);
    name = product.optString("name");
    state = "";
    active = true;
    show();
  }
  void save(Bundle out) {
    out.putBoolean("photo.active", active);
    out.putStringArrayList("photo.urls", urls);
    out.putString("photo.name", name);
    out.putString("photo.state", state);
    out.putString("photo.personal", personalPath);
    out.putString("photo.camera", cameraPath);
  }
  void close() {
    active = false;
    dispose(true);
    onClose.run();
  }
  void destroy(boolean configurationChange) {
    active = false;
    dispose(!configurationChange);
  }
  private void dispose(boolean deleteFiles) {
    generation++;
    if (importRequest != null) importRequest.cancel();
    importRequest = null;
    for (DealerImages.Request r : requests) r.cancel();
    requests.clear();
    if (web != null) {
      web.removeJavascriptInterface("InspectorHost");
      web.stopLoading();
      web.loadUrl("about:blank");
      web.removeAllViews();
      web.destroy();
      web = null;
    }
    if (deleteFiles) { cleanupExcept(); personalPath = cameraPath = ""; }
    else cleanupExcept(personalPath, cameraPath);
  }
  @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
  void show() {
    if (!active || activity.isDestroyed() || web != null) return;
    final int version = ++generation;
    final ArrayList<String> selectedUrls = new ArrayList<>(urls);
    FrameLayout frame = new FrameLayout(activity);
    activity.setContentView(frame);
    new DealerUi(activity).insets(frame);
    WebView view = new WebView(activity);
    web = view;
    frame.addView(view, new FrameLayout.LayoutParams(-1, -1));
    WebSettings settings = view.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setDomStorageEnabled(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setSupportMultipleWindows(false);
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    view.setImportantForAccessibility(android.view.View.IMPORTANT_FOR_ACCESSIBILITY_YES);
    view.addJavascriptInterface(new Object() {
      @JavascriptInterface public void close() {
        activity.runOnUiThread(() -> { if (valid(version)) DealerPhotoViewer.this.close(); });
      }
      @JavascriptInterface public void choose(String kind) {
        activity.runOnUiThread(() -> {
          if (!valid(version)) return;
          if ("camera".equals(kind)) capture();
          else if ("gallery".equals(kind)) {
            try { picker.launch(new String[] {"image/jpeg", "image/png", "image/webp"}); }
            catch (Exception error) { toast("Galeri açılamadı."); }
          }
        });
      }
      @JavascriptInterface public void forgetPersonal() {
        activity.runOnUiThread(() -> { if (valid(version)) clearPersonal(); });
      }
      @JavascriptInterface public void state(String json) {
        if (json == null || json.length() > 12000) return;
        activity.runOnUiThread(() -> {
          if (valid(version)) try { state = new JSONObject(json).toString(); } catch (Exception ignored) { }
        });
      }
    }, "InspectorHost");
    view.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
        if (!valid(version) || !"GET".equals(request.getMethod())) return denied();
        Uri uri = request.getUrl();
        if (!"https".equals(uri.getScheme()) || !"inspector.invalid".equals(uri.getHost())
            || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getQuery() != null) return denied();
        String path = uri.getPath();
        try {
          if (path != null && path.startsWith("/runtime/") && ASSETS.contains(path.substring(9))) {
            String asset = path.substring(9);
            String mime = asset.endsWith(".js") ? "application/javascript" : asset.endsWith(".css") ? "text/css" : "text/html";
            return new WebResourceResponse(mime, "UTF-8", activity.getAssets().open(asset));
          }
          String source = null; File local = null;
          if (path != null && path.matches("/(media|thumb)/[0-9]{1,2}")) {
            int index = Integer.parseInt(path.substring(7));
            if (index >= selectedUrls.size()) return denied();
            source = selectedUrls.get(index);
          } else if (path != null && path.equals("/personal/" + personalRevision)) {
            String safe = privatePath(personalPath);
            if (safe.isEmpty()) return denied();
            local = new File(safe);
          } else return denied();
          File prepared = new File(directory, "render-" + version + "-" + path.replace('/', '_') + ".png");
          synchronized (DealerPhotoViewer.this) {
            if (!valid(version)) return denied();
            if (!prepared.isFile()) {
              DealerImages.Request r = images.inspectorRequest(); requests.add(r);
              try { images.inspectorImage(source, local, prepared, path.startsWith("/thumb/") ? 128 : imageEdge, r); }
              finally { requests.remove(r); }
            }
            if (!valid(version) || (path.startsWith("/personal/") && !path.equals("/personal/" + personalRevision))) { prepared.delete(); return denied(); }
            return new WebResourceResponse("image/png", null, new FileInputStream(prepared));
          }
        } catch (Exception | OutOfMemoryError failure) { return denied(); }
      }
      @Override public void onPageFinished(WebView v, String url) {
        if (!valid(version) || !url.equals(ORIGIN + "/runtime/android.html")) return;
        try {
          JSONArray sources = new JSONArray(), thumbs = new JSONArray();
          for (int i = 0; i < selectedUrls.size(); i++) { sources.put(ORIGIN + "/media/" + i); thumbs.put(ORIGIN + "/thumb/" + i); }
          JSONObject item = new JSONObject().put("name", name).put("urls", sources).put("thumbUrls", thumbs);
          JSONObject config = new JSONObject().put("title", name).put("edge", imageEdge)
              .put("items", new JSONArray().put(item));
          if (!state.isEmpty()) config.put("state", new JSONObject(state));
          if (!personalPath.isEmpty()) config.put("personal", ORIGIN + "/personal/" + personalRevision);
          v.evaluateJavascript("window.startInspector(" + config + ")", null);
        } catch (Exception error) { toast("Fotoğraf inceleyici açılamadı."); }
      }
      @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
        activity.runOnUiThread(() -> { if (valid(version)) { close(); toast("Bellek sınırına ulaşıldı. Fotoğrafı yeniden açın."); } });
        return true;
      }
    });
    view.loadUrl(ORIGIN + "/runtime/android.html");
  }
  private boolean valid(int version) { return active && generation == version; }
  private WebResourceResponse denied() {
    return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
  }
  private void capture() {
    if (importRequest != null) importRequest.cancel();
    importRequest = null;
    try {
      delete(cameraPath);
      File file = File.createTempFile("camera-", ".jpg", directory);
      cameraPath = file.getAbsolutePath();
      camera.launch(FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", file));
    } catch (Exception error) { delete(cameraPath); cameraPath = ""; toast("Kamera açılamadı. Galeriyi kullanın."); }
  }
  private void importPersonal(Uri uri) {
    try {
      if (importRequest != null) importRequest.cancel();
      final int version = generation;
      File file = File.createTempFile("local-", ".image", directory);
      importRequest = images.importLocal(uri, file, imageEdge, (bitmap, problem) -> {
        importRequest = null;
        DealerImages.release(bitmap);
        if (!valid(version) || bitmap == null) { file.delete(); if (valid(version)) toast(problem); return; }
        delete(personalPath);
        clearPreparedPersonal();
        personalPath = file.getAbsolutePath();
        personalRevision++;
        notifyPersonal();
      });
    } catch (Exception error) { toast("Fotoğraf açılamadı."); }
  }
  private void clearPreparedPersonal() {
    File[] files = directory.listFiles((dir, filename) -> filename.contains("_personal_"));
    if (files != null) for (File file : files) file.delete();
  }
  private void clearPersonal() {
    personalRevision++;
    if (importRequest != null) importRequest.cancel();
    importRequest = null;
    delete(personalPath); delete(cameraPath);
    personalPath = cameraPath = "";
    clearPreparedPersonal();
  }
  private void notifyPersonal() {
    if (web != null) web.evaluateJavascript("window.inspectorPersonal(" + JSONObject.quote(ORIGIN + "/personal/" + personalRevision) + ")", null);
  }
  private void toast(String message) { Toast.makeText(activity, message, Toast.LENGTH_LONG).show(); }
  private String privatePath(String value) {
    try {
      File f = new File(value);
      return f.isFile() && f.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile()) ? f.getCanonicalPath() : "";
    } catch (Exception error) { return ""; }
  }
  private void delete(String path) { String safe = privatePath(path); if (!safe.isEmpty()) new File(safe).delete(); }
  private void cleanupExcept(String... keep) {
    Set<String> protectedFiles = new HashSet<>(Arrays.asList(keep));
    File[] files = directory.listFiles();
    if (files != null) for (File file : files) if (file.isFile() && !protectedFiles.contains(file.getAbsolutePath())) file.delete();
  }
}
