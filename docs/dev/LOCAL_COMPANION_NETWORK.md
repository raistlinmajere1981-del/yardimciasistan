# Local Companion Network

## Amaç

Android companion ile masaüstü uygulama aynı yerel ağdayken operasyon verisi ve Android
işlemleri firma hostingine uğramadan doğrudan masaüstü üzerinden taşınır. Hosting yolu
kaldırılmaz; yerel bağlantı bulunamadığında veya kullanılamadığında uzak erişim/fallback
olarak çalışmaya devam eder.

Bu çalışma mevcut local-first veri modelini değiştirmez:

- operasyon verisinin ana kopyası masaüstü SQLite'tır;
- web modülü uzak erişim ve web talepleri için güvenli değişim noktası olmaya devam eder;
- Android action kimlikleri ve masaüstü receipt/idempotency koruması korunur;
- Android rolü, aktiflik durumu ve izinleri masaüstü SQLite tarafından belirlenir.

## Hedef Akış

```text
                    aynı LAN
Android ── discovery ───────► Desktop Local Companion API
   │                                  │
   │                                  ▼
   │                            Desktop SQLite
   │                                  │
   │                                  └── mevcut web sync/outbox
   │
   └──────── HTTPS ─────────► Firma hostingi
                fallback
```

Bağlantı tercihi:

```text
local desktop ulaşılabilir
        │
       evet ──► LOCAL
        │
       hayır
        ▼
hosting ulaşılabilir ──► HOSTING
        │
       hayır
        ▼
telefon outbox/cache
```

## Protokol v1

Yerel servis DNS-SD/mDNS ile aşağıdaki servis tipi altında duyurulur:

```text
_yardimciasistan._tcp
```

Servis TXT metadata'sının minimum alanları:

- `protocol=1`
- `desktop_id=desktop-<UUID>`

Port sabit kimlik değildir. Masaüstü uygun bir portta dinler ve gerçek port discovery
kaydıyla duyurulur. Android IP veya portu kalıcı hedef kimliği olarak kabul etmez.

HTTP API prefix:

```text
/local/v1
```

İlk endpoint sözleşmesi:

```text
GET  /local/v1/status
POST /local/v1/summary
POST /local/v1/action
POST /local/v1/pair
```

İlk sürüm request/response HTTP kullanır. WebSocket/SSE zorunlu değildir. Gerçek push
gereksinimi oluşursa aynı kimlik ve yetki modeli korunarak ayrıca eklenebilir.

## Kimlik ve güvenlik sınırı

Hosting cihaz tokenı (`yat_...`) hosting SQLite tarafından doğrulanır; masaüstü bu
tokenın doğrulama kaydına sahip değildir. Bu nedenle local bağlantı hosting tokenını
taklit etmez veya masaüstüne kopyalamaz.

Yerel eşleştirme ayrı bir credential üretir:

```text
remote credential: yat_...
local credential:  yal_...
```

İlk eşleştirme masaüstünün ürettiği kısa ömürlü/tek kullanımlık pairing secret ile
yapılır. Başarılı eşleştirme sonrasında:

- telefon `desktop_id` + local credential saklar;
- masaüstü local credentialın yalnız hash'ini saklar;
- istekler kalıcı `device_id` taşır;
- masaüstü mevcut Android cihaz rolü/aktiflik/izin kontrollerini tekrar kullanır;
- cihaz revoke edildiğinde local credential da geçersiz kılınır.

Local HTTP ilk geliştirme ve güvenilir işletme LAN'ı için kullanılabilir. Protokol
tasarımı daha sonra TLS/certificate pinning eklenmesini engellememelidir.

## Kritik mevcut uyumluluk işleri

### Android ActionOutbox

Bugünkü `ActionOutbox` bekleyen action hedefini endpoint + credential fingerprintine
bağlar. Aynı mantık korunursa LOCAL -> HOSTING fallback sırasında aynı işletmeye ait
bekleyen action farklı hedef sayılabilir.

Yeni modelde action kimliği transporttan bağımsız olmalıdır. Action bir işletme/desktop
eşleşmesine bağlı kalır; teslim kanalı local veya hosting olabilir. Aynı action ID'nin
tekrar teslimi masaüstü receipt/idempotency katmanında güvenli kalmalıdır.

Migration sırasında mevcut `pending_android_actions_v1` kayıtları kaybedilmemelidir.

### Android OperationCache revision

Bugünkü cache tek `server_revision` tutar. Hosting revision ile desktop-local revision
aynı namespace değildir.

Cache revision anahtarı kaynak bazlı tutulmalıdır:

```text
hosting:<normalized-hosting-origin>
local:<desktop_id>
```

Bir kaynaktan gelen revision diğer kaynağın `not_modified` kararında kullanılmaz.
Ekranda gösterilen son başarılı snapshot ise transporttan bağımsız tek cache olarak
kalabilir.

## Aşamalı uygulama

### Faz 0 — Sözleşme ve çalışma branch'i

- bu dokümanı ve protokol sabitlerini ekle;
- mevcut hosting davranışını değiştirme;
- Actions sonucunu doğrulama kaynağı olarak kabul etme; limit doluysa local test bekle.

### Faz 1 — Android transport sınırı

- foreground ve background operasyon sync çağrılarını küçük bir provider-neutral
  interface arkasına al;
- mevcut `HostingSyncClient` davranışını adapter olarak aynen koru;
- image analysis/chat gibi yalnız hosting gerektiren işlevleri operasyon transportundan
  ayır;
- davranış değişikliği yapmadan mevcut testleri geçir.

### Faz 2 — Outbox/cache transport bağımsızlığı

- action target modelini LOCAL/HOSTING geçişine dayanıklı hale getir;
- source-keyed revision cache ekle;
- eski SharedPreferences kayıtları için migration testleri ekle.

### Faz 3 — Desktop Local Companion API

- Electron main process içinde yalnız LAN'a hizmet eden küçük HTTP server ekle;
- snapshot üretimini `main.ts` dışındaki ortak servise taşı;
- local action endpointini mevcut `applyAndroidAction` / permission sınırına bağla;
- yeni bir action uygulama motoru veya ikinci izin sistemi oluşturma;
- persistent desktop log'a `local-companion` olaylarını yaz.

### Faz 4 — Pairing

- desktop local credential store;
- tek kullanımlık pairing secret;
- cihaz revoke akışının local credentialı da kapatması;
- daha sonra QR UI bağlanabilecek provider-neutral pairing sözleşmesi.

### Faz 5 — Discovery ve hybrid router

- desktop DNS-SD/mDNS ilanı;
- Android `NsdManager` discovery;
- yalnız önceden eşleşmiş `desktop_id` için otomatik local bağlantı;
- kısa local timeout sonrası hosting fallback;
- local ve hosting hata durumlarını kullanıcıya tek bir sync hatası gibi yansıtmama.

### Faz 6 — Saha sertleştirme

Aşağıdaki durumlar özellikle doğrulanır:

- internet yok, LAN açık;
- LAN yok, mobil internet açık;
- modem PC'ye yeni DHCP adresi verdi;
- desktop yeniden başladı ve port değişti;
- action gönderilirken local bağlantı koptu;
- aynı action local denemeden sonra hosting ile yeniden teslim edildi;
- iki Android cihaz aynı anda işlem gönderdi;
- revoke edilmiş cihaz local endpointi denedi;
- Windows Firewall / Linux firewall;
- Android foreground/background geçişleri.

## Lokal doğrulama akışı

Actions kotası dolu olduğunda branch lokalde çekilir:

```bash
git fetch origin
git switch feat/local-companion-network
git pull --ff-only
git status --short --branch
```

Her fazdan sonra önce ilgili dar kontroller, ardından mümkünse genel kontroller çalıştırılır.
İlk temel kontrol seti:

```bash
npm run typecheck --workspace=@yardimci-asistan/sync-core
npm test --workspace=@yardimci-asistan/sync-core
npm run android:check
npm run typecheck --workspace=apps/desktop-app
```

Root script isimleri değişmişse `package.json` içindeki eşdeğer komutlar kullanılır.
Test kırığı varsa kırığın yeni davranıştan mı yoksa mevcut fixture/smoke varsayımından mı
geldiği ayrıştırılmadan production davranışı değiştirilmez.

## Codex / Astra kullanım sınırı

Normal refactor, sabit sözleşme, küçük test güncellemeleri ve mekanik dosya taşıma repo
üzerinde ilerletilebilir. Codex CLI özellikle local compile/test ve hızlı kırık düzeltmede
kullanılabilir.

Daha yüksek yetenek bütçesi şu noktalara saklanmalıdır:

- Android NSD yaşam döngüsü / API seviye farklarından doğan zor discovery hataları;
- ağ değişimi sırasında action exactly-once/idempotency yarışları;
- foreground/background reconnect yarışları;
- firewall ve çoklu network interface davranışları;
- pairing/security threat-model kaynaklı karmaşık entegrasyon hataları.
