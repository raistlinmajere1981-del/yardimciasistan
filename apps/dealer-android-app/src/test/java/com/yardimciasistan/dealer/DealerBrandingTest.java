package com.yardimciasistan.dealer;

import org.junit.Test;
import org.json.JSONObject;
import static org.junit.Assert.*;

public final class DealerBrandingTest {
  private JSONObject payload(String name, String logo) throws Exception {
    return new JSONObject().put("business",
        new JSONObject().put("display_name", name).put("logo_url", logo));
  }
  @Test public void businessIdentityAndLogoAreBoundToConnectedOrigin() throws Exception {
    JSONObject branding = DealerBranding.normalize(payload("Teknikel Kombi", "/assets/logo.webp"),
        "https://ornek.example/yardimci-asistan/");
    assertEquals("Teknikel Kombi", DealerBranding.displayName(branding));
    assertEquals("https://ornek.example/assets/logo.webp", branding.getString("logo_url"));
  }
  @Test public void foreignImagesAndInvalidPathsNeverEnterDisplay() throws Exception {
    String base = "https://ornek.example/yardimci-asistan/";
    for (String value : new String[] {"https://other.example/logo.png", "//other.example/logo.png",
        "http://ornek.example/assets/logo.png", "/../data/private.png", "/assets/logo.svg",
        "/assets/logo.png?secret=1", "https://user:pw@ornek.example/logo.png"}) {
      assertEquals("Rejected: "+value,"",DealerBranding.normalize(payload("Teknikel",value),base).getString("logo_url"));
    }
    assertEquals("Bayi Portalı",DealerBranding.displayName(new JSONObject()));
  }
  @Test public void brandsAreScopedToExactConnectedBusiness() throws Exception {
    DealerState state = new DealerState("{}",json->{});
    String teknikel = "https://ornek.example/yardimci-asistan/";
    String other = "https://firma2.example/yardimci-asistan/";
    state.updateBranding(teknikel,DealerBranding.normalize(payload("Teknikel","/assets/logo.webp"),teknikel));
    assertEquals("Teknikel",DealerBranding.displayName(state.brandingFor(teknikel)));
    assertTrue(state.brandingFor(other).length()==0);
    state.put("connection_base",teknikel);
    state.logout();
    assertEquals("Teknikel",DealerBranding.displayName(state.brandingFor(teknikel)));
    assertTrue(state.brandingFor(other).length()==0);
  }
}
