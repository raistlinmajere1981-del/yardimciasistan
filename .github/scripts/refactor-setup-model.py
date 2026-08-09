from pathlib import Path
import re

path = Path("apps/desktop-app/src/App.tsx")
text = path.read_text(encoding="utf-8")
original = text

# Artık setup-model tarafından taşınan doğrudan database tiplerini App importundan çıkar.
text = text.replace("  DesktopAiModelOption,\n", "")
text = text.replace("  DesktopAiService,\n", "")

setup_import = '''import {
  aiServicePresets,
  createDefaultAiServiceDraft,
  createSaveAiServiceProfiles,
  isAiServiceProfileStored,
  nextTableCategoryFormKey,
  normalizeAiService,
  toAiServiceFormDraft,
  toSetupForm,
  type SetupFormState
} from "./app/setup-model";\n'''
anchor = 'import { getRoomDisplayInfo, isAccommodationTask, isRestaurantTask } from "./app/operations";\n'
if setup_import not in text:
    if anchor not in text:
        raise SystemExit("setup import anchor bulunamadı")
    text = text.replace(anchor, anchor + setup_import, 1)

# App.tsx içindeki setup/AI form tiplerini kaldır.
for interface_name in ("TableCategoryFormState", "SetupFormState", "AiServiceFormDraft"):
    pattern = rf"interface {interface_name} \{{.*?\n\}}\n\n"
    text, count = re.subn(pattern, "", text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{interface_name} arayüzü tam bir kez bulunamadı: {count}")

# Servis preset listesi artık setup-model altında tek kaynaktır.
text, count = re.subn(
    r"const aiServicePresets = \[.*?\n\](?: as const)?;\n\n",
    "",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"aiServicePresets bloğu tam bir kez bulunamadı: {count}")

old_normalize = '    const normalizedService = aiServicePresets.some((item) => item.id === service) ? service as DesktopAiService : "openai";'
new_normalize = '    const normalizedService = normalizeAiService(service);'
if old_normalize not in text:
    raise SystemExit("AI servis normalize satırı bulunamadı")
text = text.replace(old_normalize, new_normalize, 1)

# Setup form dönüşümleri, masa kategori anahtarı ve AI profil yardımcıları tek domain modülüne taşındı.
text, count = re.subn(
    r"function toSetupForm\(setupData: DesktopSetupData\): SetupFormState \{.*?(?=function formatCustomerLastContactDate\()",
    "",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"setup yardımcı bloğu tam bir kez bulunamadı: {count}")

# Senkron gizli anahtar üretimi yalnız toSetupForm tarafından kullanılıyor; domain modülüne taşındı.
text, count = re.subn(
    r"function generateSyncSecret\(\) \{.*?\n\}\n\n(?=export default App;)",
    "",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"generateSyncSecret tam bir kez bulunamadı: {count}")

# Taşınan isimlerin App içinde tanım olarak kalmadığını doğrula.
for forbidden in (
    "interface SetupFormState",
    "interface AiServiceFormDraft",
    "interface TableCategoryFormState",
    "const aiServicePresets =",
    "function toSetupForm(",
    "function createAiServiceFormDrafts(",
    "function createDefaultAiServiceDraft(",
    "function createSaveAiServiceProfiles(",
    "function generateSyncSecret(",
):
    if forbidden in text:
        raise SystemExit(f"Taşınan tanım App.tsx içinde kaldı: {forbidden}")

if "DesktopAiModelOption" in text or "DesktopAiService" in text:
    raise SystemExit("Taşınan AI database tiplerinden biri App.tsx içinde hâlâ kullanılıyor")

if text == original:
    raise SystemExit("App.tsx değişmedi")

path.write_text(text, encoding="utf-8")
