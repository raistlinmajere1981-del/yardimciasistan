import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const edits = [];

function patch(relativePath, label, before, after) {
  edits.push({ relativePath, label, before, after });
}

// sync-core: finance snapshot, permissions and action contract.
patch(
  "packages/sync-core/index.ts",
  "finance snapshot interfaces",
  `export interface AndroidSnapshotTask {\n  id: string;\n  title: string;\n  description: string;\n  task_type: string;\n  status: string;\n  due_date: string;\n  due_time: string;\n  related_type: string;\n  related_id: string;\n  updated_at: ISODateTimeString | "";\n}\n\nexport interface AndroidOperationsSnapshot {`,
  `export interface AndroidSnapshotTask {\n  id: string;\n  title: string;\n  description: string;\n  task_type: string;\n  status: string;\n  due_date: string;\n  due_time: string;\n  related_type: string;\n  related_id: string;\n  updated_at: ISODateTimeString | "";\n}\n\nexport interface AndroidFinanceEntry {\n  id: string;\n  direction: "income" | "expense";\n  amount_minor: number;\n  currency: string;\n  payment_method: string;\n  category: string;\n  description: string;\n  occurred_at: ISODateTimeString | "";\n  source_type: string;\n  source_id: string;\n  note: string;\n  created_at: ISODateTimeString | "";\n}\n\nexport interface AndroidFinanceSnapshot {\n  generated_at: ISODateTimeString | "";\n  currency: string;\n  today_income_minor: number;\n  today_expense_minor: number;\n  today_net_minor: number;\n  outstanding_pension_minor: number;\n  recent_entries: AndroidFinanceEntry[];\n}\n\nexport interface AndroidOperationsSnapshot {`
);
patch(
  "packages/sync-core/index.ts",
  "finance snapshot field",
  `  messages: AndroidSnapshotMessage[];\n  androidPermissions: Record<string, AndroidSnapshotPermissionProfile>;\n  reports: Record<AndroidReportPresetKey, AndroidReportSnapshot>;`,
  `  messages: AndroidSnapshotMessage[];\n  androidPermissions: Record<string, AndroidSnapshotPermissionProfile>;\n  finance: AndroidFinanceSnapshot;\n  reports: Record<AndroidReportPresetKey, AndroidReportSnapshot>;`
);
patch(
  "packages/sync-core/index.ts",
  "finance permissions",
  `  "menu.stock_view",\n  "menu.stock_update",\n  "settings.view",`,
  `  "menu.stock_view",\n  "menu.stock_update",\n  "finance.view",\n  "finance.create",\n  "settings.view",`
);
patch(
  "packages/sync-core/index.ts",
  "cashier finance permissions",
  `  cashier: [\n    "table.view",\n    "table_order.view",\n    "table_order.set_payment_waiting",\n    "table_order.close_paid",\n    "menu.stock_view"\n  ],`,
  `  cashier: [\n    "table.view",\n    "table_order.view",\n    "table_order.set_payment_waiting",\n    "table_order.close_paid",\n    "menu.stock_view",\n    "finance.view",\n    "finance.create"\n  ],`
);
patch(
  "packages/sync-core/index.ts",
  "finance action type",
  `  "daily_task_reopen",\n  "daily_task_cancel",\n  "table_status_update",`,
  `  "daily_task_reopen",\n  "daily_task_cancel",\n  "finance_manual_create",\n  "table_status_update",`
);
patch(
  "packages/sync-core/index.ts",
  "finance action permission",
  `  daily_task_reopen: "daily_task.reopen",\n  daily_task_cancel: "daily_task.update",\n  table_status_update: "table.update_status",`,
  `  daily_task_reopen: "daily_task.reopen",\n  daily_task_cancel: "daily_task.update",\n  finance_manual_create: "finance.create",\n  table_status_update: "table.update_status",`
);

patch(
  "packages/sync-core/tests/sync-core.test.cjs",
  "cashier permission expectation",
  `  assert.deepEqual(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier, [\n    "table.view",\n    "table_order.view",\n    "table_order.set_payment_waiting",\n    "table_order.close_paid",\n    "menu.stock_view"\n  ]);`,
  `  assert.deepEqual(ANDROID_PERMISSION_GROUP_PERMISSIONS.cashier, [\n    "table.view",\n    "table_order.view",\n    "table_order.set_payment_waiting",\n    "table_order.close_paid",\n    "menu.stock_view",\n    "finance.view",\n    "finance.create"\n  ]);`
);

// Desktop Android action application.
patch(
  "apps/desktop-app/electron/database.ts",
  "finance action import",
  `import { applyAndroidDailyTaskAction } from "./android-daily-task-actions.js";`,
  `import { applyAndroidDailyTaskAction } from "./android-daily-task-actions.js";\nimport { applyAndroidFinanceAction } from "./android-finance-actions.js";`
);
patch(
  "apps/desktop-app/electron/database.ts",
  "finance action application",
  `      case "daily_task_cancel":\n        return this.applyAndroidDailyTaskStatus(action, "cancelled", now);\n      case "table_status_update":`,
  `      case "daily_task_cancel":\n        return this.applyAndroidDailyTaskStatus(action, "cancelled", now);\n      case "finance_manual_create":\n        return applyAndroidFinanceAction({\n          db: this.db,\n          action,\n          now,\n          insertEvent: (type, entityId, payload) =>\n            this.insertAndroidActionEvent(action, type, "finance_entry", entityId, payload, now)\n        });\n      case "table_status_update":`
);

// Desktop publishes the compact finance snapshot.
patch(
  "apps/desktop-app/electron/main.ts",
  "finance service import",
  `} from "./database";\nimport {\n  buildReportAiMessages,`,
  `} from "./database";\nimport { DesktopFinanceService } from "./finance";\nimport {\n  buildReportAiMessages,`
);
patch(
  "apps/desktop-app/electron/main.ts",
  "finance snapshot source",
  `  const messages = getDatabase().getAndroidPreparedMessages().map((message) => ({\n    id: message.id,`,
  `  const financeData = new DesktopFinanceService(getDatabase().databasePath).getData(20);\n  const messages = getDatabase().getAndroidPreparedMessages().map((message) => ({\n    id: message.id,`
);
patch(
  "apps/desktop-app/electron/main.ts",
  "finance snapshot payload",
  `    messages: messages.slice(0, 300),\n    androidPermissions: getDatabase().getAndroidPermissionSnapshot(),\n    reports: getDatabase().getAndroidReportPresets(today),`,
  `    messages: messages.slice(0, 300),\n    androidPermissions: getDatabase().getAndroidPermissionSnapshot(),\n    finance: {\n      generated_at: financeData.generatedAt,\n      currency: "TRY",\n      today_income_minor: financeData.todayIncomeMinor,\n      today_expense_minor: financeData.todayExpenseMinor,\n      today_net_minor: financeData.todayNetMinor,\n      outstanding_pension_minor: financeData.outstandingPensionMinor,\n      recent_entries: financeData.recentEntries.slice(0, 20).map((entry) => ({\n        id: entry.id,\n        direction: entry.direction,\n        amount_minor: entry.amountMinor,\n        currency: entry.currency,\n        payment_method: entry.paymentMethod,\n        category: entry.category,\n        description: entry.description,\n        occurred_at: entry.occurredAt,\n        source_type: entry.sourceType,\n        source_id: entry.sourceId,\n        note: entry.note,\n        created_at: entry.createdAt\n      }))\n    },\n    reports: getDatabase().getAndroidReportPresets(today),`
);

// Hosting contract: bring previous reservation/task actions and new finance action into the PHP boundary.
patch(
  "firm-template/web-module/api/sync.php",
  "hosting Android action list",
  `        'customer_room_assign',\n        'customer_room_stay_status',\n        'reservation_approve',\n        'reservation_reject',\n        'reservation_cancel',\n        'room_status_update',\n        'daily_task_complete',\n        'daily_task_reopen',\n        'daily_task_cancel',\n        'table_status_update',`,
  `        'customer_room_assign',\n        'customer_room_stay_status',\n        'reservation_room_create',\n        'reservation_room_update',\n        'reservation_table_create',\n        'reservation_table_update',\n        'reservation_approve',\n        'reservation_reject',\n        'reservation_cancel',\n        'room_status_update',\n        'daily_task_create',\n        'daily_task_update',\n        'daily_task_delete',\n        'daily_task_complete',\n        'daily_task_reopen',\n        'daily_task_cancel',\n        'finance_manual_create',\n        'table_status_update',`
);
patch(
  "firm-template/web-module/api/sync.php",
  "hosting Android permission list",
  `        'reservation.view',\n        'reservation.approve',\n        'reservation.reject',\n        'reservation.cancel',\n        'room.view',\n        'room.update_status',\n        'room.assign_customer',\n        'daily_task.view',\n        'daily_task.complete',\n        'daily_task.reopen',`,
  `        'reservation.view',\n        'reservation.create',\n        'reservation.update',\n        'reservation.approve',\n        'reservation.reject',\n        'reservation.cancel',\n        'room.view',\n        'room.update_status',\n        'room.assign_customer',\n        'daily_task.view',\n        'daily_task.create',\n        'daily_task.update',\n        'daily_task.delete',\n        'daily_task.complete',\n        'daily_task.reopen',`
);
patch(
  "firm-template/web-module/api/sync.php",
  "hosting finance permissions",
  `        'menu.stock_view',\n        'menu.stock_update',\n        'menu.delete',`,
  `        'menu.stock_view',\n        'menu.stock_update',\n        'finance.view',\n        'finance.create',\n        'menu.delete',`
);
patch(
  "firm-template/web-module/api/sync.php",
  "finance snapshot sanitizer call",
  `        'messages' => ya_sync_sanitize_android_messages($snapshot['messages'] ?? []),\n        'androidPermissions' => ya_sync_sanitize_android_permissions($snapshot['androidPermissions'] ?? []),\n        'reports' => ya_sync_sanitize_android_reports($snapshot['reports'] ?? []),`,
  `        'messages' => ya_sync_sanitize_android_messages($snapshot['messages'] ?? []),\n        'androidPermissions' => ya_sync_sanitize_android_permissions($snapshot['androidPermissions'] ?? []),\n        'finance' => ya_sync_sanitize_android_finance($snapshot['finance'] ?? []),\n        'reports' => ya_sync_sanitize_android_reports($snapshot['reports'] ?? []),`
);
patch(
  "firm-template/web-module/api/sync.php",
  "finance sanitizer function",
  `function ya_sync_sanitize_android_permissions(mixed $profiles): array\n{`,
  `function ya_sync_sanitize_android_finance(mixed $value): array\n{\n    $finance = is_array($value) ? $value : [];\n    $entries = [];\n    foreach (array_slice(is_array($finance['recent_entries'] ?? null) ? $finance['recent_entries'] : [], 0, 50) as $rawEntry) {\n        if (!is_array($rawEntry)) {\n            continue;\n        }\n        $direction = ya_sync_string($rawEntry['direction'] ?? '');\n        $amountMinor = max(0, ya_sync_int($rawEntry['amount_minor'] ?? 0, 0));\n        if (!in_array($direction, ['income', 'expense'], true) || $amountMinor <= 0) {\n            continue;\n        }\n        $entries[] = [\n            'id' => mb_substr(ya_sync_string($rawEntry['id'] ?? ''), 0, 220),\n            'direction' => $direction,\n            'amount_minor' => $amountMinor,\n            'currency' => mb_substr(ya_sync_string($rawEntry['currency'] ?? 'TRY') ?: 'TRY', 0, 8),\n            'payment_method' => mb_substr(ya_sync_string($rawEntry['payment_method'] ?? 'unspecified'), 0, 32),\n            'category' => mb_substr(ya_sync_string($rawEntry['category'] ?? ''), 0, 64),\n            'description' => mb_substr(ya_sync_string($rawEntry['description'] ?? ''), 0, 180),\n            'occurred_at' => ya_sync_string($rawEntry['occurred_at'] ?? ''),\n            'source_type' => mb_substr(ya_sync_string($rawEntry['source_type'] ?? ''), 0, 64),\n            'source_id' => mb_substr(ya_sync_string($rawEntry['source_id'] ?? ''), 0, 220),\n            'note' => mb_substr(ya_sync_string($rawEntry['note'] ?? ''), 0, 500),\n            'created_at' => ya_sync_string($rawEntry['created_at'] ?? '')\n        ];\n    }\n\n    return [\n        'generated_at' => ya_sync_string($finance['generated_at'] ?? ''),\n        'currency' => mb_substr(ya_sync_string($finance['currency'] ?? 'TRY') ?: 'TRY', 0, 8),\n        'today_income_minor' => max(0, ya_sync_int($finance['today_income_minor'] ?? 0, 0)),\n        'today_expense_minor' => max(0, ya_sync_int($finance['today_expense_minor'] ?? 0, 0)),\n        'today_net_minor' => ya_sync_int($finance['today_net_minor'] ?? 0, 0),\n        'outstanding_pension_minor' => max(0, ya_sync_int($finance['outstanding_pension_minor'] ?? 0, 0)),\n        'recent_entries' => $entries\n    ];\n}\n\nfunction ya_sync_sanitize_android_permissions(mixed $profiles): array\n{`
);
patch(
  "firm-template/web-module/api/sync.php",
  "finance summary permission gate",
  `    $reportsAllowed = ($permissionProfile['role'] ?? 'staff') === 'admin'\n        && ya_sync_bool($permissionProfile['is_active'] ?? false);\n    $customerManagementAllowed = $reportsAllowed\n        && in_array('customer.manage', is_array($permissionProfile['permissions'] ?? null) ? $permissionProfile['permissions'] : [], true);`,
  `    $permissionList = is_array($permissionProfile['permissions'] ?? null) ? $permissionProfile['permissions'] : [];\n    $deviceActive = ya_sync_bool($permissionProfile['is_active'] ?? false);\n    $reportsAllowed = ($permissionProfile['role'] ?? 'staff') === 'admin' && $deviceActive;\n    $financeAllowed = $deviceActive && in_array('finance.view', $permissionList, true);\n    $customerManagementAllowed = $reportsAllowed && in_array('customer.manage', $permissionList, true);`
);
patch(
  "firm-template/web-module/api/sync.php",
  "finance summary payload gate",
  `        'androidPermissions' => $androidSnapshot['androidPermissions'],\n        'reports' => $reportsAllowed ? $androidSnapshot['reports'] : [],`,
  `        'androidPermissions' => $androidSnapshot['androidPermissions'],\n        'finance' => $financeAllowed ? $androidSnapshot['finance'] : [],\n        'reports' => $reportsAllowed ? $androidSnapshot['reports'] : [],`
);

// Android data model and UI permissions.
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java",
  "android finance permissions",
  `      "menu.stock_view",\n      "menu.stock_update",\n      "menu.delete",`,
  `      "menu.stock_view",\n      "menu.stock_update",\n      "finance.view",\n      "finance.create",\n      "menu.delete",`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java",
  "android finance state",
  `  final List<ActionRecord> actions = new ArrayList<>();\n  final Map<String, ReportSnapshot> reports = new HashMap<>();`,
  `  final List<ActionRecord> actions = new ArrayList<>();\n  FinanceSnapshot finance = new FinanceSnapshot();\n  final Map<String, ReportSnapshot> reports = new HashMap<>();`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java",
  "android finance parse",
  `    addRecords(array(root, "messages"), data.messages, MessageRecord::fromJson);\n    addRecords(array(root, "actions"), data.actions, ActionRecord::fromJson);\n    JSONObject reports = root.optJSONObject("reports");`,
  `    addRecords(array(root, "messages"), data.messages, MessageRecord::fromJson);\n    addRecords(array(root, "actions"), data.actions, ActionRecord::fromJson);\n    data.finance = FinanceSnapshot.fromJson(object(root, "finance"));\n    JSONObject reports = root.optJSONObject("reports");`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java",
  "android finance records",
  `  static final class ReportSnapshot {`,
  `  static final class FinanceSnapshot {\n    String generatedAt = "";\n    String currency = "TRY";\n    long todayIncomeMinor;\n    long todayExpenseMinor;\n    long todayNetMinor;\n    long outstandingPensionMinor;\n    final List<FinanceEntry> recentEntries = new ArrayList<>();\n\n    static FinanceSnapshot fromJson(JSONObject source) {\n      FinanceSnapshot finance = new FinanceSnapshot();\n      finance.generatedAt = value(source, "generated_at", "");\n      finance.currency = value(source, "currency", "TRY");\n      finance.todayIncomeMinor = source.optLong("today_income_minor", 0L);\n      finance.todayExpenseMinor = source.optLong("today_expense_minor", 0L);\n      finance.todayNetMinor = source.optLong("today_net_minor", 0L);\n      finance.outstandingPensionMinor = source.optLong("outstanding_pension_minor", 0L);\n      addRecords(array(source, "recent_entries"), finance.recentEntries, FinanceEntry::fromJson);\n      return finance;\n    }\n  }\n\n  static final class FinanceEntry {\n    String id = "";\n    String direction = "income";\n    long amountMinor;\n    String currency = "TRY";\n    String paymentMethod = "unspecified";\n    String category = "";\n    String description = "";\n    String occurredAt = "";\n    String sourceType = "";\n    String sourceId = "";\n    String note = "";\n    String createdAt = "";\n\n    static FinanceEntry fromJson(JSONObject source) {\n      FinanceEntry entry = new FinanceEntry();\n      entry.id = value(source, "id", "");\n      entry.direction = value(source, "direction", "income");\n      entry.amountMinor = Math.max(0L, source.optLong("amount_minor", 0L));\n      entry.currency = value(source, "currency", "TRY");\n      entry.paymentMethod = value(source, "payment_method", "unspecified");\n      entry.category = value(source, "category", "");\n      entry.description = value(source, "description", "");\n      entry.occurredAt = value(source, "occurred_at", "");\n      entry.sourceType = value(source, "source_type", "");\n      entry.sourceId = value(source, "source_id", "");\n      entry.note = value(source, "note", "");\n      entry.createdAt = value(source, "created_at", "");\n      return entry;\n    }\n\n    boolean isIncome() {\n      return "income".equals(direction);\n    }\n  }\n\n  static final class ReportSnapshot {`
);

patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  "cash tab constant",
  `  static final String TAB_MESSAGES = "messages";\n  static final String TAB_REPORTS = "reports";`,
  `  static final String TAB_MESSAGES = "messages";\n  static final String TAB_CASH = "cash";\n  static final String TAB_REPORTS = "reports";`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  "cash tab permission",
  `    if (TAB_REPORTS.equals(tab)) {\n      return data != null && data.isAdmin();\n    }`,
  `    if (TAB_CASH.equals(tab)) {\n      return data != null && data.hasPermission("finance.view");\n    }\n    if (TAB_REPORTS.equals(tab)) {\n      return data != null && data.isAdmin();\n    }`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  "cash destination",
  `    if (TAB_REPORTS.equals(tab)) {\n      return new Destination(TAB_REPORTS, "");\n    }\n    return new Destination(TAB_TODAY, "");`,
  `    if (TAB_CASH.equals(tab)) {\n      return new Destination(TAB_CASH, "");\n    }\n    if (TAB_REPORTS.equals(tab)) {\n      return new Destination(TAB_REPORTS, "");\n    }\n    return new Destination(TAB_TODAY, "");`
);

// Main Android shell: cash is a secondary workspace opened from Settings, not another bottom-nav item.
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "cash tab constant",
  `  private static final String TAB_MESSAGES = AndroidUiRules.TAB_MESSAGES;\n  private static final String TAB_REPORTS = AndroidUiRules.TAB_REPORTS;`,
  `  private static final String TAB_MESSAGES = AndroidUiRules.TAB_MESSAGES;\n  private static final String TAB_CASH = AndroidUiRules.TAB_CASH;\n  private static final String TAB_REPORTS = AndroidUiRules.TAB_REPORTS;`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "cash back navigation",
  `        if (TAB_REPORTS.equals(activeTab)) {\n          activeTab = TAB_TODAY;`,
  `        if (TAB_REPORTS.equals(activeTab) || TAB_CASH.equals(activeTab)) {\n          activeTab = TAB_TODAY;`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "hide bottom nav in cash",
  `        settingsOpen || inactiveDevice || TAB_REPORTS.equals(activeTab) ? View.GONE : View.VISIBLE`,
  `        settingsOpen || inactiveDevice || TAB_REPORTS.equals(activeTab) || TAB_CASH.equals(activeTab) ? View.GONE : View.VISIBLE`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "cash screen render",
  `    } else if (TAB_REPORTS.equals(activeTab)) {\n      headerTitle.setText("Raporlar");\n      screen = reportsScreen();\n    } else {`,
  `    } else if (TAB_CASH.equals(activeTab)) {\n      headerTitle.setText("Kasa");\n      screen = FinanceWorkspace.create(this, data, actionPayload ->\n          sendAction("finance_manual_create", actionPayload, "Kasa hareketi gönderildi."));\n    } else if (TAB_REPORTS.equals(activeTab)) {\n      headerTitle.setText("Raporlar");\n      screen = reportsScreen();\n    } else {`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "cash screen key",
  `    if (TAB_REPORTS.equals(activeTab)) {\n      return TAB_REPORTS + ":" + reportPreset;\n    }`,
  `    if (TAB_CASH.equals(activeTab)) {\n      return TAB_CASH;\n    }\n    if (TAB_REPORTS.equals(activeTab)) {\n      return TAB_REPORTS + ":" + reportPreset;\n    }`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "cash settings card",
  `    page.addView(appearance);\n    if (data.isAdmin()) {`,
  `    page.addView(appearance);\n    if (data.hasPermission("finance.view")) {\n      page.addView(sectionLabel("Kasa"));\n      LinearLayout cash = UiKit.card(this);\n      cash.addView(UiKit.text(this, "Mobil Kasa", 15, UiKit.TEXT, Typeface.BOLD));\n      cash.addView(UiKit.text(\n          this,\n          "Bugünkü gelir, gider, net durum, bekleyen oda alacağı ve son hareketleri hızlıca izleyin.",\n          12,\n          UiKit.SECONDARY,\n          Typeface.NORMAL\n      ));\n      Button openCash = UiKit.button(this, "Kasa'yı Aç", UiKit.PRIMARY, view -> {\n        settingsOpen = false;\n        activeTab = TAB_CASH;\n        clearError();\n        render();\n      });\n      LinearLayout.LayoutParams cashButtonParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));\n      cashButtonParams.setMargins(0, UiKit.dp(this, 12), 0, 0);\n      openCash.setLayoutParams(cashButtonParams);\n      cash.addView(openCash);\n      page.addView(cash);\n    }\n    if (data.isAdmin()) {`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "finance local permission check",
  `      case "daily_task_reopen":\n        return "daily_task.reopen";\n      case "table_status_update":`,
  `      case "daily_task_reopen":\n        return "daily_task.reopen";\n      case "finance_manual_create":\n        return "finance.create";\n      case "table_status_update":`
);

patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/NotificationEventDetector.java",
  "finance action route",
  `    if (type.startsWith("menu_stock_")) {\n      return "restaurant:stock";\n    }`,
  `    if (type.startsWith("finance_")) {\n      return "cash";\n    }\n    if (type.startsWith("menu_stock_")) {\n      return "restaurant:stock";\n    }`
);

// Android rule tests for the secondary cash workspace.
patch(
  "apps/android-app/src/test/java/com/yardimciasistan/android/AndroidUiRulesSmoke.java",
  "cash route smoke",
  `    assertDestination("messages:waiting", AndroidUiRules.TAB_MESSAGES, AndroidUiRules.MESSAGES_WAITING);\n    assertDestination("reports", AndroidUiRules.TAB_REPORTS, "");`,
  `    assertDestination("messages:waiting", AndroidUiRules.TAB_MESSAGES, AndroidUiRules.MESSAGES_WAITING);\n    assertDestination("cash", AndroidUiRules.TAB_CASH, "");\n    assertDestination("reports", AndroidUiRules.TAB_REPORTS, "");`
);
patch(
  "apps/android-app/src/test/java/com/yardimciasistan/android/AndroidUiRulesSmoke.java",
  "cash permission smoke",
  `    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_RESTAURANT), "restaurant tab without a visible mode");\n\n    data.permissions.add("menu.view");`,
  `    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_RESTAURANT), "restaurant tab without a visible mode");\n    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_CASH), "cash tab without finance.view");\n    data.permissions.add("finance.view");\n    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_CASH), "finance.view should expose the cash workspace");\n    data.permissions.remove("finance.view");\n\n    data.permissions.add("menu.view");`
);
patch(
  "apps/android-app/src/test/java/com/yardimciasistan/android/NotificationRulesSmoke.java",
  "finance failure route smoke",
  `    assertEquals("restaurant:stock", NotificationEventDetector.routeForAction("menu_stock_set"), "stock action route");\n    assertEquals("restaurant:orders", NotificationEventDetector.routeForAction("table_order_set_served"), "order action route");`,
  `    assertEquals("restaurant:stock", NotificationEventDetector.routeForAction("menu_stock_set"), "stock action route");\n    assertEquals("restaurant:orders", NotificationEventDetector.routeForAction("table_order_set_served"), "order action route");\n    assertEquals("cash", NotificationEventDetector.routeForAction("finance_manual_create"), "finance action route");`
);

// Validate everything first, then write all files atomically from the user's perspective.
const sources = new Map();
for (const edit of edits) {
  const absolute = path.join(root, edit.relativePath);
  if (!sources.has(absolute)) {
    sources.set(absolute, fs.readFileSync(absolute, "utf8"));
  }
  const source = sources.get(absolute);
  const count = source.split(edit.before).length - 1;
  if (count !== 1) {
    throw new Error(`${edit.label}: beklenen kaynak bloğu ${count} kez bulundu (${edit.relativePath}); hiçbir dosya yazılmadı.`);
  }
  sources.set(absolute, source.replace(edit.before, edit.after));
}

for (const [absolute, content] of sources) {
  fs.writeFileSync(absolute, content, "utf8");
}

console.log(`android-mobile-cash-patch-ok (${edits.length} doğrulanmış değişiklik)`);
