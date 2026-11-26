# İstekler ve kapsam

Güncellik: **22 Kasım 2026**. Son istek, eski briefteki çelişen tercihin önüne geçer. Eski istek ve kararların kaydı `docs/history/` altındadır.

## Çekirdek

| İstek | Karşılık |
| --- | --- |
| Sade, şık, modern; az düğmeyle çok iş | 4 sekme + ortada ekle. Tek ekleme alanı her şeyi anlar. |
| iPhone SE 2'de PWA, gerçek uygulama hissi | iOS sistem fontu ve ölçüleri, büyük başlık, bulanık sekme çubuğu, kart modal, sürükle-kapat, titreşim, dokunma tepkileri, tek açılış (ikinci yükleme ekranı yok), açık/koyu tema. 375×667 denendi. |
| Gün planlama, gün akışı, yapılacaklar | Gün görünümü (hafta şeridi + zaman sıralı liste + Yapılacaklar), Hafta, Ay. |
| Düzenli haftalık işler | Günlük, hafta içi, hafta sonu, seçili günler, aylık tekrar. Tek günü atla/taşı. |
| Notlar, ay takvimi, haftalık değerlendirme | Kaldı. Gelişim hedefleri kaldırıldı (kullanıcı kararı). |
| Veriler lokalde | IndexedDB. Sunucuya yalnız hatırlatma için plan kopyası gider. |
| Pil ve performans | Derleme yok, küçük modüller, kabuk önbelleği, arka plan zamanlayıcısı yok, senkron yalnız açılış/değişiklikte. |

## Ses ve doğal dil

| İstek | Karşılık |
| --- | --- |
| "Her cuma saat 12'de babaannemi ara" | Her Cuma · 12:00 · Babaannemi ara |
| "Her cuma babaannemi aramam için gerekli olan şeyi ekle" | Başlık "Babaannemi ara" |
| "Her cumartesi ve pazar sabah 9'da …, 10 ve 15 dk önce" | Hafta sonları · 09:00 · 10, 15 dk önce |
| Mikrofon izni sürekli soruluyor | iOS ana ekran uygulamalarında WebKit hatası; kalıcı yapılamaz. Adres değişmez, oturumda bir kez sorulur. Klavye dikte izin sormaz. Widget Siri dikte kullanır. |
| Çok iyi çalışmalı | Kural tabanlı çözümleyici + şüphede Workers AI yedeği + kaydetmeden önce dokunarak düzeltme. |

## Telegram ve widget

| İstek | Karşılık |
| --- | --- |
| Saat telefona gelen PWA bildirimini almıyor | Hatırlatmalar Telegram botundan gelir. |
| Token/ID ile uğraşmadan bağlansın (JetBarcode gibi) | Varsayılan bot; "Telegram'a bağlan" → Başlat. |
| Widget, şarj yemeden | iOS Kısayollar widget'ı → `/api/quick`. Uygulama açılmaz. |
| Telegram'dan ekleme | Yazı ve sesli mesaj; komutlar; hatırlatmada Tamamlandı/Ertele. |

## Hatırlatma ve faturalar (22 Kasım)

| İstek | Karşılık |
| --- | --- |
| Erteleme, bastığım andan sayılsın | Süre, sonraki tekrarlar ve mesajdaki saat o andan. |
| Süreyi "elle gir" düğmesi olmadan yazayım | Telegram'da doğrudan sohbete, uygulamada hazır sürelerin altındaki alana. |
| Sınırlar kalksın (1 ay, 1 hafta, 28 gün önce) | Her sayı ve birim yazılabilir; saatsiz planda da çalışır. |
| Faturalar: 10-15 arası her gün, ödeyince sus, sonraki ay yine, 15'inden 3 gün sonra bir daha | Faturalar ekranı, "Ödedim", bitişten sonra ek hatırlatma. |
| Çift açılış ekranı olmasın | Uygulamanın yükleme animasyonu kaldırıldı. |
| Siyah ekranda logo olmasın | Ayarlar → Açılış ekranını yenile; veriler taşınır. |
| Artı eksi birer birer, basılı tutunca hızlı; dk, saat, gün | Bütün artı eksi alanlarında. |

## Sürpriz zaman, ünlem, abonelikler (26 Kasım)

| İstek | Karşılık |
| --- | --- |
| "Bana bu hafta hatırlat": önce nota ekle, sakin bir gün ve sürpriz bir saat seç | Plan en az planı olan güne, boş bir saate kurulur; ayrıca nota yazılır. |
| "Önümüzdeki ay hatırlat", "haftaya çarşamba hatırlat" (saati sen seç), "bu hafta akşam şu saatler arasında" | Ay, hafta sonu, hafta içi, bir ara; gün belliyse yalnız saat; gün dilimi ya da aralık saat penceresi olur. |
| Notlarda ünlem kayboluyor | Başlıkta `!` ve `?` kalır. |
| Dijital abonelikler (YouTube, Spotify, iCloud…), aynı türden birden fazla | Üç grupta 32 tür; ikinci kayıt numaralı ad ve ipucuyla. |
