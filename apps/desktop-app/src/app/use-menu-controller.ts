import { useConfirmDialog } from "../components/ui/useConfirmDialog";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData, DesktopMenuSaveResult, DesktopStatusUpdateResult } from "../../electron/database";
import { defaultDashboardData } from "./bootstrap-defaults";
import { reportAppStatus, type SyncState } from "./runtime-state";
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
}: UseMenuControllerOptions) {
  const { confirm, confirmDialog } = useConfirmDialog();
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
    setMenuEditMessage("");
  }

  function startNewItem() {
    const categoryId = selectedCategoryId || dashboardData.menu.categories[0]?.id || "";
    setSelectedItemId("");
    setItemForm(emptyItemForm(categoryId, nextSortOrder(dashboardData.menu.items)));
    setMenuEditState("idle");
    setMenuEditMessage("");
  }

  async function saveCategoryForm(form: CategoryFormState, selectSaved = false): Promise<DesktopMenuSaveResult> {
    setMenuEditState("loading");
    setMenuEditMessage("");

    const bridge = window.yardimciDesktop;
    if (!bridge) {
      const result: DesktopMenuSaveResult = { ok: false, message: "Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın." };
      setMenuEditState("error");
      reportAppStatus("error", result.message);
      return result;
    }

    const result = await bridge.saveMenuCategory({
      id: form.id || undefined,
      name: form.name,
      description: form.description,
      is_active: form.is_active,
      sort_order: Number(form.sort_order)
    });

    if (!result.ok) {
      setMenuEditState("error");
      reportAppStatus("error", result.message);
      return result;
    }

    const savedCategory = result.dashboardData.menu.categories.find((category) => category.id === result.savedId);
    setDashboardData(result.dashboardData);
    if (selectSaved || selectedCategoryId === result.savedId) {
      setSelectedCategoryId(result.savedId);
      if (savedCategory) setCategoryForm(toCategoryForm(savedCategory));
    } else if (categoryForm.id === result.savedId && savedCategory) {
      setCategoryForm(toCategoryForm(savedCategory));
    }
    if (!itemForm.category_id && selectSaved) {
      setItemForm((current) => ({ ...current, category_id: result.savedId }));
    }
    setMenuEditState("success");
    setMenuEditMessage("");
    reportAppStatus("success", result.message);
    return result;
  }

  async function saveCategory() {
    return saveCategoryForm(categoryForm, true);
  }

  async function saveItemForm(form: ItemFormState, product?: import("../../electron/commerce-store").SaveCatalogProductInput): Promise<DesktopMenuSaveResult> {
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return { ok: false, message: "Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın." };
    }

    const priceError = validateItemFormPrice(form);
    if (priceError) {
      return { ok: false, message: priceError };
    }

    const result = await bridge.saveMenuProductEntry({ ...itemFormToSaveInput(form), ...(product ? { product, product_id: undefined } : {}) });
    if (!result.ok) {
      return result;
    }

    const savedItem = result.dashboardData.menu.items.find((item) => item.id === result.savedId);
    setDashboardData(result.dashboardData);
    setSelectedItemId(result.savedId);
    if (savedItem) {
      setItemForm(toItemForm(savedItem, result.dashboardData.menu.categories[0]?.id ?? ""));
    }
    return result;
  }

  async function saveItem(product?: import("../../electron/commerce-store").SaveCatalogProductInput): Promise<DesktopMenuSaveResult> {
    setMenuEditState("loading");
    setMenuEditMessage("");
    const priceError = validateItemFormPrice(itemForm);
    if (priceError) {
      setMenuEditState("error");
      setMenuEditMessage(priceError);
      return { ok: false, message: priceError };
    }
    const result = await saveItemForm(itemForm, product);
    setMenuEditState(result.ok ? "success" : "error");
    setMenuEditMessage("");
    reportAppStatus(result.ok ? "success" : "error", result.message);
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
      setMenuEditMessage("");
      reportAppStatus("error", result.message);
      return result;
    }

    setDashboardData(result.dashboardData);
    const selectedCategory = result.dashboardData.menu.categories.find((category) => category.id === selectedCategoryId);
    if (selectedCategory) {
      setCategoryForm(toCategoryForm(selectedCategory));
    }
    setMenuEditState("success");
    setMenuEditMessage("");
    reportAppStatus("success", result.message);
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
      setMenuEditMessage("");
      reportAppStatus("error", result.message);
      return result;
    }

    setDashboardData(result.dashboardData);
    const selectedItem = result.dashboardData.menu.items.find((item) => item.id === selectedItemId);
    if (selectedItem) {
      setItemForm(toItemForm(selectedItem, result.dashboardData.menu.categories[0]?.id ?? ""));
    }
    setMenuEditState("success");
    setMenuEditMessage("");
    reportAppStatus("success", result.message);
    return result;
  }

  async function deleteCategoryById(categoryId: string) {
    const bridge = window.yardimciDesktop;
    if (!categoryId || !bridge) return;

    setMenuEditState("loading");
    setMenuEditMessage("");
    const result = await bridge.deleteMenuCategory(categoryId);
    if (!result.ok) {
      setMenuEditState("error");
      reportAppStatus("error", result.message);
      return;
    }

    const remainingSelectedCategory = result.dashboardData.menu.categories.find((category) => category.id === selectedCategoryId);
    const nextCategory = remainingSelectedCategory ?? [...result.dashboardData.menu.categories].sort(compareMenuRecords)[0];
    const remainingSelectedItem = result.dashboardData.menu.items.find((item) => item.id === selectedItemId);
    const nextItem = remainingSelectedItem ?? [...result.dashboardData.menu.items]
      .filter((item) => !nextCategory || item.category_id === nextCategory.id)
      .sort(compareMenuRecords)[0];

    setDashboardData(result.dashboardData);
    setSelectedCategoryId(nextCategory?.id ?? "");
    setCategoryForm(toCategoryForm(nextCategory));
    setSelectedItemId(nextItem?.id ?? "");
    setItemForm(toItemForm(nextItem, nextCategory?.id ?? ""));
    setMenuEditState("success");
    setMenuEditMessage("");
    reportAppStatus("success", result.message);
  }

  async function deleteCategory(confirmed = false) {
    if (!categoryForm.id) return;
    if (!confirmed) {
      const relatedProductCount = dashboardData.menu.items.filter((item) => item.category_id === categoryForm.id).length;
      if (!(await confirm({ title: "Silme onayı", description: `“${categoryForm.name}” kategorisi ve bağlı ${relatedProductCount} ürün silinsin mi?`, tone: "danger", confirmLabel: "Sil" }))) {
        return;
      }
    }
    await deleteCategoryById(categoryForm.id);
  }

  async function deleteItemById(itemId: string): Promise<DesktopStatusUpdateResult> {
    const bridge = window.yardimciDesktop;
    if (!bridge) {
      return { ok: false, message: "Masaüstü uygulaması hazır değil. Uygulamayı yeniden başlatın." };
    }

    const result = await bridge.deleteMenuProductEntry(itemId);
    if (!result.ok) {
      reportAppStatus("error", result.message);
      return result;
    }

    const nextItem = [...result.dashboardData.menu.items]
      .filter((item) => !selectedCategoryId || item.category_id === selectedCategoryId)
      .sort(compareMenuRecords)[0];
    setDashboardData(result.dashboardData);
    setSelectedItemId(nextItem?.id ?? "");
    setItemForm(toItemForm(nextItem, selectedCategoryId || result.dashboardData.menu.categories[0]?.id || ""));
    reportAppStatus("success", result.message);
    return result;
  }


  return {
    confirmDialog,
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
    openMenuPreview,
    closeMenuPreview,
    selectCategory,
    selectItem,
    startNewCategory,
    startNewItem,
    saveCategory,
    saveCategoryForm,
    saveItem,
    saveItemForm,
    reorderCategories,
    reorderItems,
    deleteCategory,
    deleteCategoryById,
    deleteItemById
  };
}
