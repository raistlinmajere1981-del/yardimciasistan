package com.yardimciasistan.android;

import java.util.function.BooleanSupplier;
import org.json.JSONObject;

/** Ephemeral preview and live scope check, not a reservation or sale authority. */
final class SalePreviewApproval {
  private final String previewJson;
  private final BooleanSupplier current;

  SalePreviewApproval(JSONObject preview, BooleanSupplier current) {
    if (preview == null || current == null) throw new IllegalArgumentException();
    this.previewJson = preview.toString();
    this.current = current;
  }

  JSONObject preview() {
    try { return new JSONObject(previewJson); }
    catch (Exception error) { throw new IllegalStateException(error); }
  }

  boolean isCurrent() { return current.getAsBoolean(); }
}
