package com.yardimciasistan.update;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import java.util.ArrayList;
import java.util.List;

/**
 * Intent contract that hands a hash- and signature-verified APK to the system package installer.
 *
 * <p>{@link Intent#ACTION_VIEW} on an APK is handled by every APK/file viewer and
 * {@link Intent#ACTION_INSTALL_PACKAGE} can be advertised by third-party package managers too, so
 * implicit resolution shows a chooser or can open the wrong app. The updater therefore queries the
 * handlers, keeps only system/updated-system applications, and pins the chosen component
 * explicitly. The installer still shows its own confirmation UI and keeps the unknown-source
 * permission gate; nothing is installed silently.
 */
public final class ApkInstallIntent {
  /** FileProvider content URI must be readable by the installer through a temporary grant. */
  private static final int READ_GRANT_FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION;
  private static final String APK_MIME = "application/vnd.android.package-archive";

  private ApkInstallIntent() {}

  /** Package-installer action, kept queryable for off-device regression tests. */
  public static String action() {
    return Intent.ACTION_INSTALL_PACKAGE;
  }

  public static String mimeType() {
    return APK_MIME;
  }

  public static int flags() {
    return READ_GRANT_FLAGS;
  }

  /**
   * Builds an explicit, consent-based install intent for an already verified FileProvider URI.
   *
   * @throws SystemInstallerUnavailableException when no system/updated-system installer is visible
   *     or querying fails; callers must fail closed instead of falling back to an implicit intent.
   */
  public static Intent forVerifiedApk(PackageManager manager, Uri apkUri)
      throws SystemInstallerUnavailableException {
    Intent intent = new Intent(action());
    intent.setDataAndType(apkUri, mimeType());
    intent.addFlags(flags());
    List<ResolveInfo> handlers;
    try {
      handlers = manager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);
    } catch (RuntimeException error) {
      throw new SystemInstallerUnavailableException("Installer query failed", error);
    }
    List<ApkInstallTarget> targets = new ArrayList<>();
    if (handlers != null) {
      for (ResolveInfo handler : handlers) {
        ApkInstallTarget target = targetOf(handler);
        if (target != null) targets.add(target);
      }
    }
    ApkInstallTarget target = ApkInstallTarget.choose(targets);
    if (target == null) {
      throw new SystemInstallerUnavailableException("No system package installer available");
    }
    intent.setClassName(target.packageName, target.activityName);
    return intent;
  }

  private static ApkInstallTarget targetOf(ResolveInfo handler) {
    ActivityInfo activity = handler == null ? null : handler.activityInfo;
    ApplicationInfo application = activity == null ? null : activity.applicationInfo;
    if (application == null || activity.packageName == null || activity.name == null) return null;
    int applicationFlags = application.flags;
    return new ApkInstallTarget(
        activity.packageName,
        activity.name,
        (applicationFlags & ApplicationInfo.FLAG_SYSTEM) != 0,
        (applicationFlags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0);
  }

  /** Fail-closed signal: no trusted system installer, so no install activity was started. */
  public static final class SystemInstallerUnavailableException extends Exception {
    public SystemInstallerUnavailableException(String message) {
      super(message);
    }

    public SystemInstallerUnavailableException(String message, Throwable cause) {
      super(message, cause);
    }
  }
}
