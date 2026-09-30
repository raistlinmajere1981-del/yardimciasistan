import { useConfirmDialog } from "../components/ui/useConfirmDialog";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData, DesktopMenuSaveResult, DesktopStatusUpdateResult } from "../../electron/database";
import { defaultDashboardData } from "./bootstrap-defaults";
import type { SyncState } from "./runtime-state";
import {
  buildMenuPreviewData,
  compareMenuRecords,
  emptyCategoryForm,
  emptyItemForm,
  itemFormToSaveInput,
  nextSortOrder,
  toCategoryForm,
  toItemForm,
  validateItemFormPrice,
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
  const { confirm, confirmDialog } = useConfirmDialog();
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
    if (menuPublishState !== "success") return;
    const timer = window.setTimeout(() => {
      setMenuPublishState("idle");
      setMenuStatusMessage("Menü yayına hazır.");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [menuPublishState]);

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
      setMenuStatusMessage(result.message || "Menü yayınlanamadı. Bağlantıyı kontrol edin.");
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

  async function saveItemForm(form: ItemFormState): Promise<DesktopMenuSaveResult> {
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return { ok: false, message: "Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın." };
    }

    const priceError = validateItemFormPrice(form);
    if (priceError) {
      return { ok: false, message: priceError };
    }

    const result = await bridge.saveMenuItem(itemFormToSaveInput(form));
    if (!result.ok) {
      return result;
    }

    const savedItem = result.dashboardData.menu.items.find((item) => item.id === result.savedId);
    setDashboardData(result.dashboardData);
    setSelectedItemId(result.savedId);
    if (savedItem) {
      setItemForm(toItemForm(savedItem, result.dashboardData.menu.categories[0]?.id ?? ""));
    }
    markMenuDirty();
    return result;
  }

  async function saveItem(): Promise<DesktopMenuSaveResult> {
    setMenuEditState("loading");
    setMenuEditMessage("Ürün kaydediliyor...");
    const priceError = validateItemFormPrice(itemForm);
    if (priceError) {
      setMenuEditState("error");
      setMenuEditMessage(priceError);
      return { ok: false, message: priceError };
    }
    const result = await saveItemForm(itemForm);
    setMenuEditState(result.ok ? "success" : "error");
    setMenuEditMessage(result.message);
    return result;
  }

  async function reorderCategories(orderedIds: string[]): Promise<DesktopStatusUpdateResult> {
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return { ok: false, message: "Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın." };
    }

    const result = await bridge.reorderMenuRecords({ kind: "categories", orderedIds });
    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return result;
    }

    setDashboardData(result.dashboardData);
    const selectedCategory = result.dashboardData.menu.categories.find((category) => category.id === selectedCategoryId);
    if (selectedCategory) {
      setCategoryForm(toCategoryForm(selectedCategory));
    }
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    markMenuDirty();
    return result;
  }

  async function reorderItems(categoryId: string, orderedIds: string[]): Promise<DesktopStatusUpdateResult> {
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return { ok: false, message: "Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın." };
    }

    const result = await bridge.reorderMenuRecords({ kind: "items", categoryId, orderedIds });
    if (!result.ok) {
      setMenuEditState("error");
      setMenuEditMessage(result.message);
      return result;
    }

    setDashboardData(result.dashboardData);
    const selectedItem = result.dashboardData.menu.items.find((item) => item.id === selectedItemId);
    if (selectedItem) {
      setItemForm(toItemForm(selectedItem, result.dashboardData.menu.categories[0]?.id ?? ""));
    }
    setMenuEditState("success");
    setMenuEditMessage(result.message);
    markMenuDirty();
    return result;
  }

  async function deleteCategory(confirmed = false) {
    const bridge = window.yardimciDesktop;
    if (!categoryForm.id || !bridge) {
      return;
    }
    if (!confirmed) {
      const relatedProductCount = dashboardData.menu.items.filter((item) => item.category_id === categoryForm.id).length;
      if (!(await confirm({ title: "Silme onayı", description: `“${categoryForm.name}” kategorisi ve bağlı ${relatedProductCount} ürün silinsin mi?`, tone: "danger", confirmLabel: "Sil" }))) {
        return;
      }
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

  async function deleteItemById(itemId: string): Promise<DesktopStatusUpdateResult> {
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return { ok: false, message: "Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın." };
    }

    const result = await bridge.deleteMenuItem(itemId);
    if (!result.ok) {
      return result;
    }

    const nextItem = [...result.dashboardData.menu.items]
      .filter((item) => !selectedCategoryId || item.category_id === selectedCategoryId)
      .sort(compareMenuRecords)[0];
    setDashboardData(result.dashboardData);
    setSelectedItemId(nextItem?.id ?? "");
    setItemForm(toItemForm(nextItem, selectedCategoryId || result.dashboardData.menu.categories[0]?.id || ""));
    markMenuDirty();
    return result;
  }


  function markMenuDirty() {
    setMenuPublishState("idle");
    setMenuStatusMessage("Menüde yayınlanmamış değişiklik var.");
  }

  return {
    confirmDialog,
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
    saveItemForm,
    reorderCategories,
    reorderItems,
    deleteCategory,
    deleteItemById
  };
}
