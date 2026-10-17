package com.yardimciasistan.android;

import android.graphics.Typeface;
import android.text.TextUtils;
import android.view.View;
import android.widget.HorizontalScrollView;
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
      page.addView(emptyCard(
          "Bu cihazın bu alan için yetkisi yok",
          "Yetkiler masaüstü yöneticisi tarafından belirlenir."
      ));
      return UiKit.scroll(activity, page, bottomPaddingDp);
    }

    // V16: section title and the create action share one compact toolbar.
    LinearLayout toolbar = UiKit.row(activity);
    TextView heading = UiKit.title(activity, "Müşteriler");
    toolbar.addView(heading, new LinearLayout.LayoutParams(0, -2, 1f));
    if (canManageCustomers) {
      View createCustomer = UiKit.iconButton(
          activity, "+", "Yeni müşteri", false, view -> listener.onCreateCustomer());
      toolbar.addView(createCustomer,
          new LinearLayout.LayoutParams(UiKit.dp(activity, 48), UiKit.dp(activity, 48)));
    }
    LinearLayout.LayoutParams toolbarParams = new LinearLayout.LayoutParams(-1, -2);
    toolbarParams.setMargins(0, 0, 0, UiKit.dp(activity, 12));
    toolbar.setLayoutParams(toolbarParams);
    page.addView(toolbar);

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
    page.addView(filterBar(options.toArray(new String[0][]), visibleFilter));

    boolean customerList = AndroidUiRules.CUSTOMER_LIST.equals(visibleFilter);
    boolean hasSearchableRows = customerList ? !data.customers.isEmpty() : !data.requests.isEmpty();
    NativeSearchList search = hasSearchableRows
        ? new NativeSearchList(activity, customerList ? "Müşteri ara" : "Talep ara") : null;
    if (search != null) {
      LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(-1, -2);
      searchParams.setMargins(0, 0, 0, UiKit.dp(activity, 12));
      page.addView(search.input(), searchParams);
    }

    if (customerList) {
      if (data.customers.isEmpty()) {
        page.addView(emptyCard(
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
        page.addView(emptyCard(
            waitingOnly ? "Cevap bekleyen müşteri yok" : "Açık talep yok",
            "Yeni talepler geldiğinde bu liste güncellenir."
        ));
      }
    }

    if (search != null) {
      TextView noMatches = UiKit.text(activity, "Aramayla eşleşen kayıt yok.",
          13, UiKit.MUTED, Typeface.NORMAL);
      page.addView(noMatches);
      search.setNoMatchesNotice(noMatches);
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
          view -> listener.onFilterChanged(option[0])
      ));
    }
    scroll.addView(row);
    return scroll;
  }

  private View customerCard(OperationData.CustomerRecord customer) {
    LinearLayout card = UiKit.card(activity);
    card.setOnClickListener(view -> listener.onOpenCustomer(customer));

    LinearLayout top = UiKit.row(activity);
    TextView name = UiKit.text(activity, customer.fullName, 16, UiKit.TEXT, Typeface.BOLD);
    name.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
    top.addView(name);
    OperationData.CustomerRoomStayRecord activeStay = activeStayForCustomer(customer.id);
    if (activeStay != null) {
      top.addView(UiKit.badge(activity, "Konaklıyor", UiKit.INFO));
    }
    card.addView(top);

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

  private View emptyCard(String title, String detail) {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(activity, title, 14, UiKit.TEXT, Typeface.BOLD));
    card.addView(UiKit.text(activity, detail, 12, UiKit.SECONDARY, Typeface.NORMAL));
    return card;
  }
}
