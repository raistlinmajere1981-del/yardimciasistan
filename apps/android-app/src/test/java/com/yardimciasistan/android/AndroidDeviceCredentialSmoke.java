package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class AndroidDeviceCredentialSmoke {
  private static final String TOKEN = "yat_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  private static final String CREDENTIAL = "device:" + TOKEN;

  @Test
  public void recognizesOnlyWellFormedDeviceCredentials() {
    assertTrue(ConnectionSettings.isDeviceCredential(CREDENTIAL));
    assertEquals(TOKEN, ConnectionSettings.deviceToken(CREDENTIAL));
    assertFalse(ConnectionSettings.isDeviceCredential(TOKEN));
    assertFalse(ConnectionSettings.isDeviceCredential("device:yat_short"));
    assertFalse(ConnectionSettings.isDeviceCredential("change-this-secret"));
  }

  @Test
  public void switchesOnlyTokenizedAndroidCallsToRestrictedGateways() {
    String baseUrl = "https://example.test/yardimci-asistan";
    assertEquals(baseUrl + "/api/sync.php", HostingSyncClient.toSyncEndpoint(baseUrl, "bootstrap-secret"));
    assertEquals(baseUrl + "/api/android.php", HostingSyncClient.toSyncEndpoint(baseUrl, CREDENTIAL));
    assertEquals(baseUrl + "/api/chat.php", HostingSyncClient.toChatEndpoint(baseUrl, "bootstrap-secret"));
    assertEquals(baseUrl + "/api/android-chat.php", HostingSyncClient.toChatEndpoint(baseUrl, CREDENTIAL));
    assertEquals(baseUrl + "/api/stock-image-analysis.php", HostingSyncClient.toStockImageAnalysisEndpoint(baseUrl, "bootstrap-secret"));
    assertEquals(baseUrl + "/api/android-stock-image-analysis.php", HostingSyncClient.toStockImageAnalysisEndpoint(baseUrl, CREDENTIAL));
    assertEquals(baseUrl + "/api/identity-image-analysis.php", HostingSyncClient.toIdentityImageAnalysisEndpoint(baseUrl, "bootstrap-secret"));
    assertEquals(baseUrl + "/api/android-identity-image-analysis.php", HostingSyncClient.toIdentityImageAnalysisEndpoint(baseUrl, CREDENTIAL));
  }
}
