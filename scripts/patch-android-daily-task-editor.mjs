import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const edits = [];

function patch(relativePath, label, before, after) {
  edits.push({ relativePath, label, before, after });
}

patch(
  "packages/sync-core/index.ts",
  "daily task permissions",
  `  "daily_task.view",\n  "daily_task.complete",\n  "daily_task.reopen",`,
  `  "daily_task.view",\n  "daily_task.create",\n  "daily_task.update",\n  "daily_task.delete",\n  "daily_task.complete",\n  "daily_task.reopen",`
);
patch(
  "packages/sync-core/index.ts",
  "rooms task group permissions",
  `    "daily_task.view",\n    "daily_task.complete",\n    "daily_task.reopen"`,
  `    "daily_task.view",\n    "daily_task.create",\n    "daily_task.update",\n    "daily_task.complete",\n    "daily_task.reopen"`
);
patch(
  "packages/sync-core/index.ts",
  "daily task action types",
  `  "daily_task_complete",\n  "daily_task_reopen",\n  "daily_task_cancel",`,
  `  "daily_task_create",\n  "daily_task_update",\n  "daily_task_delete",\n  "daily_task_complete",\n  "daily_task_reopen",\n  "daily_task_cancel",`
);
patch(
  "packages/sync-core/index.ts",
  "daily task action permission map",
  `  room_status_update: "room.update_status",\n  daily_task_complete: "daily_task.complete",\n  daily_task_reopen: "daily_task.reopen",\n  table_status_update: "table.update_status",`,
  `  room_status_update: "room.update_status",\n  daily_task_create: "daily_task.create",\n  daily_task_update: "daily_task.update",\n  daily_task_delete: "daily_task.delete",\n  daily_task_complete: "daily_task.complete",\n  daily_task_reopen: "daily_task.reopen",\n  daily_task_cancel: "daily_task.update",\n  table_status_update: "table.update_status",`
);

patch(
  "packages/sync-core/tests/sync-core.test.cjs",
  "legacy staff permission expectation",
  `    "daily_task.view",\n    "daily_task.complete",\n    "daily_task.reopen"\n  ]);`,
  `    "daily_task.view",\n    "daily_task.create",\n    "daily_task.update",\n    "daily_task.complete",\n    "daily_task.reopen"\n  ]);`
);

patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java",
  "android all daily task permissions",
  `      "daily_task.view",\n      "daily_task.complete",\n      "daily_task.reopen",`,
  `      "daily_task.view",\n      "daily_task.create",\n      "daily_task.update",\n      "daily_task.delete",\n      "daily_task.complete",\n      "daily_task.reopen",`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java",
  "android staff daily task permissions",
  `      "daily_task.view",\n      "daily_task.complete",\n      "daily_task.reopen",\n      "table.view",`,
  `      "daily_task.view",\n      "daily_task.create",\n      "daily_task.update",\n      "daily_task.complete",\n      "daily_task.reopen",\n      "table.view",`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java",
  "action task type snapshot",
  `    String errorMessage = "";\n    String createdAt = "";\n    String processedAt = "";\n\n    static ActionRecord fromJson(JSONObject source) {\n      ActionRecord record = new ActionRecord();\n      record.id = value(source, "id", "");\n      record.type = value(source, "action_type", "");\n      record.status = value(source, "status", "pending");\n      record.errorMessage = value(source, "error_message", "");\n      record.createdAt = value(source, "created_at", "");`,
  `    String errorMessage = "";\n    String taskType = "";\n    String createdAt = "";\n    String processedAt = "";\n\n    static ActionRecord fromJson(JSONObject source) {\n      ActionRecord record = new ActionRecord();\n      record.id = value(source, "id", "");\n      record.type = value(source, "action_type", "");\n      record.status = value(source, "status", "pending");\n      record.errorMessage = value(source, "error_message", "");\n      JSONObject payload = source.optJSONObject("payload");\n      record.taskType = payload == null ? "" : value(payload, "task_type", "");\n      record.createdAt = value(source, "created_at", "");`
);

patch(
  "apps/desktop-app/electron/database.ts",
  "daily task helper import",
  `import { applyAndroidReservationAction } from "./android-reservation-actions.js";`,
  `import { applyAndroidReservationAction } from "./android-reservation-actions.js";\nimport { applyAndroidDailyTaskAction } from "./android-daily-task-actions.js";`
);
patch(
  "apps/desktop-app/electron/database.ts",
  "daily task android mutations",
  `      case "room_status_update":\n        return this.applyAndroidRoomStatus(action, now);\n      case "daily_task_complete":`,
  `      case "room_status_update":\n        return this.applyAndroidRoomStatus(action, now);\n      case "daily_task_create":\n      case "daily_task_update":\n      case "daily_task_delete":\n        return applyAndroidDailyTaskAction({\n          db: this.db,\n          action,\n          now,\n          insertEvent: (type, entityId, payload) =>\n            this.insertAndroidActionEvent(action, type, "daily_task", entityId, payload, now)\n        });\n      case "daily_task_complete":`
);
patch(
  "apps/desktop-app/electron/database.ts",
  "daily task delete admin guard",
  `  "customer_room_stay_status",\n  "menu_category_delete",`,
  `  "customer_room_stay_status",\n  "daily_task_delete",\n  "menu_category_delete",`
);
patch(
  "apps/desktop-app/electron/database.ts",
  "failure target receives payload",
  `        target_page: androidActionTargetPage(actionType),`,
  `        target_page: androidActionTargetPage(actionType, action.payload),`
);
patch(
  "apps/desktop-app/electron/database.ts",
  "restaurant task failure target",
  `function androidActionTargetPage(actionType: string): DesktopAndroidActionFailure["targetPage"] {\n  if (actionType.startsWith("customer_") || actionType === "message_delete") {\n    return "customerWork";\n  }\n  if (actionType.startsWith("reservation_table_")) {\n    return "restaurant";\n  }\n  if (actionType.startsWith("reservation_") || actionType.startsWith("room_") || actionType.startsWith("daily_task_")) {\n    return "pension";\n  }`,
  `function androidActionTargetPage(\n  actionType: string,\n  payload: Record<string, unknown> = {}\n): DesktopAndroidActionFailure["targetPage"] {\n  if (actionType.startsWith("customer_") || actionType === "message_delete") {\n    return "customerWork";\n  }\n  if (actionType.startsWith("reservation_table_")) {\n    return "restaurant";\n  }\n  if (actionType.startsWith("daily_task_") && String(payload.task_type ?? "").trim() === "manual_restaurant") {\n    return "restaurant";\n  }\n  if (actionType.startsWith("reservation_") || actionType.startsWith("room_") || actionType.startsWith("daily_task_")) {\n    return "pension";\n  }`
);

patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  "restaurant task mode constant",
  `  static final String RESTAURANT_ORDERS = "orders";\n  static final String RESTAURANT_STOCK = "stock";`,
  `  static final String RESTAURANT_ORDERS = "orders";\n  static final String RESTAURANT_TASKS = "tasks";\n  static final String RESTAURANT_STOCK = "stock";`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  "restaurant task mode permission",
  `    if (RESTAURANT_ORDERS.equals(mode)) {\n      return data.hasPermission("table_order.view");\n    }\n    if (RESTAURANT_STOCK.equals(mode)) {`,
  `    if (RESTAURANT_ORDERS.equals(mode)) {\n      return data.hasPermission("table_order.view");\n    }\n    if (RESTAURANT_TASKS.equals(mode)) {\n      return data.hasPermission("daily_task.view");\n    }\n    if (RESTAURANT_STOCK.equals(mode)) {`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  "task classification helpers",
  `  static boolean canDelete(OperationData data, String permission) {`,
  `  static boolean isManualTask(OperationData.TaskRecord task) {\n    return task != null && ("manual_pension".equals(task.type) || "manual_restaurant".equals(task.type));\n  }\n\n  static boolean isRestaurantTask(OperationData.TaskRecord task) {\n    return task != null && "manual_restaurant".equals(task.type);\n  }\n\n  static boolean isPensionTask(OperationData.TaskRecord task) {\n    return task != null && !isRestaurantTask(task);\n  }\n\n  static boolean canDelete(OperationData data, String permission) {`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  "restaurant task first mode",
  `    if (canOpenRestaurantMode(data, RESTAURANT_ORDERS)) {\n      return RESTAURANT_ORDERS;\n    }\n    if (canOpenRestaurantMode(data, RESTAURANT_STOCK)) {`,
  `    if (canOpenRestaurantMode(data, RESTAURANT_ORDERS)) {\n      return RESTAURANT_ORDERS;\n    }\n    if (canOpenRestaurantMode(data, RESTAURANT_TASKS)) {\n      return RESTAURANT_TASKS;\n    }\n    if (canOpenRestaurantMode(data, RESTAURANT_STOCK)) {`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  "restaurant task destination",
  `          !RESTAURANT_RESERVATIONS.equals(mode)\n          && !RESTAURANT_ORDERS.equals(mode)\n          && !RESTAURANT_STOCK.equals(mode)`,
  `          !RESTAURANT_RESERVATIONS.equals(mode)\n          && !RESTAURANT_ORDERS.equals(mode)\n          && !RESTAURANT_TASKS.equals(mode)\n          && !RESTAURANT_STOCK.equals(mode)`
);

patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "restaurant task tab option",
  `    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_ORDERS)) {\n      options.add(new String[] {AndroidUiRules.RESTAURANT_ORDERS, "Açık Adisyon"});\n    }\n    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_STOCK)) {`,
  `    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_ORDERS)) {\n      options.add(new String[] {AndroidUiRules.RESTAURANT_ORDERS, "Açık Adisyon"});\n    }\n    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TASKS)) {\n      options.add(new String[] {AndroidUiRules.RESTAURANT_TASKS, "İşler"});\n    }\n    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_STOCK)) {`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "pension task editor and filter",
  `    } else {\n      page.addView(statusStrip(new CounterValue[] {\n          new CounterValue("Bekleyen", countPensionTasks(false), UiKit.WARNING, ""),\n          new CounterValue("Tamam", countPensionTasks(true), UiKit.SUCCESS, "")\n      }));\n      int taskCount = 0;\n      for (OperationData.TaskRecord task : data.tasks) {\n        page.addView(taskCard(task, false));\n        taskCount += 1;\n      }\n      if (taskCount == 0) {\n        page.addView(emptyCard("Günlük iş yok", "Günlük işler sakin görünüyor."));\n      }\n    }\n    return mainScreenScroll(page);\n  }`,
  `    } else {\n      if (data.hasPermission("daily_task.create")) {\n        Button createTask = UiKit.button(this, "+ Yeni İş", UiKit.PRIMARY,\n            view -> showDailyTaskEditor(DailyTaskEditorDialog.Kind.PENSION, null));\n        LinearLayout.LayoutParams createParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));\n        createParams.setMargins(0, 0, 0, UiKit.dp(this, 10));\n        createTask.setLayoutParams(createParams);\n        page.addView(createTask);\n      }\n      page.addView(statusStrip(new CounterValue[] {\n          new CounterValue("Bekleyen", countPensionTasks(false), UiKit.WARNING, ""),\n          new CounterValue("Tamam", countPensionTasks(true), UiKit.SUCCESS, "")\n      }));\n      int taskCount = 0;\n      for (OperationData.TaskRecord task : data.tasks) {\n        if (!AndroidUiRules.isPensionTask(task)) {\n          continue;\n        }\n        page.addView(taskCard(task, false));\n        taskCount += 1;\n      }\n      if (taskCount == 0) {\n        page.addView(emptyCard("Pansiyon işi yok", "Günlük pansiyon işleri sakin görünüyor."));\n      }\n    }\n    return mainScreenScroll(page);\n  }`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "restaurant task editor and list",
  `      for (OperationData.TableOrder order : data.tableOrders) {\n        if (order.isActive()) {\n          page.addView(activeOrderCard(order));\n        }\n      }\n    } else if (AndroidUiRules.RESTAURANT_STOCK.equals(restaurantMode)) {`,
  `      for (OperationData.TableOrder order : data.tableOrders) {\n        if (order.isActive()) {\n          page.addView(activeOrderCard(order));\n        }\n      }\n    } else if (AndroidUiRules.RESTAURANT_TASKS.equals(restaurantMode)) {\n      if (data.hasPermission("daily_task.create")) {\n        Button createTask = UiKit.button(this, "+ Yeni İş", UiKit.PRIMARY,\n            view -> showDailyTaskEditor(DailyTaskEditorDialog.Kind.RESTAURANT, null));\n        LinearLayout.LayoutParams createParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));\n        createParams.setMargins(0, 0, 0, UiKit.dp(this, 10));\n        createTask.setLayoutParams(createParams);\n        page.addView(createTask);\n      }\n      page.addView(statusStrip(new CounterValue[] {\n          new CounterValue("Bekleyen", countRestaurantTasks(false), UiKit.WARNING, ""),\n          new CounterValue("Tamam", countRestaurantTasks(true), UiKit.SUCCESS, "")\n      }));\n      int taskCount = 0;\n      for (OperationData.TaskRecord task : data.tasks) {\n        if (!AndroidUiRules.isRestaurantTask(task)) {\n          continue;\n        }\n        page.addView(taskCard(task, false));\n        taskCount += 1;\n      }\n      if (taskCount == 0) {\n        page.addView(emptyCard("Restoran işi yok", "Günlük restoran işleri sakin görünüyor."));\n      }\n    } else if (AndroidUiRules.RESTAURANT_STOCK.equals(restaurantMode)) {`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "daily task card actions",
  `    boolean canReopen = ("done".equals(task.status) || "cancelled".equals(task.status)) && data.hasPermission("daily_task.reopen");\n    boolean canComplete = !"done".equals(task.status) && !"cancelled".equals(task.status) && data.hasPermission("daily_task.complete");\n    if (canReopen || canComplete) {\n      LinearLayout actions = UiKit.row(this);\n      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);\n      params.setMargins(0, UiKit.dp(this, 9), 0, 0);\n      actions.setLayoutParams(params);\n      if (canReopen) {\n        UiKit.addAction(actions, UiKit.button(this, "Yeniden Aç", UiKit.PRIMARY, view -> sendAction("daily_task_reopen", payload("task_id", task.id, "expected_updated_at", task.updatedAt), "Günlük iş yeniden açılmak üzere gönderildi.")), this);\n      } else {\n        UiKit.addAction(actions, UiKit.button(this, "Tamamla", UiKit.PRIMARY, view -> sendAction("daily_task_complete", payload("task_id", task.id, "expected_updated_at", task.updatedAt), "Günlük iş tamamlanmak üzere gönderildi.")), this);\n      }\n      card.addView(actions);\n    }`,
  `    boolean manualTask = AndroidUiRules.isManualTask(task);\n    boolean canEdit = manualTask && data.hasPermission("daily_task.update");\n    boolean canReopen = ("done".equals(task.status) || "cancelled".equals(task.status)) && data.hasPermission("daily_task.reopen");\n    boolean canComplete = !"done".equals(task.status) && !"cancelled".equals(task.status) && data.hasPermission("daily_task.complete");\n    if (canEdit || canReopen || canComplete) {\n      LinearLayout actions = UiKit.row(this);\n      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);\n      params.setMargins(0, UiKit.dp(this, 9), 0, 0);\n      actions.setLayoutParams(params);\n      if (canEdit) {\n        DailyTaskEditorDialog.Kind kind = AndroidUiRules.isRestaurantTask(task)\n            ? DailyTaskEditorDialog.Kind.RESTAURANT\n            : DailyTaskEditorDialog.Kind.PENSION;\n        UiKit.addAction(actions, UiKit.outlineButton(this, "Düzenle", view -> showDailyTaskEditor(kind, task)), this);\n      }\n      if (canReopen) {\n        UiKit.addAction(actions, UiKit.button(this, "Yeniden Aç", UiKit.PRIMARY, view -> sendAction("daily_task_reopen", payload("task_id", task.id, "task_type", task.type, "expected_updated_at", task.updatedAt), "Günlük iş yeniden açılmak üzere gönderildi.")), this);\n      } else if (canComplete) {\n        UiKit.addAction(actions, UiKit.button(this, "Tamamla", UiKit.PRIMARY, view -> sendAction("daily_task_complete", payload("task_id", task.id, "task_type", task.type, "expected_updated_at", task.updatedAt), "Günlük iş tamamlanmak üzere gönderildi.")), this);\n      }\n      card.addView(actions);\n    }`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "daily task editor sender",
  `  private void sendReservationAction(OperationData.ReservationRecord reservation, String actionType, String message) {`,
  `  private void showDailyTaskEditor(DailyTaskEditorDialog.Kind kind, OperationData.TaskRecord task) {\n    boolean editing = task != null;\n    String requiredPermission = editing ? "daily_task.update" : "daily_task.create";\n    if (!data.hasPermission(requiredPermission)) {\n      showError(editing ? "Bu cihazın günlük iş düzenleme yetkisi yok." : "Bu cihazın günlük iş ekleme yetkisi yok.");\n      return;\n    }\n    if (editing && !AndroidUiRules.isManualTask(task)) {\n      showError("Otomatik oluşturulan günlük işler yalnız tamamla veya yeniden aç işlemiyle yönetilebilir.");\n      return;\n    }\n    boolean canDelete = editing && AndroidUiRules.canDelete(data, "daily_task.delete");\n    DailyTaskEditorDialog.show(this, kind, task, canDelete, new DailyTaskEditorDialog.Listener() {\n      @Override\n      public void onSave(JSONObject actionPayload) {\n        sendAction(\n            editing ? "daily_task_update" : "daily_task_create",\n            actionPayload,\n            editing ? "Günlük iş güncellenmek üzere gönderildi." : "Günlük iş eklenmek üzere gönderildi."\n        );\n      }\n\n      @Override\n      public void onDelete() {\n        if (!editing) {\n          return;\n        }\n        sendAction(\n            "daily_task_delete",\n            payload("task_id", task.id, "task_type", task.type, "expected_updated_at", task.updatedAt),\n            "Günlük iş silinmek üzere gönderildi."\n        );\n      }\n    });\n  }\n\n  private void sendReservationAction(OperationData.ReservationRecord reservation, String actionType, String message) {`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "local daily task action permissions",
  `      case "room_status_update":\n        return "room.update_status";\n      case "daily_task_complete":\n        return "daily_task.complete";\n      case "daily_task_reopen":\n        return "daily_task.reopen";`,
  `      case "room_status_update":\n        return "room.update_status";\n      case "daily_task_create":\n        return "daily_task.create";\n      case "daily_task_update":\n      case "daily_task_cancel":\n        return "daily_task.update";\n      case "daily_task_delete":\n        return "daily_task.delete";\n      case "daily_task_complete":\n        return "daily_task.complete";\n      case "daily_task_reopen":\n        return "daily_task.reopen";`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "local daily task admin delete guard",
  `        || "customer_room_stay_status".equals(actionType)\n        || "menu_category_delete".equals(actionType)`,
  `        || "customer_room_stay_status".equals(actionType)\n        || "daily_task_delete".equals(actionType)\n        || "menu_category_delete".equals(actionType)`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  "task counters by area",
  `  private int countPensionTasks(boolean completed) {\n    int count = 0;\n    for (OperationData.TaskRecord task : data.tasks) {\n      if ((completed && "done".equals(task.status)) || (!completed && "pending".equals(task.status))) {\n        count += 1;\n      }\n    }\n    return count;\n  }`,
  `  private int countPensionTasks(boolean completed) {\n    int count = 0;\n    for (OperationData.TaskRecord task : data.tasks) {\n      if (!AndroidUiRules.isPensionTask(task)) {\n        continue;\n      }\n      if ((completed && "done".equals(task.status)) || (!completed && "pending".equals(task.status))) {\n        count += 1;\n      }\n    }\n    return count;\n  }\n\n  private int countRestaurantTasks(boolean completed) {\n    int count = 0;\n    for (OperationData.TaskRecord task : data.tasks) {\n      if (!AndroidUiRules.isRestaurantTask(task)) {\n        continue;\n      }\n      if ((completed && "done".equals(task.status)) || (!completed && "pending".equals(task.status))) {\n        count += 1;\n      }\n    }\n    return count;\n  }`
);

patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/NotificationEventDetector.java",
  "task notification route",
  `          task.title + taskDueSuffix(task),\n          "pension:tasks",`,
  `          task.title + taskDueSuffix(task),\n          routeForTask(task),`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/NotificationEventDetector.java",
  "action notification payload-aware route",
  `          routeForAction(action.type),`,
  `          routeForAction(action),`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/NotificationEventDetector.java",
  "action route overload and task route",
  `  static String routeForAction(String actionType) {\n    String type = actionType == null ? "" : actionType;`,
  `  static String routeForAction(OperationData.ActionRecord action) {\n    if (action != null && action.type.startsWith("daily_task_") && "manual_restaurant".equals(action.taskType)) {\n      return "restaurant:tasks";\n    }\n    return routeForAction(action == null ? "" : action.type);\n  }\n\n  static String routeForAction(String actionType) {\n    String type = actionType == null ? "" : actionType;`
);
patch(
  "apps/android-app/src/main/java/com/yardimciasistan/android/NotificationEventDetector.java",
  "task route helper",
  `  static String routeForReservation(OperationData.ReservationRecord reservation) {`,
  `  static String routeForTask(OperationData.TaskRecord task) {\n    return AndroidUiRules.isRestaurantTask(task) ? "restaurant:tasks" : "pension:tasks";\n  }\n\n  static String routeForReservation(OperationData.ReservationRecord reservation) {`
);

patch(
  "apps/android-app/src/test/java/com/yardimciasistan/android/AndroidUiRulesSmoke.java",
  "restaurant task-only mode test",
  `    data.permissions.clear();\n    data.permissions.add("menu.stock_view");\n    assertEquals(AndroidUiRules.RESTAURANT_STOCK, AndroidUiRules.firstRestaurantMode(data), "stock-only restaurant profile");`,
  `    data.permissions.clear();\n    data.permissions.add("daily_task.view");\n    assertEquals(AndroidUiRules.RESTAURANT_TASKS, AndroidUiRules.firstRestaurantMode(data), "task-only restaurant profile");\n\n    data.permissions.clear();\n    data.permissions.add("menu.stock_view");\n    assertEquals(AndroidUiRules.RESTAURANT_STOCK, AndroidUiRules.firstRestaurantMode(data), "stock-only restaurant profile");`
);
patch(
  "apps/android-app/src/test/java/com/yardimciasistan/android/AndroidUiRulesSmoke.java",
  "restaurant task notification destination test",
  `    assertDestination("restaurant:orders", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_ORDERS);\n    assertDestination("restaurant:stock",`,
  `    assertDestination("restaurant:orders", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_ORDERS);\n    assertDestination("restaurant:tasks", AndroidUiRules.TAB_RESTAURANT, AndroidUiRules.RESTAURANT_TASKS);\n    assertDestination("restaurant:stock",`
);

const files = new Map();
for (const edit of edits) {
  const filePath = path.join(root, edit.relativePath);
  if (!files.has(edit.relativePath)) {
    files.set(edit.relativePath, fs.readFileSync(filePath, "utf8"));
  }
  const source = files.get(edit.relativePath);
  const occurrences = source.split(edit.before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${edit.relativePath}: ${edit.label} beklenen blok sayısı 1, bulunan ${occurrences}. Hiçbir dosya yazılmadı.`);
  }
  files.set(edit.relativePath, source.replace(edit.before, edit.after));
}

for (const [relativePath, content] of files) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

console.log(`android-daily-task-editor-patch-ok (${edits.length} doğrulanmış değişiklik)`);
