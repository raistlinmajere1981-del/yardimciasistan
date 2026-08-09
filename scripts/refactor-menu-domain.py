from pathlib import Path
import re

app_path = Path("apps/desktop-app/src/App.tsx")
manager_path = Path("apps/desktop-app/src/components/menu/MenuManager.tsx")
model_path = Path("apps/desktop-app/src/components/menu/menu-model.ts")
preview_path = Path("apps/desktop-app/src/components/menu/MenuPreview.tsx")

app = app_path.read_text(encoding="utf-8")
manager = manager_path.read_text(encoding="utf-8")

# Menü form tiplerini App.tsx'ten çıkar.
types_start = app.index("interface CategoryFormState {")
types_end = app.index("interface TableCategoryFormState {")
types_block = app[types_start:types_end].strip()
app = app[:types_start] + app[types_end:]
types_block = types_block.replace("interface CategoryFormState", "export interface CategoryFormState")
types_block = types_block.replace("interface ItemFormState", "export interface ItemFormState")

# Menü form ve saf yardımcılarını App.tsx'ten çıkar.
helpers_start = app.index("function toCategoryForm(")
helpers_end = app.index("function formatRequestType(")
helpers_block = app[helpers_start:helpers_end].strip()
app = app[:helpers_start] + app[helpers_end:]
helpers_block = re.sub(r"(?m)^function ([A-Za-z0-9_]+)\(", r"export function \1(", helpers_block)

menu_date_helper = '''\n\nexport function formatMenuDateTime(value: string) {\n  const timestamp = Date.parse(value);\n  if (!Number.isFinite(timestamp)) return value;\n  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));\n}\n'''

model_content = '''import type { PublishedMenuCategory, PublishedMenuItem } from "@yardimci-asistan/sync-core";\nimport type { DesktopDashboardData } from "../../../electron/database";\nimport type { StatusTone } from "../ui/StatusBadge";\n\n''' + types_block + "\n\n" + helpers_block + menu_date_helper
model_path.write_text(model_content, encoding="utf-8")

# Yerel menü önizleme bileşenlerini App.tsx'ten çıkar.
preview_start = app.index("interface LocalMenuPreviewProps {")
preview_end = app.index("interface SetupWizardProps {")
preview_block = app[preview_start:preview_end].strip()
app = app[:preview_start] + app[preview_end:]
preview_block = preview_block.replace("function LocalMenuPreview(", "export function LocalMenuPreview(", 1)
preview_block = preview_block.replace("formatDateTime(menu.updated_at)", "formatMenuDateTime(menu.updated_at)")

preview_content = '''import { useEffect, useMemo, useRef, useState } from "react";\nimport { X } from "lucide-react";\nimport type { PublishedMenuItem } from "@yardimci-asistan/sync-core";\nimport type { DesktopDashboardData, DesktopSetupData } from "../../../electron/database";\nimport {\n  compareMenuRecords,\n  formatCurrency,\n  formatMenuDateTime,\n  isQrHiddenByStock,\n  resolveMenuPreviewImageUrl\n} from "./menu-model";\n\n''' + preview_block + "\n"
preview_path.write_text(preview_content, encoding="utf-8")

# App.tsx yalnız gerçekten kullandığı menü domain isimlerini içe alsın.
helper_names = re.findall(r"(?m)^export function ([A-Za-z0-9_]+)\(", helpers_block)
used_helpers = [name for name in helper_names if re.search(rf"\b{re.escape(name)}\b", app)]
menu_import_names = used_helpers + ["type CategoryFormState", "type ItemFormState"]
menu_import = "import {\n  " + ",\n  ".join(menu_import_names) + "\n} from \"./components/menu/menu-model\";\n"
anchor = 'import { MenuManager } from "./components/menu/MenuManager";\n'
app = app.replace(anchor, anchor + 'import { LocalMenuPreview } from "./components/menu/MenuPreview";\n' + menu_import, 1)

# Menü yöneticisine artık kullanılmayan eski önizleme prop'larını gönderme.
app = app.replace("            previewMenu={menuPreviewData}\n            setupData={setupData}\n", "")
app = app.replace("            onExpandPreview={openMenuPreview}\n", "")
app_path.write_text(app, encoding="utf-8")

# MenuManager tipleri ve ortak saf yardımcıları domain modülünden kullansın.
manager_types_start = manager.index("interface CategoryFormState {")
manager_types_end = manager.index("interface MenuManagerProps {")
manager = manager[:manager_types_start] + manager[manager_types_end:]
manager = manager.replace('  previewMenu: DesktopDashboardData["menu"];\n', "")
manager = manager.replace('  setupData: DesktopSetupData;\n', "")
manager = manager.replace('  onExpandPreview: () => void;\n', "")
manager = manager.replace('import type { DesktopDashboardData, DesktopSetupData } from "../../../electron/database";', 'import type { DesktopDashboardData } from "../../../electron/database";')
manager = manager.replace('import { StatusBadge, type StatusTone } from "../ui/StatusBadge";', 'import { StatusBadge } from "../ui/StatusBadge";')

generic_start = manager.index("function findMenuCategoryName(")
generic_end = manager.index("function describeImageValue(")
manager = manager[:generic_start] + manager[generic_end:]

manager_import = '''import {\n  compareMenuRecords,\n  findMenuCategoryName,\n  formatCurrency,\n  formatStockQuantity,\n  getMenuStockBadge,\n  isQrHiddenByStock,\n  resolveMenuPreviewImageUrl,\n  stockUnitShortLabel,\n  type CategoryFormState,\n  type ItemFormState\n} from "./menu-model";\n'''
manager_anchor = 'import { StockImageImportWorkspace } from "../restaurant/StockImageImportWorkspace";\n'
manager = manager.replace(manager_anchor, manager_anchor + manager_import, 1)
manager_path.write_text(manager, encoding="utf-8")

print("Menü domain, önizleme ve App.tsx ayrıştırması tamamlandı.")
