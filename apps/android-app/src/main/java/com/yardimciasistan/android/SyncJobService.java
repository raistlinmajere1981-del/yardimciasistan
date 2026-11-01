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
      } catch (Exception error) {
        recordSyncFailure(error);
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
    SharedPreferences preferences = getSharedPreferences(ConnectionSettings.PREFS_NAME, MODE_PRIVATE);
    ConnectionSettings.ensureDefaults(preferences);
    String baseUrl = ConnectionSettings.webModuleUrl(preferences);
    String syncSecret = ConnectionSettings.syncSecret(preferences);
    DeviceIdentity identity = DeviceIdentity.loadOrCreate(this, preferences);
    baseUrl = baseUrl == null ? "" : baseUrl.trim();
    syncSecret = syncSecret == null ? "" : syncSecret.trim();
    if (!ConnectionSettings.isComplete(preferences) || identity.deviceId.isEmpty()) {
      return;
    }
    String actionTargetKey = CompanionConnectionIdentity.actionTargetKey(preferences, baseUrl);
    AndroidOperationsTransport client = new CompanionOperationsRouter(preferences);
    String preferredSourceKey = client.preferredSourceKey(baseUrl, syncSecret);
    if (actionTargetKey.isEmpty() || preferredSourceKey.isEmpty()) {
      return;
    }
    OperationCache cache = new OperationCache(preferences, identity.deviceId);
    OperationData previousData = cache.load();
    LocalNotificationCenter notifications = new LocalNotificationCenter(this, preferences);
    ActionOutbox outbox = new ActionOutbox(preferences);
    List<ActionOutbox.PendingAction> pendingActions = outbox.load();
    for (ActionOutbox.PendingAction pending : pendingActions) {
      if (!pending.matchesTarget(actionTargetKey)) {
        throw new Exception("Önceki bağlantıya ait bekleyen işlemler korunuyor.");
      }
    }
    for (ActionOutbox.PendingAction pending : pendingActions) {
      try {
        OperationData.ActionRecord accepted = client.enqueueAction(baseUrl, syncSecret, identity, pending.id, pending.type, pending.payload);
        cache.recordActionResult(accepted, actionTargetKey);
        outbox.remove(pending.id);
      } catch (AndroidOperationsTransport.TransportException error) {
        if (!error.invalidatesPendingAction()) {
          throw error;
        }
        cache.recordActionResult(AndroidActionDispatcher.failedRecord(pending, error.getMessage()), actionTargetKey);
        outbox.remove(pending.id);
        if (error.disablesAndroidService()) {
          clearDisabledAndroidState(cache, outbox, notifications, previousData);
          return;
        }
      }
    }

    AndroidOperationsTransport.FetchResult fetched;
    try {
      fetched = client.fetchOperations(
          baseUrl,
          syncSecret,
          identity,
          cache.revision(preferredSourceKey)
      );
    } catch (AndroidOperationsTransport.TransportException error) {
      if (error.disablesAndroidService()) {
        clearDisabledAndroidState(cache, outbox, notifications, previousData);
        return;
      }
      throw error;
    }
    if (!fetched.notModified && fetched.data != null) {
      String fetchedSourceKey = fetched.sourceKey.isEmpty()
          ? preferredSourceKey
          : fetched.sourceKey;
      cache.save(fetched.payload, fetchedSourceKey, fetched.serverRevision);
      OperationData currentData = cache.load();
      notifications.processSnapshot(previousData, currentData == null ? fetched.data : currentData);
    }
    notifications.recordSyncSuccess();
  }

  private static void clearDisabledAndroidState(
      OperationCache cache,
      ActionOutbox outbox,
      LocalNotificationCenter notifications,
      OperationData previousData
  ) throws OperationCache.CacheException, ActionOutbox.OutboxException {
    cache.clear();
    outbox.clear();
    notifications.processSnapshot(previousData, OperationData.androidCapabilityDisabled());
    notifications.recordSyncSuccess();
  }

  private void recordSyncFailure(Exception error) {
    try {
      SharedPreferences preferences = getSharedPreferences(ConnectionSettings.PREFS_NAME, MODE_PRIVATE);
      DeviceIdentity identity = DeviceIdentity.loadOrCreate(this, preferences);
      OperationData cachedData = new OperationCache(preferences, identity.deviceId).load();
      new LocalNotificationCenter(this, preferences).recordSyncFailure(
          cachedData,
          error == null ? "" : error.getMessage()
      );
    } catch (Exception ignored) {
      // Background retry remains authoritative even if notification state cannot be loaded.
    }
  }
}
