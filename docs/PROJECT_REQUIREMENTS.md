# İstekler ve güncel kapsam

İlk brief ve sonraki proje talepleri birlikte tutulur. Güncellik: **18 Kasım 2026**. Son talep çelişen ilk tercihin önüne geçer. “Kodda mevcut”, fiziksel telefon testi yapıldı anlamına gelmez.

## Çekirdek ilkeler

Türkçe, sakin, sade, hızlı, yerel veriyi koruyan günlük araç. Hesapsız görev/not/plan; somut çalışan döngü. Öneri kesin plan değildir; otomatik dayatma/suçluluk/streak baskısı/sahte AI ve veri yok. İş/uyku/sosyal düzen gerçekçi; bilinmeyen saatler uydurulmaz. Zor gün için küçük adım ve dinlenme. Özellik sayısından çok güvenilir kullanım/geri dönüş.

## Planlama

| İstek | Güncel karşılık / durum |
| --- | --- |
| Planım, Notlar, Gelişim, Ayarlar | Mevcut gezinme. Ayrı kalabalık Bugün panosu son tercihle kaldırıldı. |
| Liste, Hafta, Ay | Mevcut; ilk varsayılan Hafta. |
| Son seçtiğim görünümle dön | `prefs.plannerMode`, açılışta ve geri yüklemede uygulanır. |
| Mobil okunurluk | Gün seçimi/ay ızgarası + seçili gün; liste modunda günlük gruplar. |
| Görev/etkinlik/alışkanlık | Form/model; saatsiz esnek kayıt, günlük/haftalık tekrar. |
| Tek gün / seri | Tek gerçekleşme istisnası; tamamla/ertele/atla/taşı/düzenle ayrımı. |
| Gece yarısı | 16:00–01:00 ertesi güne taşar; pazar yeni vardiya yokken cumartesi devamı kaybolmaz. |
| Çakışma/tampon | Kaydı engellemeyen yumuşak uyarı, isteğe bağlı tampon. |
| Geri alma/kontrol | Tamamlamayı geri al; bitmeyeni sessizce yarına taşıma veya habersiz plan değiştirme yok. |

## Artı, ses ve geçişler

| İstek | Güncel karşılık / sınır |
| --- | --- |
| Alt çubukta Notlar–Gelişim arasında artı | Erişilebilir Hızlı ekle düğmesi mevcut. |
| Ay ekranında ekleme yerine kaydır | Hızlı girişe `scrollIntoView`; başka sekmedeyse Planım’a geçer. |
| Ayardan “kaydır + sesle başla” | `prefs.quickVoice`; kapalıysa alana odak, açıksa aynı tıklamadan ses başlangıcı. |
| Güzel sayfa geçişi | Kısa, yaklaşık 210 ms animasyon; reduced-motion gözetilir. |
| Sesle yazma | Hızlı alan/tam formlar, Web Speech `tr-TR`; geçici/kesin sonuç, elle düzeltme, taslak koruma. Ham ses dosyası saklanmaz. |
| Her açılışta izin sormasın | Gerçek permission durumu kullanılır; uygulama sahte yerel “granted” saklamaz. Kalıcı izin OS/tarayıcı kararı, uygulama zorlayamaz. |
| Artı dinliyor gibi olup ses almıyor | Servis başlangıcı ile gerçek audio capture ayrılır; hazırlık/izin dönüşü/odak/zaman aşımı/hata akışı mevcut. Gerçek telefon deneyi gerekli. |

## Notlar ve gelişim

Not türleri, etiket/arama, görev/etkinliğe dönüştürme, öğrenme/hatırlama alanları ve isteğe bağlı tekrar günleri briefte istenir ve kodda yer alır. Gelişim alanlarında hedef/neden/bu hafta/normal gün/zor gün ve adım geçmişi bulunur. Örnek hedef onaylanmadan aktif sayılmaz.

Haftalık değerlendirme beş soru ve gün tercihi; erteleme/yoğunluk verisinden en fazla üç kurallı öneri. Serbest AI değildir. İbadet isteğe bağlı ve özel; puan/kıyas/dini hüküm yok. Ayrıntılı ilk beklenti `INITIAL_BRIEF.md` içindedir.

## Yedek ve PWA

| İstek | Güncel karşılık / sınır |
| --- | --- |
| Yedek indir/geri yükle yerine kopyala/yapıştır | Pano akışı mevcut. Clipboard API reddinde elle işlem alternatifi; OS izni atlanamaz. |
| Bütün veriler JSON | `schema`, `revision`, `prefs`, `items`, `notes`, `goals`, `days`, `reviews`, desteklenen cihaz taslakları. İsim/takvim/tekrar/tercihler dahil. |
| Veri silinse de geri gelsin | Geçerli yedek tüm durumu **değiştirerek** geri yükler, görünüm uygulanır; geri alma mevcut. Otomatik bulut yedeği değil. |
| Bozuk veri koruması | Şema/alan/kimlik/tarih/saat/istisna/taslak doğrulaması; geçersiz veri yazılmaz. |
| Gizli değerler | Token ve cihaz anahtarı yedeğe girmez; yeniden bot bağlama gerekebilir. Bu güvenli kapsam sınırıdır. |
| PWA silmeden güncelleme | SW/cache, güvenli boşta etkinleştirme; taslak/yazma/ses sırasında bekleme. Kullanıcı DB’sini silmez. |
| İlk açılış “şimdi güncelle” istemi olmasın | Otomatik kontrol/controllerchange istem göstermez. |
| İkinci açılış erişim hatası | Tüketilmiş Response/cache sorunu düzeltmesi ve `reopen` kurtarma yolu; gerçek cihazda yeniden kontrol gerekli. |
| Çevrimdışı | İlk yükleme sonrası statik kabuk/yerel veri. Dikte/Telegram internet isteyebilir. |
| Veri/kurulum devamı | Origin, PWA id, `gun-payi` IndexedDB v1 ve schema 1 korunmalı; cache ayrı. |

Eski dosya birleştirme yardımcısı core’da bulunur; **güncel pano ekranı tam durum geri yükleme** kullanır. Tarihsel QA’daki dosya indirme/birleştirme ekranını güncel sanmayın. Yedek şifreli kasa değildir.

## Bildirim, Telegram ve Mi Band 6

Kullanıcı anlık bildirim testini alırken örneğin 10 dakika önce ayarlanan gerçek hatırlatmayı alamadı. PWA Mi Band eşlikçi uygulamasında ayrı seçilemiyor, “diğer uygulamalar” altında görünüyordu. Telegram mesajları bilekliğe ulaştığından bot kanalı seçildi.

| İstek | Güncel karşılık / sınır |
| --- | --- |
| Gerçek saatli hatırlatma | Açık sayfada yerel kontrol; kapalıyken Telegram plan aynası + Durable Object alarmı. Gerçek teslim cihazda doğrulanmadı. |
| Kapalı PWA bildirimi | Mevcut çözüm Telegram; Web Push/VAPID kurulmuş değil. |
| Telefonda token + kullanıcı ID | Yalnız iki alan; ID yerelde, token sunucuda saklanır. |
| ID nasıl alınır? | Kendi botunda Başlat, sonra ID’mi bul; birden fazla aday varsa kişi kendi hesabını seçer. |
| Telefonda servis kurulmasın | Cloudflare hazırlığı bilgisayar/tarayıcıda; mevcut backend yayımlandı. |
| Bilgisayara indirmeden olsun | GitHub → Cloudflare tarayıcı dağıtımı kullanıldı. Zip/CLI zorunlu değil. |
| Telegram’dan yazabilme | `/ekle`, `/not`, `/bugun`, `/yarin`, `/hafta`, `/tamam`; düz metin not; hatırlatmada tamamlandı düğmesi. |
| Ajandaya dönsün | Kuyruklu olaylar açılışta alınır/kaydedilir, sonra plan aynası yüklenir. Tam anlık cihazlar arası senkronizasyon değildir. |
| Anlık ve zamanlı deneme | Telegram’dan dene ve 1 dk. sonra dene mevcut. Kullanıcı testi bekleniyor. |
| Mi Band teslimi | Telegram yansıtmasına dayanır; fiziksel test yok. OS listesine PWA’yı ayrı uygulama diye kaydettirme garantisi yok. |
| Spor/yürüyüş ikonları | Türkçe başlıktan otomatik SVG simge + elle seçim, yedek/şema doğrulaması. |
| Görselli Telegram mesajı | İstenmiş olası geliştirme; mevcut değil. |
| Serbest AI sohbet / Telegram sesini anlama | Gelecek olasılığı; model/API bağlı değil, mevcut komutlardan ayrı. |

## Görsel kalite ve devir

Sade, yetişkin, kısa Türkçe; tutarlı boşluk/hizalama, sakin renkler, uzun başlıkta taşmama, gerektiğinde açılan form ayrıntıları. Son iterasyonun sade Planım düzenini koruyun. Odak/etiket/klavye/dokunma alanı, safe-area ve reduced-motion gerekli.

Son talep: tüm kodu, ilk fikri, istekleri ve kaldığımız işi mevcut GitHub deposuna push. Bu yüzden frontend/backend birlikte, devir/brief/sohbet belgeleri eklendi. Gerçek yedekler, gizli bilgiler ve ilgisiz sohbetler dahil edilmez.

93 otomatik test ve tarihsel masaüstü QA temeldir. Gerçek telefonda ses/izin, yüklü PWA ikinci açılışı/güncellemesi, kapalı uygulama Telegram alarmı ve Mi Band teslimi tamamlanmadan bunlar doğrulandı denmemeli. Sonraki öncelik yeni özellikten önce bu somut deneyimi doğrulamaktır.
