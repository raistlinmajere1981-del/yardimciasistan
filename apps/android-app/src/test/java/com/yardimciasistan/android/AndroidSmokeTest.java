package com.yardimciasistan.android;

import org.junit.Test;

public final class AndroidSmokeTest {
  @Test
  public void existingPureJavaSmokeChecksPass() {
    StableDeviceIdSmoke.main(new String[0]);
    AndroidOperationsTransportSmoke.main(new String[0]);
    NotificationRulesSmoke.main(new String[0]);
    StockRulesSmoke.main(new String[0]);
    AndroidUiRulesSmoke.main(new String[0]);
    AppThemeSmoke.main(new String[0]);
  }
}
