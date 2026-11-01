package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import java.util.ArrayList;
import java.util.List;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class CustomerDetailDialog {
  interface Listener {
    void onCustomerDialogOpened(Dialog dialog, OperationData.CustomerRecord customer);
    boolean canQueryPoints();
    void onPointActionCreated(View action);
    void onQueryPoints(Dialog dialog, OperationData.CustomerRecord customer);
    void addHeaderActions(LinearLayout header, Dialog dialog, Runnable reopen);
    void configureFullDialog(Dialog dialog);
    void onDial(String phone);
    void onWhatsApp(String phone);
    void onEditCustomer(OperationData.CustomerRecord customer);
    void onAssignRoom(OperationData.CustomerRecord customer);
    View createStayCard(OperationData.CustomerRoomStayRecord stay);
    void onDeleteCustomer(OperationData.CustomerRecord customer, Dialog dialog);
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final OperationData.CustomerRecord customer;
  private final Listener listener;

  CustomerDetailDialog(
      ComponentActivity activity,
      OperationData data,
      OperationData.CustomerRecord customer,
      Listener listener
  ) {
    this.activity = activity;
    this.data = data;
    this.customer = customer;
    this.listener = listener;
  }

  void show() {
    Dialog dialog = new Dialog(activity);
    listener.onCustomerDialogOpened(dialog, customer);
    LinearLayout shell = UiKit.column(activity);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(activity, 16), UiKit.dp(activity, 14), UiKit.dp(activity, 16), UiKit.dp(activity, 20));

    LinearLayout header = UiKit.row(activity);
    LinearLayout heading = UiKit.column(activity);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    heading.addView(UiKit.eyebrow(activity, "MÜŞTERİ DETAYI"));
    heading.addView(UiKit.title(activity, customer.fullName));
    header.addView(heading);
    listener.addHeaderActions(header, dialog, this::show);
    shell.addView(header);

    LinearLayout page = UiKit.column(activity);
    LinearLayout summary = UiKit.card(activity);
    summary.addView(detailLine("Kayıtlar", customerRecordSummary()));
    if (!customer.phone.isEmpty()) {
      summary.addView(UiKit.divider(activity));
      summary.addView(detailLine("Telefon", customer.phone));
    }
    if (!customer.email.isEmpty()) {
      summary.addView(UiKit.divider(activity));
      summary.addView(detailLine("E-posta", customer.email));
    }
    page.addView(summary);
    Button pointAction = UiKit.outlineButton(activity, "Puan sorgula", view -> listener.onQueryPoints(dialog, customer));
    pointAction.setVisibility(listener.canQueryPoints() ? View.VISIBLE : View.GONE);
    listener.onPointActionCreated(pointAction);
    page.addView(pointAction);

    if (hasCustomerIdentityDetails(customer)) {
      page.addView(sectionLabel("Kimlik bilgileri"));
      LinearLayout identityDetails = UiKit.card(activity);
      addOptionalDetail(identityDetails, "Belge", formatIdentityType(customer.identityType));
      addOptionalDetail(identityDetails, "Kimlik / pasaport no", customer.identityNumber);
      addOptionalDetail(identityDetails, "Seri no", customer.documentSerialNumber);
      addOptionalDetail(identityDetails, "Uyruk", customer.nationality);
      addOptionalDetail(identityDetails, "Doğum tarihi", customer.birthDate);
      addOptionalDetail(identityDetails, "Doğum yeri", customer.birthPlace);
      addOptionalDetail(identityDetails, "Cinsiyet", formatCustomerGender(customer.gender));
      addOptionalDetail(identityDetails, "Anne adı", customer.motherName);
      addOptionalDetail(identityDetails, "Baba adı", customer.fatherName);
      addOptionalDetail(identityDetails, "Son geçerlilik", customer.documentExpiryDate);
      addOptionalDetail(identityDetails, "Düzenleyen makam", customer.issuingAuthority);
      addOptionalDetail(identityDetails, "Adres", customer.address);
      page.addView(identityDetails);
    }

    if (!customer.notes.isEmpty()) {
      page.addView(sectionLabel("Notlar"));
      LinearLayout notes = UiKit.card(activity);
      notes.addView(UiKit.text(activity, customer.notes, 14, UiKit.TEXT, Typeface.NORMAL));
      page.addView(notes);
    }

    if (!customer.phone.isEmpty()) {
      LinearLayout contact = UiKit.row(activity);
      UiKit.addAction(contact, UiKit.outlineButton(activity, "Ara", view -> listener.onDial(customer.phone)), activity);
      if (AndroidUiRules.canUseWhatsApp(data) && data.hasPermission("customer.respond")) {
        UiKit.addAction(
            contact,
            UiKit.button(activity, "WhatsApp", UiKit.PRIMARY, view -> listener.onWhatsApp(customer.phone)),
            activity
        );
      }
      page.addView(contact);
    }

    if (AndroidUiRules.canManageCustomers(data)) {
      page.addView(sectionLabel("Müşteri işlemleri"));
      LinearLayout customerActions = UiKit.row(activity);
      UiKit.addAction(
          customerActions,
          UiKit.outlineButton(activity, "Kartı Düzenle", view -> {
            dialog.dismiss();
            listener.onEditCustomer(customer);
          }),
          activity
      );
      if (canManageCustomerRoomStays()) {
        UiKit.addAction(
            customerActions,
            UiKit.button(activity, "Odaya Ata", UiKit.PRIMARY, view -> {
              dialog.dismiss();
              listener.onAssignRoom(customer);
            }),
            activity
        );
      }
      page.addView(customerActions);
    }

    List<OperationData.CustomerRoomStayRecord> customerStays = data.staysForCustomer(customer.id);
    if (!customerStays.isEmpty()) {
      page.addView(sectionLabel("Konaklama arşivi"));
      for (OperationData.CustomerRoomStayRecord stay : customerStays) {
        page.addView(listener.createStayCard(stay));
      }
    }

    if (AndroidUiRules.canDelete(data, "customer.delete")) {
      page.addView(sectionLabel("Yönetici işlemi"));
      Button delete = UiKit.dangerButton(
          activity,
          "Müşteriyi Sil",
          view -> listener.onDeleteCustomer(customer, dialog)
      );
      delete.setLayoutParams(new LinearLayout.LayoutParams(-1, UiKit.dp(activity, 46)));
      page.addView(delete);
    }

    ScrollView scroll = UiKit.scroll(activity, page);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.show();
    listener.configureFullDialog(dialog);
  }

  private boolean canManageCustomerRoomStays() {
    return data.isAdmin()
        && data.hasPermission("customer.manage")
        && data.hasPermission("room.assign_customer");
  }

  private String customerRecordSummary() {
    ArrayList<String> parts = new ArrayList<>();
    parts.add(customer.requestCount + " talep");
    if (data.hasAnyReservationCapability()) {
      parts.add(customer.reservationCount + " rezervasyon");
    }
    if (data.hasBusinessCapability(AndroidUiRules.CAPABILITY_STAYS)) {
      parts.add(customer.stayCount + " konaklama");
    }
    return String.join(" · ", parts);
  }

  private View sectionLabel(String value) {
    TextView label = UiKit.text(activity, value, 16, UiKit.TEXT, Typeface.BOLD);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
    params.setMargins(0, UiKit.dp(activity, 7), 0, UiKit.dp(activity, 7));
    label.setLayoutParams(params);
    return label;
  }

  private View detailLine(String label, String value) {
    LinearLayout row = UiKit.row(activity);
    TextView labelView = UiKit.text(activity, label, 12, UiKit.MUTED, Typeface.BOLD);
    labelView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 0.38f));
    row.addView(labelView);
    TextView valueView = UiKit.text(activity, value, 13, UiKit.TEXT, Typeface.BOLD);
    valueView.setGravity(Gravity.END);
    valueView.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 0.62f));
    row.addView(valueView);
    return row;
  }

  private void addOptionalDetail(LinearLayout card, String label, String value) {
    if (value == null || value.trim().isEmpty()) return;
    if (card.getChildCount() > 0) {
      card.addView(UiKit.divider(activity));
    }
    card.addView(detailLine(label, value.trim()));
  }
}
