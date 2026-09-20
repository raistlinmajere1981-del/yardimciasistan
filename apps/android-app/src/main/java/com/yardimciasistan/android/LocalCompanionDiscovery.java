package com.yardimciasistan.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

final class LocalCompanionDiscovery {
  private static final long DEFAULT_DISCOVERY_WINDOW_MS = 6_000L;

  private final Context context;
  private final SharedPreferences preferences;
  private final NsdManager nsdManager;
  private final Handler handler = new Handler(Looper.getMainLooper());

  private NsdManager.DiscoveryListener discoveryListener;
  private WifiManager.MulticastLock multicastLock;
  private boolean resolving;

  LocalCompanionDiscovery(Context context, SharedPreferences preferences) {
    this.context = context.getApplicationContext();
    this.preferences = preferences;
    this.nsdManager = (NsdManager) this.context.getSystemService(Context.NSD_SERVICE);
  }

  void start() {
    start(DEFAULT_DISCOVERY_WINDOW_MS);
  }

  synchronized void start(long windowMs) {
    if (nsdManager == null || discoveryListener != null) {
      return;
    }

    acquireMulticastLock();
    discoveryListener = new NsdManager.DiscoveryListener() {
      @Override
      public void onDiscoveryStarted(String serviceType) {
        // Discovery is intentionally quiet; a resolved service updates the cache.
      }

      @Override
      public void onServiceFound(NsdServiceInfo serviceInfo) {
        resolveCandidate(serviceInfo);
      }

      @Override
      public void onServiceLost(NsdServiceInfo serviceInfo) {
        // A transient mDNS loss must not erase a paired endpoint. The router
        // clears stale endpoints only after a real TCP failure.
      }

      @Override
      public void onDiscoveryStopped(String serviceType) {
        finishDiscovery(false);
      }

      @Override
      public void onStartDiscoveryFailed(String serviceType, int errorCode) {
        finishDiscovery(true);
      }

      @Override
      public void onStopDiscoveryFailed(String serviceType, int errorCode) {
        finishDiscovery(true);
      }
    };

    try {
      nsdManager.discoverServices(
          LocalCompanionProtocol.SERVICE_TYPE,
          NsdManager.PROTOCOL_DNS_SD,
          discoveryListener
      );
      handler.postDelayed(this::stop, Math.max(1_000L, Math.min(windowMs, 15_000L)));
    } catch (RuntimeException error) {
      finishDiscovery(true);
    }
  }

  synchronized void stop() {
    NsdManager.DiscoveryListener listener = discoveryListener;
    handler.removeCallbacksAndMessages(null);
    if (listener == null || nsdManager == null) {
      releaseMulticastLock();
      return;
    }
    try {
      nsdManager.stopServiceDiscovery(listener);
    } catch (RuntimeException ignored) {
      finishDiscovery(true);
    }
  }

  private synchronized void resolveCandidate(NsdServiceInfo serviceInfo) {
    if (nsdManager == null || resolving || serviceInfo == null) {
      return;
    }
    String type = serviceInfo.getServiceType() == null ? "" : serviceInfo.getServiceType();
    if (!sameServiceType(type, LocalCompanionProtocol.SERVICE_TYPE)) {
      return;
    }

    resolving = true;
    try {
      nsdManager.resolveService(serviceInfo, new NsdManager.ResolveListener() {
        @Override
        public void onServiceResolved(NsdServiceInfo resolved) {
          resolving = false;
          acceptResolvedService(resolved);
        }

        @Override
        public void onResolveFailed(NsdServiceInfo failed, int errorCode) {
          resolving = false;
        }
      });
    } catch (RuntimeException error) {
      resolving = false;
    }
  }

  private void acceptResolvedService(NsdServiceInfo serviceInfo) {
    String protocol = attribute(serviceInfo, "protocol");
    String desktopId = attribute(serviceInfo, "desktop_id");
    if (!String.valueOf(LocalCompanionProtocol.VERSION).equals(protocol)
        || desktopId.isEmpty()) {
      return;
    }

    ConnectionSettings.LocalConnection existing = ConnectionSettings.localConnection(preferences);
    if (!existing.localToken.isEmpty()
        && !existing.desktopId.isEmpty()
        && !existing.desktopId.equals(desktopId)) {
      return;
    }

    InetAddress host = serviceInfo.getHost();
    int port = serviceInfo.getPort();
    if (host == null || port <= 0 || port > 65535) {
      return;
    }

    String hostText = host.getHostAddress();
    if (hostText == null || hostText.trim().isEmpty()) {
      return;
    }
    int zoneIndex = hostText.indexOf('%');
    if (zoneIndex >= 0) {
      hostText = hostText.substring(0, zoneIndex);
    }
    if (host instanceof Inet6Address) {
      hostText = "[" + hostText + "]";
    }

    if (ConnectionSettings.storeDiscoveredLocalEndpoint(
        preferences,
        desktopId,
        "http://" + hostText + ":" + port
    )) {
      stop();
    }
  }

  private static String attribute(NsdServiceInfo serviceInfo, String key) {
    try {
      Map<String, byte[]> attributes = serviceInfo.getAttributes();
      byte[] value = attributes == null ? null : attributes.get(key);
      return value == null ? "" : new String(value, StandardCharsets.UTF_8).trim();
    } catch (RuntimeException ignored) {
      return "";
    }
  }

  private static boolean sameServiceType(String left, String right) {
    String a = left == null ? "" : left.trim().toLowerCase(java.util.Locale.US);
    String b = right == null ? "" : right.trim().toLowerCase(java.util.Locale.US);
    if (a.endsWith(".")) a = a.substring(0, a.length() - 1);
    if (b.endsWith(".")) b = b.substring(0, b.length() - 1);
    return a.equals(b);
  }

  private synchronized void finishDiscovery(boolean releaseImmediately) {
    discoveryListener = null;
    resolving = false;
    handler.removeCallbacksAndMessages(null);
    if (releaseImmediately) {
      releaseMulticastLock();
    } else {
      releaseMulticastLock();
    }
  }

  private void acquireMulticastLock() {
    try {
      WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
      if (wifi == null) return;
      multicastLock = wifi.createMulticastLock("yardimci-asistan-local-discovery");
      multicastLock.setReferenceCounted(false);
      multicastLock.acquire();
    } catch (RuntimeException ignored) {
      multicastLock = null;
    }
  }

  private void releaseMulticastLock() {
    try {
      if (multicastLock != null && multicastLock.isHeld()) {
        multicastLock.release();
      }
    } catch (RuntimeException ignored) {
      // Discovery cleanup must remain best-effort.
    } finally {
      multicastLock = null;
    }
  }
}
