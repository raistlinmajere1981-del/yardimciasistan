from pathlib import Path

path = Path("apps/desktop-app/src/App.tsx")
text = path.read_text(encoding="utf-8")

old = '<dd>{selectedCustomer.lastContactAt || selectedCustomer.updatedAt || "-"}</dd>'
new = '<dd title={selectedCustomer.lastContactAt || selectedCustomer.updatedAt || undefined}>{formatCustomerLastContactDate(selectedCustomer.lastContactAt || selectedCustomer.updatedAt)}</dd>'
if old not in text:
    raise SystemExit("Son temas alanı bulunamadı")
text = text.replace(old, new, 1)

anchor = 'function formatDateTime(value: string) {'
helper = '''function formatCustomerLastContactDate(value: string) {\n  if (!value) {\n    return "-";\n  }\n  const timestamp = Date.parse(value);\n  if (!Number.isFinite(timestamp)) {\n    return value;\n  }\n  return new Intl.DateTimeFormat("tr-TR", {\n    day: "numeric",\n    month: "long",\n    year: "numeric",\n    hour: "2-digit",\n    minute: "2-digit"\n  }).format(new Date(timestamp));\n}\n\n'''
if helper not in text:
    if anchor not in text:
        raise SystemExit("Tarih yardımcı fonksiyonu ekleme noktası bulunamadı")
    text = text.replace(anchor, helper + anchor, 1)

path.write_text(text, encoding="utf-8")
