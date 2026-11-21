package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;

/** Read-only ideal-stock planning; neither stock actions nor purchase commands. */
final class MarketReplenishmentFlow {
  private final Context context;
  private final Supplier<OperationData> snapshot;
  private final MarketFormUi ui;
  private final Runnable render;
  private final Set<String> selected = new HashSet<>();
  private String categoryId = "";
  private String searchText = "";

  MarketReplenishmentFlow(Context context, Supplier<OperationData> snapshot,
      MarketFormUi ui, Runnable render) {
    this.context=context;
    this.snapshot=snapshot;
    this.ui=ui;
    this.render=render;
  }

  void revokeWhenUnavailable() {
    OperationData data=snapshot.get();
    if (!MarketUiRules.canViewReplenishment(data)) {
      selected.clear();
      categoryId="";
      searchText="";
      return;
    }
    Set<String> available=new HashSet<>();
    for (OperationData.StockReplenishmentRow row : data.market.replenishment.rows)
      available.add(row.productId);
    selected.retainAll(available);
  }

  LinearLayout screen() {
    LinearLayout page=UiKit.column(context);
    ui.addBackHeader(page,"İdeal Stok Eksikleri","Sipariş önerisi · Stok veya satın alma kaydı oluşturmaz");
    OperationData data=snapshot.get();
    if (!MarketUiRules.canViewReplenishment(data)) {
      page.addView(UiKit.emptyCard(context,"Stok listesi kullanılamıyor",
          "Ürün görüntüleme ve stok takibi yetkileri gerekli."));
      return page;
    }
    List<OperationData.StockReplenishmentRow> all=data.market.replenishment.rows;
    if (all.isEmpty()) {
      page.addView(UiKit.emptyCard(context,"İdeal stok eksiği bulunmuyor",
          "Aktif ve stok takibi açık ürünler ideal seviyeye ulaştığında liste boş kalır."));
      return page;
    }

    LinearLayout intro=UiKit.card(context);
    intro.addView(UiKit.text(context,all.size()+" ürün için stok tamamlama önerisi",
        16,UiKit.TEXT,Typeface.BOLD));
    intro.addView(UiKit.text(context,
        "Mevcut stok tüm aktif konumlardan hesaplandı. Minimum stok yalnız uyarı eşiğidir.",
        12,UiKit.SECONDARY,Typeface.NORMAL));
    if (data.market.replenishment.truncated) {
      intro.addView(UiKit.text(context,
          "Mobil özet 1.200 ürünle sınırlı. Tüm eksikleri indirmek için masaüstünü kullanın.",
          13,UiKit.WARNING,Typeface.BOLD));
    }
    page.addView(intro);

    LinkedHashMap<String,String> categories=new LinkedHashMap<>();
    for (OperationData.StockReplenishmentRow row : all)
      categories.putIfAbsent(row.categoryId,row.categoryName);
    List<String> ids=new ArrayList<>(categories.keySet());
    String[] labels=new String[ids.size()+1];
    labels[0]="Tüm kategoriler";
    int current=0;
    for (int i=0;i<ids.size();i++) {
      labels[i+1]=categories.get(ids.get(i));
      if (ids.get(i).equals(categoryId)) current=i+1;
    }
    if (current==0 && !categoryId.isEmpty()) categoryId="";
    ui.addSelectionDialog(page,"Kategori",labels,current,position -> {
      categoryId=position==0?"":ids.get(position-1);
      render.run();
    });

    EditText search=UiKit.labeledInput(context,page,"Ürün ara","Ürün adı / SKU");
    LinearLayout list=UiKit.column(context);
    ui.bind(search,searchText,value -> {
      searchText=value;
      renderRows(list,null);
    });
    LinearLayout actions=UiKit.column(context);
    page.addView(actions);
    page.addView(list);
    renderRows(list,actions);
    return page;
  }

  private void renderRows(LinearLayout list, LinearLayout actions) {
    OperationData data=snapshot.get();
    if (!MarketUiRules.canViewReplenishment(data)) return;
    List<OperationData.StockReplenishmentRow> filtered=
        MarketUiRules.filteredReplenishment(data,categoryId,searchText);
    list.removeAllViews();
    if (actions != null) {
      actions.removeAllViews();
      addActions(actions,filtered);
    }
    android.widget.TextView countText=UiKit.text(context,
        filtered.size()+" filtre sonucu · "+selected.size()+" işaretli",
        13,UiKit.SECONDARY,Typeface.BOLD);
    list.addView(countText);
    int count=0;
    for (OperationData.StockReplenishmentRow row : filtered) {
      if (count++>=180) break;
      LinearLayout card=UiKit.card(context);
      CheckBox choose=new CheckBox(context);
      choose.setText(row.name+(row.sku.isEmpty()?"":" · "+row.sku));
      choose.setTextColor(UiKit.TEXT);
      choose.setChecked(selected.contains(row.productId));
      choose.setOnCheckedChangeListener((button,checked)->{
        if (checked) selected.add(row.productId);
        else selected.remove(row.productId);
        countText.setText(filtered.size()+" filtre sonucu · "+selected.size()+" işaretli");
        // Selection is kept across filters and synced snapshot rerenders.
      });
      card.addView(choose);
      card.addView(UiKit.text(context,row.categoryName+" · Mevcut: "+
          ui.quantity(row.quantity)+" "+ui.unitLabel(row.unit)+
          " · Minimum: "+ui.quantity(row.minimumQuantity)+
          " · İdeal: "+ui.quantity(row.idealQuantity),
          12,UiKit.SECONDARY,Typeface.NORMAL));
      card.addView(UiKit.text(context,
          "Önerilen: "+ui.quantity(row.suggestedQuantity)+" "+ui.unitLabel(row.unit),
          14,UiKit.PRIMARY,Typeface.BOLD));
      list.addView(card);
    }
    if (filtered.size()>180) {
      list.addView(UiKit.text(context,
          "İlk 180 ürün görüntüleniyor. Filtre ve çıktı işlemleri görünenlerin tamamını kapsar.",
          12,UiKit.MUTED,Typeface.NORMAL));
    }
  }

  private void addActions(LinearLayout actions,List<OperationData.StockReplenishmentRow> filtered) {
    Button mark=UiKit.outlineButton(context,"Filtrelenenleri işaretle",view->{
      for (OperationData.StockReplenishmentRow row : filtered) selected.add(row.productId);
      render.run();
    });
    ui.sizeButton(mark,44,6,2);
    actions.addView(mark);
    Button clear=UiKit.outlineButton(context,"İşaretleri temizle",view->{
      selected.clear();
      render.run();
    });
    ui.sizeButton(clear,44,2,8);
    actions.addView(clear);
    addExportButton(actions,"İşaretlenenleri paylaş",false,false,false);
    addExportButton(actions,"İşaretlenenleri CSV",false,true,false);
    addExportButton(actions,"Tüm eksikleri paylaş",true,false,true);
    addExportButton(actions,"Tüm eksikleri CSV",true,true,true);
  }

  private void addExportButton(LinearLayout panel,String title,boolean all,boolean csv,boolean requiresComplete) {
    boolean truncated=snapshot.get().market.replenishment.truncated;
    Button export=UiKit.outlineButton(context,title,view->{
      if (!MarketUiRules.canViewReplenishment(snapshot.get())) return;
      List<OperationData.StockReplenishmentRow> rows=rowsToExport(all);
      if (rows.isEmpty()) {
        new AlertDialog.Builder(context).setMessage("Önce listeden ürün işaretleyin.")
            .setPositiveButton("Tamam",null).show();
        return;
      }
      if (csv) shareCsv(rows);
      else shareText(rows);
    });
    export.setEnabled(!(requiresComplete && truncated));
    ui.sizeButton(export,46,2,3);
    panel.addView(export);
  }

  private List<OperationData.StockReplenishmentRow> rowsToExport(boolean all) {
    List<OperationData.StockReplenishmentRow> result=new ArrayList<>();
    OperationData data=snapshot.get();
    if (!MarketUiRules.canViewReplenishment(data) || (all && data.market.replenishment.truncated)) return result;
    for (OperationData.StockReplenishmentRow row : data.market.replenishment.rows) {
      if (all || selected.contains(row.productId)) result.add(row);
    }
    return result;
  }

  private void shareText(List<OperationData.StockReplenishmentRow> rows) {
    try {
      Intent send=new Intent(Intent.ACTION_SEND);
      send.setType("text/plain");
      send.putExtra(Intent.EXTRA_SUBJECT,"İdeal Stok Sipariş Listesi");
      send.putExtra(Intent.EXTRA_TEXT,MarketUiRules.replenishmentText(rows));
      context.startActivity(Intent.createChooser(send,"Sipariş önerisini paylaş"));
    } catch (Exception error) { shareError(); }
  }

  private void shareCsv(List<OperationData.StockReplenishmentRow> rows) {
    try {
      File dir=new File(context.getCacheDir(),"stock-exports");
      if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("Dosya alanı oluşturulamadı.");
      File file=new File(dir,"ideal-stok-siparis-listesi.csv");
      byte[] csv=MarketUiRules.replenishmentCsv(rows).getBytes(StandardCharsets.UTF_8);
      try (FileOutputStream output=new FileOutputStream(file,false)) {
        output.write(csv);
      }
      Uri uri=FileProvider.getUriForFile(context,context.getPackageName()+".fileprovider",file);
      Intent send=new Intent(Intent.ACTION_SEND);
      send.setType("text/csv");
      send.putExtra(Intent.EXTRA_SUBJECT,"İdeal Stok Sipariş Listesi");
      send.putExtra(Intent.EXTRA_STREAM,uri);
      send.setClipData(ClipData.newUri(context.getContentResolver(),"Sipariş Listesi",uri));
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      context.startActivity(Intent.createChooser(send,"CSV dosyasını paylaş / yazdır"));
    } catch (Exception error) { shareError(); }
  }

  private void shareError() {
    new AlertDialog.Builder(context).setMessage("Liste paylaşımı açılamadı. Cihazın paylaşım uygulamalarını kontrol edin.")
        .setPositiveButton("Tamam",null).show();
  }
}
