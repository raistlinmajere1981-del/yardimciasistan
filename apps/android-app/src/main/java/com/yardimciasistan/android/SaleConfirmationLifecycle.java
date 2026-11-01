package com.yardimciasistan.android;

/** UI-thread ownership of sale screen generations and single-use confirmations. */
final class SaleConfirmationLifecycle {
  private long generation;
  private long active = -1;
  private boolean submitting;

  long generation() { return generation; }
  boolean isShowing(long id) { return active == id && generation == id; }
  long open() { invalidate(); active = generation; return active; }
  void invalidate() { generation++; active = -1; }
  void dismiss(long id) { if (active == id) invalidate(); }
  boolean submit(long id, Runnable action) {
    if (submitting || !isShowing(id)) return false;
    active = -1;
    submitting = true;
    try { action.run(); return true; }
    finally { submitting = false; invalidate(); }
  }
}
