package com.yardimciasistan.dealer;
import org.junit.Test;
import static org.junit.Assert.*;

public class DealerAccountAuthTest {
  @Test public void pkceUsesS256AndFreshEntropy() throws Exception {
    String verifier = DealerAccountAuth.verifier();
    assertTrue(verifier.matches("[A-Za-z0-9_-]{43}"));
    assertNotEquals(verifier, DealerAccountAuth.verifier());
    assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", DealerAccountAuth.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));
    assertThrows(IllegalArgumentException.class, () -> DealerAccountAuth.challenge("invalid"));
  }
  @Test public void accountDenialsExplainCapabilityAndCommercialAccess() {
    assertTrue(DealerApi.accountMessage("online_sales_disabled", "").contains("Online Satış kapalı"));
    assertTrue(DealerApi.accountMessage("dealer_access_required", "").contains("normal müşteri"));
  }
}
