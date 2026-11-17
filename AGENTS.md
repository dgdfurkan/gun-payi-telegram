# Proje üzerinde çalışırken

Önce `docs/HANDOFF.md`, `docs/PROJECT_REQUIREMENTS.md` ve `docs/CHAT_HISTORY.md` okuyun. Eski README/QA bölümleri tarihsel kayıttır. Kullanıcının son açık isteği, önceki briefteki çelişen tercihin önüne geçer.

- Bu depo buildless ajanda (`dist/`) ve Cloudflare Telegram API’sini içerir. Kök `wrangler.jsonc` yalnız API’yi dağıtır; ajandanın mevcut yayını ayrı Sites projesindedir.
- Sites deposu ile bu GitHub deposu farklı Git geçmişlerine sahiptir. Mevcut Site’ı resmi kaynak yardımcısıyla ayrı, boş klasörde açın; GitHub checkout’unu aynı geçmiş sanıp yardımcıya vermeyin.
- Mevcut Site kimliğini, public erişimini, origin’ini, IndexedDB `gun-payi` sürüm 1 / `local` deposunu ve schema 1 uyumunu koruyun. Migration olmadan veri modelini değiştirmeyin. Cache temizliği kullanıcı verisini silmemeli.
- Token, cihaz anahtarı, gerçek kullanıcı yedeği, hesap bilgileri veya servis kimlik bilgilerini Git’e/loglara yazmayın. Testler sahte değerler kullanmalı. `.openai/hosting.json` proje kimliğidir, token değildir.
- Gerçek teslim, mikrofon izni, ses doğruluğu ve fiziksel Mi Band testi yapılmadan yapıldı demeyin. Kalıcı mikrofon iznini uygulama zorlayamaz. Yerel timer, kapalı PWA bildirimi değildir.
- Sade Türkçe kullanın. Öneriyi kesin plan diye eklemeyin; puan/streak baskısı, uydurma geçmiş ve sahte AI yok.
- Değişikliğe uygun kontroller: `npm run check`, `npm test`; Worker değiştiyse `npx wrangler deploy --dry-run`. Testlerin sentetik/cihaz sınırlarını gözetin.
- Kullanıcı telefonda yalnız bot tokenı ve ID girmek istiyor; tekrar servis kurulumu, PWA silme/yükleme veya bilgisayara araç indirme görevi çıkarmayın.
