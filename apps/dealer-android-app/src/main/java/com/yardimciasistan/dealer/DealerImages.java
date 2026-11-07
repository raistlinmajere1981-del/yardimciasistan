package com.yardimciasistan.dealer;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;
import androidx.exifinterface.media.ExifInterface;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Public HTTPS pictures and private local comparison files. Never attaches dealer cookies. */
final class DealerImages {
  interface Callback {
    void done(Bitmap bitmap, String error);
  }
  private interface Decode {
    Bitmap run(Request request) throws Exception;
  }
  static final long MAX_BYTES = 30L * 1024 * 1024;
  private final ThreadPoolExecutor executor = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS,
      new ArrayBlockingQueue<>(32), new ThreadPoolExecutor.AbortPolicy());
  private final Set<Request> requests = Collections.synchronizedSet(new HashSet<>());
  private final Handler main = new Handler(Looper.getMainLooper());
  private final Context context;
  private final File directory;
  private final File brandDirectory;
  private boolean closed;
  private final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(6 * 1024 * 1024) {
    @Override
    protected int sizeOf(String key, Bitmap value) {
      return value.getByteCount();
    }
  };
  final class Request {
    volatile boolean cancelled;
    volatile HttpURLConnection connection;
    Future<?> future;
    void cancel() {
      cancelled = true;
      if (future != null)
        future.cancel(true);
      if (connection != null)
        connection.disconnect();
      requests.remove(this);
      executor.purge();
    }
    void check() throws InterruptedIOException {
      if (cancelled || Thread.currentThread().isInterrupted())
        throw new InterruptedIOException();
    }
  }
  DealerImages(Context context) {
    this.context = context.getApplicationContext();
    directory = new File(context.getCacheDir(), "catalog-images");
    directory.mkdirs();
    brandDirectory = new File(context.getFilesDir(), "dealer-brand-logos");
    brandDirectory.mkdirs();
  }
  void close() {
    closed = true;
    Request[] pending;
    synchronized (requests) {
      pending = requests.toArray(new Request[0]);
    }
    for (Request request : pending) request.cancel();
    executor.shutdownNow();
    cache.evictAll();
  }
  void load(ImageView view, String source) {
    view.setTag(source);
    if (source.isEmpty())
      return;
    Bitmap cached = cache.get(source);
    if (cached != null) {
      view.setImageBitmap(cached);
      return;
    }
    java.lang.ref.WeakReference<ImageView> reference = new java.lang.ref.WeakReference<>(view);
    remote(source, 384, (bitmap, error) -> {
      if (bitmap == null)
        return;
      cache.put(source, bitmap);
      ImageView target = reference.get();
      if (target != null && source.equals(target.getTag()))
        target.setImageBitmap(bitmap);
    });
  }
  // Logos remain in the app's own files (not evictable cache) for offline openings.
  void loadBrand(ImageView view, String source) {
    view.setTag(source);
    Bitmap cached = cache.get(source);
    if (cached != null) { view.setImageBitmap(cached); return; }
    java.lang.ref.WeakReference<ImageView> reference = new java.lang.ref.WeakReference<>(view);
    request(r -> {
      File local = new File(brandDirectory, cacheFile(source).getName());
      if (!local.isFile()) {
        File downloaded = download(source, r);
        if (downloaded.length() > 2 * 1024 * 1024L) throw new IOException();
        File temporary = File.createTempFile("brand-", ".part", brandDirectory);
        try {
          r.check();
          java.nio.file.Files.copy(downloaded.toPath(), temporary.toPath(),
              java.nio.file.StandardCopyOption.REPLACE_EXISTING);
          r.check();
          if (!temporary.renameTo(local)) throw new IOException();
        } finally { temporary.delete(); }
      }
      if (local.length() < 1 || local.length() > 2 * 1024 * 1024L) throw new IOException();
      return decode(local, 384, r);
    }, (bitmap, error) -> {
      if (bitmap == null) return;
      cache.put(source, bitmap);
      ImageView target = reference.get();
      if (target != null && source.equals(target.getTag())) target.setImageBitmap(bitmap);
    });
  }
  Request remote(String source, int edge, Callback callback) {
    return request(r -> {
      File file = download(source, r);
      try {
        return decode(file, edge, r);
      } catch (InterruptedIOException cancelled) {
        throw cancelled;
      } catch (Exception corrupt) {
        // A retry must be able to replace a corrupt cached response.
        if (!r.cancelled)
          file.delete();
        throw corrupt;
      }
    }, callback);
  }
  Request local(File file, int edge, Callback callback) {
    return request(r -> decode(file, edge, r), callback);
  }
  Request importLocal(Uri uri, File destination, int edge, Callback callback) {
    return request(r -> {
      try (InputStream in = context.getContentResolver().openInputStream(uri)) {
        if (in == null)
          throw new IOException();
        copy(in, destination, r);
      } catch (Exception error) {
        destination.delete();
        throw error;
      }
      return decode(destination, edge, r);
    }, callback);
  }
  // The WebView adapter can only request already-selected catalog URLs. It never receives a URL from JS.
  Request inspectorRequest() {
    Request r = new Request();
    requests.add(r);
    if (closed) r.cancel();
    return r;
  }
  void inspectorImage(String source, File local, File destination, int edge, Request r)
      throws Exception {
    Bitmap bitmap = null;
    try {
      r.check();
      File file = local == null ? download(source, r) : local;
      try {
        bitmap = decode(file, edge, r); // Native bounded decode + EXIF; shared JS owns every filter.
      } catch (InterruptedIOException cancelled) {
        throw cancelled;
      } catch (Exception corrupt) {
        if (local == null && !r.cancelled) file.delete();
        throw corrupt;
      }
      r.check();
      try (OutputStream out = new FileOutputStream(destination)) {
        if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new IOException();
      }
      r.check();
    } catch (Exception | OutOfMemoryError error) {
      destination.delete();
      throw error;
    } finally {
      release(bitmap);
      requests.remove(r);
    }
  }
  private Request request(Decode operation, Callback callback) {
    Request request = new Request();
    if (closed) {
      request.cancelled = true;
      return request;
    }
    requests.add(request);
    try {
      request.future = executor.submit(() -> {
        Bitmap bitmap = null;
        String error = "";
        try {
          request.check();
          bitmap = operation.run(request);
        } catch (OutOfMemoryError exhausted) {
          error = "Fotoğraf bu cihaz için çok büyük. Daha küçük bir fotoğraf seçin.";
        } catch (Exception failure) {
          error = "Fotoğraf açılamadı. Bağlantınızı kontrol edip yeniden deneyin.";
        }
        final Bitmap result = bitmap;
        final String problem = error;
        main.post(() -> {
          requests.remove(request);
          if (request.cancelled || closed) {
            release(result);
            return;
          }
          callback.done(result, problem);
        });
      });
    } catch (RejectedExecutionException full) {
      requests.remove(request);
      main.post(() -> {
        if (!closed && !request.cancelled)
          callback.done(null, "Fotoğraflar hazırlanıyor. Yeniden deneyin.");
      });
    }
    return request;
  }
  File cacheFile(String source) throws Exception {
    StringBuilder hash = new StringBuilder();
    for (byte part : MessageDigest.getInstance("SHA-256").digest(source.getBytes("UTF-8")))
      hash.append(String.format(Locale.ROOT, "%02x", part & 255));
    return new File(directory, hash.toString());
  }
  private File download(String source, Request request) throws Exception {
    URI uri = new URI(source);
    if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
        || uri.getUserInfo() != null)
      throw new IOException();
    File file = cacheFile(source);
    if (file.isFile() && file.length() > 0) {
      file.setLastModified(System.currentTimeMillis());
      return file;
    }
    HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
    request.connection = connection;
    connection.setInstanceFollowRedirects(false);
    connection.setConnectTimeout(8000);
    connection.setReadTimeout(10000);
    connection.setUseCaches(false);
    File temp = File.createTempFile("download-", ".part", directory);
    try {
      request.check();
      if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > MAX_BYTES)
        throw new IOException();
      try (InputStream input = connection.getInputStream()) {
        copy(input, temp, request);
      }
      request.check();
      if (!temp.renameTo(file))
        throw new IOException();
      trim(file);
      return file;
    } finally {
      request.connection = null;
      connection.disconnect();
      temp.delete();
    }
  }
  private void copy(InputStream input, File target, Request request) throws Exception {
    try (OutputStream out = new FileOutputStream(target)) {
      byte[] bytes = new byte[8192];
      int count;
      long length = 0;
      while ((count = input.read(bytes)) != -1) {
        request.check();
        length += count;
        if (length > MAX_BYTES)
          throw new IOException();
        out.write(bytes, 0, count);
      }
      if (length == 0)
        throw new IOException();
    }
  }
  private Bitmap decode(File file, int edge, Request request) throws Exception {
    if (file.length() < 1 || file.length() > MAX_BYTES)
      throw new IOException();
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
    if (!Arrays.asList("image/jpeg", "image/png", "image/webp").contains(bounds.outMimeType))
      throw new IOException("Desteklenmeyen fotoğraf biçimi.");
    BitmapFactory.Options options = new BitmapFactory.Options();
    if (bounds.outWidth < 1 || bounds.outHeight < 1
        || (long) bounds.outWidth * bounds.outHeight > 100_000_000L)
      throw new IOException("Fotoğraf boyutu desteklenmiyor.");
    options.inSampleSize = 1;
    while ((bounds.outWidth + options.inSampleSize - 1) / options.inSampleSize > edge
        || (bounds.outHeight + options.inSampleSize - 1) / options.inSampleSize > edge)
      options.inSampleSize *= 2;
    options.inPreferredConfig = Bitmap.Config.ARGB_8888;
    int orientation = ExifInterface.ORIENTATION_NORMAL;
    try {
      orientation =
          new ExifInterface(file.getAbsolutePath())
              .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
    } catch (
        IOException ignored) { /* Bounds/decode is still authoritative for files without EXIF. */
    }
    for (int attempt = 0; attempt < 3; attempt++) {
      request.check();
      Bitmap bitmap = null;
      try {
        bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (bitmap == null)
          throw new IOException();
        request.check();
        Matrix matrix = new Matrix();
        switch (orientation) {
          case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
            matrix.setScale(-1, 1);
            break;
          case ExifInterface.ORIENTATION_ROTATE_180:
            matrix.setRotate(180);
            break;
          case ExifInterface.ORIENTATION_FLIP_VERTICAL:
            matrix.setScale(1, -1);
            break;
          case ExifInterface.ORIENTATION_TRANSPOSE:
            matrix.setRotate(90);
            matrix.postScale(-1, 1);
            break;
          case ExifInterface.ORIENTATION_ROTATE_90:
            matrix.setRotate(90);
            break;
          case ExifInterface.ORIENTATION_TRANSVERSE:
            matrix.setRotate(270);
            matrix.postScale(-1, 1);
            break;
          case ExifInterface.ORIENTATION_ROTATE_270:
            matrix.setRotate(270);
            break;
          default:
            break;
        }
        if (!matrix.isIdentity()) {
          Bitmap rotated = Bitmap.createBitmap(
              bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
          if (rotated != bitmap) {
            release(bitmap);
            bitmap = rotated;
          }
        }
        return bitmap;
      } catch (OutOfMemoryError exhausted) {
        release(bitmap);
        options.inSampleSize *= 2;
        if (attempt == 2)
          throw exhausted;
      } catch (Exception failure) {
        release(bitmap);
        throw failure;
      }
    }
    throw new IOException();
  }
  private void trim(File keep) {
    File[] files = directory.listFiles((d, name) -> !name.endsWith(".part"));
    if (files == null)
      return;
    Arrays.sort(files, Comparator.comparingLong(File::lastModified));
    long bytes = 0;
    for (File f : files) bytes += f.length();
    int count = files.length;
    for (File f : files) {
      if (bytes <= 64L * 1024 * 1024 && count <= 120)
        break;
      if (f.equals(keep))
        continue;
      long length = f.length();
      if (f.delete()) {
        bytes -= length;
        count--;
      }
    }
  }
  static void release(Bitmap bitmap) {
    if (bitmap != null) {
      synchronized (bitmap) {
        if (!bitmap.isRecycled())
          bitmap.recycle();
      }
    }
  }
}
