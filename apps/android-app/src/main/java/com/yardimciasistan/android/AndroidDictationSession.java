package com.yardimciasistan.android;

/** Pure lifecycle owner used by the native field binding and fake recorder/HTTP tests. */
final class AndroidDictationSession {
  enum State { IDLE, PERMISSION, RECORDING, UPLOADING, PREVIEW, CLOSED }
  interface Port {
    boolean allowed();
    void requestPermission(long revision);
    void startRecording() throws Exception;
    long stopRecording() throws Exception;
    void discardRecording();
    void upload(long revision);
    void cancelUpload();
    void show(State state, String message, String transcript);
    void replaceText(String text);
  }
  private final Port port;
  private State state = State.IDLE;
  private long revision;
  private boolean foreground = true;
  private boolean permissionGranted;

  AndroidDictationSession(Port port) { this.port = port; }
  State state() { return state; }
  boolean awaiting(long ticket) { return ticket == revision && state == State.UPLOADING; }

  void resume() {
    foreground = true;
    if (state == State.PERMISSION && permissionGranted) permissionResult(revision, true);
  }

  void pause() {
    foreground = false;
    // Android's own permission prompt may pause its owner. Never capture there;
    // a real onStop, dismissal or cancellation still fences the permission result.
    if (state != State.PERMISSION) cancel("Dikte arka plana geçildiği için iptal edildi.");
  }

  void background() { foreground = false; cancel("Dikte arka plana geçildiği için iptal edildi."); }

  void start() {
    if (state == State.CLOSED || state == State.PERMISSION || state == State.RECORDING || state == State.UPLOADING) return;
    if (!foreground || !port.allowed()) { cancel("Dikte için güncel cihaz yetkisi ve internet bağlantısı gerekli."); return; }
    cancel("");
    state = State.PERMISSION;
    show("Mikrofon izni bekleniyor.", "");
    port.requestPermission(revision);
  }

  void permissionResult(long ticket, boolean granted) {
    if (ticket != revision || state != State.PERMISSION) return;
    if (!granted) { cancel("Mikrofon izni verilmedi. Android uygulama izinlerinden açabilirsiniz."); return; }
    permissionGranted = true;
    if (!foreground) return;
    if (!port.allowed()) { cancel("Dikte yetkisi veya bağlantı değişti."); return; }
    try {
      state = State.RECORDING;
      port.startRecording();
      show("Kayıt sürüyor. Yalnız Durdur metne çevirir; en fazla 2 dakika / 5 MiB.", "");
    } catch (Exception ignored) { cancel("Mikrofon kaydı başlatılamadı."); }
  }

  void stop() {
    if (state != State.RECORDING) return;
    if (!port.allowed()) { cancel("Dikte yetkisi veya bağlantı değişti."); return; }
    try {
      long size = port.stopRecording();
      if (size <= 0 || size > AndroidVoiceRules.MAX_AUDIO_BYTES) {
        cancel("Kayıt boş veya 5 MiB sınırını aşıyor."); return;
      }
      state = State.UPLOADING;
      show("Ses Hosting üzerinden metne çevriliyor…", "");
      port.upload(revision);
    } catch (Exception ignored) { cancel("Ses kaydı okunamadı. Daha uzun bir kayıt deneyin."); }
  }

  void completed(long ticket, String text) {
    if (ticket != revision || state != State.UPLOADING) return;
    port.discardRecording();
    if (!port.allowed()) { cancel("Dikte yetkisi veya bağlantı değişti; yanıt kullanılmadı."); return; }
    if (text == null || text.length() > AndroidVoiceRules.MAX_TEXT_CHARS) { cancel("Ses metni okunamadı."); return; }
    state = State.PREVIEW;
    show(text.trim().isEmpty() ? "Kayıtta konuşma metni bulunamadı." : "Metni düzenleyip Metni Kullan'a dokunun.", text);
  }

  void failed(long ticket, String message) {
    if (ticket == revision && state == State.UPLOADING) cancel(message);
  }

  void useText(String edited) {
    if (state != State.PREVIEW) return;
    if (!port.allowed()) { cancel("Dikte yetkisi veya bağlantı değişti; metin kullanılmadı."); return; }
    if (edited == null || edited.trim().isEmpty() || edited.length() > AndroidVoiceRules.MAX_TEXT_CHARS) return;
    port.replaceText(edited);
    cancel("Metin alana aktarıldı. Göndermek veya kaydetmek için mevcut işlemi kullanın.");
  }

  void cancel(String message) {
    if (state == State.CLOSED) return;
    revision++;
    permissionGranted = false;
    port.cancelUpload();
    port.discardRecording();
    state = State.IDLE;
    show(message, "");
  }

  void close() {
    cancel("");
    state = State.CLOSED;
    show("", "");
  }

  private void show(String message, String transcript) { port.show(state, message, transcript); }
}
