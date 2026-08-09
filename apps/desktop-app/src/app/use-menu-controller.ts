import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../electron/database";
import { defaultDashboardData } from "./bootstrap-defaults";
import type { SyncState } from "./runtime-state";
import {
  buildMenuPreviewData,
  compareMenuRecords,
  emptyCategoryForm,
  emptyItemForm,
  nextSortOrder,
  parseNullableFormNumber,
  parsePositiveFormNumber,
  splitCommaList,
  toCategoryForm,
  toItemForm,
  type CategoryFormState,
  type ItemFormState
} from "../components/menu/menu-model";

interface UseMenuControllerOptions {
  dashboardData: DesktopDashboardData;
  setDashboardData: Dispatch<SetStateAction<DesktopDashboardData>>;
  loadDashboardData: () => Promise<DesktopDashboardData | undefined>;
}

const initialCategoryForm = toCategoryForm(defaultDashboardData.menu.categories[0]);
const initialItemForm = toItemForm(defaultDashboardData.menu.items[0], initialCategoryForm.id);

export function useMenuController({
  dashboardData,
  setDashboardData,
  loadDashboardData
}: UseMenuControllerOptions) {
  const [menuPublishState, setMenuPublishState] = useState<SyncState>("idle");
  const [menuStatusMessage, setMenuStatusMessage] = useState("Menü yayına hazır.");
  const [menuEditState, setMenuEditState] = useState<SyncState>("idle");
  const [menuEditMessage, setMenuEditMessage] = useState("Düzenleme bekliyor.");
  const [menuPreviewOpen, setMenuPreviewOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryForm.id);
  const [selectedItemId, setSelectedItemId] = useState(initialItemForm.id);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(initialCategoryForm);
  const [itemForm, setItemForm] = useState<ItemFormState>(initialItemForm);

  useEffect(() => {
    if (selectedCategoryId && !dashboardData.menu.categories.some((category) => category.id === selectedCategoryId)) {
      const nextCategory = [...dashboardData.menu.categories].sort(compareMenuRecords)[0];
      setSelectedCategoryId(nextCategory?.id ?? "");
      setCategoryForm(toCategoryForm(nextCategory));
    }

    if (selectedItemId && !dashboardData.menu.items.some((item) => item.id === selectedItemId)) {
      const fallbackCategoryId = dashboardData.menu.categories[0]?.id ?? "";
      const nextItem = [...dashboardData.menu.items]
        .filter((item) => !selectedCategoryId || item.category_id === selectedCategoryId)
        .sort(compareMenuRecords)[0] ?? [...dashboardData.menu.items].sort(compareMenuRecords)[0];
      setSelectedItemId(nextItem?.id ?? "");
      setItemForm(toItemForm(nextItem, fallbackCategoryId));
    }
  }, [dashboardData.menu.categories, dashboardData.menu.items, selectedCategoryId, selectedItemId]);

  const menuPreviewData = useMemo(
    () => buildMenuPreviewData(dashboardData.menu, categoryForm, itemForm),
    [categoryForm, dashboardData.menu, itemForm]
  );

  async function publishMenu() {
    setMenuPublishState("loading");
    setMenuStatusMessage("Menü webde güncelleniyor...");

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setMenuPublishState("error");
      setMenuStatusMessage("Menü yayınlanamadı. Bağlantıyı kontrol edin.");
      return;
    }

    const result = await bridge.pushMenu();
    if (!result.ok) {
      setMenuPublishState("error");
      setMenuStatusMessage("Menü yayınlanamadı. Bağlantıyı kontrol edin.");
      return;
    }

    await loadDashboardData();
    setMenuPublishState("success");
    setMenuStatusMessage("Menü webde güncellendi.");
  }

  async function openMenuPreview() {
    const bridge = window.yardimciDesktop;
    if (bridge) {
      try {
        const currentDashboardData = await bridge.getDashboardData();
        setDashboardData(currentDashboardData);
      } catch {
        // Bellekteki son yerel veriyle önizlemeyi açmaya devam et.
      }
    }

    setMenuPreviewOpen(true);
  }

  function closeMenuPreview() {
    setMenuPreviewOpen(false);
  }

  function selectCategory(category: PublishedMenuCategory) {
    setSelectedCategoryId(category.id);
    setCategoryForm(toCategoryForm(category));
    const firstCategoryItem = dashboardData.menu.items
      .filter((item) => item.category_id === category.id)
      .sort(compareMenuRecords)[0];
    setSelectedItemId(firstCategoryItem?.id ?? "");
    setItemForm(toItemForm(firstCategoryItem, category.id));
  }

  function selectItem(item: PublishedMenuItem) {
    setSelectedItemId(item.id);
    setItemForm(toItemForm(item, dashboardData.menu.categories[0]?.id ?? ""));
  }

  function startNewCategory() {
    setSelectedCategoryId("");
    setCategoryForm(emptyCategoryForm(nextSortOrder(dashboardData.menu.categories)));
    setSelectedItemId("");
    setItemForm(emptyItemForm("", nextSortOrder(dashboardData.menu.items)));
    setMenuEditState("idle");
    setMenuEditMessage("Yeni kategori.");
  }

  function startNewItem() {
    const categoryId = selectedCategoryId || dashboardData.menu.categories[0]?.id || "";
    setSelectedItemId("");
    setItemForm(emptyItemForm(categoryId, nextSortOrder(dashboardData.menu.items)));
    setMenuEditState("idle");
    setMenuEditMessage("Yeni ürün.");
  }

  async function saveCategory() {
    setMenuEditState("loading");
    setMenuEditMessage("Kategori kaydediliyor...");

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setMenuEditState("error");
      setMenuEditMessage("Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await bridge.saveMenuCategory({
      id: categoryForm.id || undefined,
      name: categoryForm.name,
      description: categoryForm.description,
      is_active: categoryForm.is_active,
      sort_order: Number(categoryForm.sort_order)
    });

    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return;
    }

    const savedCategory = result.dashboardData.menu.categories.find((category) => category.id === result.savedId);
    setDashboardData(result.dashboardData);
    setSelectedCategoryId(result.savedId);
    if (savedCategory) {
      setCategoryForm(toCategoryForm(savedCategory));
    }
    if (!itemForm.category_id) {
      setItemForm((current) => ({ ...current, category_id: result.savedId }));
    }
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    markMenuDirty();
  }

  async function saveItem() {
    setMenuEditState("loading");
    setMenuEditMessage("Ürün kaydediliyor...");

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      setMenuEditState("error");
      setMenuEditMessage("Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın.");
      return;
    }

    const result = await bridge.saveMenuItem({
      id: itemForm.id || undefined,
      category_id: itemForm.category_id,
      name: itemForm.name,
      description: itemForm.description,
      price: Number(itemForm.price),
      currency: itemForm.currency,
      image_url: itemForm.image_url,
      is_available: itemForm.is_available,
      is_featured: itemForm.is_featured,
      allergens: splitCommaList(itemForm.allergens),
      tags: splitCommaList(itemForm.tags),
      stock_quantity: parseNullableFormNumber(itemForm.stock_quantity),
      stock_min_quantity: parseNullableFormNumber(itemForm.stock_min_quantity),
      stock_unit: itemForm.stock_unit,
      stock_consumption_quantity: parsePositiveFormNumber(itemForm.stock_consumption_quantity, 1),
      hide_when_out_of_stock: itemForm.hide_when_out_of_stock,
      stock_note: itemForm.stock_note.trim() || null,
      sort_order: Number(itemForm.sort_order)
    });

    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return;
    }

    const savedItem = result.dashboardData.menu.items.find((item) => item.id === result.savedId);
    setDashboardData(result.dashboardData);
    setSelectedItemId(result.savedId);
    if (savedItem) {
      setItemForm(toItemForm(savedItem, result.dashboardData.menu.categories[0]?.id ?? ""));
    }
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    markMenuDirty();
  }

  async function deleteCategory() {
    const bridge = window.yardimciDesktop;
    if (!categoryForm.id || !bridge) {
      return;
    }
    const relatedProductCount = dashboardData.menu.items.filter((item) => item.category_id === categoryForm.id).length;
    if (!window.confirm(`“${categoryForm.name}” kategorisi ve bağlı ${relatedProductCount} ürün silinsin mi?`)) {
      return;
    }

    setMenuEditState("loading");
    setMenuEditMessage("Kategori ve bağlı ürünler siliniyor...");
    const result = await bridge.deleteMenuCategory(categoryForm.id);
    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return;
    }

    const nextCategory = [...result.dashboardData.menu.categories].sort(compareMenuRecords)[0];
    const nextItem = [...result.dashboardData.menu.items]
      .filter((item) => !nextCategory || item.category_id === nextCategory.id)
      .sort(compareMenuRecords)[0];
    setDashboardData(result.dashboardData);
    setSelectedCategoryId(nextCategory?.id ?? "");
    setCategoryForm(toCategoryForm(nextCategory));
    setSelectedItemId(nextItem?.id ?? "");
    setItemForm(toItemForm(nextItem, nextCategory?.id ?? ""));
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    markMenuDirty();
  }

  async function deleteItem() {
    const bridge = window.yardimciDesktop;
    if (!itemForm.id || !bridge) {
      return;
    }
    if (!window.confirm(`“${itemForm.name}” ürünü menüden silinsin mi?`)) {
      return;
    }

    setMenuEditState("loading");
    setMenuEditMessage("Ürün siliniyor...");
    const result = await bridge.deleteMenuItem(itemForm.id);
    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return;
    }

    const nextItem = [...result.dashboardData.menu.items]
      .filter((item) => !selectedCategoryId || item.category_id === selectedCategoryId)
      .sort(compareMenuRecords)[0];
    setDashboardData(result.dashboardData);
    setSelectedItemId(nextItem?.id ?? "");
    setItemForm(toItemForm(nextItem, selectedCategoryId || result.dashboardData.menu.categories[0]?.id || ""));
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    markMenuDirty();
  }

  function markMenuDirty() {
    setMenuPublishState("idle");
    setMenuStatusMessage("Menüde yayınlanmamış değişiklik var.");
  }

  return {
    menuPublishState,
    menuStatusMessage,
    menuEditState,
    menuEditMessage,
    menuPreviewOpen,
    menuPreviewData,
    selectedCategoryId,
    selectedItemId,
    categoryForm,
    itemForm,
    setCategoryForm,
    setItemForm,
    publishMenu,
    openMenuPreview,
    closeMenuPreview,
    selectCategory,
    selectItem,
    startNewCategory,
    startNewItem,
    saveCategory,
    saveItem,
    deleteCategory,
    deleteItem
  };
}
