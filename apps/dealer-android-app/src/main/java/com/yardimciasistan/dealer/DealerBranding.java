package com.yardimciasistan.dealer;

import org.json.JSONObject;
import java.net.URI;

/** Public display identity only, keyed to the exact authenticated module. Never grants access. */
final class DealerBranding {
  static JSONObject normalize(JSONObject payload, String base) throws Exception {
    JSONObject business = payload.optJSONObject("business");
    if (business == null) return new JSONObject();
    String name = business.optString("display_name", "").trim();
    if (name.length() > 100) name = name.substring(0, 100);
    String logo = business.optString("logo_url", "").trim();
    String safeLogo = "";
    if (!logo.isEmpty() && logo.length() <= 512) {
      URI module = new URI(DealerApi.normalizeBase(base));
      URI target = module.resolve(logo);
      String path = target.getRawPath();
      if ("https".equalsIgnoreCase(target.getScheme()) &&
          module.getHost().equalsIgnoreCase(target.getHost()) &&
          module.getPort() == target.getPort() && target.getUserInfo() == null &&
          target.getRawQuery() == null && target.getRawFragment() == null &&
          path != null && path.matches("/[A-Za-z0-9_./-]+\\.(?i:png|jpg|jpeg|webp)") &&
          !path.contains("..") && !logo.startsWith("//")) safeLogo = target.toString();
    }
    return new JSONObject().put("name", name).put("logo_url", safeLogo);
  }
  static String displayName(JSONObject branding) {
    String name = branding.optString("name").trim();
    return name.isEmpty() ? "Bayi Portalı" : name;
  }
}
