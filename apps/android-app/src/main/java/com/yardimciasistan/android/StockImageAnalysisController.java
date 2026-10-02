package com.yardimciasistan.android;

import android.net.Uri;

import androidx.activity.ComponentActivity;

import org.json.JSONArray;

import java.util.concurrent.ExecutorService;

final class StockImageAnalysisController {
  interface PrepareListener {
    void onReady(StockImageFile.PreparedImage image);
    void onError(String message);
  }

  interface AnalysisListener {
    void onSuccess(HostingSyncClient.StockImageAnalysisResult result);
    void onError(String message);
  }

  private final ComponentActivity activity;
  private final ExecutorService executor;
  private final HostingSyncClient syncClient;

  StockImageAnalysisController(
      ComponentActivity activity,
      ExecutorService executor,
      HostingSyncClient syncClient
  ) {
    this.activity = activity;
    this.executor = executor;
    this.syncClient = syncClient;
  }

  void prepare(Uri sourceUri, PrepareListener listener) {
    executor.execute(() -> {
      try {
        StockImageFile.PreparedImage ready = StockImageFile.prepare(activity, sourceUri);
        activity.runOnUiThread(() -> listener.onReady(ready));
      } catch (StockImageFile.StockImageException error) {
        activity.runOnUiThread(() -> listener.onError(error.getMessage()));
      }
    });
  }

  void analyze(
      StockImageFile.PreparedImage baseImage,
      int rotationDegrees,
      String baseUrl,
      String syncSecret,
      DeviceIdentity identity,
      String importId,
      JSONArray candidates,
      AnalysisListener listener
  ) {
    executor.execute(() -> {
      StockImageFile.PreparedImage upload = null;
      try {
        upload = StockImageFile.rotatedCopy(activity, baseImage, rotationDegrees);
        HostingSyncClient.StockImageAnalysisResult result = syncClient.analyzeStockImage(
            baseUrl,
            syncSecret,
            identity,
            importId,
            upload,
            candidates
        );
        activity.runOnUiThread(() -> listener.onSuccess(result));
      } catch (HostingSyncClient.SyncException | StockImageFile.StockImageException error) {
        activity.runOnUiThread(() -> listener.onError(error.getMessage()));
      } finally {
        if (upload != null && upload != baseImage) {
          upload.release();
        }
      }
    });
  }
}
