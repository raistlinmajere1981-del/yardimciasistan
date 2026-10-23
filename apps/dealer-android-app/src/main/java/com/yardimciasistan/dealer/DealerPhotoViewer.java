package com.yardimciasistan.dealer;

import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import java.io.*;
import java.net.URI;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** One full-screen local photo workspace; camera/gallery results never enter any API payload. */
final class DealerPhotoViewer {
  private final ComponentActivity activity;
  private final DealerUi ui;
  private final DealerImages images;
  private final Runnable onClose;
  private final File directory;
  private final ActivityResultLauncher<String[]> picker;
  private final ActivityResultLauncher<Uri> camera;
  private final ThreadPoolExecutor effects = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
      new ArrayBlockingQueue<>(1), new ThreadPoolExecutor.AbortPolicy());
  private DealerImages.Request remoteRequest, localRequest;
  private Future<?> effect;
  private Bitmap original, filtered, mine;
  private ArrayList<String> urls = new ArrayList<>();
  private String productName = "", error = "", personalPath = "", cameraPath = "",
                 activeLayer = "mine";
  private boolean active, comparing, overlay, effectBusy;
  private int index, generation;
  private float opacity = .5f;
  private DealerPhotoPixels.Mode mode = DealerPhotoPixels.Mode.NORMAL;
  private final DealerPhotoTransform normal = new DealerPhotoTransform(),
                                     productTransform = new DealerPhotoTransform(),
                                     mineTransform = new DealerPhotoTransform();
  private DealerPhotoView productView, mineView;
  private LinearLayout root;
  private final int imageEdge;
  private static final int STAGE = 0xff0c1523, TEXT = 0xfff2f6fc, MUTED = 0xffbccbdd;

  DealerPhotoViewer(
      ComponentActivity activity, DealerImages images, Runnable onClose, Bundle saved) {
    this.activity = activity;
    this.images = images;
    this.onClose = onClose;
    ui = new DealerUi(activity);
    directory = new File(activity.getCacheDir(), "photo-comparison");
    directory.mkdirs();
    long heap = Runtime.getRuntime().maxMemory();
    imageEdge = heap >= 256L * 1024 * 1024 ? 2048 : heap >= 128L * 1024 * 1024 ? 1440 : 1024;
    if (saved != null) {
      active = saved.getBoolean("photo.active");
      ArrayList<String> previous = saved.getStringArrayList("photo.urls");
      if (previous != null)
        urls = previous;
      index = Math.max(0, Math.min(saved.getInt("photo.index"), Math.max(0, urls.size() - 1)));
      productName = saved.getString("photo.name", "");
      comparing = saved.getBoolean("photo.compare");
      overlay = saved.getBoolean("photo.overlay");
      opacity = saved.getFloat("photo.opacity", .5f);
      activeLayer = saved.getString("photo.layer", "mine");
      personalPath = privatePath(saved.getString("photo.personal", ""));
      cameraPath = privatePath(saved.getString("photo.camera", ""));
      try {
        mode = DealerPhotoPixels.Mode.valueOf(saved.getString("photo.mode", "NORMAL"));
      } catch (IllegalArgumentException ignored) {
        mode = DealerPhotoPixels.Mode.NORMAL;
      }
      restoreTransform(normal, saved.getFloatArray("photo.normal"));
      restoreTransform(productTransform, saved.getFloatArray("photo.product"));
      restoreTransform(mineTransform, saved.getFloatArray("photo.mine"));
    }
    cleanupExcept(personalPath, cameraPath);
    picker = activity.registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
      if (!active)
        return;
      if (uri == null) {
        if (mine == null)
          endCompare();
        return;
      }
      importComparison(uri);
    });
    camera = activity.registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
      if (!active)
        return;
      if (ok && !cameraPath.isEmpty()) {
        String previous = personalPath;
        personalPath = cameraPath;
        cameraPath = "";
        delete(previous);
        loadPersonal();
      } else {
        delete(cameraPath);
        cameraPath = "";
        if (mine == null)
          endCompare();
      }
    });
  }
  static ArrayList<String> sources(JSONObject product) {
    LinkedHashSet<String> result = new LinkedHashSet<>();
    String primary = product.optString("image_url");
    if (https(primary))
      result.add(primary);
    JSONArray values = product.optJSONArray("image_urls");
    if (values != null)
      for (int i = 0; i < values.length() && result.size() < 12; i++) {
        String value = values.optString(i);
        if (https(value))
          result.add(value);
      }
    return new ArrayList<>(result);
  }
  private static boolean https(String value) {
    try {
      URI uri = new URI(value);
      return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
          && uri.getUserInfo() == null;
    } catch (Exception error) {
      return false;
    }
  }
  boolean active() {
    return active;
  }
  void open(JSONObject product) {
    closeResources(true);
    urls = sources(product);
    index = 0;
    productName = product.optString("name");
    active = true;
    mode = DealerPhotoPixels.Mode.NORMAL;
    normal.reset();
    productTransform.reset();
    mineTransform.reset();
    error = "";
    show();
  }
  void save(Bundle out) {
    out.putBoolean("photo.active", active);
    out.putStringArrayList("photo.urls", urls);
    out.putInt("photo.index", index);
    out.putString("photo.name", productName);
    out.putBoolean("photo.compare", comparing);
    out.putBoolean("photo.overlay", overlay);
    out.putFloat("photo.opacity", opacity);
    out.putString("photo.layer", activeLayer);
    out.putString("photo.personal", personalPath);
    out.putString("photo.camera", cameraPath);
    out.putString("photo.mode", mode.name());
    out.putFloatArray("photo.normal", transform(normal));
    out.putFloatArray("photo.product", transform(productTransform));
    out.putFloatArray("photo.mine", transform(mineTransform));
  }
  private float[] transform(DealerPhotoTransform t) {
    return new float[] {t.zoom, t.x, t.y, t.rotation};
  }
  private void restoreTransform(DealerPhotoTransform t, float[] value) {
    if (value == null || value.length != 4)
      return;
    t.zoom = Math.max(1, Math.min(8, value[0]));
    t.x = value[1];
    t.y = value[2];
    t.rotation = (Math.round(value[3]) / 90 * 90) % 360;
  }
  void close() {
    active = false;
    closeResources(true);
    restoreBars();
    onClose.run();
  }
  void destroy(boolean configurationChange) {
    active = false;
    closeResources(!configurationChange);
    effects.shutdownNow();
  }
  private void restoreBars() {
    activity.getWindow().setStatusBarColor(ui.background);
    activity.getWindow().setNavigationBarColor(ui.surface);
    activity.getWindow().getDecorView().setSystemUiVisibility(ui.dark
            ? 0
            : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  }
  private void detachPictures() {
    if (productView != null)
      productView.picture(null);
    if (mineView != null)
      mineView.picture(null);
    productView = mineView = null;
  }
  private void closeResources(boolean deleteFiles) {
    generation++;
    if (remoteRequest != null)
      remoteRequest.cancel();
    if (localRequest != null)
      localRequest.cancel();
    remoteRequest = localRequest = null;
    if (effect != null)
      effect.cancel(true);
    effect = null;
    effects.purge();
    detachPictures();
    DealerImages.release(filtered);
    DealerImages.release(original);
    DealerImages.release(mine);
    filtered = original = mine = null;
    effectBusy = false;
    comparing = overlay = false;
    if (deleteFiles) {
      cleanupExcept();
      personalPath = cameraPath = "";
    }
  }
  void show() {
    if (!active || activity.isDestroyed())
      return;
    root = ui.column();
    root.setBackgroundColor(STAGE);
    activity.setContentView(root);
    ui.insets(root);
    activity.getWindow().setStatusBarColor(STAGE);
    activity.getWindow().setNavigationBarColor(STAGE);
    activity.getWindow().getDecorView().setSystemUiVisibility(0);
    LinearLayout header = ui.row();
    header.setPadding(ui.dp(8), ui.dp(4), ui.dp(8), ui.dp(4));
    root.addView(header);
    if (comparing) {
      tool(header, "Karşılaştırmayı kapat", this::endCompare);
    } else {
      tool(header, "Kapat", this::close);
      TextView count =
          ui.text(urls.size() > 1 ? (index + 1) + " / " + urls.size() : "Fotoğraf", 15, TEXT);
      count.setGravity(Gravity.CENTER);
      header.addView(count, new LinearLayout.LayoutParams(0, -2, 1));
      if (urls.size() > 1) {
        Button previous = tool(header, "‹", () -> page(-1));
        previous.setContentDescription("Önceki fotoğraf");
        Button next = tool(header, "›", () -> page(1));
        next.setContentDescription("Sonraki fotoğraf");
      }
    }
    FrameLayout stage = new FrameLayout(activity);
    stage.setMinimumHeight(ui.dp(96));
    root.addView(stage, new LinearLayout.LayoutParams(-1, 0, 1));
    Bitmap visible = filtered == null ? original : filtered;
    if (comparing) {
      if (overlay) {
        productTransform.alignment = mineTransform.alignment = true;
        productView = photo(
            stage, visible, productTransform, "Ürün fotoğrafı", activeLayer.equals("product"));
        mineView = photo(stage, mine, mineTransform, "Benim parçam", activeLayer.equals("mine"));
        mineView.setAlpha(opacity);
      } else {
        productTransform.alignment = mineTransform.alignment = false;
        LinearLayout panes = ui.row();
        panes.setGravity(Gravity.FILL);
        stage.addView(panes, new FrameLayout.LayoutParams(-1, -1));
        productView = pane(panes, "Ürün", visible, productTransform);
        mineView = pane(panes, "Benim parçam", mine, mineTransform);
      }
    } else {
      normal.alignment = false;
      productView = photo(stage, visible, normal, productName + " fotoğrafı", true);
      productView.swipe = this::page;
    }
    if (original == null) {
      TextView status = ui.text(urls.isEmpty() ? "Fotoğraf yok"
              : !error.isEmpty()               ? error
                                               : "Fotoğraf açılıyor…",
          16, MUTED);
      status.setPadding(ui.dp(20), ui.dp(20), ui.dp(20), ui.dp(20));
      status.setGravity(Gravity.CENTER);
      stage.addView(status, new FrameLayout.LayoutParams(-1, -1));
    }
    if (effectBusy) {
      TextView status = ui.text(mode.label + " hazırlanıyor…", 13, TEXT);
      status.setBackgroundColor(0xcc0c1523);
      status.setPadding(ui.dp(12), ui.dp(8), ui.dp(12), ui.dp(8));
      FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
      stage.addView(status, p);
    }
    ScrollView tools = new ScrollView(activity) {
      @Override
      protected void onMeasure(int width, int height) {
        int max = (int) (getResources().getDisplayMetrics().heightPixels * .45f);
        super.onMeasure(width,
            View.MeasureSpec.makeMeasureSpec(
                Math.min(max, View.MeasureSpec.getSize(height)), View.MeasureSpec.AT_MOST));
      }
    };
    tools.setFillViewport(false);
    root.addView(tools, new LinearLayout.LayoutParams(-1, -2));
    LinearLayout controls = ui.column();
    controls.setPadding(ui.dp(8), 0, ui.dp(8), ui.dp(8));
    tools.addView(controls);
    if (!error.isEmpty() && original == null && !urls.isEmpty())
      tool(controls, "Yeniden dene", this::loadCurrent);
    if (original != null) {
      if (comparing)
        comparisonControls(controls);
      else
        normalControls(controls);
    }
    if (original == null && remoteRequest == null && !urls.isEmpty() && error.isEmpty())
      loadCurrent();
    if (comparing && mine == null && !personalPath.isEmpty() && localRequest == null)
      loadPersonal();
  }
  private DealerPhotoView photo(FrameLayout stage, Bitmap bitmap, DealerPhotoTransform transform,
      String description, boolean enabled) {
    DealerPhotoView view = new DealerPhotoView(activity, transform);
    view.setContentDescription(description);
    view.picture(bitmap);
    view.setEnabled(enabled);
    stage.addView(view, new FrameLayout.LayoutParams(-1, -1));
    return view;
  }
  private DealerPhotoView pane(
      LinearLayout parent, String name, Bitmap bitmap, DealerPhotoTransform transform) {
    LinearLayout pane = ui.column();
    pane.setPadding(ui.dp(4), ui.dp(4), ui.dp(4), ui.dp(4));
    parent.addView(pane, new LinearLayout.LayoutParams(0, -1, 1));
    TextView caption = ui.label(pane, name, 14, TEXT);
    caption.setGravity(Gravity.CENTER);
    FrameLayout frame = new FrameLayout(activity);
    pane.addView(frame, new LinearLayout.LayoutParams(-1, 0, 1));
    DealerPhotoView view = photo(frame, bitmap, transform, name, true);
    if (bitmap == null) {
      TextView empty = ui.text("Fotoğraf seçin", 14, MUTED);
      empty.setGravity(Gravity.CENTER);
      frame.addView(empty, new FrameLayout.LayoutParams(-1, -1));
    }
    LinearLayout buttons = ui.row();
    pane.addView(buttons);
    equal(tool(buttons, "−", () -> view.zoom(.8f)));
    equal(tool(buttons, "+", () -> view.zoom(1.25f)));
    equal(tool(buttons, "Döndür", view::rotate));
    return view;
  }
  private void normalControls(LinearLayout parent) {
    HorizontalScrollView scroller = new HorizontalScrollView(activity);
    scroller.setHorizontalScrollBarEnabled(false);
    LinearLayout modes = ui.row();
    scroller.addView(modes);
    parent.addView(scroller);
    for (DealerPhotoPixels.Mode candidate : DealerPhotoPixels.Mode.values()) {
      Button choice = tool(modes, candidate.label, () -> selectMode(candidate));
      choice.setSelected(candidate == mode);
      choice.setTypeface(null,
          candidate == mode ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
      choice.setBackground(ui.shape(
          candidate == mode ? ui.accent : STAGE, candidate == mode ? ui.accent : 0xff536578, 12));
      choice.setTextColor(candidate == mode ? ui.onAccent : TEXT);
      choice.setContentDescription(candidate.label + (candidate == mode ? ", seçili" : ""));
      if (candidate == mode)
        scroller.post(() -> scroller.scrollTo(Math.max(0, choice.getLeft() - ui.dp(8)), 0));
    }
    LinearLayout zoom = ui.row();
    parent.addView(zoom);
    equal(tool(zoom, "−", () -> productView.zoom(.8f)));
    TextView zoomLabel = ui.text("Yakınlaştır", 14, MUTED);
    zoomLabel.setGravity(Gravity.CENTER);
    zoom.addView(zoomLabel, new LinearLayout.LayoutParams(0, -2, 2));
    equal(tool(zoom, "+", () -> productView.zoom(1.25f)));
    LinearLayout actions = ui.row();
    parent.addView(actions);
    equal(tool(actions, "Döndür", () -> productView.rotate()));
    equal(tool(actions, "Sığdır", () -> {
      normal.reset();
      selectMode(DealerPhotoPixels.Mode.NORMAL);
    }));
    equal(tool(actions, "Karşılaştır", () -> {
      comparing = true;
      overlay = false;
      productTransform.reset();
      mineTransform.reset();
      show();
    }));
  }
  private void comparisonControls(LinearLayout parent) {
    TextView privacy = ui.label(parent, "Fotoğrafınız yalnız bu cihazda işlenir.", 12, MUTED);
    privacy.setGravity(Gravity.CENTER);
    LinearLayout sources = ui.row();
    parent.addView(sources);
    equal(tool(sources, "Kamera", this::capture));
    equal(tool(sources, "Galeri", () -> {
      try {
        picker.launch(new String[] {"image/*"});
      } catch (Exception error) {
        toast("Galeri açılamadı. Yeniden deneyin.");
      }
    }));
    LinearLayout layout = ui.row();
    parent.addView(layout);
    Button split = tool(layout, "Yan yana", () -> {
      overlay = false;
      show();
    });
    Button stacked = tool(layout, "Üst üste", () -> {
      overlay = true;
      show();
    });
    equal(split);
    equal(stacked);
    (overlay ? stacked : split).setTypeface(null, android.graphics.Typeface.BOLD);
    (overlay ? stacked : split)
        .setContentDescription((overlay ? "Üst üste" : "Yan yana") + ", seçili");
    if (overlay) {
      LinearLayout layers = ui.row();
      parent.addView(layers);
      Button product = tool(layers, "Ürün", () -> {
        activeLayer = "product";
        show();
      });
      Button personal = tool(layers, "Benim parçam", () -> {
        activeLayer = "mine";
        show();
      });
      equal(product);
      equal(personal);
      (activeLayer.equals("mine") ? personal : product)
          .setBackground(ui.shape(ui.accent, ui.accent, 12));
      (activeLayer.equals("mine") ? personal : product).setTextColor(ui.onAccent);
      LinearLayout transforms = ui.row();
      parent.addView(transforms);
      equal(tool(transforms, "−", () -> activeView().zoom(.8f)));
      equal(tool(transforms, "+", () -> activeView().zoom(1.25f)));
      equal(tool(transforms, "Döndür", () -> activeView().rotate()));
      ui.label(parent, "Saydamlık", 13, MUTED);
      SeekBar alpha = new SeekBar(activity);
      alpha.setMax(100);
      alpha.setProgress(Math.round(opacity * 100));
      alpha.setContentDescription("Saydamlık");
      alpha.setMinimumHeight(ui.dp(48));
      parent.addView(alpha, new LinearLayout.LayoutParams(-1, ui.dp(48)));
      alpha.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
        public void onStartTrackingTouch(SeekBar s) {}
        public void onStopTrackingTouch(SeekBar s) {}
        public void onProgressChanged(SeekBar s, int value, boolean user) {
          opacity = value / 100f;
          if (mineView != null)
            mineView.setAlpha(opacity);
        }
      });
    }
    tool(parent, "Hizalamayı sıfırla", () -> {
      productTransform.reset();
      mineTransform.reset();
      opacity = .5f;
      show();
    });
  }
  private DealerPhotoView activeView() {
    return activeLayer.equals("mine") ? mineView : productView;
  }
  private Button tool(LinearLayout parent, String caption, Runnable action) {
    Button button = ui.button(parent, caption, action, false);
    button.setTextColor(TEXT);
    button.setBackground(ui.shape(0xff172638, ui.appearance.highContrast ? TEXT : 0xff536578, 12));
    return button;
  }
  private void equal(Button button) {
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, -2, 1);
    p.setMargins(ui.dp(3), ui.dp(4), ui.dp(3), ui.dp(4));
    button.setLayoutParams(p);
  }
  private void toast(String message) {
    Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
  }
  private void page(int direction) {
    if (urls.size() < 2 || comparing)
      return;
    index = (index + direction + urls.size()) % urls.size();
    normal.reset();
    mode = DealerPhotoPixels.Mode.NORMAL;
    loadCurrent();
  }
  private void loadCurrent() {
    generation++;
    if (remoteRequest != null)
      remoteRequest.cancel();
    if (effect != null)
      effect.cancel(true);
    effects.purge();
    detachPictures();
    DealerImages.release(filtered);
    DealerImages.release(original);
    filtered = original = null;
    error = "";
    effectBusy = false;
    if (urls.isEmpty()) {
      show();
      return;
    }
    int version = generation;
    remoteRequest = images.remote(urls.get(index), imageEdge, (bitmap, problem) -> {
      if (!active || version != generation) {
        DealerImages.release(bitmap);
        return;
      }
      remoteRequest = null;
      original = bitmap;
      error = problem;
      if (bitmap != null && mode != DealerPhotoPixels.Mode.NORMAL)
        selectMode(mode);
      else
        show();
    });
    show();
  }
  private void selectMode(DealerPhotoPixels.Mode selected) {
    mode = selected;
    generation++;
    int version = generation;
    if (effect != null)
      effect.cancel(true);
    effects.purge();
    detachPictures();
    DealerImages.release(filtered);
    filtered = null;
    effectBusy = false;
    if (selected == DealerPhotoPixels.Mode.NORMAL || original == null) {
      show();
      return;
    }
    effectBusy = true;
    Bitmap input = original;
    show();
    try {
      effect = effects.submit(() -> {
        Bitmap output = null;
        try {
          int[] source;
          int width, height;
          synchronized (input) {
            if (input.isRecycled())
              return;
            width = input.getWidth();
            height = input.getHeight();
            source = new int[width * height];
            input.getPixels(source, 0, width, 0, 0, width, height);
          }
          int[] pixels = DealerPhotoPixels.apply(
              source, width, height, selected, () -> Thread.currentThread().isInterrupted());
          if (Thread.currentThread().isInterrupted())
            return;
          output = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888);
          final Bitmap result = output;
          activity.runOnUiThread(() -> {
            if (!active || version != generation) {
              DealerImages.release(result);
              return;
            }
            effectBusy = false;
            filtered = result;
            show();
          });
        } catch (CancellationException ignored) { /* A newer selection owns the view. */
        } catch (OutOfMemoryError | RuntimeException failure) {
          DealerImages.release(output);
          activity.runOnUiThread(() -> {
            if (active && version == generation) {
              effectBusy = false;
              mode = DealerPhotoPixels.Mode.NORMAL;
              toast("Bu mod için bellek yetmedi. Normal fotoğraf gösteriliyor.");
              show();
            }
          });
        }
      });
    } catch (RejectedExecutionException busy) {
      effectBusy = false;
      toast("Fotoğraf hazırlanıyor. Yeniden deneyin.");
      show();
    }
  }
  private void capture() {
    try {
      delete(cameraPath);
      File file = File.createTempFile("camera-", ".jpg", directory);
      cameraPath = file.getAbsolutePath();
      camera.launch(
          FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", file));
    } catch (Exception error) {
      delete(cameraPath);
      cameraPath = "";
      toast("Kamera açılamadı. Galeriden fotoğraf seçebilirsiniz.");
    }
  }
  private void importComparison(Uri uri) {
    try {
      if (localRequest != null)
        localRequest.cancel();
      File file = File.createTempFile("local-", ".image", directory);
      String previous = personalPath;
      localRequest = images.importLocal(uri, file, imageEdge, (bitmap, problem) -> {
        localRequest = null;
        if (!active) {
          DealerImages.release(bitmap);
          file.delete();
          return;
        }
        if (bitmap == null) {
          file.delete();
          toast(problem);
          if (mine == null)
            endCompare();
          return;
        }
        detachPictures();
        DealerImages.release(mine);
        mine = bitmap;
        personalPath = file.getAbsolutePath();
        delete(previous);
        mineTransform.reset();
        comparing = true;
        show();
      });
    } catch (IOException error) {
      toast("Fotoğraf açılamadı. Yeniden seçin.");
    }
  }
  private void loadPersonal() {
    String path = personalPath;
    if (path.isEmpty())
      return;
    if (localRequest != null)
      localRequest.cancel();
    localRequest = images.local(new File(path), imageEdge, (bitmap, problem) -> {
      localRequest = null;
      if (!active || !path.equals(personalPath)) {
        DealerImages.release(bitmap);
        return;
      }
      detachPictures();
      DealerImages.release(mine);
      mine = bitmap;
      if (bitmap == null) {
        toast(problem);
        delete(personalPath);
        personalPath = "";
        endCompare();
      } else
        show();
    });
  }
  private void endCompare() {
    if (localRequest != null)
      localRequest.cancel();
    localRequest = null;
    detachPictures();
    DealerImages.release(mine);
    mine = null;
    delete(personalPath);
    delete(cameraPath);
    personalPath = cameraPath = "";
    cleanupExcept();
    comparing = overlay = false;
    productTransform.reset();
    mineTransform.reset();
    opacity = .5f;
    show();
  }
  private String privatePath(String value) {
    try {
      File file = new File(value);
      return file.isFile()
              && file.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile())
          ? file.getCanonicalPath()
          : "";
    } catch (Exception error) {
      return "";
    }
  }
  private void delete(String path) {
    if (!path.isEmpty()) {
      String safe = privatePath(path);
      if (!safe.isEmpty())
        new File(safe).delete();
    }
  }
  private void cleanupExcept(String... keep) {
    Set<String> protectedFiles = new HashSet<>(Arrays.asList(keep));
    File[] files = directory.listFiles();
    if (files != null)
      for (File file : files)
        if (file.isFile() && !protectedFiles.contains(file.getAbsolutePath()))
          file.delete();
  }
}
