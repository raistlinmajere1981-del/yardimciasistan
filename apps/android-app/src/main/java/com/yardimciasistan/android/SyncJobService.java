package com.yardimciasistan.android;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class SyncJobService extends JobService {
  private static final int JOB_ID = 0x594153;
  private static final long PERIOD_MS = 15L * 60L * 1000L;
  private static final String PREFS_NAME = "yardimci_asistan_android";
  private static final String KEY_WEB_MODULE_URL = "web_module_url";
  private static final String KEY_SYNC_SECRET = "sync_secret";
  private static final String KEY_DEVICE_ID = "device_id";

  private ExecutorService executor;

  static void schedule(Context context) {
    JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
    if (scheduler == null) {
      return;
    }
    JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, SyncJobService.class))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        .setPeriodic(PERIOD_MS)
        .setPersisted(true)
        .build();
    scheduler.schedule(job);
  }

  @Override
  public boolean onStartJob(JobParameters params) {
    executor = Executors.newSingleThreadExecutor();
    executor.execute(() -> {
      boolean retry = false;
      try {
        syncOnce();
      } catch (Exception ignored) {
        retry = true;
      }
      final boolean shouldRetry = retry;
      jobFinished(params, shouldRetry);
    });
    return true;
  }

  @Override
  public boolean onStopJob(JobParameters params) {
    if (executor != null) {
      executor.shutdownNow();
    }
    return true;
  }

  @Override
  public void onDestroy() {
    if (executor != null) {
      executor.shutdownNow();
    }
    super.onDestroy();
  }

  private void syncOnce() throws Exception {
    SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    String baseUrl = preferences.getString(KEY_WEB_MODULE_URL, "");
    String syncSecret = preferences.getString(KEY_SYNC_SECRET, "");
    String deviceId = preferences.getString(KEY_DEVICE_ID, "");
    baseUrl = baseUrl == null ? "" : baseUrl.trim();
    syncSecret = syncSecret == null ? "" : syncSecret.trim();
    deviceId = deviceId == null ? "" : deviceId.trim();
    if (baseUrl.isEmpty() || syncSecret.isEmpty() || deviceId.isEmpty()) {
      return;
    }

    HostingSyncClient client = new HostingSyncClient();
    ActionOutbox outbox = new ActionOutbox(preferences);
    List<ActionOutbox.PendingAction> pendingActions = outbox.load();
    for (ActionOutbox.PendingAction pending : pendingActions) {
      if (!pending.matchesTarget(baseUrl, syncSecret)) {
        continue;
      }
      client.enqueueAction(baseUrl, syncSecret, deviceId, pending.id, pending.type, pending.payload);
      outbox.remove(pending.id);
    }

    OperationCache cache = new OperationCache(preferences);
    HostingSyncClient.FetchResult fetched = client.fetchOperations(baseUrl, syncSecret, deviceId, cache.revision());
    if (!fetched.notModified && fetched.data != null) {
      cache.save(fetched.payload);
    }
  }
}
