package com.yardimciasistan.android;

import android.app.AlertDialog;
import android.text.InputType;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Toast;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import org.json.JSONObject;
import org.json.JSONArray;
import org.json.JSONException;
import java.util.ArrayList;

/** Channel relation editor; new identity uses the shared canonical creation controls. */
final class MenuEntryPresentationDialog {
  interface Sender { void send(String type, JSONObject payload, String message); }

  static void show(ComponentActivity activity, OperationData data, OperationData.MenuItem item, Sender sender) {
    show(activity, data, item, sender, false);
  }

  static void showCreate(ComponentActivity activity, OperationData data, Sender sender) {
    show(activity, data, new OperationData.MenuItem(), sender, true);
  }

  private static void show(ComponentActivity activity, OperationData data, OperationData.MenuItem item, Sender sender, boolean creating) {
    if (!data.hasPermission("menu.edit") || !data.hasBusinessCapability("commerce.catalog") || data.adminCategories.isEmpty()) {
      Toast.makeText(activity, "Menü düzenleme yetkisi ve bir menü kategorisi gerekli.", Toast.LENGTH_SHORT).show(); return;
    }
    LinearLayout fields = UiKit.column(activity);
    fields.setPadding(UiKit.dp(activity, 18), UiKit.dp(activity, 12), UiKit.dp(activity, 18), 0);
    CheckBox newProduct = new CheckBox(activity);
    newProduct.setText(R.string.menu_create_shared_product); newProduct.setChecked(true);
    Spinner product = new Spinner(activity);
    ArrayList<String> productNames = new ArrayList<>();
    for (JSONObject candidate : data.menuProductCandidates) productNames.add(candidate.optString("name"));
    product.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item, productNames));
    product.setEnabled(false);
    LinearLayout productFields = UiKit.column(activity);
    String[] newName = { "" }, newPrice = { "" }, newUnit = { "piece" };
    Runnable[] updateConsumptionUnit = { () -> {} };
    CatalogProductCreateFields.name(productFields, "", value -> newName[0] = value);
    CatalogProductCreateFields.unit(productFields, "piece", value -> { newUnit[0] = value; updateConsumptionUnit[0].run(); });
    CatalogProductCreateFields.salePrice(productFields, "", value -> newPrice[0] = value);
    CheckBox trackInventory = new CheckBox(activity);
    trackInventory.setText(R.string.inventory_tracking); trackInventory.setEnabled(data.hasBusinessCapability("commerce.inventory"));
    productFields.addView(trackInventory);
    if (creating) {
      fields.addView(newProduct); fields.addView(product); fields.addView(productFields);
    }
    Spinner category = new Spinner(activity);
    ArrayList<String> names = new ArrayList<>();
    int selected = 0;
    for (int index = 0; index < data.adminCategories.size(); index++) {
      OperationData.MenuCategory value = data.adminCategories.get(index);
      names.add(value.name);
      if (value.id.equals(item.categoryId)) selected = index;
    }
    category.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item, names));
    category.setSelection(selected);
    fields.addView(category);
    EditText price = new EditText(activity);
    price.setHint("Menü fiyatı · boş = ortak ürün fiyatı");
    price.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    price.setText(item.priceOverride == null ? "" : String.valueOf(item.priceOverride));
    fields.addView(price);
    CheckBox available = new CheckBox(activity);
    available.setText(R.string.menu_available); available.setChecked(item.available); fields.addView(available);
    CheckBox featured = new CheckBox(activity);
    featured.setText(R.string.menu_featured); featured.setChecked(item.featured); fields.addView(featured);
    EditText allergens = UiKit.input(activity, "Alerjenler · virgülle ayırın");
    allergens.setText(commaText(item.allergens)); fields.addView(allergens);
    EditText tags = UiKit.input(activity, "Etiketler · virgülle ayırın");
    tags.setText(commaText(item.tags)); fields.addView(tags);
    TextView consumptionLabel = UiKit.text(activity, activity.getString(R.string.menu_stock_consumption, item.stockUnit), 12, UiKit.SECONDARY, android.graphics.Typeface.NORMAL);
    fields.addView(consumptionLabel);
    EditText consumption = new EditText(activity);
    consumption.setHint(activity.getString(R.string.menu_stock_consumption, item.stockUnit));
    consumption.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
    consumption.setText(String.valueOf(item.stockConsumptionQuantity));
    consumption.setEnabled(data.hasBusinessCapability("commerce.inventory")); fields.addView(consumption);
    if (creating) {
      Runnable updateUnit = () -> {
        String unit = newProduct.isChecked() || product.getSelectedItemPosition() < 0 ? newUnit[0]
            : data.menuProductCandidates.get(product.getSelectedItemPosition()).optString("unit", "piece");
        consumption.setHint(activity.getString(R.string.menu_stock_consumption, unit));
        consumptionLabel.setText(activity.getString(R.string.menu_stock_consumption, unit));
      };
      updateConsumptionUnit[0] = updateUnit;
      product.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
        @Override public void onItemSelected(android.widget.AdapterView<?> parent, android.view.View view, int position, long id) { updateUnit.run(); }
        @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { updateUnit.run(); }
      });
      newProduct.setOnCheckedChangeListener((button, checked) -> {
        product.setEnabled(!checked); productFields.setVisibility(checked ? android.view.View.VISIBLE : android.view.View.GONE); updateUnit.run();
      });
    }
    CheckBox hide = new CheckBox(activity);
    hide.setText(R.string.menu_hide_out_of_stock); hide.setChecked(item.hideWhenOutOfStock);
    hide.setEnabled(data.hasBusinessCapability("commerce.inventory") && data.hasBusinessCapability("channel.qr_menu")); fields.addView(hide);
    ScrollView scroll = new ScrollView(activity); scroll.addView(fields);
    AlertDialog dialog = new AlertDialog.Builder(activity).setTitle(creating ? "Yeni menü ürünü" : item.name + " · Menü sunumu").setView(scroll)
        .setNegativeButton("Vazgeç", null).setPositiveButton("Kaydet", null).create();
    dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
      try {
        OperationData.MenuItem draft = new OperationData.MenuItem();
        String override = price.getText().toString().trim().replace(',', '.');
        draft.id = item.id; draft.updatedAt = item.updatedAt;
        draft.categoryId = data.adminCategories.get(category.getSelectedItemPosition()).id;
        draft.priceOverride = override.isEmpty() ? null : Double.valueOf(override);
        draft.stockConsumptionQuantity = Double.parseDouble(consumption.getText().toString().trim().replace(',', '.'));
        draft.available = available.isChecked(); draft.featured = featured.isChecked();
        draft.allergens = commaValues(allergens.getText().toString()); draft.tags = commaValues(tags.getText().toString());
        draft.hideWhenOutOfStock = hide.isChecked(); draft.sortOrder = creating ? data.adminMenuItems.size() * 10 + 10 : item.sortOrder;
        JSONObject payload = channelPayload(draft, creating);
        if (creating) {
          if (newProduct.isChecked()) {
            String name = newName[0].trim();
            String priceText = newPrice[0].trim().replace(',', '.');
            double salePrice = priceText.isEmpty() ? 0 : Double.parseDouble(priceText);
            if (name.isEmpty() || !Double.isFinite(salePrice) || salePrice < 0) throw new IllegalArgumentException("invalid_product");
            JSONObject canonical = new JSONObject();
            canonical.put("name", name); canonical.put("salePrice", salePrice); canonical.put("unit", newUnit[0]);
            canonical.put("trackInventory", trackInventory.isChecked());
            payload.put("product", canonical);
          } else {
            if (product.getSelectedItemPosition() < 0) throw new IllegalArgumentException("product_required");
            payload.put("product_id", data.menuProductCandidates.get(product.getSelectedItemPosition()).optString("product_id"));
          }
        }
        view.setEnabled(false);
        sender.send(creating ? "menu_entry_create" : "menu_entry_update", payload, "Menü sunumu kaydedilmek üzere gönderildi."); dialog.dismiss();
      } catch (Exception error) { view.setEnabled(true); Toast.makeText(activity, "Ürün, menü fiyatı, kategori ve stok tüketimini kontrol edin.", Toast.LENGTH_SHORT).show(); }
    }));
    dialog.show();
  }

  static JSONObject channelPayload(OperationData.MenuItem draft, boolean creating) throws JSONException {
    if (draft.categoryId.isEmpty() || (!creating && draft.id.isEmpty())
        || (draft.priceOverride != null && (!Double.isFinite(draft.priceOverride) || draft.priceOverride < 0))
        || !Double.isFinite(draft.stockConsumptionQuantity) || draft.stockConsumptionQuantity <= 0)
      throw new IllegalArgumentException("invalid_menu_entry");
    JSONObject payload = new JSONObject();
    if (!creating) { payload.put("menu_entry_id", draft.id); payload.put("expected_updated_at", draft.updatedAt); }
    payload.put("category_id", draft.categoryId); payload.put("price_override", draft.priceOverride == null ? JSONObject.NULL : draft.priceOverride);
    payload.put("is_available", draft.available); payload.put("is_featured", draft.featured);
    payload.put("allergens", draft.allergens); payload.put("tags", draft.tags);
    payload.put("stock_consumption_quantity", draft.stockConsumptionQuantity); payload.put("hide_when_out_of_stock", draft.hideWhenOutOfStock);
    payload.put("sort_order", draft.sortOrder);
    return payload;
  }

  private static String commaText(JSONArray values) {
    ArrayList<String> parts = new ArrayList<>();
    for (int index = 0; index < values.length(); index++) parts.add(values.optString(index));
    return String.join(", ", parts);
  }

  private static JSONArray commaValues(String text) {
    JSONArray values = new JSONArray();
    for (String part : text.split(",")) if (!part.trim().isEmpty()) values.put(part.trim());
    return values;
  }
}
