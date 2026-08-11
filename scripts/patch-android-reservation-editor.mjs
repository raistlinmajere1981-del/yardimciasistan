import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targets = {
  syncCore: "packages/sync-core/index.ts",
  database: "apps/desktop-app/electron/database.ts",
  operationData: "apps/android-app/src/main/java/com/yardimciasistan/android/OperationData.java",
  uiRules: "apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java",
  notificationRules: "apps/android-app/src/main/java/com/yardimciasistan/android/NotificationEventDetector.java",
  mainActivity: "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java",
  reservationDialog: "apps/android-app/src/main/java/com/yardimciasistan/android/ReservationEditorDialog.java"
};

const sources = Object.fromEntries(
  Object.entries(targets).map(([key, path]) => [key, readFileSync(resolve(process.cwd(), path), "utf8")])
);
let changeCount = 0;

function replaceOnce(key, label, before, after) {
  const source = sources[key];
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: beklenen blok ${matches} kez bulundu; hiçbir dosya değiştirilmedi.`);
  }
  sources[key] = source.replace(before, after);
  changeCount += 1;
}

replaceOnce(
  "syncCore",
  "Rezervasyon create/update yetkileri",
  `  "reservation.view",\n  "reservation.approve",`,
  `  "reservation.view",\n  "reservation.create",\n  "reservation.update",\n  "reservation.approve",`
);

replaceOnce(
  "syncCore",
  "Müşteri rezervasyon görev grubu",
  `    "reservation.view",\n    "reservation.approve"`,
  `    "reservation.view",\n    "reservation.create",\n    "reservation.update",\n    "reservation.approve"`
);

replaceOnce(
  "syncCore",
  "Android rezervasyon action tipleri",
  `  "customer_room_stay_status",\n  "reservation_approve",`,
  `  "customer_room_stay_status",\n  "reservation_room_create",\n  "reservation_room_update",\n  "reservation_table_create",\n  "reservation_table_update",\n  "reservation_approve",`
);

replaceOnce(
  "syncCore",
  "Android rezervasyon action yetki eşlemesi",
  `  customer_room_stay_status: "room.assign_customer",\n  reservation_approve: "reservation.approve",`,
  `  customer_room_stay_status: "room.assign_customer",\n  reservation_room_create: "reservation.create",\n  reservation_room_update: "reservation.update",\n  reservation_table_create: "reservation.create",\n  reservation_table_update: "reservation.update",\n  reservation_approve: "reservation.approve",`
);

replaceOnce(
  "database",
  "Android rezervasyon action modülü importu",
  `} from "@yardimci-asistan/sync-core";\n\nexport interface DesktopDatabaseOptions {`,
  `} from "@yardimci-asistan/sync-core";\nimport { applyAndroidReservationAction } from "./android-reservation-actions.js";\n\nexport interface DesktopDatabaseOptions {`
);

replaceOnce(
  "database",
  "Android rezervasyon action switch bağlantısı",
  `      case "customer_room_stay_status":\n        return this.applyAndroidCustomerRoomStayStatus(action, now);\n      case "reservation_approve":`,
  `      case "customer_room_stay_status":\n        return this.applyAndroidCustomerRoomStayStatus(action, now);\n      case "reservation_room_create":\n      case "reservation_room_update":\n      case "reservation_table_create":\n      case "reservation_table_update":\n        return applyAndroidReservationAction({\n          db: this.db,\n          action,\n          now,\n          insertEvent: (type, entityId, payload) =>\n            this.insertAndroidActionEvent(action, type, "reservation", entityId, payload, now)\n        });\n      case "reservation_approve":`
);

replaceOnce(
  "database",
  "Android masa rezervasyonu hata yönlendirmesi",
  `  if (actionType.startsWith("reservation_") || actionType.startsWith("room_") || actionType.startsWith("daily_task_")) {\n    return "pension";\n  }`,
  `  if (actionType.startsWith("reservation_table_")) {\n    return "restaurant";\n  }\n  if (actionType.startsWith("reservation_") || actionType.startsWith("room_") || actionType.startsWith("daily_task_")) {\n    return "pension";\n  }`
);

replaceOnce(
  "operationData",
  "Android snapshot rezervasyon yetkileri",
  `      "reservation.view",\n      "reservation.approve",`,
  `      "reservation.view",\n      "reservation.create",\n      "reservation.update",\n      "reservation.approve",`
);

replaceOnce(
  "uiRules",
  "Boş restoran rezervasyon görünümünü create yetkisiyle aç",
  `    if (RESTAURANT_RESERVATIONS.equals(mode)) {\n      return data.hasPermission("reservation.view") && hasRestaurantReservationContext(data);\n    }`,
  `    if (RESTAURANT_RESERVATIONS.equals(mode)) {\n      return data.hasPermission("reservation.view")\n          && (data.hasPermission("reservation.create") || hasRestaurantReservationContext(data));\n    }`
);

replaceOnce(
  "uiRules",
  "Kahvaltı rezervasyonunu restoran kapsamına al",
  `        "table".equals(reservation.type)\n        || "room_and_table".equals(reservation.type)`,
  `        "table".equals(reservation.type)\n        || "breakfast".equals(reservation.type)\n        || "room_and_table".equals(reservation.type)`
);

replaceOnce(
  "uiRules",
  "Kahvaltı rezervasyonunu restoran öncelikli yönlendir",
  `        "table".equals(reservation.type)\n        || (reservation.roomIds.isEmpty() && !reservation.tableIds.isEmpty())`,
  `        "table".equals(reservation.type)\n        || "breakfast".equals(reservation.type)\n        || (reservation.roomIds.isEmpty() && !reservation.tableIds.isEmpty())`
);

replaceOnce(
  "notificationRules",
  "Yeni Android rezervasyon action yönlendirmeleri",
  `    if (type.startsWith("reservation_")) {\n      return "pension:reservations";\n    }`,
  `    if (type.startsWith("reservation_table_")) {\n      return "restaurant:reservations";\n    }\n    if (type.startsWith("reservation_room_")) {\n      return "pension:reservations";\n    }\n    if (type.startsWith("reservation_")) {\n      return "pension:reservations";\n    }`
);

replaceOnce(
  "mainActivity",
  "Pansiyon yeni rezervasyon düğmesi",
  `    if (AndroidUiRules.PENSION_RESERVATIONS.equals(pensionMode)) {\n      page.addView(statusStrip(new CounterValue[] {`,
  `    if (AndroidUiRules.PENSION_RESERVATIONS.equals(pensionMode)) {\n      if (data.hasPermission("reservation.create")) {\n        Button createReservation = UiKit.button(this, "+ Yeni Rezervasyon", UiKit.PRIMARY,\n            view -> showReservationEditor(ReservationEditorDialog.Kind.ROOM, null));\n        LinearLayout.LayoutParams createParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));\n        createParams.setMargins(0, 0, 0, UiKit.dp(this, 10));\n        createReservation.setLayoutParams(createParams);\n        createReservation.setEnabled(!data.customers.isEmpty());\n        page.addView(createReservation);\n      }\n      page.addView(statusStrip(new CounterValue[] {`
);

replaceOnce(
  "mainActivity",
  "Restoran yeni rezervasyon düğmesi",
  `    } else if (AndroidUiRules.RESTAURANT_RESERVATIONS.equals(restaurantMode)) {\n      page.addView(statusStrip(new CounterValue[] {`,
  `    } else if (AndroidUiRules.RESTAURANT_RESERVATIONS.equals(restaurantMode)) {\n      if (data.hasPermission("reservation.create")) {\n        Button createReservation = UiKit.button(this, "+ Yeni Rezervasyon", UiKit.PRIMARY,\n            view -> showReservationEditor(ReservationEditorDialog.Kind.TABLE, null));\n        LinearLayout.LayoutParams createParams = new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46));\n        createParams.setMargins(0, 0, 0, UiKit.dp(this, 10));\n        createReservation.setLayoutParams(createParams);\n        createReservation.setEnabled(!data.customers.isEmpty());\n        page.addView(createReservation);\n      }\n      page.addView(statusStrip(new CounterValue[] {`
);

replaceOnce(
  "mainActivity",
  "Rezervasyon detay düzenle işlemi",
  `    page.addView(contact);\n\n    if ("pending".equals(reservation.status)`,
  `    page.addView(contact);\n\n    ReservationEditorDialog.Kind editKind = reservationEditorKind(reservation);\n    if (editKind != null\n        && data.hasPermission("reservation.update")\n        && ("pending".equals(reservation.status) || "approved".equals(reservation.status))) {\n      page.addView(sectionLabel("Düzenleme"));\n      Button edit = UiKit.outlineButton(this, "Rezervasyonu Düzenle", view -> {\n        dialog.dismiss();\n        showReservationEditor(editKind, reservation);\n      });\n      edit.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(this, 46)));\n      page.addView(edit);\n    }\n\n    if ("pending".equals(reservation.status)`
);

replaceOnce(
  "mainActivity",
  "Rezervasyon editör yardımcıları",
  `  private void sendReservationAction(OperationData.ReservationRecord reservation, String actionType, String message) {\n    sendAction(actionType, payload("reservation_id", reservation.id, "expected_updated_at", reservation.updatedAt), message);\n  }`,
  `  private ReservationEditorDialog.Kind reservationEditorKind(OperationData.ReservationRecord reservation) {\n    if (reservation == null) {\n      return null;\n    }\n    if ("room".equals(reservation.type)) {\n      return ReservationEditorDialog.Kind.ROOM;\n    }\n    if (AndroidUiRules.isRestaurantOnlyReservation(reservation)) {\n      return ReservationEditorDialog.Kind.TABLE;\n    }\n    return null;\n  }\n\n  private void showReservationEditor(\n      ReservationEditorDialog.Kind kind,\n      OperationData.ReservationRecord reservation\n  ) {\n    boolean editing = reservation != null;\n    String requiredPermission = editing ? "reservation.update" : "reservation.create";\n    if (!data.hasPermission(requiredPermission)) {\n      showError(editing ? "Bu cihazın rezervasyon düzenleme yetkisi yok." : "Bu cihazın rezervasyon oluşturma yetkisi yok.");\n      return;\n    }\n    if (!editing && data.customers.isEmpty()) {\n      showError("Rezervasyon eklemeden önce Müşteri ekranından müşteri kaydı oluşturun.");\n      return;\n    }\n    ReservationEditorDialog.show(this, data, kind, reservation, actionPayload -> {\n      String actionType;\n      if (kind == ReservationEditorDialog.Kind.ROOM) {\n        actionType = editing ? "reservation_room_update" : "reservation_room_create";\n      } else {\n        actionType = editing ? "reservation_table_update" : "reservation_table_create";\n      }\n      sendAction(\n          actionType,\n          actionPayload,\n          editing ? "Rezervasyon güncellenmek üzere gönderildi." : "Rezervasyon oluşturulmak üzere gönderildi."\n      );\n    });\n  }\n\n  private void sendReservationAction(OperationData.ReservationRecord reservation, String actionType, String message) {\n    sendAction(actionType, payload("reservation_id", reservation.id, "expected_updated_at", reservation.updatedAt), message);\n  }`
);

replaceOnce(
  "reservationDialog",
  "Web rezervasyonu değişmez alan koruması",
  `    boolean editing = reservation != null;\n    LinearLayout form = new LinearLayout(context);`,
  `    boolean editing = reservation != null;\n    boolean detailsEditable = !editing\n        || reservation.requestId.startsWith("manual:")\n        || reservation.requestId.startsWith("android:");\n    LinearLayout form = new LinearLayout(context);`
);

replaceOnce(
  "reservationDialog",
  "Tarih ve kişi alanlarını web rezervasyonunda kilitle",
  `    EditText guestCount = numberField(\n        context,\n        form,\n        "Kişi sayısı",\n        String.valueOf(editing ? Math.max(1, reservation.guestCount) : 1)\n    );`,
  `    startDate.setEnabled(detailsEditable);\n    if (endDate != null) endDate.setEnabled(detailsEditable);\n    if (time != null) time.setEnabled(detailsEditable);\n\n    EditText guestCount = numberField(\n        context,\n        form,\n        "Kişi sayısı",\n        String.valueOf(editing ? Math.max(1, reservation.guestCount) : 1)\n    );\n    guestCount.setEnabled(detailsEditable);`
);

replaceOnce(
  "reservationDialog",
  "Web rezervasyonu açıklaması",
  `    TextView status = new TextView(context);\n    status.setTextSize(12);\n    status.setPadding(0, dp(context, 8), 0, 0);\n    form.addView(status);`,
  `    TextView status = new TextView(context);\n    status.setTextSize(12);\n    status.setPadding(0, dp(context, 8), 0, 0);\n    if (editing && !detailsEditable) {\n      status.setText("Web talebinden oluşan rezervasyonda tarih, saat ve kişi bilgisi korunur; oda/masa ve not değiştirilebilir.");\n    }\n    form.addView(status);`
);

// Bütün değişiklikler başarıyla doğrulandıktan sonra dosyaları yaz.
for (const [key, path] of Object.entries(targets)) {
  writeFileSync(resolve(process.cwd(), path), sources[key], "utf8");
}

console.log(`android-reservation-editor-patch-ok (${changeCount} doğrulanmış değişiklik)`);
