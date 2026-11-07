# Alwaysdata e-posta kurulum notu

Durum: şifreli hesap token kuyruğu ve sipariş/durum olayları yerelde gerçek TLS SMTP fixture ile doğrulandı; gerçek alıcıya gönderim yapılmadı. V2'nin kalan kabul işleri `ECOMMERCE_V2.md` içinde belirtilir.

Öneri: mevcut Alwaysdata hesabında, işletmenin kontrol ettiği alan adına ait doğrulanmış gönderici ile kimlik doğrulamalı SMTP. [Alwaysdata SMTP belgesi](https://help.alwaysdata.com/en/docs/e-mails/use-an-e-mail-address/) hesap adına bağlı SMTP hostunu, 465/TLS veya 587/STARTTLS portlarını tanımlar. Kod doğrulanmış TLS ve kimlik doğrulama kullanır.

PHP web sürecine **ve** CLI zamanlanmış göreve aynı özel ayarları verin. Ortam değişkenleri veya HTTP erişimine kapalı, mevcut `config/account.local.php` kullanılabilir. Bu dosya ve değerleri Git'e, sohbet mesajına, komut argümanına veya loga koymayın.

| Değişken | Değer |
| --- | --- |
| `YA_ACCOUNT_SMTP_HOST` | Sağlayıcının hesap için belirttiği host |
| `YA_ACCOUNT_SMTP_PORT` | `465` veya `587` |
| `YA_ACCOUNT_SMTP_TLS` | 465 için `implicit`; 587 için `starttls` |
| `YA_ACCOUNT_SMTP_USER` | Yetkili posta hesabı |
| `YA_ACCOUNT_SMTP_PASSWORD` | Sunucuda özel tanımlanan parola |
| `YA_ACCOUNT_MAIL_FROM` | Yetkili gönderici e-posta adresi |
| `YA_ACCOUNT_SITE_URL` | HTTPS Hesabım sayfasının tam adresi |
| `YA_ACCOUNT_MODULE_URL` | Aynı origin üzerindeki HTTPS modül kökü |
| `YA_ACCOUNT_MAIL_ENCRYPTION_KEY` | 32 rastgele baytın base64 değeri; sunucunun özel sır deposunda oluşturulur, HTTP ve CLI aynı anahtarı kullanır |
| `YA_COMMERCE_NOTIFICATION_EMAIL` | İsteğe bağlı işletme bildirim alıcısı |

[Alwaysdata görev panelinde](https://help.alwaysdata.com/en/docs/web-hosting/tasks/) dakikalık bir görevle `php /home/HESAP/www/yardimci-asistan/lib/commerce-mail-worker.php` çalıştırılabilir. Gerçek yolu sunucudaki kuruluma göre seçin. Worker en fazla 20 ileti işler. Çakışan süreçleri SQLite lease ayırır. Hatalı worker çıkışını ve kalıcı `failed` satırlarını operasyonel izlemeye bağlamak henüz tamamlanmadı.

Alan adının mevcut SPF kaydına sağlayıcının yetkisini ekleyin; ikinci bağımsız SPF kaydı oluşturmayın. Alwaysdata'nın DKIM ayarından çıkan seçici/kayıt değerini DNS'e taşıyın. DMARC için gönderen alan adı hizalamasını ve rapor alıcısını belirleyin. Gerçek DNS değerleri kullanılan alan adı ve sağlayıcı panelinden alınmalı. Ayrıntılar: [Alwaysdata SPF/DKIM/DMARC](https://help.alwaysdata.com/en/docs/emails/outgoing-emails/set-up-spf-dkim-dmarc/).

Doğrulama: işletmenin kontrol ettiği bir test alıcısına kayıt doğrulaması ve sentetik sipariş e-postası gönderin; kuyruk attempts/status/sent_at alanlarını, mesaj içeriğini ve gelen kutusundaki Authentication-Results SPF/DKIM/DMARC sonuçlarını inceleyin. SMTP hatasında pending/backoff, bağlantı düzeldikten sonra gönderim ve aynı olayın normal tekrarda tekrar gönderilmemesini sınayın. E-posta sonucu hiçbir aşamada ödeme onayı sayılmamalı.

Eksik dış aktivasyonlar: gerçek gönderen hesabı/SMTP ayarı, token şifreleme anahtarı, DNS denetimi, CLI görev kurulumu ve işletmenin kontrol ettiği dış alıcıda teslim/hizalama denetimi. Bu bilgilerin veya parolaların sohbete gönderilmesi gerekmez; sunucuda özel olarak tanımlanmalıdır. DNS için gerçek SPF/DKIM seçici/değerleri sağlayıcının mevcut panelinden alınmalı; bu belge alan adına özel değer uydurmaz.

Hesap token iletileri artık aynı outbox'tadır; gövde AES-256-GCM ile şifrelenir. Worker süre sonu, tüketilme, yeni tokenla geçersiz kılınma, hesap sürümü ve Online Satış kapısını yeniden denetler. Geçersiz token iletisi `cancelled`, gönderim hatası geri çekilmeli `pending`, sekiz başarısız/yarım kalmış denemeden sonra `failed` olur. Kimlik anahtarı şifreleme anahtarı olarak kullanılmaz; ayrı rastgele anahtar gerekir. Anahtar eksikse kayıt/şifre kurtarma güvenli biçimde kapalı kalır. Sipariş e-postası ve misafir checkout, hesap token anahtarını gerektirmez.

Anahtar döndürme henüz bir key-ring/prosedürle otomatikleştirilmedi. Kuyruktaki eski token gövdelerinin okunabilmesi için anahtar korunmalı; anahtar değişirse o token iletileri yeniden üretilmeli. Anahtarı Git'e, sohbet mesajına, worker argümanına veya loga koymayın. Veritabanını açabilmek tek başına token gövdesini çözmeye yetmez.

Sipariş alındı/banka talimatı, havale bildirimi, onay/ret, hazırlanıyor, teslim ve iptal/kaydedilen banka iadesi olayları bağlıdır. Bu olayların hazır olması V2'nin bütün kabulünün tamamlandığı anlamına gelmez: teslim sonrası stok/finans iadesi ve Desktop UI/restore kabulü hâlâ açıktır.
