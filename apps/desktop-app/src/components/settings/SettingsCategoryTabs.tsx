import type { KeyboardEvent } from "react";
import { settingsCategories, type SettingsCategoryId } from "../../app/settings-registry";

export function SettingsCategoryTabs({ active, dirty, onChange }: {
  active: SettingsCategoryId;
  dirty: Partial<Record<SettingsCategoryId, boolean>>;
  onChange: (category: SettingsCategoryId) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = settingsCategories.length - 1;
    const next = event.key === "ArrowRight" ? (index + 1) % (last + 1)
      : event.key === "ArrowLeft" ? (index + last) % (last + 1)
      : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    onChange(settingsCategories[next].id);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }
  return <div className="settings-category-tabs" role="tablist" aria-label="Ayar kategorileri">
    {settingsCategories.map((category, index) => <button
      key={category.id} id={`settings-tab-${category.id}`} type="button" role="tab"
      aria-selected={active === category.id} aria-controls={`settings-panel-${category.id}`}
      tabIndex={active === category.id ? 0 : -1}
      onClick={() => onChange(category.id)} onKeyDown={event => onKeyDown(event, index)}
    >{category.title}{dirty[category.id] && <span className="settings-dirty-indicator"> · Değişiklik var</span>}</button>)}
  </div>;
}
