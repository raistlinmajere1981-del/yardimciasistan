package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.view.View;
import android.widget.Button;
import android.widget.HorizontalScrollView;
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
      page.addView(emptyCard(
          "Bu cihazın bu alan için yetkisi yok",
          "Yetkiler masaüstü yöneticisi tarafından belirlenir."
      ));
      return UiKit.scroll(activity, page, bottomPaddingDp);
    }

    page.addView(filterBar(options.toArray(new String[0][]), mode));

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
    if (AndroidUiRules.canCreateRoomReservation(data)) {
      Button create = UiKit.button(
          activity,
          "+ Yeni Rezervasyon",
          UiKit.PRIMARY,
          view -> listener.onCreateRoomReservation()
      );
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
      params.setMargins(0, 0, 0, UiKit.dp(activity, 10));
      create.setLayoutParams(params);
      create.setEnabled(!data.customers.isEmpty());
      page.addView(create);
    }

    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Bekleyen", countPensionReservations("pending"), UiKit.WARNING),
        new CounterValue("Giriş", countPensionDate(true), UiKit.INFO),
        new CounterValue("Çıkış", countPensionDate(false), UiKit.ACCENT)
    }));

    int shown = 0;
    for (OperationData.ReservationRecord reservation : data.reservations) {
      if (!AndroidUiRules.isPensionReservation(data, reservation)
          || !AndroidUiRules.reservationAllowed(data, reservation)) {
        continue;
      }
      page.addView(listener.createReservationCard(reservation));
      shown += 1;
    }
    if (shown == 0) {
      page.addView(emptyCard("Konaklama rezervasyonu yok", "Yeni rezervasyonlar burada listelenir."));
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
      page.addView(emptyCard("Oda verisi yayınlanmamış", "Masaüstünden Android özetini yayınlayın."));
    }
    for (OperationData.RoomRecord room : data.rooms) {
      page.addView(listener.createRoomCard(room));
    }
  }

  private void renderStays(LinearLayout page) {
    Button assign = UiKit.button(
        activity,
        "+ Müşteriyi Odaya Ata",
        UiKit.PRIMARY,
        view -> listener.onAssignCustomerToRoom()
    );
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
    params.setMargins(0, 0, 0, UiKit.dp(activity, 10));
    assign.setLayoutParams(params);
    assign.setEnabled(!data.customers.isEmpty() && !data.rooms.isEmpty());
    page.addView(assign);

    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Planlı", countCustomerRoomStays("planned"), UiKit.WARNING),
        new CounterValue("Konaklıyor", countCustomerRoomStays("checked_in"), UiKit.INFO),
        new CounterValue("Tamamlandı", countCustomerRoomStays("checked_out"), UiKit.SUCCESS),
        new CounterValue("İptal", countCustomerRoomStays("cancelled"), UiKit.MUTED)
    }));

    if (data.customerRoomStays.isEmpty()) {
      page.addView(emptyCard(
          "Konaklama arşivi boş",
          "Müşteri-oda atamaları oluşturulduğunda burada saklanır."
      ));
    }
    for (OperationData.CustomerRoomStayRecord stay : data.customerRoomStays) {
      page.addView(listener.createStayCard(stay));
    }
  }

  private void renderTasks(LinearLayout page) {
    if (data.hasPermission("daily_task.create")
        && data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ROOMS)) {
      Button create = UiKit.button(
          activity,
          "+ Yeni İş",
          UiKit.PRIMARY,
          view -> listener.onCreateTask()
      );
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46));
      params.setMargins(0, 0, 0, UiKit.dp(activity, 10));
      create.setLayoutParams(params);
      page.addView(create);
    }

    page.addView(statusStrip(new CounterValue[] {
        new CounterValue("Bekleyen", countPensionTasks(false), UiKit.WARNING),
        new CounterValue("Tamam", countPensionTasks(true), UiKit.SUCCESS)
    }));

    int shown = 0;
    for (OperationData.TaskRecord task : data.tasks) {
      if (!AndroidUiRules.isPensionTask(data, task) || !AndroidUiRules.taskAllowed(data, task)) {
        continue;
      }
      page.addView(listener.createTaskCard(task));
      shown += 1;
    }
    if (shown == 0) {
      page.addView(emptyCard("Pansiyon işi yok", "Günlük pansiyon işleri sakin görünüyor."));
    }
  }

  private View filterBar(String[][] options, String selected) {
    HorizontalScrollView scroll = new HorizontalScrollView(activity);
    scroll.setHorizontalScrollBarEnabled(false);
    LinearLayout row = UiKit.row(activity);
    row.setPadding(0, UiKit.dp(activity, 3), 0, UiKit.dp(activity, 6));
    for (String[] option : options) {
      row.addView(UiKit.chip(
          activity,
          option[1],
          option[0].equals(selected),
          view -> listener.onModeChanged(option[0])
      ));
    }
    scroll.addView(row);
    return scroll;
  }

  private View statusStrip(CounterValue[] counters) {
    HorizontalScrollView scroll = new HorizontalScrollView(activity);
    scroll.setHorizontalScrollBarEnabled(false);
    scroll.setContentDescription("Sayaçlar");
    LinearLayout row = UiKit.row(activity);
    row.setPadding(0, UiKit.dp(activity, 2), UiKit.dp(activity, 4), UiKit.dp(activity, 7));
    for (CounterValue counter : counters) {
      row.addView(UiKit.counterChip(activity, counter.label, counter.value, counter.tone, null));
    }
    scroll.addView(row);
    return scroll;
  }

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(activity, title, 14, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(activity, detail, 12, UiKit.SECONDARY, Typeface.NORMAL));
    return card;
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
