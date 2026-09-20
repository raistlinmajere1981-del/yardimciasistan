package com.yardimciasistan.android;

import org.json.JSONObject;

final class HostingAndroidOperationsTransport implements AndroidOperationsTransport {
  private final HostingSyncClient client;

  HostingAndroidOperationsTransport() {
    this(new HostingSyncClient());
  }

  HostingAndroidOperationsTransport(HostingSyncClient client) {
    this.client = client;
  }

  @Override
  public String preferredSourceKey(String baseUrl, String credential) {
    return CompanionConnectionIdentity.hostingSourceKey(baseUrl);
  }

  @Override
  public FetchResult fetchOperations(
      String baseUrl,
      String credential,
      DeviceIdentity identity,
      long knownServerRevision
  ) throws TransportException {
    try {
      HostingSyncClient.FetchResult result = client.fetchOperations(
          baseUrl,
          credential,
          identity,
          knownServerRevision
      );
      return new FetchResult(
          result.notModified,
          result.serverRevision,
          result.data,
          result.payload,
          CompanionConnectionIdentity.hostingSourceKey(baseUrl)
      );
    } catch (HostingSyncClient.SyncException error) {
      throw adapt(error);
    }
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
    try {
      return client.enqueueAction(
          baseUrl,
          credential,
          identity,
          actionId,
          actionType,
          actionPayload
      );
    } catch (HostingSyncClient.SyncException error) {
      throw adapt(error);
    }
  }

  private static TransportException adapt(HostingSyncClient.SyncException error) {
    return new TransportException(
        error.getMessage(),
        error.code,
        error.httpStatus,
        error
    );
  }
}
