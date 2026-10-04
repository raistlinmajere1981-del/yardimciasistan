import { WEBSITE_PAGES, type WebsiteNavigationItem } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
/** Staged Services preference: only known page ids, no URL or HTML input. */
export function WebsiteNavigationFields({ items, onChange }: { items: WebsiteNavigationItem[]; onChange: (items: WebsiteNavigationItem[]) => void }) {
  const ordered = [...items].sort((a, b) => a.order - b.order || WEBSITE_PAGES.findIndex(p => p.id === a.pageId) - WEBSITE_PAGES.findIndex(p => p.id === b.pageId));
  function move(index: number, offset: number) {
    const next = [...ordered];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next.map((item, order) => ({ ...item, order: order * 10 })));
  }
  return <fieldset className="website-navigation-fields"><legend>Website Menü</legend>
    <p>Sayfaların görünürlüğünü ve sırasını düzenleyin. Yayınlanmamış alanlar menüde görünmez. Kurulum ve kılavuz yalnız demo sitesinde kullanılır.</p>
    {ordered.map((item, index) => <div className="website-navigation-row" key={item.pageId}>
      <label><input type="checkbox" checked={item.visible} onChange={event => onChange(items.map(value => value.pageId === item.pageId ? { ...value, visible: event.target.checked } : value))} /> {WEBSITE_PAGES.find(page => page.id === item.pageId)?.label}</label>
      <div className="form-actions"><ActionButton variant="secondary" type="button" disabled={index === 0} aria-label={`${WEBSITE_PAGES.find(page => page.id === item.pageId)?.label} yukarı taşı`} onClick={() => move(index, -1)}>↑</ActionButton>
      <ActionButton variant="secondary" type="button" disabled={index === ordered.length - 1} aria-label={`${WEBSITE_PAGES.find(page => page.id === item.pageId)?.label} aşağı taşı`} onClick={() => move(index, 1)}>↓</ActionButton></div>
    </div>)}
  </fieldset>;
}
