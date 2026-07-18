package com.yardimciasistan.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.net.URLEncoder;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
  private static final String TAB_TODAY = "today";
  private static final String TAB_CUSTOMERS = "customers";
  private static final String TAB_PENSION = "pension";
  private static final String TAB_RESTAURANT = "restaurant";
  private static final String TAB_MESSAGES = "messages";
  private static final long FOREGROUND_SYNC_INTERVAL_MS = 15_000L;

  private final HostingSyncClient syncClient = new HostingSyncClient();
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private SharedPreferences preferences;
  private ActionOutbox actionOutbox;
  private OperationCache operationCache;
  private OperationData data = new OperationData();
  private DeviceIdentity identity;
  private String activeTab = TAB_TODAY;
  private String customerFilter = "new";
  private boolean settingsOpen;
  private boolean loading;
  private boolean foregroundActive;
  private String connectionState = "Henüz bağlanmadı";

  private LinearLayout root;
  private FrameLayout content;
  private LinearLayout bottomNavigation;
  private TextView headerTitle;
  private TextView headerMeta;
  private TextView errorBanner;
  private Button settingsButton;
  private EditText webModuleInput;
  private EditText syncSecretInput;
  private final Map<String, Integer> screenScrollPositions = new HashMap<>();
  private String renderedScreenKey = "";
  private final Handler foregroundSyncHandler = new Handler(Looper.getMainLooper());
  private final Runnable foregroundSyncRunnable = new Runnable() {
    @Override
    public void run() {
      if (!foregroundActive) {
        return;
      }
      if (hasConnectionSettings() && !loading) {
        syncFromHosting(false);
      }
      foregroundSyncHandler.postDelayed(this, FOREGROUND_SYNC_INTERVAL_MS);
    }
  };

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setStatusBarColor(UiKit.BG);
    getWindow().setNavigationBarColor(UiKit.BG);
    getWindow().getDecorView().setSystemUiVisibility(0);

    preferences = getSharedPreferences(ConnectionSettings.PREFS_NAME, MODE_PRIVATE);
    resetDebugAppStateIfRequested();
    ConnectionSettings.setDebugConnectionOverrideActive(preferences, isDebugConnectionOverrideRequested());
    ConnectionSettings.ensureDefaults(preferences);
    identity = DeviceIdentity.loadOrCreate(this, preferences);
    actionOutbox = new ActionOutbox(preferences);
    operationCache = new OperationCache(preferences, identity.deviceId);
    OperationData cachedData = operationCache.load();
    if (cachedData != null) {
      data = cachedData;
      connectionState = "Son kayıtlı veri gösteriliyor";
    }
    applyConnectionExtras();
    SyncJobService.schedule(this);
    buildShell();
    render();
    if (hasConnectionSettings()) {
      syncFromHosting(false);
    } else {
      showError("Canlı veriyi görmek için Ayarlar'dan bağlantıyı tamamlayın.");
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    foregroundActive = true;
    foregroundSyncHandler.removeCallbacks(foregroundSyncRunnable);
    foregroundSyncHandler.postDelayed(foregroundSyncRunnable, FOREGROUND_SYNC_INTERVAL_MS);
  }

  @Override
  protected void onPause() {
    foregroundActive = false;
    foregroundSyncHandler.removeCallbacks(foregroundSyncRunnable);
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    foregroundSyncHandler.removeCallbacks(foregroundSyncRunnable);
    executor.shutdownNow();
    super.onDestroy();
  }

  @Override
  public void onBackPressed() {
    if (settingsOpen) {
      settingsOpen = false;
      render();
      return;
    }
    super.onBackPressed();
  }

  private void applyConnectionExtras() {
    String extraUrl = getIntent().getStringExtra("ya_web_module_url");
    String extraSecret = getIntent().getStringExtra("ya_sync_secret");
    boolean debugOverride = isDebugConnectionOverrideRequested();
    if (ConnectionSettings.isEmbeddedConnectionLocked() && !debugOverride) {
      return;
    }
    if (data.permissionsResolved && !data.hasPermission("settings.edit") && !debugOverride) {
      return;
    }
    if (extraUrl != null && extraSecret != null
        && !extraUrl.trim().isEmpty() && !extraSecret.trim().isEmpty()) {
      try {
        for (ActionOutbox.PendingAction pending : actionOutbox.load()) {
          if (!pending.matchesTarget(extraUrl.trim(), extraSecret.trim())) {
            connectionState = "Önceki bağlantıya ait bekleyen işlem korunuyor";
            return;
          }
        }
      } catch (ActionOutbox.OutboxException error) {
        connectionState = error.getMessage();
        return;
      }
      preferences.edit()
          .putString(ConnectionSettings.KEY_WEB_MODULE_URL, extraUrl.trim())
          .putString(ConnectionSettings.KEY_SYNC_SECRET, extraSecret.trim())
          .apply();
    }
  }

  private boolean isDebugConnectionOverrideRequested() {
    return isDebuggable()
        && getIntent().getBooleanExtra("ya_allow_debug_connection_override", false);
  }

  private void resetDebugAppStateIfRequested() {
    if (isDebuggable() && getIntent().getBooleanExtra("ya_reset_debug_app_state", false)) {
      DeviceIdentity.clearAppStateKeepingIdentity(preferences);
    }
  }

  private boolean isDebuggable() {
    return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
  }

  private void buildShell() {
    root = UiKit.column(this);
    root.setBackgroundColor(UiKit.BG);

    LinearLayout header = UiKit.row(this);
    header.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 12), UiKit.dp(this, 12), UiKit.dp(this, 10));
    header.setBackgroundColor(UiKit.BG);

    LinearLayout titleGroup = UiKit.column(this);
    titleGroup.addView(UiKit.eyebrow(this, "Yardımcı Asistan"));
    headerTitle = UiKit.text(this, "Bugün", 21, UiKit.TEXT, Typeface.BOLD);
    titleGroup.addView(headerTitle);
    headerMeta = UiKit.text(this, "Telefon operasyon paneli", 11, UiKit.MUTED, Typeface.NORMAL);
    titleGroup.addView(headerMeta);
    titleGroup.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    header.addView(titleGroup);

    settingsButton = UiKit.outlineButton(this, "Ayarlar", view -> {
      settingsOpen = !settingsOpen;
      render();
    });
    settingsButton.setContentDescription("Bağlantı ayarlarını aç");
    LinearLayout.LayoutParams settingsParams = new LinearLayout.LayoutParams(-2, UiKit.dp(this, 44));
    settingsButton.setLayoutParams(settingsParams);
    header.addView(settingsButton);
    root.addView(header);

    errorBanner = UiKit.text(this, "", 12, UiKit.TEXT, Typeface.BOLD);
    errorBanner.setPadding(UiKit.dp(this, 14), UiKit.dp(this, 9), UiKit.dp(this, 14), UiKit.dp(this, 9));
    errorBanner.setVisibility(View.GONE);
    LinearLayout.LayoutParams bannerParams = new LinearLayout.LayoutParams(-1, -2);
    bannerParams.setMargins(UiKit.dp(this, 14), 0, UiKit.dp(this, 14), UiKit.dp(this, 8));
    errorBanner.setLayoutParams(bannerParams);
    root.addView(errorBanner);

    content = new FrameLayout(this);
    content.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    root.addView(content);

    bottomNavigation = UiKit.row(this);
    bottomNavigation.setPadding(UiKit.dp(this, 5), UiKit.dp(this, 6), UiKit.dp(this, 5), UiKit.dp(this, 7));
    bottomNavigation.setBackground(UiKit.rounded(this, UiKit.SURFACE, UiKit.BORDER, 0));
    bottomNavigation.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 70)));
    root.addView(bottomNavigation);
    setContentView(root);
  }

  private void render() {
    rememberCurrentScrollPosition();
    boolean canOpenSettings = !data.permissionsResolved || data.hasPermission("settings.view");
    if (settingsOpen && !canOpenSettings) {
      settingsOpen = false;
    }
    if (!canOpenTab(activeTab)) {
      activeTab = TAB_TODAY;
    }
    boolean inactiveDevice = data.permissionsResolved && !data.deviceActive;
    if (inactiveDevice) {
      settingsOpen = false;
    }
    String screenKey = currentScreenKey(inactiveDevice);
    settingsButton.setText(settingsOpen ? "Kapat" : "Ayarlar");
    settingsButton.setVisibility(canOpenSettings ? View.VISIBLE : View.GONE);
    bottomNavigation.setVisibility(settingsOpen || inactiveDevice ? View.GONE : View.VISIBLE);
    renderBottomNavigation();
    content.removeAllViews();
    View screen;
    if (inactiveDevice) {
      headerTitle.setText("Cihaz Pasif");
      screen = inactiveDeviceScreen();
    } else if (settingsOpen) {
      headerTitle.setText("Ayarlar");
      screen = settingsScreen();
    } else if (TAB_CUSTOMERS.equals(activeTab)) {
      headerTitle.setText("Müşteri");
      screen = customerScreen();
    } else if (TAB_PENSION.equals(activeTab)) {
      headerTitle.setText("Pansiyon");
      screen = pensionScreen();
    } else if (TAB_RESTAURANT.equals(activeTab)) {
      headerTitle.setText("Restoran");
      screen = restaurantScreen();
    } else if (TAB_MESSAGES.equals(activeTab)) {
      headerTitle.setText("Mesajlar");
      screen = messagesScreen();
    } else {
      headerTitle.setText("Bugün");
      screen = todayScreen();
    }
    headerMeta.setText(data.permissionsResolved ? data.deviceRoleLabel() : "Telefon operasyon paneli");
    content.addView(screen);
    renderedScreenKey = screenKey;
    restoreScrollPosition(screen, screenKey);
  }

  private void rememberCurrentScrollPosition() {
    if (renderedScreenKey.isEmpty() || content == null || content.getChildCount() == 0) {
      return;
    }
    View currentScreen = content.getChildAt(0);
    if (currentScreen instanceof ScrollView) {
      screenScrollPositions.put(renderedScreenKey, ((ScrollView) currentScreen).getScrollY());
    }
  }

  private String currentScreenKey(boolean inactiveDevice) {
    if (inactiveDevice) {
      return "inactive";
    }
    if (settingsOpen) {
      return "settings";
    }
    if (TAB_CUSTOMERS.equals(activeTab)) {
      return TAB_CUSTOMERS + ":" + customerFilter;
    }
    return activeTab;
  }

  private void restoreScrollPosition(View screen, String screenKey) {
    if (!(screen instanceof ScrollView)) {
      return;
    }
    ScrollView scrollView = (ScrollView) screen;
    int scrollY = Math.max(0, screenScrollPositions.getOrDefault(screenKey, 0));
    scrollView.post(() -> {
      if (screenKey.equals(renderedScreenKey)
          && content.getChildCount() > 0
          && content.getChildAt(0) == scrollView) {
        scrollView.scrollTo(0, scrollY);
      }
    });
  }

  private void renderBottomNavigation() {
    bottomNavigation.removeAllViews();
    addNavButton("Bugün", TAB_TODAY);
    if (canOpenTab(TAB_CUSTOMERS)) {
      addNavButton("Müşteri", TAB_CUSTOMERS);
    }
    if (canOpenTab(TAB_PENSION)) {
      addNavButton("Pansiyon", TAB_PENSION);
    }
    if (canOpenTab(TAB_RESTAURANT)) {
      addNavButton("Restoran", TAB_RESTAURANT);
    }
    if (canOpenTab(TAB_MESSAGES)) {
      addNavButton("Mesajlar", TAB_MESSAGES);
    }
  }

  private boolean canOpenTab(String tab) {
    if (TAB_TODAY.equals(tab)) {
      return true;
    }
    if (TAB_CUSTOMERS.equals(tab) || TAB_MESSAGES.equals(tab)) {
      return data.hasPermission("customer.view");
    }
    if (TAB_PENSION.equals(tab)) {
      return data.hasPermission("reservation.view")
          || data.hasPermission("room.view")
          || data.hasPermission("daily_task.view");
    }
    if (TAB_RESTAURANT.equals(tab)) {
      return data.hasPermission("table.view")
          || data.hasPermission("table_order.view")
          || data.hasPermission("menu.view")
          || data.hasPermission("daily_task.view");
    }
    return false;
  }

  private View inactiveDeviceScreen() {
    LinearLayout page = UiKit.column(this);
    page.addView(screenIntro("ERİŞİM DURUMU", "Bu cihaz pasifleştirildi", "Cihaz masaüstünde pasifleştirilmiş. Yeniden etkinleştirmek için masaüstü yöneticinize başvurun.", false));
    LinearLayout card = UiKit.card(this);
    card.addView(settingLine("Telefon kimliği", compactDeviceId(), UiKit.MUTED));
    card.addView(UiKit.divider(this));
    card.addView(settingLine("Rol", data.deviceRoleLabel(), UiKit.WARNING));
    page.addView(card);
    return UiKit.scroll(this, page);
  }

  private void addNavButton(String label, String tab) {
    boolean selected = tab.equals(activeTab) && !settingsOpen;
    Button button = new Button(this);
    button.setText(label);
    button.setTextSize(11);
    button.setTextColor(selected ? UiKit.PRIMARY : UiKit.MUTED);
    button.setTypeface(Typeface.create("sans", selected ? Typeface.BOLD : Typeface.NORMAL));
    button.setAllCaps(false);
    button.setGravity(Gravity.CENTER);
    button.setPadding(1, 0, 1, 0);
    button.setBackground(UiKit.rounded(this, selected ? UiKit.SURFACE_ALT : Color.TRANSPARENT, Color.TRANSPARENT, 11));
    button.setOnClickListener(view -> {
      activeTab = tab;
      settingsOpen = false;
      render();
    });
    button.setLayoutParams(new LinearLayout.LayoutParams(0, -1, 1f));
    bottomNavigation.addView(button);
  }

  private View todayScreen() {
    LinearLayout page = UiKit.column(this);
    page.addView(screenIntro("GÜNLÜK OPERASYON", greetingTitle(), "Bekleyen işleri görün ve tek dokunuşla harekete geçin.", !data.permissionsResolved || data.hasPermission("settings.view")));
    boolean canViewCustomers = data.hasPermission("customer.view");
    boolean canViewReservations = data.hasPermission("reservation.view");
    boolean canViewRooms = data.hasPermission("room.view");
    boolean canViewTasks = data.hasPermission("daily_task.view");
    boolean canViewTables = data.hasPermission("table.view");
    boolean canViewOrders = data.hasPermission("table_order.view");

    int visiblePendingActions = data.pendingActions + localPendingActionCount();
    if (visiblePendingActions > 0) {
      LinearLayout pending = UiKit.card(this);
      pending.addView(UiKit.text(this, visiblePendingActions + " işlem masaüstünü bekliyor", 14, UiKit.WARNING, Typeface.BOLD));
      pending.addView(UiKit.text(this, "Masaüstü uyguladığında Canlı Veriyi Çek ile sonuçlar güncellenir.", 12, UiKit.MUTED, Typeface.NORMAL));
      page.addView(pending);
    }

    OperationData.ActionRecord latestFailedAction = latestFailedAction();
    if (latestFailedAction != null) {
      page.addView(UiKit.sectionTitle(this, "Son işlem uyarısı"));
      page.addView(actionCard(latestFailedAction));
    }

    ArrayList<MetricValue> metrics = new ArrayList<>();
    if (canViewCustomers) {
      metrics.add(new MetricValue("Yeni talepler", data.newRequests, "Karar bekliyor", UiKit.INFO));
      metrics.add(new MetricValue("Hazır cevaplar", data.messages.size(), "Kopyala veya aç", UiKit.PRIMARY));
      metrics.add(new MetricValue("Cevap bekleyen", data.waitingResponses > 0 ? data.waitingResponses : countWaitingRequests(), "Müşteri", UiKit.DANGER));
    }
    if (canViewReservations) {
      metrics.add(new MetricValue("Rezervasyon", data.pendingReservations, "Onay bekliyor", UiKit.WARNING));
    }
    if (canViewTasks) {
      metrics.add(new MetricValue("Bugünkü işler", data.todayTasks > 0 ? data.todayTasks : data.pendingDailyTasks, "Takip listesi", UiKit.ACCENT));
    }
    if (canViewRooms) {
      metrics.add(new MetricValue("Boş odalar", data.availableRooms, data.totalRooms + " oda içinde", UiKit.SUCCESS));
    }
    if (canViewTables) {
      metrics.add(new MetricValue("Boş masalar", data.availableTables, "Servise hazır", UiKit.SUCCESS));
    }
    if (canViewOrders) {
      metrics.add(new MetricValue("Hesap bekleyen", data.billWaitingTables, "Masa", UiKit.WARNING));
    }
    if (!metrics.isEmpty()) {
      page.addView(metricGrid(metrics.toArray(new MetricValue[0])));
    }

    if (canViewCustomers) {
      page.addView(UiKit.sectionTitle(this, "Son talepler"));
      int requestLimit = Math.min(3, data.requests.size());
      if (requestLimit == 0) {
        page.addView(emptyCard("Henüz müşteri talebi yok", "Canlı veriyi çektiğinizde son talepler burada görünür."));
      } else {
        for (int index = 0; index < requestLimit; index += 1) {
          page.addView(todayRequestCard(data.requests.get(index)));
        }
      }
    }

    if (canViewTasks) {
      page.addView(UiKit.sectionTitle(this, "Bugünkü işler"));
      List<OperationData.TaskRecord> todayTasks = todayTasks();
      if (todayTasks.isEmpty()) {
        page.addView(emptyCard("Bugün için açık iş yok", "Günlük operasyon listesi sakin görünüyor."));
      } else {
        for (int index = 0; index < Math.min(3, todayTasks.size()); index += 1) {
          page.addView(taskCard(todayTasks.get(index), true));
        }
      }
    }

    if (canViewReservations) {
      page.addView(UiKit.sectionTitle(this, "Yaklaşan rezervasyonlar"));
      int shown = 0;
      for (OperationData.ReservationRecord reservation : data.reservations) {
        if ("cancelled".equals(reservation.status) || "completed".equals(reservation.status)) {
          continue;
        }
        page.addView(reservationCard(reservation, true));
        shown += 1;
        if (shown == 3) {
          break;
        }
      }
      if (shown == 0) {
        page.addView(emptyCard("Yaklaşan rezervasyon yok", "Yeni kayıtlar masaüstünden yayınlandığında burada görünür."));
      }
    }
    return UiKit.scroll(this, page);
  }

  private View customerScreen() {
    LinearLayout page = UiKit.column(this);
    page.addView(screenIntro("MÜŞTERİ İŞLERİ", "Hızlı karar ve iletişim", "Talepleri açın, müşteriye ulaşın ve sonucu masaüstüne gönderin.", false));
    page.addView(filterBar(new String[][] {
        {"new", "Yeni Talepler"},
        {"customers", "Müşteriler"},
        {"waiting", "Cevap Bekleyenler"}
    }, customerFilter, value -> {
      customerFilter = value;
      render();
    }));

    if ("customers".equals(customerFilter)) {
      page.addView(UiKit.sectionTitle(this, "Müşteriler"));
      if (data.customers.isEmpty()) {
        page.addView(emptyCard("Müşteri listesi boş", "Masaüstü güncel snapshot yayınladığında müşteriler burada görünür."));
      }
      for (OperationData.CustomerRecord customer : data.customers) {
        page.addView(customerCard(customer));
      }
    } else {
      boolean waitingOnly = "waiting".equals(customerFilter);
      page.addView(UiKit.sectionTitle(this, waitingOnly ? "Cevap bekleyen müşteriler" : "Yeni ve açık talepler"));
      int shown = 0;
      for (OperationData.RequestRecord request : data.requests) {
        boolean visible = waitingOnly ? request.waitingForResponse() : !isClosedRequest(request.status);
        if (!visible) {
          continue;
        }
        page.addView(requestCard(request));
        shown += 1;
      }
      if (shown == 0) {
        page.addView(emptyCard(waitingOnly ? "Cevap bekleyen müşteri yok" : "Açık talep yok", "Yeni talepler geldiğinde bu liste güncellenir."));
      }
    }
    return UiKit.scroll(this, page);
  }

  private View pensionScreen() {
    LinearLayout page = UiKit.column(this);
    page.addView(screenIntro("PANSİYON", "Konaklama operasyonu", "Rezervasyonları, odaları ve günlük işleri hızlıca yönetin.", false));
    boolean canViewReservations = data.hasPermission("reservation.view");
    boolean canViewRooms = data.hasPermission("room.view");
    boolean canViewTasks = data.hasPermission("daily_task.view");
    ArrayList<MetricValue> metrics = new ArrayList<>();
    if (canViewRooms) {
      metrics.add(new MetricValue("Boş odalar", data.availableRooms, data.totalRooms + " oda içinde", UiKit.SUCCESS));
      metrics.add(new MetricValue("Toplam oda", data.totalRooms, "Aktif", UiKit.INFO));
    }
    if (canViewReservations) {
      metrics.add(new MetricValue("Bekleyen", data.pendingReservations, "Rezervasyon", UiKit.WARNING));
    }
    if (canViewTasks) {
      metrics.add(new MetricValue("Bugünkü işler", data.todayTasks, "Konaklama dahil", UiKit.ACCENT));
    }
    if (!metrics.isEmpty()) {
      page.addView(metricGrid(metrics.toArray(new MetricValue[0])));
    }

    if (canViewReservations) {
      page.addView(UiKit.sectionTitle(this, "Rezervasyonlar"));
      int reservationCount = 0;
      for (OperationData.ReservationRecord reservation : data.reservations) {
        if (!isPensionReservation(reservation)) {
          continue;
        }
        page.addView(reservationCard(reservation, false));
        reservationCount += 1;
      }
      if (reservationCount == 0) {
        page.addView(emptyCard("Konaklama rezervasyonu yok", "Yeni rezervasyonlar burada listelenir."));
      }
    }

    if (canViewRooms) {
      page.addView(UiKit.sectionTitle(this, "Odalar"));
      if (data.rooms.isEmpty()) {
        page.addView(emptyCard("Oda verisi yayınlanmamış", "Masaüstünden Android özetini yayınlayın."));
      }
      for (OperationData.RoomRecord room : data.rooms) {
        page.addView(roomCard(room));
      }
    }

    if (canViewTasks) {
      page.addView(UiKit.sectionTitle(this, "Günlük işler"));
      int taskCount = 0;
      for (OperationData.TaskRecord task : data.tasks) {
        if (isPensionTask(task)) {
          page.addView(taskCard(task, false));
          taskCount += 1;
        }
      }
      if (taskCount == 0) {
        page.addView(emptyCard("Konaklama işi yok", "Günlük işler sakin görünüyor."));
      }
    }
    return UiKit.scroll(this, page);
  }

  private View restaurantScreen() {
    LinearLayout page = UiKit.column(this);
    page.addView(screenIntro("RESTORAN", "Servis ve masa yönetimi", "Masaları, aktif adisyonları ve servis akışını telefondan takip edin.", false));
    boolean canViewTables = data.hasPermission("table.view");
    boolean canViewOrders = data.hasPermission("table_order.view");
    boolean canViewMenu = data.hasPermission("menu.view");
    boolean canViewTasks = data.hasPermission("daily_task.view");
    ArrayList<MetricValue> metrics = new ArrayList<>();
    if (canViewTables) {
      metrics.add(new MetricValue("Boş masa", data.availableTables, "Servise hazır", UiKit.SUCCESS));
      metrics.add(new MetricValue("Dolu masa", data.occupiedTables, "Serviste", UiKit.INFO));
    }
    if (canViewOrders) {
      metrics.add(new MetricValue("Hesap", data.billWaitingTables, "Bekleyen masa", UiKit.WARNING));
      metrics.add(new MetricValue("Açık adisyon", data.activeTableOrders > 0 ? data.activeTableOrders : data.tableOrders.size(), "Aktif", UiKit.ACCENT));
    }
    if (canViewMenu) {
      metrics.add(new MetricValue("Menü ürünü", data.menuItems.size(), "Görüntülenebilir", UiKit.PRIMARY));
    }
    if (!metrics.isEmpty()) {
      page.addView(metricGrid(metrics.toArray(new MetricValue[0])));
    }

    if (canViewTables) {
      page.addView(UiKit.sectionTitle(this, "Masalar"));
      if (data.tables.isEmpty()) {
        page.addView(emptyCard("Masa verisi yayınlanmamış", "Masaüstünden Android özetini yayınlayın."));
      }
      for (OperationData.TableRecord table : data.tables) {
        page.addView(tableCard(table));
      }
    }

    if (canViewOrders) {
      page.addView(UiKit.sectionTitle(this, "Aktif adisyonlar"));
      if (data.tableOrders.isEmpty()) {
        page.addView(emptyCard("Aktif adisyon yok", "Sipariş açılan masalar burada ayrıca görünür."));
      }
      for (OperationData.TableOrder order : data.tableOrders) {
        page.addView(activeOrderCard(order));
      }
    }

    if (canViewMenu) {
      page.addView(UiKit.sectionTitle(this, "Menü"));
      if (data.menuItems.isEmpty()) {
        page.addView(emptyCard("Menü ürünü yok", "Menü masaüstünden yayınlandığında burada görünür."));
      }
      for (OperationData.MenuItem item : data.menuItems) {
        if (item.available) {
          page.addView(menuOverviewCard(item));
        }
      }
    }

    if (canViewTasks) {
      page.addView(UiKit.sectionTitle(this, "Servis işleri"));
      int serviceTasks = 0;
      for (OperationData.TaskRecord task : data.tasks) {
        if (isRestaurantTask(task)) {
          page.addView(taskCard(task, false));
          serviceTasks += 1;
        }
      }
      if (serviceTasks == 0) {
        page.addView(emptyCard("Açık servis işi yok", "Servis görevleri masaüstünden yayınlandığında burada görünür."));
      }
    }
    return UiKit.scroll(this, page);
  }

  private View messagesScreen() {
    LinearLayout page = UiKit.column(this);
    page.addView(screenIntro("MESAJLAR", "Hazır cevaplar", "Metni kopyalayın, WhatsApp uygulamasında açın veya müşteriyi arayın.", false));
    page.addView(metricGrid(new MetricValue[] {
        new MetricValue("Hazır mesaj", data.messages.size(), "Kullanıma hazır", UiKit.PRIMARY),
        new MetricValue("Cevap bekleyen", countWaitingRequests(), "Müşteri", UiKit.WARNING)
    }));
    page.addView(UiKit.sectionTitle(this, "Hazır mesajlar"));
    if (data.messages.isEmpty()) {
      page.addView(emptyCard("Hazır mesaj yok", "Masaüstünde hazırlanan cevaplar burada görünür."));
    }
    for (OperationData.MessageRecord message : data.messages) {
      page.addView(messageCard(message));
    }
    return UiKit.scroll(this, page);
  }

  private View settingsScreen() {
    LinearLayout page = UiKit.column(this);
    page.addView(screenIntro("AYARLAR", "Bağlantı ve işlem durumu", "Telefon yalnız web modülü üzerinden masaüstüyle güvenli biçimde haberleşir.", false));

    webModuleInput = null;
    syncSecretInput = null;
    boolean embeddedConnectionLocked = ConnectionSettings.isEmbeddedConnectionLocked();
    boolean canEditSettings = !embeddedConnectionLocked
        && (!data.permissionsResolved || data.hasPermission("settings.edit"));
    if (canEditSettings) {
      LinearLayout connection = UiKit.card(this);
      connection.addView(UiKit.text(this, "Web modül adresi", 12, UiKit.MUTED, Typeface.BOLD));
      webModuleInput = UiKit.input(this, "https://firma.example/yardimci-asistan");
      webModuleInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
      webModuleInput.setText(ConnectionSettings.webModuleUrl(preferences));
      LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 50));
      inputParams.setMargins(0, UiKit.dp(this, 6), 0, UiKit.dp(this, 12));
      webModuleInput.setLayoutParams(inputParams);
      connection.addView(webModuleInput);

      connection.addView(UiKit.text(this, "Güvenlik anahtarı", 12, UiKit.MUTED, Typeface.BOLD));
      syncSecretInput = UiKit.input(this, "Uzun güvenlik anahtarı");
      syncSecretInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
      syncSecretInput.setText(ConnectionSettings.syncSecret(preferences));
      LinearLayout.LayoutParams secretParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 50));
      secretParams.setMargins(0, UiKit.dp(this, 6), 0, UiKit.dp(this, 12));
      syncSecretInput.setLayoutParams(secretParams);
      connection.addView(syncSecretInput);

      Button refresh = UiKit.button(this, loading ? "Bağlanıyor..." : "Canlı Veriyi Çek", UiKit.PRIMARY, view -> syncFromHosting(true));
      refresh.setEnabled(!loading);
      refresh.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 48)));
      connection.addView(refresh);
      page.addView(connection);
    } else {
      LinearLayout readOnly = UiKit.card(this);
      readOnly.addView(UiKit.text(this, embeddedConnectionLocked ? "Bağlantı bilgileri APK içinde hazır" : "Bağlantı ayarları salt okunur", 14, UiKit.TEXT, Typeface.BOLD));
      readOnly.addView(UiKit.text(this, embeddedConnectionLocked
          ? "Tasarım süresince web bağlantısı bu APK'ya sabitlendi ve uygulama güncellendiğinde otomatik olarak korunur."
          : "Web modül adresi ve güvenlik anahtarı yalnız ayar düzenleme yetkisi olan cihazlarda değiştirilebilir.", 12, UiKit.MUTED, Typeface.NORMAL));
      page.addView(readOnly);
    }

    page.addView(UiKit.sectionTitle(this, "Bağlantı özeti"));
    LinearLayout state = UiKit.card(this);
    state.addView(settingLine("Bağlantı durumu", connectionState, connectionTone()));
    state.addView(UiKit.divider(this));
    state.addView(settingLine("Son senkron", data.pulledAt.isEmpty() ? "Henüz yok" : shortTimestamp(data.pulledAt), UiKit.INFO));
    state.addView(UiKit.divider(this));
    int visiblePendingActions = data.pendingActions + localPendingActionCount();
    state.addView(settingLine("Bekleyen işlem", String.valueOf(visiblePendingActions), visiblePendingActions > 0 ? UiKit.WARNING : UiKit.SUCCESS));
    state.addView(UiKit.divider(this));
    state.addView(settingLine("Telefon kimliği", compactDeviceId(), UiKit.MUTED));
    state.addView(UiKit.divider(this));
    state.addView(settingLine("Cihaz adı", identity.deviceName, UiKit.MUTED));
    state.addView(UiKit.divider(this));
    state.addView(settingLine("Yetki profili", data.deviceRoleLabel(), data.deviceActive ? UiKit.SUCCESS : UiKit.DANGER));
    page.addView(state);

    page.addView(UiKit.sectionTitle(this, "Son telefon işlemleri"));
    if (data.actions.isEmpty()) {
      page.addView(emptyCard("Gönderilmiş işlem yok", "Telefondan yaptığınız değişiklikler burada bekliyor, uygulandı veya hata durumuyla görünür."));
    }
    for (OperationData.ActionRecord action : data.actions) {
      page.addView(actionCard(action));
    }
    return UiKit.scroll(this, page);
  }

  private View screenIntro(String eyebrow, String title, String description, boolean includeRefresh) {
    LinearLayout intro = UiKit.column(this);
    intro.setPadding(0, UiKit.dp(this, 8), 0, UiKit.dp(this, 12));
    intro.addView(UiKit.eyebrow(this, eyebrow));
    LinearLayout titleRow = UiKit.row(this);
    TextView titleView = UiKit.title(this, title);
    titleView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    titleRow.addView(titleView);
    if (includeRefresh) {
      Button refresh = UiKit.chip(this, loading ? "Bekleyin" : "Yenile", false, view -> syncFromHosting(false));
      refresh.setEnabled(!loading);
      titleRow.addView(refresh);
    }
    intro.addView(titleRow);
    intro.addView(UiKit.text(this, description, 13, UiKit.MUTED, Typeface.NORMAL));
    return intro;
  }

  private View metricGrid(MetricValue[] metrics) {
    LinearLayout grid = UiKit.column(this);
    for (int index = 0; index < metrics.length; index += 2) {
      LinearLayout row = UiKit.row(this);
      MetricValue first = metrics[index];
      View firstCard = UiKit.metric(this, first.label, String.valueOf(first.value), first.detail, first.tone);
      firstCard.setLayoutParams(UiKit.weighted(0, -2, 1f, this, 8));
      row.addView(firstCard);
      if (index + 1 < metrics.length) {
        MetricValue second = metrics[index + 1];
        View secondCard = UiKit.metric(this, second.label, String.valueOf(second.value), second.detail, second.tone);
        secondCard.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
        row.addView(secondCard);
      } else {
        View spacer = new View(this);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
        row.addView(spacer);
      }
      LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2);
      rowParams.setMargins(0, 0, 0, UiKit.dp(this, 8));
      row.setLayoutParams(rowParams);
      grid.addView(row);
    }
    return grid;
  }

  private View filterBar(String[][] options, String selected, FilterListener listener) {
    HorizontalScrollView scroll = new HorizontalScrollView(this);
    scroll.setHorizontalScrollBarEnabled(false);
    LinearLayout row = UiKit.row(this);
    row.setPadding(0, UiKit.dp(this, 3), 0, UiKit.dp(this, 6));
    for (String[] option : options) {
      row.addView(UiKit.chip(this, option[1], option[0].equals(selected), view -> listener.onSelect(option[0])));
    }
    scroll.addView(row);
    return scroll;
  }

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(this);
    card.addView(UiKit.text(this, title, 14, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(this, detail, 12, UiKit.MUTED, Typeface.NORMAL));
    return card;
  }

  private View todayRequestCard(OperationData.RequestRecord request) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView name = UiKit.text(this, request.customerName, 15, UiKit.TEXT, Typeface.BOLD);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    top.addView(statusBadge(formatRequestStatus(request.status), requestTone(request.status)));
    card.addView(top);
    card.addView(UiKit.text(this, formatRequestType(request.type) + " · " + requestDate(request), 12, UiKit.MUTED, Typeface.NORMAL));
    if (!request.message.isEmpty()) {
      TextView note = UiKit.text(this, ellipsize(request.message, 110), 13, UiKit.TEXT, Typeface.NORMAL);
      LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2);
      noteParams.setMargins(0, UiKit.dp(this, 7), 0, UiKit.dp(this, 9));
      note.setLayoutParams(noteParams);
      card.addView(note);
    }
    LinearLayout actions = UiKit.row(this);
    UiKit.addAction(actions, UiKit.button(this, "Talebi Aç", UiKit.PRIMARY, view -> showRequestDetail(request)), this);
    UiKit.addAction(actions, UiKit.outlineButton(this, "Ara", view -> openDialer(request.customerPhone)), this);
    card.addView(actions);
    return card;
  }

  private View requestCard(OperationData.RequestRecord request) {
    LinearLayout card = UiKit.card(this);
    card.setOnClickListener(view -> showRequestDetail(request));
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, request.customerName, 16, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(this, formatRequestType(request.type), 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(identity);
    top.addView(statusBadge(formatRequestStatus(request.status), requestTone(request.status)));
    card.addView(top);

    String meta = requestDate(request);
    if (request.guestCount > 0) {
      meta += " · " + request.guestCount + " kişi";
    }
    card.addView(UiKit.text(this, meta, 12, UiKit.MUTED, Typeface.NORMAL));
    if (!request.message.isEmpty()) {
      TextView note = UiKit.text(this, ellipsize(request.message, 150), 13, UiKit.TEXT, Typeface.NORMAL);
      LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2);
      noteParams.setMargins(0, UiKit.dp(this, 8), 0, UiKit.dp(this, 10));
      note.setLayoutParams(noteParams);
      card.addView(note);
    }
    LinearLayout actions = UiKit.row(this);
    UiKit.addAction(actions, UiKit.outlineButton(this, "Ara", view -> openDialer(request.customerPhone)), this);
    if (data.hasPermission("customer.respond")) {
      UiKit.addAction(actions, UiKit.outlineButton(this, "WhatsApp", view -> openWhatsApp(request.customerPhone, request.readyMessage())), this);
    }
    UiKit.addAction(actions, UiKit.button(this, "Aç", UiKit.PRIMARY, view -> showRequestDetail(request)), this);
    card.addView(actions);
    return card;
  }

  private View customerCard(OperationData.CustomerRecord customer) {
    LinearLayout card = UiKit.card(this);
    card.addView(UiKit.text(this, customer.fullName, 16, UiKit.TEXT, Typeface.BOLD));
    String counts = customer.requestCount + " talep · " + customer.reservationCount + " rezervasyon";
    card.addView(UiKit.text(this, counts, 12, UiKit.MUTED, Typeface.NORMAL));
    if (!customer.notes.isEmpty()) {
      TextView note = UiKit.text(this, ellipsize(customer.notes, 130), 13, UiKit.TEXT, Typeface.NORMAL);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(this, 7), 0, UiKit.dp(this, 9));
      note.setLayoutParams(params);
      card.addView(note);
    }
    LinearLayout actions = UiKit.row(this);
    UiKit.addAction(actions, UiKit.outlineButton(this, "Ara", view -> openDialer(customer.phone)), this);
    if (data.hasPermission("customer.respond")) {
      UiKit.addAction(actions, UiKit.button(this, "WhatsApp", UiKit.PRIMARY, view -> openWhatsApp(customer.phone, "")), this);
    }
    card.addView(actions);
    return card;
  }

  private View reservationCard(OperationData.ReservationRecord reservation, boolean compact) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView title = UiKit.text(this, reservation.customerName.isEmpty() ? reservation.title : reservation.customerName, 15, UiKit.TEXT, Typeface.BOLD);
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(title);
    top.addView(statusBadge(formatReservationStatus(reservation.status), reservationTone(reservation.status)));
    card.addView(top);
    String dates = joinDateRange(reservation.startDate, reservation.endDate);
    if (!reservation.time.isEmpty()) {
      dates += " · " + reservation.time;
    }
    if (reservation.guestCount > 0) {
      dates += " · " + reservation.guestCount + " kişi";
    }
    card.addView(UiKit.text(this, dates, 12, UiKit.MUTED, Typeface.NORMAL));
    if (!reservation.roomIds.isEmpty()) {
      card.addView(UiKit.text(this, "Oda: " + namesForRooms(reservation.roomIds), 12, UiKit.MUTED, Typeface.NORMAL));
    }
    if (!compact && !reservation.notes.isEmpty()) {
      TextView notes = UiKit.text(this, ellipsize(reservation.notes, 140), 13, UiKit.TEXT, Typeface.NORMAL);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(this, 7), 0, UiKit.dp(this, 8));
      notes.setLayoutParams(params);
      card.addView(notes);
    }
    LinearLayout contact = UiKit.row(this);
    UiKit.addAction(contact, UiKit.outlineButton(this, "Ara", view -> openDialer(reservation.customerPhone)), this);
    if (data.hasPermission("customer.respond")) {
      UiKit.addAction(contact, UiKit.outlineButton(this, "WhatsApp", view -> openWhatsApp(reservation.customerPhone, reservationMessage(reservation))), this);
    }
    card.addView(contact);
    if ("pending".equals(reservation.status)
        && (data.hasPermission("reservation.approve") || data.hasPermission("reservation.reject"))) {
      LinearLayout decisions = UiKit.row(this);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(this, 7), 0, 0);
      decisions.setLayoutParams(params);
      if (data.hasPermission("reservation.approve")) {
        UiKit.addAction(decisions, UiKit.button(this, "Onayla", UiKit.PRIMARY, view -> sendReservationAction(reservation, "reservation_approve", "Rezervasyon onayı gönderildi.")), this);
      }
      if (data.hasPermission("reservation.reject")) {
        UiKit.addAction(decisions, UiKit.dangerButton(this, "Reddet", view -> confirm("Rezervasyonu reddet", reservation.customerName + " rezervasyonu reddedilsin mi?", () -> sendReservationAction(reservation, "reservation_reject", "Rezervasyon reddi gönderildi."))), this);
      }
      card.addView(decisions);
    } else if ("approved".equals(reservation.status) && data.hasPermission("reservation.cancel")) {
      Button cancel = UiKit.dangerButton(this, "Rezervasyonu İptal Et", view -> confirm("Rezervasyonu iptal et", "Bu rezervasyon iptal edilsin mi?", () -> sendReservationAction(reservation, "reservation_cancel", "Rezervasyon iptali gönderildi.")));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 44));
      params.setMargins(0, UiKit.dp(this, 7), 0, 0);
      cancel.setLayoutParams(params);
      card.addView(cancel);
    }
    return card;
  }

  private View roomCard(OperationData.RoomRecord room) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout name = UiKit.column(this);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    name.addView(UiKit.text(this, room.name, 15, UiKit.TEXT, Typeface.BOLD));
    name.addView(UiKit.text(this, (room.number.isEmpty() ? "" : room.number + " · ") + room.capacity + " kişi", 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(name);
    top.addView(statusBadge(formatRoomStatus(room.status), resourceTone(room.status)));
    card.addView(top);
    if (!room.activeReservation.isEmpty()) {
      card.addView(UiKit.text(this, room.activeReservation, 12, UiKit.INFO, Typeface.BOLD));
    }
    if (data.hasPermission("room.update_status")) {
      HorizontalScrollView scroll = new HorizontalScrollView(this);
      scroll.setHorizontalScrollBarEnabled(false);
      LinearLayout actions = UiKit.row(this);
      actions.setPadding(0, UiKit.dp(this, 9), 0, 0);
      actions.addView(statusChip("Boş", "available".equals(room.status), () -> updateRoom(room, "available")));
      actions.addView(statusChip("Dolu", "occupied".equals(room.status), () -> updateRoom(room, "occupied")));
      actions.addView(statusChip("Temizlik", "cleaning".equals(room.status), () -> updateRoom(room, "cleaning")));
      actions.addView(statusChip("Bakım", "maintenance".equals(room.status), () -> updateRoom(room, "maintenance")));
      scroll.addView(actions);
      card.addView(scroll);
    }
    return card;
  }

  private View taskCard(OperationData.TaskRecord task, boolean compact) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout details = UiKit.column(this);
    details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    details.addView(UiKit.text(this, task.title, 15, UiKit.TEXT, Typeface.BOLD));
    String due = joinNonEmpty(" · ", task.dueDate, task.dueTime);
    details.addView(UiKit.text(this, due.isEmpty() ? "Saat belirtilmemiş" : due, 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(details);
    top.addView(statusBadge(formatTaskStatus(task.status), taskTone(task.status)));
    card.addView(top);
    if (!compact && !task.description.isEmpty()) {
      card.addView(UiKit.text(this, ellipsize(task.description, 130), 12, UiKit.MUTED, Typeface.NORMAL));
    }
    boolean canReopen = ("done".equals(task.status) || "cancelled".equals(task.status)) && data.hasPermission("daily_task.reopen");
    boolean canComplete = !"done".equals(task.status) && !"cancelled".equals(task.status) && data.hasPermission("daily_task.complete");
    if (canReopen || canComplete) {
      LinearLayout actions = UiKit.row(this);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(this, 9), 0, 0);
      actions.setLayoutParams(params);
      if (canReopen) {
        UiKit.addAction(actions, UiKit.button(this, "Yeniden Aç", UiKit.PRIMARY, view -> sendAction("daily_task_reopen", payload("task_id", task.id, "expected_updated_at", task.updatedAt), "Günlük iş yeniden açılmak üzere gönderildi.")), this);
      } else {
        UiKit.addAction(actions, UiKit.button(this, "Tamamla", UiKit.PRIMARY, view -> sendAction("daily_task_complete", payload("task_id", task.id, "expected_updated_at", task.updatedAt), "Günlük iş tamamlanmak üzere gönderildi.")), this);
      }
      card.addView(actions);
    }
    return card;
  }

  private View tableCard(OperationData.TableRecord table) {
    OperationData.TableOrder order = data.activeOrderForTable(table.id);
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, table.name, 16, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(this, joinNonEmpty(" · ", table.area, table.capacity + " kişi"), 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(identity);
    top.addView(statusBadge(formatTableStatus(table.status), resourceTone(table.status)));
    card.addView(top);

    if (order != null) {
      TextView orderState = UiKit.text(this, "Adisyon: " + formatOrderStatus(order.status), 12, orderTone(order.status), Typeface.BOLD);
      LinearLayout.LayoutParams orderStateParams = new LinearLayout.LayoutParams(-1, -2);
      orderStateParams.setMargins(0, UiKit.dp(this, 7), 0, 0);
      orderState.setLayoutParams(orderStateParams);
      card.addView(orderState);
      card.addView(UiKit.text(this, order.itemCount + " ürün · " + money(order.total, orderCurrency(order)), 14, UiKit.TEXT, Typeface.BOLD));
    } else if (!table.activeReservation.isEmpty()) {
      card.addView(UiKit.text(this, table.activeReservation, 12, UiKit.INFO, Typeface.BOLD));
    }

    LinearLayout primaryActions = UiKit.row(this);
    LinearLayout.LayoutParams primaryParams = new LinearLayout.LayoutParams(-1, -2);
    primaryParams.setMargins(0, UiKit.dp(this, 10), 0, 0);
    primaryActions.setLayoutParams(primaryParams);
    if (data.hasPermission("table_order.view")
        && (order != null || data.hasPermission("table_order.open"))) {
      UiKit.addAction(primaryActions, UiKit.button(this, order == null ? "Sipariş Aç" : "Siparişi Aç", UiKit.PRIMARY, view -> showTableOrder(table)), this);
    }
    if (order != null && data.hasPermission("table_order.set_payment_waiting")) {
      UiKit.addAction(primaryActions, UiKit.outlineButton(this, "Hesap Bekliyor", view -> sendOrderStatus(order, "payment")), this);
    }
    if (order != null && data.hasPermission("table_order.close_paid")) {
      UiKit.addAction(primaryActions, UiKit.button(this, "Ödendi / Kapat", UiKit.ACCENT, view -> confirm("Adisyonu kapat", table.name + " adisyonu ödendi olarak kapatılsın mı?", () -> closeOrder(order, "paid"))), this);
    }
    if (primaryActions.getChildCount() > 0) {
      card.addView(primaryActions);
    }

    if (order == null && data.hasPermission("table.update_status")) {
      HorizontalScrollView scroll = new HorizontalScrollView(this);
      scroll.setHorizontalScrollBarEnabled(false);
      LinearLayout statuses = UiKit.row(this);
      statuses.setPadding(0, UiKit.dp(this, 8), 0, 0);
      statuses.addView(statusChip("Boş", "available".equals(table.status), () -> updateTable(table, "available")));
      statuses.addView(statusChip("Dolu", "occupied".equals(table.status), () -> updateTable(table, "occupied")));
      statuses.addView(statusChip("Rezerve", "reserved".equals(table.status), () -> updateTable(table, "reserved")));
      statuses.addView(statusChip("Hesap", "bill_waiting".equals(table.status), () -> updateTable(table, "bill_waiting")));
      scroll.addView(statuses);
      card.addView(scroll);
    }
    return card;
  }

  private View menuOverviewCard(OperationData.MenuItem item) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout identity = UiKit.column(this);
    identity.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    identity.addView(UiKit.text(this, item.name, 15, UiKit.TEXT, Typeface.BOLD));
    identity.addView(UiKit.text(this, data.categoryName(item.categoryId), 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(identity);
    top.addView(UiKit.text(this, money(item.price, item.currency), 13, UiKit.PRIMARY, Typeface.BOLD));
    card.addView(top);
    if (!item.description.isEmpty()) {
      card.addView(UiKit.text(this, ellipsize(item.description, 120), 12, UiKit.MUTED, Typeface.NORMAL));
    }
    return card;
  }

  private View activeOrderCard(OperationData.TableOrder order) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView table = UiKit.text(this, order.tableName, 15, UiKit.TEXT, Typeface.BOLD);
    table.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(table);
    top.addView(statusBadge(formatOrderStatus(order.status), orderTone(order.status)));
    card.addView(top);
    card.addView(UiKit.text(this, order.itemCount + " ürün · " + money(order.total, orderCurrency(order)), 14, UiKit.TEXT, Typeface.BOLD));
    OperationData.TableRecord tableRecord = tableById(order.tableId);
    if (tableRecord != null && data.hasPermission("table_order.view")) {
      Button open = UiKit.button(this, "Adisyonu Aç", UiKit.PRIMARY, view -> showTableOrder(tableRecord));
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 44));
      params.setMargins(0, UiKit.dp(this, 8), 0, 0);
      open.setLayoutParams(params);
      card.addView(open);
    }
    return card;
  }

  private View messageCard(OperationData.MessageRecord message) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView name = UiKit.text(this, message.customerName, 15, UiKit.TEXT, Typeface.BOLD);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    top.addView(statusBadge("Hazır", UiKit.PRIMARY));
    card.addView(top);
    TextView body = UiKit.text(this, message.message, 13, UiKit.TEXT, Typeface.NORMAL);
    body.setPadding(0, UiKit.dp(this, 7), 0, UiKit.dp(this, 10));
    card.addView(body);
    if (data.hasPermission("customer.respond")) {
      LinearLayout first = UiKit.row(this);
      UiKit.addAction(first, UiKit.outlineButton(this, "Kopyala", view -> copyText(message.message)), this);
      UiKit.addAction(first, UiKit.button(this, "WhatsApp'ta Aç", UiKit.PRIMARY, view -> openWhatsApp(message.customerPhone, message.message)), this);
      card.addView(first);
    }
    LinearLayout second = UiKit.row(this);
    LinearLayout.LayoutParams secondParams = new LinearLayout.LayoutParams(-1, -2);
    secondParams.setMargins(0, UiKit.dp(this, 7), 0, 0);
    second.setLayoutParams(secondParams);
    UiKit.addAction(second, UiKit.outlineButton(this, "Müşteriyi Ara", view -> openDialer(message.customerPhone)), this);
    if (!message.requestId.isEmpty() && data.hasPermission("customer.mark_answered")) {
      OperationData.RequestRecord request = data.requestById(message.requestId);
      String expectedUpdatedAt = request == null ? "" : request.updatedAt;
      UiKit.addAction(second, UiKit.outlineButton(this, "Cevaplandı", view -> sendAction("customer_request_mark_answered", payload(
          "request_id", message.requestId,
          "message_id", message.id,
          "expected_updated_at", expectedUpdatedAt
      ), "Talep cevaplandı olarak gönderildi.")), this);
    }
    card.addView(second);
    return card;
  }

  private View actionCard(OperationData.ActionRecord action) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    TextView label = UiKit.text(this, formatActionType(action.type), 14, UiKit.TEXT, Typeface.BOLD);
    label.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(label);
    top.addView(statusBadge(formatActionStatus(action.status), actionTone(action.status)));
    card.addView(top);
    card.addView(UiKit.text(this, shortTimestamp(action.createdAt), 11, UiKit.MUTED, Typeface.NORMAL));
    if (!action.errorMessage.isEmpty()) {
      TextView error = UiKit.text(this, action.errorMessage, 12, UiKit.DANGER, Typeface.NORMAL);
      error.setPadding(0, UiKit.dp(this, 6), 0, 0);
      card.addView(error);
    }
    return card;
  }

  private View settingLine(String label, String value, int tone) {
    LinearLayout row = UiKit.row(this);
    TextView title = UiKit.text(this, label, 13, UiKit.MUTED, Typeface.BOLD);
    title.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    row.addView(title);
    TextView detail = UiKit.text(this, value, 13, tone, Typeface.BOLD);
    detail.setGravity(Gravity.END);
    detail.setMaxWidth(UiKit.dp(this, 190));
    row.addView(detail);
    return row;
  }

  private TextView statusBadge(String label, int tone) {
    return UiKit.badge(this, label, tone);
  }

  private Button statusChip(String label, boolean selected, Runnable action) {
    return UiKit.chip(this, label, selected, view -> action.run());
  }

  private void showRequestDetail(OperationData.RequestRecord request) {
    Dialog dialog = new Dialog(this);
    LinearLayout shell = UiKit.column(this);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(this, 16), UiKit.dp(this, 14), UiKit.dp(this, 16), UiKit.dp(this, 20));

    LinearLayout header = UiKit.row(this);
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "TALEP DETAYI"));
    heading.addView(UiKit.title(this, request.customerName));
    header.addView(heading);
    Button close = UiKit.outlineButton(this, "Kapat", view -> dialog.dismiss());
    close.setLayoutParams(new LinearLayout.LayoutParams(-2, UiKit.dp(this, 44)));
    header.addView(close);
    shell.addView(header);

    LinearLayout page = UiKit.column(this);
    LinearLayout summary = UiKit.card(this);
    summary.addView(detailLine("Talep", formatRequestType(request.type)));
    summary.addView(UiKit.divider(this));
    summary.addView(detailLine("Tarih / kişi", requestDate(request) + (request.guestCount > 0 ? " · " + request.guestCount + " kişi" : "")));
    summary.addView(UiKit.divider(this));
    summary.addView(detailLine("Durum", formatRequestStatus(request.status)));
    if (!request.message.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(UiKit.text(this, request.message, 14, UiKit.TEXT, Typeface.NORMAL));
    }
    if (!request.aiSummary.isEmpty()) {
      summary.addView(UiKit.divider(this));
      summary.addView(UiKit.text(this, "Kısa özet", 12, UiKit.PRIMARY, Typeface.BOLD));
      summary.addView(UiKit.text(this, request.aiSummary, 13, UiKit.TEXT, Typeface.NORMAL));
    }
    page.addView(summary);

    page.addView(UiKit.sectionTitle(this, "İletişim"));
    LinearLayout contact = UiKit.row(this);
    UiKit.addAction(contact, UiKit.outlineButton(this, "Ara", view -> openDialer(request.customerPhone)), this);
    if (data.hasPermission("customer.respond")) {
      UiKit.addAction(contact, UiKit.button(this, "WhatsApp", UiKit.PRIMARY, view -> openWhatsApp(request.customerPhone, request.readyMessage())), this);
    }
    page.addView(contact);

    String readyMessage = request.readyMessage();
    if (!readyMessage.isEmpty() && data.hasPermission("customer.respond")) {
      Button ready = UiKit.outlineButton(this, "Hazır Cevabı Göster", view -> showPreparedReply(request.customerName, readyMessage));
      LinearLayout.LayoutParams readyParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
      readyParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      ready.setLayoutParams(readyParams);
      page.addView(ready);
    }

    boolean canConvert = data.hasPermission("customer.convert_to_reservation");
    boolean canRespond = data.hasPermission("customer.respond");
    boolean canReject = data.hasPermission("customer.reject");
    boolean canMarkAnswered = data.hasPermission("customer.mark_answered");
    if (canConvert || canRespond || canReject || canMarkAnswered) {
      page.addView(UiKit.sectionTitle(this, "Hızlı karar"));
    }
    if (canConvert) {
      Button convert = UiKit.button(this, "Rezervasyona Çevir", UiKit.PRIMARY, view -> {
        sendAction("customer_request_convert_to_reservation", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep rezervasyona çevrilmek üzere gönderildi.");
        dialog.dismiss();
      });
      convert.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46)));
      page.addView(convert);
    }

    if (canRespond || canReject) {
      LinearLayout decisions = UiKit.row(this);
      LinearLayout.LayoutParams decisionParams = new LinearLayout.LayoutParams(-1, -2);
      decisionParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      decisions.setLayoutParams(decisionParams);
      if (canRespond) {
        UiKit.addAction(decisions, UiKit.outlineButton(this, "Onayla", view -> {
          sendAction("customer_request_approve", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep onayı gönderildi.");
          dialog.dismiss();
        }), this);
      }
      if (canReject) {
        UiKit.addAction(decisions, UiKit.dangerButton(this, "Reddet", view -> confirm("Talebi reddet", request.customerName + " talebi reddedilsin mi?", () -> {
          sendAction("customer_request_reject", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep reddi gönderildi.");
          dialog.dismiss();
        })), this);
      }
      page.addView(decisions);
    }

    if (canMarkAnswered || canRespond) {
      LinearLayout response = UiKit.row(this);
      LinearLayout.LayoutParams responseParams = new LinearLayout.LayoutParams(-1, -2);
      responseParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      response.setLayoutParams(responseParams);
      if (canMarkAnswered) {
        UiKit.addAction(response, UiKit.button(this, "Cevaplandı", UiKit.ACCENT, view -> {
          sendAction("customer_request_mark_answered", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep cevaplandı olarak gönderildi.");
          dialog.dismiss();
        }), this);
      }
      if (canRespond) {
        UiKit.addAction(response, UiKit.outlineButton(this, "Yeniden Aç", view -> {
          sendAction("customer_request_reopen", payload("request_id", request.id, "expected_updated_at", request.updatedAt), "Talep yeniden açılmak üzere gönderildi.");
          dialog.dismiss();
        }), this);
      }
      page.addView(response);
    }

    ScrollView scroll = UiKit.scroll(this, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.show();
    configureFullDialog(dialog);
  }

  private View detailLine(String label, String value) {
    LinearLayout row = UiKit.row(this);
    TextView labelView = UiKit.text(this, label, 12, UiKit.MUTED, Typeface.BOLD);
    labelView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 0.38f));
    row.addView(labelView);
    TextView valueView = UiKit.text(this, value, 13, UiKit.TEXT, Typeface.BOLD);
    valueView.setGravity(Gravity.END);
    valueView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 0.62f));
    row.addView(valueView);
    return row;
  }

  private void showPreparedReply(String customerName, String message) {
    Dialog dialog = new Dialog(this);
    LinearLayout card = UiKit.column(this);
    card.setPadding(UiKit.dp(this, 18), UiKit.dp(this, 18), UiKit.dp(this, 18), UiKit.dp(this, 18));
    card.setBackground(UiKit.rounded(this, UiKit.SURFACE, UiKit.BORDER, 18));
    card.addView(UiKit.eyebrow(this, "HAZIR CEVAP"));
    card.addView(UiKit.title(this, customerName));
    TextView messageView = UiKit.text(this, message, 14, UiKit.TEXT, Typeface.NORMAL);
    LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(-1, -2);
    messageParams.setMargins(0, UiKit.dp(this, 10), 0, UiKit.dp(this, 14));
    messageView.setLayoutParams(messageParams);
    card.addView(messageView);
    LinearLayout actions = UiKit.row(this);
    UiKit.addAction(actions, UiKit.outlineButton(this, "Kopyala", view -> copyText(message)), this);
    UiKit.addAction(actions, UiKit.button(this, "Kapat", UiKit.PRIMARY, view -> dialog.dismiss()), this);
    card.addView(actions);
    dialog.setContentView(card);
    dialog.show();
    Window window = dialog.getWindow();
    if (window != null) {
      window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
      window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
  }

  private void showTableOrder(OperationData.TableRecord table) {
    OperationData.TableOrder order = data.activeOrderForTable(table.id);
    Dialog dialog = new Dialog(this);
    LinearLayout shell = UiKit.column(this);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(this, 14), UiKit.dp(this, 12), UiKit.dp(this, 14), UiKit.dp(this, 16));

    LinearLayout header = UiKit.row(this);
    LinearLayout heading = UiKit.column(this);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(this, "MASA SİPARİŞİ"));
    heading.addView(UiKit.title(this, table.name));
    header.addView(heading);
    Button close = UiKit.outlineButton(this, "Kapat", view -> dialog.dismiss());
    close.setLayoutParams(new LinearLayout.LayoutParams(-2, UiKit.dp(this, 44)));
    header.addView(close);
    shell.addView(header);

    LinearLayout page = UiKit.column(this);
    LinearLayout state = UiKit.card(this);
    state.addView(UiKit.text(this, order == null ? "Aktif adisyon yok" : "Adisyon: " + formatOrderStatus(order.status), 14, order == null ? UiKit.WARNING : orderTone(order.status), Typeface.BOLD));
    state.addView(UiKit.text(this, order == null
        ? "İlk üründe adisyon açma ve ürün ekleme işlemleri sırayla kuyruğa alınır."
        : order.itemCount + " ürün · " + money(order.total, orderCurrency(order)), 12, UiKit.MUTED, Typeface.NORMAL));
    page.addView(state);

    if (data.hasPermission("menu.view")) {
      page.addView(UiKit.sectionTitle(this, "Kategori ve ürün arama"));
      final String[] category = {""};
      final String[] query = {""};
      LinearLayout categoryRow = UiKit.row(this);
      HorizontalScrollView categoryScroll = new HorizontalScrollView(this);
      categoryScroll.setHorizontalScrollBarEnabled(false);
      categoryScroll.addView(categoryRow);
      page.addView(categoryScroll);

      EditText search = UiKit.input(this, "Ürün ara");
      LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 50));
      searchParams.setMargins(0, UiKit.dp(this, 7), 0, UiKit.dp(this, 8));
      search.setLayoutParams(searchParams);
      page.addView(search);

      LinearLayout menuContainer = UiKit.column(this);
      page.addView(menuContainer);
      final Runnable[] refreshMenu = new Runnable[1];
      refreshMenu[0] = () -> {
        categoryRow.removeAllViews();
        categoryRow.addView(UiKit.chip(this, "Tümü", category[0].isEmpty(), view -> {
          category[0] = "";
          refreshMenu[0].run();
        }));
        for (OperationData.MenuCategory menuCategory : data.categories) {
          categoryRow.addView(UiKit.chip(this, menuCategory.name, menuCategory.id.equals(category[0]), view -> {
            category[0] = menuCategory.id;
            refreshMenu[0].run();
          }));
        }
        renderOrderMenuItems(menuContainer, table, order, category[0], query[0]);
      };
      search.addTextChangedListener(new TextWatcher() {
        @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) {}
        @Override public void onTextChanged(CharSequence text, int start, int before, int count) {
          query[0] = text == null ? "" : text.toString().trim();
          renderOrderMenuItems(menuContainer, table, order, category[0], query[0]);
        }
        @Override public void afterTextChanged(Editable editable) {}
      });
      refreshMenu[0].run();
    }

    page.addView(UiKit.sectionTitle(this, "Aktif adisyon satırları"));
    if (order == null || order.items.isEmpty()) {
      page.addView(emptyCard("Henüz ürün yok", "Menüden Ekle'ye dokunarak siparişi başlatın."));
    } else {
      for (OperationData.TableOrderItem item : order.items) {
        page.addView(orderItemCard(item));
      }
    }

    LinearLayout total = UiKit.card(this);
    total.addView(settingLine("Toplam", order == null ? money(0, "TRY") : money(order.total, orderCurrency(order)), UiKit.PRIMARY));
    page.addView(total);

    page.addView(UiKit.sectionTitle(this, "Sipariş durumu"));
    if (order == null && data.hasPermission("table_order.open")) {
      Button save = UiKit.button(this, "Siparişi Kaydet", UiKit.PRIMARY, view ->
          sendAction("table_order_open", payload("table_id", table.id, "expected_table_updated_at", table.updatedAt), "Masa siparişi açılmak üzere gönderildi."));
      save.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 48)));
      page.addView(save);
    }

    if (order != null) {
      if (data.hasPermission("table_order.set_preparing") || data.hasPermission("table_order.set_served")) {
        LinearLayout service = UiKit.row(this);
        LinearLayout.LayoutParams serviceParams = new LinearLayout.LayoutParams(-1, -2);
        serviceParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
        service.setLayoutParams(serviceParams);
        if (data.hasPermission("table_order.set_preparing")) {
          UiKit.addAction(service, UiKit.outlineButton(this, "Hazırlanıyor", view -> sendOrderStatus(order, "preparing")), this);
        }
        if (data.hasPermission("table_order.set_served")) {
          UiKit.addAction(service, UiKit.outlineButton(this, "Servis Edildi", view -> sendOrderStatus(order, "served")), this);
        }
        page.addView(service);
      }

      if (data.hasPermission("table_order.set_payment_waiting") || data.hasPermission("table_order.close_paid")) {
        LinearLayout payment = UiKit.row(this);
        LinearLayout.LayoutParams paymentParams = new LinearLayout.LayoutParams(-1, -2);
        paymentParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
        payment.setLayoutParams(paymentParams);
        if (data.hasPermission("table_order.set_payment_waiting")) {
          UiKit.addAction(payment, UiKit.button(this, "Hesap Bekliyor", UiKit.ACCENT, view -> sendOrderStatus(order, "payment")), this);
        }
        if (data.hasPermission("table_order.close_paid")) {
          UiKit.addAction(payment, UiKit.button(this, "Ödendi / Kapat", UiKit.PRIMARY, view -> confirm("Adisyonu kapat", "Adisyon ödendi olarak kapatılsın mı?", () -> {
            closeOrder(order, "paid");
            dialog.dismiss();
          })), this);
        }
        page.addView(payment);
      }

      if (data.hasPermission("table_order.cancel")) {
        Button cancel = UiKit.dangerButton(this, "İptal", view -> confirm("Adisyonu iptal et", "Adisyon iptal edilip masa boşaltılsın mı?", () -> {
          closeOrder(order, "cancelled");
          dialog.dismiss();
        }));
        LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));
        cancelParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
        cancel.setLayoutParams(cancelParams);
        page.addView(cancel);
      }
    }

    ScrollView scroll = UiKit.scroll(this, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.show();
    configureFullDialog(dialog);
  }

  private void renderOrderMenuItems(
      LinearLayout container,
      OperationData.TableRecord table,
      OperationData.TableOrder order,
      String categoryId,
      String search
  ) {
    container.removeAllViews();
    String normalizedSearch = search.toLowerCase(new Locale("tr", "TR"));
    int shown = 0;
    for (OperationData.MenuItem item : data.menuItems) {
      if (!item.available || (!categoryId.isEmpty() && !categoryId.equals(item.categoryId))) {
        continue;
      }
      if (!normalizedSearch.isEmpty()
          && !item.name.toLowerCase(new Locale("tr", "TR")).contains(normalizedSearch)
          && !item.description.toLowerCase(new Locale("tr", "TR")).contains(normalizedSearch)) {
        continue;
      }
      LinearLayout card = UiKit.card(this);
      LinearLayout row = UiKit.row(this);
      LinearLayout details = UiKit.column(this);
      details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
      details.addView(UiKit.text(this, item.name, 14, UiKit.TEXT, Typeface.BOLD));
      details.addView(UiKit.text(this, data.categoryName(item.categoryId) + " · " + money(item.price, item.currency), 12, UiKit.MUTED, Typeface.NORMAL));
      row.addView(details);
      boolean canAdd = data.hasPermission("table_order.add_item")
          && (order != null || data.hasPermission("table_order.open"));
      if (canAdd) {
        Button add = UiKit.button(this, "Ekle", UiKit.PRIMARY, view -> addOrderItem(table, order, item));
        add.setLayoutParams(new LinearLayout.LayoutParams(UiKit.dp(this, 82), UiKit.dp(this, 44)));
        row.addView(add);
      }
      card.addView(row);
      container.addView(card);
      shown += 1;
    }
    if (shown == 0) {
      container.addView(emptyCard("Ürün bulunamadı", "Arama veya kategori filtresini değiştirin."));
    }
  }

  private View orderItemCard(OperationData.TableOrderItem item) {
    LinearLayout card = UiKit.card(this);
    LinearLayout top = UiKit.row(this);
    LinearLayout details = UiKit.column(this);
    details.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    details.addView(UiKit.text(this, item.productName, 14, UiKit.TEXT, Typeface.BOLD));
    details.addView(UiKit.text(this, money(item.unitPrice, item.currency) + " · " + money(item.lineTotal, item.currency), 12, UiKit.MUTED, Typeface.NORMAL));
    top.addView(details);
    TextView quantity = statusBadge(String.valueOf(item.quantity), UiKit.PRIMARY);
    top.addView(quantity);
    card.addView(top);

    if (data.hasPermission("table_order.update_item") || data.hasPermission("table_order.remove_item")) {
      LinearLayout actions = UiKit.row(this);
      LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(-1, -2);
      actionParams.setMargins(0, UiKit.dp(this, 8), 0, 0);
      actions.setLayoutParams(actionParams);
      if (data.hasPermission("table_order.update_item")) {
        Button minus = UiKit.outlineButton(this, "−", view -> {
          if (item.quantity > 1) {
            sendAction("table_order_update_item_quantity", payload("item_id", item.id, "quantity", item.quantity - 1, "expected_item_updated_at", item.updatedAt), "Ürün adedi azaltılmak üzere gönderildi.");
          }
        });
        minus.setEnabled(item.quantity > 1);
        UiKit.addAction(actions, minus, this);
        UiKit.addAction(actions, UiKit.outlineButton(this, "+", view -> sendAction("table_order_update_item_quantity", payload("item_id", item.id, "quantity", item.quantity + 1, "expected_item_updated_at", item.updatedAt), "Ürün adedi artırılmak üzere gönderildi.")), this);
      }
      if (data.hasPermission("table_order.remove_item")) {
        UiKit.addAction(actions, UiKit.dangerButton(this, "Sil", view -> confirm("Ürünü sil", item.productName + " adisyondan kaldırılsın mı?", () -> sendAction("table_order_remove_item", payload("item_id", item.id, "expected_item_updated_at", item.updatedAt), "Ürün silinmek üzere gönderildi."))), this);
      }
      card.addView(actions);
    }
    return card;
  }

  private void addOrderItem(OperationData.TableRecord table, OperationData.TableOrder order, OperationData.MenuItem item) {
    if (order == null) {
      ArrayList<ActionSpec> actions = new ArrayList<>();
      ActionSpec openAction = new ActionSpec("table_order_open", payload(
          "table_id", table.id,
          "expected_table_updated_at", table.updatedAt
      ));
      actions.add(openAction);
      actions.add(new ActionSpec("table_order_add_item", payload(
          "table_id", table.id,
          "menu_item_id", item.id,
          "quantity", 1,
          "depends_on_action_id", openAction.id
      )));
      sendActions(actions, item.name + " için adisyon açma ve ekleme işlemleri gönderildi.");
    } else {
      sendAction("table_order_add_item", payload(
          "order_id", order.id,
          "table_id", table.id,
          "menu_item_id", item.id,
          "quantity", 1,
          "expected_order_updated_at", order.updatedAt
      ), item.name + " adisyona eklenmek üzere gönderildi.");
    }
  }

  private void sendOrderStatus(OperationData.TableOrder order, String status) {
    String actionType = "served".equals(status)
        ? "table_order_set_served"
        : ("payment".equals(status) ? "table_order_set_payment_waiting" : "table_order_set_preparing");
    sendAction(actionType, payload("order_id", order.id, "table_id", order.tableId, "status", status, "expected_updated_at", order.updatedAt), "Adisyon durumu güncellenmek üzere gönderildi.");
  }

  private void closeOrder(OperationData.TableOrder order, String status) {
    String actionType = "paid".equals(status) ? "table_order_close_paid" : "table_order_cancel";
    sendAction(actionType, payload("order_id", order.id, "table_id", order.tableId, "status", status, "expected_updated_at", order.updatedAt), "Adisyon kapatma işlemi gönderildi.");
  }

  private void updateRoom(OperationData.RoomRecord room, String status) {
    sendAction("room_status_update", payload("room_id", room.id, "status", status, "expected_updated_at", room.updatedAt), room.name + " durumu güncellenmek üzere gönderildi.");
  }

  private void updateTable(OperationData.TableRecord table, String status) {
    sendAction("table_status_update", payload("table_id", table.id, "status", status, "expected_updated_at", table.updatedAt), table.name + " durumu güncellenmek üzere gönderildi.");
  }

  private void sendReservationAction(OperationData.ReservationRecord reservation, String actionType, String message) {
    sendAction(actionType, payload("reservation_id", reservation.id, "expected_updated_at", reservation.updatedAt), message);
  }

  private void syncFromHosting(boolean readSettingsInputs) {
    if (loading) {
      return;
    }
    if (readSettingsInputs && data.permissionsResolved && !data.hasPermission("settings.edit")) {
      showError("Bu cihazın bağlantı ayarlarını değiştirme yetkisi yok.");
      return;
    }
    String baseUrl = readSettingsInputs && webModuleInput != null
        ? webModuleInput.getText().toString().trim()
        : ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = readSettingsInputs && syncSecretInput != null
        ? syncSecretInput.getText().toString().trim()
        : ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty()) {
      showError("Web modül adresi gerekli.");
      return;
    }
    if (syncSecret.isEmpty()) {
      showError("Güvenlik anahtarı gerekli.");
      return;
    }

    final List<ActionOutbox.PendingAction> pendingToRetry;
    try {
      pendingToRetry = actionOutbox.load();
      for (ActionOutbox.PendingAction pending : pendingToRetry) {
        if (!pending.matchesTarget(baseUrl, syncSecret)) {
          showError("Telefonda önceki bağlantıya ait bekleyen işlem var. Önce eski bağlantı bilgileriyle işlemi gönderin.");
          return;
        }
      }
    } catch (ActionOutbox.OutboxException error) {
      showError(error.getMessage());
      return;
    }

    preferences.edit()
        .putString(ConnectionSettings.KEY_WEB_MODULE_URL, baseUrl)
        .putString(ConnectionSettings.KEY_SYNC_SECRET, syncSecret)
        .apply();
    loading = true;
    connectionState = pendingToRetry.isEmpty() ? "Canlı veri çekiliyor" : "Bekleyen işlemler yeniden gönderiliyor";
    clearError();
    executor.execute(() -> {
      try {
        for (ActionOutbox.PendingAction pending : pendingToRetry) {
          syncClient.enqueueAction(baseUrl, syncSecret, identity, pending.id, pending.type, pending.payload);
          actionOutbox.remove(pending.id);
        }
        HostingSyncClient.FetchResult fetched = syncClient.fetchOperations(baseUrl, syncSecret, identity, data.serverRevision);
        final OperationData nextData;
        if (!fetched.notModified && fetched.data != null) {
          operationCache.save(fetched.payload);
          OperationData cachedData = operationCache.load();
          nextData = cachedData == null ? fetched.data : cachedData;
        } else {
          nextData = data;
          nextData.pulledAt = fetched.payload.optString("pulled_at", nextData.pulledAt);
          nextData.pendingActions = Math.max(0, fetched.payload.optInt("pending_action_count", nextData.pendingActions));
        }
        runOnUiThread(() -> {
          data = nextData;
          loading = false;
          connectionState = "Bağlantı hazır";
          clearError();
          if (!fetched.notModified || !pendingToRetry.isEmpty()) {
            render();
          }
        });
      } catch (HostingSyncClient.SyncException | ActionOutbox.OutboxException | OperationCache.CacheException error) {
        runOnUiThread(() -> {
          loading = false;
          connectionState = error.getMessage();
          showError(error.getMessage());
        });
      }
    });
  }

  private void sendAction(String actionType, JSONObject actionPayload, String successMessage) {
    ArrayList<ActionSpec> actions = new ArrayList<>();
    actions.add(new ActionSpec(actionType, actionPayload));
    sendActions(actions, successMessage);
  }

  private void sendActions(List<ActionSpec> actions, String successMessage) {
    if (loading) {
      Toast.makeText(this, "Devam eden bağlantı işleminin bitmesini bekleyin.", Toast.LENGTH_SHORT).show();
      return;
    }
    if (data.permissionsResolved && !data.deviceActive) {
      showError("Cihaz masaüstünde pasifleştirilmiş.");
      return;
    }
    for (ActionSpec action : actions) {
      String requiredPermission = requiredPermissionForAction(action.type, action.payload);
      if (requiredPermission == null || !data.hasPermission(requiredPermission)) {
        String message = "table_order.close_paid".equals(requiredPermission)
            ? "Bu cihazın hesap kapatma yetkisi yok."
            : "Bu cihazın bu işlem için yetkisi yok.";
        showError(message);
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        return;
      }
    }
    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    if (baseUrl.isEmpty() || syncSecret.isEmpty()) {
      showError("İşlem gönderilemedi. Ayarlar'dan bağlantıyı tamamlayın.");
      return;
    }

    try {
      if (!actionOutbox.load().isEmpty()) {
        Toast.makeText(this, "Önce telefonda bekleyen işlem yeniden gönderiliyor.", Toast.LENGTH_SHORT).show();
        syncFromHosting(false);
        return;
      }
    } catch (ActionOutbox.OutboxException error) {
      showError(error.getMessage());
      return;
    }
    if (data.pendingActions > 0) {
      showError("Önce masaüstünü bekleyen işlemleri uygulayın ve canlı veriyi yenileyin.");
      Toast.makeText(this, "Güncel sonuç alınmadan yeni işlem gönderilemez.", Toast.LENGTH_SHORT).show();
      return;
    }

    ArrayList<ActionOutbox.PendingAction> pendingActions = new ArrayList<>();
    try {
      for (ActionSpec action : actions) {
        pendingActions.add(ActionOutbox.PendingAction.create(
            action.id,
            action.type,
            action.payload,
            baseUrl,
            syncSecret
        ));
      }
      actionOutbox.appendAll(pendingActions);
    } catch (ActionOutbox.OutboxException error) {
      showError(error.getMessage());
      return;
    }

    loading = true;
    clearError();
    executor.execute(() -> {
      ArrayList<OperationData.ActionRecord> queued = new ArrayList<>();
      try {
        for (ActionOutbox.PendingAction action : pendingActions) {
          OperationData.ActionRecord accepted = syncClient.enqueueAction(baseUrl, syncSecret, identity, action.id, action.type, action.payload);
          actionOutbox.remove(action.id);
          queued.add(accepted);
        }
        runOnUiThread(() -> {
          loading = false;
          for (int index = queued.size() - 1; index >= 0; index -= 1) {
            data.actions.add(0, queued.get(index));
          }
          data.pendingActions += queued.size();
          clearError();
          render();
        });
      } catch (HostingSyncClient.SyncException | ActionOutbox.OutboxException error) {
        runOnUiThread(() -> {
          loading = false;
          if (!queued.isEmpty()) {
            for (int index = queued.size() - 1; index >= 0; index -= 1) {
              data.actions.add(0, queued.get(index));
            }
            data.pendingActions += queued.size();
          }
          showError(queued.isEmpty()
              ? "İşlem gönderilemedi. " + error.getMessage()
              : "İşlemin bir bölümü gönderildi; kalan bölüm gönderilemedi. " + error.getMessage());
          render();
        });
      }
    });
  }

  private void showError(String message) {
    errorBanner.setText(message);
    errorBanner.setTextColor(UiKit.DANGER);
    errorBanner.setBackground(UiKit.rounded(this, UiKit.withAlpha(UiKit.DANGER, 26), UiKit.withAlpha(UiKit.DANGER, 100), 11));
    errorBanner.setVisibility(View.VISIBLE);
  }

  private void clearError() {
    errorBanner.setText("");
    errorBanner.setVisibility(View.GONE);
  }

  private int localPendingActionCount() {
    if (actionOutbox == null) {
      return 0;
    }
    try {
      return actionOutbox.load().size();
    } catch (ActionOutbox.OutboxException ignored) {
      return 0;
    }
  }

  private OperationData.ActionRecord latestFailedAction() {
    for (OperationData.ActionRecord action : data.actions) {
      if ("failed".equals(action.status)) {
        return action;
      }
    }
    return null;
  }

  private String requiredPermissionForAction(String actionType, JSONObject actionPayload) {
    switch (actionType) {
      case "customer_request_approve":
      case "customer_request_reopen":
        return "customer.respond";
      case "customer_request_mark_answered":
        return "customer.mark_answered";
      case "customer_request_reject":
        return "customer.reject";
      case "customer_request_convert_to_reservation":
        return "customer.convert_to_reservation";
      case "reservation_approve":
        return "reservation.approve";
      case "reservation_reject":
        return "reservation.reject";
      case "reservation_cancel":
        return "reservation.cancel";
      case "room_status_update":
        return "room.update_status";
      case "daily_task_complete":
        return "daily_task.complete";
      case "daily_task_reopen":
        return "daily_task.reopen";
      case "table_status_update":
        return "table.update_status";
      case "table_order_open":
        return "table_order.open";
      case "table_order_add_item":
        return "table_order.add_item";
      case "table_order_update_item_quantity":
        return "table_order.update_item";
      case "table_order_remove_item":
        return "table_order.remove_item";
      case "table_order_set_preparing":
        return "table_order.set_preparing";
      case "table_order_set_served":
        return "table_order.set_served";
      case "table_order_set_payment_waiting":
        return "table_order.set_payment_waiting";
      case "table_order_close_paid":
        return "table_order.close_paid";
      case "table_order_cancel":
        return "table_order.cancel";
      case "table_order_set_status":
        String status = actionPayload.optString("status", "");
        if ("served".equals(status)) {
          return "table_order.set_served";
        }
        if ("payment".equals(status)) {
          return "table_order.set_payment_waiting";
        }
        return "table_order.set_preparing";
      case "table_order_close":
        return "paid".equals(actionPayload.optString("status", ""))
            ? "table_order.close_paid"
            : "table_order.cancel";
      default:
        return null;
    }
  }

  private void confirm(String title, String message, Runnable action) {
    AlertDialog dialog = new AlertDialog.Builder(this)
        .setTitle(title)
        .setMessage(message)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton("Devam Et", (value, which) -> action.run())
        .create();
    dialog.setOnShowListener(value -> {
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(UiKit.PRIMARY);
      dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(UiKit.MUTED);
    });
    dialog.show();
  }

  private void configureFullDialog(Dialog dialog) {
    Window window = dialog.getWindow();
    if (window != null) {
      window.setBackgroundDrawable(new ColorDrawable(UiKit.BG));
      window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }
  }

  private void openDialer(String phone) {
    if (phone == null || phone.trim().isEmpty()) {
      Toast.makeText(this, "Telefon numarası bulunamadı.", Toast.LENGTH_SHORT).show();
      return;
    }
    openIntent(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phone.trim()))), "Arama uygulaması açılamadı.");
  }

  private void openWhatsApp(String phone, String message) {
    String normalizedPhone = normalizeWhatsAppPhone(phone);
    if (normalizedPhone.isEmpty()) {
      Toast.makeText(this, "WhatsApp için telefon numarası bulunamadı.", Toast.LENGTH_SHORT).show();
      return;
    }
    try {
      String url = "https://wa.me/" + normalizedPhone;
      if (message != null && !message.trim().isEmpty()) {
        url += "?text=" + URLEncoder.encode(message.trim(), "UTF-8");
      }
      openIntent(new Intent(Intent.ACTION_VIEW, Uri.parse(url)), "WhatsApp bağlantısı açılamadı.");
    } catch (Exception error) {
      Toast.makeText(this, "WhatsApp mesajı hazırlanamadı.", Toast.LENGTH_SHORT).show();
    }
  }

  private void openIntent(Intent intent, String fallback) {
    try {
      startActivity(intent);
    } catch (ActivityNotFoundException error) {
      Toast.makeText(this, fallback, Toast.LENGTH_SHORT).show();
    }
  }

  private void copyText(String value) {
    ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
    if (clipboard == null) {
      Toast.makeText(this, "Kopyalama kullanılamıyor.", Toast.LENGTH_SHORT).show();
      return;
    }
    clipboard.setPrimaryClip(ClipData.newPlainText("Yardımcı Asistan hazır mesaj", value));
    Toast.makeText(this, "Hazır mesaj kopyalandı.", Toast.LENGTH_SHORT).show();
  }

  private String greetingTitle() {
    int hour = Integer.parseInt(new SimpleDateFormat("HH", Locale.ROOT).format(new Date()));
    if (hour < 12) {
      return "Günaydın, işler burada";
    }
    if (hour < 18) {
      return "İyi günler, hızlı özet";
    }
    return "İyi akşamlar, servis özeti";
  }

  private int countWaitingRequests() {
    int count = 0;
    for (OperationData.RequestRecord request : data.requests) {
      if (request.waitingForResponse()) {
        count += 1;
      }
    }
    return count;
  }

  private List<OperationData.TaskRecord> todayTasks() {
    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    ArrayList<OperationData.TaskRecord> results = new ArrayList<>();
    for (OperationData.TaskRecord task : data.tasks) {
      if ("archived".equals(task.status)) {
        continue;
      }
      if (today.equals(task.dueDate)) {
        results.add(task);
      }
    }
    if (results.isEmpty()) {
      for (OperationData.TaskRecord task : data.tasks) {
        if ("pending".equals(task.status)) {
          results.add(task);
        }
      }
    }
    return results;
  }

  private boolean hasConnectionSettings() {
    return ConnectionSettings.isComplete(preferences);
  }

  private boolean isClosedRequest(String status) {
    return "answered".equals(status)
        || "rejected".equals(status)
        || "cancelled".equals(status)
        || "archived".equals(status)
        || "converted_to_reservation".equals(status);
  }

  private boolean isPensionReservation(OperationData.ReservationRecord reservation) {
    return "room".equals(reservation.type)
        || "room_and_table".equals(reservation.type)
        || (!reservation.roomIds.isEmpty() && !"table".equals(reservation.type));
  }

  private boolean isPensionTask(OperationData.TaskRecord task) {
    return "room".equals(task.relatedType)
        || "reservation".equals(task.relatedType)
        || task.type.contains("room")
        || task.type.contains("check_in")
        || task.type.contains("check_out")
        || task.type.contains("cleaning");
  }

  private boolean isRestaurantTask(OperationData.TaskRecord task) {
    return "table".equals(task.relatedType)
        || task.type.contains("table")
        || task.type.contains("restaurant")
        || task.type.contains("service")
        || task.type.contains("breakfast");
  }

  private String requestDate(OperationData.RequestRecord request) {
    String dates = !request.dateText.isEmpty() ? request.dateText : joinDateRange(request.startDate, request.endDate);
    if (dates.isEmpty()) {
      dates = shortTimestamp(request.createdAt);
    }
    if (!request.time.isEmpty()) {
      dates += " · " + request.time;
    }
    return dates.isEmpty() ? "Tarih belirtilmemiş" : dates;
  }

  private String joinDateRange(String start, String end) {
    if (start == null || start.isEmpty()) {
      return end == null ? "" : end;
    }
    if (end == null || end.isEmpty() || start.equals(end)) {
      return start;
    }
    return start + " → " + end;
  }

  private String joinNonEmpty(String separator, String... values) {
    StringBuilder result = new StringBuilder();
    for (String value : values) {
      if (value == null || value.trim().isEmpty()) {
        continue;
      }
      if (result.length() > 0) {
        result.append(separator);
      }
      result.append(value.trim());
    }
    return result.toString();
  }

  private String namesForRooms(List<String> roomIds) {
    ArrayList<String> names = new ArrayList<>();
    for (String roomId : roomIds) {
      for (OperationData.RoomRecord room : data.rooms) {
        if (roomId.equals(room.id)) {
          names.add(room.name);
          break;
        }
      }
    }
    return names.isEmpty() ? "Atama bekliyor" : joinNonEmpty(", ", names.toArray(new String[0]));
  }

  private OperationData.TableRecord tableById(String tableId) {
    for (OperationData.TableRecord table : data.tables) {
      if (tableId.equals(table.id)) {
        return table;
      }
    }
    return null;
  }

  private String reservationMessage(OperationData.ReservationRecord reservation) {
    return "Merhaba " + reservation.customerName + ", " + joinDateRange(reservation.startDate, reservation.endDate)
        + " tarihli rezervasyonunuz hakkında size ulaşıyoruz.";
  }

  private String normalizeWhatsAppPhone(String phone) {
    String digits = phone == null ? "" : phone.replaceAll("[^0-9]", "");
    if (digits.startsWith("0") && digits.length() == 11) {
      return "90" + digits.substring(1);
    }
    if (digits.length() == 10) {
      return "90" + digits;
    }
    return digits;
  }

  private String compactDeviceId() {
    return identity.deviceId.length() <= 20 ? identity.deviceId : identity.deviceId.substring(0, 12) + "…" + identity.deviceId.substring(identity.deviceId.length() - 5);
  }

  private String shortTimestamp(String value) {
    if (value == null || value.trim().isEmpty()) {
      return "";
    }
    String text = value.trim().replace("T", " ");
    int zone = text.indexOf('+', 10);
    if (zone > 0) {
      text = text.substring(0, zone);
    }
    if (text.endsWith("Z")) {
      text = text.substring(0, text.length() - 1);
    }
    return text.length() > 16 ? text.substring(0, 16) : text;
  }

  private String ellipsize(String value, int length) {
    if (value == null) {
      return "";
    }
    String normalized = value.trim();
    return normalized.length() <= length ? normalized : normalized.substring(0, Math.max(0, length - 1)) + "…";
  }

  private String money(double value, String currency) {
    if ("TRY".equalsIgnoreCase(currency)) {
      NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("tr", "TR"));
      return format.format(value);
    }
    return String.format(new Locale("tr", "TR"), "%.2f %s", value, currency == null ? "" : currency);
  }

  private String orderCurrency(OperationData.TableOrder order) {
    return order.items.isEmpty() ? "TRY" : order.items.get(0).currency;
  }

  private int connectionTone() {
    if ("Bağlantı hazır".equals(connectionState)) {
      return UiKit.SUCCESS;
    }
    if (connectionState.contains("çekiliyor")) {
      return UiKit.INFO;
    }
    return "Henüz bağlanmadı".equals(connectionState) ? UiKit.MUTED : UiKit.DANGER;
  }

  private String formatRequestType(String value) {
    if ("pension_reservation".equals(value)) return "Pansiyon rezervasyonu";
    if ("restaurant_reservation".equals(value)) return "Masa rezervasyonu";
    if ("breakfast_request".equals(value)) return "Kahvaltı talebi";
    if ("price_question".equals(value)) return "Fiyat sorusu";
    if ("location_question".equals(value)) return "Konum sorusu";
    if ("qr_menu_question".equals(value)) return "Menü sorusu";
    if ("general_info".equals(value)) return "Bilgi talebi";
    return "Diğer talep";
  }

  private String formatRequestStatus(String value) {
    if ("new".equals(value)) return "Yeni";
    if ("seen".equals(value)) return "Görüldü";
    if ("waiting_owner".equals(value)) return "Sizi bekliyor";
    if ("waiting_customer".equals(value)) return "Müşteri bekleniyor";
    if ("approved".equals(value)) return "Onaylandı";
    if ("rejected".equals(value)) return "Reddedildi";
    if ("answered".equals(value)) return "Cevaplandı";
    if ("converted_to_reservation".equals(value)) return "Rezervasyona çevrildi";
    if ("cancelled".equals(value)) return "İptal";
    return value == null || value.isEmpty() ? "Bekliyor" : value;
  }

  private String formatReservationStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("approved".equals(value)) return "Onaylı";
    if ("rejected".equals(value)) return "Reddedildi";
    if ("cancelled".equals(value)) return "İptal";
    if ("completed".equals(value)) return "Tamamlandı";
    return value;
  }

  private String formatRoomStatus(String value) {
    if ("available".equals(value)) return "Boş";
    if ("occupied".equals(value)) return "Dolu";
    if ("reserved".equals(value)) return "Rezerve";
    if ("cleaning".equals(value)) return "Temizlik";
    if ("maintenance".equals(value)) return "Bakım";
    return value;
  }

  private String formatTableStatus(String value) {
    if ("available".equals(value)) return "Boş";
    if ("occupied".equals(value)) return "Dolu";
    if ("reserved".equals(value)) return "Rezerve";
    if ("bill_waiting".equals(value)) return "Hesap";
    if ("cleaning".equals(value)) return "Temizlik";
    return value;
  }

  private String formatTaskStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("done".equals(value)) return "Tamamlandı";
    if ("cancelled".equals(value)) return "İptal";
    return value;
  }

  private String formatOrderStatus(String value) {
    if ("open".equals(value)) return "Açık";
    if ("preparing".equals(value)) return "Hazırlanıyor";
    if ("served".equals(value)) return "Servis edildi";
    if ("payment".equals(value)) return "Hesap bekliyor";
    if ("paid".equals(value)) return "Ödendi";
    if ("cancelled".equals(value)) return "İptal";
    return value;
  }

  private String formatActionStatus(String value) {
    if ("pending".equals(value)) return "Bekliyor";
    if ("applied".equals(value)) return "Uygulandı";
    if ("failed".equals(value)) return "Uygulanamadı";
    return value;
  }

  private String formatActionType(String value) {
    if (value.startsWith("customer_request")) return "Müşteri talebi";
    if (value.startsWith("reservation")) return "Rezervasyon";
    if (value.startsWith("room")) return "Oda durumu";
    if (value.startsWith("daily_task")) return "Günlük iş";
    if (value.startsWith("table_order")) return "Masa siparişi";
    if (value.startsWith("table")) return "Masa durumu";
    return "Telefon işlemi";
  }

  private int requestTone(String status) {
    if ("new".equals(status) || "seen".equals(status)) return UiKit.INFO;
    if ("waiting_owner".equals(status) || "waiting_customer".equals(status)) return UiKit.WARNING;
    if ("approved".equals(status) || "answered".equals(status) || "converted_to_reservation".equals(status)) return UiKit.SUCCESS;
    if ("rejected".equals(status) || "cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  private int reservationTone(String status) {
    if ("pending".equals(status)) return UiKit.WARNING;
    if ("approved".equals(status) || "completed".equals(status)) return UiKit.SUCCESS;
    if ("rejected".equals(status) || "cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  private int resourceTone(String status) {
    if ("available".equals(status)) return UiKit.SUCCESS;
    if ("occupied".equals(status)) return UiKit.INFO;
    if ("reserved".equals(status) || "bill_waiting".equals(status)) return UiKit.WARNING;
    if ("maintenance".equals(status)) return UiKit.DANGER;
    return UiKit.MUTED;
  }

  private int taskTone(String status) {
    if ("done".equals(status)) return UiKit.SUCCESS;
    if ("cancelled".equals(status)) return UiKit.DANGER;
    return UiKit.WARNING;
  }

  private int orderTone(String status) {
    if ("payment".equals(status)) return UiKit.WARNING;
    if ("served".equals(status)) return UiKit.SUCCESS;
    if ("preparing".equals(status)) return UiKit.ACCENT;
    return UiKit.INFO;
  }

  private int actionTone(String status) {
    if ("applied".equals(status)) return UiKit.SUCCESS;
    if ("failed".equals(status)) return UiKit.DANGER;
    return UiKit.WARNING;
  }

  private JSONObject payload(Object... values) {
    JSONObject payload = new JSONObject();
    try {
      for (int index = 0; index + 1 < values.length; index += 2) {
        payload.put(String.valueOf(values[index]), values[index + 1]);
      }
    } catch (Exception ignored) {
      // Values used by the UI are primitive strings and numbers.
    }
    return payload;
  }

  private interface FilterListener {
    void onSelect(String value);
  }

  private static final class MetricValue {
    final String label;
    final int value;
    final String detail;
    final int tone;

    MetricValue(String label, int value, String detail, int tone) {
      this.label = label;
      this.value = value;
      this.detail = detail;
      this.tone = tone;
    }
  }

  private static final class ActionSpec {
    final String id;
    final String type;
    final JSONObject payload;

    ActionSpec(String type, JSONObject payload) {
      this.id = ActionOutbox.createActionId();
      this.type = type;
      this.payload = payload;
    }
  }
}
