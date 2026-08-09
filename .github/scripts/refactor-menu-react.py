from pathlib import Path
import re

path = Path("apps/desktop-app/src/App.tsx")
text = path.read_text(encoding="utf-8")

text = text.replace('import { StockImageImportWorkspace } from "./components/restaurant/StockImageImportWorkspace";\n', '')

menu_import = 'import { MenuManager } from "./components/menu/MenuManager";\n'
anchor = 'import { NotificationCenter } from "./components/notifications/NotificationCenter";\n'
if menu_import not in text:
    if anchor not in text:
        raise SystemExit("MenuManager import anchor not found")
    text = text.replace(anchor, anchor + menu_import, 1)

for icon_line in [
    '  Maximize2,\n',
    '  Monitor,\n',
    '  Star,\n',
]:
    text = text.replace(icon_line, '')

pattern = re.compile(r'\ninterface MenuManagerProps \{.*?\nfunction toCategoryForm\(', re.S)
match = pattern.search(text)
if not match:
    raise SystemExit("MenuManager block not found")
text = text[:match.start()] + '\nfunction toCategoryForm(' + text[match.end():]

path.write_text(text, encoding="utf-8")
