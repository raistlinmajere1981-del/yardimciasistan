#!/usr/bin/env python3
"""Build offline HTML gallery and zipped archive from ADB screenshot evidence."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from html import escape
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1] / "artifacts" / "android-ui-gallery"
APPS = {"companion": "Android Companion", "bayi": "Android Bayi"}
ORIENTATIONS = {"dikey": "Dikey · 720×1280", "yatay": "Yatay ekran alanı · 1280×720"}
LABELS = {
 "restaurant-reservations": "Restoran / Rezervasyonlar",
 "restaurant-tasks": "Restoran / Günlük işler",
 "restaurant-menu": "Restoran / Menü yönetimi",
 "restaurant-tables": "Restoran / Masalar",
 "restaurant-orders": "Restoran / Açık adisyon",
 "restaurant-stock": "Restoran / Stok",
 "pension-reservations": "Pansiyon / Rezervasyonlar",
 "pension-stays": "Pansiyon / Konaklamalar",
 "pension-tasks": "Pansiyon / Günlük işler",
 "pension-rooms": "Pansiyon / Odalar",
 "pension-folios": "Pansiyon / Oda hesapları",
 "pension-kbs": "Pansiyon / KBS",
 "today-home": "Genel / Bugün",
 "more-menu": "Genel / Diğer",
 "settings": "Genel / Ayarlar",
 "market-home": "Market / Ana ekran",
 "market-home-summary": "Market / Günlük özet",
 "market-home-summary-metrics": "Market / Göstergeler",
 "market-cash-barcode-mode": "Market / Kasa barkod modu",
 "market-product-create": "Market / Yeni ürün",
 "market-product-create-bottom": "Market / Ürün formu alt bölüm",
 "market-known-barcode": "Market / Tanınan barkod",
 "market-cart-landscape": "Market / Sepet yatay",
 "market-cart-sent": "Market / Sepet gönderildi",
 "login-light": "Bayi / Giriş",
 "application-light": "Bayi / Başvuru",
 "cart-light": "Bayi / Sepet",
 "product-light": "Bayi / Ürün",
 "catalog-light": "Bayi / Katalog",
 "photo-inspector": "Bayi / Fotoğraf inceleme",
 "settings-dark": "Bayi / Koyu tema ayarları",
 "settings-large-contrast": "Bayi / Büyük yazı ve yüksek kontrast",
 "catalog-large-dark": "Bayi / Koyu katalog",
}

def label(path):
    key = path.stem.removeprefix("design-").removeprefix("landscape-")
    form = key.endswith("-form")
    if form: key = key[:-5]
    return LABELS.get(key, key.replace("-", " ").title()) + (" / Form" if form else "")

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = []
    sections = []
    summaries = []
    for app, app_label in APPS.items():
        for ori, ori_label in ORIENTATIONS.items():
            group = []
            for photo in sorted((ROOT / app / ori).glob("*.png")):
                with Image.open(photo) as im:
                    width, height = im.size
                    small = im.convert("RGB")
                    small.thumbnail((440, 440))
                    thumb = ROOT / "thumbs" / app / ori / (photo.stem + ".webp")
                    thumb.parent.mkdir(parents=True, exist_ok=True)
                    small.save(thumb, "WEBP", quality=82)
                entry = {"app":app,"orientation":ori,"label":label(photo),"path":photo.relative_to(ROOT).as_posix(),
                         "thumb":thumb.relative_to(ROOT).as_posix(),"width":width,"height":height}
                group.append(entry)
                manifest.append(entry)
            if not group: continue
            summary_name = "ozet-" + app + "-" + ori + ".jpg"
            summaries.append(summary_name)
            wide = ori == "yatay"
            cols = 2 if wide else 3
            cell_width, img_height = (490, 300) if wide else (310, 450)
            cell_height = img_height + 70
            padding, gap, top = 24, 14, 82
            rows = (len(group) + cols - 1) // cols
            sheet = Image.new("RGB",(padding*2 + cols*cell_width+(cols-1)*gap,
                                     top + rows*cell_height+padding), "#101928")
            d = ImageDraw.Draw(sheet)
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
                titlefont = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 27)
            except OSError:
                font = titlefont = ImageFont.load_default()
            d.text((padding,22),app_label + " — " + ori_label,fill="#ffffff",font=titlefont)
            for i, item in enumerate(group):
                col,row = i%cols,i//cols
                x = padding+col*(cell_width+gap)
                y = top+row*cell_height
                d.rounded_rectangle((x,y,x+cell_width,y+cell_height-8),radius=10,fill="#1f2d40")
                with Image.open(ROOT/item["path"]) as src:
                    fitted = ImageOps.contain(src.convert("RGB"),(cell_width-16,img_height-16))
                sheet.paste(fitted,(x+(cell_width-fitted.width)//2,y+(img_height-fitted.height)//2))
                text = item["label"]
                if len(text)>35:text=text[:32]+"..."
                d.text((x+9,y+img_height+10),text,fill="#e9f1ff",font=font)
            sheet.save(ROOT/summary_name,"JPEG",quality=88,optimize=True)
            cards = []
            for item in group:
                cards.append('<article><a href="' + escape(item["path"]) +
                  '" target="_blank" title="Orijinal PNG"><img loading="lazy" src="' +
                  escape(item["thumb"]) + '" alt="' + escape(item["label"]) +
                  '"></a><div class="meta"><strong>' + escape(item["label"]) +
                  '</strong><small>' + str(item["width"]) + '×' + str(item["height"]) +
                  '</small></div></article>')
            sections.append('<section id="'+app+'-'+ori+'"><div class="sectionhead"><h2>'+
                escape(app_label)+' — '+escape(ori_label)+'</h2><span>'+str(len(group))+
                ' ekran</span><a href="'+escape(summary_name)+'" target="_blank">Tek sayfa özet</a></div>'+
                '<div class="grid">'+''.join(cards)+'</div></section>')
    page = """<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yardımcı Asistan / Android Ekran Arşivi</title><style>
:root{color-scheme:dark;font:15px system-ui,-apple-system,sans-serif;--bg:#0f1726;--card:#1a293d;--border:#34465e;--text:#e9f0fa;--muted:#a8bad2}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}
header{background:#192438;border-bottom:1px solid var(--border);padding:24px clamp(16px,4vw,60px)}
h1{font-size:28px;margin:0 0 6px}p{color:var(--muted);line-height:1.5;max-width:1000px}
nav{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px}nav a{border:1px solid var(--border);padding:9px 12px;border-radius:9px;background:#25374e}
a{color:#b1d9ff;text-decoration:none}a:hover{text-decoration:underline}
main{padding:0 clamp(16px,4vw,60px) 60px}
section{margin-top:36px;scroll-margin-top:20px}.sectionhead{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:0 0 16px}
h2{margin:0;font-size:20px}.sectionhead span{color:var(--muted)}.sectionhead a{margin-left:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:15px}
article{border:1px solid var(--border);border-radius:13px;background:var(--card);overflow:hidden}
article>a{height:280px;display:flex;align-items:center;justify-content:center;padding:12px;background:#111a2a}
article img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}
.meta{padding:12px 14px;display:flex;justify-content:space-between;gap:8px;align-items:center}
.meta strong{font-size:13px}.meta small{font-size:12px;color:var(--muted)}
@media(max-width:600px){h1{font-size:22px}.grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}article>a{height:230px}}
</style></head><body><header>
<h1>Yardımcı Asistan · Android Ekran Arşivi</h1>
<p>Gerçek Android 13 telefonda otomatik toplanmış ekran görüntüleri. Dikey çekimler 720×1280;
yatay çekimler telefonun yön kilidi nedeniyle <b>1280×720 ekran alanı simülasyonudur</b>.
Kartlara tıklayarak orijinal PNG dosyasını büyütebilirsin.</p>
<nav>"""
    for app,app_label in APPS.items():
        for orientation in ORIENTATIONS:
            if any(x["app"]==app and x["orientation"]==orientation for x in manifest):
                page += ('<a href="#' + app + '-' + orientation + '">' +
                         escape(app_label) + ' — ' + orientation.title() + '</a>')
    page += '</nav></header><main>'+''.join(sections)+'</main></body></html>'
    (ROOT/"index.html").write_text(page,encoding="utf-8")
    (ROOT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (ROOT/"README.md").write_text(
      "# Android UI ekran arşivi\n\nTarayıcıdan index.html açılır. PNG dosyaları korunur.\n"
      "Yatay görüntüler fiziksel dönüş değil, 1280x720 ekran alanı simülasyonudur.\n"
      "Ekranlar test verisiyle üretildi; gerçek işletme kayıtları kullanılmadı.\n"
      "KBS rotası demo profilde açılamadı. Market, Raporlar ve Kişisel Görünüm testlerinin bazı\n"
      "beklentileri mevcut arayüzle uyuşmadı; yalnızca gerçekten yakalanan görseller arşivlendi.\n"
      "Companion: node scripts/smoke-android-device-ui.mjs --no-build --design-capture-only --gallery-pair\n"
      "Bayi: node scripts/smoke-dealer-android-device.mjs --gallery --online-build\n"
      "Bayi yatay: node scripts/smoke-dealer-android-device.mjs --gallery --online-build --landscape-viewport\n"
      "Galeri: python3 scripts/build-android-ui-gallery.py\n",encoding="utf-8")
    zipped=ROOT.parent/"android-ui-gallery.zip"
    with zipfile.ZipFile(zipped,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=5) as archive:
        for file in ROOT.rglob("*"):
            if file.is_file():archive.write(file,(Path("android-ui-gallery")/file.relative_to(ROOT)).as_posix())
    for orientation in ORIENTATIONS:
        orientation_zip = ROOT.parent / ("android-ui-" + orientation + ".zip")
        with zipfile.ZipFile(orientation_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=5) as package:
            for app in APPS:
                for image in (ROOT / app / orientation).glob("*.png"):
                    package.write(image, image.relative_to(ROOT).as_posix())
            for app in APPS:
                overview = ROOT / ("ozet-" + app + "-" + orientation + ".jpg")
                if overview.exists(): package.write(overview,overview.name)
            package.write(ROOT / "README.md","README.md")
        print("YÖN PAKETİ",orientation,orientation_zip)
    print("GALERİ",ROOT/"index.html")
    print("ZIP",zipped)
    print("GÖRÜNTÜ",len(manifest))
    print("ÖZET",*summaries,sep="\n")
if __name__ == "__main__": main()
