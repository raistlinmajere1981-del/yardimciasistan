package com.yardimciasistan.android;

import android.app.Instrumentation;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import java.lang.reflect.Proxy;
import java.util.Arrays;

/** Runs actual native views in an isolated APK, without MainActivity, storage or transport. */
public final class NativeUiFamilyFixture {
  public static final class Screen extends ComponentActivity {
    int width;
    float font;
    MarketBarcodeFixture barcode;
    @Override protected void onCreate(Bundle state) {
      super.onCreate(state);
      getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      if (android.os.Build.VERSION.SDK_INT >= 29) barcode = new MarketBarcodeFixture(this);
    }
    @Override protected void attachBaseContext(Context base) {
      Configuration config = new Configuration(base.getResources().getConfiguration());
      config.screenWidthDp = width;
      config.fontScale = font;
      super.attachBaseContext(base.createConfigurationContext(config));
    }
  }

  public static final class Runner extends Instrumentation {
    private Screen activity;
    private int checks;
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public Activity newActivity(ClassLoader loader, String name, Intent intent)
        throws InstantiationException, IllegalAccessException, ClassNotFoundException {
      if (!name.equals(Screen.class.getName())) return super.newActivity(loader, name, intent);
      Screen screen = new Screen();
      screen.width = intent.getIntExtra("width", 360);
      screen.font = intent.getFloatExtra("font", 1f);
      return screen;
    }
    @Override public void onStart() {
      Bundle result = new Bundle();
      try {
        require(getTargetContext().getPackageName().equals("com.yardimciasistan.android.uifamily"), "isolated package required");
        for (int width : new int[] {360, 393, 840}) for (float font : new float[] {1f, 1.5f}) {
          activity = (Screen) startActivitySync(new Intent(getTargetContext(), Screen.class)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("width", width).putExtra("font", font));
          waitForIdleSync();
          if (width == 360 && font == 1f) ui(() -> LintBehaviorFixture.exercise(activity));
          Throwable[] failure = {null};
          runOnMainSync(() -> {
            try {
              for (AppTheme.Mode mode : AppTheme.Mode.values()) {
                UiKit.applyTheme(AppTheme.tokens(mode));
                exercise(width);
              }
            } catch (Throwable error) { failure[0] = error; }
          });
          if (failure[0] != null) throw failure[0];
          if (android.os.Build.VERSION.SDK_INT >= 29) {
            activity.barcode.exercise(this);
            for (AppTheme.Mode mode : AppTheme.Mode.values()) {
              MarketFlowFixture[] market = {null};
              ui(() -> { UiKit.applyTheme(AppTheme.tokens(mode)); market[0] = new MarketFlowFixture(activity); });
              market[0].exercise(this, view -> measure(view, width));
            }
          }
          runOnMainSync(() -> activity.finish());
          activity = null;
        }
        result.putString("stream", "native-ui-family-ok: " + checks + " native layout/interaction checks; 360/393/840dp, 100/150% font, day/night; Market flows on API29+; lint resource/icon/camera intent/disk persistence/swipe contracts passed\n");
        finish(-1, result);
      } catch (Throwable error) {
        if (activity != null) runOnMainSync(() -> activity.finish());
        result.putString("stream", "native-ui-family-failed: " + error + "\n" + android.util.Log.getStackTraceString(error));
        finish(0, result);
      }
    }

    void ui(Runnable action) {
      Throwable[] failure = {null};
      runOnMainSync(() -> { try { action.run(); } catch (Throwable error) { failure[0] = error; } });
      waitForIdleSync();
      if (failure[0] != null) throw new AssertionError("Native interaction failed", failure[0]);
    }

    private void exercise(int width) {
      LinearLayout page = UiKit.column(activity);
      int[] changes = {0};
      Button create = UiKit.iconButton(activity, "+", "Yeni kayıt", false, v -> changes[0]++);
      page.addView(UiKit.workspaceHeader(activity, "Çalışma alanı başlığı", "Yetkili kayıtlar", create));
      create.setEnabled(false);
      require(!create.isEnabled(), "header action keeps caller's disabled state");
      create.setEnabled(true); create.performClick();
      require(changes[0] == 1, "header delegates action");
      String[][] choices = {{"first", "İlk filtre"}, {"second", "İkinci filtre"}, {"last", "Son seçili filtre"}};
      String[] selected = {"last"};
      HorizontalScrollView filters = UiKit.filterBar(activity, choices, "last", value -> selected[0] = value);
      page.addView(filters);
      NativeSearchList list = NativeSearchList.attachTo(page, "Kayıt ara");
      View first = UiKit.emptyCard(activity, "Işıl", "İzmir");
      View second = UiKit.emptyCard(activity, "Oda 104", "Dolu");
      page.addView(first); page.addView(second);
      list.add(first, "Işıl İzmir"); list.add(second, "Oda 104");
      list.showNoMatchesIn(page, "Eşleşen kayıt yok");
      EditText search = (EditText) described(page, "Kayıt ara");
      search.setText("ışıl"); require(first.getVisibility() == View.VISIBLE && second.getVisibility() == View.GONE, "Turkish local filter");
      search.setText("bulunmayan"); require(text(page, "Eşleşen kayıt yok").getVisibility() == View.VISIBLE, "no matches feedback");
      described(page, "Aramayı temizle").performClick();
      require(search.getText().length() == 0 && search.hasFocus(), "clear restores input focus");
      require(first.getVisibility() == View.VISIBLE && second.getVisibility() == View.VISIBLE, "clear restores authorized rows");
      require(text(page, "Eşleşen kayıt yok").getVisibility() == View.GONE, "empty query hides no matches notice");
      EditText field = UiKit.labeledInput(activity, page, "Açıklama", "Bir değer");
      require(text(page, "Açıklama").getLabelFor() == field.getId(), "field label association");
      measure(page, width);
      require(((ViewGroup) filters.getChildAt(0)).getChildAt(2).isSelected(), "selected chip semantics");
      require(filters.getScrollX() > 0 || filters.getChildAt(0).getWidth() <= filters.getWidth(), "selected chip scrolls into view");
      ((ViewGroup) filters.getChildAt(0)).getChildAt(0).performClick();
      require(selected[0].equals("first"), "filter delegates selection");

      OperationData data = data();
      measure(new PensionWorkspace(activity, data, listener(PensionWorkspace.Listener.class), 24).render(AndroidUiRules.PENSION_ROOMS), width);
      measure(new RestaurantWorkspace(activity, data, listener(RestaurantWorkspace.Listener.class), 24).render(AndroidUiRules.RESTAURANT_TABLES), width);
      measure(new CustomerWorkspace(activity, data, listener(CustomerWorkspace.Listener.class), 24).render(AndroidUiRules.CUSTOMER_LIST), width);
      measure(FinanceWorkspace.create(activity, data, payload -> { throw new AssertionError("unexpected mutation"); }), width);
      measure(PensionRoomCard.create(activity, data, data.rooms.get(0), listener(PensionRoomCard.Listener.class)), width);
      measure(RestaurantTableCard.create(activity, data, data.tables.get(0), listener(RestaurantTableCard.Listener.class)), width);
      OperationData.CustomerRoomStayRecord stay = new OperationData.CustomerRoomStayRecord();
      stay.id = "stay"; stay.customerName = "Uzun isimli konuk"; stay.roomName = "Balkonlu oda"; stay.status = "checked_in";
      measure(PensionStayCard.create(activity, data, stay, listener(PensionStayCard.Listener.class)), width);
      data.permissions.clear(); data.deviceRole = "staff";
      View denied = PensionRoomCard.create(activity, data, data.rooms.get(0), listener(PensionRoomCard.Listener.class));
      require(buttonCount(denied) == 0, "room mutation visibility remains permission-owned");
      measure(denied, width);
    }

    private OperationData data() {
      OperationData data = new OperationData();
      data.deviceActive = true; data.permissionsResolved = true; data.capabilitiesResolved = true; data.deviceRole = "admin";
      data.businessCapabilities.addAll(Arrays.asList("service.android", "core.customers", "core.finance", "accommodation.rooms", "accommodation.stays", "food_service.tables"));
      data.permissions.addAll(Arrays.asList("customer.view", "customer.manage", "room.view", "room.assign_customer", "room.update_status", "table.view", "table.update_status", "finance.view", "finance.create"));
      OperationData.RoomRecord room = new OperationData.RoomRecord(); room.id = "room"; room.name = "Balkonlu oda"; room.status = "available"; data.rooms.add(room);
      OperationData.TableRecord table = new OperationData.TableRecord(); table.id = "table"; table.name = "Bahçe masası"; table.status = "available"; data.tables.add(table);
      OperationData.CustomerRecord customer = new OperationData.CustomerRecord(); customer.id = "guest"; customer.fullName = "Işıl İzmir"; data.customers.add(customer);
      return data;
    }

    private <T> T listener(Class<T> type) {
      return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, (proxy, method, args) -> {
        if (method.getReturnType() == View.class) return UiKit.emptyCard(activity, "Yetkili kayıt", "Özet");
        if (method.getReturnType() == boolean.class) return false;
        return null;
      }));
    }
    private void measure(View view, int widthDp) {
      int width = UiKit.dp(activity, widthDp);
      view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
      view.layout(0, 0, width, view.getMeasuredHeight());
      bounds(view);
      checks++;
    }
    private void bounds(View view) {
      if (view.getVisibility() == View.GONE) return;
      if (view instanceof Button) {
        require(view.getWidth() >= UiKit.dp(activity, 44) && view.getHeight() >= UiKit.dp(activity, 44), "44dp target: " + ((Button) view).getText());
        TextView text = (TextView) view;
        require(text.getLayout() == null || text.getLayout().getHeight() <= text.getHeight() - text.getCompoundPaddingTop() - text.getCompoundPaddingBottom() + 1,
            "button text clips: " + text.getText());
      }
      if (view instanceof ViewGroup) {
        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
          View child = group.getChildAt(i);
          if (!(view instanceof HorizontalScrollView) && child.getVisibility() != View.GONE) require(child.getRight() <= view.getWidth() + 1, "horizontal overflow: " + child.getClass().getSimpleName());
          bounds(child);
        }
      }
    }
    private View described(View root, String label) { return find(root, label, false); }
    private TextView text(View root, String label) { return (TextView) find(root, label, true); }
    private View find(View root, String label, boolean byText) {
      if (byText ? root instanceof TextView && label.contentEquals(((TextView) root).getText()) : label.contentEquals(root.getContentDescription() == null ? "" : root.getContentDescription())) return root;
      if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) {
        View found = find(((ViewGroup) root).getChildAt(i), label, byText); if (found != null) return found;
      }
      return null;
    }
    private int buttonCount(View root) {
      int count = root instanceof Button ? 1 : 0;
      if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) count += buttonCount(((ViewGroup) root).getChildAt(i));
      return count;
    }
    private void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  }
}
