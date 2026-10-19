package com.yardimciasistan.android;

import android.app.Dialog;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.AdapterView;
import androidx.activity.ComponentActivity;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.function.BooleanSupplier;

/** Android's installed local voices only. No remote adapter or synchronized preference. */
final class AndroidLocalSpeech {
  private static final String ENABLED = "local_tts_enabled_v1";
  private static final String ENGINE = "local_tts_engine_v1";
  private static final String VOICE = "local_tts_voice_v1";
  private static final String RATE = "local_tts_rate_v1";
  private static final String PITCH = "local_tts_pitch_v1";
  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final Runnable changed;
  private final List<Voice> voices = new ArrayList<>();
  private final List<Speaker> speakers = new ArrayList<>();
  private final AndroidReadAloudSession playback;
  private TextToSpeech tts;
  private boolean ready;
  private boolean closed;
  private int generation;

  AndroidLocalSpeech(ComponentActivity activity, SharedPreferences preferences, Runnable changed) {
    this.activity = activity;
    this.preferences = preferences;
    this.changed = changed;
    playback = new AndroidReadAloudSession(new AndroidReadAloudSession.Port() {
      @Override public boolean available() { return enabled() && selectedVoice() != null; }
      @Override public boolean suitable(String text) { return AndroidLocalSpeech.this.suitable(text); }
      @Override public boolean speaking() { return tts != null && tts.isSpeaking(); }
      @Override public boolean speak(String text) {
        try {
          return tts.setVoice(selectedVoice()) == TextToSpeech.SUCCESS
              && tts.setSpeechRate(preferences.getFloat(RATE, 1f)) == TextToSpeech.SUCCESS
              && tts.setPitch(preferences.getFloat(PITCH, 1f)) == TextToSpeech.SUCCESS
              && tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "companion-read-aloud") == TextToSpeech.SUCCESS;
        } catch (RuntimeException ignored) { return false; }
      }
      @Override public void stop() {
        if (tts != null) try { tts.stop(); } catch (RuntimeException ignored) { /* Engine disconnected. */ }
      }
    });
    initialize();
  }

  private void initialize() {
    stop();
    if (tts != null) tts.shutdown();
    ready = false;
    voices.clear();
    int ticket = ++generation;
    String engine = preferences.getString(ENGINE, "");
    tts = new TextToSpeech(activity, status -> activity.runOnUiThread(() -> {
      if (closed || ticket != generation) return;
      ready = status == TextToSpeech.SUCCESS;
      refreshVoices();
      changed.run();
    }), engine.isEmpty() ? null : engine);
  }

  void refreshVoices() {
    voices.clear();
    try {
      String selectedEngine = preferences.getString(ENGINE, "");
      if (!selectedEngine.isEmpty() && tts.getEngines().stream().noneMatch(e -> selectedEngine.equals(e.name))) ready = false;
      if (ready && tts.getVoices() != null) {
        for (Voice voice : tts.getVoices()) {
          if (!voice.isNetworkConnectionRequired()
              && (voice.getFeatures() == null || !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))
              && tts.isLanguageAvailable(voice.getLocale()) >= TextToSpeech.LANG_AVAILABLE) voices.add(voice);
        }
      }
      voices.sort(Comparator.comparing((Voice v) -> v.getLocale().toLanguageTag()).thenComparing(Voice::getName));
    } catch (RuntimeException ignored) { ready = false; voices.clear(); }
    refreshButtons();
  }

  private Voice selectedVoice() {
    String saved = preferences.getString(VOICE, "");
    if (!saved.isEmpty()) {
      for (Voice voice : voices) if (saved.equals(voice.getName())) return voice;
      return null;
    }
    for (Voice voice : voices) if (Locale.getDefault().getLanguage().equals(voice.getLocale().getLanguage())) return voice;
    return voices.isEmpty() ? null : voices.get(0);
  }

  private boolean enabled() {
    Boolean saved = preferences.contains(ENABLED) ? preferences.getBoolean(ENABLED, false) : null;
    return AndroidVoiceRules.ttsEnabled(saved, ready && !voices.isEmpty());
  }

  private boolean suitable(String text) {
    String credential = ConnectionSettings.syncSecret(preferences);
    String token = ConnectionSettings.deviceToken(credential);
    return AndroidVoiceRules.readableText(text)
        && (credential.isEmpty() || !text.contains(credential)) && (token.isEmpty() || !text.contains(token));
  }

  void addSpeaker(Dialog dialog, LinearLayout parent, String text, BooleanSupplier authorized) {
    Button button = UiKit.outlineButton(activity, "🔊 Seslendir", v -> {
      if (dialog.isShowing() && !playback.click(dialog, text, authorized.getAsBoolean())) {
        android.widget.Toast.makeText(activity, "Yerel seslendirme başlatılamadı.", android.widget.Toast.LENGTH_SHORT).show();
      }
    });
    speakers.add(new Speaker(dialog, button, text, authorized));
    parent.addView(button);
    refreshButtons();
  }

  void dismiss(Dialog dialog) {
    playback.dismiss(dialog);
    speakers.removeIf(s -> s.dialog == dialog);
  }

  void refreshButtons() {
    for (Speaker speaker : speakers) speaker.button.setVisibility(playback.visible(speaker.text,
        speaker.authorized.getAsBoolean()) ? View.VISIBLE : View.GONE);
  }

  void stop() {
    playback.stop();
  }

  void destroy() {
    closed = true;
    generation++;
    stop();
    if (tts != null) tts.shutdown();
    speakers.clear();
  }

  View settingsView() {
    LinearLayout card = UiKit.card(activity);
    card.addView(UiKit.text(activity, "Yerel seslendirme", 15, UiKit.TEXT, Typeface.BOLD));
    // API 26+ native control, styled by UiKit; keep the established native appearance.
    @android.annotation.SuppressLint("UseSwitchCompatOrMaterialCode")
    Switch toggle = new Switch(activity);
    UiKit.styleSwitch(toggle);
    toggle.setText(R.string.speech_enabled);
    toggle.setChecked(enabled());
    toggle.setEnabled(ready && !voices.isEmpty());
    toggle.setOnCheckedChangeListener((b, value) -> {
      preferences.edit().putBoolean(ENABLED, value).apply();
      stop();
      refreshButtons();
    });
    card.addView(toggle);
    card.addView(UiKit.text(activity, ready && !voices.isEmpty()
        ? "Telefonda çalışır. Yalnız Seslendir'e dokunduğunuz metin okunur."
        : "Kullanılabilir yüklü yerel ses yok. Android metin okuma ayarlarından motor ve dil verisi yükleyin.",
        12, UiKit.SECONDARY, Typeface.NORMAL));
    if (tts != null) {
      List<String> engineIds = new ArrayList<>();
      List<String> engineLabels = new ArrayList<>();
      engineIds.add(""); engineLabels.add("Android varsayılan motoru");
      for (TextToSpeech.EngineInfo engine : tts.getEngines()) { engineIds.add(engine.name); engineLabels.add(engine.label); }
      addSelector(card, "Ses motoru", engineLabels, engineIds.indexOf(preferences.getString(ENGINE, "")), index -> {
        if (engineIds.get(index).equals(preferences.getString(ENGINE, ""))) return;
        preferences.edit().putString(ENGINE, engineIds.get(index)).remove(VOICE).apply();
        initialize();
      });
    }
    if (!voices.isEmpty()) {
      List<String> labels = new ArrayList<>();
      for (Voice voice : voices) labels.add(voice.getLocale().getDisplayName() + " · " + voice.getName());
      Voice selected = selectedVoice();
      if (selected == null) { labels.add(0, "Seçilen ses artık yüklü değil; bir ses seçin"); }
      boolean missing = selected == null;
      addSelector(card, "Dil / yüklü ses", labels, missing ? 0 : voices.indexOf(selected), index -> {
        if (missing && index == 0) return;
        String name = voices.get(missing ? index - 1 : index).getName();
        if (name.equals(preferences.getString(VOICE, ""))) return;
        preferences.edit().putString(VOICE, name).apply();
        stop(); refreshButtons();
      });
      addRange(card, "Hız", RATE);
      addRange(card, "Ton", PITCH);
    }
    return card;
  }

  private void addSelector(LinearLayout card, String label, List<String> values, int selected,
      java.util.function.IntConsumer change) {
    card.addView(UiKit.text(activity, label, 12, UiKit.MUTED, Typeface.BOLD));
    Spinner spinner = new Spinner(activity);
    spinner.setContentDescription(label);
    ArrayAdapter<String> adapter = new ArrayAdapter<>(activity, android.R.layout.simple_spinner_item, values);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter);
    spinner.setSelection(Math.max(0, selected));
    spinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
      private boolean initial = true;
      @Override public void onItemSelected(AdapterView<?> p, View v, int position, long id) {
        if (initial) { initial = false; if (position == Math.max(0, selected)) return; }
        change.accept(position);
      }
      @Override public void onNothingSelected(AdapterView<?> p) {}
    });
    card.addView(spinner);
  }

  private void addRange(LinearLayout card, String label, String key) {
    TextView value = UiKit.text(activity, "", 12, UiKit.MUTED, Typeface.NORMAL);
    SeekBar bar = new SeekBar(activity);
    bar.setContentDescription(label);
    bar.setMax(150);
    bar.setProgress(Math.round((preferences.getFloat(key, 1f) - .5f) * 100));
    value.setText(activity.getString(R.string.speech_range_value, label, .5f + bar.getProgress() / 100f));
    bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
      @Override public void onProgressChanged(SeekBar b, int progress, boolean user) {
        float next = .5f + progress / 100f;
        value.setText(activity.getString(R.string.speech_range_value, label, next));
        if (user) { preferences.edit().putFloat(key, next).apply(); stop(); }
      }
      @Override public void onStartTrackingTouch(SeekBar b) {}
      @Override public void onStopTrackingTouch(SeekBar b) {}
    });
    card.addView(value); card.addView(bar);
  }

  private static final class Speaker {
    final Dialog dialog; final Button button; final String text; final BooleanSupplier authorized;
    Speaker(Dialog dialog, Button button, String text, BooleanSupplier authorized) {
      this.dialog = dialog; this.button = button; this.text = text; this.authorized = authorized;
    }
  }
}
