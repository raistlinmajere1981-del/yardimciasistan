package com.yardimciasistan.android;

import android.app.Dialog;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import static com.yardimciasistan.android.AndroidPresentation.*;

final class RoomAssignmentDialog {
  interface Listener {
    void onSubmit(JSONObject payload);
    void configureFullDialog(Dialog dialog);
  }

  static void show(ComponentActivity activity, OperationData data,
      OperationData.CustomerRecord preferredCustomer,
      OperationData.RoomRecord preferredRoom, Listener listener) {
    Dialog dialog = new Dialog(activity);
    LinearLayout shell = UiKit.column(activity);
    shell.setBackgroundColor(UiKit.BG);
    shell.setPadding(UiKit.dp(activity,16),UiKit.dp(activity,14),UiKit.dp(activity,16),UiKit.dp(activity,20));

    LinearLayout header = UiKit.row(activity);
    LinearLayout heading = UiKit.column(activity);
    heading.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1f));
    heading.addView(UiKit.eyebrow(activity,"MÜŞTERİ · ODA"));
    heading.addView(UiKit.title(activity,"Konaklama oluştur"));
    header.addView(heading);
    Button close = UiKit.iconButton(activity,"×","Oda atama formunu kapat",false,v -> dialog.dismiss());
    header.addView(close,new LinearLayout.LayoutParams(UiKit.dp(activity,44),UiKit.dp(activity,44)));
    shell.addView(header);

    LinearLayout form = UiKit.column(activity);
    ChoiceItem[] customerChoices = new ChoiceItem[data.customers.size()];
    for (int i=0;i<data.customers.size();i++) {
      OperationData.CustomerRecord customer=data.customers.get(i);
      customerChoices[i]=new ChoiceItem(customer.id,customer.fullName+(customer.phone.isEmpty()?"":" · "+customer.phone));
    }
    ChoiceItem[] roomChoices = new ChoiceItem[data.rooms.size()];
    for (int i=0;i<data.rooms.size();i++) {
      OperationData.RoomRecord room=data.rooms.get(i);
      OperationData.CustomerRoomStayRecord stay=data.activeStayForRoom(room.id);
      roomChoices[i]=new ChoiceItem(room.id,room.name+(room.number.isEmpty()?"":" · "+room.number)+" · "+formatRoomStatus(room.status)+(stay==null?"":" · "+stay.customerName));
    }

    Spinner customer=addChoice(activity,form,"Müşteri *",customerChoices,preferredCustomer==null?customerChoices[0].value:preferredCustomer.id);
    Spinner room=addChoice(activity,form,"Oda *",roomChoices,preferredRoom==null?roomChoices[0].value:preferredRoom.id);
    String today=new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(new Date());
    EditText checkIn=addInput(activity,form,"Giriş tarihi *","YYYY-AA-GG",today,false);
    EditText checkOut=addInput(activity,form,"Çıkış tarihi","YYYY-AA-GG","",false);
    EditText guestCount=addInput(activity,form,"Kişi sayısı *","1","1",false);
    guestCount.setInputType(InputType.TYPE_CLASS_NUMBER);
    Spinner status=addChoice(activity,form,"Başlangıç durumu",
        new ChoiceItem[]{new ChoiceItem("planned","Planlı / rezerve"),new ChoiceItem("checked_in","Giriş yapıldı")},"planned");
    EditText notes=addInput(activity,form,"Konaklama notu","Odaya özel notlar","",true);
    TextView statusMessage=UiKit.text(activity,"",12,UiKit.DANGER,Typeface.BOLD);
    statusMessage.setVisibility(View.GONE);
    form.addView(statusMessage);

    Button save=UiKit.button(activity,"Müşteriyi Odaya Ata",UiKit.PRIMARY,v -> {
      String start=text(checkIn), end=text(checkOut);
      int guests;
      try { guests=Integer.parseInt(text(guestCount)); } catch(Exception ignored) { guests=0; }
      if (!isIsoDate(start) || (!end.isEmpty() && !isIsoDate(end))) { showError(statusMessage,"Tarihleri YYYY-AA-GG biçiminde girin."); return; }
      if (!end.isEmpty() && end.compareTo(start)<0) { showError(statusMessage,"Çıkış tarihi giriş tarihinden önce olamaz."); return; }
      if (guests<1 || guests>50) { showError(statusMessage,"Kişi sayısı 1 ile 50 arasında olmalı."); return; }
      try {
        JSONObject payload=new JSONObject();
        payload.put("customer_id",selected(customer));
        payload.put("room_id",selected(room));
        payload.put("check_in_date",start);
        payload.put("check_out_date",end);
        payload.put("guest_count",guests);
        payload.put("status",selected(status));
        payload.put("notes",text(notes));
        dialog.dismiss();
        listener.onSubmit(payload);
      } catch(Exception error) {
        showError(statusMessage,"Konaklama isteği hazırlanamadı.");
      }
    });
    LinearLayout.LayoutParams saveParams=new LinearLayout.LayoutParams(-1,UiKit.dp(activity,50));
    saveParams.setMargins(0,UiKit.dp(activity,12),0,UiKit.dp(activity,20));
    save.setLayoutParams(saveParams);
    form.addView(save);

    ScrollView scroll=UiKit.scroll(activity,form);
    scroll.setLayoutParams(new LinearLayout.LayoutParams(-1,0,1f));
    shell.addView(scroll);
    dialog.setContentView(shell);
    dialog.show();
    listener.configureFullDialog(dialog);
  }

  private static EditText addInput(ComponentActivity activity, LinearLayout form, String label, String hint, String value, boolean multiline) {
    TextView fieldLabel=UiKit.text(activity,label,11,UiKit.MUTED,Typeface.BOLD);
    LinearLayout.LayoutParams labelParams=new LinearLayout.LayoutParams(-1,-2);
    labelParams.setMargins(0,UiKit.dp(activity,10),0,UiKit.dp(activity,4));
    fieldLabel.setLayoutParams(labelParams); form.addView(fieldLabel);
    EditText input=UiKit.input(activity,hint);
    if (multiline) {
      input.setSingleLine(false); input.setMinLines(3); input.setGravity(Gravity.TOP);
      input.setPadding(UiKit.dp(activity,12),UiKit.dp(activity,10),UiKit.dp(activity,12),UiKit.dp(activity,10));
      input.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    }
    input.setText(value==null?"":value);
    input.setLayoutParams(new LinearLayout.LayoutParams(-1,multiline?UiKit.dp(activity,94):UiKit.dp(activity,50)));
    form.addView(input); return input;
  }

  private static Spinner addChoice(ComponentActivity activity, LinearLayout form, String label, ChoiceItem[] choices, String selectedValue) {
    TextView fieldLabel=UiKit.text(activity,label,11,UiKit.MUTED,Typeface.BOLD);
    LinearLayout.LayoutParams labelParams=new LinearLayout.LayoutParams(-1,-2);
    labelParams.setMargins(0,UiKit.dp(activity,10),0,UiKit.dp(activity,4));
    fieldLabel.setLayoutParams(labelParams); form.addView(fieldLabel);
    Spinner spinner=new Spinner(activity);
    ArrayAdapter<ChoiceItem> adapter=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,choices);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinner.setAdapter(adapter); spinner.setBackground(UiKit.rounded(activity,UiKit.SURFACE,UiKit.BORDER,11));
    spinner.setPadding(UiKit.dp(activity,8),0,UiKit.dp(activity,8),0);
    spinner.setLayoutParams(new LinearLayout.LayoutParams(-1,UiKit.dp(activity,50)));
    select(spinner,selectedValue); form.addView(spinner); return spinner;
  }

  private static void select(Spinner spinner,String value) {
    if(value==null||value.trim().isEmpty()||spinner.getAdapter()==null)return;
    for(int i=0;i<spinner.getAdapter().getCount();i++){
      Object item=spinner.getAdapter().getItem(i);
      if(item instanceof ChoiceItem && value.equals(((ChoiceItem)item).value)){spinner.setSelection(i);return;}
    }
  }
  private static String selected(Spinner spinner){Object item=spinner==null?null:spinner.getSelectedItem();return item instanceof ChoiceItem?((ChoiceItem)item).value:"";}
  private static String text(EditText input){return input==null?"":input.getText().toString().trim();}
  private static void showError(TextView view,String message){view.setText(message);view.setVisibility(View.VISIBLE);}

  private static final class ChoiceItem {
    final String value,label;
    ChoiceItem(String value,String label){this.value=value==null?"":value;this.label=label==null?"":label;}
    @Override public String toString(){return label;}
  }
  private RoomAssignmentDialog(){}
}
