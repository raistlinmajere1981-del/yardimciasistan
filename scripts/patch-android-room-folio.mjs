import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const drafts = new Map();
const edits = [];

function current(file) {
  if (drafts.has(file)) return drafts.get(file);
  return fs.readFileSync(path.join(root, file), "utf8");
}

function replaceOnce(file, label, before, after) {
  const source = current(file);
  const first = source.indexOf(before);
  const second = first < 0 ? -1 : source.indexOf(before, first + before.length);
  if (first < 0 || second >= 0) {
    throw new Error(`${file}: ${label} için beklenen blok tam olarak bir kez bulunamadı`);
  }
  drafts.set(file, source.slice(0, first) + after + source.slice(first + before.length));
  edits.push(`${file}: ${label}`);
}

try {
  const syncCore = "packages/sync-core/index.ts";
  replaceOnce(syncCore, "oda hesabı snapshot tipi", `export interface AndroidFinanceSnapshot {
  generated_at: ISODateTimeString | "";
  currency: string;
  today_income_minor: number;
  today_expense_minor: number;
  today_net_minor: number;
  outstanding_pension_minor: number;
  recent_entries: AndroidFinanceEntry[];
}

export interface AndroidOperationsSnapshot {`, `export interface AndroidFinanceSnapshot {
  generated_at: ISODateTimeString | "";
  currency: string;
  today_income_minor: number;
  today_expense_minor: number;
  today_net_minor: number;
  outstanding_pension_minor: number;
  recent_entries: AndroidFinanceEntry[];
}

export interface AndroidRoomFolioSnapshot {
  id: string;
  stay_id: string;
  room_id: string;
  room_name: string;
  room_number: string;
  customer_id: string;
  customer_name: string;
  status: "open" | "closed";
  guest_count: number;
  check_in_date: string;
  planned_check_out_date: string;
  nights: number;
  nightly_price_minor: number;
  currency: string;
  lodging_total_minor: number;
  extras_total_minor: number;
  charge_total_minor: number;
  paid_total_minor: number;
  remaining_minor: number;
  opened_at: ISODateTimeString | "";
}

export interface AndroidOperationsSnapshot {`);
  replaceOnce(syncCore, "snapshot oda hesapları", `  customer_room_stays: AndroidSnapshotCustomerRoomStay[];
  reservations: AndroidSnapshotReservation[];`, `  customer_room_stays: AndroidSnapshotCustomerRoomStay[];
  room_folios: AndroidRoomFolioSnapshot[];
  reservations: AndroidSnapshotReservation[];`);
  replaceOnce(syncCore, "oda hesabı izinleri", `  "room.view",
  "room.update_status",
  "room.assign_customer",
  "daily_task.view",`, `  "room.view",
  "room.update_status",
  "room.assign_customer",
  "room_folio.view",
  "room_folio.payment",
  "room_folio.checkout",
  "daily_task.view",`);
  replaceOnce(syncCore, "kasiyer oda tahsilatı", `    "menu.stock_view",
    "finance.view",
    "finance.create"
  ],
  rooms_tasks: [`, `    "menu.stock_view",
    "finance.view",
    "finance.create",
    "room_folio.view",
    "room_folio.payment"
  ],
  rooms_tasks: [`);
  replaceOnce(syncCore, "oda görevi çıkış yetkisi", `    "room.view",
    "room.update_status",
    "daily_task.view",`, `    "room.view",
    "room.update_status",
    "room_folio.view",
    "room_folio.checkout",
    "daily_task.view",`);
  replaceOnce(syncCore, "oda hesabı action tipleri", `  "finance_manual_create",
  "table_status_update",`, `  "finance_manual_create",
  "room_folio_payment_add",
  "room_folio_checkout",
  "table_status_update",`);
  replaceOnce(syncCore, "oda hesabı action izin eşlemesi", `  finance_manual_create: "finance.create",
  table_status_update: "table.update_status",`, `  finance_manual_create: "finance.create",
  room_folio_payment_add: "room_folio.payment",
  room_folio_checkout: "room_folio.checkout",
  table_status_update: "table.update_status",`);

  const database = "apps/desktop-app/electron/database.ts";
  replaceOnce(database, "oda hesabı action importu", `import { applyAndroidFinanceAction } from "./android-finance-actions.js";
`, `import { applyAndroidFinanceAction } from "./android-finance-actions.js";
import { applyAndroidRoomFolioAction } from "./android-room-folio-actions.js";
`);
  replaceOnce(database, "oda hesabı action uygulaması", `      case "finance_manual_create":
        return applyAndroidFinanceAction({
          db: this.db,
          action,
          now,
          insertEvent: (type, entityId, payload) =>
            this.insertAndroidActionEvent(action, type, "finance_entry", entityId, payload, now)
        });
      case "table_status_update":`, `      case "finance_manual_create":
        return applyAndroidFinanceAction({
          db: this.db,
          action,
          now,
          insertEvent: (type, entityId, payload) =>
            this.insertAndroidActionEvent(action, type, "finance_entry", entityId, payload, now)
        });
      case "room_folio_payment_add":
      case "room_folio_checkout":
        return applyAndroidRoomFolioAction({
          db: this.db,
          action,
          now,
          insertEvent: (type, entityId, payload) =>
            this.insertAndroidActionEvent(action, type, "room_folio", entityId, payload, now)
        });
      case "table_status_update":`);
  replaceOnce(database, "oda hesabı failure ilişkisi", `  for (const key of ["order_id", "table_id", "reservation_id", "request_id", "customer_id", "room_id", "task_id", "item_id", "menu_item_id", "category_id", "message_id"]) {`, `  for (const key of ["order_id", "table_id", "reservation_id", "request_id", "customer_id", "folio_id", "room_id", "task_id", "item_id", "menu_item_id", "category_id", "message_id"]) {`);

  const main = "apps/desktop-app/electron/main.ts";
  replaceOnce(main, "oda folyosu servis importu", `import { DesktopFinanceService } from "./finance";
`, `import { DesktopFinanceService } from "./finance";
import { DesktopRoomFolioService } from "./room-folio";
`);
  replaceOnce(main, "snapshot oda folyosu verisi", `  const financeData = new DesktopFinanceService(getDatabase().databasePath).getData(20);
  const messages =`, `  const financeData = new DesktopFinanceService(getDatabase().databasePath).getData(20);
  const roomFolioData = new DesktopRoomFolioService(getDatabase().databasePath).getData();
  const messages =`);
  replaceOnce(main, "snapshot açık oda hesapları", `      created_at: stay.createdAt,
      updated_at: stay.updatedAt
    })),
    reservations:`, `      created_at: stay.createdAt,
      updated_at: stay.updatedAt
    })),
    room_folios: roomFolioData.folios
      .filter((folio) => folio.status === "open")
      .slice(0, 100)
      .map((folio) => ({
        id: folio.id,
        stay_id: folio.stayId,
        room_id: folio.roomId,
        room_name: folio.roomName,
        room_number: folio.roomNumber,
        customer_id: folio.customerId,
        customer_name: folio.customerName,
        status: folio.status,
        guest_count: folio.guestCount,
        check_in_date: folio.checkInDate,
        planned_check_out_date: folio.plannedCheckOutDate,
        nights: folio.nights,
        nightly_price_minor: folio.nightlyPriceMinor,
        currency: folio.currency,
        lodging_total_minor: folio.lodgingTotalMinor,
        extras_total_minor: folio.extrasTotalMinor,
        charge_total_minor: folio.chargeTotalMinor,
        paid_total_minor: folio.paidTotalMinor,
        remaining_minor: folio.remainingMinor,
        opened_at: folio.openedAt
      })),
    reservations:`);

  const operationData = "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java";
  replaceOnce(operationData, "Android oda hesabı izinleri", `      "room.view",
      "room.update_status",
      "room.assign_customer",
      "daily_task.view",`, `      "room.view",
      "room.update_status",
      "room.assign_customer",
      "room_folio.view",
      "room_folio.payment",
      "room_folio.checkout",
      "daily_task.view",`);
  replaceOnce(operationData, "Android varsayılan oda hesabı izinleri", `      "room.view",
      "room.update_status",
      "daily_task.view",`, `      "room.view",
      "room.update_status",
      "room_folio.view",
      "room_folio.checkout",
      "daily_task.view",`);
  replaceOnce(operationData, "Android oda hesabı listesi", `  final List<CustomerRoomStayRecord> customerRoomStays = new ArrayList<>();
  final List<ReservationRecord> reservations = new ArrayList<>();`, `  final List<CustomerRoomStayRecord> customerRoomStays = new ArrayList<>();
  final List<RoomFolioRecord> roomFolios = new ArrayList<>();
  final List<ReservationRecord> reservations = new ArrayList<>();`);
  replaceOnce(operationData, "Android oda hesabı parse", `    addRecords(array(root, "customer_room_stays"), data.customerRoomStays, CustomerRoomStayRecord::fromJson);
    addRecords(array(root, "reservations"), data.reservations, ReservationRecord::fromJson);`, `    addRecords(array(root, "customer_room_stays"), data.customerRoomStays, CustomerRoomStayRecord::fromJson);
    addRecords(array(root, "room_folios"), data.roomFolios, RoomFolioRecord::fromJson);
    addRecords(array(root, "reservations"), data.reservations, ReservationRecord::fromJson);`);
  replaceOnce(operationData, "Android oda hesabı kayıt modeli", `  static final class FinanceSnapshot {
`, `  static final class RoomFolioRecord {
    String id = "";
    String stayId = "";
    String roomId = "";
    String roomName = "Oda";
    String roomNumber = "";
    String customerId = "";
    String customerName = "";
    String status = "open";
    int guestCount = 1;
    String checkInDate = "";
    String plannedCheckOutDate = "";
    int nights = 1;
    long nightlyPriceMinor;
    String currency = "TRY";
    long lodgingTotalMinor;
    long extrasTotalMinor;
    long chargeTotalMinor;
    long paidTotalMinor;
    long remainingMinor;
    String openedAt = "";

    static RoomFolioRecord fromJson(JSONObject source) {
      RoomFolioRecord folio = new RoomFolioRecord();
      folio.id = value(source, "id", "");
      folio.stayId = value(source, "stay_id", "");
      folio.roomId = value(source, "room_id", "");
      folio.roomName = value(source, "room_name", "Oda");
      folio.roomNumber = value(source, "room_number", "");
      folio.customerId = value(source, "customer_id", "");
      folio.customerName = value(source, "customer_name", "");
      folio.status = value(source, "status", "open");
      folio.guestCount = Math.max(1, Math.min(50, source.optInt("guest_count", 1)));
      folio.checkInDate = value(source, "check_in_date", "");
      folio.plannedCheckOutDate = value(source, "planned_check_out_date", "");
      folio.nights = Math.max(1, source.optInt("nights", 1));
      folio.nightlyPriceMinor = Math.max(0L, source.optLong("nightly_price_minor", 0L));
      folio.currency = value(source, "currency", "TRY");
      folio.lodgingTotalMinor = Math.max(0L, source.optLong("lodging_total_minor", 0L));
      folio.extrasTotalMinor = source.optLong("extras_total_minor", 0L);
      folio.chargeTotalMinor = Math.max(0L, source.optLong("charge_total_minor", 0L));
      folio.paidTotalMinor = Math.max(0L, source.optLong("paid_total_minor", 0L));
      folio.remainingMinor = Math.max(0L, source.optLong("remaining_minor", 0L));
      folio.openedAt = value(source, "opened_at", "");
      return folio;
    }

    boolean isOpen() {
      return "open".equals(status);
    }
  }

  static final class FinanceSnapshot {
`);

  const uiRules = "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java";
  replaceOnce(uiRules, "Pansiyon hesap modu", `  static final String PENSION_STAYS = "stays";
  static final String PENSION_TASKS = "tasks";`, `  static final String PENSION_STAYS = "stays";
  static final String PENSION_FOLIOS = "folios";
  static final String PENSION_TASKS = "tasks";`);
  replaceOnce(uiRules, "Pansiyon hesap görünürlük izni", `    if (PENSION_STAYS.equals(mode)) {
      return data.isAdmin()
          && data.hasPermission("customer.manage")
          && data.hasPermission("room.assign_customer");
    }
    if (PENSION_TASKS.equals(mode)) {`, `    if (PENSION_STAYS.equals(mode)) {
      return data.isAdmin()
          && data.hasPermission("customer.manage")
          && data.hasPermission("room.assign_customer");
    }
    if (PENSION_FOLIOS.equals(mode)) {
      return data.hasPermission("room_folio.view");
    }
    if (PENSION_TASKS.equals(mode)) {`);
  replaceOnce(uiRules, "Pansiyon hesap varsayılan modu", `    if (canOpenPensionMode(data, PENSION_STAYS)) {
      return PENSION_STAYS;
    }
    if (canOpenPensionMode(data, PENSION_TASKS)) {`, `    if (canOpenPensionMode(data, PENSION_STAYS)) {
      return PENSION_STAYS;
    }
    if (canOpenPensionMode(data, PENSION_FOLIOS)) {
      return PENSION_FOLIOS;
    }
    if (canOpenPensionMode(data, PENSION_TASKS)) {`);
  replaceOnce(uiRules, "Pansiyon hesap route", `      if (!PENSION_ROOMS.equals(mode) && !PENSION_STAYS.equals(mode) && !PENSION_TASKS.equals(mode)) {
        mode = PENSION_RESERVATIONS;
      }`, `      if (!PENSION_ROOMS.equals(mode) && !PENSION_STAYS.equals(mode) && !PENSION_FOLIOS.equals(mode) && !PENSION_TASKS.equals(mode)) {
        mode = PENSION_RESERVATIONS;
      }`);

  const mainActivity = "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java";
  replaceOnce(mainActivity, "Pansiyon Hesaplar filtresi", `    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_STAYS)) {
      options.add(new String[] {AndroidUiRules.PENSION_STAYS, "Konaklamalar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_TASKS)) {`, `    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_STAYS)) {
      options.add(new String[] {AndroidUiRules.PENSION_STAYS, "Konaklamalar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_FOLIOS)) {
      options.add(new String[] {AndroidUiRules.PENSION_FOLIOS, "Hesaplar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_TASKS)) {`);
  replaceOnce(mainActivity, "Pansiyon oda hesabı çalışma alanı", `      for (OperationData.CustomerRoomStayRecord stay : data.customerRoomStays) {
        page.addView(customerRoomStayCard(stay));
      }
    } else {
      if (data.hasPermission("daily_task.create")) {`, `      for (OperationData.CustomerRoomStayRecord stay : data.customerRoomStays) {
        page.addView(customerRoomStayCard(stay));
      }
    } else if (AndroidUiRules.PENSION_FOLIOS.equals(pensionMode)) {
      RoomFolioWorkspace.append(this, page, data, (actionType, actionPayload, successMessage) ->
          sendAction(actionType, actionPayload, successMessage));
    } else {
      if (data.hasPermission("daily_task.create")) {`);
  replaceOnce(mainActivity, "oda hesabı yerel action izinleri", `      case "finance_manual_create":
        return "finance.create";
      case "table_status_update":`, `      case "finance_manual_create":
        return "finance.create";
      case "room_folio_payment_add":
        return "room_folio.payment";
      case "room_folio_checkout":
        return "room_folio.checkout";
      case "table_status_update":`);

  const notification = "apps/android-app/src/main/java/com/yardimciasistan/android/NotificationEventDetector.java";
  replaceOnce(notification, "oda hesabı hata rotası", `    if (type.startsWith("room_")) {
      return "pension:rooms";
    }`, `    if (type.startsWith("room_folio_")) {
      return "pension:folios";
    }
    if (type.startsWith("room_")) {
      return "pension:rooms";
    }`);

  const workspace = "apps/android-app/src/main/java/com/yardimciasistan/android/RoomFolioWorkspace.java";
  replaceOnce(workspace, "oda hesabı içeriğini sayfaya ekleme", `  static ScrollView create(Context context, OperationData data, Listener listener) {
    LinearLayout page = UiKit.column(context);

    int openCount = 0;`, `  static ScrollView create(Context context, OperationData data, Listener listener) {
    LinearLayout page = UiKit.column(context);
    append(context, page, data, listener);
    return UiKit.scroll(context, page);
  }

  static void append(Context context, LinearLayout page, OperationData data, Listener listener) {
    int openCount = 0;`);
  replaceOnce(workspace, "boş oda hesabı dönüşü", `      page.addView(empty);
      return UiKit.scroll(context, page);
    }`, `      page.addView(empty);
      return;
    }`);
  replaceOnce(workspace, "oda hesabı append bitişi", `    page.addView(note);
    return UiKit.scroll(context, page);
  }

  private static LinearLayout folioCard(`, `    page.addView(note);
  }

  private static LinearLayout folioCard(`);

  const php = "firm-template/web-module/api/sync.php";
  replaceOnce(php, "hosting oda hesabı action tipleri", `        'finance_manual_create',
        'table_status_update',`, `        'finance_manual_create',
        'room_folio_payment_add',
        'room_folio_checkout',
        'table_status_update',`);
  replaceOnce(php, "hosting oda hesabı izinleri", `        'room.view',
        'room.update_status',
        'room.assign_customer',
        'daily_task.view',`, `        'room.view',
        'room.update_status',
        'room.assign_customer',
        'room_folio.view',
        'room_folio.payment',
        'room_folio.checkout',
        'daily_task.view',`);
  replaceOnce(php, "hosting snapshot oda hesapları", `        'customer_room_stays' => ya_sync_sanitize_android_customer_room_stays($snapshot['customer_room_stays'] ?? []),
        'reservations' =>`, `        'customer_room_stays' => ya_sync_sanitize_android_customer_room_stays($snapshot['customer_room_stays'] ?? []),
        'room_folios' => ya_sync_sanitize_android_room_folios($snapshot['room_folios'] ?? []),
        'reservations' =>`);
  replaceOnce(php, "hosting oda hesabı sanitizer", `function ya_sync_sanitize_android_finance(mixed $value): array
{`, `function ya_sync_sanitize_android_room_folios(mixed $value): array
{
    $records = [];
    foreach (array_slice(is_array($value) ? $value : [], 0, 100) as $rawFolio) {
        if (!is_array($rawFolio)) {
            continue;
        }
        $id = mb_substr(ya_sync_string($rawFolio['id'] ?? ''), 0, 220);
        $stayId = mb_substr(ya_sync_string($rawFolio['stay_id'] ?? ''), 0, 220);
        $roomId = mb_substr(ya_sync_string($rawFolio['room_id'] ?? ''), 0, 220);
        $status = ya_sync_string($rawFolio['status'] ?? 'open');
        if ($id === '' || $stayId === '' || $roomId === '' || $status !== 'open') {
            continue;
        }
        $records[] = [
            'id' => $id,
            'stay_id' => $stayId,
            'room_id' => $roomId,
            'room_name' => mb_substr(ya_sync_string($rawFolio['room_name'] ?? 'Oda') ?: 'Oda', 0, 180),
            'room_number' => mb_substr(ya_sync_string($rawFolio['room_number'] ?? ''), 0, 80),
            'customer_id' => mb_substr(ya_sync_string($rawFolio['customer_id'] ?? ''), 0, 220),
            'customer_name' => mb_substr(ya_sync_string($rawFolio['customer_name'] ?? ''), 0, 180),
            'status' => 'open',
            'guest_count' => max(1, min(50, ya_sync_int($rawFolio['guest_count'] ?? 1, 1))),
            'check_in_date' => ya_sync_string($rawFolio['check_in_date'] ?? ''),
            'planned_check_out_date' => ya_sync_string($rawFolio['planned_check_out_date'] ?? ''),
            'nights' => max(1, ya_sync_int($rawFolio['nights'] ?? 1, 1)),
            'nightly_price_minor' => max(0, ya_sync_int($rawFolio['nightly_price_minor'] ?? 0, 0)),
            'currency' => mb_substr(ya_sync_string($rawFolio['currency'] ?? 'TRY') ?: 'TRY', 0, 8),
            'lodging_total_minor' => max(0, ya_sync_int($rawFolio['lodging_total_minor'] ?? 0, 0)),
            'extras_total_minor' => ya_sync_int($rawFolio['extras_total_minor'] ?? 0, 0),
            'charge_total_minor' => max(0, ya_sync_int($rawFolio['charge_total_minor'] ?? 0, 0)),
            'paid_total_minor' => max(0, ya_sync_int($rawFolio['paid_total_minor'] ?? 0, 0)),
            'remaining_minor' => max(0, ya_sync_int($rawFolio['remaining_minor'] ?? 0, 0)),
            'opened_at' => ya_sync_string($rawFolio['opened_at'] ?? '')
        ];
    }
    return $records;
}

function ya_sync_sanitize_android_finance(mixed $value): array
{`);
  replaceOnce(php, "hosting oda hesabı görüntüleme yetkisi", `    $reportsAllowed = ($permissionProfile['role'] ?? 'staff') === 'admin' && $deviceActive;
    $financeAllowed = $deviceActive && in_array('finance.view', $permissionList, true);
    $customerManagementAllowed =`, `    $reportsAllowed = ($permissionProfile['role'] ?? 'staff') === 'admin' && $deviceActive;
    $financeAllowed = $deviceActive && in_array('finance.view', $permissionList, true);
    $roomFolioAllowed = $deviceActive && in_array('room_folio.view', $permissionList, true);
    $customerManagementAllowed =`);
  replaceOnce(php, "hosting oda hesabı Android özeti", `        'customer_room_stays' => $customerManagementAllowed ? $androidSnapshot['customer_room_stays'] : [],
        'reservations' =>`, `        'customer_room_stays' => $customerManagementAllowed ? $androidSnapshot['customer_room_stays'] : [],
        'room_folios' => $roomFolioAllowed ? $androidSnapshot['room_folios'] : [],
        'reservations' =>`);
} catch (error) {
  console.error(`android-room-folio-patch-error: ${error.message}`);
  process.exit(1);
}

for (const [file, content] of drafts.entries()) {
  fs.writeFileSync(path.join(root, file), content);
}

console.log(`android-room-folio-patch-ok (${edits.length} doğrulanmış değişiklik)`);
