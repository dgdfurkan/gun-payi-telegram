# Gün Payı

Türkçe kişisel ajanda ve PWA. Planlar, notlar ve hedefler cihazdaki IndexedDB’de tutulur. İlk açılış haftalık plandır; sonraki açılışlar son görünümü korur.

## 3.0: daha az adım

Planım ekranında Hafta, Liste ve Ay görünümleri bulunur. Gün seçilir, görev yazılır veya söylenir, Ekle ile kaydedilir. Saat isteğe bağlıdır; saatli hızlı kayıt etkinlik olur. Not sekmesi aynı alanda hızlı not kaydeder. Tekrar, bitiş, alan ve hatırlatma gibi ayrıntılar gerektiğinde açılır. Tamamlanan planlar katlanabilir.

Özet ve öneri kartları ana ekrandan kaldırıldı. Az sayıda vurgu rengi, sade başlıklar, mobil alt gezinme ve aynı seçim/tarih bileşenleri kullanılıyor. `controls.js`, gerçek form alanlarının üstünde çalışan klavye destekli özel seçim menüleri ve ay/yıl değiştirebilen takvim sağlar. Yerel tarayıcı select/tarih pencereleri açılmaz. Saat alanı 24 saatlik metin girişi ve mobil sayısal klavye kullanır.

Görünüm: `docs/ui-v3.jpg`. Görüntüdeki kayıtlar yerel tarayıcı test kayıtlarıdır.

## Panelsiz Türkçe dikte

Mikrofon ilk dokunuşta `tr-TR` konuşma tanımayı başlatır. Geçici ve kesin metin doğrudan mevcut görev/not alanına yazılır; ek bir konuşma paneli yoktur. Mevcut metin ve seçili bölüm korunur. Aynı sonuç tekrar gelirse metin çoğaltılmaz. Elle düzenlemeye başlamak dikteyi durdurur. Ekle, tanımayı durdurup son sonucu bekler, sonra aynı formu kaydeder; ilk geçici sonuç henüz gelmemişse de aynı davranış uygulanır.

Tarayıcının SpeechRecognition hizmeti kullanılır; ChatGPT/OpenAI transkripsiyon modeli bağlı değildir. Ses, tarayıcının hizmetinde işlenebilir ve internet gerektirebilir. Ham ses kaydı oluşturulmaz/saklanmaz. Türkçe konuşma doğruluğu, gerçek mikrofon ve fiziksel telefon izinleri bu ortamda doğrulanamadı. Destek/izin hataları alanın altında Türkçe gösterilir; yazılı ekleme devam eder.

Alan sınırını aşan metin kesilmez, kurtarılabilir yerel taslağa alınır ve not olarak açılabilir. Normal hızlı metin de yerel taslakta korunur. İki dakikalık oturum sınırı, başlatma/durdurma zaman aşımı, sayfa gizlendiğinde durdurma ve eski callback’lerin yok sayılması `dictation-core.js` tarafından yönetilir.

## Hatırlatmalar ve sınırları

Saatli açık planların varsayılan süreleri **1 gün ve 1 saat önce**. Ayarlar’dan genel süreler, planın Hatırlatmalar bölümünden o plana/gerçekleşmeye özel süreler seçilebilir. En fazla beş süre; özel dakika/saat/gün; başlangıç anı veya tamamen kapatma desteklenir. Varsayılanı izleyen kayıtlar genel ayar değişikliklerini devralır. Eski yedekler varsayılan süreleri kullanır.

**Sistem bildirimleri yalnız uygulama sayfası çalışırken gönderilebilir.** Bildirim izni kullanıcı tıklamasıyla istenir. 5 saniyelik sayfa kontrolü service worker `showNotification` kullanır; sıra her dakika yenilenir. Yakın zamanda kaçırılan uyarılar yalnız plan hâlâ ilerideyse telafi edilir; bitmiş planlar için eski uyarılar gönderilmez. Ayrı IndexedDB teslim kayıtları sekmeler arasında yinelenmeyi önler. Bildirime dokunmak ilgili tarihi açar.

Kapalı uygulamaya zamanında push gönderecek sunucu, push aboneliği, VAPID anahtarı ve hassas zamanlayıcı bağlı değildir. Arka plan teslim garantisi yoktur. Bu sürüm böyle bir destek varmış gibi davranmaz; yalnız uygulamanın kurulması bu sınırı kaldırmaz. Gerçek işletim sistemi bildirimi bu bulut tarayıcısının izin reddi nedeniyle doğrulanamadı.

Alternatif: Planım veya Ayarlar’dan önümüzdeki 90 günün saatli planları `.ics` olarak indirilir. Dosya seçilen hatırlatmaları DISPLAY VALARM olarak içerir; telefon takviminde içe aktarmak ve takvim uygulamasının alarm desteği gerekir. Sonraki değişiklikler takvimdeki kopyaya otomatik yansımaz. Bu özellik otomatik takvim bağlantısı değildir.

## Kullanım ve veriler

- Liste / Hafta / Ay seçimi kayıtlı tercihtir; yeniden açılışta son görünüm gelir. Mobil alt menüde Notlar ile Gelişim arasındaki +, aynı ekleme alanına kaydırır. Ayarlar → + ile sesle başla seçiliyse dikte aynı tıklamada başlar. Hareket azaltma tercihi animasyonları kapatır.
- Haftalık planda tarih seçip hızlı görev/not ekle; Ayrıntılar’dan tekrarı düzenle. Başlangıçtan erken bitiş ertesi güne taşar.
- Notlar’da ara, düzenle, plana dönüştür. Öğrenme notlarında 1/3/7 gün tekrar önerileri uygulama açıldığında görünür.
- Gelişim’de kişisel hedefleri ve gün notunu düzenle; Ayarlar’dan haftalık değerlendirme gününü seç.
- Ayarlar → Yedekler: Yedeği kopyala ile tüm kayıtları, tercihleri ve taslakları JSON olarak panoya al. Yedeği yapıştır geçerli yedeği hemen geri yükler; Geri al önceki verileri döndürür. Pano erişimi reddedilirse seç/kopyala veya elle yapıştır alanı açılır. Önceki JSON dosyalarının metinleri de kabul edilir.
- Ayarlar → Kurulum: desteklenen Android Chrome’da kurulum istemi; iOS Safari’de Paylaş → Ana Ekrana Ekle yönergesi.

Kullanıcı kayıtları `gun-payi/local/state`, teslim işaretleri `gun-payi-reminders/delivered` IndexedDB alanındadır. Taslaklar aynı cihazın localStorage alanında tutulur. Telegram bağlı değilken plan/not kayıtları sunucuya gönderilmez. Telegram bağlantısı açılırsa planların zamanlama kopyası sahibinin servisinde tutulur; notlar topluca aktarılmaz. Tam cihaz eşitlemesi yoktur. Tarayıcı verileri temizlenirse kayıtlar kaybolabilir; kurulum yedek değildir.

PWA önbelleği kullanıcı kayıtlarından ayrıdır. Yeni sürüm tam kabuk önbelleğe alındıktan sonra etkinleşir; sayfa açıkken dakikada bir ve tekrar görünür olduğunda sürüm kontrol edilir. Sayfanın yeni sürüme geçmesi için dikte, açık form, odaklanmış yazı alanı ve bekleyen kayıtlar tamamlanır. Son görünüm ve hızlı taslak korunur. Kurulu PWA silinmez, yalnız uygulamanın eski önbellekleri silinir. Form taslakları, planlar ve notlar korunur. İlk başarılı çevrimiçi açılış sonrasında uygulama kabuğu ve yerel metin kaydı çevrimdışı kullanılabilir; bu, çevrimdışı konuşma tanıma veya bildirim zamanlaması iddiası değildir.

## Kaynak ve kontrol

Build gerektirmeyen ES modülleri; yayın çıktısı `dist/`. Harici CDN/font bağımlılığı yoktur. Kaynak değiştiğinde `sw.js` önbellek sürümü artırılır.

- `core.js`: tarih, vardiya, tekrarlar, istisnalar, yedekler.
- `app.js`, `style.css`, `controls.js`: arayüz, form ve yerel kayıt akışları.
- `voice.js`, `dictation-core.js`: doğrudan alana dikte ve yaşam döngüsü.
- `reminders-core.js`, `reminders.js`: süreler, sıra, teslim işaretleri ve ICS.
- `backup.js`, `updates.js`: tam pano yedeği, doğrulama ve güvenli otomatik sürüm geçişi.
- `sw.js`, manifest ve ikonlar: uygulama kabuğu, bildirim tıklaması, kurulum.

`npm test`: 85 otomatik kontrol. `tests/inline-voice-browser.html`, geliştirme sunucusunda geçici olarak yayın köküne konularak sentetik inline dikte olaylarını UI’dan test eder; üretim çıktısına dahil edilmez. Yapılan UI kontrolleri ve gerçek cihaz sınırları `QA.md` içindedir.

## 3.1.5 açılış onarımı

Güncellemeler uyarı veya Şimdi güncelle düğmesi göstermeden uygulanır. HTML önbelleğe yazılırken ve açılırken yönlendirme geçmişinden arındırılır. Bir önceki kabuk onarım için korunur; önbellek erişim hatası çevrimiçi sayfanın açılmasını engellemez. Eski kurulumlarda kök açılmıyorsa `/reopen.html`, yeni worker sürümünü doğrulayıp normal plana döner. Kayıtlar ve kurulum silinmez.

## 4.0.2 Telegram, mikrofon ve görev simgeleri

`plan-icons.js` Türkçe başlıklara uygun çizgi simgeler verir; plan ayrıntılarındaki Simge alanı elle değiştirir. Tek gerçekleşme istisnaları ve JSON yedekleri simgeyi korur.

`microphone.js` gerçek Permissions API durumunu okur. Ayarlar’daki açık izin kontrolü getUserMedia kullanır ve tüm ses izlerini durdurur. Yerelde sahte bir izin kaydı tutulmaz; kalıcı izin kararı tarayıcı/işletim sisteminindir. Dikte servisi başladığında mikrofon açık varsayılmaz: gerçek audio-start olayına kadar hazırlanıyor durumu gösterilir. İzin penceresinin odağı değiştirmesi başlangıcı hemen iptal etmez.

`telegram.js`, kullanıcı tarafından kurulacak bağımsız Cloudflare Worker’a bağlanır. İndirilebilir paket `scripts/package-telegram.py` ile oluşturulur; kurulum `dist/telegram-setup.html` içinde anlatılır. Kaynak `telegram-worker/`, yerel testler `tests/telegram.test.mjs` içindedir. Durable Object alarmı zamanlamayı sayfadan bağımsız yapar; webhook yalnız kayıtlı özel sohbet ve kullanıcı ID’sini kabul eder. Bot tokenı servis verisinde, cihaz anahtarı tarayıcıda kalır. Sırlar JSON yedeğine girmez.

**Telegram servisi bu çalışma ortamında dağıtılmadı, gerçek bot bağlanmadı.** Kullanıcının Cloudflare hesabıyla kurulumu ve kendi token/ID’siyle bağlaması gerekir. Gerçek Telegram mesaj teslimi, telefon kapalı/PWA kapalı testi ve Mi Band bildirimi henüz doğrulanmış değildir. Tarayıcı PWA push altyapısı eklenmedi; Telegram alternatif kanaldır.

Desteklenen komutlar: `/ekle yarın 09:00 Spor`, `/not fikir`, `/bugun`, `/yarin`, `/hafta`, `/tamam 1`. Düz metin not olur. Hatırlatma düğmesi tek gerçekleşmeyi tamamlar; değişiklikler ajanda açılınca önce cihaz veritabanına uygulanır, sonra ayna planlar sunucuya gönderilir. Serbest AI sohbeti, ses mesajı çözümü ve görsel mesaj üretimi bağlı değildir.

## 4.1.1 telefonda yalnız token ve ID

Telefon bağlantısı yalnız Bot tokenı ve Telegram kullanıcı ID alanlarını içerir. Servis adresi `dist/telegram-config.json` dosyasından otomatik ve önbelleksiz okunur; kurulum anahtarı telefona girilmez. ID’mi bul, kullanıcının kendi botuna gönderdiği Başlat mesajındaki özel sohbet kimliğini sunucudan okur. Birden fazla kişi varsa kullanıcı kendi hesabını seçer. Başka servisin webhook’u değiştirilmez.

Sunucu yeni botları getMe/getChat ile doğrular, her bot için ayrı kalıcı alarm alanı açar. Başka botun erişim anahtarı bu alanı okuyamaz. İlk yapılandırma token sahipliği ile yetkilidir; cihaz sonraki işlemlerde ayrı anahtar kullanır. Eski, açıkça PAIRING_KEY verilmiş sunucuların uyumluluk yolu korunur; yeni iki alanlı sunucuda bu secret kullanılmaz. Kurulum uçları yaklaşık 20/dakika IP limitiyle korunur.

Bu turda servis paketi Wrangler 4.163.0 ile derlendi (`deploy --dry-run` başarılı); Cloudflare hesabı hem tarayıcıda hem CLI’da açık değildi. Gerçek Worker dağıtımı ve gerçek Telegram testi bu nedenle henüz yapılmadı. `serviceUrl` boş bırakıldı: telefon sunucu bekleniyor durumunu ve pasif bağlantı düğmelerini gösterir. Giriş tamamlandıktan sonra bilgisayarda servisi yayınlayıp sağlık kontrolünden geçen adresi bu dosyaya koyarak Site yeniden yayınlanmalıdır. Telefonda servis kurulumu gerekmez.

85 test geçti. Yeni testler botlar arası izolasyon, hatalı token/rate-limit altında alan açılmaması, ID bulmada yalnız özel kullanıcı mesajlarının alınması, birden fazla kişinin listelenmesi ve başka webhook’un korunmasını kapsar. Token girilmişken veya bağlanma/ID bulma sürerken otomatik sürüm geçişi ve gelen takvim değişikliklerinin formu yenilemesi ertelenir. Token taslaklara veya yedeklere yazılmaz.

## 18 Kasım 2026 bağlantı tamamlama

Kullanıcının Cloudflare’da kurduğu Telegram sunucusu `https://gun-payi-telegram.frkngndz60.workers.dev` olarak `dist/telegram-config.json` dosyasına bağlandı. JSON dosyası istemcide `no-store` okunur; uygulama açıldığında veya yeniden öne geldiğinde bağlantı alanı etkinleşebilir. PWA kurulumu ve IndexedDB kullanıcı şeması değiştirilmedi.

Bu, sunucu adresinin uygulamaya bağlanmasıdır. Gerçek BotFather tokenı ve kullanıcı ID’siyle bağlantı, uygulama kapalıyken bir dakikalık gönderim ve fiziksel Mi Band teslimi bu oturumda denenmedi. Kullanıcı bu sırları uygulamadaki iki alana kendisi girecek. Tarihsel bölümlerdeki “sunucu kurulmadı” ifadeleri o aşamaya aittir. Güncel devir notları GitHub reposundadır.
