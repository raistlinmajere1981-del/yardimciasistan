package com.yardimciasistan.update;

import static org.junit.Assert.*;

import org.junit.Test;

/**
 * Off-device guard for the installer intent contract. The real chooser-vs-installer behavior can
 * only be proven on a device, but the action/type/grant declarations are pure constants and must
 * never drift back to the generic ACTION_VIEW flow.
 */
public class ApkInstallIntentTest {
  @Test public void verifiedApkUsesPackageInstallerInsteadOfGenericViewer() {
    assertEquals("android.intent.action.INSTALL_PACKAGE", ApkInstallIntent.action());
    assertNotEquals("android.intent.action.VIEW", ApkInstallIntent.action());
  }

  @Test public void verifiedApkKeepsInstallerMimeTypeAndReadGrant() {
    assertEquals("application/vnd.android.package-archive", ApkInstallIntent.mimeType());
    assertEquals(0x00000001, ApkInstallIntent.flags());
    assertEquals(0x00000001, ApkInstallIntent.flags() & 0x00000001);
  }
}
