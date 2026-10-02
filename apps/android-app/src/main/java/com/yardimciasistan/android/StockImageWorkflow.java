package com.yardimciasistan.android;

import android.app.Dialog;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.view.Window;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class StockImageWorkflow {
  interface Listener {
    OperationData currentData();
    void launchCamera();
    void launchGallery();
    void cleanupPendingCameraFile();
    void configureFullDialog(Dialog dialog);
    void sendAction(String actionType, JSONObject payload, String successMessage);
    void showError(String message);
  }

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final DeviceIdentity identity;
  private final StockImageAnalysisController analysisController;
  private final Listener listener;

  StockImageWorkflow(
      ComponentActivity activity,
      SharedPreferences preferences,
      DeviceIdentity identity,
      StockImageAnalysisController analysisController,
      Listener listener
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.identity = identity;
    this.analysisController = analysisController;
    this.listener = listener;
  }

  void showPreview(Uri sourceUri) {
    OperationData data = listener.currentData();
    if (!data.hasPermission("menu.stock_update") || !AndroidUiRules.canUseAi(data)) {
      listener.cleanupPendingCameraFile();
      listener.showError("Bu cihazda AI destekli stok girişi kullanılamıyor.");
      return;
    }

    Dialog dialog = new Dialog(activity);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
    LinearLayout root = UiKit.column(activity);
    root.setPadding(
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 14),
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 16)
    );
    root.setBackgroundColor(UiKit.BG);

    LinearLayout header = UiKit.row(activity);
    LinearLayout heading = UiKit.column(activity);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(activity, "AI DESTEKLİ STOK GİRİŞİ"));
    heading.addView(UiKit.title(activity, "Görseli kontrol et"));
    header.addView(heading);
    Button close = UiKit.iconButton(
        activity,
        "×",
        "Görsel ekranını kapat",
        false,
        view -> dialog.dismiss()
    );
    header.addView(
        close,
        new LinearLayout.LayoutParams(UiKit.dp(activity, 44), UiKit.dp(activity, 44))
    );
    root.addView(header);

    TextView status = UiKit.text(
        activity,
        "Görsel hazırlanıyor…",
        13,
        UiKit.MUTED,
        Typeface.BOLD
    );
    LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
    statusParams.setMargins(0, UiKit.dp(activity, 8), 0, UiKit.dp(activity, 8));
    status.setLayoutParams(statusParams);
    root.addView(status);

    ImageView preview = new ImageView(activity);
    preview.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
    preview.setAdjustViewBounds(true);
    preview.setBackground(UiKit.rounded(activity, UiKit.SURFACE, UiKit.BORDER, 14));
    preview.setContentDescription("Seçilen fatura veya fiş önizlemesi");
    LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(-1, 0, 1f);
    previewParams.setMargins(0, 0, 0, UiKit.dp(activity, 10));
    preview.setLayoutParams(previewParams);
    root.addView(preview);

    final StockImageFile.PreparedImage[] prepared = {null};
    final int[] rotation = {0};
    final boolean[] analyzing = {false};

    LinearLayout imageActions = UiKit.row(activity);
    Button retake = UiKit.outlineButton(activity, "Yeniden çek", view -> {
      dialog.dismiss();
      listener.launchCamera();
    });
    Button reselect = UiKit.outlineButton(activity, "Başka görsel seç", view -> {
      dialog.dismiss();
      listener.launchGallery();
    });
    Button rotate = UiKit.outlineButton(activity, "90° döndür", view -> {
      rotation[0] = (rotation[0] + 90) % 360;
      preview.setRotation(rotation[0]);
    });
    retake.setEnabled(false);
    reselect.setEnabled(false);
    rotate.setEnabled(false);
    UiKit.addAction(imageActions, retake, activity);
    UiKit.addAction(imageActions, reselect, activity);
    UiKit.addAction(imageActions, rotate, activity);
    root.addView(imageActions);

    TextView privacy = UiKit.text(
        activity,
        "Görsel analiz için işletmenin yapılandırdığı AI sağlayıcısına gönderilir; uygulamada kalıcı saklanmaz.",
        11,
        UiKit.MUTED,
        Typeface.NORMAL
    );
    LinearLayout.LayoutParams privacyParams = new LinearLayout.LayoutParams(-1, -2);
    privacyParams.setMargins(0, UiKit.dp(activity, 9), 0, UiKit.dp(activity, 9));
    privacy.setLayoutParams(privacyParams);
    root.addView(privacy);

    final Button[] analyze = {null};
    analyze[0] = UiKit.button(activity, "Analiz Et", UiKit.PRIMARY, view -> {
      if (prepared[0] == null || analyzing[0]) {
        return;
      }

      String baseUrl = ConnectionSettings.webModuleUrl(preferences);
      String syncSecret = ConnectionSettings.syncSecret(preferences);
      if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
        status.setText("Görsel analizi için bağlantı ayarlarını tamamlayın.");
        status.setTextColor(UiKit.DANGER);
        return;
      }

      OperationData currentData = listener.currentData();
      JSONArray candidates = stockImageCandidatesJson(currentData);
      if (candidates.length() == 0) {
        status.setText("Stok takip edilen menü ürünü bulunamadı.");
        status.setTextColor(UiKit.DANGER);
        return;
      }

      analyzing[0] = true;
      dialog.setCancelable(false);
      close.setEnabled(false);
      analyze[0].setEnabled(false);
      retake.setEnabled(false);
      reselect.setEnabled(false);
      rotate.setEnabled(false);
      status.setText("Görsel analiz ediliyor; stoklar henüz değişmiyor…");
      status.setTextColor(UiKit.INFO);

      String importId = "stock_import_android_"
          + UUID.randomUUID().toString().replace("-", "");
      StockImageFile.PreparedImage baseImage = prepared[0];

      analysisController.analyze(
          baseImage,
          rotation[0],
          baseUrl,
          syncSecret,
          identity,
          importId,
          candidates,
          new StockImageAnalysisController.AnalysisListener() {
            @Override
            public void onSuccess(HostingSyncClient.StockImageAnalysisResult result) {
              if (!dialog.isShowing()) {
                return;
              }
              boolean duplicate =
                  listener.currentData().appliedStockImageHashes.contains(result.imageHash);
              dialog.dismiss();
              showReview(result, duplicate);
            }

            @Override
            public void onError(String message) {
              if (!dialog.isShowing()) {
                return;
              }
              analyzing[0] = false;
              dialog.setCancelable(true);
              close.setEnabled(true);
              analyze[0].setEnabled(true);
              retake.setEnabled(true);
              reselect.setEnabled(true);
              rotate.setEnabled(true);
              status.setText(message);
              status.setTextColor(UiKit.DANGER);
            }
          }
      );
    });
    analyze[0].setEnabled(false);
    root.addView(analyze[0], new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 48)));

    dialog.setOnDismissListener(value -> {
      if (prepared[0] != null) {
        preview.setImageDrawable(null);
        prepared[0].release();
        prepared[0] = null;
      }
    });
    dialog.setContentView(root);
    dialog.show();
    listener.configureFullDialog(dialog);

    analysisController.prepare(
        sourceUri,
        new StockImageAnalysisController.PrepareListener() {
          @Override
          public void onReady(StockImageFile.PreparedImage ready) {
            listener.cleanupPendingCameraFile();
            if (!dialog.isShowing()) {
              ready.release();
              return;
            }
            prepared[0] = ready;
            preview.setImageBitmap(ready.preview);
            status.setText("Görsel hazır. Gerekirse döndürüp analizi başlatın.");
            status.setTextColor(UiKit.SUCCESS);
            analyze[0].setEnabled(true);
            retake.setEnabled(true);
            reselect.setEnabled(true);
            rotate.setEnabled(true);
          }

          @Override
          public void onError(String message) {
            listener.cleanupPendingCameraFile();
            if (!dialog.isShowing()) {
              return;
            }
            status.setText(message);
            status.setTextColor(UiKit.DANGER);
            retake.setEnabled(true);
            reselect.setEnabled(true);
          }
        }
    );
  }

  private JSONArray stockImageCandidatesJson(OperationData data) {
    JSONArray candidates = new JSONArray();
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      try {
        JSONObject candidate = new JSONObject();
        candidate.put("id", item.menuItemId);
        candidate.put("name", item.name);
        candidate.put("category", item.category);
        candidate.put("current_stock", item.stockQuantity);
        candidate.put("stock_unit", item.stockUnit);
        candidates.put(candidate);
      } catch (Exception ignored) {
        // Snapshot values are primitives; a malformed row is omitted safely.
      }
    }
    return candidates;
  }

  private void showReview(
      HostingSyncClient.StockImageAnalysisResult result,
      boolean duplicate
  ) {
    OperationData data = listener.currentData();
    List<ReviewLine> lines = parseReviewLines(result.analysis, data);

    Dialog dialog = new Dialog(activity);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
    LinearLayout root = UiKit.column(activity);
    root.setBackgroundColor(UiKit.BG);

    LinearLayout header = UiKit.row(activity);
    header.setPadding(
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 12),
        UiKit.dp(activity, 12),
        UiKit.dp(activity, 8)
    );
    LinearLayout heading = UiKit.column(activity);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(activity, "EŞLEŞMELERİ KONTROL ET"));
    heading.addView(UiKit.title(activity, "Stok taslağı"));
    header.addView(heading);
    header.addView(
        UiKit.iconButton(
            activity,
            "×",
            "Stok taslağını kapat",
            false,
            view -> dialog.dismiss()
        ),
        new LinearLayout.LayoutParams(UiKit.dp(activity, 44), UiKit.dp(activity, 44))
    );
    root.addView(header);

    LinearLayout content = UiKit.column(activity);
    JSONObject document = result.analysis.optJSONObject("document");
    LinearLayout documentCard = UiKit.card(activity);
    documentCard.addView(UiKit.text(
        activity,
        "Belge bilgisi",
        15,
        UiKit.TEXT,
        Typeface.BOLD
    ));
    documentCard.addView(UiKit.text(
        activity,
        "Tedarikçi: " + documentValue(document, "supplier_name")
            + "\nBelge no: " + documentValue(document, "invoice_number")
            + " · Tarih: " + documentValue(document, "invoice_date"),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));
    content.addView(documentCard);

    TextView analysisMessage = UiKit.text(
        activity,
        result.message,
        12,
        UiKit.INFO,
        Typeface.BOLD
    );
    LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(-1, -2);
    messageParams.setMargins(0, 0, 0, UiKit.dp(activity, 9));
    analysisMessage.setLayoutParams(messageParams);
    content.addView(analysisMessage);

    CheckBox duplicateApproval = new CheckBox(activity);
    duplicateApproval.setTextColor(UiKit.WARNING);
    duplicateApproval.setTextSize(12);
    duplicateApproval.setVisibility(duplicate ? View.VISIBLE : View.GONE);
    boolean canOverrideDuplicate = "admin".equals(data.deviceRole);
    if (duplicate) {
      duplicateApproval.setText(
          canOverrideDuplicate
              ? "Bu görsel daha önce kullanılmış olabilir. Yönetici olarak yine de uygulamak istiyorum."
              : "Bu görsel daha önce kullanılmış olabilir. Yeniden uygulamak için yönetici gerekir."
      );
      duplicateApproval.setEnabled(canOverrideDuplicate);
      LinearLayout.LayoutParams duplicateParams =
          new LinearLayout.LayoutParams(-1, -2);
      duplicateParams.setMargins(0, 0, 0, UiKit.dp(activity, 10));
      duplicateApproval.setLayoutParams(duplicateParams);
      content.addView(duplicateApproval);
    }

    content.addView(UiKit.sectionTitle(activity, "Okunan satırlar"));
    TextView summary = UiKit.text(activity, "", 13, UiKit.TEXT, Typeface.BOLD);
    Button apply = UiKit.button(
        activity,
        "Stokları Güncelle",
        UiKit.PRIMARY,
        view -> {}
    );
    final Runnable[] refreshSummary = {null};

    if (lines.isEmpty()) {
      content.addView(emptyCard(
          "Eşleşen satır bulunamadı",
          "Görseli yeniden deneyin veya mevcut manuel stok güncelleme düğmelerini kullanın."
      ));
    }
    for (ReviewLine line : lines) {
      content.addView(reviewCard(line, refreshSummary));
    }

    ScrollView scroll = UiKit.scroll(activity, content, 18);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    root.addView(scroll);

    LinearLayout bottom = UiKit.column(activity);
    bottom.setPadding(
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 10),
        UiKit.dp(activity, 16),
        UiKit.dp(activity, 14)
    );
    bottom.setBackground(UiKit.rounded(
        activity,
        UiKit.SURFACE_ALT,
        UiKit.BORDER,
        0
    ));
    bottom.addView(summary);

    LinearLayout bottomActions = UiKit.row(activity);
    LinearLayout.LayoutParams bottomActionsParams =
        new LinearLayout.LayoutParams(-1, -2);
    bottomActionsParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    bottomActions.setLayoutParams(bottomActionsParams);
    UiKit.addAction(
        bottomActions,
        UiKit.outlineButton(activity, "Vazgeç", view -> dialog.dismiss()),
        activity
    );
    UiKit.addAction(bottomActions, apply, activity);
    bottom.addView(bottomActions);
    root.addView(bottom);

    refreshSummary[0] = () -> {
      int valid = 0;
      int pieceTotal = 0;
      int gramTotal = 0;
      int review = 0;
      OperationData currentData = listener.currentData();

      for (ReviewLine line : lines) {
        if (line.ignored) {
          continue;
        }
        int quantity = line.quantity();
        if (!line.menuItemId.isEmpty() && quantity > 0) {
          valid += 1;
          OperationData.TrackedStockItem item =
              trackedStockItem(currentData, line.menuItemId);
          if (item != null && "gram".equals(item.stockUnit)) {
            gramTotal += quantity;
          } else {
            pieceTotal += quantity;
          }
        } else {
          review += 1;
        }
      }

      String totals = (pieceTotal > 0 ? pieceTotal + " adet" : "")
          + (pieceTotal > 0 && gramTotal > 0 ? " + " : "")
          + (gramTotal > 0 ? stockNumber(gramTotal) + " g" : "");
      summary.setText(
          valid + " satır · "
              + (totals.isEmpty() ? "0" : totals)
              + " · "
              + review
              + " kontrol gerekli"
      );
      apply.setEnabled(
          valid > 0
              && (!duplicate || (canOverrideDuplicate && duplicateApproval.isChecked()))
      );
    };

    duplicateApproval.setOnCheckedChangeListener(
        (button, checked) -> refreshSummary[0].run()
    );
    apply.setOnClickListener(view -> {
      JSONArray approvedLines = new JSONArray();
      for (ReviewLine line : lines) {
        int quantity = line.quantity();
        if (line.ignored || line.menuItemId.isEmpty() || quantity <= 0) {
          continue;
        }
        try {
          JSONObject approved = new JSONObject();
          approved.put("menu_item_id", line.menuItemId);
          approved.put("quantity", quantity);
          approved.put("raw_text", line.rawText);
          approved.put("confidence", line.confidence);
          approvedLines.put(approved);
        } catch (Exception ignored) {
          // Primitive review values are safe; an unencodable row is not applied.
        }
      }

      if (approvedLines.length() == 0) {
        Toast.makeText(
            activity,
            "Miktarlar kontrol edilmeli.",
            Toast.LENGTH_SHORT
        ).show();
        return;
      }

      JSONObject actionPayload = new JSONObject();
      try {
        actionPayload.put("import_id", result.importId);
        actionPayload.put("image_hash", result.imageHash);
        actionPayload.put(
            "duplicate_warning_acknowledged",
            duplicate && duplicateApproval.isChecked()
        );
        actionPayload.put("lines", approvedLines);
      } catch (Exception ignored) {
        listener.showError("Stok güncelleme isteği hazırlanamadı.");
        return;
      }

      dialog.dismiss();
      listener.sendAction(
          "menu_stock_image_import_apply",
          actionPayload,
          "Onaylanan stok girişi action queue üzerinden masaüstüne gönderildi."
      );
    });

    refreshSummary[0].run();

    dialog.setContentView(root);
    dialog.show();
    listener.configureFullDialog(dialog);
  }

  private View reviewCard(ReviewLine line, Runnable[] refreshSummary) {
    OperationData data = listener.currentData();
    LinearLayout card = UiKit.card(activity);

    TextView raw = UiKit.text(
        activity,
        line.rawText,
        14,
        UiKit.TEXT,
        Typeface.BOLD
    );
    card.addView(raw);

    if (!line.reason.isEmpty()) {
      TextView reason = UiKit.text(
          activity,
          line.reason,
          11,
          UiKit.WARNING,
          Typeface.NORMAL
      );
      LinearLayout.LayoutParams reasonParams =
          new LinearLayout.LayoutParams(-1, -2);
      reasonParams.setMargins(
          0,
          UiKit.dp(activity, 3),
          0,
          UiKit.dp(activity, 7)
      );
      reason.setLayoutParams(reasonParams);
      card.addView(reason);
    }

    card.addView(UiKit.text(
        activity,
        "Menü karşılığı",
        11,
        UiKit.MUTED,
        Typeface.BOLD
    ));

    ArrayList<String> labels = new ArrayList<>();
    labels.add("Eşleşme yok");
    int selectedIndex = 0;
    for (int index = 0; index < data.trackedStockItems.size(); index += 1) {
      OperationData.TrackedStockItem item = data.trackedStockItems.get(index);
      labels.add(
          item.name
              + " · "
              + item.category
              + " · "
              + stockUnitLabel(item.stockUnit)
      );
      if (item.menuItemId.equals(line.menuItemId)) {
        selectedIndex = index + 1;
      }
    }

    Spinner itemSelect = new Spinner(activity);
    ArrayAdapter<String> adapter = new ArrayAdapter<>(
        activity,
        android.R.layout.simple_spinner_item,
        labels
    );
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    itemSelect.setAdapter(adapter);
    itemSelect.setSelection(selectedIndex);
    itemSelect.setBackground(UiKit.rounded(
        activity,
        UiKit.SURFACE,
        UiKit.BORDER,
        10
    ));
    itemSelect.setPadding(UiKit.dp(activity, 8), 0, UiKit.dp(activity, 8), 0);
    itemSelect.setLayoutParams(
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 48))
    );
    itemSelect.setOnItemSelectedListener(
        new android.widget.AdapterView.OnItemSelectedListener() {
          @Override
          public void onItemSelected(
              android.widget.AdapterView<?> parent,
              View view,
              int position,
              long id
          ) {
            OperationData currentData = listener.currentData();
            line.menuItemId = position <= 0
                ? ""
                : currentData.trackedStockItems.get(position - 1).menuItemId;
            if (refreshSummary[0] != null) {
              refreshSummary[0].run();
            }
          }

          @Override
          public void onNothingSelected(android.widget.AdapterView<?> parent) {
            line.menuItemId = "";
            if (refreshSummary[0] != null) {
              refreshSummary[0].run();
            }
          }
        }
    );
    card.addView(itemSelect);

    LinearLayout quantityRow = UiKit.row(activity);
    LinearLayout.LayoutParams quantityRowParams =
        new LinearLayout.LayoutParams(-1, -2);
    quantityRowParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    quantityRow.setLayoutParams(quantityRowParams);

    EditText quantity = UiKit.input(activity, "Eklenecek miktar");
    quantity.setInputType(InputType.TYPE_CLASS_NUMBER);
    quantity.setText(line.quantityText);
    quantity.setLayoutParams(
        new LinearLayout.LayoutParams(0, UiKit.dp(activity, 48), 1f)
    );
    quantity.addTextChangedListener(new TextWatcher() {
      @Override
      public void beforeTextChanged(
          CharSequence value,
          int start,
          int count,
          int after
      ) {}

      @Override
      public void onTextChanged(
          CharSequence value,
          int start,
          int before,
          int count
      ) {
        line.quantityText = value == null ? "" : value.toString();
        if (refreshSummary[0] != null) {
          refreshSummary[0].run();
        }
      }

      @Override
      public void afterTextChanged(Editable value) {}
    });
    quantityRow.addView(quantity);

    TextView confidence = UiKit.badge(
        activity,
        confidenceLabel(line.confidence),
        confidenceTone(line.confidence)
    );
    LinearLayout.LayoutParams confidenceParams =
        new LinearLayout.LayoutParams(-2, -2);
    confidenceParams.setMargins(UiKit.dp(activity, 8), 0, 0, 0);
    confidence.setLayoutParams(confidenceParams);
    quantityRow.addView(confidence);
    card.addView(quantityRow);

    Button remove = UiKit.outlineButton(activity, "Kaldır", view -> {
      line.ignored = !line.ignored;
      itemSelect.setEnabled(!line.ignored);
      quantity.setEnabled(!line.ignored);
      raw.setAlpha(line.ignored ? 0.5f : 1f);
      ((Button) view).setText(line.ignored ? "Geri al" : "Kaldır");
      if (refreshSummary[0] != null) {
        refreshSummary[0].run();
      }
    });
    LinearLayout.LayoutParams removeParams =
        new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 42));
    removeParams.setMargins(0, UiKit.dp(activity, 8), 0, 0);
    remove.setLayoutParams(removeParams);
    card.addView(remove);
    return card;
  }

  private List<ReviewLine> parseReviewLines(
      JSONObject analysis,
      OperationData data
  ) {
    ArrayList<ReviewLine> lines = new ArrayList<>();
    JSONArray sourceLines = analysis.optJSONArray("lines");
    if (sourceLines == null) {
      return lines;
    }

    for (int index = 0; index < sourceLines.length() && lines.size() < 200; index += 1) {
      JSONObject source = sourceLines.optJSONObject(index);
      if (source == null) {
        continue;
      }

      String rawText = source.optString("raw_text", "").trim();
      if (rawText.isEmpty()) {
        continue;
      }

      String menuItemId = source.optString("matched_menu_item_id", "").trim();
      if (!isTrackedStockItem(data, menuItemId)) {
        menuItemId = "";
      }

      String quantity = "";
      Object suggested = source.opt("suggested_quantity");
      if (suggested instanceof Number) {
        double value = ((Number) suggested).doubleValue();
        if (value == Math.rint(value) && value > 0 && value <= 100000) {
          quantity = String.valueOf((int) value);
        }
      }

      String confidence = source.optString("confidence", "low");
      if (!"high".equals(confidence) && !"medium".equals(confidence)) {
        confidence = "low";
      }

      lines.add(new ReviewLine(
          rawText,
          menuItemId,
          quantity,
          confidence,
          source.optString("needs_review_reason", "").trim()
      ));
    }
    return lines;
  }

  private boolean isTrackedStockItem(OperationData data, String menuItemId) {
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if (item.menuItemId.equals(menuItemId)) {
        return true;
      }
    }
    return false;
  }

  private OperationData.TrackedStockItem trackedStockItem(
      OperationData data,
      String menuItemId
  ) {
    for (OperationData.TrackedStockItem item : data.trackedStockItems) {
      if (item.menuItemId.equals(menuItemId)) {
        return item;
      }
    }
    return null;
  }

  private String documentValue(JSONObject document, String field) {
    if (document == null) {
      return "Okunamadı";
    }
    String value = document.optString(field, "").trim();
    return value.isEmpty() ? "Okunamadı" : value;
  }

  private String confidenceLabel(String confidence) {
    if ("high".equals(confidence)) return "Yüksek";
    if ("medium".equals(confidence)) return "Orta";
    return "Düşük";
  }

  private int confidenceTone(String confidence) {
    if ("high".equals(confidence)) return UiKit.SUCCESS;
    if ("medium".equals(confidence)) return UiKit.WARNING;
    return UiKit.DANGER;
  }

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(
        activity,
        title,
        14,
        UiKit.TEXT,
        Typeface.BOLD
    ));
    card.addView(UiKit.text(
        activity,
        detail,
        12,
        UiKit.SECONDARY,
        Typeface.NORMAL
    ));
    return card;
  }

  private static final class ReviewLine {
    final String rawText;
    String menuItemId;
    String quantityText;
    final String confidence;
    final String reason;
    boolean ignored;

    ReviewLine(
        String rawText,
        String menuItemId,
        String quantityText,
        String confidence,
        String reason
    ) {
      this.rawText = rawText;
      this.menuItemId = menuItemId;
      this.quantityText = quantityText;
      this.confidence = confidence;
      this.reason = reason;
    }

    int quantity() {
      try {
        int value = Integer.parseInt(quantityText.trim());
        return value > 0 && value <= 100000 ? value : 0;
      } catch (Exception ignored) {
        return 0;
      }
    }
  }
}
