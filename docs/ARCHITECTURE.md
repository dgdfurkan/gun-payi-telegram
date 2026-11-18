# Mimari

## Depo

| Yol | Görev |
| --- | --- |
| `web/index.html`, `app.css` | Uygulama kabuğu, iOS hissi veren tasarım sistemi (açık/koyu tema) |
| `web/js/core.js` | **Ortak:** tarih, tekrar, istisna, hatırlatma işleri, etiketler, doğrulama |
| `web/js/parse.js` | **Ortak:** Türkçe doğal dil çözümleyici (kural tabanlı) |
| `web/js/store.js` | IndexedDB durumu, sunucu olaylarını uygulama, yedek (eski schema 1 dahil) |
| `web/js/api.js` | Telegram bağlantısı, senkron, test/duraklat |
| `web/js/app.js` | Sekmeler, olay yönlendirme, karşılama, açılış |
| `web/js/plan.js` | Gün / Hafta / Ay görünümleri, tamamlama |
| `web/js/compose.js` | Ekleme sayfası (canlı çözümleme, ses), plan ve not düzenleme |
| `web/js/pages.js` | Notlar, Özet (haftalık değerlendirme), Ayarlar, widget kurulumu |
| `web/js/chrome.js` | Üst çubuk, başlık bölümü, Telegram durum rozeti |
| `web/js/pickers.js` | Takvim, saat çarkı, hatırlatma (özel sn/dk/saat/gün), tekrar, ikon seçici |
| `web/js/categories.js` | **Ortak:** başlıktan kategori/ikon/emoji tahmini |
| `web/js/ui.js`, `icons.js`, `voice.js` | Alt sayfa (klavye takibi), işlem menüsü, bildirim, titreşim, tema; ikonlar; Web Speech |
| `web/kisayol.shortcut`, `web/_headers` | İmzalı iOS kısayolu (widget) ve indirme başlıkları |
| `web/sw.js` | Kabuk önbelleği (sürüm `web/js/version.js` ile aynı olmalı) |
| `worker/index.js` | Yönlendirme: `/api/*`, `/telegram/webhook`, `/health`, gerisi statik dosya |
| `worker/hub.js` | Durable Object `ReminderHub`: `meta` (bağlantı kodları, bot) ve `chat:<id>` (plan aynası, olaylar, alarm) |
| `worker/telegram.js`, `ai.js` | Bot API ve mesaj biçimleri; Workers AI (Whisper, yedek çözümleme) |
| `wrangler.jsonc` | Üretim: assets + DO + AI + rate limit. `wrangler.dev.jsonc` yerel (AI'sız) |

## Yerel veri

IndexedDB `gun-payi` v1, store `local`, anahtar `state`:

```
{ schema: 2, revision, onboarded, prefs, items, notes, reviews, sync: { cursor } }
```

- **Plan:** `id, title, kind, date ('' = Yapılacaklar), time, endTime, repeat (none|daily|weekly|monthly), weekdays, until, reminders (dakika, kesirli = saniye; null = varsayılan), icon ('' = otomatik), status, exceptions{origin: {status,date,time}}, note`.
- Tekrarlayan planda tek günlük değişiklik `exceptions` içinde tutulur. Bitiş saati başlangıçtan küçükse ertesi güne taşar (16:00–01:00 vardiya).
- `prefs`: `name, timeZone, reminderDefaults, plannerMode, digest{on,time}, reviewDay, color, mode`.
- Telegram bağlantı anahtarı `localStorage['gp-link']` içindedir, yedeğe girmez.

## Senkron protokolü

1. Uygulama `POST /api/sync {cursor, items, prefs}` gönderir.
2. Sunucuda `cursor`'dan yeni olay varsa (Telegram/Kısayol ekledi, tamamlandı…) yalnız olayları döner; uygulama uygular, cursor'u ilerletir, tekrar gönderir.
3. Olay kalmayınca sunucu plan aynasını değiştirir, alarmı yeniden kurar.

Senkron yalnız açılışta, değişiklikten 1,5 sn sonra ve uygulama öne gelince (en fazla 20 sn'de bir) çalışır. Arka planda zamanlayıcı yoktur.

## Telegram

- Tek varsayılan bot (`BOT_TOKEN` secret). Bağlanma: `POST /api/link/start` → `{code, secret}` → `t.me/<bot>?start=<code>` → kullanıcı Başlat → webhook kodu `chat:<id>`'ye bağlar → uygulama `link/check` ile `chatId` alır. Anahtar `chatId.secret`, sunucuda yalnız SHA-256 özeti tutulur.
- Webhook gizli başlığı tokendan türetilir; yalnız özel sohbet ve `from.id === chat.id` kabul edilir; `update_id` tekrarları atlanır.
- Serbest metin/ses düğmeli **taslak** olur (`drafts`, 24 saat); `x:<id>:<işlem>` geri çağrıları gün/saat/hatırlatma/tekrarı düzenler, **Ekle** plana yazar. Taslak açıkken yalnız zaman içeren mesaj taslağı düzeltir.
- Çözümleme: önce `parse.js`; başlıkta anlaşılmayan zaman kelimesi kalırsa Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, JSON şeması) yedeği. Saatsiz metin Yapılacaklar'a, `not:` ile başlayan nota gider.
- Sesli mesaj: `getFile` → Whisper (`@cf/openai/whisper-large-v3-turbo`, `tr`) → aynı yol.
- Komutlar: `/bugun`, `/yarin`, `/hafta`, `/tamam N`, `/not`, `/duraklat`, `/devam`. Hatırlatmada **Tamamlandı** ve **10 dk ertele** düğmeleri.
- Alarm: `jobsFor` en yakın işi bulur, `storage.setAlarm`. Gönderilen iş kimlikleri 3 gün tutulur; başarısız gönderim 3 denemeden sonra bırakılır.

## API

| Yol | Kimlik | İşlev |
| --- | --- | --- |
| `GET /health` | yok | `{service, version, alarm, bot, ai}` |
| `GET /api/config` | yok | bot ve AI hazır mı |
| `POST /api/link/start`, `/api/link/check` | yok (rate limit) | Telegram bağlantısı |
| `POST /api/sync` | Bearer | olaylar / ayna |
| `GET /api/status` | Bearer | sıradaki hatırlatma, son hata |
| `POST /api/test {delay}` | Bearer | anlık ya da 60 sn sonra deneme |
| `POST /api/quick` | Bearer | Kısayollar: metin → plan, düz metin yanıt |
| `POST /api/parse` | Bearer | uygulamanın AI yedeği |
| `POST /api/pause`, `/api/unlink` | Bearer | duraklat; bağlantıyı kes (son cihazsa sunucu verisi silinir) |

## iOS notları

- Ana ekran uygulamasında mikrofon izni her soğuk açılışta tekrar sorulabilir (WebKit hatası 327237). Uygulama adresi hiç değiştirmez (hash/pushState yok), böylece oturum içinde tekrar sorulmaz. Klavyedeki dikte düğmesi izin sormaz; Kısayol widget'ı Siri dikte kullanır.
- Titreşim: iOS 18+ gizli `switch` etiketi; Android'de `navigator.vibrate`.
- Tasarım 375×667 (iPhone SE 2) ölçüsünde denendi; safe-area ve reduced-motion gözetilir.
