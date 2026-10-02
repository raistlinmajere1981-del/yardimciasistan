package com.yardimciasistan.android;

import android.os.Handler;
import android.os.Looper;

final class AndroidForegroundSyncController {
  interface Listener {
    boolean isBusy();
    boolean hasPendingBootstrap();
    boolean hasConnectionSettings();
    void onBootstrapDue();
    void onSyncDue();
  }

  private static final long FOREGROUND_SYNC_INTERVAL_MS = 15_000L;
  private static final long LOCAL_DISCOVERY_RETRY_INTERVAL_MS = 45_000L;

  private final Handler handler = new Handler(Looper.getMainLooper());
  private final LocalCompanionDiscovery localDiscovery;
  private final Listener listener;
  private boolean foregroundActive;
  private long lastLocalDiscoveryStartedAt;

  private final Runnable syncRunnable = new Runnable() {
    @Override
    public void run() {
      if (!foregroundActive) {
        return;
      }

      if (!listener.isBusy()) {
        if (listener.hasPendingBootstrap()) {
          listener.onBootstrapDue();
        } else if (listener.hasConnectionSettings()) {
          listener.onSyncDue();
        }
      }

      handler.postDelayed(this, FOREGROUND_SYNC_INTERVAL_MS);
    }
  };

  AndroidForegroundSyncController(
      LocalCompanionDiscovery localDiscovery,
      Listener listener
  ) {
    this.localDiscovery = localDiscovery;
    this.listener = listener;
  }

  void resume() {
    foregroundActive = true;
    handler.removeCallbacks(syncRunnable);
    handler.postDelayed(syncRunnable, FOREGROUND_SYNC_INTERVAL_MS);
    requestLocalDiscovery(true);
  }

  void pause() {
    foregroundActive = false;
    handler.removeCallbacks(syncRunnable);
    if (localDiscovery != null) {
      localDiscovery.stop();
    }
  }

  void destroy() {
    foregroundActive = false;
    handler.removeCallbacks(syncRunnable);
    if (localDiscovery != null) {
      localDiscovery.stop();
    }
  }

  void requestLocalDiscovery(boolean force) {
    if (!foregroundActive || localDiscovery == null) {
      return;
    }

    long now = System.currentTimeMillis();
    if (!force && now - lastLocalDiscoveryStartedAt < LOCAL_DISCOVERY_RETRY_INTERVAL_MS) {
      return;
    }

    lastLocalDiscoveryStartedAt = now;
    localDiscovery.start();
  }
}
