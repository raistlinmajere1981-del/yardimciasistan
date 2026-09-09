# Canlı Hosting Test Planı

Bu plan demo site, Yardımcı Asistan web modülü, local PC uygulaması ve Android
uygulamasını gerçek bir hosting üzerinde birlikte doğrulamak için kullanılır.

## Hedef

Tek hosting üzerinde şu yapı çalışmalıdır:

```text
public_html/
  index.html
  assets/
  yardimci-asistan/
    widget.js
    menu.html
    api/
    config/
    data/
    knowledge/
```

Demo site kökte açılır. Widget ve API dosyaları `/yardimci-asistan` altında
çalışır. PC ve Android uygulamaları aynı web modül adresini ve aynı sync
anahtarını kullanır.

## Paket Üretimi

Paketleyici Android indirmesi olarak debug APK değil, imzalı release APK kullanır.
Önce kalıcı keystore yapılandırmasıyla release dosyasını üretin; ayrıntılar
`docs/ANDROID_DISTRIBUTION.md` içindedir:

```bash
npm run android:release-apk
```

Canlı prova paketi tek komutla üretilebilir:

```bash
YARDIMCI_ASISTAN_HOSTING_ORIGIN="https://demo-domain.com" \
YARDIMCI_ASISTAN_DEPLOY_DISPLAY_NAME="Demo İşletme" \
YARDIMCI_ASISTAN_DEPLOY_WHATSAPP="+90 532 123 45 67" \
YARDIMCI_ASISTAN_DEPLOY_PHONE="+90 532 123 45 67" \
YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET="uzun-ve-tahmin-edilemeyen-bir-anahtar" \
npm run pack:hosting-demo
```

Canlı demo AI cevabı da test edilecekse, API anahtarı kaynak template'e
yazılmaz; paket içinde `config/ai.local.php` olarak üretilir ve
`artifacts/` altında kalır:

```bash
YARDIMCI_ASISTAN_DEPLOY_AI_ENABLED=1 \
YARDIMCI_ASISTAN_DEPLOY_AI_PROVIDER="openai_compatible" \
YARDIMCI_ASISTAN_DEPLOY_AI_BASE_URL="https://provider.example/v1/chat/completions" \
YARDIMCI_ASISTAN_DEPLOY_AI_MODEL="model-id" \
YARDIMCI_ASISTAN_DEPLOY_AI_API_KEY="test-api-key" \
YARDIMCI_ASISTAN_DEPLOY_AI_TIMEOUT_SECONDS=45 \
npm run pack:hosting-demo
```

Komut şu çıktıları üretir:

```text
artifacts/hosting-demo-deploy/public_html/
artifacts/hosting-demo-deploy/hosting-demo-public_html.tar.gz
artifacts/hosting-demo-deploy/manifest.json
```

`YARDIMCI_ASISTAN_HOSTING_ORIGIN` kök site adresidir. Web modülü varsayılan
olarak `/yardimci-asistan` altına yerleşir. Farklı alt yol gerekiyorsa:

```bash
YARDIMCI_ASISTAN_HOSTING_WEB_MODULE_PATH="/asistan"
```

## Yükleme

Hosting panelinde web kök klasörü bulunur. AWS Lightsail LAMP/Apache için bu
genellikle Bitnami kurulumundaki Apache web köküdür; panel veya SSH oturumunda
kesin yol kontrol edilmelidir.

Yükleme seçenekleri:

- Hosting paneli arşiv açabiliyorsa `hosting-demo-public_html.tar.gz` yüklenir
  ve içindeki `public_html/` içeriği web köküne taşınır.
- Arşiv açma yoksa `artifacts/hosting-demo-deploy/public_html/` içeriği FTP,
  SFTP veya dosya yöneticisiyle web köküne kopyalanır.

## İzinler

PHP yalnız güncel SQLite runtime dosyasına ve AI konuşma dosyasına yazabilmelidir:

```text
yardimci-asistan/data/yardimci-asistan.sqlite
yardimci-asistan/data/ai-conversations.json
```

Başlangıç için `data/` klasörü `755`, SQLite ve AI konuşma dosyası sahibi için
yazılabilir denenir. Yazma hatası görülürse hosting kullanıcısına göre klasör
izinleri düzeltilir; eski JSON veri dosyaları oluşturulmaz.

## Canlı Kontrol

Önce tarayıcıdan şu adresler açılır:

```text
https://demo-domain.com/
https://demo-domain.com/yardimci-asistan/menu.html
https://demo-domain.com/yardimci-asistan/api/menu.php
```

Sonra demo site widget'ından test talebi gönderilir. Başarılı kayıt sonrası
PC uygulamasında:

```text
Web modül adresi: https://demo-domain.com/yardimci-asistan
Sync anahtarı: paket üretirken verilen YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET
```

PC uygulamasında `Web Taleplerini Çek` ve ardından `Android'e Yayınla`
çalıştırılır.

Android uygulamasında aynı web modül adresi ve sync anahtarı girilir. `Canlı
Veriyi Çek` ile talepler, operasyon kartları ve günlük işler görünmelidir.
Android'de bir talep `Cevaplandı` yapıldığında hostingdeki durum değişmeli ve PC
uygulaması sonraki sync'te aynı durumu görmelidir.

## AI

İlk canlı prova AI kapalıyken de geçerli sayılır; `api/chat.php` güvenli
fallback cevap döndürür. Hosting ortam değişkeni destekliyorsa AI daha sonra
aktif edilir. Desteklemiyorsa sadece test amacıyla `config/ai.php` sunucu
tarafında düzenlenebilir; bu dosya frontend veya tarayıcıya açık düz metin
olarak servis edilmemelidir.

## Test Sonrası

AWS Lightsail veya benzeri ücretli test ortamında prova bittikten sonra sunucu
durdurulmalı veya silinmelidir. Static IP kullanıldıysa ayrı ücret oluşmaması
için kullanılmayan IP de kaldırılmalıdır.
