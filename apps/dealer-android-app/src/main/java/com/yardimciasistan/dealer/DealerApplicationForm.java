package com.yardimciasistan.dealer;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.Editable;
import android.text.TextWatcher;
import android.widget.*;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import java.io.*;
import java.util.*;
import java.util.concurrent.ExecutorService;
import org.json.*;

/** Unauthenticated form uses the same public request/multipart contract as the Widget. */
final class DealerApplicationForm {
  private final ComponentActivity activity;
  private final ExecutorService network;
  private final Runnable renderLogin;
  private final DealerUi ui;
  private final JSONObject fields = new JSONObject();
  private final List<JSONObject> documents = new ArrayList<>();
  private final ActivityResultLauncher<String[]> picker;
  private final ActivityResultLauncher<Uri> camera;
  private String base = "", key = "", intent = "", cameraUri = "", message = "",
                 kind = "tax_certificate";
  private boolean active, busy, submitted, showTax;
  private TextView status;
  private LinearLayout form;
  private ProgressBar progress;
  private static final String[] KINDS = {
      "tax_certificate", "activity_certificate", "authorization", "other"};
  private static final String[] LABELS = {
      "Vergi levhası", "Faaliyet belgesi", "Yetki belgesi", "Diğer belgeler"};

  DealerApplicationForm(
      ComponentActivity activity, ExecutorService network, Runnable renderLogin, Bundle saved) {
    this.activity = activity;
    this.network = network;
    this.renderLogin = renderLogin;
    ui = new DealerUi(activity);
    if (saved != null) {
      try {
        active = saved.getBoolean("application.active");
        base = saved.getString("application.base", "");
        submitted = saved.getBoolean("application.submitted");
        showTax = saved.getBoolean("application.tax");
        key = saved.getString("application.key", "");
        intent = saved.getString("application.intent", "");
        cameraUri = saved.getString("application.camera", "");
        JSONObject restored = new JSONObject(saved.getString("application.fields", "{}"));
        Iterator<String> keys = restored.keys();
        while (keys.hasNext()) {
          String name = keys.next();
          fields.put(name, restored.get(name));
        }
        JSONArray docs = new JSONArray(saved.getString("application.documents", "[]"));
        for (int i = 0; i < docs.length(); i++) documents.add(docs.getJSONObject(i));
      } catch (JSONException error) {
        message = "Başvuru taslağı okunamadı. Bilgileri kontrol edin.";
      }
    }
    picker = activity.registerForActivityResult(
        new ActivityResultContracts.OpenMultipleDocuments(), uris -> {
          for (Uri uri : uris) {
            try {
              activity.getContentResolver().takePersistableUriPermission(
                  uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) { /* Some providers grant only activity lifetime. */
            }
            add(uri);
          }
          show();
        });
    camera = activity.registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
      if (ok && !cameraUri.isEmpty())
        add(Uri.parse(cameraUri));
      show();
    });
  }
  boolean active() {
    return active;
  }
  void save(Bundle out) {
    out.putBoolean("application.active", active);
    out.putString("application.base", base);
    out.putString("application.fields", fields.toString());
    out.putBoolean("application.submitted", submitted);
    out.putBoolean("application.tax", showTax);
    out.putString("application.key", key);
    out.putString("application.intent", intent);
    out.putString("application.documents", new JSONArray(documents).toString());
    out.putString("application.camera", cameraUri);
  }
  void close() {
    if (busy)
      return;
    active = false;
    renderLogin.run();
  }
  void open(String input) {
    try {
      base = DealerApi.normalizeBase(input);
    } catch (Exception error) {
      android.widget.Toast.makeText(activity, error.getMessage(), Toast.LENGTH_LONG).show();
      return;
    }
    active = true;
    submitted = false;
    busy = true;
    message = "Başvuru kontrol ediliyor…";
    show();
    network.execute(() -> {
      String error = "";
      try {
        if (!new DealerApi(base)
                .applicationInfo()
                .getJSONObject("business")
                .optBoolean("dealer_application_enabled"))
          error = "Bu işletmede online bayi başvurusu kapalı.";
      } catch (Exception failure) {
        error = "Başvuru açılamadı. Bağlantınızı kontrol edip yeniden deneyin.";
      }
      final String result = error;
      activity.runOnUiThread(() -> {
        if (activity.isDestroyed())
          return;
        busy = false;
        message = result;
        if (!result.isEmpty()) {
          active = false;
          renderLogin.run();
          android.widget.Toast.makeText(activity, result, Toast.LENGTH_LONG).show();
        } else
          show();
      });
    });
  }
  void show() {
    if (!active || activity.isDestroyed())
      return;
    ScrollView scroll = new ScrollView(activity);
    scroll.setFillViewport(true);
    scroll.setBackgroundColor(ui.background);
    form = ui.column();
    form.setPadding(ui.dp(16), ui.dp(16), ui.dp(16), ui.dp(24));
    scroll.addView(form);
    activity.setContentView(scroll);
    ui.insets(scroll);
    Button back = button("‹ Giriş", this::close);
    back.setEnabled(!busy);
    ui.label(form, submitted ? "Başvurunuz alındı" : "Bayi başvurusu", 26, ui.ink)
        .setTypeface(null, android.graphics.Typeface.BOLD);
    if (submitted) {
      ui.label(form, "İşletmenin değerlendirmesi bekleniyor.", 16, ui.muted);
      button("Girişe dön", this::close);
      return;
    }
    text("Firma / unvan", "company_name", 180, android.text.InputType.TYPE_CLASS_TEXT);
    text("Yetkili adı soyadı", "authorized_person", 160,
        android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_CAP_WORDS);
    text("Telefon", "customer_phone", 40, android.text.InputType.TYPE_CLASS_PHONE);
    text("E-posta", "email", 254,
        android.text.InputType.TYPE_CLASS_TEXT
            | android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    LinearLayout optional = ui.column();
    form.addView(optional);
    Button tax = ui.button(optional, "Vergi bilgileri (isteğe bağlı)", () -> {}, false);
    LinearLayout fieldsGroup = ui.column();
    optional.addView(fieldsGroup);
    fieldsGroup.setVisibility(showTax ? android.view.View.VISIBLE : android.view.View.GONE);
    LinearLayout mainForm = form;
    form = fieldsGroup;
    text("Vergi dairesi", "tax_office", 120, android.text.InputType.TYPE_CLASS_TEXT);
    text("Vergi numarası", "tax_number", 32, android.text.InputType.TYPE_CLASS_TEXT);
    form = mainForm;
    tax.setEnabled(!busy);
    tax.setOnClickListener(v -> {
      showTax = !showTax;
      fieldsGroup.setVisibility(showTax ? android.view.View.VISIBLE : android.view.View.GONE);
    });
    text("Başvuru notu (isteğe bağlı)", "message", 3000,
        android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    ui.label(form, "Belgeler (isteğe bağlı)", 17, ui.ink);
    ui.label(form, "PDF, JPG, PNG · En fazla 5 dosya, her biri 10 MB", 12, ui.muted);
    Spinner type = ui.selector(form, "Belge türü", Arrays.asList(LABELS),
        LABELS[Math.max(0, Arrays.asList(KINDS).indexOf(kind))],
        value -> kind = KINDS[Arrays.asList(LABELS).indexOf(value)]);
    type.setEnabled(!busy);
    button("Dosya seç",
        () -> picker.launch(new String[] {"application/pdf", "image/jpeg", "image/png"}));
    button("Kamera ile ekle", () -> {
      try {
        if (documents.size() >= 5)
          throw new IllegalArgumentException("En fazla 5 belge ekleyin.");
        File directory = new File(activity.getCacheDir(), "application-camera");
        if (!directory.exists() && !directory.mkdirs())
          throw new IOException();
        File file = File.createTempFile("belge-", ".jpg", directory);
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", file);
        cameraUri = uri.toString();
        camera.launch(uri);
      } catch (Exception error) {
        message = "Kamera açılamadı. Dosya seç ile belge ekleyebilirsiniz.";
        show();
      }
    });
    for (JSONObject doc : documents) {
      ui.label(form,
          LABELS[Math.max(0, Arrays.asList(KINDS).indexOf(doc.optString("kind")))] + " · "
              + doc.optString("name"),
          14, ui.ink);
      button("Kaldır", () -> {
        documents.remove(doc);
        show();
      });
    }
    progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
    progress.setMax(100);
    progress.setVisibility(busy ? android.view.View.VISIBLE : android.view.View.GONE);
    form.addView(progress);
    status = ui.label(form, message, 14, ui.danger);
    status.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
    button("Başvuruyu Gönder", this::submit);
  }
  private void add(Uri uri) {
    try (Cursor cursor = activity.getContentResolver().query(uri,
             new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
      if (documents.size() >= 5)
        throw new IllegalArgumentException("En fazla 5 belge ekleyin.");
      if (cursor == null || !cursor.moveToFirst())
        throw new IOException();
      String name = cursor.getString(0);
      long size = cursor.isNull(1) ? -1 : cursor.getLong(1);
      if (size < 1 || size > 10 * 1024 * 1024
          || !name.toLowerCase(Locale.ROOT).matches(".*\\.(pdf|jpe?g|png)$"))
        throw new IllegalArgumentException(
            "PDF, JPG veya PNG seçin. Her dosya en fazla 10 MB olabilir.");
      for (JSONObject doc : documents)
        if (doc.optString("uri").equals(uri.toString()))
          return;
      documents.add(new JSONObject()
              .put("uri", uri.toString())
              .put("name", name)
              .put("size", size)
              .put("kind", kind));
    } catch (Exception error) {
      message = error instanceof IllegalArgumentException
          ? error.getMessage()
          : "Belge okunamadı. Dosyayı yeniden seçin.";
    }
  }
  private void text(String label, String name, int max, int inputType) {
    EditText input = ui.field(form, label, fields.optString(name), inputType, max);
    input.setEnabled(!busy);
    input.addTextChangedListener(new TextWatcher() {
      public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      public void onTextChanged(CharSequence s, int start, int before, int count) {
        try {
          fields.put(name, s.toString());
        } catch (JSONException ignored) {
        }
      }
      public void afterTextChanged(Editable value) {}
    });
  }
  private Button button(String label, Runnable action) {
    Button button = ui.button(form, label, action, label.equals("Başvuruyu Gönder"));
    button.setEnabled(!busy);
    return button;
  }
  private void submit() {
    if (busy)
      return;
    try {
      for (String name :
          new String[] {"company_name", "authorized_person", "customer_phone", "email"})
        if (fields.optString(name).trim().isEmpty())
          throw new IllegalArgumentException(
              "Firma, yetkili, telefon ve e-posta alanlarını doldurun.");
      JSONObject payload = new JSONObject(fields.toString())
                               .put("customer_name", fields.optString("authorized_person"))
                               .put("request_type", "dealer_application")
                               .put("guest_count", "1");
      String nextIntent = base + fields.toString() + new JSONArray(documents).toString();
      if (!nextIntent.equals(intent) || key.isEmpty()) {
        key = UUID.randomUUID().toString();
        intent = nextIntent;
      }
      payload.put("idempotency_key", key);
      List<DealerApi.DocumentUpload> uploads = new ArrayList<>();
      for (JSONObject doc : documents) {
        Uri uri = Uri.parse(doc.getString("uri"));
        uploads.add(new DealerApi.DocumentUpload(doc.getString("name"), doc.getString("kind"),
            "application/octet-stream", doc.getLong("size"),
            () -> activity.getContentResolver().openInputStream(uri)));
      }
      busy = true;
      message = "Başvuru ve belgeler gönderiliyor…";
      show();
      network.execute(() -> {
        String result;
        try {
          JSONObject reply = new DealerApi(base).apply(
              payload, uploads, (sent, total) -> activity.runOnUiThread(() -> {
                if (progress != null)
                  progress.setProgress(total > 0 ? (int) (sent * 100 / total) : 0);
              }));
          if (reply.optString("request_id").isEmpty())
            throw new IOException();
          result = "";
        } catch (Exception error) {
          result = error instanceof DealerApi.Failure || error instanceof IllegalArgumentException
              ? error.getMessage()
              : "Yükleme tamamlanamadı. Aynı başvuruyu yeniden deneyin.";
        }
        final String error = result;
        activity.runOnUiThread(() -> {
          if (activity.isDestroyed())
            return;
          busy = false;
          if (error.isEmpty()) {
            key = "";
            intent = "";
            documents.clear();
            Iterator<String> keys = fields.keys();
            while (keys.hasNext()) {
              keys.next();
              keys.remove();
            }
            submitted = true;
            message = "Başvurunuz alındı. İşletmenin değerlendirmesi bekleniyor.";
          } else
            message = error;
          show();
        });
      });
    } catch (Exception error) {
      message = error.getMessage();
      show();
    }
  }
}
