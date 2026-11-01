package com.yardimciasistan.android;

import android.content.Intent;
import android.content.SharedPreferences;

import androidx.activity.ComponentActivity;

import java.util.concurrent.ExecutorService;

final class AndroidProvisioningController {
  interface Listener {
    void onCaptureError(String message);
    void onBootstrapStarted();
    void onBootstrapSucceeded();
    void onBootstrapFailed(String message);
  }

  private static final String EXTRA_PROVISION_URL = "ya_provision_url";
  private static final String EXTRA_PROVISION_TICKET = "ya_provision_ticket";

  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final ExecutorService executor;
  private final HostingSyncClient syncClient;
  private final Listener listener;

  AndroidProvisioningController(
      ComponentActivity activity,
      SharedPreferences preferences,
      ExecutorService executor,
      HostingSyncClient syncClient,
      Listener listener
  ) {
    this.activity = activity;
    this.preferences = preferences;
    this.executor = executor;
    this.syncClient = syncClient;
    this.listener = listener;
  }

  void captureIntent(Intent intent) {
    if (intent == null) {
      return;
    }

    String baseUrl = intent.getStringExtra(EXTRA_PROVISION_URL);
    String ticket = intent.getStringExtra(EXTRA_PROVISION_TICKET);
    if (baseUrl == null || ticket == null) {
      return;
    }

    try {
      if (ConnectionSettings.localConnection(preferences).isPaired()
          || ConnectionSettings.hasAnyHostingActionBarrier(preferences)
          || !new ActionOutbox(preferences).load().isEmpty()) {
        listener.onCaptureError("Mevcut bağlantı ve bekleyen işlemler korunuyor. Hedef değişikliği için yöneticiye başvurun.");
        return;
      }
    } catch (ActionOutbox.OutboxException error) {
      listener.onCaptureError(error.getMessage());
      return;
    }
    if (!ConnectionSettings.storeBootstrapProvisioning(preferences, baseUrl, ticket)) {
      listener.onCaptureError("Masaüstünden gelen Android kurulum bilgisi geçersiz.");
      return;
    }

    intent.removeExtra(EXTRA_PROVISION_URL);
    intent.removeExtra(EXTRA_PROVISION_TICKET);
  }

  boolean bootstrap(DeviceIdentity identity) {
    if (identity == null) {
      return false;
    }

    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String ticket = ConnectionSettings.bootstrapTicket(preferences);
    if (baseUrl.isEmpty() || ticket.isEmpty()) {
      return false;
    }

    listener.onBootstrapStarted();
    executor.execute(() -> {
      try {
        String token = syncClient.claimBootstrapDeviceToken(baseUrl, ticket, identity);
        if (!ConnectionSettings.storeDeviceToken(preferences, token)) {
          throw new HostingSyncClient.SyncException("Telefonun kişisel bağlantı anahtarı kaydedilemedi.");
        }
        ConnectionSettings.clearBootstrapTicket(preferences);
        activity.runOnUiThread(listener::onBootstrapSucceeded);
      } catch (HostingSyncClient.SyncException error) {
        activity.runOnUiThread(() -> listener.onBootstrapFailed(error.getMessage()));
      }
    });
    return true;
  }
}
