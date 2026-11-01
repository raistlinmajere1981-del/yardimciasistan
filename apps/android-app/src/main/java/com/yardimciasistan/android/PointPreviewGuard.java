package com.yardimciasistan.android;

/** Ephemeral request scope; never serialized or used as spending authority. */
final class PointPreviewGuard {
  private final ConnectionSettings.LocalConnection pairing;
  private final boolean localOnly;
  private final String target, customer;
  private final long generation;

  PointPreviewGuard(ConnectionSettings.LocalConnection pairing, boolean localOnly, String target, String customer, long generation) {
    this.pairing = pairing; this.localOnly = localOnly; this.target = target; this.customer = customer; this.generation = generation;
  }

  static boolean available(ConnectionSettings.LocalConnection pairing, boolean localActive, boolean capability) {
    return pairing != null && pairing.isComplete() && localActive && capability;
  }

  boolean matches(ConnectionSettings.LocalConnection current, boolean mode, String currentTarget, String currentCustomer,
      long currentGeneration, boolean showing, boolean capability) {
    return available(current, true, capability) && showing && mode == localOnly && target.equals(currentTarget)
        && customer.equals(currentCustomer) && generation == currentGeneration
        && pairing.desktopId.equals(current.desktopId) && pairing.baseUrl.equals(current.baseUrl)
        && pairing.localToken.equals(current.localToken) && pairing.spkiSha256.equals(current.spkiSha256)
        && pairing.targetKey.equals(current.targetKey);
  }
}
