package com.yardimciasistan.android;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

final class ProductDataLookupClient {
  private static final String PROVIDER_OPEN_FOOD_FACTS = "open_food_facts";
  private static final String OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/api/v2/product";
  private static final String OPEN_FOOD_FACTS_PRODUCT = "https://world.openfoodfacts.org/product";
  private static final int CONNECT_TIMEOUT_MS = 8_000;
  private static final int READ_TIMEOUT_MS = 10_000;
  private static final int IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  private static final int IMAGE_MAX_DIMENSION = 768;

  Result lookup(String providerValue, String barcodeValue, boolean includeImages) throws LookupException {
    String provider = text(providerValue);
    if (!PROVIDER_OPEN_FOOD_FACTS.equals(provider)) {
      throw new LookupException("Ürün veri sağlayıcısı bu Android sürümünde desteklenmiyor.");
    }
    String barcode = text(barcodeValue);
    if (!barcode.matches("[0-9]{6,32}")) {
      throw new LookupException("Ürün bilgisi aramak için geçerli bir barkod gerekli.");
    }
    return lookupOpenFoodFacts(barcode, includeImages);
  }

  private Result lookupOpenFoodFacts(String barcode, boolean includeImages) throws LookupException {
    HttpURLConnection connection = null;
    try {
      String fields = "code,product_name,generic_name,brands,quantity,categories,image_front_url";
      URL endpoint = new URL(
          OPEN_FOOD_FACTS_API + "/" + URLEncoder.encode(barcode, StandardCharsets.UTF_8.name())
              + ".json?fields=" + URLEncoder.encode(fields, StandardCharsets.UTF_8.name())
      );
      connection = (HttpURLConnection) endpoint.openConnection();
      connection.setRequestMethod("GET");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setRequestProperty("Accept", "application/json");
      connection.setRequestProperty(
          "User-Agent",
          "YardimciAsistan-Android/0.1 (https://github.com/raistlinmajere1981-del/yardimciasistan)"
      );

      int status = connection.getResponseCode();
      if (status == 404) {
        return Result.notFound(PROVIDER_OPEN_FOOD_FACTS, barcode);
      }
      if (status < 200 || status >= 300) {
        throw new LookupException("Ürün veri servisi HTTP " + status + " yanıtı verdi.");
      }

      String responseText = readText(connection.getInputStream(), 512 * 1024);
      JSONObject root = new JSONObject(responseText);
      JSONObject product = root.optJSONObject("product");
      if (root.optInt("status", 0) != 1 || product == null) {
        return Result.notFound(PROVIDER_OPEN_FOOD_FACTS, barcode);
      }

      String name = compact(product.optString("product_name", ""), 180);
      if (name.isEmpty()) name = compact(product.optString("generic_name", ""), 180);
      String brand = compact(product.optString("brands", ""), 160);
      String quantity = compact(product.optString("quantity", ""), 80);
      String categoryHint = compact(product.optString("categories", ""), 180);
      String imageUrl = includeImages ? compact(product.optString("image_front_url", ""), 1200) : "";
      if (!isAllowedOpenFoodFactsImageUrl(imageUrl)) imageUrl = "";

      Bitmap imagePreview = null;
      if (!imageUrl.isEmpty()) {
        try {
          imagePreview = downloadPreview(imageUrl);
        } catch (Exception ignored) {
          // Product text remains useful even if the optional preview image fails.
        }
      }

      return new Result(
          true,
          PROVIDER_OPEN_FOOD_FACTS,
          barcode,
          name.isEmpty() ? (brand.isEmpty() ? "Barkodlu ürün" : brand) : name,
          brand,
          quantity,
          categoryHint,
          imageUrl,
          OPEN_FOOD_FACTS_PRODUCT + "/" + barcode,
          "ODbL",
          imageUrl.isEmpty() ? "" : "CC BY-SA",
          isoNow(),
          imagePreview
      );
    } catch (LookupException error) {
      throw error;
    } catch (java.net.SocketTimeoutException error) {
      throw new LookupException("Ürün veri servisi zaman aşımına uğradı.", error);
    } catch (java.net.UnknownHostException error) {
      throw new LookupException("Ürün veri servisine ulaşılamadı. İnternet bağlantısını kontrol edin.", error);
    } catch (Exception error) {
      throw new LookupException("Ürün bilgileri alınamadı.", error);
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private Bitmap downloadPreview(String imageUrl) throws Exception {
    if (!isAllowedOpenFoodFactsImageUrl(imageUrl)) return null;
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(imageUrl).openConnection();
      connection.setRequestMethod("GET");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setRequestProperty("Accept", "image/*");
      connection.setRequestProperty(
          "User-Agent",
          "YardimciAsistan-Android/0.1 (https://github.com/raistlinmajere1981-del/yardimciasistan)"
      );
      int status = connection.getResponseCode();
      if (status < 200 || status >= 300) return null;
      String contentType = text(connection.getContentType()).toLowerCase(Locale.ROOT);
      if (!contentType.startsWith("image/")) return null;
      int declaredLength = connection.getContentLength();
      if (declaredLength > IMAGE_MAX_BYTES) return null;
      byte[] bytes = readBytes(connection.getInputStream(), IMAGE_MAX_BYTES);
      Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
      if (decoded == null) return null;
      int width = decoded.getWidth();
      int height = decoded.getHeight();
      int largest = Math.max(width, height);
      if (largest <= IMAGE_MAX_DIMENSION) return decoded;
      float scale = (float) IMAGE_MAX_DIMENSION / (float) largest;
      Bitmap scaled = Bitmap.createScaledBitmap(
          decoded,
          Math.max(1, Math.round(width * scale)),
          Math.max(1, Math.round(height * scale)),
          true
      );
      if (scaled != decoded) decoded.recycle();
      return scaled;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private static String readText(InputStream stream, int maximumBytes) throws Exception {
    return new String(readBytes(stream, maximumBytes), StandardCharsets.UTF_8);
  }

  private static byte[] readBytes(InputStream stream, int maximumBytes) throws Exception {
    try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[16 * 1024];
      int total = 0;
      int read;
      while ((read = input.read(buffer)) != -1) {
        total += read;
        if (total > maximumBytes) {
          throw new IllegalStateException("Yanıt izin verilen boyuttan büyük.");
        }
        output.write(buffer, 0, read);
      }
      return output.toByteArray();
    }
  }

  private static boolean isAllowedOpenFoodFactsImageUrl(String value) {
    if (value == null || value.isEmpty()) return false;
    try {
      URL url = new URL(value);
      String host = text(url.getHost()).toLowerCase(Locale.ROOT);
      return "https".equalsIgnoreCase(url.getProtocol())
          && ("openfoodfacts.org".equals(host) || host.endsWith(".openfoodfacts.org"));
    } catch (Exception error) {
      return false;
    }
  }

  private static String compact(String value, int maximum) {
    String normalized = text(value).replaceAll("\\s+", " ");
    return normalized.length() <= maximum ? normalized : normalized.substring(0, maximum);
  }

  private static String text(String value) {
    return value == null ? "" : value.trim();
  }

  private static String isoNow() {
    return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).format(new Date());
  }

  static final class Result {
    final boolean found;
    final String provider;
    final String barcode;
    final String name;
    final String brand;
    final String quantity;
    final String categoryHint;
    final String imageUrl;
    final String sourceProductUrl;
    final String dataLicense;
    final String imageLicense;
    final String fetchedAt;
    final Bitmap imagePreview;

    Result(
        boolean found,
        String provider,
        String barcode,
        String name,
        String brand,
        String quantity,
        String categoryHint,
        String imageUrl,
        String sourceProductUrl,
        String dataLicense,
        String imageLicense,
        String fetchedAt,
        Bitmap imagePreview
    ) {
      this.found = found;
      this.provider = provider;
      this.barcode = barcode;
      this.name = name;
      this.brand = brand;
      this.quantity = quantity;
      this.categoryHint = categoryHint;
      this.imageUrl = imageUrl;
      this.sourceProductUrl = sourceProductUrl;
      this.dataLicense = dataLicense;
      this.imageLicense = imageLicense;
      this.fetchedAt = fetchedAt;
      this.imagePreview = imagePreview;
    }

    static Result notFound(String provider, String barcode) {
      return new Result(false, provider, barcode, "", "", "", "", "", "", "", "", "", null);
    }
  }

  static final class LookupException extends Exception {
    LookupException(String message) {
      super(message);
    }

    LookupException(String message, Throwable cause) {
      super(message, cause);
    }
  }
}
