import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(
  process.cwd(),
  "apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java"
);
let source = readFileSync(file, "utf8");
let changeCount = 0;

function replaceOnce(label, before, after) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: beklenen blok ${matches} kez bulundu; dosya değiştirilmedi.`);
  }
  source = source.replace(before, after);
  changeCount += 1;
}

replaceOnce(
  "Bugün rezervasyon sayaçları",
  `    if (canViewReservations) {\n      counters.add(new CounterValue("Rez.", data.pendingReservations, UiKit.WARNING, "pension:reservations"));\n    }`,
  `    if (canViewReservations) {\n      int pensionPending = countPensionReservations("pending");\n      int restaurantPending = countRestaurantOnlyReservations("pending");\n      if (pensionPending > 0) {\n        counters.add(new CounterValue("Oda Rez.", pensionPending, UiKit.WARNING, "pension:reservations"));\n      }\n      if (restaurantPending > 0) {\n        counters.add(new CounterValue("Masa Rez.", restaurantPending, UiKit.WARNING, "restaurant:reservations"));\n      }\n    }`
);

replaceOnce(
  "Restoran rezervasyon sekmesi",
  `    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TABLES)) {\n      options.add(new String[] {AndroidUiRules.RESTAURANT_TABLES, "Masalar"});\n    }\n    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_ORDERS)) {`,
  `    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_TABLES)) {\n      options.add(new String[] {AndroidUiRules.RESTAURANT_TABLES, "Masalar"});\n    }\n    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS)) {\n      options.add(new String[] {AndroidUiRules.RESTAURANT_RESERVATIONS, "Rezervasyonlar"});\n    }\n    if (AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_ORDERS)) {`
);

replaceOnce(
  "Restoran rezervasyon listesi",
  `      for (OperationData.TableRecord table : data.tables) {\n        page.addView(tableCard(table));\n      }\n    } else if (AndroidUiRules.RESTAURANT_ORDERS.equals(restaurantMode)) {`,
  `      for (OperationData.TableRecord table : data.tables) {\n        page.addView(tableCard(table));\n      }\n    } else if (AndroidUiRules.RESTAURANT_RESERVATIONS.equals(restaurantMode)) {\n      page.addView(statusStrip(new CounterValue[] {\n          new CounterValue("Bekleyen", countRestaurantReservations("pending"), UiKit.WARNING, ""),\n          new CounterValue("Onaylı", countRestaurantReservations("approved"), UiKit.SUCCESS, ""),\n          new CounterValue("Bugün", countRestaurantReservationsToday(), UiKit.INFO, "")\n      }));\n      int reservationCount = 0;\n      for (OperationData.ReservationRecord reservation : data.reservations) {\n        if (!AndroidUiRules.isRestaurantReservation(reservation)) {\n          continue;\n        }\n        page.addView(reservationCard(reservation, false));\n        reservationCount += 1;\n      }\n      if (reservationCount == 0) {\n        page.addView(emptyCard(\n            "Restoran rezervasyonu yok",\n            "Masa ve kahvaltı rezervasyonları geldiğinde burada görünür."\n        ));\n      }\n    } else if (AndroidUiRules.RESTAURANT_ORDERS.equals(restaurantMode)) {`
);

replaceOnce(
  "Rezervasyon kartında masa bilgisi",
  `    if (!reservation.roomIds.isEmpty()) {\n      card.addView(UiKit.text(this, "Oda: " + namesForRooms(reservation.roomIds), 12, UiKit.MUTED, Typeface.NORMAL));\n    }\n    LinearLayout contact = UiKit.row(this);`,
  `    if (!reservation.roomIds.isEmpty()) {\n      card.addView(UiKit.text(this, "Oda: " + namesForRooms(reservation.roomIds), 12, UiKit.MUTED, Typeface.NORMAL));\n    }\n    if (!reservation.tableIds.isEmpty()) {\n      card.addView(UiKit.text(this, "Masa: " + namesForTables(reservation.tableIds), 12, UiKit.MUTED, Typeface.NORMAL));\n    }\n    LinearLayout contact = UiKit.row(this);`
);

replaceOnce(
  "Rezervasyon detayında masa bilgisi",
  `    if (!reservation.roomIds.isEmpty()) {\n      summary.addView(UiKit.divider(this));\n      summary.addView(detailLine("Oda", namesForRooms(reservation.roomIds)));\n    }\n    if (!reservation.notes.isEmpty()) {`,
  `    if (!reservation.roomIds.isEmpty()) {\n      summary.addView(UiKit.divider(this));\n      summary.addView(detailLine("Oda", namesForRooms(reservation.roomIds)));\n    }\n    if (!reservation.tableIds.isEmpty()) {\n      summary.addView(UiKit.divider(this));\n      summary.addView(detailLine("Masa", namesForTables(reservation.tableIds)));\n    }\n    if (!reservation.notes.isEmpty()) {`
);

replaceOnce(
  "Restoran rezervasyon sayaç yardımcıları",
  `  private int countPensionReservations(String status) {\n    int count = 0;\n    for (OperationData.ReservationRecord reservation : data.reservations) {\n      if (status.equals(reservation.status) && isPensionReservation(reservation)) {\n        count += 1;\n      }\n    }\n    return count;\n  }\n\n  private int countPensionDate(boolean checkIn) {`,
  `  private int countPensionReservations(String status) {\n    int count = 0;\n    for (OperationData.ReservationRecord reservation : data.reservations) {\n      if (status.equals(reservation.status) && isPensionReservation(reservation)) {\n        count += 1;\n      }\n    }\n    return count;\n  }\n\n  private int countRestaurantReservations(String status) {\n    int count = 0;\n    for (OperationData.ReservationRecord reservation : data.reservations) {\n      if (status.equals(reservation.status) && AndroidUiRules.isRestaurantReservation(reservation)) {\n        count += 1;\n      }\n    }\n    return count;\n  }\n\n  private int countRestaurantOnlyReservations(String status) {\n    int count = 0;\n    for (OperationData.ReservationRecord reservation : data.reservations) {\n      if (status.equals(reservation.status) && AndroidUiRules.isRestaurantOnlyReservation(reservation)) {\n        count += 1;\n      }\n    }\n    return count;\n  }\n\n  private int countRestaurantReservationsToday() {\n    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());\n    int count = 0;\n    for (OperationData.ReservationRecord reservation : data.reservations) {\n      if (!AndroidUiRules.isRestaurantReservation(reservation)\n          || "cancelled".equals(reservation.status)\n          || "rejected".equals(reservation.status)) {\n        continue;\n      }\n      if (today.equals(reservation.startDate)) {\n        count += 1;\n      }\n    }\n    return count;\n  }\n\n  private int countPensionDate(boolean checkIn) {`
);

replaceOnce(
  "Masa adlarını çözümleme",
  `  private String namesForRooms(List<String> roomIds) {\n    ArrayList<String> names = new ArrayList<>();\n    for (String roomId : roomIds) {\n      for (OperationData.RoomRecord room : data.rooms) {\n        if (roomId.equals(room.id)) {\n          names.add(room.name);\n          break;\n        }\n      }\n    }\n    return names.isEmpty() ? "Atama bekliyor" : joinNonEmpty(", ", names.toArray(new String[0]));\n  }\n\n  private OperationData.TableRecord tableById(String tableId) {`,
  `  private String namesForRooms(List<String> roomIds) {\n    ArrayList<String> names = new ArrayList<>();\n    for (String roomId : roomIds) {\n      for (OperationData.RoomRecord room : data.rooms) {\n        if (roomId.equals(room.id)) {\n          names.add(room.name);\n          break;\n        }\n      }\n    }\n    return names.isEmpty() ? "Atama bekliyor" : joinNonEmpty(", ", names.toArray(new String[0]));\n  }\n\n  private String namesForTables(List<String> tableIds) {\n    ArrayList<String> names = new ArrayList<>();\n    for (String tableId : tableIds) {\n      for (OperationData.TableRecord table : data.tables) {\n        if (tableId.equals(table.id)) {\n          names.add(table.name);\n          break;\n        }\n      }\n    }\n    return names.isEmpty() ? "Atama bekliyor" : joinNonEmpty(", ", names.toArray(new String[0]));\n  }\n\n  private OperationData.TableRecord tableById(String tableId) {`
);

const notificationCopy = "Yeni talepler ve onay bekleyen rezervasyonlar";
if (source.includes(notificationCopy)) {
  replaceOnce(
    "Bildirim ayarı açıklaması",
    notificationCopy,
    "Yeni talepler ve onay bekleyen oda/masa rezervasyonları"
  );
}

writeFileSync(file, source, "utf8");
console.log(`android-restaurant-reservations-patch-ok (${changeCount} doğrulanmış değişiklik)`);
