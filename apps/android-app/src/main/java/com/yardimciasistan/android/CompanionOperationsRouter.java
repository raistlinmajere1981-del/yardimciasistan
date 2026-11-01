package com.yardimciasistan.android;

import android.content.SharedPreferences;

import org.json.JSONObject;

final class CompanionOperationsRouter implements AndroidOperationsTransport {
  private final SharedPreferences preferences;
  interface LocalTransportFactory { AndroidOperationsTransport create(String desktopId); }
  private final AndroidOperationsTransport hostingTransport;
  private final LocalTransportFactory localTransports;

  CompanionOperationsRouter(SharedPreferences preferences) {
    this(preferences, new HostingAndroidOperationsTransport());
  }

  CompanionOperationsRouter(
      SharedPreferences preferences,
      AndroidOperationsTransport hostingTransport
  ) {
    this(preferences, hostingTransport, desktopId -> new LocalDesktopOperationsTransport(preferences, desktopId));
  }

  CompanionOperationsRouter(SharedPreferences preferences, AndroidOperationsTransport hostingTransport,
      LocalTransportFactory localTransports) {
    this.preferences = preferences;
    this.hostingTransport = hostingTransport;
    this.localTransports = localTransports;
  }

  @Override
  public String preferredSourceKey(String baseUrl, String credential) {
    String targetKey = CompanionConnectionIdentity.actionTargetKey(preferences, baseUrl);
    if (ConnectionSettings.isLocalOnly(preferences)) {
      return CompanionConnectionIdentity.localSourceKey(ConnectionSettings.localConnection(preferences).desktopId);
    }
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
    String targetKey = CompanionConnectionIdentity.actionTargetKey(preferences, baseUrl);
    if (ConnectionSettings.isLocalOnly(preferences)) {
      ConnectionSettings.LocalConnection paired = requireLocal();
      return localTransports.create(paired.desktopId)
          .fetchOperations(paired.baseUrl, paired.localToken, identity, knownServerRevision);
    }
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
      AndroidOperationsTransport localTransport = localTransports.create(local.desktopId);
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
    String targetKey = CompanionConnectionIdentity.actionTargetKey(preferences, baseUrl);
    // A coupon permit is minted only by the paired desktop over pinned TLS. It
    // must never be forwarded to the Web/hosting action path or replayed after a
    // local failure, where its discount and receipt evidence do not exist.
    if (actionPayload != null && actionPayload.has("couponPermitId")) {
      if (!ConnectionSettings.isLocalOnly(preferences)) {
        ConnectionSettings.LocalConnection local = ConnectionSettings.localConnectionForTarget(preferences, targetKey);
        if (!local.isComplete() || ConnectionSettings.hasHostingActionBarrier(preferences, targetKey)) {
          throw new TransportException(
              "Kuponlu satış yalnız eşleşmiş masaüstü TLS bağlantısında kullanılabilir; Web bağlantısına düşmez.",
              "local_coupon_tls_required", 0, null);
        }
        return localTransports.create(local.desktopId).enqueueAction(
            local.baseUrl, local.localToken, identity, actionId, actionType, actionPayload);
      }
    }
    if (ConnectionSettings.isLocalOnly(preferences)) {
      ConnectionSettings.LocalConnection paired = requireLocal();
      return localTransports.create(paired.desktopId)
          .enqueueAction(paired.baseUrl, paired.localToken, identity, actionId, actionType, actionPayload);
    }
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
      AndroidOperationsTransport localTransport = localTransports.create(local.desktopId);
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

  private ConnectionSettings.LocalConnection requireLocal() throws TransportException {
    ConnectionSettings.LocalConnection local = ConnectionSettings.localConnection(preferences);
    if (ConnectionSettings.hasAnyHostingActionBarrier(preferences)) {
      throw new TransportException("Önceki Web bağlantısında sonucu beklenen işlem var.", "target_barrier", 0, null);
    }
    if (LocalPinnedHttps.decodePin(local.spkiSha256) == null) {
      throw new TransportException("Güvenli masaüstü eşleştirmesi gerekli. Masaüstünde yeni QR açıp okutun.", "local_tls_pairing_required", 0, null);
    }
    if (!local.isComplete() || !local.targetKey.equals(CompanionConnectionIdentity.localActionTargetKey(local.desktopId))) {
      throw new TransportException("Masaüstü bağlantısı bekleniyor. Aynı ağa bağlanın; gerekirse QR ile yeniden eşleştirin.", "local_unreachable", 0, null);
    }
    return local;
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
      return;
    }
    if ("local_network_disabled".equals(error.code)) {
      ConnectionSettings.clearLocalEndpoint(preferences);
      return;
    }
    // Temporary reachability failures must not erase the paired desktop
    // endpoint. Foreground discovery can refresh a changed address while the
    // router keeps trying the cached endpoint before hosting fallback.
  }
}
