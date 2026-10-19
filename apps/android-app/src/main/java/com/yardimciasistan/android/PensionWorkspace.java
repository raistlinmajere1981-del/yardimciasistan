package com.yardimciasistan.android;

import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

final class PensionWorkspace {
  interface Listener {
    void onModeChanged(String mode);
    void onCreateRoomReservation();
    void onAssignCustomerToRoom();
    void onCreateTask();
    View createReservationCard(OperationData.ReservationRecord reservation);
    View createRoomCard(OperationData.RoomRecord room);
    View createStayCard(OperationData.CustomerRoomStayRecord stay);
    View createTaskCard(OperationData.TaskRecord task);
    void onFolioAction(String actionType, JSONObject actionPayload, String successMessage);
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final Listener listener;
  private final int bottomPaddingDp;

  PensionWorkspace(
      ComponentActivity activity,
      OperationData data,
      Listener listener,
      int bottomPaddingDp
  ) {
    this.activity = activity;
    this.data = data;
    this.listener = listener;
    this.bottomPaddingDp = bottomPaddingDp;
  }

  View render(String mode) {
    LinearLayout page = UiKit.column(activity);
    ArrayList<String[]> options = new ArrayList<>();
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_RESERVATIONS)) {
      options.add(new String[] {AndroidUiRules.PENSION_RESERVATIONS, "Rezervasyonlar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_ROOMS)) {
      options.add(new String[] {AndroidUiRules.PENSION_ROOMS, "Odalar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_STAYS)) {
      options.add(new String[] {AndroidUiRules.PENSION_STAYS, "Konaklamalar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_FOLIOS)) {
      options.add(new String[] {AndroidUiRules.PENSION_FOLIOS, "Hesaplar"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_TASKS)) {
      options.add(new String[] {AndroidUiRules.PENSION_TASKS, "İşler"});
    }
    if (AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_KBS)) options.add(new String[] {AndroidUiRules.PENSION_KBS, "KBS"});

    if (options.isEmpty()) {
      page.addView(UiKit.emptyCard(activity,
          "Bu cihazın bu alan için yetkisi yok",
          "Yetkiler masaüstü yöneticisi tarafından belirlenir."
      ));
      return UiKit.scroll(activity, page, bottomPaddingDp);
    }

    page.addView(titleBar(mode));
    page.addView(UiKit.filterBar(activity, options.toArray(new String[0][]), mode, listener::onModeChanged));

    if (AndroidUiRules.PENSION_RESERVATIONS.equals(mode)) {
      renderReservations(page);
    } else if (AndroidUiRules.PENSION_ROOMS.equals(mode)) {
      renderRooms(page);
    } else if (AndroidUiRules.PENSION_STAYS.equals(mode)) {
      renderStays(page);
    } else if (AndroidUiRules.PENSION_FOLIOS.equals(mode)) {
      RoomFolioWorkspace.append(
          activity,
          page,
          data,
          (actionType, actionPayload, successMessage) ->
              listener.onFolioAction(actionType, actionPayload, successMessage)
      );
    } else if (AndroidUiRules.PENSION_KBS.equals(mode)) {
      KbsWorkspace.append(activity, page, data, (type, payload, message) -> listener.onFolioAction(type, payload, message));
    } else {
      renderTasks(page);
    }

    return UiKit.scroll(activity, page, bottomPaddingDp);
  }

  private void renderReservations(LinearLayout page) {
    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Bekleyen", countPensionReservations("pending"), UiKit.WARNING),
        new CounterValue("Giriş", countPensionDate(true), UiKit.INFO),
        new CounterValue("Çıkış", countPensionDate(false), UiKit.ACCENT)
    }));

    int shown = 0;
    NativeSearchList search = null;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (!AndroidUiRules.isPensionReservation(data, reservation)
          || !AndroidUiRules.reservationAllowed(data, reservation)) {
        continue;
      }
      if (search == null) search = NativeSearchList.attachTo(page, "Rezervasyon ara");
      View row = listener.createReservationCard(reservation);
      page.addView(row);
      search.add(row, reservation.customerName + " " + reservation.title + " "
          + reservation.startDate + " " + reservation.endDate + " " + reservation.status);
      shown += 1;
    }
    if (search != null) search.showNoMatchesIn(page, "Aramayla eşleşen rezervasyon yok.");
    if (shown == 0) {
      page.addView(UiKit.emptyCard(activity, "Konaklama rezervasyonu yok", "Yeni rezervasyonlar burada listelenir."));
    }
  }

  private void renderRooms(LinearLayout page) {
    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Boş", countRoomsByStatus("available"), UiKit.SUCCESS),
        new CounterValue("Dolu", countRoomsByStatus("occupied"), UiKit.INFO),
        new CounterValue("Rezerve", countRoomsByStatus("reserved"), UiKit.WARNING),
        new CounterValue("Temizlik", countRoomsByStatus("cleaning"), UiKit.WARNING),
        new CounterValue("Bakım", countRoomsByStatus("maintenance"), UiKit.DANGER)
    }));

    if (data.rooms.isEmpty()) {
      page.addView(UiKit.emptyCard(activity, "Oda verisi yayınlanmamış", "Masaüstünden Android özetini yayınlayın."));
    }
    if (!data.rooms.isEmpty()) {
      NativeSearchList search = NativeSearchList.attachTo(page, "Oda ara");
      for (OperationData.RoomRecord room : data.rooms) {
        View roomCard = listener.createRoomCard(room);
        page.addView(roomCard);
        search.add(roomCard,
            room.name + " " + room.number + " " + room.status + " " + room.activeReservation);
      }
      search.showNoMatchesIn(page, "Aramayla eşleşen oda yok.");
    }
  }

  private void renderStays(LinearLayout page) {
    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Planlı", countCustomerRoomStays("planned"), UiKit.WARNING),
        new CounterValue("Konaklıyor", countCustomerRoomStays("checked_in"), UiKit.INFO),
        new CounterValue("Tamamlandı", countCustomerRoomStays("checked_out"), UiKit.SUCCESS),
        new CounterValue("İptal", countCustomerRoomStays("cancelled"), UiKit.MUTED)
    }));

    if (data.customerRoomStays.isEmpty()) {
      page.addView(UiKit.emptyCard(activity,
          "Konaklama arşivi boş",
          "Müşteri-oda atamaları oluşturulduğunda burada saklanır."
      ));
    } else {
      NativeSearchList search = NativeSearchList.attachTo(page, "Konuk veya oda ara");
      for (OperationData.CustomerRoomStayRecord stay : data.customerRoomStays) {
        View row = listener.createStayCard(stay);
        page.addView(row);
        search.add(row, stay.customerName + " " + stay.roomName + " "
            + stay.roomNumber + " " + stay.status + " " + stay.checkInDate
            + " " + stay.checkOutDate + " " + stay.notes);
      }
      search.showNoMatchesIn(page, "Aramayla eşleşen konaklama yok.");
    }
  }

  private void renderTasks(LinearLayout page) {
    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Bekleyen", countPensionTasks(false), UiKit.WARNING),
        new CounterValue("Tamam", countPensionTasks(true), UiKit.SUCCESS)
    }));

    int shown = 0;
    NativeSearchList search = null;
    for (OperationData.TaskRecord task : data.tasks) {
      if (!AndroidUiRules.isPensionTask(data, task) || !AndroidUiRules.taskAllowed(data, task)) {
        continue;
      }
      if (search == null) search = NativeSearchList.attachTo(page, "İş veya açıklama ara");
      View row = listener.createTaskCard(task);
      page.addView(row);
      search.add(row, task.title + " " + task.description + " " + task.status
          + " " + task.dueDate + " " + task.dueTime);
      shown += 1;
    }
    if (search != null) search.showNoMatchesIn(page, "Aramayla eşleşen iş yok.");
    if (shown == 0) {
      page.addView(UiKit.emptyCard(activity, "Pansiyon işi yok", "Günlük pansiyon işleri sakin görünüyor."));
    }
  }

  private View titleBar(String mode) {
    String title = AndroidUiRules.PENSION_ROOMS.equals(mode) ? "Odalar"
        : AndroidUiRules.PENSION_RESERVATIONS.equals(mode) ? "Rezervasyonlar"
        : AndroidUiRules.PENSION_STAYS.equals(mode) ? "Konaklamalar"
        : AndroidUiRules.PENSION_FOLIOS.equals(mode) ? "Oda Hesapları"
        : AndroidUiRules.PENSION_TASKS.equals(mode) ? "Günlük İşler" : "KBS";
    Button create = null;
    if (AndroidUiRules.PENSION_RESERVATIONS.equals(mode)
        && AndroidUiRules.canCreateRoomReservation(data)) {
      create = UiKit.iconButton(activity, "+", "Yeni rezervasyon", false,
          v -> listener.onCreateRoomReservation());
      create.setEnabled(!data.customers.isEmpty());
    } else if (AndroidUiRules.PENSION_STAYS.equals(mode)) {
      create = UiKit.iconButton(activity, "+", "Müşteriyi odaya ata", false,
          v -> listener.onAssignCustomerToRoom());
      create.setEnabled(!data.customers.isEmpty() && !data.rooms.isEmpty());
    } else if (AndroidUiRules.PENSION_TASKS.equals(mode)
        && data.hasPermission("daily_task.create")
        && data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ROOMS)) {
      create = UiKit.iconButton(activity, "+", "Yeni iş", false,
          v -> listener.onCreateTask());
    }
    return UiKit.workspaceHeader(activity, title, null, create);
  }

  private View statusStrip(CounterValue[] counters) {
    ArrayList<View> tiles = new ArrayList<>();
    for (CounterValue counter : counters) {
      tiles.add(UiKit.metricCard(activity, counter.label, counter.value, counter.tone, null));
    }
    return UiKit.metricGrid(activity, tiles);
  }

  private int countPensionReservations(String status) {
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (status.equals(reservation.status)
          && AndroidUiRules.isPensionReservation(data, reservation)
          && AndroidUiRules.reservationAllowed(data, reservation)) {
        count += 1;
      }
    }
    return count;
  }

  private int countPensionDate(boolean checkIn) {
    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    int count = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (!AndroidUiRules.isPensionReservation(data, reservation)
          || !AndroidUiRules.reservationAllowed(data, reservation)
          || "cancelled".equals(reservation.status)) {
        continue;
      }
      if (today.equals(checkIn ? reservation.startDate : reservation.endDate)) {
        count += 1;
      }
    }
    return count;
  }

  private int countRoomsByStatus(String status) {
    int count = 0;
    for (OperationData.RoomRecord room : data.rooms) {
      if (status.equals(room.status)) count += 1;
    }
    return count;
  }

  private int countCustomerRoomStays(String status) {
    int count = 0;
    for (OperationData.CustomerRoomStayRecord stay : data.customerRoomStays) {
      if (status.equals(stay.status)) count += 1;
    }
    return count;
  }

  private int countPensionTasks(boolean completed) {
    int count = 0;
    for (OperationData.TaskRecord task : data.tasks) {
      if (!AndroidUiRules.isPensionTask(data, task) || !AndroidUiRules.taskAllowed(data, task)) {
        continue;
      }
      if ((completed && "done".equals(task.status)) || (!completed && "pending".equals(task.status))) {
        count += 1;
      }
    }
    return count;
  }

  private static final class CounterValue {
    final String label;
    final int value;
    final int tone;

    CounterValue(String label, int value, int tone) {
      this.label = label;
      this.value = value;
      this.tone = tone;
    }
  }
}
