package com.yardimciasistan.update;

import java.util.List;

/**
 * Pure, Android-free ranking of activities that can handle APK installation.
 *
 * <p>The trust boundary is the caller's mapping of {@code ApplicationInfo.FLAG_SYSTEM} and
 * {@code ApplicationInfo.FLAG_UPDATED_SYSTEM_APP}. Anything else (for example a user-installed
 * APK manager) is never eligible, so the updater cannot silently hand installation to a
 * third-party handler. Selection is deterministic: package name, then activity name.
 */
public final class ApkInstallTarget {
  public final String packageName;
  public final String activityName;
  public final boolean system;
  public final boolean updatedSystem;

  public ApkInstallTarget(String packageName, String activityName, boolean system, boolean updatedSystem) {
    this.packageName = packageName;
    this.activityName = activityName;
    this.system = system;
    this.updatedSystem = updatedSystem;
  }

  /** Returns the trusted handler, or {@code null} when no system handler advertises the action. */
  public static ApkInstallTarget choose(List<ApkInstallTarget> candidates) {
    if (candidates == null) return null;
    ApkInstallTarget best = null;
    for (ApkInstallTarget candidate : candidates) {
      if (!candidate.isUsable()) continue;
      if (best == null || compare(candidate, best) < 0) best = candidate;
    }
    return best;
  }

  private boolean isUsable() {
    return (system || updatedSystem)
        && packageName != null && !packageName.trim().isEmpty()
        && activityName != null && !activityName.trim().isEmpty();
  }

  private static int compare(ApkInstallTarget first, ApkInstallTarget second) {
    int byPackage = first.packageName.compareTo(second.packageName);
    return byPackage != 0 ? byPackage : first.activityName.compareTo(second.activityName);
  }
}
