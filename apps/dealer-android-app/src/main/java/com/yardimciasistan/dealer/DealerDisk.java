package com.yardimciasistan.dealer;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Session, private prices and device drafts share an atomic, Keystore-encrypted file. No backup. */
final class DealerDisk implements DealerState.Persistence {
  private final AtomicFile file;
  DealerDisk(Context context) { file = new AtomicFile(new File(context.getNoBackupFilesDir(), "dealer-state.bin")); }
  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
    if (store.containsAlias("dealer-device-state")) return (SecretKey) store.getKey("dealer-device-state", null);
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder("dealer-device-state", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
    return generator.generateKey();
  }
  String read() throws Exception {
    if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) return "{}";
    byte[] bytes = file.readFully();
    if (bytes.length < 29 || bytes[0] != 1) throw new IllegalStateException("Cihaz verisi açılamadı.");
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, bytes, 1, 12));
    return new String(cipher.doFinal(bytes, 13, bytes.length - 13), StandardCharsets.UTF_8);
  }
  public void write(String json) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
    byte[] encrypted = cipher.doFinal(json.getBytes(StandardCharsets.UTF_8));
    FileOutputStream output = null;
    try {
      output = file.startWrite(); output.write(1); output.write(cipher.getIV()); output.write(encrypted); file.finishWrite(output);
    } catch (Exception error) { if (output != null) file.failWrite(output); throw error; }
  }
}
