# Devir notu

Güncelleme: **18 Kasım 2026**. Sürüm **5.0.0**.

## Ne değişti (4.x → 5.0)

Kullanıcı arayüzün sadeleşmesini, iPhone SE 2'de gerçek uygulama hissini, sesle eklemenin çok iyi çalışmasını, Telegram'a token/ID girmeden bağlanmayı, widget'ı ve düşük pil tüketimini istedi. Arayüz baştan yazıldı:

- **Barındırma:** ChatGPT Sites'tan Cloudflare'e taşındı. Uygulama ve API tek Worker'da, tek adreste (`gun-payi-telegram.frkngndz60.workers.dev`). `main`'e push otomatik yayın. Eski Sites adresi ayrı yaşamaya devam eder; yeni adres eski IndexedDB'ye erişemez, veri pano yedeğiyle taşınır (schema 1 içe aktarma var).
- **Kapsam:** Plan (Gün/Hafta/Ay), Notlar, Özet (haftalık değerlendirme), Ayarlar. Gelişim hedefleri kullanıcı kararıyla kaldırıldı.
- **Sesle ekleme:** `web/js/parse.js` Türkçe kural tabanlı çözümleyici (gün, saat, aralık, tekrar, aylık, hatırlatma listeleri, fiil kalıbı temizliği). Şüphe kalırsa Workers AI yedeği. Uygulamada canlı önizleme çipleri.
- **Telegram:** varsayılan bot + `t.me/<bot>?start=<kod>` derin linkiyle tek dokunuş bağlantı. Bota yazı ve sesli mesaj (Whisper). Hatırlatmada Tamamlandı / 10 dk ertele. Sabah özeti isteğe bağlı.
- **Widget:** `/api/quick` uç noktası; Ayarlar'da Kısayollar kurulum adımları.

## Doğrulananlar

- `npm test`: 49 test (çözümleyici 31, uygulama 7, Worker 11; Telegram ve AI sahte yanıtla).
- `wrangler deploy --dry-run` paketleme ve bağlamalar.
- `wrangler dev` ile 375×667 tarayıcıda karşılama, ekleme, çip düzenleme, tamamlama, düzenleme, hafta/ay, notlar, özet, ayarlar; açık ve koyu tema.
- Canlı (18 Kasım): sürüm 5.0.0 `wrangler deploy` ile yayında, `BOT_TOKEN` tanımlı (bot: @hatirlat_gunduz_bot), webhook kuruldu. Kullanıcı telefondan bağlandı ve anlık deneme mesajını aldı.
- Not: Cloudflare Workers Builds `main` push'larında derleme tetiklemiyor (son otomatik derleme ilk kurulumdaydı). Yayın şimdilik bu Mac'ten `npx wrangler deploy`.

## Henüz doğrulanmayanlar

Bunlar gerçek cihaz/hesap ister, yapıldı denmemeli:

1. Uygulama kapalıyken zamanlı hatırlatma ("1 dk sonra dene" ve gerçek plan).
2. Mesajın Mi Band'e ulaşması.
3. Whisper'ın Telegram OGG/Opus sesini çözmesi ve Llama JSON modunun gerçek yanıtı.
4. iPhone'da mikrofon izni davranışı, klavye dikte, iOS 18+ titreşim, açılış ekranı.
5. Kısayollar widget'ı ile `/api/quick` (elle kurulum; imzalı `.shortcut` dosyası henüz yok).

## Sıradaki olası işler

- İmzalı `kisayol.shortcut` dosyası (Mac'te `shortcuts sign`; imza Apple kimliğini içerebilir, kullanıcı onayı gerekir). Dosya `web/kisayol.shortcut` olarak konursa Ayarlar'daki düğme kendiliğinden görünür.
- Biweekly ("iki haftada bir") gibi desteklenmeyen tekrarlar şu an AI yedeğinde haftalığa iner.
