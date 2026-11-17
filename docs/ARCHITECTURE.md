# Mimari ve çalışma akışı

## Depo haritası

| Yol | Görev |
| --- | --- |
| `dist/index.html`, `style.css` | Buildless statik uygulama kabuğu ve stil |
| `dist/app.js` | Görünümler, formlar, IndexedDB kaydı, yedek/geri alma, gezinme |
| `dist/core.js` | Tarih/tekrar/istisna/çakışma, başlangıç durumu, şema doğrulaması, kurallı öneriler |
| `dist/controls.js` | Seçim, takvim ve saat kontrolleri |
| `dist/voice.js`, `dictation-core.js`, `microphone.js` | Alan içi Türkçe dikte, oturum/durum/izin/hata akışı |
| `dist/backup.js` | Pano JSON, tüm durum/taslak doğrulaması ve cihaz taslağı yazımı |
| `dist/reminders-core.js`, `reminders.js` | Hatırlatma hesaplama, açık sayfa bildirimleri, ICS |
| `dist/plan-icons.js` | Ortak SVG ikonlar, Türkçe metinden simge seçimi |
| `dist/telegram.js`, `telegram-config.json` | İki alanlı bağlantı, sunucu plan aynası, olay alma, servis URL’si |
| `dist/updates.js`, `sw.js`, `reopen.*` | Güvenli SW güncellemesi, offline kabuk, yeniden açılış kurtarma |
| `dist/manifest.webmanifest`, `icons/` | PWA kimliği ve ikonları |
| `telegram-worker/core.mjs` | Sunucu tarafı plan temizleme/tarih/hatırlatma/komut mantığı |
| `telegram-worker/worker.mjs` | HTTP/CORS, bot izolasyonu, Durable Object, auth, webhook, alarmlar |
| `wrangler.jsonc` | **Mevcut Cloudflare üretim backend yapılandırması** |
| `telegram-worker/wrangler.jsonc`, `deploy.mjs`, `README.md` | Önceki bağımsız paket/kurulum yolu, tarihsel alternatif |
| `scripts/package-telegram.py`, `dist/gun-payi-telegram-service.zip` | Bağımsız servis paketi üretimi ve mevcut paket; tüm frontend deposunun yerine geçmez |
| `.openai/hosting.json` | Mevcut Sites kimliği, statik yayın dizini `dist` |
| `tests/` | 93 Node testi ve iki tarayıcı test düzeneği |
| `docs/`, `QA.md` | Ürün, devir, sohbet, doğrulama ve tarihsel test ekranları |

## Yerel veri

Ana IndexedDB: **`gun-payi`**, sürüm **1**, object store **`local`**, anahtar **`state`**. State `schema:1`, yazma çakışmasını algılamak için artan `revision`, `prefs`, `items`, `notes`, `goals`, `days`, `reviews` içerir. Uygulama tüm state’i transaction ile kaydeder; başka sekmedeki revision değişmişse körlemesine üstüne yazmaz, kullanıcıya hata verir. Kaydedilmeden başarı bildirimi verilmemeli.

Plan tek kayıtta seri özellikleri ve tarih bazlı `exceptions` tutar. Tek gerçekleşme `id:origin` kimliğiyle hesaplanır; taşınmış istisnalar uzak tarihte de bulunur. Bitiş saati başlangıçtan küçük/eşitse ertesi gün sayılır. Bitmeyen görevler kendiliğinden yarına aktarılmaz.

Yerel bildirim teslim kimlikleri ayrıca `gun-payi-reminders` v1 / `delivered` deposundadır; kullanıcı planlarının kaynağı değildir. `localStorage` desteklenen `gun-payi-quick`, `gun-payi-draft`, `gun-payi-voice` taslaklarını ve `gun-payi-telegram-session` bağlantısını tutar. `sessionStorage` güvenli yenileme sonrası görünüm/scroll/form devamı içindir.

Pano yedeği tüm state + `exportedAt` + `device.storage` taslaklarını taşır. `parseBackup` JSON, şema, kimlik, tarih/saat, tekrar/istisna, ikon, hatırlatma ve taslak alanlarını doğrular. Geçersiz yedek yazılmaz. Güncel pano restore tam durumu değiştirir; eski core merge yardımcısı başka davranıştır. Bot tokenı ve bağlantı anahtarı yedek listesinde değildir; ID/tercihler state’te bulunabilir. Geri yükleme bot oturumunu başka cihaza taşımaz.

## PWA ve güncelleme

Manifest id/start/scope `/`, mevcut origin korunur. SW `gun-payi-v4.1.1` adıyla yalnız uygulama kabuğunu önbellekler. Kendi eski cache’lerini temizler, IndexedDB’yi silmez. Navigation yanıtları yönlendirme geçmişi ve tüketilmiş body sorunlarına karşı yeniden oluşturulur; mevcut/önceki cache ve offline fallback kullanılır.

`updates.js` otomatik kontrolü sessiz yürütür; uygun boş zamanda etkinleştirir. Kaydetme, kirli form veya dikte varken bekler; yenilemeden önce taslak ve UI devam durumu saklanır. İlk açılışta “şimdi güncelle” istemi gösterilmez. Config dosyası shell listesinde yoktur; `telegram.js` no-store ile alır, bu yüzden bağlantı URL’si için SW sürümünü artırmak gerekmedi.

Offline kabuk, yerel görev/not kullanımı demektir. Konuşma tanıma tarayıcı ses hizmetine/internete bağlı olabilir; Telegram ağ gerektirir. Cache temizliği ile kişisel veriyi silme aynı işlem değildir. Yeni origin mevcut IndexedDB’ye erişemez.

## Ses

`SpeechRecognition`/`webkitSpeechRecognition`, dil `tr-TR`. Ara/kesin sonuçlar, aynı final listesini iki kez eklememe, durdurma sonrası son sonucu bekleme, elle düzeltme, iptal/timeout/eski callback ve taslaklar ele alınır. Aktif servis olayı gerçek audio capture demek değildir. Mikrofon “hazırlanıyor” ve gerçek ses başlangıcı ayrımı korunur; izin dönüşü/odak ve watchdog vardır. Açık media track’leri gereksiz tutulmaz.

Alt artı `quickVoice` açıksa aynı kullanıcı hareketinden sesi başlatır; uzun smooth-scroll bekleyip gesture’ı kaybetmez. Tarayıcı/OS kalıcı izni yönetir. Uygulama hatırlamış görünmek için localStorage’a sahte permission yazmaz. Ham ses saklama, OpenAI modeli veya Telegram sesli mesaj işleme yoktur. Node/tarayıcı düzeneği testleri sentetiktir.

## Hatırlatma kanalları

Yerel hatırlatıcı sayfa açıkken yaklaşık 30 saniyelik kontrolle SW `showNotification` kullanır. Sistem izni gerekir; kapalı PWA’ya gerçek Web Push aboneliği/VAPID yoktur. ICS önümüzdeki 90 günün saatli kayıtlarını ve VALARM’ları dışarı aktarır; telefon takvimine kullanıcı içe aktarır, sonraki değişiklikler otomatik eşitlenmez.

Kapalı uygulama için asıl kanal Telegram API’dir. Frontend yalnız hatırlatmalar için gerekli plan alanlarını ve saat dilimi/varsayılan süreleri aynalar; tüm not/profil yığını aktarılmaz. Sonradan offline yapılan ve sunucuya gitmemiş değişiklikler sunucuda eski hâliyle bulunabilir. Bu sınırlama gizlenmemeli.

## Telegram API

Kök Worker `ALLOWED_ORIGIN` için CORS uygular. `/health` alarm binding’i ve iki alanlı kurulum desteğini bildirir; kök `/` API-only olduğu için 404 dönebilir. Root `wrangler.jsonc`: `HUB` → `ReminderHub`, SQLite Durable Object migration `v1`, kurulum rate limit’i 20/dakika/IP; observability kapalı. Bağlı üretim Worker adı ve migration korunmalı.

Kurulum girişleri `/api/identify` ve `/api/configure`; token `getMe` ile doğrulanır, bot ID’sine özel `/bot/:botId/...` namespace/DO kullanılır. Kişinin kendi özel sohbeti `getChat` ile doğrulanır. Başka servise bağlı botun webhook’u sessizce ele geçirilmez; ayrı bot istenir. `/start` üzerinden ID keşfi kullanıcıya adayları gösterir. Token sahibi bot üzerindeki denetim sahibidir; servis herkese açık sohbet sistemi değildir.

Bağlantı sırasında sunucu bot tokenını, hash’lenmiş cihaz anahtarını ve webhook secret’ını tutar. Frontend’e yalnız rastgele cihaz anahtarı, bot/ID bilgisi döner; anahtar yerelde kalır, sonraki API çağrıları Bearer kullanır. Webhook secret header, özel chat ve **tam eşleşen kullanıcı/chat ID** kontrol edilir; duplicate update’ler tekrar uygulanmaz. Gerçek tokenlar loga/Git’e yazılmamalı.

| Yol (bot namespace altında) | İşlev |
| --- | --- |
| `GET /api/status` | Bağlantı, son eşitleme, sonraki alarm, hata |
| `POST /api/sync` | Önce bekleyen olayları döndürür; kuyruk bittiğinde temizlenmiş plan aynasını yazar |
| `POST /api/pull` | Cursor sonrası olayları alır |
| `POST /api/test` | Anlık veya bir dakika gecikmeli mesaj |
| `POST /api/pause` | Sunucu hatırlatmalarını durdur/sürdür |
| `POST /api/disconnect` | Webhook/anahtar/token bağlantısını bırakır, alarmı kaldırır; yerel ajandayı silmez |
| `POST /telegram/webhook` | Doğrulanmış Telegram mesaj/callback girişleri |

Durable Object en yakın due job için `storage.setAlarm` kurar; teslim/yeniden deneme durumu ve tekrar engelleme sunucudadır. Sayfa açık olmasa da alarm çalışabilir. Ağ/Telegram/OS mutlak zaman garantisi vermez; anlık test zamanlı teslim kanıtı değildir.

Komutlar: `/ekle yarın 09:00 ...`, `/not ...`, `/bugun`, `/yarin`, `/hafta`, `/tamam 1`. Düz metin not olur; callback ile tamamla desteklenir. Sunucu olayları sıralı kuyrukta tutar. Frontend açıldığında önce olayları yerelde kalıcı uygular ve cursor’u ilerletir, sonra yeni aynayı yollar. Tam genel çok cihazlı senkronizasyon veya serbest AI sohbeti değildir.

## Yayın ayrımı ve doğrulama

Bu GitHub reposu Cloudflare backend’ine bağlıdır. Frontend `dist` kaynakları artık aynı repodadır ama mevcut Sites URL’sine otomatik GitHub dağıtımı kurulmamıştır. `.openai/hosting.json` Sites kaynağı için kimliktir. Resmi kaynak yardımcısıyla ayrı checkout, aynı Site’a source push/paket/save/deploy gerekir. Farklı Git geçmişlerini force-push ile değiştirmeyin.

CI Node 22, kilitli bağımlılık kurulumu, tüm JS sözdizimi, 93 test ve Worker dry-run çalıştırır. Ayrı dağıtım kontrolü canlı health/CORS/preflight/frontend config okur; token veya mesaj kullanmaz. Test ve tarihsel tarayıcı kanıtları `QA.md` içinde; fiziksel cihaz bekleyenleri `HANDOFF.md` içindedir.
