# Gün Payı Telegram sunucusu — bilgisayar kurulumu

Bu klasör yalnız sunucuyu hazırlayan kişi içindir. Telefonda servis adresi, kurulum anahtarı, ZIP, terminal veya Cloudflare girişi istenmez. Telefonda iki alan vardır: bot tokenı ve kullanıcı ID’si.

## Bilgisayarda hazırlık

Cloudflare hesabı ve Node.js 20+ gerekir. Paket kökünde `npm install`, sonra `npm run deploy` çalışır. Cloudflare girişi kullanıcı tarafından tamamlanır; script Worker’ı ve SQLite Durable Object bağını yayınlar. Ücretli plan etkinleştirmez. Hesabın kota ve ücretleri geçerlidir.

Kurulum sağlık kontrolünden geçince çıkan `{ "serviceUrl": "https://…workers.dev" }` yapılandırmasını Gün Payı kaynak kodundaki `dist/telegram-config.json` dosyasına koyup Site’ı normal kaynak/yayın akışıyla yayınla. Kaynak checkout erişimi varsa script `npm run deploy -- --config-output /tam/yol/dist/telegram-config.json` ile aynı dosyayı yazabilir. Bu dosyada sır yoktur. Sunucu adresi tarayıcıya otomatik gelir ve eski PWA önbelleğinden alınmaz.

Bu çalışma ortamında açık Cloudflare oturumu olmadan gerçek sunucu dağıtımı tamamlanamaz. Boş servis adresi, telefonda “Sunucu hazırlığı bekleniyor” durumunu ve devre dışı bağlantı düğmelerini gösterir. Kurulmuş gibi davranmaz.

## Telefonda bağlantı

1. @BotFather ile bu uygulama için ayrı bot oluştur, tokenı uygulamaya yapıştır.
2. Kendi botunu açıp Başlat’a dokun. Uygulamadaki ID’mi bul ile kendi adını doğrula veya sayısal ID’ni yapıştır.
3. Telegram’ı bağla. Deneme mesajı, ardından uygulama kapalıyken 1 dakika testi yap.

## Erişim ve veri

Yeni bağlantılar tokenı Telegram getMe/getChat ile doğrular. Her bot ayrı Durable Object içindedir; başka botun tokenı bir takvimi okuyamaz veya değiştiremez. Kurulum anahtarı gerekmez. Mevcut v4.0 servisler, açıkça ayarlanmış PAIRING_KEY ile eski akışını koruyabilir; yeni telefon akışı bu modu kullanmaz. Yeni sunucuda PAIRING_KEY oluşturma.

Her cihaz ayrı rastgele erişim anahtarı alır; yeniden bağlamak önceki anahtarı iptal eder. Token sunucuda, cihaz anahtarı localStorage’da kalır; JSON ajanda yedeğine girmez. Kurulum denemeleri IP başına yaklaşık 20/dakika ile sınırlıdır. Bot tokenı URL veya günlüklere yazılmaz.

ID bulma yalnız kendi botunun gelen özel mesajlarını okur; grup ve bot mesajlarını almaz. Birden fazla kişi varsa kullanıcı seçim yapar. Başka servise bağlı botun webhook’u değiştirilmez. Botu daha önce bağlayan kişi aynı gerçek tokenla kayıtlı ID’sini alabilir.

Webhook sırrı ve kayıtlı özel sohbet/kullanıcı ID’si birlikte zorunludur. Planların hatırlatma kopyası sunucudadır; mevcut notlar topluca aktarılmaz. Telegram’dan gelen yeni görev/notlar ajanda açılınca önce cihaza kaydedilir, sonra takvim aynası gönderilir. `/ekle yarın 09:00 Spor`, `/not fikir`, `/bugun`, `/yarin`, `/hafta`, `/tamam 1` ve Tamamlandı düğmesi desteklenir.

Alarm sayfa kapalıyken çalışır. Ağ/Telegram/telefon/bileklik teslimi ve tam saniye garantisi verilmez. Kesin 429/5xx sınırlı yeniden denenir; belirsiz ağ sonucunda kopya mesajı önlemek için otomatik tekrar yoktur. Mi Band’a Telegram telefon bildirimiyle ulaşılır. Ses mesajı, görsel üretimi ve serbest AI sohbeti bağlı değildir.
