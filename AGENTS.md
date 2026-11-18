# Proje üzerinde çalışırken

Önce `docs/HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_REQUIREMENTS.md` okuyun. `docs/history/` eski Sites sürümünün kaydıdır, güncel değildir.

- Uygulama (`web/`) ve API (`worker/`) tek Cloudflare Worker'da, aynı adreste. `main`'e push Cloudflare'de otomatik yayın demektir; push öncesi kullanıcı onayı alın.
- Derleme adımı yok. `web/js/core.js` ve `web/js/parse.js` hem tarayıcıda hem Worker'da çalışır; tarayıcıya ya da Node'a özgü API kullanmayın.
- Worker giriş modülü yalnız `default` işleyici ve `ReminderHub` sınıfını dışa aktarabilir.
- Sürüm üç yerde aynı olmalı: `package.json`, `web/js/version.js`, `web/sw.js`. Arayüz dosyası değişince sürümü artırın, yoksa telefonda eski önbellek kalır. Yeni `web/js` dosyası `sw.js` listesine eklenmeli (test denetler).
- IndexedDB `gun-payi` v1 / `local` / `state`, schema 2. Migration olmadan alan silmeyin. Eski schema 1 yedek içe aktarması korunmalı.
- `ReminderHub` sınıf adı ve `v1` migration'ı değişmemeli (üretimde SQLite DO).
- Token, bağlantı anahtarı, gerçek yedek Git'e/loglara yazılmaz. `BOT_TOKEN` yalnız Cloudflare secret.
- Gerçek cihazda denenmeyeni (mikrofon, Telegram teslimi, Mi Band, Whisper) yapıldı demeyin.
- Sade Türkçe, uzun tire yok. Puan/streak baskısı, sahte AI yok.
- Kontroller: `npm run check`, `npm test`, `npx wrangler deploy --dry-run`. Arayüz için `npm run dev` ve 375×667.
