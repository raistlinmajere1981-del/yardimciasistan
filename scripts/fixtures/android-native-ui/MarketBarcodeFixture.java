package com.yardimciasistan.android;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.inspector.WindowInspector;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultRegistry;
import androidx.activity.result.contract.ActivityResultContract;
import androidx.core.app.ActivityOptionsCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

/** Controlled permission results exercise the actual controller, without launching external camera apps. */
final class MarketBarcodeFixture implements MarketBarcodeFlow.Listener {
  private final ComponentActivity activity;
  private final MarketBarcodeFlow flow;
  private final PermissionResults permissions = new PermissionResults();
  private int captures;
  private String barcode = "";
  private String purpose = "";
  private boolean dialogClosedBeforeCallback;
  private View page;
  private final class PermissionResults extends ActivityResultRegistry {
    int launches;
    int code;
    @Override public <I, O> void onLaunch(int requestCode, ActivityResultContract<I, O> contract, I input, ActivityOptionsCompat options) {
      require(input.equals(Manifest.permission.CAMERA), "camera permission input");
      launches++; code = requestCode;
    }
    void deny() { dispatchResult(code, Boolean.FALSE); }
  }
  MarketBarcodeFixture(ComponentActivity activity) {
    this.activity = activity;
    flow = new MarketBarcodeFlow(activity, new MarketFormUi(activity, () -> {}), this, () -> {}, permissions);
  }
  void exercise(NativeUiFamilyFixture.Runner runner) {
    runner.ui(() -> { require(ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED, "fixture starts without camera permission"); });
    runner.ui(() -> { flow.requestCameraScanner(MarketWorkspace.PURPOSE_STOCK, false); });
    runner.ui(() -> { flow.requestCameraScanner(MarketWorkspace.PURPOSE_CART, true); });
    runner.ui(() -> { require(permissions.launches == 1, "only one permission request can be in flight"); });
    runner.ui(() -> { permissions.deny(); });
    runner.ui(() -> { enter("869 000-001"); });
    runner.ui(() -> { require(barcode.equals("869000001") && purpose.equals(MarketWorkspace.PURPOSE_STOCK), "permission denial retains original scanner purpose and manual normalization"); });
    runner.ui(() -> { require(dialogClosedBeforeCallback, "manual dialog dismisses before routing callback"); });
    runner.ui(() -> { flow.requestCameraScanner(MarketWorkspace.PURPOSE_RECEIVING, false); });
    runner.ui(() -> { require(permissions.launches == 2, "permission result clears in-flight state"); });
    runner.ui(() -> { permissions.deny(); });
    runner.ui(() -> { enter("SKU-ABC"); });
    runner.ui(() -> { require(barcode.equals("SKU-ABC") && purpose.equals(MarketWorkspace.PURPOSE_RECEIVING), "manual fallback preserves alphanumeric identity"); });
    runner.ui(() -> { page = flow.cashBarcodeScreen(); });
    runner.ui(() -> { flow.captureCashBarcode("869000001"); });
    runner.ui(() -> { require(captures == 1 && contains(page, "Gönderiliyor"), "cash scan automatically dispatches and updates visible feedback"); });
    runner.ui(() -> { flow.onScanFeedback("different", "stale"); });
    runner.ui(() -> { require(!contains(page, "stale"), "stale cash acknowledgement ignored"); });
    runner.ui(() -> { flow.onScanFeedback("869000001", "Kuyrukta"); });
    runner.ui(() -> { require(contains(page, "Kuyrukta"), "matching cash acknowledgement updates current view"); });
    runner.ui(() -> { flow.captureCashBarcode("869000001"); });
    runner.ui(() -> { require(captures == 1, "cash scan duplicate suppressed"); });
    runner.ui(() -> { flow.captureCashBarcode("869000002"); });
    runner.ui(() -> { require(captures == 2, "different barcode creates separate cash event"); });
  }
  private void enter(String value) {
    require(Build.VERSION.SDK_INT >= 29, "dialog inspection API");
    for (View root : WindowInspector.getGlobalWindowViews()) {
      EditText input = input(root);
      Button positive = root.findViewById(android.R.id.button1);
      if (input != null && positive != null) { input.setText(value); positive.performClick(); return; }
    }
    throw new AssertionError("manual barcode dialog not found");
  }
  private EditText input(View root) {
    if (root instanceof EditText) return (EditText) root;
    if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) { EditText found = input(((ViewGroup) root).getChildAt(i)); if (found != null) return found; }
    return null;
  }
  private boolean contains(View root, String text) {
    if (root instanceof TextView && text.contentEquals(((TextView) root).getText())) return true;
    if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) if (contains(((ViewGroup) root).getChildAt(i), text)) return true;
    return false;
  }
  @Override public void onBarcode(String value, String reason) {
    barcode = value; purpose = reason;
    dialogClosedBeforeCallback = true;
    for (View root : WindowInspector.getGlobalWindowViews()) {
      Button positive = root.findViewById(android.R.id.button1);
      if (positive != null) dialogClosedBeforeCallback = false;
    }
  }
  @Override public boolean onCashBarcode(String value, JSONObject payload) {
    require(value.equals(payload.optString("barcode")) && payload.has("scanned_at"), "canonical cash scan payload"); captures++; return true;
  }
  private void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
}
