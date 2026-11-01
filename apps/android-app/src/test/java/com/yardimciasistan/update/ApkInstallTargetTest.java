package com.yardimciasistan.update;

import static org.junit.Assert.*;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

/** Off-device guard for the system-only installer ranking used before an explicit launch. */
public class ApkInstallTargetTest {
  private static ApkInstallTarget target(String pkg, String activity, boolean system, boolean updated) {
    return new ApkInstallTarget(pkg, activity, system, updated);
  }

  @Test public void thirdPartyHandlerIsNeverSelected() {
    ApkInstallTarget appManager = target(
        "io.github.muntashirakon.AppManager",
        "io.github.muntashirakon.AppManager.apk.installer.PackageInstallerActivity",
        false, false);
    ApkInstallTarget system = target("com.android.packageinstaller", "com.android.packageinstaller.InstallStart", true, false);

    assertEquals(system, ApkInstallTarget.choose(Arrays.asList(appManager, system)));
    assertNull(ApkInstallTarget.choose(Collections.singletonList(appManager)));
    assertNull(ApkInstallTarget.choose(Collections.<ApkInstallTarget>emptyList()));
    assertNull(ApkInstallTarget.choose(null));
  }

  @Test public void updatedSystemHandlerIsEligible() {
    ApkInstallTarget updated = target("com.google.android.packageinstaller", "com.google.android.packageinstaller.InstallStart", true, true);
    assertSame(updated, ApkInstallTarget.choose(Collections.singletonList(updated)));
  }

  @Test public void multipleSystemHandlersResolveDeterministically() {
    ApkInstallTarget vendor = target("com.vendor.installer", "com.vendor.installer.InstallActivity", true, false);
    ApkInstallTarget aosp = target("com.android.packageinstaller", "com.android.packageinstaller.InstallStart", true, false);
    ApkInstallTarget updated = target("com.google.android.packageinstaller", "com.google.android.packageinstaller.InstallStart", true, true);

    assertSame(aosp, ApkInstallTarget.choose(Arrays.asList(vendor, updated, aosp)));
    assertSame(aosp, ApkInstallTarget.choose(Arrays.asList(aosp, updated, vendor)));
  }

  @Test public void incompleteOrBlankCandidatesAreIgnored() {
    assertNull(ApkInstallTarget.choose(Arrays.asList(
        target(null, "activity", true, false),
        target("pkg", null, true, false),
        target(" ", "activity", true, false),
        target("pkg", " ", false, true))));
  }
}
