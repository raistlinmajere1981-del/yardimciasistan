package com.yardimciasistan.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
  private static final int BG = Color.rgb(255, 248, 238);
  private static final int PAPER = Color.WHITE;
  private static final int INK = Color.rgb(23, 32, 51);
  private static final int MUTED = Color.rgb(102, 112, 133);
  private static final int LINE = Color.rgb(222, 216, 206);
  private static final int PRIMARY = Color.rgb(47, 111, 94);
  private static final int ACCENT = Color.rgb(228, 120, 99);
  private static final String PREFS_NAME = "yardimci_asistan_android";
  private static final String KEY_WEB_MODULE_URL = "web_module_url";
  private static final String DEFAULT_WEB_MODULE_URL = "https://yardimciasistan.alwaysdata.net/yardimci-asistan";
  private static final String KEY_SYNC_SECRET = "sync_secret";
  private static final String DEMO_PHONE = "+905321234567";
  private static final String DEMO_WHATSAPP = "905321234567";
  private static final String DEMO_REPLY = "Merhaba, talebiniz için teşekkür ederiz. Müsaitlik ve detayları kontrol edip size dönüş yapacağız.";

  private EditText webModuleUrlInput;
  private EditText syncSecretInput;
  private TextView connectionStatusView;
  private Button syncButton;
  private TextView newRequestsValue;
  private TextView newRequestsDetail;
  private TextView totalRequestsValue;
  private TextView totalRequestsDetail;
  private TextView pendingRequestsValue;
  private TextView pendingRequestsDetail;
  private TextView syncedRequestsValue;
  private TextView syncedRequestsDetail;
  private TextView latestPullValue;
  private TextView latestPullDetail;
  private TextView dailyTasksValue;
  private TextView dailyTasksDetail;
  private TextView availableRoomsValue;
  private TextView availableRoomsDetail;
  private TextView availableTablesValue;
  private TextView availableTablesDetail;
  private TextView pendingApprovalsValue;
  private TextView pendingApprovalsDetail;
  private TextView dailyTaskListStatusView;
  private LinearLayout dailyTaskListContainer;
  private TextView requestBadgeView;
  private TextView requestNameView;
  private TextView requestMetaView;
  private TextView requestNoteView;
  private TextView requestListStatusView;
  private LinearLayout requestListContainer;
  private Button callButton;
  private Button whatsappButton;
  private Button approveButton;
  private Button rejectButton;
  private Button answeredButton;
  private final ArrayList<AndroidRequest> currentRequests = new ArrayList<>();
  private final ArrayList<AndroidTask> currentDailyTasks = new ArrayList<>();
  private String selectedRequestId = "";
  private String currentPhone = DEMO_PHONE;
  private String currentWhatsapp = DEMO_WHATSAPP;
  private String currentWhatsAppMessage = DEMO_REPLY;
  private int currentPendingDailyTasks = 0;
  private int currentAvailableRooms = 0;
  private int currentTotalRooms = 0;
  private int currentAvailableTables = 0;
  private int currentPendingReservations = 0;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    ScrollView scrollView = new ScrollView(this);
    scrollView.setFillViewport(true);
    scrollView.setBackgroundColor(BG);

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(dp(18), dp(20), dp(18), dp(24));
    scrollView.addView(root, new ScrollView.LayoutParams(
        ScrollView.LayoutParams.MATCH_PARENT,
        ScrollView.LayoutParams.WRAP_CONTENT
    ));

    root.addView(brandHeader());
    root.addView(sectionTitle("Bugün Ne Var?", "Ana Ekran", "Telefondan hızlı takip ve müşteri dönüşleri."));
    root.addView(connectionCard());
    root.addView(statusGrid());
    root.addView(operationGrid());
    root.addView(dailyTaskCard());
    root.addView(requestListCard());
    root.addView(requestCard());
    root.addView(infoCard());

    setContentView(scrollView);
    loadConnectionSettings();
    applyDemoSnapshot();
    maybeAutoSync();
  }

  private View brandHeader() {
    LinearLayout header = new LinearLayout(this);
    header.setOrientation(LinearLayout.HORIZONTAL);
    header.setGravity(Gravity.CENTER_VERTICAL);
    header.setPadding(0, 0, 0, dp(18));

    ImageView mark = new ImageView(this);
    mark.setImageResource(R.mipmap.ic_launcher);
    mark.setScaleType(ImageView.ScaleType.FIT_CENTER);
    LinearLayout.LayoutParams markParams = new LinearLayout.LayoutParams(dp(52), dp(52));
    header.addView(mark, markParams);

    LinearLayout copy = new LinearLayout(this);
    copy.setOrientation(LinearLayout.VERTICAL);
    copy.setPadding(dp(12), 0, 0, 0);
    copy.addView(text("Yardımcı Asistan", 20, INK, Typeface.BOLD));
    copy.addView(text("İşletme companion", 14, MUTED, Typeface.NORMAL));
    header.addView(copy, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

    return header;
  }

  private View sectionTitle(String eyebrow, String title, String summary) {
    LinearLayout block = new LinearLayout(this);
    block.setOrientation(LinearLayout.VERTICAL);
    block.setPadding(0, 0, 0, dp(16));
    block.addView(text(eyebrow, 12, ACCENT, Typeface.BOLD));
    block.addView(text(title, 34, INK, Typeface.BOLD));
    TextView body = text(summary, 16, MUTED, Typeface.NORMAL);
    body.setPadding(0, dp(4), 0, 0);
    block.addView(body);
    return block;
  }

  private View connectionCard() {
    LinearLayout card = card();
    card.setPadding(dp(16), dp(16), dp(16), dp(16));
    card.addView(text("Bağlantı", 12, ACCENT, Typeface.BOLD));
    TextView title = text("Firma web modülünden canlı özet", 20, INK, Typeface.BOLD);
    title.setPadding(0, dp(8), 0, dp(8));
    card.addView(title);

    webModuleUrlInput = input(DEFAULT_WEB_MODULE_URL, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
    syncSecretInput = input("Sync güvenlik anahtarı", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
    card.addView(labelWithInput("Web modül adresi", webModuleUrlInput));
    card.addView(labelWithInput("Sync anahtarı", syncSecretInput));

    syncButton = commandButton("Canlı Veriyi Çek", new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        saveConnectionSettings();
        syncFromHosting();
      }
    });
    LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        dp(52)
    );
    buttonParams.setMargins(0, dp(10), 0, 0);
    syncButton.setLayoutParams(buttonParams);
    card.addView(syncButton);

    connectionStatusView = text("Bağlantı bilgisi girilirse hosting üzerinden canlı talepler okunur.", 14, MUTED, Typeface.NORMAL);
    connectionStatusView.setPadding(0, dp(10), 0, 0);
    card.addView(connectionStatusView);

    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    );
    params.setMargins(0, 0, 0, dp(14));
    card.setLayoutParams(params);
    return card;
  }

  private View statusGrid() {
    GridLayout grid = new GridLayout(this);
    grid.setColumnCount(2);
    grid.setUseDefaultMargins(false);
    grid.setPadding(0, 0, 0, dp(14));

    LinearLayout newCard = metricCard("Yeni Talepler", "3", "Dönüş bekliyor");
    newRequestsValue = (TextView) newCard.getChildAt(1);
    newRequestsDetail = (TextView) newCard.getChildAt(2);
    grid.addView(newCard);

    LinearLayout totalCard = metricCard("Toplam Web Kaydı", "3", "Son talepler");
    totalRequestsValue = (TextView) totalCard.getChildAt(1);
    totalRequestsDetail = (TextView) totalCard.getChildAt(2);
    grid.addView(totalCard);

    LinearLayout pendingCard = metricCard("Bekleyenler", "3", "Takip edilecek");
    pendingRequestsValue = (TextView) pendingCard.getChildAt(1);
    pendingRequestsDetail = (TextView) pendingCard.getChildAt(2);
    grid.addView(pendingCard);

    LinearLayout syncedCard = metricCard("PC'ye Aktarılan", "0", "Senkron kaydı");
    syncedRequestsValue = (TextView) syncedCard.getChildAt(1);
    syncedRequestsDetail = (TextView) syncedCard.getChildAt(2);
    grid.addView(syncedCard);

    LinearLayout pullCard = metricCard("Son Kontrol", "Demo", "Canlı veri bekliyor");
    latestPullValue = (TextView) pullCard.getChildAt(1);
    latestPullDetail = (TextView) pullCard.getChildAt(2);
    grid.addView(pullCard);

    return grid;
  }

  private View operationGrid() {
    GridLayout grid = new GridLayout(this);
    grid.setColumnCount(2);
    grid.setUseDefaultMargins(false);
    grid.setPadding(0, 0, 0, dp(14));

    LinearLayout tasksCard = metricCard("Bugünkü İşler", "0", "PC özeti bekliyor");
    dailyTasksValue = (TextView) tasksCard.getChildAt(1);
    dailyTasksDetail = (TextView) tasksCard.getChildAt(2);
    grid.addView(tasksCard);

    LinearLayout roomsCard = metricCard("Boş Odalar", "0", "PC özeti bekliyor");
    availableRoomsValue = (TextView) roomsCard.getChildAt(1);
    availableRoomsDetail = (TextView) roomsCard.getChildAt(2);
    grid.addView(roomsCard);

    LinearLayout tablesCard = metricCard("Boş Masalar", "0", "PC özeti bekliyor");
    availableTablesValue = (TextView) tablesCard.getChildAt(1);
    availableTablesDetail = (TextView) tablesCard.getChildAt(2);
    grid.addView(tablesCard);

    LinearLayout approvalsCard = metricCard("Bekleyen Onay", "0", "Rezervasyon kararı");
    pendingApprovalsValue = (TextView) approvalsCard.getChildAt(1);
    pendingApprovalsDetail = (TextView) approvalsCard.getChildAt(2);
    grid.addView(approvalsCard);

    return grid;
  }

  private View dailyTaskCard() {
    LinearLayout card = card();
    card.setPadding(dp(16), dp(16), dp(16), dp(16));
    card.addView(text("Günlük İşler", 12, ACCENT, Typeface.BOLD));
    TextView title = text("PC'den yayınlanan operasyon listesi", 20, INK, Typeface.BOLD);
    title.setPadding(0, dp(8), 0, dp(4));
    card.addView(title);
    dailyTaskListStatusView = text("Android özeti bekleniyor", 14, MUTED, Typeface.NORMAL);
    dailyTaskListStatusView.setPadding(0, 0, 0, dp(10));
    card.addView(dailyTaskListStatusView);

    dailyTaskListContainer = new LinearLayout(this);
    dailyTaskListContainer.setOrientation(LinearLayout.VERTICAL);
    card.addView(dailyTaskListContainer);

    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    );
    params.setMargins(0, 0, 0, dp(14));
    card.setLayoutParams(params);
    return card;
  }

  private LinearLayout metricCard(String title, String value, String detail) {
    LinearLayout card = card();
    card.setMinimumHeight(dp(118));
    card.addView(text(title, 14, MUTED, Typeface.BOLD));
    TextView valueView = text(value, 28, INK, Typeface.BOLD);
    valueView.setPadding(0, dp(4), 0, dp(3));
    card.addView(valueView);
    card.addView(text(detail, 14, MUTED, Typeface.NORMAL));

    GridLayout.LayoutParams params = new GridLayout.LayoutParams();
    params.width = 0;
    params.height = GridLayout.LayoutParams.WRAP_CONTENT;
    params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
    params.setMargins(0, 0, dp(10), dp(10));
    card.setLayoutParams(params);
    return card;
  }

  private View requestListCard() {
    LinearLayout card = card();
    card.setPadding(dp(16), dp(16), dp(16), dp(16));
    card.addView(text("Talep Listesi", 12, ACCENT, Typeface.BOLD));
    TextView title = text("Canlı müşteri talepleri", 20, INK, Typeface.BOLD);
    title.setPadding(0, dp(8), 0, dp(4));
    card.addView(title);
    requestListStatusView = text("Demo kayıtları", 14, MUTED, Typeface.NORMAL);
    requestListStatusView.setPadding(0, 0, 0, dp(10));
    card.addView(requestListStatusView);

    requestListContainer = new LinearLayout(this);
    requestListContainer.setOrientation(LinearLayout.VERTICAL);
    card.addView(requestListContainer);

    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    );
    params.setMargins(0, 0, 0, dp(14));
    card.setLayoutParams(params);
    return card;
  }

  private View requestCard() {
    LinearLayout card = card();
    card.setPadding(dp(16), dp(16), dp(16), dp(16));
    requestBadgeView = text("Yeni Talep", 12, ACCENT, Typeface.BOLD);
    card.addView(requestBadgeView);
    requestNameView = text("Demo Misafir", 22, INK, Typeface.BOLD);
    requestNameView.setPadding(0, dp(8), 0, dp(4));
    card.addView(requestNameView);
    requestMetaView = text("Pansiyon rezervasyonu • 12-14 Temmuz • 3 kişi", 14, MUTED, Typeface.NORMAL);
    card.addView(requestMetaView);
    requestNoteView = text("Balkonlu oda varsa bilgi almak istiyorum.", 15, INK, Typeface.NORMAL);
    requestNoteView.setPadding(0, dp(12), 0, dp(12));
    card.addView(requestNoteView);

    LinearLayout actions = new LinearLayout(this);
    actions.setOrientation(LinearLayout.HORIZONTAL);
    actions.setGravity(Gravity.CENTER_VERTICAL);
    callButton = commandButton("Ara", new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        openDialer();
      }
    });
    actions.addView(callButton);
    whatsappButton = commandButton("WhatsApp", new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        openWhatsApp();
      }
    });
    actions.addView(whatsappButton);
    card.addView(actions);

    LinearLayout secondary = new LinearLayout(this);
    secondary.setOrientation(LinearLayout.HORIZONTAL);
    secondary.setGravity(Gravity.CENTER_VERTICAL);
    secondary.setPadding(0, dp(8), 0, 0);
    approveButton = outlineButton("Onayla", new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        updateSelectedRequestStatus("approved", "Talep onaylandı.");
      }
    });
    secondary.addView(approveButton);
    rejectButton = outlineButton("Reddet", new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        updateSelectedRequestStatus("rejected", "Talep reddedildi.");
      }
    });
    secondary.addView(rejectButton);
    answeredButton = outlineButton("Cevaplandı", new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        updateSelectedRequestStatus("answered", "Talep cevaplandı.");
      }
    });
    secondary.addView(answeredButton);
    card.addView(secondary);

    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    );
    params.setMargins(0, 0, 0, dp(14));
    card.setLayoutParams(params);
    return card;
  }

  private View infoCard() {
    LinearLayout card = card();
    card.addView(text("Bağlantı Modu", 12, ACCENT, Typeface.BOLD));
    TextView title = text("Hosting üzerinden sınırlı takip", 20, INK, Typeface.BOLD);
    title.setPadding(0, dp(8), 0, dp(6));
    card.addView(title);
    card.addView(text("Telefon sadece firma web modülünden özet ve yeni talepleri okur. QR menü düzenleme ve detay yönetimi masaüstü uygulamada kalır.", 15, MUTED, Typeface.NORMAL));
    return card;
  }

  private LinearLayout card() {
    LinearLayout card = new LinearLayout(this);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setPadding(dp(14), dp(14), dp(14), dp(14));
    card.setBackground(round(PAPER, LINE, 8));
    return card;
  }

  private View labelWithInput(String label, EditText input) {
    LinearLayout group = new LinearLayout(this);
    group.setOrientation(LinearLayout.VERTICAL);
    group.setPadding(0, dp(8), 0, 0);
    group.addView(text(label, 13, INK, Typeface.BOLD));
    group.addView(input);
    return group;
  }

  private EditText input(String hint, int inputType) {
    EditText input = new EditText(this);
    input.setSingleLine(true);
    input.setTextColor(INK);
    input.setHintTextColor(MUTED);
    input.setTextSize(15);
    input.setHint(hint);
    input.setInputType(inputType);
    input.setPadding(dp(12), 0, dp(12), 0);
    input.setBackground(round(Color.rgb(255, 253, 248), LINE, 8));
    input.setMinHeight(dp(48));
    return input;
  }

  private Button commandButton(String label, View.OnClickListener listener) {
    Button button = new Button(this);
    button.setText(label);
    button.setTextColor(Color.WHITE);
    button.setTextSize(15);
    button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    button.setAllCaps(false);
    button.setMinHeight(dp(52));
    button.setBackground(round(PRIMARY, PRIMARY, 8));
    button.setOnClickListener(listener);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(52), 1);
    params.setMargins(0, 0, dp(8), 0);
    button.setLayoutParams(params);
    return button;
  }

  private Button outlineButton(String label, View.OnClickListener listener) {
    Button button = new Button(this);
    button.setText(label);
    button.setTextColor(INK);
    button.setTextSize(13);
    button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    button.setAllCaps(false);
    button.setSingleLine(true);
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setPadding(dp(4), 0, dp(4), 0);
    button.setMinHeight(dp(48));
    button.setBackground(round(BG, LINE, 8));
    button.setOnClickListener(listener);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1);
    params.setMargins(0, 0, dp(8), 0);
    button.setLayoutParams(params);
    return button;
  }

  private void loadConnectionSettings() {
    SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    String extraUrl = getIntent().getStringExtra("ya_web_module_url");
    String extraSecret = getIntent().getStringExtra("ya_sync_secret");
    boolean hasExtraUrl = extraUrl != null && extraUrl.trim().length() > 0;
    boolean hasExtraSecret = extraSecret != null && extraSecret.trim().length() > 0;
    webModuleUrlInput.setText(hasExtraUrl ? extraUrl.trim() : preferences.getString(KEY_WEB_MODULE_URL, DEFAULT_WEB_MODULE_URL));
    syncSecretInput.setText(hasExtraSecret ? extraSecret.trim() : preferences.getString(KEY_SYNC_SECRET, ""));

    if (hasExtraUrl || hasExtraSecret) {
      saveConnectionSettings();
    }
  }

  private void saveConnectionSettings() {
    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        .edit()
        .putString(KEY_WEB_MODULE_URL, webModuleUrlInput.getText().toString().trim())
        .putString(KEY_SYNC_SECRET, syncSecretInput.getText().toString().trim())
        .apply();
  }

  private void maybeAutoSync() {
    if (hasConnectionSettings()) {
      syncFromHosting();
    }
  }

  private boolean hasConnectionSettings() {
    return webModuleUrlInput.getText().toString().trim().startsWith("http")
        && syncSecretInput.getText().toString().trim().length() > 0;
  }

  private void syncFromHosting() {
    final String baseUrl = webModuleUrlInput.getText().toString().trim();
    final String syncSecret = syncSecretInput.getText().toString().trim();
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      setConnectionStatus("Web modül adresi http veya https ile başlamalı.", true);
      return;
    }

    if (syncSecret.length() == 0) {
      setConnectionStatus("Sync anahtarı gerekli.", true);
      return;
    }

    setLoading(true);
    setConnectionStatus("Hosting üzerinden canlı veri alınıyor...", false);

    new Thread(new Runnable() {
      @Override
      public void run() {
        try {
          final AndroidSummary summary = fetchAndroidSummary(baseUrl, syncSecret);
          runOnUiThread(new Runnable() {
            @Override
            public void run() {
              applyAndroidSummary(summary);
              setConnectionStatus("Canlı veri alındı: " + summary.pulledAt, false);
              setLoading(false);
            }
          });
        } catch (final Exception error) {
          runOnUiThread(new Runnable() {
            @Override
            public void run() {
              setConnectionStatus(error.getMessage() != null ? error.getMessage() : "Canlı veri alınamadı.", true);
              setLoading(false);
            }
          });
        }
      }
    }).start();
  }

  private AndroidSummary fetchAndroidSummary(String baseUrl, String syncSecret) throws Exception {
    JSONObject payload = new JSONObject();
    payload.put("action", "android_summary");
    payload.put("sync_secret", syncSecret);
    payload.put("limit", 10);

    JSONObject response = postSyncPayload(baseUrl, syncSecret, payload);
    JSONObject summaryJson = response.optJSONObject("summary");
    JSONObject operationsJson = response.optJSONObject("operations");
    JSONArray requestsJson = response.optJSONArray("requests");
    JSONArray tasksJson = response.optJSONArray("daily_tasks");
    ArrayList<AndroidRequest> requests = new ArrayList<>();
    if (requestsJson != null) {
      for (int index = 0; index < requestsJson.length(); index += 1) {
        AndroidRequest request = AndroidRequest.fromJson(requestsJson.optJSONObject(index));
        if (request != null) {
          requests.add(request);
        }
      }
    }
    ArrayList<AndroidTask> dailyTasks = new ArrayList<>();
    if (tasksJson != null) {
      for (int index = 0; index < tasksJson.length(); index += 1) {
        AndroidTask task = AndroidTask.fromJson(tasksJson.optJSONObject(index));
        if (task != null) {
          dailyTasks.add(task);
        }
      }
    }

    AndroidSummary summary = new AndroidSummary();
    summary.newRequests = summaryJson != null ? summaryJson.optInt("new_requests", 0) : 0;
    summary.totalRequests = summaryJson != null ? summaryJson.optInt("total_requests", 0) : 0;
    summary.pendingRequests = summaryJson != null ? summaryJson.optInt("pending_requests", 0) : 0;
    summary.syncedRequests = summaryJson != null ? summaryJson.optInt("synced_requests", 0) : 0;
    summary.requestCount = summaryJson != null ? summaryJson.optInt("request_count", 0) : 0;
    summary.pulledAt = summaryJson != null ? summaryJson.optString("pulled_at", "") : "";
    summary.pendingDailyTasks = operationsJson != null ? operationsJson.optInt("pending_daily_tasks", 0) : 0;
    summary.availableRooms = operationsJson != null ? operationsJson.optInt("available_rooms", 0) : 0;
    summary.totalRooms = operationsJson != null ? operationsJson.optInt("total_rooms", 0) : 0;
    summary.availableTables = operationsJson != null ? operationsJson.optInt("available_tables", 0) : 0;
    summary.pendingReservations = operationsJson != null ? operationsJson.optInt("pending_reservations", 0) : 0;
    summary.requests.addAll(requests);
    summary.dailyTasks.addAll(dailyTasks);
    return summary;
  }

  private AndroidRequest sendRequestStatusUpdate(String baseUrl, String syncSecret, String requestId, String status) throws Exception {
    JSONObject payload = new JSONObject();
    payload.put("action", "update_request_status");
    payload.put("sync_secret", syncSecret);
    payload.put("request_id", requestId);
    payload.put("status", status);

    JSONObject response = postSyncPayload(baseUrl, syncSecret, payload);
    return AndroidRequest.fromJson(response.optJSONObject("request"));
  }

  private JSONObject postSyncPayload(String baseUrl, String syncSecret, JSONObject payload) throws Exception {
    URL url = new URL(toSyncEndpoint(baseUrl));
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    connection.setConnectTimeout(8000);
    connection.setReadTimeout(8000);
    connection.setRequestMethod("POST");
    connection.setDoOutput(true);
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
    connection.setRequestProperty("X-YA-Sync-Secret", syncSecret);

    byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
    OutputStream outputStream = connection.getOutputStream();
    outputStream.write(body);
    outputStream.flush();
    outputStream.close();

    int status = connection.getResponseCode();
    InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
    String responseText = readAll(stream);
    JSONObject response = new JSONObject(responseText.length() > 0 ? responseText : "{}");
    if (status >= 400 || !response.optBoolean("ok", false)) {
      throw new Exception(response.optString("message", "Hosting bağlantısı başarısız oldu."));
    }

    return response;
  }

  private void applyDemoSnapshot() {
    AndroidSummary summary = new AndroidSummary();
    summary.newRequests = 3;
    summary.totalRequests = 3;
    summary.pendingRequests = 3;
    summary.syncedRequests = 0;
    summary.requestCount = 3;
    summary.pulledAt = "Demo";
    summary.pendingDailyTasks = 2;
    summary.availableRooms = 5;
    summary.totalRooms = 8;
    summary.availableTables = 7;
    summary.pendingReservations = 2;
    summary.requests.add(new AndroidRequest(
        "request_demo_android_001",
        "Demo Misafir",
        DEMO_PHONE,
        "pension_reservation",
        "new",
        "12-14 Temmuz",
        "",
        "",
        3,
        "Balkonlu oda varsa bilgi almak istiyorum.",
        DEMO_REPLY,
        "high",
        "pending",
        "2026-07-11T10:15:00+03:00"
    ));
    summary.requests.add(new AndroidRequest(
        "request_demo_android_002",
        "Demo Masa Grubu",
        "+905321234568",
        "restaurant_reservation",
        "new",
        "Bu akşam",
        "",
        "20:00",
        5,
        "Bahçede sigara içilmeyen bölümden masa rica ediyoruz.",
        "Merhaba, masa talebinizi aldık. Uygunluğu kontrol edip size dönüş yapacağız.",
        "normal",
        "pending",
        "2026-07-11T10:25:00+03:00"
    ));
    summary.requests.add(new AndroidRequest(
        "request_demo_android_003",
        "Demo Kahvaltı",
        "+905321234569",
        "breakfast_request",
        "new",
        "Pazar sabahı",
        "",
        "09:30",
        4,
        "Serpme kahvaltı için dış mekanda yer var mı?",
        "Merhaba, kahvaltı talebinizi aldık. Dış mekan durumunu kontrol edip size dönüş yapacağız.",
        "normal",
        "pending",
        "2026-07-11T10:35:00+03:00"
    ));
    summary.dailyTasks.add(new AndroidTask(
        "task_demo_android_001",
        "Oda 101 giriş hazırlığı",
        "Giriş öncesi temizlik ve havlu kontrolü.",
        "check_in",
        "pending",
        "2026-07-12",
        "14:00",
        "reservation",
        "reservation_demo_001",
        "2026-07-11T10:15:00+03:00"
    ));
    summary.dailyTasks.add(new AndroidTask(
        "task_demo_android_002",
        "Bahçe masası kontrolü",
        "Akşam servisi öncesi masa düzeni kontrol edilecek.",
        "table_reservation",
        "pending",
        "2026-07-11",
        "18:00",
        "table",
        "table_001",
        "2026-07-11T10:20:00+03:00"
    ));
    applyAndroidSummary(summary);
  }

  private void applyAndroidSummary(AndroidSummary summary) {
    newRequestsValue.setText(String.valueOf(summary.newRequests));
    newRequestsDetail.setText("Dönüş bekleyen talep");
    totalRequestsValue.setText(String.valueOf(summary.totalRequests));
    totalRequestsDetail.setText("Web modül kaydı");
    pendingRequestsValue.setText(String.valueOf(summary.pendingRequests));
    pendingRequestsDetail.setText("Takip edilecek");
    syncedRequestsValue.setText(String.valueOf(summary.syncedRequests));
    syncedRequestsDetail.setText("PC tarafından alınan");
    latestPullValue.setText(isLiveSnapshot(summary.pulledAt) ? "Canlı" : "Demo");
    latestPullDetail.setText(summary.requestCount + " kayıt görüntülendi");
    dailyTasksValue.setText(String.valueOf(summary.pendingDailyTasks));
    dailyTasksDetail.setText(summary.dailyTasks.size() + " iş listede");
    availableRoomsValue.setText(String.valueOf(summary.availableRooms));
    availableRoomsDetail.setText(summary.totalRooms > 0 ? summary.totalRooms + " odadan uygun" : "PC özeti bekliyor");
    availableTablesValue.setText(String.valueOf(summary.availableTables));
    availableTablesDetail.setText("Servis için uygun");
    pendingApprovalsValue.setText(String.valueOf(summary.pendingReservations));
    pendingApprovalsDetail.setText("Rezervasyon kararı");

    currentRequests.clear();
    currentRequests.addAll(summary.requests);
    currentDailyTasks.clear();
    currentDailyTasks.addAll(summary.dailyTasks);
    currentPendingDailyTasks = summary.pendingDailyTasks;
    currentAvailableRooms = summary.availableRooms;
    currentTotalRooms = summary.totalRooms;
    currentAvailableTables = summary.availableTables;
    currentPendingReservations = summary.pendingReservations;
    renderDailyTaskList(currentDailyTasks);
    AndroidRequest selectedRequest = selectRequest(currentRequests);
    renderRequestList(currentRequests, selectedRequest);

    if (selectedRequest == null) {
      requestBadgeView.setText("Yeni Talep Yok");
      requestNameView.setText("Web modülünde bekleyen talep yok");
      requestMetaView.setText("Canlı veri alındı");
      requestNoteView.setText("Yeni bir müşteri talebi geldiğinde burada görünür.");
      currentPhone = "";
      currentWhatsapp = "";
      currentWhatsAppMessage = "";
      updateActionButtons(false);
      return;
    }

    renderSelectedRequest(selectedRequest);
  }

  private void renderDailyTaskList(List<AndroidTask> tasks) {
    dailyTaskListContainer.removeAllViews();
    dailyTaskListStatusView.setText(tasks.size() + " günlük iş görüntüleniyor");

    if (tasks.isEmpty()) {
      TextView empty = text("PC henüz günlük iş özeti yayınlamadı.", 15, MUTED, Typeface.NORMAL);
      empty.setPadding(0, dp(4), 0, 0);
      dailyTaskListContainer.addView(empty);
      return;
    }

    for (AndroidTask task : tasks) {
      dailyTaskListContainer.addView(taskListRow(task));
    }
  }

  private View taskListRow(AndroidTask task) {
    LinearLayout row = new LinearLayout(this);
    row.setOrientation(LinearLayout.VERTICAL);
    row.setPadding(dp(12), dp(10), dp(12), dp(10));
    row.setBackground(round(Color.rgb(255, 253, 248), LINE, 8));

    row.addView(text(task.title, 16, INK, Typeface.BOLD));
    TextView meta = text(formatTaskType(task.type) + " • " + formatTaskDue(task) + " • " + formatTaskStatus(task.status), 13, MUTED, Typeface.NORMAL);
    meta.setPadding(0, dp(4), 0, 0);
    row.addView(meta);
    if (task.description.length() > 0) {
      TextView description = text(task.description, 14, MUTED, Typeface.NORMAL);
      description.setPadding(0, dp(5), 0, 0);
      row.addView(description);
    }

    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    );
    params.setMargins(0, 0, 0, dp(8));
    row.setLayoutParams(params);
    return row;
  }

  private AndroidRequest selectRequest(List<AndroidRequest> requests) {
    if (requests.isEmpty()) {
      selectedRequestId = "";
      return null;
    }

    if (selectedRequestId.length() > 0) {
      for (AndroidRequest request : requests) {
        if (selectedRequestId.equals(request.id)) {
          return request;
        }
      }
    }

    AndroidRequest firstRequest = requests.get(0);
    selectedRequestId = firstRequest.id;
    return firstRequest;
  }

  private void renderSelectedRequest(AndroidRequest request) {
    requestBadgeView.setText(formatRequestStatus(request.status));
    requestNameView.setText(request.name);
    requestMetaView.setText(formatRequestType(request.type) + " • " + request.dateText + formatTimeSuffix(request.time) + " • " + request.guestCount + " kişi");
    requestNoteView.setText(request.message);
    currentPhone = request.phone;
    currentWhatsapp = normalizeWhatsAppPhone(request.phone);
    currentWhatsAppMessage = request.whatsappMessage.length() > 0 ? request.whatsappMessage : DEMO_REPLY;
    updateActionButtons(true);
  }

  private void renderRequestList(List<AndroidRequest> requests, AndroidRequest selectedRequest) {
    requestListContainer.removeAllViews();
    requestListStatusView.setText(requests.size() + " talep görüntüleniyor");

    if (requests.isEmpty()) {
      TextView empty = text("Canlı talep yok", 15, MUTED, Typeface.NORMAL);
      empty.setPadding(0, dp(4), 0, 0);
      requestListContainer.addView(empty);
      return;
    }

    for (final AndroidRequest request : requests) {
      boolean selected = selectedRequest != null && selectedRequest.id.equals(request.id);
      requestListContainer.addView(requestListRow(request, selected));
    }
  }

  private View requestListRow(final AndroidRequest request, boolean selected) {
    LinearLayout row = new LinearLayout(this);
    row.setOrientation(LinearLayout.VERTICAL);
    row.setPadding(dp(12), dp(10), dp(12), dp(10));
    row.setBackground(round(selected ? Color.rgb(238, 247, 241) : Color.rgb(255, 253, 248), selected ? PRIMARY : LINE, 8));

    TextView title = text(request.name, 16, INK, Typeface.BOLD);
    row.addView(title);
    TextView meta = text(formatRequestType(request.type) + " • " + formatRequestStatus(request.status) + " • " + request.dateText + formatTimeSuffix(request.time), 13, MUTED, Typeface.NORMAL);
    meta.setPadding(0, dp(4), 0, 0);
    row.addView(meta);

    row.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View view) {
        selectedRequestId = request.id;
        renderSelectedRequest(request);
        renderRequestList(currentRequests, request);
      }
    });

    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    );
    params.setMargins(0, 0, 0, dp(8));
    row.setLayoutParams(params);
    return row;
  }

  private void updateActionButtons(boolean enabled) {
    callButton.setEnabled(enabled);
    whatsappButton.setEnabled(enabled);
    approveButton.setEnabled(enabled);
    rejectButton.setEnabled(enabled);
    answeredButton.setEnabled(enabled);
  }

  private void setLoading(boolean loading) {
    syncButton.setEnabled(!loading);
    syncButton.setText(loading ? "Veri Alınıyor" : "Canlı Veriyi Çek");
  }

  private void setConnectionStatus(String message, boolean error) {
    connectionStatusView.setText(message);
    connectionStatusView.setTextColor(error ? Color.rgb(176, 43, 43) : MUTED);
  }

  private void updateSelectedRequestStatus(final String nextStatus, final String toastMessage) {
    final AndroidRequest request = getSelectedRequest();
    if (request == null || request.id.length() == 0) {
      Toast.makeText(this, "Güncellenecek talep yok.", Toast.LENGTH_SHORT).show();
      return;
    }

    saveConnectionSettings();
    if (!hasConnectionSettings()) {
      applyLocalRequestStatus(request.id, nextStatus);
      Toast.makeText(this, toastMessage, Toast.LENGTH_SHORT).show();
      return;
    }

    final String baseUrl = webModuleUrlInput.getText().toString().trim();
    final String syncSecret = syncSecretInput.getText().toString().trim();
    setLoading(true);
    updateActionButtons(false);
    setConnectionStatus("Talep durumu güncelleniyor...", false);

    new Thread(new Runnable() {
      @Override
      public void run() {
        try {
          sendRequestStatusUpdate(baseUrl, syncSecret, request.id, nextStatus);
          final AndroidSummary summary = fetchAndroidSummary(baseUrl, syncSecret);
          runOnUiThread(new Runnable() {
            @Override
            public void run() {
              selectedRequestId = request.id;
              applyAndroidSummary(summary);
              Toast.makeText(MainActivity.this, toastMessage, Toast.LENGTH_SHORT).show();
              setConnectionStatus("Talep durumu güncellendi: " + formatRequestStatus(nextStatus), false);
              setLoading(false);
            }
          });
        } catch (final Exception error) {
          runOnUiThread(new Runnable() {
            @Override
            public void run() {
              setConnectionStatus(error.getMessage() != null ? error.getMessage() : "Talep durumu güncellenemedi.", true);
              setLoading(false);
              updateActionButtons(getSelectedRequest() != null);
            }
          });
        }
      }
    }).start();
  }

  private AndroidRequest getSelectedRequest() {
    if (selectedRequestId.length() == 0) {
      return null;
    }

    for (AndroidRequest request : currentRequests) {
      if (selectedRequestId.equals(request.id)) {
        return request;
      }
    }

    return null;
  }

  private void applyLocalRequestStatus(String requestId, String nextStatus) {
    for (int index = 0; index < currentRequests.size(); index += 1) {
      AndroidRequest request = currentRequests.get(index);
      if (requestId.equals(request.id)) {
        currentRequests.set(index, request.withStatus(nextStatus));
        break;
      }
    }

    AndroidSummary summary = summaryFromRequests(currentRequests, "Demo");
    applyAndroidSummary(summary);
  }

  private AndroidSummary summaryFromRequests(List<AndroidRequest> requests, String pulledAt) {
    AndroidSummary summary = new AndroidSummary();
    summary.totalRequests = requests.size();
    summary.requestCount = requests.size();
    summary.pulledAt = pulledAt;
    summary.pendingDailyTasks = currentPendingDailyTasks;
    summary.availableRooms = currentAvailableRooms;
    summary.totalRooms = currentTotalRooms;
    summary.availableTables = currentAvailableTables;
    summary.pendingReservations = currentPendingReservations;
    summary.dailyTasks.addAll(currentDailyTasks);

    for (AndroidRequest request : requests) {
      if ("new".equals(request.status)) {
        summary.newRequests += 1;
      }
      if (isPendingRequestStatus(request.status)) {
        summary.pendingRequests += 1;
      }
      if ("synced".equals(request.syncStatus)) {
        summary.syncedRequests += 1;
      }
      summary.requests.add(request);
    }

    return summary;
  }

  private void openDialer() {
    if (currentPhone.trim().length() == 0) {
      Toast.makeText(this, "Aranacak müşteri telefonu yok.", Toast.LENGTH_SHORT).show();
      return;
    }

    openIntent(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + currentPhone)), "Arama uygulaması açılamadı.");
  }

  private void openWhatsApp() {
    if (currentWhatsapp.trim().length() == 0) {
      Toast.makeText(this, "WhatsApp için müşteri telefonu yok.", Toast.LENGTH_SHORT).show();
      return;
    }

    Uri uri = new Uri.Builder()
        .scheme("https")
        .authority("wa.me")
        .appendPath(currentWhatsapp)
        .appendQueryParameter("text", currentWhatsAppMessage)
        .build();
    openIntent(new Intent(Intent.ACTION_VIEW, uri), "WhatsApp bağlantısı açılamadı.");
  }

  private void openIntent(Intent intent, String fallbackMessage) {
    try {
      startActivity(intent);
    } catch (ActivityNotFoundException error) {
      Toast.makeText(this, fallbackMessage, Toast.LENGTH_SHORT).show();
    }
  }

  private String toSyncEndpoint(String baseUrl) {
    String normalized = baseUrl.trim();
    while (normalized.endsWith("/")) {
      normalized = normalized.substring(0, normalized.length() - 1);
    }
    if (normalized.endsWith("/api/sync.php")) {
      return normalized;
    }
    if (normalized.endsWith("/api")) {
      return normalized + "/sync.php";
    }
    return normalized + "/api/sync.php";
  }

  private String readAll(InputStream stream) throws Exception {
    if (stream == null) {
      return "";
    }

    BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
    StringBuilder builder = new StringBuilder();
    String line;
    while ((line = reader.readLine()) != null) {
      builder.append(line);
    }
    reader.close();
    return builder.toString();
  }

  private String normalizeWhatsAppPhone(String phone) {
    String digits = phone.replaceAll("[^0-9]", "");
    if (digits.startsWith("90")) {
      return digits;
    }
    if (digits.startsWith("0")) {
      return "90" + digits.substring(1);
    }
    if (digits.length() == 10) {
      return "90" + digits;
    }
    return digits;
  }

  private String formatRequestType(String type) {
    if ("pension_reservation".equals(type)) {
      return "Pansiyon rezervasyonu";
    }
    if ("restaurant_reservation".equals(type)) {
      return "Masa rezervasyonu";
    }
    if ("breakfast_request".equals(type)) {
      return "Kahvaltı talebi";
    }
    if ("price_question".equals(type)) {
      return "Fiyat sorusu";
    }
    return "Bilgi talebi";
  }

  private String formatRequestStatus(String status) {
    if ("approved".equals(status)) {
      return "Onaylandı";
    }
    if ("rejected".equals(status)) {
      return "Reddedildi";
    }
    if ("answered".equals(status)) {
      return "Cevaplandı";
    }
    if ("seen".equals(status)) {
      return "Görüldü";
    }
    if ("waiting_owner".equals(status)) {
      return "İşletme bekliyor";
    }
    if ("waiting_customer".equals(status)) {
      return "Müşteri bekliyor";
    }
    if ("converted_to_reservation".equals(status)) {
      return "Rezervasyona çevrildi";
    }
    if ("cancelled".equals(status)) {
      return "İptal";
    }
    if ("archived".equals(status)) {
      return "Arşiv";
    }
    return "Yeni Talep";
  }

  private String formatTaskType(String type) {
    if ("check_in".equals(type)) {
      return "Giriş hazırlığı";
    }
    if ("check_out".equals(type)) {
      return "Çıkış takibi";
    }
    if ("table_reservation".equals(type)) {
      return "Masa takibi";
    }
    if ("cleaning".equals(type)) {
      return "Temizlik";
    }
    if ("maintenance".equals(type)) {
      return "Bakım";
    }
    if ("customer_call".equals(type)) {
      return "Müşteri araması";
    }
    return "Günlük iş";
  }

  private String formatTaskStatus(String status) {
    if ("done".equals(status)) {
      return "Tamamlandı";
    }
    if ("cancelled".equals(status)) {
      return "İptal";
    }
    if ("archived".equals(status)) {
      return "Arşiv";
    }
    return "Bekliyor";
  }

  private String formatTaskDue(AndroidTask task) {
    if (task.dueDate.length() > 0 && task.dueTime.length() > 0) {
      return task.dueDate + " " + task.dueTime;
    }
    if (task.dueDate.length() > 0) {
      return task.dueDate;
    }
    if (task.dueTime.length() > 0) {
      return task.dueTime;
    }
    return "Zaman yok";
  }

  private boolean isPendingRequestStatus(String status) {
    return "new".equals(status)
        || "seen".equals(status)
        || "waiting_owner".equals(status)
        || "waiting_customer".equals(status);
  }

  private boolean isLiveSnapshot(String pulledAt) {
    return pulledAt.length() > 0 && !"Demo".equals(pulledAt);
  }

  private String formatTimeSuffix(String time) {
    return time.length() > 0 ? " " + time : "";
  }

  private TextView text(String value, int sizeSp, int color, int style) {
    TextView view = new TextView(this);
    view.setText(value);
    view.setTextSize(sizeSp);
    view.setTextColor(color);
    view.setTypeface(Typeface.DEFAULT, style);
    view.setLineSpacing(0, 1.1f);
    return view;
  }

  private GradientDrawable round(int fillColor, int strokeColor, int radiusDp) {
    GradientDrawable drawable = new GradientDrawable();
    drawable.setColor(fillColor);
    drawable.setCornerRadius(dp(radiusDp));
    drawable.setStroke(dp(1), strokeColor);
    return drawable;
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private static class AndroidSummary {
    int newRequests;
    int totalRequests;
    int pendingRequests;
    int syncedRequests;
    int requestCount;
    int pendingDailyTasks;
    int availableRooms;
    int totalRooms;
    int availableTables;
    int pendingReservations;
    String pulledAt = "";
    final ArrayList<AndroidRequest> requests = new ArrayList<>();
    final ArrayList<AndroidTask> dailyTasks = new ArrayList<>();
  }

  private static class AndroidTask {
    final String id;
    final String title;
    final String description;
    final String type;
    final String status;
    final String dueDate;
    final String dueTime;
    final String relatedType;
    final String relatedId;
    final String updatedAt;

    AndroidTask(String id, String title, String description, String type, String status, String dueDate, String dueTime, String relatedType, String relatedId, String updatedAt) {
      this.id = id;
      this.title = title.length() > 0 ? title : "Günlük iş";
      this.description = description;
      this.type = type.length() > 0 ? type : "note";
      this.status = status.length() > 0 ? status : "pending";
      this.dueDate = dueDate;
      this.dueTime = dueTime;
      this.relatedType = relatedType;
      this.relatedId = relatedId;
      this.updatedAt = updatedAt;
    }

    static AndroidTask fromJson(JSONObject json) {
      if (json == null) {
        return null;
      }

      return new AndroidTask(
          json.optString("id", ""),
          json.optString("title", ""),
          json.optString("description", ""),
          json.optString("task_type", "note"),
          json.optString("status", "pending"),
          json.optString("due_date", ""),
          json.optString("due_time", ""),
          json.optString("related_type", ""),
          json.optString("related_id", ""),
          json.optString("updated_at", "")
      );
    }
  }

  private static class AndroidRequest {
    final String id;
    final String name;
    final String phone;
    final String type;
    final String status;
    final String dateText;
    final String startDate;
    final String time;
    final int guestCount;
    final String message;
    final String whatsappMessage;
    final String priority;
    final String syncStatus;
    final String createdAt;

    AndroidRequest(String id, String name, String phone, String type, String status, String dateText, String startDate, String time, int guestCount, String message, String whatsappMessage, String priority, String syncStatus, String createdAt) {
      this.id = id;
      this.name = name.length() > 0 ? name : "Misafir";
      this.phone = phone;
      this.type = type;
      this.status = status.length() > 0 ? status : "new";
      this.dateText = dateText.length() > 0 ? dateText : startDate;
      this.startDate = startDate;
      this.time = time;
      this.guestCount = guestCount > 0 ? guestCount : 1;
      this.message = message.length() > 0 ? message : "Not girilmemiş.";
      this.whatsappMessage = whatsappMessage;
      this.priority = priority.length() > 0 ? priority : "normal";
      this.syncStatus = syncStatus.length() > 0 ? syncStatus : "pending";
      this.createdAt = createdAt;
    }

    AndroidRequest withStatus(String nextStatus) {
      return new AndroidRequest(
          id,
          name,
          phone,
          type,
          nextStatus,
          dateText,
          startDate,
          time,
          guestCount,
          message,
          whatsappMessage,
          priority,
          syncStatus,
          createdAt
      );
    }

    static AndroidRequest fromJson(JSONObject json) {
      if (json == null) {
        return null;
      }

      return new AndroidRequest(
          json.optString("id", ""),
          json.optString("customer_name", "Misafir"),
          json.optString("customer_phone", ""),
          json.optString("request_type", "general_info"),
          json.optString("status", "new"),
          json.optString("date_text", ""),
          json.optString("start_date", ""),
          json.optString("time", ""),
          json.optInt("guest_count", 1),
          json.optString("message", ""),
          json.optString("whatsapp_message", ""),
          json.optString("priority", "normal"),
          json.optString("sync_status", "pending"),
          json.optString("created_at", "")
      );
    }
  }
}
