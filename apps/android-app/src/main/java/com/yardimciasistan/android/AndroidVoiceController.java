package com.yardimciasistan.android;

import android.Manifest;
import android.app.Dialog;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.media.MediaRecorder;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;

/** Composition of local speech and reusable inline dictation fields in Companion. */
final class AndroidVoiceController {
  private final ComponentActivity activity;
  private final SharedPreferences preferences;
  private final DeviceIdentity identity;
  private final HostingSyncClient client;
  private final Supplier<OperationData> currentData;
  private final AndroidLocalSpeech speech;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService uploads = Executors.newSingleThreadExecutor();
  private final List<Field> fields = new ArrayList<>();
  private final ConnectivityManager connectivity;
  private final File recordingDirectory;
  private final ActivityResultLauncher<String> microphonePermission;
  private final SharedPreferences.OnSharedPreferenceChangeListener preferenceListener;
  private final ConnectivityManager.NetworkCallback networkCallback;
  private Field pendingPermission;
  private long pendingPermissionRevision;
  private boolean foreground;
  private boolean freshAuthority;
  private boolean destroyed;
  private long connectionRevision;
  private String authorityIdentity = "";

  AndroidVoiceController(ComponentActivity activity, SharedPreferences preferences, DeviceIdentity identity,
      HostingSyncClient client, Supplier<OperationData> currentData, Runnable settingsChanged) {
    this.activity = activity;
    this.preferences = preferences;
    this.identity = identity;
    this.client = client;
    this.currentData = currentData;
    this.connectivity = activity.getSystemService(ConnectivityManager.class);
    recordingDirectory = new File(activity.getCacheDir(), "voice-dictation");
    // Cache is excluded from backup. Clean remnants of a killed process before new capture.
    File[] remnants = recordingDirectory.listFiles();
    if (remnants != null) for (File file : remnants) if (file.getName().startsWith("dictation-")) file.delete();
    speech = new AndroidLocalSpeech(activity, preferences, settingsChanged);
    microphonePermission = activity.registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
      Field field = pendingPermission;
      long ticket = pendingPermissionRevision;
      pendingPermission = null;
      if (field != null) field.session.permissionResult(ticket, granted);
    });
    preferenceListener = (p, key) -> {
      if (ConnectionSettings.KEY_WEB_MODULE_URL.equals(key) || ConnectionSettings.KEY_SYNC_SECRET.equals(key)
          || ConnectionSettings.KEY_BOOTSTRAP_TICKET.equals(key)) {
        freshAuthority = false;
        connectionRevision++;
        invalidate("Cihaz bağlantısı değişti. Dikte için veriyi yenileyin.");
      }
    };
    preferences.registerOnSharedPreferenceChangeListener(preferenceListener);
    networkCallback = new ConnectivityManager.NetworkCallback() {
      @Override public void onLost(Network network) { main.post(() -> {
        freshAuthority = false;
        connectionRevision++;
        invalidate("İnternet bağlantısı kesildi. Dikte iptal edildi.");
      }); }
      @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
        main.post(() -> {
          if (!online()) { freshAuthority = false; invalidate("Dikte için internet bağlantısı gerekli."); }
          else refresh();
        });
      }
    };
    connectivity.registerDefaultNetworkCallback(networkCallback);
  }

  void resume() {
    foreground = true;
    speech.refreshVoices();
    for (Field field : new ArrayList<>(fields)) field.session.resume();
    refresh();
  }
  void pause() {
    foreground = false;
    speech.stop();
    for (Field field : new ArrayList<>(fields)) field.session.pause();
    refresh();
  }
  void background() {
    foreground = false;
    freshAuthority = false;
    connectionRevision++;
    for (Field field : new ArrayList<>(fields)) field.session.background();
    speech.stop();
    refresh();
  }
  void destroy() {
    destroyed = true;
    pause();
    for (Field field : new ArrayList<>(fields)) field.session.close();
    fields.clear();
    pendingPermission = null;
    preferences.unregisterOnSharedPreferenceChangeListener(preferenceListener);
    connectivity.unregisterNetworkCallback(networkCallback);
    uploads.shutdownNow();
    speech.destroy();
  }

  /** Cached snapshots alone never activate an upload, including after process restart. */
  long syncStarted() { return connectionRevision; }

  void synced(long ticket) {
    if (ticket != connectionRevision || !foreground || destroyed) return;
    OperationData data = currentData.get();
    String next = identity.deviceId + "\n" + ConnectionSettings.webModuleUrl(preferences) + "\n"
        + ConnectionSettings.syncSecret(preferences) + "\n" + data.serverRevision + "\n"
        + data.snapshotUpdatedAt + "\n" + data.sttAvailable + "\n" + data.hasPermission("voice.dictation")
        + "\n" + data.deviceActive;
    if (!next.equals(authorityIdentity)) invalidate("Veri veya dikte ayarları değişti; önceki kayıt ve yanıt iptal edildi.");
    authorityIdentity = next;
    freshAuthority = online();
    refresh();
  }

  void syncFailed() { freshAuthority = false; invalidate("Dikte için güncel cihaz yetkisi alınamadı. Veriyi yenileyin."); }

  private boolean online() {
    NetworkCapabilities caps = connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
    return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
  }

  private boolean canDictate() {
    return !destroyed && foreground && AndroidVoiceRules.canDictate(currentData.get(), freshAuthority, online(),
        ConnectionSettings.webModuleUrl(preferences), ConnectionSettings.syncSecret(preferences))
        && activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_MICROPHONE);
  }

  private void invalidate(String reason) {
    speech.stop();
    for (Field field : new ArrayList<>(fields)) {
      if (field.session.state() != AndroidDictationSession.State.IDLE) field.session.cancel(reason);
    }
    refresh();
  }

  private void refresh() {
    if (destroyed) return;
    speech.refreshButtons();
    for (Field field : fields) field.refreshStart();
  }

  View settingsView() { return speech.settingsView(); }
  boolean hasPermission(String permission) { return currentData.get().hasPermission(permission); }

  void addSpeaker(Dialog dialog, LinearLayout parent, String text, BooleanSupplier surfaceAllowed) {
    speech.addSpeaker(dialog, parent, text, surfaceAllowed);
  }

  void addDictation(Dialog dialog, LinearLayout parent, EditText target, int maxChars, BooleanSupplier surfaceAllowed) {
    Field field = new Field(dialog, parent, target, maxChars, surfaceAllowed);
    fields.add(field);
    field.refreshStart();
  }

  /** Call once on the owning dialog, after attaching its voice surfaces. */
  void bindDialog(Dialog dialog) {
    dialog.setOnDismissListener(ignored -> {
      speech.dismiss(dialog);
      for (Field field : new ArrayList<>(fields)) if (field.dialog == dialog) {
        field.session.close(); fields.remove(field);
      }
    });
  }

  private final class Field implements AndroidDictationSession.Port {
    final Dialog dialog;
    final EditText target;
    final int maxChars;
    final BooleanSupplier surfaceAllowed;
    final Button start;
    final Button stop;
    final Button cancel;
    final Button use;
    final EditText preview;
    final TextView status;
    final AndroidDictationSession session;
    private MediaRecorder recorder;
    private File audio;
    private HostingSyncClient.AudioRequest request;
    private final Runnable durationLimit;

    Field(Dialog dialog, LinearLayout parent, EditText target, int maxChars, BooleanSupplier surfaceAllowed) {
      this.dialog = dialog;
      this.target = target;
      this.maxChars = maxChars;
      this.surfaceAllowed = surfaceAllowed;
      session = new AndroidDictationSession(this);
      durationLimit = () -> session.cancel("2 dakika kayıt sınırına ulaşıldı. Kayıt iptal edildi.");
      LinearLayout panel = UiKit.column(activity);
      start = UiKit.outlineButton(activity, "🎙 Dikte Başlat", v -> session.start());
      stop = UiKit.outlineButton(activity, "Durdur / Metne Çevir", v -> session.stop());
      cancel = UiKit.outlineButton(activity, "Dikteyi İptal Et", v -> session.cancel("Dikte iptal edildi."));
      status = UiKit.text(activity, "", 12, UiKit.SECONDARY, Typeface.NORMAL);
      status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
      preview = new EditText(activity);
      preview.setContentDescription("Dikte metni önizlemesi");
      preview.setHint("Dikte metnini düzenleyin");
      preview.setMinLines(2);
      preview.setMaxLines(5);
      preview.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
          | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
      use = UiKit.outlineButton(activity, "Metni Kullan", v -> {
        String edited = preview.getText().toString();
        if (edited.length() > maxChars) { status.setText("Bu alan en fazla " + maxChars + " karakter kabul eder."); return; }
        session.useText(edited);
      });
      preview.addTextChangedListener(new android.text.TextWatcher() {
        @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
        @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
          use.setVisibility(session.state() == AndroidDictationSession.State.PREVIEW && !s.toString().trim().isEmpty()
              ? View.VISIBLE : View.GONE);
        }
        @Override public void afterTextChanged(android.text.Editable text) {}
      });
      panel.addView(start); panel.addView(stop); panel.addView(cancel); panel.addView(status);
      panel.addView(preview); panel.addView(use);
      parent.addView(panel);
      show(AndroidDictationSession.State.IDLE, "", "");
    }

    @Override public boolean allowed() {
      return dialog.isShowing() && target.isEnabled() && surfaceAllowed.getAsBoolean() && canDictate();
    }

    void refreshStart() {
      start.setVisibility(canDictate() && surfaceAllowed.getAsBoolean()
          && (session.state() == AndroidDictationSession.State.IDLE || session.state() == AndroidDictationSession.State.PREVIEW)
          ? View.VISIBLE : View.GONE);
    }

    @Override public void requestPermission(long revision) {
      speech.stop();
      for (Field field : fields) if (field != this && field.session.state() != AndroidDictationSession.State.IDLE) {
        field.session.cancel("Başka bir alanda dikte başlatıldı.");
      }
      if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
        session.permissionResult(revision, true); return;
      }
      if (pendingPermission != null) { session.cancel("Mikrofon izni yanıtını bekleyin."); return; }
      pendingPermission = this;
      pendingPermissionRevision = revision;
      microphonePermission.launch(Manifest.permission.RECORD_AUDIO);
    }

    @SuppressWarnings("deprecation")
    @Override public void startRecording() throws Exception {
      if (!recordingDirectory.isDirectory() && !recordingDirectory.mkdir()) throw new java.io.IOException();
      audio = File.createTempFile("dictation-", ".m4a", recordingDirectory);
      recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(activity) : new MediaRecorder();
      recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
      recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
      recorder.setAudioChannels(1);
      recorder.setAudioSamplingRate(44_100);
      recorder.setAudioEncodingBitRate(64_000);
      recorder.setMaxDuration(AndroidVoiceRules.MAX_DURATION_MS);
      recorder.setMaxFileSize(AndroidVoiceRules.MAX_AUDIO_BYTES);
      recorder.setOutputFile(audio.getAbsolutePath());
      recorder.setOnInfoListener((r, what, extra) -> {
        if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED
            || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) {
          session.cancel("Ses kaydı süre veya boyut sınırına ulaştı; kayıt iptal edildi.");
        }
      });
      recorder.setOnErrorListener((r, what, extra) -> session.cancel("Mikrofon kaydı tamamlanamadı."));
      recorder.prepare();
      recorder.start();
      main.postDelayed(durationLimit, AndroidVoiceRules.MAX_DURATION_MS);
    }

    @Override public long stopRecording() throws Exception {
      main.removeCallbacks(durationLimit);
      MediaRecorder capture = recorder;
      recorder = null;
      if (capture == null) throw new java.io.IOException();
      try { capture.stop(); } finally { capture.release(); }
      return audio == null ? 0 : audio.length();
    }

    @Override public void discardRecording() {
      main.removeCallbacks(durationLimit);
      if (recorder != null) {
        MediaRecorder capture = recorder;
        recorder = null;
        try { capture.stop(); } catch (RuntimeException ignored) { /* Too short or already stopped. */ }
        finally {
          try { capture.release(); } catch (RuntimeException ignored) { /* Already released. */ }
        }
      }
      if (audio != null) { audio.delete(); audio = null; }
    }

    @Override public void upload(long revision) {
      final File recording = audio;
      final String url = ConnectionSettings.webModuleUrl(preferences);
      final String credential = ConnectionSettings.syncSecret(preferences);
      final HostingSyncClient.AudioRequest activeRequest = new HostingSyncClient.AudioRequest();
      request = activeRequest;
      uploads.execute(() -> {
        try {
          activeRequest.check();
          String text = client.transcribeAudio(url, credential, identity, recording, activeRequest);
          main.post(() -> { if (!destroyed) session.completed(revision, text); });
        } catch (HostingSyncClient.SyncException error) {
          main.post(() -> {
            if (destroyed || !session.awaiting(revision)) return;
            session.failed(revision, error.getMessage());
            if (error.httpStatus == 401 || error.httpStatus == 403 || error.httpStatus == 422) {
              freshAuthority = false;
              invalidate(error.getMessage());
            }
          });
        } finally { if (recording != null) recording.delete(); }
      });
    }

    @Override public void cancelUpload() {
      if (request != null) { request.cancel(); request = null; }
    }

    @Override public void replaceText(String text) { target.setText(text); target.setSelection(target.length()); }

    @Override public void show(AndroidDictationSession.State state, String message, String text) {
      refreshStart();
      stop.setVisibility(state == AndroidDictationSession.State.RECORDING ? View.VISIBLE : View.GONE);
      cancel.setVisibility(state != AndroidDictationSession.State.IDLE && state != AndroidDictationSession.State.CLOSED ? View.VISIBLE : View.GONE);
      status.setText(message);
      status.setVisibility(message.isEmpty() ? View.GONE : View.VISIBLE);
      preview.setText(text);
      preview.setVisibility(state == AndroidDictationSession.State.PREVIEW ? View.VISIBLE : View.GONE);
      use.setVisibility(state == AndroidDictationSession.State.PREVIEW && !text.trim().isEmpty() ? View.VISIBLE : View.GONE);
    }
  }
}
