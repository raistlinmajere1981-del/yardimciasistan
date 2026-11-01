# OpenCode API delegasyonu — Yardımcı Asistan (2026-11-01)

OpenCode v2.2.1, çalışma dizini `/home/raistlin/YardimciWorkspace/YardimciAsistan`, varsayılan sunucu `http://127.0.0.1:4096`.

## Doğrulanmış bağlantı kuralı

Sunucu API'si kimlik doğrulaması ister. Parola **yalnız ortam değişkeni** `OPENCODE_PASSWORD` ile sağlanır; kaynak dosyasına, prompt'a, komut satırı argümanına ve günlüğe yazılmaz.

Doğru API sözleşmesi:
- `POST /api/session`: `model: {id, providerID, variant}` burada atanır; ör. `{id:"deepseek-v4.1-flash-free", providerID:"opencode", variant:"high"}`.
- `POST /api/session/{sessionID}/prompt`: yalnız `text` içeren mesaj; `parts` beklenmez ve **model/variant burada değiştirilemez**.
- `GET /api/session/{sessionID}/message`, `GET /api/session/{sessionID}`: asenkron yanıt, idle ve gerçek model doğrulanır.
- Model istemi ile yanıt modeli farklıysa sessiz fallback kabul edilmez. Kullanıcının gördüğü `Greeting` oturumuyla geliştirme oturumlarını karıştırma.

## Yardımcı komut

```bash
cd /home/raistlin/YardimciWorkspace/YardimciAsistan
node scripts/run-opencode-agent.mjs \
  --title "Nexa - C29 Android" \
  --model opencode/deepseek-v4.1-flash-free \
  --reasoning high \
  --prompt-file /tmp/c29-talimat.txt
```

`--reasoning max` mimari inceleme/ağır denetim için, `high` küçük geliştirme/düzeltme dilimleri için. `--session ses_...` aynı konuya devam eder, yalnız model/variant aynıysa kabul edilir. `--no-wait` yalnız mesaja sıra verir; sonuç alınmış sayılmaz. `--timeout-ms` ile bekleme sınırlanır. Helper çıktısı JSON'dur.

Test:
```bash
node --test scripts/test-run-opencode-agent.mjs
```

2026-11-01: 9/9 sahte API kontrat testi PASS; gerçek High oturumunda `RUNNER_HIGH_OK`, gerçek Max oturumunda `RUNNER_MAX_OK` yanıtları ve seçili model/variant kayıtları doğrulandı.

## C29 gerçek telefon test notu

Telefon SM-J700F / Android 13; test paketleri ve verileri silinebilir. `product-version.json` resmi değer `2.1.0/16`; geçici `2.1.1/17` derlemesi sonrası eski değer otomatik geri getirilir. Yayın manifestleri canlı sitede olmadıkça `Güncellemeyi denetle` uygulama içi uçtan uca başarıyla sınanmış **sayılmaz**. ADB `install -r` yalnız Android paket yöneticisinin imzalı yerinde kurulum testidir. Kalıcı ürün verisi/migrasyon geriye uyumluluk çalışması ilk gerçek kullanıma bırakılmıştır. Manuel backup/restore ve `legacy-data` özellikleri gereksiz yere değiştirilmez.
