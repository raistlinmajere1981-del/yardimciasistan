package com.yardimciasistan.dealer;

import static org.junit.Assert.*;

import java.net.URLEncoder;
import org.junit.Test;

public class DealerLinkTest {
  private static final String TOKEN = "a".repeat(43);
  private String link(String portal, String base) throws Exception {
    return portal + "#invite=" + TOKEN + "&module=" + URLEncoder.encode(base, "UTF-8");
  }
  @Test
  public void singleLinkRetainsTheExactInstallationPath() throws Exception {
    for (String base : new String[] {"https://firma.example/yardimci-asistan/",
             "https://firma.example/kurum/ozel-api/", "https://firma.example:8443/custom/",
             "https://firma.example/"}) {
      String portal = base.equals("https://firma.example/")
          ? "https://firma.example/bayi/"
          : new java.net.URI(base).resolve("../bayi/").toString();
      DealerLink parsed = DealerLink.parse(link(portal, base));
      assertEquals(base, parsed.base);
      assertEquals(TOKEN, parsed.token);
      assertFalse(parsed.application);
    }
  }
  @Test
  public void applicationUsesTheSameLinkBoundaryWithoutClaimingAnInvite() throws Exception {
    DealerLink result = DealerLink.parse("https://firma.example/bayi/#application=dealer&module="
        + URLEncoder.encode("https://firma.example/module/", "UTF-8"));
    assertTrue(result.application);
    assertEquals("", result.token);
  }
  @Test
  public void oldInvitationNeverGuessesTheMissingModule() {
    IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
        () -> DealerLink.parse("https://firma.example/bayi/#invite=" + TOKEN));
    assertTrue(error.getMessage().contains("yeni bağlantı"));
  }
  @Test
  public void rejectsAmbiguousOriginsSecretsAndPaths() throws Exception {
    String good = link("https://firma.example/bayi/", "https://firma.example/module/");
    for (String value :
        new String[] {good.replace("https://firma.example/bayi/", "http://firma.example/bayi/"),
            good.replace("https://firma.example/bayi/", "https://other.example/bayi/"),
            good.replace("https://firma.example/bayi/", "https://firma.example:444/bayi/"),
            good.replace("https://firma.example/bayi/", "https://u:p@firma.example/bayi/"),
            good.replace("/bayi/#", "/bayi/?x=1#"), good + "&invite=" + TOKEN, good + "&x=1",
            good.replace("invite=" + TOKEN, "invite=short"),
            good.replace("invite=" + TOKEN, "application=dealer&invite=" + TOKEN),
            good.replace("#invite=", "#invite=%0A"),
            link("https://firma.example/bayi/", "https://firma.example/module/?secret=x"),
            link("https://firma.example/bayi/", "https://firma.example/module/#x"),
            link("https://firma.example/bayi/", "https://firma.example/module/../other/"),
            link("https://firma.example/bayi/", "https://firma.example/%2e%2e/"),
            link("https://firma.example/bayi/", "https://firma.example/a%2fb/"),
            link("https://firma.example/bayi/", "https://firma.example/a%252fb/"),
            link("https://firma.example/unrelated/", "https://firma.example/module/"), "not a URI",
            null}) {
      assertThrows("Rejected link must not be accepted", IllegalArgumentException.class,
          () -> DealerLink.parse(value));
    }
  }
  @Test
  public void defaultHttpsPortAndHostCaseAreEquivalent() throws Exception {
    DealerLink result =
        DealerLink.parse(link("https://FIRMA.example:443/bayi/", "https://firma.example/module/"));
    assertEquals("https://firma.example/module/", result.base);
  }
}
