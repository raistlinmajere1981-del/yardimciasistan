package com.yardimciasistan.android;

import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Base64;
import java.util.Collection;
import java.util.List;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/** QR-established trust only. Each connection owns its TLS context and exact IP policy. */
final class LocalPinnedHttps {
  interface ConnectionFactory { HttpURLConnection open(String endpoint) throws Exception; }
  static final ConnectionFactory CONNECTIONS = endpoint -> (HttpURLConnection) new URL(endpoint).openConnection();

  private LocalPinnedHttps() {}

  static byte[] decodePin(String value) {
    if (value == null || !value.matches("[A-Za-z0-9_-]{43}")) return null;
    try {
      byte[] bytes = Base64.getUrlDecoder().decode(value);
      return bytes.length == 32 && Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).equals(value)
          ? bytes : null;
    } catch (IllegalArgumentException error) { return null; }
  }

  static String normalizeAuthority(String authority) {
    if (authority == null) return "";
    String[] parts = authority.split(":", -1);
    if (parts.length != 2 || !parts[1].matches("[1-9][0-9]{0,4}")) return "";
    if (Integer.parseInt(parts[1]) > 65535) return "";
    String[] octets = parts[0].split("\\.", -1);
    if (octets.length != 4) return "";
    int[] ip = new int[4];
    for (int i = 0; i < 4; i++) {
      if (!octets[i].matches("0|[1-9][0-9]{0,2}")) return "";
      ip[i] = Integer.parseInt(octets[i]);
      if (ip[i] > 255) return "";
    }
    return ip[0] == 10 || ip[0] == 192 && ip[1] == 168 || ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31
        ? "https://" + authority : "";
  }

  static String normalizeBaseUrl(String value) {
    if (value == null || !value.startsWith("https://")) return "";
    return normalizeAuthority(value.substring(8));
  }

  static HttpsURLConnection open(String endpoint, String pin, ConnectionFactory factory) throws Exception {
    URI uri = new URI(endpoint);
    String base = normalizeAuthority(uri.getRawAuthority());
    if (!"https".equals(uri.getScheme()) || base.isEmpty() || uri.getRawQuery() != null
        || uri.getRawFragment() != null || !endpoint.startsWith(base + "/local/v1/")) {
      throw new SSLException("local_tls_endpoint_invalid");
    }
    byte[] expected = decodePin(pin);
    if (expected == null) throw new SSLException("local_tls_pin_required");
    String host = uri.getHost();
    X509TrustManager trust = new X509TrustManager() {
      @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
      @Override public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
        throw new CertificateException("Client authentication is not supported");
      }
      @Override public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
        verify(chain, expected, host);
      }
    };
    SSLContext context = SSLContext.getInstance("TLSv1.2");
    context.init(null, new TrustManager[] {trust}, new SecureRandom());
    HttpURLConnection raw = factory.open(endpoint);
    if (!(raw instanceof HttpsURLConnection) || !endpoint.equals(raw.getURL().toString())) {
      if (raw != null) raw.disconnect();
      throw new SSLException("local_tls_required");
    }
    HttpsURLConnection connection = (HttpsURLConnection) raw;
    connection.setSSLSocketFactory(context.getSocketFactory());
    connection.setHostnameVerifier((hostname, session) -> {
      if (!host.equals(hostname)) return false;
      try { verifyCertificates(session.getPeerCertificates(), expected, host); return true; }
      catch (Exception error) { return false; }
    });
    connection.setInstanceFollowRedirects(false);
    connection.setUseCaches(false);
    return connection;
  }

  /** Called after request configuration and before HTTP output/response access. No TLS bypass for test factories. */
  static void authenticate(HttpURLConnection raw, String pin) throws Exception {
    if (!(raw instanceof HttpsURLConnection)) throw new SSLException("local_tls_required");
    HttpsURLConnection connection = (HttpsURLConnection) raw;
    connection.connect();
    try { verifyCertificates(connection.getServerCertificates(), decodePin(pin), connection.getURL().getHost()); }
    catch (CertificateException error) { throw new SSLException("local_tls_authentication_failed", error); }
  }

  static void rejectRedirect(int status) throws SSLException {
    if (status >= 300 && status < 400) throw new SSLException("local_tls_redirect_denied");
  }

  private static void verifyCertificates(Certificate[] chain, byte[] pin, String host) throws CertificateException {
    if (chain == null || chain.length != 1 || !(chain[0] instanceof X509Certificate)) {
      throw new CertificateException("Invalid local certificate chain");
    }
    verify(new X509Certificate[] {(X509Certificate) chain[0]}, pin, host);
  }

  static void verify(X509Certificate[] chain, byte[] expected, String host) throws CertificateException {
    try {
      if (expected == null || expected.length != 32 || chain == null || chain.length != 1 || chain[0] == null) throw new CertificateException();
      X509Certificate leaf = chain[0];
      byte[] actual = MessageDigest.getInstance("SHA-256").digest(leaf.getPublicKey().getEncoded());
      if (!MessageDigest.isEqual(expected, actual)) throw new CertificateException();
      leaf.checkValidity();
      if (leaf.getBasicConstraints() != -1 || !leaf.getSubjectX500Principal().equals(leaf.getIssuerX500Principal())) throw new CertificateException();
      leaf.verify(leaf.getPublicKey());
      List<String> eku = leaf.getExtendedKeyUsage();
      boolean[] keyUsage = leaf.getKeyUsage();
      if (eku == null || !eku.contains("1.3.6.1.5.5.7.3.1") || keyUsage == null || !keyUsage[0]) throw new CertificateException();
      Collection<List<?>> sans = leaf.getSubjectAlternativeNames();
      boolean ipMatches = false;
      if (sans != null) for (List<?> san : sans) {
        if (san.size() == 2 && Integer.valueOf(7).equals(san.get(0)) && host.equals(san.get(1))) ipMatches = true;
      }
      if (!ipMatches) throw new CertificateException();
    } catch (Exception error) {
      throw new CertificateException("Local TLS identity could not be authenticated", error);
    }
  }
}
