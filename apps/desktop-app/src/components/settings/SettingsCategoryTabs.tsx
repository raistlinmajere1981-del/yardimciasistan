import type { KeyboardEvent } from "react";
import { settingsCategories, type SettingsCategoryDefinition, type SettingsCategoryId } from "../../app/settings-registry";

export function SettingsCategoryTabs({ active, dirty, categories = settingsCategories, onChange }: {
  active: SettingsCategoryId;
  dirty: Partial<Record<SettingsCategoryId, boolean>>;
  categories?: readonly SettingsCategoryDefinition[];
  onChange: (category: SettingsCategoryId) => boolean | Promise<boolean>;
}) {
  async function requestChange(category: SettingsCategoryId, focusTarget?: HTMLButtonElement) {
    const accepted = await onChange(category);
    if (accepted) focusTarget?.focus();
    return accepted;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = categories.length - 1;
    const next = event.key === "ArrowRight" ? (index + 1) % (last + 1)
      : event.key === "ArrowLeft" ? (index + last) % (last + 1)
      : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;

    event.preventDefault();
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const target = categories[next];
    if (!target) return;
    void requestChange(target.id, tabs?.[next]);
  }

  return (
    <div className="settings-category-tabs" role="tablist" aria-label="Ayar kategorileri">
      {categories.map((category, index) => (
        <button
          key={category.id}
          id={`settings-tab-${category.id}`}
          type="button"
          role="tab"
          aria-selected={active === category.id}
          aria-controls={`settings-panel-${category.id}`}
          tabIndex={active === category.id ? 0 : -1}
          onClick={() => { void requestChange(category.id); }}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {category.title}
          {dirty[category.id] && <span className="settings-dirty-indicator"> · Değişiklik var</span>}
        </button>
      ))}
    </div>
  );
}
