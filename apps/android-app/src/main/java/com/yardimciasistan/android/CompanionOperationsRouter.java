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
        return hostingTransport.fetchOperations(baseUrl, credential, identity, 0L);
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

    return hostingTransport.enqueueAction(
        baseUrl,
        credential,
        identity,
        actionId,
        actionType,
        actionPayload
    );
  }

  private void handleLocalFailure(TransportException error) {
    if ("local_auth_required".equals(error.code)
        || "local_auth_failed".equals(error.code)) {
      ConnectionSettings.clearLocalCredential(preferences);
      return;
    }
    if ("local_unreachable".equals(error.code) || error.code.isEmpty()) {
      ConnectionSettings.clearLocalEndpoint(preferences);
    }
  }
}
