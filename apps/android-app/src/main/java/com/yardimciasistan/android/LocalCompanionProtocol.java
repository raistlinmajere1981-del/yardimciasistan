package com.yardimciasistan.android;

final class LocalCompanionProtocol {
  static final int VERSION = 1;
  static final String SERVICE_TYPE = "_yardimciasistan._tcp.";
  static final String STATUS_PATH = "/local/v1/status";
  static final String SUMMARY_PATH = "/local/v1/summary";
  static final String ACTION_PATH = "/local/v1/action";
  static final String BENEFITS_BALANCE_PATH = "/local/v1/benefits-balance";
  static final String CUSTOMER_SALE_PREVIEW_PATH = "/local/v1/customer-sale-preview";
  static final String POINT_SPEND_QUOTE_PATH = "/local/v1/point-spend-quote";
  static final String COUPON_ATTEMPT_PATH = "/local/v1/coupon-attempt";
  static final String PAIR_PATH = "/local/v1/pair";
  static final String DEVICE_ID_HEADER = "X-YA-Device-Id";
  static final String TOKEN_HEADER = "X-YA-Local-Token";

  private LocalCompanionProtocol() {}
}
