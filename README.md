# Gün Payı

iPhone'da uygulama gibi çalışan kişisel ajanda (PWA). Gününü planla, söyle eklensin, saatinde Telegram'dan hatırlatsın.

- **Söyle, eklensin:** "Her cuma 12'de babaannemi ara, 10 ve 15 dk önce hatırlat" yazman ya da söylemen yeter. Gün, saat, tekrar ve hatırlatma cümleden çıkarılır, kaydetmeden önce dokunup düzeltilebilir.
- **Telegram hatırlatması:** Uygulama kapalıyken de gelir, Mi Band gibi saatlere Telegram bildirimi olarak ulaşır. Bota yazarak ya da sesli mesajla da plan eklenir.
- **Ana ekran widget'ı:** iOS Kısayollar widget'ıyla uygulamayı açmadan sesle ekleme.
- **Veriler telefonda:** Hesap yok. Sunucuya yalnız hatırlatma için planların kopyası gider.

Uygulama ve API aynı Cloudflare Worker'da, aynı adreste çalışır: <https://gun-payi-telegram.frkngndz60.workers.dev>

## Bir kerelik kurulum

1. Telegram'da **@BotFather** → `/newbot` ile bir bot aç, tokenı al.
2. Cloudflare → **Workers & Pages → gun-payi-telegram → Settings → Variables and Secrets → Add**: tür **Secret**, ad `BOT_TOKEN`, değer bot tokenı. Kaydet.
3. `main` dalına her push'ta Cloudflare Worker'ı kendisi derleyip yayımlar (GitHub bağlantısı kurulu).

Webhook, bot komutları ve Workers AI ayrıca ayar istemez. Webhook ilk "Telegram'a bağlan" dokunuşunda kendiliğinden kurulur.

## Telefonda

1. Eski uygulamada **Ayarlar → Yedeği kopyala**.
2. Safari'de yukarıdaki adresi aç → **Paylaş → Ana Ekrana Ekle**.
3. Yeni uygulamada **Eski uygulamadan yedeğim var** → yapıştır.
4. **Telegram'a bağlan** → Telegram açılır → **Başlat**. Token ya da ID girilmez.
5. İstersen **Ayarlar → Ana ekran widget'ı** adımlarıyla sesli ekleme kısayolunu kur.

## Geliştirme

```bash
npm ci
npm run dev      # http://localhost:8787 (Workers AI yerelde kapalı)
npm test         # çözümleyici, uygulama ve Worker testleri
npm run check    # sözdizimi
```

Derleme adımı yok: `web/` olduğu gibi sunulur, `worker/` aynı dosyaları (çekirdek ve çözümleyici) içe aktarır. Ayrıntılar [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), son durum [docs/HANDOFF.md](docs/HANDOFF.md).
