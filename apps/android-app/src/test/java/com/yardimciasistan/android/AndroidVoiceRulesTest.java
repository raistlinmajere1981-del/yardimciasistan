package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;

public final class AndroidVoiceRulesTest {
  private static final String DEVICE = "voice-test-device";
  private static final String CREDENTIAL = "device:yat_" + new String(new char[64]).replace('\0', 'a');

  private OperationData parse(boolean android, boolean ai, boolean active, boolean dictation, Boolean available) throws Exception {
    JSONObject root = new JSONObject();
    JSONArray caps = new JSONArray();
    if (android) caps.put("service.android");
    if (ai) caps.put("service.ai");
    root.put("business_capabilities", caps);
    JSONArray permissions = new JSONArray().put("customer.view").put("settings.edit");
    if (dictation) permissions.put("voice.dictation");
    root.put("androidPermissions", new JSONObject().put(DEVICE, new JSONObject()
        .put("role", "admin").put("is_active", active).put("permissions", permissions)));
    if (available != null) root.put("voice", new JSONObject().put("stt_available", available));
    return OperationData.fromJson(root, DEVICE);
  }

  @Test public void dictationNeedsDedicatedGrantCapabilitiesSavedStatusFreshConnectionAndPersonalToken() throws Exception {
    OperationData ready = parse(true, true, true, true, true);
    assertTrue(AndroidVoiceRules.canDictate(ready, true, true, "https://hosting.example/module", CREDENTIAL));
    for (OperationData denied : new OperationData[] {
        parse(false, true, true, true, true), parse(true, false, true, true, true),
        parse(true, true, false, true, true), parse(true, true, true, false, true),
        parse(true, true, true, true, false), parse(true, true, true, true, null) }) {
      assertFalse(AndroidVoiceRules.canDictate(denied, true, true, "https://hosting.example/module", CREDENTIAL));
    }
    assertFalse(AndroidVoiceRules.canDictate(ready, false, true, "https://hosting.example", CREDENTIAL));
    assertFalse(AndroidVoiceRules.canDictate(ready, true, false, "https://hosting.example", CREDENTIAL));
    assertFalse(AndroidVoiceRules.canDictate(ready, true, true, "http://192.168.1.10", CREDENTIAL));
    assertFalse(AndroidVoiceRules.canDictate(ready, true, true, "https://hosting.example", "shared-secret"));
    assertFalse(AndroidVoiceRules.httpsHosting("https://user:password@hosting.example"));
    assertFalse(AndroidVoiceRules.httpsHosting("https://hosting.example?token=private"));
    assertFalse(AndroidVoiceRules.httpsHosting("https://hosting.example#private"));
    JSONObject malformed = new JSONObject().put("business_capabilities", new JSONArray().put("service.android").put("service.ai"))
        .put("voice", new JSONObject().put("stt_available", "true"));
    assertFalse(OperationData.fromJson(malformed, DEVICE).sttAvailable);
  }

  @Test public void localSpeechDefaultIsConditionalAndKnownSecretTextIsExcluded() {
    assertTrue(AndroidVoiceRules.ttsEnabled(null, true));
    assertFalse(AndroidVoiceRules.ttsEnabled(null, false));
    assertFalse(AndroidVoiceRules.ttsEnabled(false, true));
    assertFalse(AndroidVoiceRules.ttsEnabled(true, false));
    assertTrue(AndroidVoiceRules.readableText("Müşteri talebi için hazır yanıt."));
    assertFalse(AndroidVoiceRules.readableText(""));
    assertFalse(AndroidVoiceRules.readableText("şifre: özel"));
    assertFalse(AndroidVoiceRules.readableText(CREDENTIAL));
    assertFalse(AndroidVoiceRules.readableText(new String(new char[4001]).replace('\0', 'x')));
  }

  @Test public void notModifiedAvailabilityNeverReusesAnOldOrMalformedHint() throws Exception {
    OperationData data = parse(true, true, true, true, true);
    data.applyVoiceProjection(new JSONObject().put("not_modified", true).put("voice", new JSONObject().put("stt_available", false)));
    assertFalse(data.sttAvailable);
    data.applyVoiceProjection(new JSONObject().put("voice", new JSONObject().put("stt_available", true)));
    assertTrue(data.sttAvailable);
    data.applyVoiceProjection(new JSONObject().put("not_modified", true));
    assertFalse(data.sttAvailable);
    data.applyVoiceProjection(new JSONObject().put("voice", new JSONObject().put("stt_available", "true")));
    assertFalse(data.sttAvailable);
  }

  @Test public void speakerIsOptInAndStopsOnOwnerDismissCancelAndSettingsWithdrawal() {
    SpeechPort port = new SpeechPort();
    AndroidReadAloudSession speech = new AndroidReadAloudSession(port);
    Object dialog = new Object();
    assertEquals(0, port.calls);
    assertTrue(speech.visible("Yanıt metni", true));
    port.enabled = false;
    assertFalse(speech.visible("Yanıt metni", true));
    assertFalse(speech.click(dialog, "Yanıt metni", true));
    port.enabled = true; port.engine = false;
    assertFalse(speech.visible("Yanıt metni", true));
    port.engine = true; port.voice = false;
    assertFalse(speech.visible("Yanıt metni", true));
    port.voice = true;
    assertFalse(speech.click(dialog, "şifre: özel", true));
    assertFalse(speech.click(dialog, "Yanıt metni", false));
    assertTrue(speech.click(dialog, "Yanıt metni", true));
    assertEquals(1, port.calls);
    speech.dismiss(new Object()); assertTrue(port.playing);
    speech.dismiss(dialog); assertFalse(port.playing);
    speech.click(dialog, "Yanıt metni", true); speech.stop(); assertFalse(port.playing);
    speech.click(dialog, "Yanıt metni", true); speech.click(dialog, "Yanıt metni", true); assertFalse(port.playing);
    port.enabled = false; speech.stop(); assertFalse(speech.visible("Yanıt metni", true));
  }

  private static final class SpeechPort implements AndroidReadAloudSession.Port {
    boolean enabled = true, engine = true, voice = true, playing;
    int calls;
    @Override public boolean available() { return AndroidVoiceRules.ttsEnabled(enabled, engine) && voice; }
    @Override public boolean suitable(String text) { return AndroidVoiceRules.readableText(text); }
    @Override public boolean speaking() { return playing; }
    @Override public boolean speak(String text) { calls++; playing = true; return true; }
    @Override public void stop() { playing = false; }
  }
}
