package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONObject;

final class CompanionOperationsRouter implements AndroidOperationsTransport {
  private final SharedPreferences preferences;
  private final HostingAndroidOperationsTransport hostingTransport;

  CompanionOperationsRouter(SharedPreferences preferences) {
    this(preferences, new HostingAndroidOperationsTransport());
  }

  CompanionOperationsRouter(
      SharedPreferences preferences,
      HostingAndroidOperationsTransport hostingTransport
  ) {
    this.preferences = preferences;
    this.hostingTransport = hostingTransport;
  }

  @Override
  public String preferredSourceKey(String baseUrl, String credential) {
    String targetKey = CompanionConnectionIdentity.actionTargetKey(baseUrl);
    if (ConnectionSettings.hasHostingActionBarrier(preferences, targetKey)) {
      return hostingTransport.preferredSourceKey(baseUrl, credential);
    }
    ConnectionSettings.LocalConnection local =
        ConnectionSettings.localConnectionForTarget(preferences, targetKey);
    return local.isComplete()
        ? CompanionConnectionIdentity.localSourceKey(local.desktopId)
        : hostingTransport.preferredSourceKey(baseUrl, credential);
  }

  @Override
  public FetchResult fetchOperations(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      long knownServerRevision
  ) throws TransportException {
    String targetKey = CompanionConnectionIdentity.actionTargetKey(baseUrl);
    if (ConnectionSettings.hasHostingActionBarrier(preferences, targetKey)) {
      FetchResult hostingResult = hostingTransport.fetchOperations(
          baseUrl,
          credential,
          identity,
          knownServerRevision
      );
      clearBarrierWhenHostingDrained(targetKey, hostingResult);
      return hostingResult;
    }

    ConnectionSettings.LocalConnection local =
        ConnectionSettings.localConnectionForTarget(preferences, targetKey);
    if (local.isComplete()) {
      LocalDesktopOperationsTransport localTransport =
          new LocalDesktopOperationsTransport(local.desktopId);
      try {
        return localTransport.fetchOperations(
            local.baseUrl,
            local.localToken,
            identity,
            knownServerRevision
        );
      } catch (TransportException error) {
        if (!error.allowsHostingFallback()) {
          throw error;
        }
        handleLocalFailure(error);
        // The caller's revision belongs to the local namespace. Never pass it
        // into hosting after failover because equal integers are unrelated.
        FetchResult hostingResult = hostingTransport.fetchOperations(baseUrl, credential, identity, 0L);
        clearBarrierWhenHostingDrained(targetKey, hostingResult);
        return hostingResult;
      }
    }

    return hostingTransport.fetchOperations(
        baseUrl,
        credential,
        identity,
        knownServerRevision
    );
  }

  @Override
  public OperationData.ActionRecord enqueueAction(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      String actionId,
      String actionType,
      JSONObject actionPayload
  ) throws TransportException {
    String targetKey = CompanionConnectionIdentity.actionTargetKey(baseUrl);
    if (ConnectionSettings.hasHostingActionBarrier(preferences, targetKey)) {
      OperationData.ActionRecord accepted = hostingTransport.enqueueAction(
          baseUrl,
          credential,
          identity,
          actionId,
          actionType,
          actionPayload
      );
      ConnectionSettings.markHostingActionBarrier(preferences, targetKey);
      return accepted;
    }

    ConnectionSettings.LocalConnection local =
        ConnectionSettings.localConnectionForTarget(preferences, targetKey);
    if (local.isComplete()) {
      LocalDesktopOperationsTransport localTransport =
          new LocalDesktopOperationsTransport(local.desktopId);
      try {
        return localTransport.enqueueAction(
            local.baseUrl,
            local.localToken,
            identity,
            actionId,
            actionType,
            actionPayload
        );
      } catch (TransportException error) {
        if (!error.allowsHostingFallback()) {
          throw error;
        }
        handleLocalFailure(error);
      }
    }

    OperationData.ActionRecord accepted = hostingTransport.enqueueAction(
        baseUrl,
        credential,
        identity,
        actionId,
        actionType,
        actionPayload
    );
    ConnectionSettings.markHostingActionBarrier(preferences, targetKey);
    return accepted;
  }

  private void clearBarrierWhenHostingDrained(String targetKey, FetchResult result) {
    int pending = result.data != null
        ? result.data.pendingActions
        : Math.max(0, result.payload.optInt("pending_action_count", -1));
    if (pending == 0) {
      ConnectionSettings.clearHostingActionBarrier(preferences, targetKey);
    }
  }

  private void handleLocalFailure(TransportException error) {
    if ("local_auth_required".equals(error.code)
        || "local_auth_failed".equals(error.code)) {
      ConnectionSettings.clearLocalCredential(preferences);
    }
    // Temporary reachability failures must not erase the paired desktop
    // endpoint. Foreground discovery can refresh a changed address while the
    // router keeps trying the cached endpoint before hosting fallback.
  }
}
