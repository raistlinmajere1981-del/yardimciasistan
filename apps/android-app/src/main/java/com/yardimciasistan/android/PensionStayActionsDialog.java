package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Typeface;
import android.widget.Button;
import android.widget.LinearLayout;
import androidx.activity.ComponentActivity;
import static com.yardimciasistan.android.AndroidPresentation.*;

final class PensionStayActionsDialog {
  interface Listener {
    void onStatusChange(String status);
    void configureBottomDialog(Dialog dialog);
  }

  static void show(ComponentActivity activity, OperationData.CustomerRoomStayRecord stay, Listener listener) {
    Dialog dialog=new Dialog(activity);
    LinearLayout sheet=UiKit.column(activity);
    sheet.setPadding(UiKit.dp(activity,18),UiKit.dp(activity,16),UiKit.dp(activity,18),UiKit.dp(activity,18));
    sheet.setBackground(UiKit.rounded(activity,UiKit.SURFACE,UiKit.BORDER,18));
    sheet.addView(UiKit.eyebrow(activity,"KONAKLAMA DURUMU"));
    sheet.addView(UiKit.title(activity,stay.customerName+" · "+stay.roomName));
    sheet.addView(UiKit.text(activity,joinDateRange(stay.checkInDate,stay.checkOutDate)+" · "+formatCustomerRoomStayStatus(stay.status),13,UiKit.MUTED,Typeface.NORMAL));

    if ("planned".equals(stay.status)) {
      add(activity,sheet,dialog,listener,"Girişi Tamamla","checked_in",UiKit.PRIMARY);
      add(activity,sheet,dialog,listener,"Planı İptal Et","cancelled",UiKit.DANGER_BACKGROUND);
    } else if ("checked_in".equals(stay.status)) {
      add(activity,sheet,dialog,listener,"Çıkışı Tamamla","checked_out",UiKit.PRIMARY);
      add(activity,sheet,dialog,listener,"Konaklamayı İptal Et","cancelled",UiKit.DANGER_BACKGROUND);
    } else if ("cancelled".equals(stay.status)) {
      add(activity,sheet,dialog,listener,"Yeniden Planla","planned",UiKit.PRIMARY);
    }

    dialog.setContentView(sheet);
    dialog.show();
    listener.configureBottomDialog(dialog);
  }

  private static void add(ComponentActivity activity, LinearLayout sheet, Dialog dialog, Listener listener, String label, String status, int tone) {
    Button button="cancelled".equals(status)
        ? UiKit.dangerButton(activity,label,v -> submit(dialog,listener,status))
        : UiKit.button(activity,label,tone,v -> submit(dialog,listener,status));
    LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,UiKit.dp(activity,46));
    params.setMargins(0,UiKit.dp(activity,9),0,0);
    button.setLayoutParams(params);
    sheet.addView(button);
  }
  private static void submit(Dialog dialog,Listener listener,String status){dialog.dismiss();listener.onStatusChange(status);}
  private PensionStayActionsDialog(){}
}
