package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.junit.Test;

public final class AndroidDictationSessionTest {
  @Test public void permissionPromptPauseDefersCaptureUntilResume() {
    for (boolean resultBeforeResume : new boolean[] { true, false }) {
      Fake port = new Fake(); AndroidDictationSession session = new AndroidDictationSession(port);
      session.start(); long ticket = port.ticket;
      session.pause();
      if (resultBeforeResume) session.permissionResult(ticket, true);
      assertEquals(0, port.starts);
      session.resume();
      if (!resultBeforeResume) session.permissionResult(ticket, true);
      assertEquals(1, port.starts);
      session.pause(); session.resume();
      assertEquals(AndroidDictationSession.State.IDLE, session.state());
      assertEquals(1, port.starts); assertFalse(port.fileExists); assertEquals(0, port.uploads);
    }
  }

  @Test public void permissionResultCannotRestartAfterRealBackgroundDismissOrRevocation() {
    for (int reason = 0; reason < 3; reason++) {
      Fake port = new Fake(); AndroidDictationSession session = new AndroidDictationSession(port);
      session.start(); long ticket = port.ticket; session.pause();
      session.permissionResult(ticket, true);
      if (reason == 0) session.background();
      if (reason == 1) session.close();
      if (reason == 2) port.allowed = false;
      session.resume(); session.permissionResult(ticket, true);
      assertEquals(0, port.starts); assertEquals(0, port.uploads);
    }
  }

  @Test public void pauseDiscardsUploadPreviewAndLatePermissionDenial() {
    Fake port = new Fake(); AndroidDictationSession session = new AndroidDictationSession(port);
    session.start(); long ticket = port.ticket; session.pause(); session.permissionResult(ticket, false);
    session.resume(); assertEquals(0, port.starts); assertTrue(port.message.contains("izni verilmedi"));
    session.start(); session.permissionResult(port.ticket, true); session.stop(); ticket = port.uploadTicket;
    session.pause(); session.resume(); session.completed(ticket, "Geç metin");
    assertEquals(AndroidDictationSession.State.IDLE, session.state()); assertFalse(port.fileExists);
    session.start(); session.permissionResult(port.ticket, true); session.stop(); session.completed(port.uploadTicket, "Önizleme");
    session.pause(); session.resume(); session.useText("Eski önizleme"); assertEquals("", port.field);
  }

  @Test public void explicitStopPreviewEditAndUseNeverSubmitAnAction() {
    Fake port = new Fake(); AndroidDictationSession session = new AndroidDictationSession(port);
    session.start(); assertEquals(0, port.starts);
    session.permissionResult(port.ticket, true); assertEquals(1, port.starts);
    assertEquals(0, port.uploads);
    session.stop(); assertEquals(1, port.uploads);
    session.completed(port.uploadTicket, "İlk metin");
    assertEquals(AndroidDictationSession.State.PREVIEW, session.state());
    assertEquals("", port.field);
    session.useText("Düzenlenmiş metin");
    assertEquals("Düzenlenmiş metin", port.field);
    assertFalse(port.fileExists); assertFalse(port.recording);
  }

  @Test public void deniedPermissionAndCancelHaveVisibleFeedbackAndNoUpload() {
    Fake port = new Fake(); AndroidDictationSession session = new AndroidDictationSession(port);
    session.start(); session.permissionResult(port.ticket, false);
    assertTrue(port.message.contains("izni verilmedi")); assertEquals(0, port.starts); assertEquals(0, port.uploads);
    session.start(); long old = port.ticket; session.cancel("İptal"); session.permissionResult(old, true);
    assertEquals(0, port.starts);
    session.start(); session.permissionResult(port.ticket, true); session.cancel("Arka plan"); session.stop();
    assertEquals(0, port.uploads); assertFalse(port.fileExists); assertFalse(port.recording);
  }

  @Test public void dialogCloseContextChangeAndLateResultsAreFenced() {
    Fake port = new Fake(); AndroidDictationSession session = new AndroidDictationSession(port);
    session.start(); session.permissionResult(port.ticket, true); session.stop();
    long old = port.uploadTicket;
    session.cancel("Ayarlar değişti");
    session.start(); session.permissionResult(port.ticket, true); session.stop();
    session.completed(old, "Eski yanıt");
    assertEquals(AndroidDictationSession.State.UPLOADING, session.state());
    session.failed(old, "Eski hata");
    assertEquals(AndroidDictationSession.State.UPLOADING, session.state());
    session.close(); session.completed(port.uploadTicket, "Geç yanıt"); session.useText("Geç yanıt"); session.start();
    assertEquals(AndroidDictationSession.State.CLOSED, session.state()); assertEquals("", port.field);
    assertFalse(port.fileExists); assertTrue(port.cancels > 0);
  }

  @Test public void offlineRevokedOrChangedSettingsBlockCaptureUploadAndUse() {
    Fake port = new Fake(); AndroidDictationSession session = new AndroidDictationSession(port);
    port.allowed = false; session.start(); assertEquals(0, port.starts); assertEquals(0, port.uploads);
    port.allowed = true; session.start(); port.allowed = false; session.permissionResult(port.ticket, true);
    assertEquals(0, port.starts);
    port.allowed = true; session.start(); session.permissionResult(port.ticket, true); port.allowed = false; session.stop();
    assertEquals(0, port.uploads); assertFalse(port.fileExists);
    port.allowed = true; session.start(); session.permissionResult(port.ticket, true); session.stop();
    session.completed(port.uploadTicket, "Metin"); port.allowed = false; session.useText("Metin"); assertEquals("", port.field);
    port.allowed = true; session.start(); session.permissionResult(port.ticket, true); session.stop();
    port.allowed = false; session.completed(port.uploadTicket, "Yetki sonrası yanıt");
    assertEquals(AndroidDictationSession.State.IDLE, session.state()); assertEquals("", port.field);
  }

  @Test public void recorderErrorsAndLimitsDiscardPrivateTempWithoutApiCall() {
    for (long bytes : new long[] {0, AndroidVoiceRules.MAX_AUDIO_BYTES + 1}) {
      Fake port = new Fake(); port.bytes = bytes; AndroidDictationSession session = new AndroidDictationSession(port);
      session.start(); session.permissionResult(port.ticket, true); session.stop();
      assertEquals(0, port.uploads); assertFalse(port.fileExists);
    }
    Fake port = new Fake(); port.startError = true; AndroidDictationSession session = new AndroidDictationSession(port);
    session.start(); session.permissionResult(port.ticket, true);
    assertFalse(port.fileExists); assertEquals(0, port.uploads);
    port.startError = false; session.start(); session.permissionResult(port.ticket, true); port.stopError = true; session.stop();
    assertFalse(port.fileExists); assertEquals(0, port.uploads);
    port.stopError = false; session.start(); session.permissionResult(port.ticket, true); session.cancel("2 dakika sınırı");
    assertFalse(port.fileExists); assertEquals(0, port.uploads);
  }

  private static final class Fake implements AndroidDictationSession.Port {
    boolean allowed = true, fileExists, recording, startError, stopError;
    long ticket, uploadTicket, bytes = 1024;
    int starts, uploads, cancels;
    String field = "", message = "";
    @Override public boolean allowed() { return allowed; }
    @Override public void requestPermission(long revision) { ticket = revision; }
    @Override public void startRecording() throws Exception {
      starts++; fileExists = true; recording = true;
      if (startError) throw new Exception("fake private error");
    }
    @Override public long stopRecording() throws Exception {
      recording = false; if (stopError) throw new Exception("fake private error"); return bytes;
    }
    @Override public void discardRecording() { fileExists = false; recording = false; }
    @Override public void upload(long revision) { uploads++; uploadTicket = revision; }
    @Override public void cancelUpload() { cancels++; }
    @Override public void show(AndroidDictationSession.State state, String value, String transcript) { message = value; }
    @Override public void replaceText(String value) { field = value; }
  }
}
