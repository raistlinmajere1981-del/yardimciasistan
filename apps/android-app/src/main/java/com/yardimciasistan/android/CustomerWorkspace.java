package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.text.TextUtils;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import java.util.ArrayList;

import static com.yardimciasistan.android.AndroidPresentation.*;

final class CustomerWorkspace {
  interface Listener {
    void onFilterNormalized(String filter);
    void onFilterChanged(String filter);
    void onCreateCustomer();
    void onOpenCustomer(OperationData.CustomerRecord customer);
    View createRequestCard(OperationData.RequestRecord request);
    void onDial(String phone);
    void onWhatsApp(String phone);
  }

  private final ComponentActivity activity;
  private final OperationData data;
  private final Listener listener;
  private final int bottomPaddingDp;

  CustomerWorkspace(
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

  View render(String currentFilter) {
    LinearLayout page = UiKit.column(activity);
    boolean canManageCustomers = AndroidUiRules.canManageCustomers(data);
    boolean canViewRequests = data.hasBusinessCapability(AndroidUiRules.CAPABILITY_REQUESTS)
        && data.hasPermission("customer.view");
    if (!canManageCustomers && !canViewRequests) {
      page.addView(UiKit.emptyCard(activity,
          "Bu cihazın bu alan için yetkisi yok",
          "Yetkiler masaüstü yöneticisi tarafından belirlenir."
      ));
      return UiKit.scroll(activity, page, bottomPaddingDp);
    }

    View createCustomer = canManageCustomers
        ? UiKit.iconButton(activity, "+", "Yeni müşteri", false, view -> listener.onCreateCustomer()) : null;
    page.addView(UiKit.workspaceHeader(activity, "Müşteriler", null, createCustomer));

    ArrayList<String[]> options = new ArrayList<>();
    if (canViewRequests) {
      options.add(new String[] {AndroidUiRules.CUSTOMER_NEW, "Yeni Talepler"});
    }
    if (canManageCustomers) {
      options.add(new String[] {AndroidUiRules.CUSTOMER_LIST, "Müşteriler"});
    }
    if (canViewRequests) {
      options.add(new String[] {AndroidUiRules.CUSTOMER_WAITING, "Cevap Bekleyenler"});
    }

    String visibleFilter = normalizeFilter(currentFilter, canManageCustomers, canViewRequests);
    if (!visibleFilter.equals(currentFilter)) {
      listener.onFilterNormalized(visibleFilter);
    }
    page.addView(UiKit.filterBar(activity, options.toArray(new String[0][]), visibleFilter, listener::onFilterChanged));

    boolean customerList = AndroidUiRules.CUSTOMER_LIST.equals(visibleFilter);
    boolean hasSearchableRows = customerList ? !data.customers.isEmpty() : !data.requests.isEmpty();
    NativeSearchList search = hasSearchableRows
        ? NativeSearchList.attachTo(page, customerList ? "Müşteri ara" : "Talep ara") : null;

    if (customerList) {
      if (data.customers.isEmpty()) {
        page.addView(UiKit.emptyCard(activity,
            "Müşteri listesi boş",
            "Masaüstü güncel snapshot yayınladığında müşteriler burada görünür."
        ));
      }
      for (OperationData.CustomerRecord customer : data.customers) {
        View item = customerCard(customer);
        page.addView(item);
        if (search != null) search.add(item,
            customer.fullName + " " + customer.phone + " " + customer.email + " "
                + customer.notes + " " + String.join(" ", customer.tags));
      }
    } else {
      boolean waitingOnly = AndroidUiRules.CUSTOMER_WAITING.equals(visibleFilter);
      int shown = 0;
      for (OperationData.RequestRecord request : data.requests) {
        boolean visible = waitingOnly ? request.waitingForResponse() : "new".equals(request.status);
        if (!visible) continue;
        View item = listener.createRequestCard(request);
        page.addView(item);
        if (search != null) search.add(item,
            request.customerName + " " + request.customerPhone + " " + request.message
                + " " + request.dateText);
        shown += 1;
      }
      if (shown == 0) {
        page.addView(UiKit.emptyCard(activity,
            waitingOnly ? "Cevap bekleyen müşteri yok" : "Açık talep yok",
            "Yeni talepler geldiğinde bu liste güncellenir."
        ));
      }
    }

    if (search != null) {
      search.showNoMatchesIn(page, "Aramayla eşleşen kayıt yok.");
    }
    return UiKit.scroll(activity, page, bottomPaddingDp);
  }

  private String normalizeFilter(String filter, boolean canManageCustomers, boolean canViewRequests) {
    if ((!canManageCustomers && AndroidUiRules.CUSTOMER_LIST.equals(filter))
        || (!canViewRequests && !AndroidUiRules.CUSTOMER_LIST.equals(filter))) {
      return canManageCustomers ? AndroidUiRules.CUSTOMER_LIST : AndroidUiRules.CUSTOMER_NEW;
    }
    return filter;
  }

  private View customerCard(OperationData.CustomerRecord customer) {
    LinearLayout card = UiKit.card(activity);
    card.setOnClickListener(view -> listener.onOpenCustomer(customer));

    OperationData.CustomerRoomStayRecord activeStay = activeStayForCustomer(customer.id);
    card.addView(UiKit.recordHeader(activity, customer.fullName, 16, null,
        activeStay == null ? null : UiKit.badge(activity, "Konaklıyor", UiKit.INFO)));

    card.addView(UiKit.text(
        activity,
        customerRecordSummary(customer),
        12,
        UiKit.MUTED,
        Typeface.NORMAL
    ));

    String identitySummary = customerIdentitySummary(customer);
    if (!identitySummary.isEmpty()) {
      card.addView(UiKit.text(activity, identitySummary, 12, UiKit.SECONDARY, Typeface.BOLD));
    }

    if (activeStay != null) {
      card.addView(UiKit.text(
          activity,
          "Aktif oda: " + activeStay.roomName + " · " + joinDateRange(activeStay.checkInDate, activeStay.checkOutDate),
          12,
          UiKit.INFO,
          Typeface.BOLD
      ));
    }

    if (!customer.notes.isEmpty()) {
      TextView note = UiKit.text(activity, ellipsize(customer.notes, 130), 13, UiKit.TEXT, Typeface.NORMAL);
      note.setMaxLines(3);
      note.setEllipsize(TextUtils.TruncateAt.END);
      LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
      params.setMargins(0, UiKit.dp(activity, 7), 0, UiKit.dp(activity, 9));
      note.setLayoutParams(params);
      card.addView(note);
    }

    LinearLayout actions = UiKit.row(activity);
    UiKit.addAction(actions, UiKit.outlineButton(activity, "Ara", view -> listener.onDial(customer.phone)), activity);
    if (AndroidUiRules.canUseWhatsApp(data) && data.hasPermission("customer.respond")) {
      UiKit.addAction(
          actions,
          UiKit.outlineButton(activity, "WhatsApp", view -> listener.onWhatsApp(customer.phone)),
          activity
      );
    }
    UiKit.addAction(
        actions,
        UiKit.button(activity, "Aç", UiKit.PRIMARY, view -> listener.onOpenCustomer(customer)),
        activity
    );
    card.addView(actions);
    return card;
  }

  private String customerRecordSummary(OperationData.CustomerRecord customer) {
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

  private OperationData.CustomerRoomStayRecord activeStayForCustomer(String customerId) {
    for (OperationData.CustomerRoomStayRecord stay : data.customerRoomStays) {
      if (customerId.equals(stay.customerId) && stay.isActive()) {
        return stay;
      }
    }
    return null;
  }

}
