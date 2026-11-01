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
- `scheme=https` (adres ipucu; kimlik doğrulaması değildir)

Port sabit kimlik değildir. Masaüstü uygun bir portta dinler ve gerçek port discovery
kaydıyla duyurulur. Android IP veya portu kalıcı hedef kimliği olarak kabul etmez.

HTTPS API prefix:

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

Ürün tek HTTPS dinleyicisinde request/response kullanır. WebSocket/SSE zorunlu değildir. Gerçek push
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

Masaüstü eşleştirmesi varsayılan olarak kapalıdır. Güvenilir ana renderer,
kilit açıkken ve kalıcı `service.android` + `localNetworkEnabled` kapıları açıkken
`androidDevice:beginLocalPairing(deviceId)` çağırır. Masaüstü CSPRNG ile 256-bit
`yald1.<64 hex>` credential üretir. Oturum RAM'de `desktop_id + device_id` kimliklerine
bağlıdır; en fazla 120 saniye yaşar (monotonic süre), beş hatalı credential/cihaz
başvurusunda kapanır. Yeni begin önceki oturumu değiştirir. Read/cancel aynı trusted
main-frame, kilit, capability ve LAN IPC kapılarından geçer. Credential yalnız açık
başlatma sonrasında masaüstü Android ayarlarında gösterilir; public status, mDNS,
log, SQLite, outbox veya Web yayınına eklenmez.

Telefon `POST /local/v1/pair` isteğinde `pairing_ticket` alanına bu credentialı,
`device_id`, `device_name`, `app_version` alanlarına kendi bilgilerini koyar. Yeni yol
Web URL veya sync secret okumaz. Servis her başvuruda kilit/capability/LAN kapılarını,
masaüstü ve telefon kimliğini, süreyi ve credentialı doğrular; session başarıdan önce
senkron olarak tüketilir. Başarısız DB yazımı da yeni açık begin gerektirir. Kilit,
servis stop, uygulama kapanışı ve LAN/capability kapatılması oturumu iptal eder.

Başarılı eşleştirme sonrasında:

- telefon `desktop_id` + `yal_...` local credential saklar;
- masaüstü local credentialın yalnız SHA-256 hash'ini mevcut tabloda saklar;
- yeni cihaz pasif/onay bekleyen kayıttır; eşleştirme operasyon yetkisi vermez;
- önceden onaylı cihazın rolü/aktifliği/izinleri korunur; yeniden eşleşme tokenı değiştirir;
- `/summary` cihaz profiline göre redakte edilir; `/action` mevcut domain izinlerini kullanır;
- revoke mevcut transaction içinde local credentialı geçersiz kılar; tekrar eşleştirme
  revoke'u kaldırmaz, önce masaüstünden yeniden yetkilendirme gerekir.

**S3 ürün geçişi:** Masaüstü uygulama hazır olduğunda `app.getPath('userData')` ve
Electron safeStorage ile tek kurulumluk P-256 kimliği oluşturulur/yüklenir. Pair,
status, summary ve action aynı HTTPS dinleyicisini kullanır; HTTP fallback yoktur.
QR (`yapair3`) yalnız çalışan dinleyicinin gerçek portu, erişilebilir özel IPv4 adresi
ve SPKI pininden üretilir. USB tether arayüzü Wi-Fi'dan önce seçilir. QR öncesinde,
resume sırasında ve arayüz değişikliği kontrolünde (5 saniye) sertifika SAN'ları aynı
anahtarla yenilenir. Yeniden başlatma ve sertifika yenilemesi pini değiştirmez.
Hosting imzalı `yalp1` artık kabul edilmez; yalnız açık `yald1` oturumu geçerlidir.

**Güvenlik sınırı:** Android TLS doğrulaması credential gönderilmeden önce persisted
SPKI pini, sertifika geçerliliği ve IP SAN'ını kontrol eder. mDNS yalnız HTTPS adres
ipucudur; eşleştirme güveni oluşturmaz. Web sitesi, USB debugging, ADB veya root
QR + USB internet paylaşımı / Wi-Fi akışı için gerekmez. Linux'ta safeStorage
kullanılamıyorsa veya `basic_text` ise LAN kapalı kalır; QR paneli GNOME Keyring /
KWallet açılıp uygulamanın yeniden başlatılmasını ister. Bozuk/kayıp kayıt otomatik
yeniden üretilmez. Bu backend sorunu dış ortam engelidir; güvensiz depolama açılmaz.
Geçersiz JSON hatalarında payload/secret içerebilen ham exception loglanmaz.

## Kritik mevcut uyumluluk işleri

### Android ActionOutbox

Bugünkü `ActionOutbox` bekleyen action hedefini endpoint + credential fingerprintine
bağlar. Aynı mantık korunursa LOCAL -> HOSTING fallback sırasında aynı işletmeye ait
bekleyen action farklı hedef sayılabilir.

Yeni modelde action kimliği transporttan bağımsız olmalıdır. Action bir işletme/desktop
eşleşmesine bağlı kalır; teslim kanalı local veya hosting olabilir. Aynı action ID'nin
tekrar teslimi masaüstü receipt/idempotency katmanında güvenli kalmalıdır.

Android çalışma verisi current transport-neutral outbox anahtarıyla başlar. Tarihsel çalışma verisi için migration/fallback yoktur; gerekirse test/kurulum verisi sıfırlanabilir.

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
- eski SharedPreferences çalışma kayıtlarını migrate etme; v2 anahtarları temiz baseline olarak kullan;
- eski test/kurulum verisinin gerektiğinde sıfırlanabileceğini kabul et.

### Faz 3 — Desktop Local Companion API

- Electron main process içinde yalnız LAN'a hizmet eden tek HTTPS server kullan;
- snapshot üretimini `main.ts` dışındaki ortak servise taşı;
- local action endpointini mevcut `applyAndroidAction` / permission sınırına bağla;
- yeni bir action uygulama motoru veya ikinci izin sistemi oluşturma;
- persistent desktop log'a `local-companion` olaylarını yaz.

### Faz 4 — Pairing

- desktop local credential store: `android_local_credentials`;
- local token biçimi `yal_<64 hex>`; plaintext yalnız başarılı pairing yanıtında telefona verilir, masaüstünde yalnız SHA-256 hash tutulur;
- yeni local-only cihaz eşleşince pasif/onay bekleyen Android cihaz kaydı açılır; pairing tek başına operasyon yetkisi vermez;
- pairing secret kısa ömürlü ve başarılı kullanımda tek kullanımlıktır;
- ilk dört yanlış credential/cihaz denemesi oturumu korur; beşinci deneme kapatır;
- cihaz revoke akışı local credentialı da aynı transaction içinde kapatır;
- yeniden etkinleştirilen revoke edilmiş cihaz eski local tokenı kullanamaz; yeniden pairing gerekir;
- mevcut geliştirme verisi migrate edilmez; baseline şema değiştiği için gerçek pairing testi öncesi temiz veri/reset kabul edilir;
- daha sonra QR UI bağlanabilecek provider-neutral pairing sözleşmesi kullanılır.

### Faz 5 — Discovery ve hybrid router

- desktop DNS-SD/mDNS ilanı;
- Android `NsdManager` discovery;
- mevcut local credential ile `desktop_id` için otomatik bağlantı; ilk/yeniden eşleştirmede açık masaüstü oturumu;
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

### 3A hedefli doğrulama

`npx tsc -p apps/desktop-app/tsconfig.electron.json` ardından
`node scripts/smoke-local-companion-server.mjs --contracts-only`, socket açmadan
gerçek pairing/SQLite, IPC güvenlik kapıları, request handler, pending/redaction,
revoke, mDNS ve log gizliliği sözleşmelerini çalıştırır. Flagsiz aynı smoke ayrıca
yalnız `NODE_ENV=test` + `testOnlyHttp` ile localhost HTTP mock listenerını doğrular.
Ürün bu seçeneği kullanmaz. Sandbox `listen EPERM` verirse listener testleri
yeniden denenmez; flagsiz smoke ve `node scripts/smoke-android-device-token.mjs`
host ortamında çalıştırılmalıdır. S3 için ayrıca:

```sh
node scripts/smoke-local-companion-tls.mjs --contracts-only
node scripts/smoke-local-pairing-qr.mjs
node scripts/smoke-local-pairing-security.mjs
```

S3 security smoke gerçek main/IPC/reconcile kodunu ve TLS kimliğini, mock soket ile
çalıştırır. Gerçek backend ve ağ handshake kanıtı değildir. Normal host üzerinde
flagsiz TLS/server smoke tekrar kontrol edildikten ve güvenli safeStorage backend'i
doğrulandıktan sonra fiziksel telefonda QR → pending/onay/izinler → yeniden başlatma,
USB/Wi-Fi/DHCP değişimi → yanlış pin/SAN reddi → revoke → offline outbox/receipt
replay doğrulanmalıdır. Telefon kurulumu ve büyük doğrulama setleri kullanıcıya aittir.
