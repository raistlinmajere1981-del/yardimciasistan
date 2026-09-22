import { createContext, useContext, useId, type ReactNode } from "react";

interface TabsContextValue { prefix: string; value: string }
const TabsContext = createContext<TabsContextValue | null>(null);

/** Entity modes, separate from page view selectors. All panels stay mounted. */
export function WorkspaceTabs<T extends string>({ value, children }: { value: T; children: ReactNode }) {
  const prefix = useId();
  return <TabsContext.Provider value={{ prefix, value }}>{children}</TabsContext.Provider>;
}

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Workspace tab primitives require WorkspaceTabs.");
  return context;
}

export function WorkspaceTabList<T extends string>({ tabs, onChange, label }: {
  tabs: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  const { prefix, value } = useTabs();
  return <div className="workspace-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button type="button" role="tab" key={tab.id}
      id={`${prefix}-tab-${tab.id}`} aria-controls={`${prefix}-panel-${tab.id}`} aria-selected={value === tab.id}
      tabIndex={value === tab.id ? 0 : -1} onClick={() => onChange(tab.id)}
      onKeyDown={(event) => {
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
          : event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : -1;
        if (next < 0) return;
        event.preventDefault();
        onChange(tabs[next].id);
        document.getElementById(`${prefix}-tab-${tabs[next].id}`)?.focus();
      }}>{tab.label}</button>)}
  </div>;
}

export function WorkspaceTabPanel({ value, children }: { value: string; children: ReactNode }) {
  const { prefix, value: selected } = useTabs();
  return <section role="tabpanel" id={`${prefix}-panel-${value}`} aria-labelledby={`${prefix}-tab-${value}`}
    hidden={value !== selected} tabIndex={0}>{children}</section>;
}
