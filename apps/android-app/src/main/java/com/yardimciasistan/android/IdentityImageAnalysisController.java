package com.yardimciasistan.android;

import android.net.Uri;

import androidx.activity.ComponentActivity;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;

final class IdentityImageAnalysisController {
  interface Listener {
    void onSuccess(JSONObject analysis, String message);
    void onError(String message);
    void onFinished();
  }

  private final ComponentActivity activity;
  private final ExecutorService executor;
  private final HostingSyncClient syncClient;

  IdentityImageAnalysisController(
      ComponentActivity activity,
      ExecutorService executor,
      HostingSyncClient syncClient
  ) {
    this.activity = activity;
    this.executor = executor;
    this.syncClient = syncClient;
  }

  void analyze(
      Uri sourceUri,
      String baseUrl,
      String syncSecret,
      DeviceIdentity identity,
      Listener listener
  ) {
    executor.execute(() -> {
      StockImageFile.PreparedImage prepared = null;
      try {
        prepared = StockImageFile.prepare(activity, sourceUri);
        HostingSyncClient.IdentityImageAnalysisResult result = syncClient.analyzeIdentityImage(
            baseUrl,
            syncSecret,
            identity,
            prepared
        );
        activity.runOnUiThread(() -> listener.onSuccess(result.analysis, result.message));
      } catch (HostingSyncClient.SyncException | StockImageFile.StockImageException error) {
        activity.runOnUiThread(() -> listener.onError(error.getMessage()));
      } finally {
        if (prepared != null) {
          prepared.release();
        }
        activity.runOnUiThread(listener::onFinished);
      }
    });
  }
}
