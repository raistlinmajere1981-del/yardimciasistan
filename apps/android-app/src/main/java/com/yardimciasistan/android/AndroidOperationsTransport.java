package com.yardimciasistan.android;

import org.json.JSONObject;

interface AndroidOperationsTransport {
  FetchResult fetchOperations(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      long knownServerRevision
  ) throws TransportException;

  OperationData.ActionRecord enqueueAction(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      String actionId,
      String actionType,
      JSONObject actionPayload
  ) throws TransportException;

  final class FetchResult {
    final boolean notModified;
    final long serverRevision;
    final OperationData data;
    final JSONObject payload;

    FetchResult(boolean notModified, long serverRevision, OperationData data, JSONObject payload) {
      this.notModified = notModified;
      this.serverRevision = serverRevision;
      this.data = data;
      this.payload = payload;
    }
  }

  final class TransportException extends Exception {
    final String code;
    final int httpStatus;

    TransportException(String message) {
      this(message, "", 0, null);
    }

    TransportException(String message, Throwable cause) {
      this(message, "", 0, cause);
    }

    TransportException(String message, String code, int httpStatus, Throwable cause) {
      super(message, cause);
      this.code = code == null ? "" : code.trim();
      this.httpStatus = httpStatus;
    }

    boolean disablesAndroidService() {
      return "android_capability_disabled".equals(code);
    }

    boolean invalidatesPendingAction() {
      return disablesAndroidService()
          || "device_approval_required".equals(code)
          || "customer_management_permission_denied".equals(code)
          || "android_action_permission_denied".equals(code)
          || "android_action_capability_disabled".equals(code);
    }
  }
}
