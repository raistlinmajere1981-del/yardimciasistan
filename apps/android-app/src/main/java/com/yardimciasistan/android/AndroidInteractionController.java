package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Toast;

import androidx.activity.ComponentActivity;

import java.net.URLEncoder;

final class AndroidInteractionController {
  private final ComponentActivity activity;

  AndroidInteractionController(ComponentActivity activity) {
    this.activity = activity;
  }

  void confirm(
      AppTheme.Mode themeMode,
      String title,
      String message,
      Runnable action
  ) {
    AlertDialog dialog = alertDialogBuilder(themeMode)
        .setTitle(title)
        .setMessage(message)
        .setNegativeButton("Vazgeç", null)
        .setPositiveButton("Devam Et", (value, which) -> action.run())
        .create();
    dialog.setOnShowListener(value -> {
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(UiKit.PRIMARY);
      dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(UiKit.MUTED);
    });
    dialog.show();
  }

  AlertDialog.Builder alertDialogBuilder(AppTheme.Mode themeMode) {
    int dialogTheme = themeMode == AppTheme.Mode.DAY
        ? android.R.style.Theme_Material_Light_Dialog_Alert
        : android.R.style.Theme_Material_Dialog_Alert;
    return new AlertDialog.Builder(activity, dialogTheme);
  }

  void configureFullDialog(Dialog dialog) {
    Window window = dialog.getWindow();
    if (window != null) {
      window.setBackgroundDrawable(new ColorDrawable(UiKit.BG));
      window.setLayout(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
      );
    }
  }

  void configureBottomDialog(Dialog dialog) {
    Window window = dialog.getWindow();
    if (window != null) {
      window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
      window.setGravity(Gravity.BOTTOM);
      window.setLayout(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT
      );
    }
  }

  void openDialer(String phone) {
    if (phone == null || phone.trim().isEmpty()) {
      Toast.makeText(
          activity,
          "Telefon numarası bulunamadı.",
          Toast.LENGTH_SHORT
      ).show();
      return;
    }
    openIntent(
        new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phone.trim()))),
        "Arama uygulaması açılamadı."
    );
  }

  void openWhatsApp(OperationData data, String phone, String message) {
    if (!AndroidUiRules.canUseWhatsApp(data)
        || !data.hasPermission("customer.respond")) {
      Toast.makeText(
          activity,
          "WhatsApp bu işletmede etkin değil.",
          Toast.LENGTH_SHORT
      ).show();
      return;
    }

    String normalizedPhone = AndroidPhoneRules.normalizeWhatsAppPhone(phone);
    if (normalizedPhone.isEmpty()) {
      Toast.makeText(
          activity,
          "WhatsApp için telefon numarası bulunamadı.",
          Toast.LENGTH_SHORT
      ).show();
      return;
    }

    try {
      String url = "https://wa.me/" + normalizedPhone;
      if (message != null && !message.trim().isEmpty()) {
        url += "?text=" + URLEncoder.encode(message.trim(), "UTF-8");
      }
      openIntent(
          new Intent(Intent.ACTION_VIEW, Uri.parse(url)),
          "WhatsApp bağlantısı açılamadı."
      );
    } catch (Exception error) {
      Toast.makeText(
          activity,
          "WhatsApp mesajı hazırlanamadı.",
          Toast.LENGTH_SHORT
      ).show();
    }
  }

  void copyText(String value) {
    ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(
        Context.CLIPBOARD_SERVICE
    );
    if (clipboard == null) {
      Toast.makeText(
          activity,
          "Kopyalama kullanılamıyor.",
          Toast.LENGTH_SHORT
      ).show();
      return;
    }
    clipboard.setPrimaryClip(
        ClipData.newPlainText("Yardımcı Asistan hazır mesaj", value)
    );
    Toast.makeText(
        activity,
        "Hazır mesaj kopyalandı.",
        Toast.LENGTH_SHORT
    ).show();
  }

  private void openIntent(Intent intent, String fallback) {
    try {
      activity.startActivity(intent);
    } catch (ActivityNotFoundException error) {
      Toast.makeText(activity, fallback, Toast.LENGTH_SHORT).show();
    }
  }
}
