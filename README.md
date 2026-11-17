# Gün Payı

Türkçe, önce cihazda çalışan kişisel ajanda PWA’sı. Planım, Notlar, Gelişim ve Ayarlar; liste/hafta/ay planlayıcı; sesle yazma; pano üzerinden JSON yedekleme; isteğe bağlı Telegram hatırlatmaları ve bot komutları içerir.

Bu depo **18 Kasım 2026’da ajandanın tam kaynaklarıyla birleştirildi**. Önceden yalnız Telegram sunucusunu içeriyordu. `dist/` derlenmiş framework çıktısı değil, uygulamanın düzenlenebilir HTML/CSS/JS kaynaklarıdır. Kaynaklar, ikonlar, mevcut testler, önceki QA kayıtları ve devir notları birlikte bulunur. Kullanıcının telefondaki kişisel kayıtları bu depoda değildir.

## Devralacak kişi için

1. [Devir notu ve güncel durum](docs/HANDOFF.md)
2. [Tüm istekler ve öncelik kuralları](docs/PROJECT_REQUIREMENTS.md)
3. [İlk proje briefi](docs/INITIAL_BRIEF.md)
4. [Proje sohbetinin kronolojik özeti](docs/CHAT_HISTORY.md)
5. [Mimari, veri ve yayın yolları](docs/ARCHITECTURE.md)
6. [Doğrulama geçmişi](QA.md)

## Canlı uygulama

| Bileşen | Adres / durum |
| --- | --- |
| Ajanda | https://gun-payi.gunduz.chatgpt.site |
| Telegram API | https://gun-payi-telegram.frkngndz60.workers.dev |
| Sağlık kontrolü | https://gun-payi-telegram.frkngndz60.workers.dev/health |
| Ajanda bağlantı dosyası | https://gun-payi.gunduz.chatgpt.site/telegram-config.json |
| Son ajanda yayını | Sites sürüm 10, arayüz 4.1.1 |

Sunucu adresi artık ajandada tanımlı. Telefonda Ayarlar → Telegram ve bileklik bölümüne bot tokenı ve sayısal kullanıcı ID’si girilir. ID için kendi botunda **Başlat**, ardından ajandada **ID’mi bul** kullanılabilir. Telefona servis, terminal veya Cloudflare aracı kurmak gerekmez. Gerçek bot bağlantısı, kapalı PWA’da zamanlı teslim ve Mi Band 6 teslimi henüz bizim tarafımızdan doğrulanmadı.

## Çalıştırma ve test

Node 22 kullanılır. Otomatik testler Node’un yerleşik test koşucusunu kullanır:

```sh
npm test
npm run check
```

Toplam **93** test: `npm run test:web` ajandanın 85, `npm run test:service` sunucunun 8 kontrolünü çalıştırır. Ses testleri sentetiktir; gerçek mikrofon ve işletim sistemi bildirim testlerinin yerine geçmez.

Statik önizleme için `dist/` HTTP ile servis edilir:

```sh
python3 -m http.server 8000 --directory dist
```

`file://` kullanmayın. `localhost` geliştirme istisnasıdır; üretimde mikrofon/PWA için HTTPS gerekir. Yerel önizleme telefon verilerini içermez. Üretim Telegram sunucusu CORS nedeniyle yalnız mevcut ajanda origin’ini kabul eder; localhost için ayrı geliştirme servisi gerekir.

## İki ayrı yayın hedefi

- **Telegram sunucusu:** Bu depoya bağlı Cloudflare Workers dağıtımı. Kök `wrangler.jsonc`, `telegram-worker/worker.mjs` dosyasını yayımlar. `npm ci` ardından `npx wrangler deploy --dry-run` paket kontrolüdür; `npm run deploy` gerçek sunucuyu değiştirir. Mevcut GitHub–Cloudflare bağlantısı push sonrası sunucuyu dağıtır.
- **Ajanda arayüzü:** Şu anda ChatGPT Sites üzerinde, `.openai/hosting.json` içindeki mevcut projede yayımlanır. Bu depoya push, `gun-payi.gunduz.chatgpt.site` arayüzünü kendiliğinden değiştirmez. Sonraki ajan mevcut Site kaynağını resmi Sites akışıyla açmalı, arayüz değişikliklerini oraya da uygulamalı ve aynı projeyi yayımlamalıdır.

Kök Worker’a gelişigüzel `assets` eklemeyin. Arayüz origin’ini değiştirmek mevcut IndexedDB kayıtlarını yeni adreste görünmez hâle getirir. Başka platforma taşınacaksa önce pano yedeği ve geri yükleme planı hazırlanmalıdır.

Ana kayıtlar cihazdaki IndexedDB’dedir. Yedek; isim, tercihler, planlar/tekrar istisnaları, notlar, hedefler, gün kayıtları, değerlendirmeler ve desteklenen taslakları içerir. Bot tokenı ve cihaz bağlantı anahtarı yedeğe girmez. Yedek şifreli kasa veya otomatik bulut eşitlemesi değildir.

Tarayıcı sistem bildirimleri yalnız uygulama açıkken kontrol edilir. Kapalı PWA için Web Push kurulmuş değildir; mevcut yol Cloudflare alarmı → Telegram’dır. Mi Band yansıtması telefon/bileklik ayarlarına bağlıdır.

Eski kurulum anlatımı [burada](docs/TELEGRAM_BROWSER_SETUP.md), ajandanın önceki sürüm notları [burada](docs/SITE_README_HISTORY.md) korunur. Bu tarihsel dosyalardaki “sunucu henüz bağlanmadı” gibi ifadeler için güncel devir notu esas alınır.
