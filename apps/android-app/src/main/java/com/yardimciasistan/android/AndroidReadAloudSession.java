package com.yardimciasistan.android;

/** Playback ownership is independent of the Android engine, so cancellation can be tested. */
final class AndroidReadAloudSession {
  interface Port {
    boolean available();
    boolean suitable(String text);
    boolean speaking();
    boolean speak(String text);
    void stop();
  }
  private final Port port;
  private Object owner;
  AndroidReadAloudSession(Port port) { this.port = port; }
  boolean visible(String text, boolean authorized) {
    return authorized && port.available() && port.suitable(text);
  }
  boolean click(Object context, String text, boolean authorized) {
    if (owner == context && port.speaking()) { stop(); return true; }
    if (!visible(text, authorized)) return false;
    stop();
    if (!port.speak(text)) return false;
    owner = context;
    return true;
  }
  void dismiss(Object context) { if (owner == context) stop(); }
  void stop() { owner = null; port.stop(); }
}
