package com.yardimciasistan.android;

final class LocalCompanionProtocol {
  static final int VERSION = 1;
  static final String SERVICE_TYPE = "_yardimciasistan._tcp.";
  static final String STATUS_PATH = "/local/v1/status";
  static final String SUMMARY_PATH = "/local/v1/summary";
  static final String ACTION_PATH = "/local/v1/action";
  static final String PAIR_PATH = "/local/v1/pair";
  static final String DEVICE_ID_HEADER = "X-YA-Device-Id";
  static final String TOKEN_HEADER = "X-YA-Local-Token";

  private LocalCompanionProtocol() {}
}
