# Devir notu

Güncelleme: **19 Kasım 2026**. Sürüm **5.6.0**.

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

## 5.6

- **Tamamlanmazsa tekrar hatırlat:** `item.nag = {every, times}` (dakika 1-1440, 1-20 kez). Cümleden okunur: "tekrar hatırlat 10 dakika içinde 5 kere", "yarım saat içinde 2 kere", "5 kere 10 dakikada bir", "1 saat arayla 2 kez", yalnız "tekrar hatırlat" (10 dk × 3). Plan saatinde haber verilir, sonra her aralıkta bir kez daha; tamamlanınca durur. Sohbette her zaman yalnız son hatırlatma durur.
- **Ertele (Telegram):** hatırlatmada ✓ Tamamlandı ve ⏰ Ertele. Ertele: 10 dk, 20 dk, 30 dk, 1 saat, 2 saat, Yarın, ✏️ Süre yaz ("42 dk", "1G", "1 gün 5 saat", "1 hafta", "21:30", "yarın 9'da"). Ertelenince düğme "⏰ 21:40" olur; ertelenmişken ara tekrarlar susar.
- **Taslakta:** Hatırlat menüsünde 🔁 10dk×3, 10dk×5, 30dk×2, Tekrarsız; ya da "10 dk içinde 5 kere" yazılır.
- **Sade hatırlatma mesajı:** yalnız emoji, iş ve planın saati ("🐾 Balıkların suyunu değiştir / 20:00"; başka günse "Yarın 20:00"). "10 dk sonra", "geçti", kaçıncı tekrar olduğu yazılmaz. Eklendi kartında ayarlar tek satır: "🔔 10 dk önce · 🔁 10 dk × 5".
- **Sesle not:** iki nokta gerekmez. Başta "Not", "Not al", "Not olarak ekle" ya da sonda "… not olarak ekle" → not; metin olduğu gibi kalır (içindeki saat silinmez), ilk harf büyür. "Not defteri al", "Notları oku" plan kalır.
- **Göreli saat:** "20 dakika sonra", "2 saat sonra", "yarım saat sonra", "bir buçuk saat sonra", "1 saat 15 dakika sonra" (en fazla 48 saat). Önceden hatırlatma söylenmediyse tam o anda haber verilir (`reminders: [0]`).
- **Uygulamada:** hatırlatma seçicisinde "Tamamlanmazsa tekrar hatırlat" (Kapalı, 5/10/15/30 dk, 1 sa; 2/3/5/10 kez), ekleme önizlemesinde ve plan kartında "10 dk × 5" etiketi. "balık", "akvaryum" evcil hayvan ikonu alır.

## 5.5

- **Telegram sohbet temizliği:** DO her planın mesajlarını izler (`msgs`: taslak kartı, kullanıcının mesajı, yazılan düzeltmeler, ara cevaplar, Eklendi kartı, hatırlatmalar). Ekle'de ara mesajlar silinir, plan başına tek kart kalır. Vazgeç taslağı tamamen siler. Plan uygulamada ya da Telegram'da tamamlanınca/silinince kartı ve hatırlatmaları silinir; tekrarlayan planda yalnız o günün hatırlatmaları. Senkronda eski/yeni ayna karşılaştırılır (`finishedPlans`). Telegram yalnız 48 saatten yeni mesajları sildirir; eskilerin düğmeleri kaldırılır. Eskimiş "Tamamlandı" düğmesi mesajı kaldırır.

## 5.4

- **Kaydırma iOS tarzı:** kart kayınca yanında ayrı, yuvarlak köşeli düğme açılır (sola: kırmızı Sil, sağa: Tamamla). Dokunmak ya da sonuna kadar çekmek işlemi yapar; tamamlanan silinmez, üstü çizilir.
- **Tamamlananlar:** `prefs.showDone` (varsayılan gizli), Plan üst çubuğunda göz düğmesi. Gizliyken listelerden, sayılardan, gün şeridi ve ay noktalarından çıkar (`visibleOn`).
- Sayı etiketleri büyük harfle ("2 Plan", "Bu Ay 7 Plan"); "Telegram bağlı" rozeti kaldırıldı.
- **Profil fotoğrafı** (`web/js/avatar.js`): seç, daire içinde kaydır/yakınlaştır, çerçeve (Yok, Altın, Gümüş, Rose gold, Tema, Neon). `localStorage['gp-avatar']` (360 px JPEG, yaklaşık 10-30 KB); yedeğe girmez. Üst çubukta ve Ayarlar'da görünür.

## 5.3

- **Kaydırma:** plan kartında sola kaydırma "Sil" düğmesini açar, kartın yarısından fazla kaydırma otomatik siler (tekrarlayan planda "Sadece bu gün / Tüm seri" sorulur). Sağa kaydırma tamamlar. Her ikisinde de geri al bildirimi var. İlk kaydırmaya kadar küçük bir ipucu görünür.
- **Tik düğmesi kaldırıldı:** tamamlananlar listeden düşer; altta "N tamamlandı · göster" ile açılır, orada sağa kaydırma geri alır. Düzenleme sayfasında "Tamamlandı" düğmesi var.
- **Telegram taslağı:** ✏️ Yazı ile başlık düzeltilir. Gün / Saat / Hatırlat menüsü açıkken yazılan metin o alana uygulanır: "20 Aralık 2027", "haftaya cuma", "1734", "17:34", "30 dk", "1 sa 15 dk", "10 ve 15 dk". Saat menüsünde ±5 / ±15 dk ve ±1 sa. `parseDurations`, `parseClock` (`web/js/parse.js`).

## 5.2 (Stitch tasarımı)

- Kullanıcının Stitch'te hazırladığı "Gelişmiş Arayüz Tasarımı" sistemi uyarlandı: tonlu renk aileleri (koyu ana ton, canlı vurgu, pastel kaplar), Plus Jakarta Sans, ayrı görev kartları, saat hapı, günlük ilerleme, yükselen ekle düğmesi, aylık takvimde kategori renginde noktalar ve şeritli ajanda, boş gün kartı ve hızlı başlangıç çipleri. Stitch'teki fotoğraflı ilham kartları dışarıdan görsel ve uydurma içerik gerektirdiği için alınmadı.
- Tema artık `prefs.color` (yesil, indigo, mor, mavi, gunbatimi) + `prefs.mode` (light, dark, system). Eski `prefs.theme` değerleri otomatik taşınır. `<html data-color data-theme>`; koyu modda yüzeyler renge hafifçe boyanır.
- Ayarlar → Görünüm sadeleşti: renk noktaları + Açık/Koyu/Sistem.
- Açılış animasyonu (`#splash`, güneş doğuşu). iOS açılış görüntüsü düz zemin, animasyon onun üstünden başlar.
- Yazı tipi Google Fonts'tan; service worker `gp-fonts` önbelleğinde tutar.

## 5.1.1

- **Ses:** iOS bazen `onend` göndermiyor ya da izin penceresinden sonra sessizce düşüyordu; uygulama hâlâ dinliyor sanıp sonraki dokunuşu "durdur" sayıyordu. Artık her oturum kimlikli, eski olaylar yok sayılıyor, bekçi zamanlayıcılar (başlama 12 sn, durdurma 1,5 sn) takılan oturumu kapatıyor, arka plana geçince oturum sıfırlanıyor. iOS'ta tek cümle modu. `tests/voice.test.mjs` bu durumları taklit eder.
- **Widget:** ana ekran uygulaması dış bağlantıyı kendi içindeki tarayıcıda açıyor ve o pencere `.shortcut` dosyasını Kısayollar'a veremiyor. Düğme artık `x-safari-https://` ile gerçek Safari'yi açıyor (Apple belgelemiyor, yaygın olarak çalıştığı bildiriliyor). Yanına kurulumsuz yol eklendi: Telegram widget'ı → bot sohbeti → sesli mesaj → taslak.

## Doğrulananlar

- `npm test`: 70 test (çözümleyici, uygulama, Worker; Telegram ve AI sahte yanıtla).
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
8. Tekrar hatırlatmanın ve Ertele menüsünün gerçek botta zamanında gelmesi.

## Sıradaki olası işler

- Kısayol dosyası adresi sabit (`gun-payi-telegram.frkngndz60.workers.dev`); adres değişirse Mac'te yeniden üretip `shortcuts sign --mode anyone` ile imzalanmalı.
- Biweekly ("iki haftada bir") gibi desteklenmeyen tekrarlar şu an AI yedeğinde haftalığa iner.
