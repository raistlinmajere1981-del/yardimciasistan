package com.yardimciasistan.dealer;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.widget.ImageView;
import android.util.LruCache;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.concurrent.*;

/** Public HTTPS product images only. No dealer cookie is sent to image origins. */
final class DealerImages {
  private final ExecutorService executor = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(60), new ThreadPoolExecutor.DiscardPolicy());
  private final File directory;
  private final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(8 * 1024 * 1024) {
    @Override protected int sizeOf(String key, Bitmap value) { return value.getByteCount(); }
  };
  DealerImages(Context context) { directory = new File(context.getCacheDir(), "catalog-images"); directory.mkdirs(); }
  void close() { executor.shutdownNow(); cache.evictAll(); }
  void load(ImageView view, String source) {
    if (source.isEmpty()) return;
    view.setTag(source); Bitmap existing = cache.get(source);
    if (existing != null) { view.setImageBitmap(existing); return; }
    executor.execute(() -> {
      try {
        URI uri = new URI(source);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) return;
        StringBuilder hash = new StringBuilder(); for (byte part : MessageDigest.getInstance("SHA-256").digest(source.getBytes("UTF-8"))) hash.append(String.format("%02x", part & 255));
        File file = new File(directory, hash.toString()); byte[] bytes;
        if (file.isFile()) bytes = read(new FileInputStream(file));
        else {
          HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
          connection.setConnectTimeout(8000); connection.setReadTimeout(10000); connection.setInstanceFollowRedirects(false);
          try { if (connection.getResponseCode() != 200) return; bytes = read(connection.getInputStream()); }
          finally { connection.disconnect(); }
          File[] old = directory.listFiles(); if (old != null && old.length >= 120) {
            java.util.Arrays.sort(old, java.util.Comparator.comparingLong(File::lastModified));
            for (int i = 0; i < old.length - 100; i++) old[i].delete();
          }
          try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
        while (bounds.outWidth / options.inSampleSize > 800 || bounds.outHeight / options.inSampleSize > 800) options.inSampleSize *= 2;
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options); if (bitmap == null) return;
        cache.put(source, bitmap); view.post(() -> { if (source.equals(view.getTag())) view.setImageBitmap(bitmap); });
      } catch (Exception ignored) { /* Keep the accessible placeholder; catalog/order usability does not depend on images. */ }
    });
  }
  private byte[] read(InputStream input) throws Exception {
    try (InputStream stream = input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192]; int count;
      while ((count = stream.read(buffer)) != -1) { if (bytes.size() + count > 2 * 1024 * 1024) throw new IOException("image_limit"); bytes.write(buffer, 0, count); }
      return bytes.toByteArray();
    }
  }
}
