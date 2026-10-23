package com.yardimciasistan.dealer;

import java.net.URI;
import java.net.URLDecoder;
import java.util.LinkedHashMap;
import java.util.Map;

/** One explicit HTTPS link, with no guessed installation path or network discovery. */
final class DealerLink {
  final String base, token;
  final boolean application;
  private DealerLink(String base, String token, boolean application) {
    this.base = base;
    this.token = token;
    this.application = application;
  }

  static DealerLink parse(String input) {
    try {
      return decode(input);
    } catch (IllegalArgumentException error) {
      throw error;
    } catch (Exception error) {
      throw invalid();
    }
  }
  private static DealerLink decode(String input) throws Exception {
    if (input == null || input.trim().length() > 4096)
      throw invalid();
    URI link;
    try {
      link = new URI(input.trim());
    } catch (Exception error) {
      throw invalid();
    }
    if (!https(link) || link.getRawQuery() != null || link.getRawFragment() == null)
      throw invalid();
    Map<String, String> values = new LinkedHashMap<>();
    for (String pair : link.getRawFragment().split("&", -1)) {
      String[] parts = pair.split("=", -1);
      if (parts.length != 2)
        throw invalid();
      String key, value;
      try {
        key = URLDecoder.decode(parts[0], "UTF-8");
        value = URLDecoder.decode(parts[1], "UTF-8");
      } catch (Exception error) {
        throw invalid();
      }
      if (!key.matches("invite|module|application") || values.containsKey(key) || controls(value))
        throw invalid();
      values.put(key, value);
    }
    boolean application = "dealer".equals(values.get("application"));
    String token = values.get("invite");
    if (application ? token != null : token == null || !token.matches("[A-Za-z0-9_-]{43}"))
      throw invalid();
    if (!values.containsKey("module"))
      throw new IllegalArgumentException("Bu bağlantı eksik. Firmanızdan yeni bağlantı isteyin.");
    if (values.size() != 2)
      throw invalid();
    String base;
    try {
      base = DealerApi.normalizeBase(values.get("module"));
    } catch (Exception error) {
      throw invalid();
    }
    URI module = new URI(base);
    if (!https(module) || !module.getHost().equalsIgnoreCase(link.getHost())
        || port(module) != port(link))
      throw new IllegalArgumentException("Bağlantı bilgileri aynı firmaya ait olmalı.");
    String modulePath = module.getRawPath();
    String withoutSlash = modulePath.substring(0, modulePath.length() - 1);
    int parent = withoutSlash.lastIndexOf('/');
    String portalPath = (parent < 0 ? "" : withoutSlash.substring(0, parent)) + "/bayi/";
    if (!safePath(module) || !safePath(link) || !portalPath.equals(link.getRawPath()))
      throw invalid();
    return new DealerLink(base, application ? "" : token, application);
  }
  private static boolean https(URI uri) {
    return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
        && uri.getUserInfo() == null
        && (uri.getPort() == -1 || uri.getPort() > 0 && uri.getPort() <= 65535);
  }
  private static int port(URI uri) {
    return uri.getPort() == -1 ? 443 : uri.getPort();
  }
  private static boolean safePath(URI uri) {
    String raw = uri.getRawPath() == null ? "" : uri.getRawPath();
    String path = uri.getPath() == null ? "" : uri.getPath();
    return !controls(path) && !path.contains("\\") && !path.matches(".*(?:^|/)\\.{1,2}(?:/|$).*")
        && !raw.toLowerCase(java.util.Locale.ROOT).matches(".*%(?:2f|5c|25).*")
        && uri.normalize().getRawPath().equals(raw);
  }
  private static boolean controls(String value) {
    return value.chars().anyMatch(c -> c < 32 || c == 127);
  }
  private static IllegalArgumentException invalid() {
    return new IllegalArgumentException("Geçerli bayi bağlantısını yapıştırın.");
  }
}
