# Gün Payı · Telegram hatırlatmaları

Bilgisayara hiçbir şey indirmeden Cloudflare üzerinden kurulabilen bildirim servisi.

## Tarayıcıdan kurulum

1. Cloudflare hesabında **Workers & Pages → Create application → GitHub** yolunu aç.
2. **dgdfurkan/gun-payi-telegram** reposunu ve **main** dalını seç.
3. Ayarları şöyle bırak:
   - **Worker adı:** `gun-payi-telegram`
   - **Build command:** boş
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** repo kökü (varsayılan)
4. **Save and Deploy** düğmesine bas.
5. Verilen **https://…workers.dev** adresini Gün Payı'nın bağlantısını hazırlayan kişiye gönder.

Bilgisayarına Node.js, ZIP veya başka bir program kurman gerekmez. Derleme Cloudflare sunucusunda yapılır. Ayrı bir ücretli plan açılmaz; hesabındaki kota ve ücretler geçerlidir.

**Bu repo tek başına çalışan bir sunucu değildir.** Kendi Cloudflare hesabında Deploy tamamlanmadan ve ajandaya servis adresi bağlanmadan Telegram gönderimi başlamaz.

## Telefonda

Servis bağlandıktan sonra Gün Payı → Ayarlar → Telegram bölümünde yalnız:

- **Bot tokenı**
- **Telegram kullanıcı ID**

alanları vardır. Kendi botuna Telegram'da **Başlat** dedikten sonra **ID’mi bul** ID'ni alabilir. Birden fazla kişi bulunursa kendi hesabını seç.

Bot tokenını veya Cloudflare anahtarlarını GitHub'a yazma. Telefon bağlantısı kendi botunu doğrular ve tokenı yalnız kendi Cloudflare sunucunda saklar. Telefona ayrıca servis adresi ya da kurulum anahtarı girilmez.

Önce deneme mesajını, ardından **1 dk. sonra dene** düğmesiyle uygulama kapalıyken teslimi kontrol et. Gerçek Telegram/Mi Band teslimi ayrıca test edilmelidir.

## Desteklenen işlemler

`/ekle yarın 09:00 Spor`, `/not Aklımdaki fikir`, `/bugun`, `/yarin`, `/hafta`, `/tamam 1` ve hatırlatmadaki **Tamamlandı** düğmesi.

Düz mesaj not olur. Telegram'dan gelen değişiklikler ajanda açılınca alınır. Serbest AI sohbeti ve ses mesajı çözümleme bağlı değildir.

## Teknik notlar

- Her doğrulanmış bot ayrı SQLite Durable Object alanında tutulur; native alarm PWA'dan bağımsız çalışır.
- Webhook sırrı, özel sohbet ve kullanıcı ID kontrolü birlikte uygulanır.
- Başka servisin webhook'u değiştirilmez.
- Kurulum uçları yaklaşık 20 deneme/dakika IP limitiyle korunur.
- Planların hatırlatma kopyası sunucuda tutulur; notlar topluca aktarılmaz.
- Cihaz erişim anahtarı yenilenebilir, token durum yanıtlarına yazılmaz.
- Mesaj teslimi ağ, Telegram ve telefon/bileklik ayarlarına bağlıdır; tam saniye garantisi yoktur.
- Mi Band'a Telegram telefon bildirimleri üzerinden ulaşılır.

Kontroller Node.js testleri, sözdizimi doğrulaması ve Cloudflare paketleme denemesini içerir. Testler gerçek Telegram yerine sahte yanıtlar kullanır.
