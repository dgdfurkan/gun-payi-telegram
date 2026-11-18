# İstekler ve kapsam

Güncellik: **18 Kasım 2026**. Son istek, eski briefteki çelişen tercihin önüne geçer. Eski istek ve kararların kaydı `docs/history/` altındadır.

## Çekirdek

| İstek | Karşılık |
| --- | --- |
| Sade, şık, modern; az düğmeyle çok iş | 4 sekme + ortada ekle. Tek ekleme alanı her şeyi anlar. |
| iPhone SE 2'de PWA, gerçek uygulama hissi | iOS sistem fontu ve ölçüleri, büyük başlık, bulanık sekme çubuğu, kart modal, sürükle-kapat, titreşim, dokunma tepkileri, açılış ekranı, açık/koyu tema. 375×667 denendi. |
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
