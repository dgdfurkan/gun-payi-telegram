# Gün Payı — devir notu

Güncelleme: **18 Kasım 2026, Türkiye saati**. Yeni geliştirme ajanı önce bu dosyayı okumalı.

## Son talep ve kaldığımız iş

Kullanıcı mevcut ajandanın bütün kodunu, ilk briefi, sonraki istekleri, proje konuşmasının özetini ve en son uğraşılan işi GitHub’a aktarmamızı istedi. Başka bir bulut geliştirme aracına bu depoyu verecek. Yalnız backend veya plan metni yeterli değil. Projeyle ilgisiz sohbetler ve kişisel telefon verileri dahil edilmedi.

Telegram API kullanıcı tarafından Cloudflare’da GitHub üzerinden yayımlanmıştı. `/health`, alarm desteği ve CORS önceki GitHub kontrolünde başarılıydı; ajandanın `dist/telegram-config.json` dosyasında ise `serviceUrl` boştu. Bu nedenle telefonda “Sunucu hazırlığı bekleniyor” görünüyordu. Çalışma ortamı bir süre açılamadığından frontend bağlantısı ertelenmişti.

**Bu devir sırasında bekleyen bağlantı tamamlandı ve mevcut ajanda yayımlandı.** Dosya artık şunu içerir:

```json
{"serviceUrl":"https://gun-payi-telegram.frkngndz60.workers.dev"}
```

Bu token değil, herkese açık API adresidir. `telegram.js` bu ayarı `cache: 'no-store'` ile yükler; dosya SW precache listesinde değildir. IndexedDB, kullanıcı veri şeması, PWA kimliği ve origin değişmedi. Uygulamayı silip yüklemek gerekmez.

| Kaynak | Güncel değer |
| --- | --- |
| GitHub | https://github.com/dgdfurkan/gun-payi-telegram |
| Dal | `main` |
| Dışa aktarma öncesi GitHub HEAD | `ad9c4c6b1d7adaaf09582e4faadd652adcc8193c` |
| Ajanda | https://gun-payi.gunduz.chatgpt.site |
| Sites proje ID | `appgprj_6afa0e8a2f188191813e8edb3aca6527` |
| Önceki Site kaynak SHA | `7c0df888a0805c2787b1982d2ef19ca15c9358d8` |
| Yeni Site kaynak SHA | `5f8959648f1b13d5cceae3809efc64a8a8264095` |
| Yayımlanan Site sürümü | **10** |
| Site sürüm ID | `appgprj_6afa0e8a2f188191813e8edb3aca6527~appgver_465f960a13488191a08419ce498eab46` |
| Native yayın sonucu | `succeeded`, mevcut public adres korundu |
| Arayüz/SW sürümü | **4.1.1**, config değişikliği için artırılmadı |
| Telegram API | https://gun-payi-telegram.frkngndz60.workers.dev |
| Önceki sağlık yanıtı sürümü | `4.1.0` (arayüzden ayrı) |
| Testler | 85 ajanda + 8 sunucu = **93** |

Bu commit’in kendi SHA’sı dosyasına yazılmaz; GitHub geçmişinden alınır. Native Site kaynağı ile GitHub kaynağı ayrı Git geçmişlerine aittir.

## Sıradaki gerçek doğrulama

Telefonda Ayarlar → Telegram ve bileklik altında bot tokenı ve sayısal kullanıcı ID’si girilmeli. Kendi botunda Başlat’a basıp **ID’mi bul** kullanılabilir. Token konuşmaya/GitHub’a yazılmamalı. Telefon tarafında Cloudflare veya terminal kurulumu yok.

Gerçek token ve kullanıcının telefonu bu ortamda bulunmadığından şunlar **henüz yapılmış kabul edilmez**:

1. Gerçek botu bağla; Telegram’dan dene ile mesaj al.
2. **1 dk. sonra dene** başlat, PWA’yı kapat, teslimi kontrol et. Ayrıca gerçek saatli plana 10 dakika önce hatırlatması verip dene. Anlık testin geçmesi zamanlı testin yerine geçmez.
3. Mi Band 6’da aynı mesajı kontrol et. Telefon bildirim izni, bot sohbetinin sessiz olmaması, eşlikçi uygulamada Telegram yansıtma ve arka plan izinleri kontrol noktalarıdır; kod bunları telefon adına açamaz.
4. Telegram’dan `/ekle yarın 09:00 Sabah yürüyüşü`, `/not ...`, `/bugun`, `/tamam 1` dene; ajandayı açınca tek kez uygulanmasını kontrol et.
5. Gerçek telefonda mikrofon, alttaki artıdan otomatik mikrofon, kapatıp açma ve izin tercihinin korunmasını dene. Sentetik testler gerçek ses/izin garantisi değildir.
6. PWA’yı silmeden yeniden aç; görünüm tercihi ve verileri, pano yedeğini ve temiz tarayıcıya geri yüklemeyi dene.

Bir sorun raporlanırsa somut aşamasını incele: sunucu plan aynası, sonraki alarm, lastError, webhook sağlığı ve telefonun Telegram ayarları ayrı noktalardır. Kapalı sayfada JS timer çalışacağı varsayımıyla çözüm üretme.

## Tamamlananlar ve sınırlar

- Son liste/hafta/ay seçimi; ilk varsayılan hafta.
- Mobilde Notlar–Gelişim arası artı; hızlı eklemeye kaydırma; ayarlardan kaydır + sesle başla.
- Kısa sekme geçişi, reduced-motion.
- Pano JSON yedeği: tüm uygulama durumu ve desteklenen taslaklar, doğrulama ve geri alma; token/cihaz anahtarı dışarıda.
- Sessiz SW güncellemesi; yazma/dikte/form sırasında güvenli bekleme; cache ile veri DB’si ayrımı.
- İkinci açılış için güvenli Response/cache düzeltmesi ve `reopen.html`; fiziksel yeniden açılış kontrolü hâlâ gerekli.
- Gerçek capture başlamadan dinliyor demeyen mikrofon akışı, izin/hata açıklamaları ve plan ikonları.
- Kapalı PWA için Cloudflare Durable Object alarmı + Telegram; Web Push/VAPID yok.
- İki alanlı bot bağlantısı, sınırlı plan aynası, komutlar ve kuyruklu geri dönüş; tam cihazlar arası bulut eşitlemesi değil.
- Serbest AI sohbeti, Telegram ses mesajını anlama ve görselli hatırlatma kartı **bağlı değil**; olası gelecek istekleri.

## Yayın ve taşıma

Kök `wrangler.jsonc` mevcut Cloudflare backend bağlantısı için korunmuştur. GitHub push backend dağıtımını tetikleyebilir; arayüz yayını ayrı Sites akışıdır. Sites’a erişemeyen ajan GitHub frontend kodunu değiştirdiğinde mevcut ajandanın yayımlandığını söylememeli.

Sites üzerinde devam edilecekse aynı proje resmi kaynak yardımcısıyla **ayrı boş klasörde** açılmalı. Bu GitHub reposu ile native Site deposu force-push ile birleştirilmemeli. Değişiklik ilgili kaynağa uygulanır, test edilir, aynı Site yayımlanır; GitHub aynası güncel tutulur.

Başka buluta taşınacaksa API ve statik arayüz ayrımı korunmalı. Origin değişmeden önce yedek alınmalı; yeni origin eski IndexedDB’ye erişemez. JSON yedeği token içermediğinden yeniden bot bağlama gerekebilir.

`CHAT_HISTORY.md` geçmişi, `PROJECT_REQUIREMENTS.md` istekleri, `ARCHITECTURE.md` teknik yapıyı açıklar. Eski belgelerdeki “henüz bağlanmadı” ifadeleri tarihsel kayıttır.
