import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { PublishedMenuItem } from "@yardimci-asistan/sync-core";
import type { DesktopDashboardData } from "../../../electron/database";
import type { DesktopSetupData } from "../../../electron/database";
import {
  compareMenuRecords,
  formatCurrency,
  formatMenuDateTime,
  isQrHiddenByStock,
  resolveMenuPreviewImageUrl
} from "./menu-model";
import { ModalSurface } from "../ui/ModalSurface";
import { ActionButton } from "../ui/ActionButton";

interface LocalMenuPreviewProps {
  menu: DesktopDashboardData["menu"];
  setupData: DesktopSetupData;
  webModuleUrl: string;
  whatsappEnabled: boolean;
  qrMenuEnabled: boolean;
  inventoryEnabled: boolean;
  onClose: () => void;
}

export function LocalMenuPreview({ menu, setupData, webModuleUrl, whatsappEnabled, qrMenuEnabled, inventoryEnabled, onClose }: LocalMenuPreviewProps) {
  return (
    <ModalSurface className="local-menu-preview-dialog" labelledBy="local-menu-preview-title" onClose={onClose} dismissOnBackdrop>
      <header className="local-menu-preview-toolbar workspace-frame__header">
        <div>
          <strong id="local-menu-preview-title">Yerel Menü Önizlemesi</strong>
          <span>{qrMenuEnabled ? "Düzenleme alanındaki canlı taslak gösteriliyor; kaydetmeden web yayını etkilenmez." : "Düzenleme alanındaki yerel menü taslağı gösteriliyor."}</span>
        </div>
        <ActionButton variant="ghost" data-modal-initial-focus type="button" onClick={onClose} aria-label="Önizlemeyi kapat">
          <X size={18} aria-hidden="true" />
          Kapat
        </ActionButton>
      </header>

      <div className="local-menu-preview-viewport">
        <MenuPreviewCanvas menu={menu} setupData={setupData} webModuleUrl={webModuleUrl} whatsappEnabled={whatsappEnabled} qrMenuEnabled={qrMenuEnabled} inventoryEnabled={inventoryEnabled} />
      </div>
    </ModalSurface>
  );
}

interface MenuPreviewCanvasProps {
  menu: DesktopDashboardData["menu"];
  setupData: DesktopSetupData;
  webModuleUrl: string;
  whatsappEnabled: boolean;
  qrMenuEnabled: boolean;
  inventoryEnabled: boolean;
}

function MenuPreviewCanvas({
  menu,
  setupData,
  webModuleUrl,
  whatsappEnabled,
  qrMenuEnabled,
  inventoryEnabled
}: MenuPreviewCanvasProps) {
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [failedHeroImageUrl, setFailedHeroImageUrl] = useState("");
  const categories = useMemo(
    () => menu.categories.filter((category) => category.is_active).sort(compareMenuRecords),
    [menu.categories]
  );
  const activeCategoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const items = useMemo(
    () => menu.items
      .filter((item) => item.is_available && item.product_is_active !== false && activeCategoryIds.has(item.category_id) && (!(qrMenuEnabled && inventoryEnabled) || !isQrHiddenByStock(item)))
      .sort(compareMenuRecords),
    [activeCategoryIds, inventoryEnabled, menu.items, qrMenuEnabled]
  );

  useEffect(() => {
    setActiveCategoryId((current) => (
      current === "all" || categories.some((category) => category.id === current) ? current : "all"
    ));
  }, [categories]);

  const visibleCategories = activeCategoryId === "all"
    ? categories
    : categories.filter((category) => category.id === activeCategoryId);
  const visibleSections = visibleCategories
    .map((category) => ({
      category,
      items: items.filter((item) => item.category_id === category.id)
    }))
    .filter((section) => section.items.length > 0);
  const heroImageUrl = resolveMenuPreviewImageUrl(
    items.find((item) => item.is_featured && item.image_url)?.image_url
      || items.find((item) => item.image_url)?.image_url
      || "",
    webModuleUrl
  );
  const visibleHeroImageUrl = heroImageUrl === failedHeroImageUrl ? "" : heroImageUrl;

  return (
    <article className="local-menu-preview-page" aria-label="Müşteri menüsü görünümü">
      <header className={visibleHeroImageUrl ? "local-menu-hero has-image" : "local-menu-hero"}>
        {visibleHeroImageUrl && <img src={visibleHeroImageUrl} alt="" onError={() => setFailedHeroImageUrl(visibleHeroImageUrl)} />}
        <div className="local-menu-hero-shade" />
        <div className="local-menu-hero-content">
          <p>{qrMenuEnabled ? "QR Menü" : "Menü"} · Yerel Önizleme</p>
          <h2>{setupData.businessName || "İşletme"} Menü</h2>
          <span>{qrMenuEnabled ? "Güncel ürünleri ve fiyatları yayınlamadan önce kontrol edin." : "Güncel ürünleri ve fiyatları kontrol edin."}</span>
          <div className="local-menu-hero-meta" aria-label="Menü bilgileri">
            <span>Güncel fiyatlar</span>
            <span>{categories.length} kategori</span>
            <span>{items.length} ürün</span>
          </div>
        </div>
      </header>

      <div className="local-menu-preview-content">
        <section className="local-menu-preview-categories" aria-label="Önizleme kategorileri">
          <div>
            <button
              className={activeCategoryId === "all" ? "is-active" : ""}
              type="button"
              aria-pressed={activeCategoryId === "all"}
              onClick={() => setActiveCategoryId("all")}
            >
              Tüm Ürünler
            </button>
            {categories.map((category) => (
              <button
                className={activeCategoryId === category.id ? "is-active" : ""}
                type="button"
                aria-pressed={activeCategoryId === category.id}
                onClick={() => setActiveCategoryId(category.id)}
                key={category.id}
              >
                {category.name}
              </button>
            ))}
          </div>
          <p>{menu.updated_at ? `Canlı taslak · Son kayıt: ${formatMenuDateTime(menu.updated_at)}` : "Kaydedilmemiş canlı taslak"}</p>
        </section>

        <div className="local-menu-preview-list">
          {visibleSections.length === 0 ? (
            <p className="local-menu-preview-empty">Bu kategori için aktif ürün bulunmuyor.</p>
          ) : visibleSections.map(({ category, items: categoryItems }) => (
            <section className="local-menu-preview-section" key={category.id}>
              <div className="local-menu-preview-section-title">
                <h3>{category.name}</h3>
                {category.description && <p>{category.description}</p>}
              </div>
              <div className="local-menu-preview-grid">
                {categoryItems.map((item) => (
                  <MenuPreviewItem
                    key={item.id}
                    item={item}
                    webModuleUrl={webModuleUrl}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <footer className="local-menu-preview-footer">
        <div>
          <strong>{setupData.businessName || "İşletme"}</strong>
          {setupData.address && <span>{setupData.address}</span>}
        </div>
        {whatsappEnabled && setupData.whatsapp && <span className="local-menu-preview-whatsapp">WhatsApp</span>}
      </footer>
    </article>
  );
}

interface MenuPreviewItemProps {
  item: PublishedMenuItem;
  webModuleUrl: string;
}

function MenuPreviewItem({ item, webModuleUrl }: MenuPreviewItemProps) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const imageUrl = resolveMenuPreviewImageUrl(item.image_url, webModuleUrl);
  const visibleImageUrl = imageUrl === failedImageUrl ? "" : imageUrl;
  const itemClasses = [
    "local-menu-preview-item",
    visibleImageUrl ? "" : "no-image",
  ].filter(Boolean).join(" ");

  return (
    <article className={itemClasses}>
      {visibleImageUrl && <img src={visibleImageUrl} alt={item.name} onError={() => setFailedImageUrl(visibleImageUrl)} />}
      <div className="local-menu-preview-item-body">
        <div className="local-menu-preview-item-title">
          <strong className={item.is_featured ? "is-featured" : ""}>{item.name}</strong>
          <span>{formatCurrency(item.price, item.currency)}</span>
        </div>
        {item.description && <p>{item.description}</p>}
        {item.tags.length > 0 && (
          <div className="local-menu-preview-tags">
            {item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}
      </div>
    </article>
  );
}
