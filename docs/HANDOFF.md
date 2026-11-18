# Devir notu

Güncelleme: **18 Kasım 2026**. Sürüm **5.1.0**.

## Ne değişti (4.x → 5.0)

Kullanıcı arayüzün sadeleşmesini, iPhone SE 2'de gerçek uygulama hissini, sesle eklemenin çok iyi çalışmasını, Telegram'a token/ID girmeden bağlanmayı, widget'ı ve düşük pil tüketimini istedi. Arayüz baştan yazıldı:

- **Barındırma:** ChatGPT Sites'tan Cloudflare'e taşındı. Uygulama ve API tek Worker'da, tek adreste (`gun-payi-telegram.frkngndz60.workers.dev`). Yayın bu Mac'ten `npx wrangler deploy` (Workers Builds push'ta tetiklenmiyor). Eski Sites adresi ayrı yaşamaya devam eder; yeni adres eski IndexedDB'ye erişemez, veri pano yedeğiyle taşınır (schema 1 içe aktarma var).
- **Kapsam:** Plan (Gün/Hafta/Ay), Notlar, Özet (haftalık değerlendirme), Ayarlar. Gelişim hedefleri kullanıcı kararıyla kaldırıldı.
- **Sesle ekleme:** `web/js/parse.js` Türkçe kural tabanlı çözümleyici (gün, saat, aralık, tekrar, aylık, hatırlatma listeleri, fiil kalıbı temizliği). Şüphe kalırsa Workers AI yedeği. Uygulamada canlı önizleme çipleri.
- **Telegram:** varsayılan bot + `t.me/<bot>?start=<kod>` derin linkiyle tek dokunuş bağlantı. Bota yazı ve sesli mesaj (Whisper). Hatırlatmada Tamamlandı / 10 dk ertele. Sabah özeti isteğe bağlı.
- **Widget:** `/api/quick` uç noktası; Ayarlar'da Kısayollar kurulum adımları.

## 5.1 (kullanıcı geri bildirimi)

- **Tema:** varsayılan Aydınlık; Ayarlar → Görünüm'de Aydınlık, Lavanta, Nane, Okyanus, Gün batımı, Karanlık, Sistem. `prefs.theme` + `localStorage['gp-theme']` (ilk boyamadan önce uygulanır).
- **Ekleme paneli:** kompakt alt sayfa, klavye kendiliğinden açılmaz, büyük mikrofon. Klavye açılınca panel `visualViewport` ile üstüne çıkar. Uygulamayı küçülten pahalı animasyon kaldırıldı.
- **Seçiciler (`web/js/pickers.js`):** yerel tarih/saat girişi iOS'ta yeniden çizimde kapandığı için uygulama içi takvim, kaydırmalı saat çarkı, özel hatırlatma (sn/dk/saat/gün). Hatırlatmalar dakika cinsinden, saniye için kesirli (0.25 = 15 sn).
- **İkonlar (`web/js/categories.js`):** başlıktan kategori (arama → telefon, spor, ilaç, ödeme…), elle seçilebilir (`item.icon`). Bot mesajlarında emoji.
- **Ses:** sürekli dinleme, 1,8 sn sessizlikte durur; iOS'un birikimli sonuçları tekrar yazılmaz.
- **Telegram taslak:** serbest metin/ses önce düğmeli taslak olur (Ekle, Vazgeç, Gün, Saat, Hatırlat, Tekrar); taslak açıkken "yarın 10'da" yazmak taslağı düzeltir. Widget (`/api/quick`) doğrudan ekler.
- **Widget:** imzalı `web/kisayol.shortcut` (imza sertifikasında kişisel bilgi yok, yalnız Apple'ın anonim kimliği). Uygulama kodu panoya kopyalayıp dosyayı açar; Kısayollar soruda kodu ister.

## Doğrulananlar

- `npm test`: 50 test (çözümleyici, uygulama, Worker; Telegram ve AI sahte yanıtla).
- `wrangler deploy --dry-run` paketleme ve bağlamalar.
- `wrangler dev` ile 375×667 tarayıcıda karşılama, ekleme, çip düzenleme, tamamlama, düzenleme, hafta/ay, notlar, özet, ayarlar; açık ve koyu tema.
- Canlı (18 Kasım): sürüm 5.0.0 `wrangler deploy` ile yayında, `BOT_TOKEN` tanımlı (bot: @hatirlat_gunduz_bot), webhook kuruldu. Kullanıcı telefondan bağlandı ve anlık deneme mesajını aldı.
- Not: Cloudflare Workers Builds `main` push'larında derleme tetiklemiyor (son otomatik derleme ilk kurulumdaydı). Yayın şimdilik bu Mac'ten `npx wrangler deploy`.

## Henüz doğrulanmayanlar

Bunlar gerçek cihaz/hesap ister, yapıldı denmemeli:

1. Uygulama kapalıyken zamanlı hatırlatma ("1 dk sonra dene" ve gerçek plan).
2. Mesajın Mi Band'e ulaşması.
3. Llama JSON modunun (AI yedeği) gerçek yanıtı. Telegram sesli mesajın Whisper ile yazıya dökülmesi kullanıcı tarafından doğrulandı.
4. iPhone'da mikrofon izni davranışı, klavye dikte, iOS 18+ titreşim, açılış ekranı.
5. İmzalı kısayolun iPhone'da içe aktarılması ve widget'tan `/api/quick` çağrısı.
6. Saat çarkının iOS'ta kaydırma hissi, panelin klavyeyle yer değiştirmesi, tema geçişi.
7. Telegram taslak düğmelerinin gerçek botta akışı.

## Sıradaki olası işler

- Kısayol dosyası adresi sabit (`gun-payi-telegram.frkngndz60.workers.dev`); adres değişirse Mac'te yeniden üretip `shortcuts sign --mode anyone` ile imzalanmalı.
- Biweekly ("iki haftada bir") gibi desteklenmeyen tekrarlar şu an AI yedeğinde haftalığa iner.
