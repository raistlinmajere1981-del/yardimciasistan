package com.yardimciasistan.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.net.Uri;

import androidx.exifinterface.media.ExifInterface;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;

final class StockImageFile {
  static final long MAX_BYTES = 10L * 1024L * 1024L;
  private static final int MAX_DIMENSION = 2400;

  private StockImageFile() {}

  static PreparedImage prepare(Context context, Uri sourceUri) throws StockImageException {
    File source = null;
    try {
      File directory = imageDirectory(context);
      source = new File(directory, "source-" + UUID.randomUUID().toString() + ".image");
      copyLimited(context, sourceUri, source);
      String detectedMime = detectMime(source);
      if (detectedMime == null) {
        throw new StockImageException("Desteklenmeyen dosya türü. JPG, PNG veya WebP seçin.");
      }
      Bitmap bitmap = decodeNormalized(source);
      return writePrepared(context, bitmap);
    } catch (StockImageException error) {
      throw error;
    } catch (Exception error) {
      throw new StockImageException("Görsel okunamadı.", error);
    } finally {
      if (source != null && source.isFile()) {
        source.delete();
      }
    }
  }

  static PreparedImage rotatedCopy(Context context, PreparedImage source, int rotationDegrees) throws StockImageException {
    int normalized = ((rotationDegrees % 360) + 360) % 360;
    if (normalized == 0) {
      return source;
    }
    Matrix matrix = new Matrix();
    matrix.postRotate(normalized);
    Bitmap rotated;
    try {
      rotated = Bitmap.createBitmap(source.preview, 0, 0, source.preview.getWidth(), source.preview.getHeight(), matrix, true);
    } catch (Exception error) {
      throw new StockImageException("Görsel döndürülemedi.", error);
    }
    return writePrepared(context, rotated);
  }

  private static PreparedImage writePrepared(Context context, Bitmap bitmap) throws StockImageException {
    File output = new File(imageDirectory(context), "stock-import-" + UUID.randomUUID().toString() + ".jpg");
    Bitmap jpegBitmap = bitmap;
    if (bitmap.hasAlpha()) {
      jpegBitmap = Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
      Canvas canvas = new Canvas(jpegBitmap);
      canvas.drawColor(Color.WHITE);
      canvas.drawBitmap(bitmap, 0, 0, null);
      bitmap.recycle();
    }
    try (FileOutputStream stream = new FileOutputStream(output)) {
      if (!jpegBitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream)) {
        throw new StockImageException("Görsel hazırlanamadı.");
      }
      stream.flush();
    } catch (StockImageException error) {
      output.delete();
      jpegBitmap.recycle();
      throw error;
    } catch (Exception error) {
      output.delete();
      jpegBitmap.recycle();
      throw new StockImageException("Görsel hazırlanamadı.", error);
    }
    long outputLength = output.length();
    if (outputLength <= 0 || outputLength > MAX_BYTES) {
      output.delete();
      jpegBitmap.recycle();
      throw new StockImageException(outputLength > MAX_BYTES ? "Görsel çok büyük." : "Görsel hazırlanamadı.");
    }
    try {
      return new PreparedImage(output, "image/jpeg", sha256(output), jpegBitmap);
    } catch (Exception error) {
      output.delete();
      jpegBitmap.recycle();
      throw new StockImageException("Görsel güvenli biçimde doğrulanamadı.", error);
    }
  }

  private static void copyLimited(Context context, Uri sourceUri, File target) throws Exception {
    long total = 0;
    byte[] buffer = new byte[16 * 1024];
    try (InputStream input = context.getContentResolver().openInputStream(sourceUri);
         FileOutputStream output = new FileOutputStream(target)) {
      if (input == null) {
        throw new StockImageException("Görsel okunamadı.");
      }
      int read;
      while ((read = input.read(buffer)) != -1) {
        total += read;
        if (total > MAX_BYTES) {
          throw new StockImageException("Görsel çok büyük. En fazla 10 MB boyutunda bir görsel seçin.");
        }
        output.write(buffer, 0, read);
      }
      output.flush();
    }
    if (total <= 0) {
      throw new StockImageException("Görsel okunamadı.");
    }
  }

  private static Bitmap decodeNormalized(File source) throws Exception {
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(source.getAbsolutePath(), bounds);
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw new StockImageException("Görsel okunamadı.");
    }
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inSampleSize = 1;
    while (Math.max(bounds.outWidth / options.inSampleSize, bounds.outHeight / options.inSampleSize) > MAX_DIMENSION) {
      options.inSampleSize *= 2;
    }
    Bitmap decoded = BitmapFactory.decodeFile(source.getAbsolutePath(), options);
    if (decoded == null) {
      throw new StockImageException("Görsel okunamadı.");
    }
    Bitmap oriented = applyExifOrientation(source, decoded);
    int width = oriented.getWidth();
    int height = oriented.getHeight();
    float scale = Math.min(1f, (float) MAX_DIMENSION / Math.max(width, height));
    if (scale >= 1f) {
      return oriented;
    }
    Bitmap scaled = Bitmap.createScaledBitmap(oriented, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), true);
    if (scaled != oriented) {
      oriented.recycle();
    }
    return scaled;
  }

  private static Bitmap applyExifOrientation(File source, Bitmap bitmap) {
    try {
      ExifInterface exif = new ExifInterface(source);
      int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
      Matrix matrix = new Matrix();
      switch (orientation) {
        case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
          matrix.setScale(-1, 1);
          break;
        case ExifInterface.ORIENTATION_ROTATE_180:
          matrix.setRotate(180);
          break;
        case ExifInterface.ORIENTATION_FLIP_VERTICAL:
          matrix.setRotate(180);
          matrix.postScale(-1, 1);
          break;
        case ExifInterface.ORIENTATION_TRANSPOSE:
          matrix.setRotate(90);
          matrix.postScale(-1, 1);
          break;
        case ExifInterface.ORIENTATION_ROTATE_90:
          matrix.setRotate(90);
          break;
        case ExifInterface.ORIENTATION_TRANSVERSE:
          matrix.setRotate(-90);
          matrix.postScale(-1, 1);
          break;
        case ExifInterface.ORIENTATION_ROTATE_270:
          matrix.setRotate(-90);
          break;
        default:
          return bitmap;
      }
      Bitmap oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
      if (oriented != bitmap) {
        bitmap.recycle();
      }
      return oriented;
    } catch (Exception ignored) {
      return bitmap;
    }
  }

  private static String detectMime(File file) throws Exception {
    byte[] header = new byte[12];
    int read;
    try (FileInputStream stream = new FileInputStream(file)) {
      read = stream.read(header);
    }
    if (read >= 3 && (header[0] & 0xff) == 0xff && (header[1] & 0xff) == 0xd8 && (header[2] & 0xff) == 0xff) {
      return "image/jpeg";
    }
    if (read >= 8 && (header[0] & 0xff) == 0x89 && header[1] == 0x50 && header[2] == 0x4e && header[3] == 0x47
        && header[4] == 0x0d && header[5] == 0x0a && header[6] == 0x1a && header[7] == 0x0a) {
      return "image/png";
    }
    if (read >= 12 && header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F'
        && header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P') {
      return "image/webp";
    }
    return null;
  }

  private static String sha256(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    byte[] buffer = new byte[16 * 1024];
    try (FileInputStream stream = new FileInputStream(file)) {
      int read;
      while ((read = stream.read(buffer)) != -1) {
        digest.update(buffer, 0, read);
      }
    }
    StringBuilder result = new StringBuilder();
    for (byte value : digest.digest()) {
      result.append(String.format(Locale.US, "%02x", value & 0xff));
    }
    return result.toString();
  }

  private static File imageDirectory(Context context) throws StockImageException {
    File directory = new File(context.getCacheDir(), "stock-images");
    if ((!directory.isDirectory() && !directory.mkdirs()) || !directory.isDirectory()) {
      throw new StockImageException("Geçici görsel alanı hazırlanamadı.");
    }
    return directory;
  }

  static final class PreparedImage {
    final File file;
    final String mimeType;
    final String imageHash;
    final Bitmap preview;

    PreparedImage(File file, String mimeType, String imageHash, Bitmap preview) {
      this.file = file;
      this.mimeType = mimeType;
      this.imageHash = imageHash;
      this.preview = preview;
    }

    void release() {
      if (file.isFile()) {
        file.delete();
      }
      if (!preview.isRecycled()) {
        preview.recycle();
      }
    }
  }

  static final class StockImageException extends Exception {
    StockImageException(String message) {
      super(message);
    }

    StockImageException(String message, Throwable cause) {
      super(message, cause);
    }
  }
}
