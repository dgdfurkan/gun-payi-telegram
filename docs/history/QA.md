# Doğrulama geçmişi

## Tam kaynak devri — 18 Kasım 2026

- Mevcut Site kaynağı resmi kaynak deposundan açıldı; frontend/backend ortak runtime dosyaları GitHub’daki sürümle byte düzeyinde aynıydı. Kök üretim Wrangler binding/migration ve Worker mantığı değiştirilmedi.
- Frontend’in 85 testi ile backend’in 8 testi aynı depoda birlikte geçti: **93 başarılı, 0 başarısız**. Tüm JS modülleri için sözdizimi kontrolü eklendi. Bu kontroller gerçek telefon/bot teslim testi değildir.
- Frontend `telegram-config.json` içine mevcut Workers API adresi yazıldı. Native Site kaynak SHA’sı `5f8959648f1b13d5cceae3809efc64a8a8264095`, sürüm **10**; mevcut public URL’ye native yayın sonucu `succeeded`.
- Config shell precache’inde değil ve istemci no-store ile yüklüyor. Origin, IndexedDB v1 / schema 1 ve PWA kimliği değişmedi. Runtime JS/CSS bu config yayını sırasında değiştirilmedi.
- Bu çalışma ortamından doğrudan HTTP readback, ağ erişim politikası nedeniyle iki adreste de 403 döndürdü. Bu, uygulamanın kullanıcıya verdiği HTTP durumunun kanıtı değildir. Canlı health/CORS/config doğrulaması ayrı GitHub Actions kontrolünden yapılır; native başarılı yayın sonucu yayın kanıtıdır.
- Gerçek token, fiziksel mikrofon, kapalı PWA’da zamanlı mesaj ve Mi Band 6 test edilmedi. Sıradaki testler `docs/HANDOFF.md` içindedir.
- Aşağıdaki eski tarihli QA bölümleri tarihsel kayıttır. Eski indirme/birleştirme veya güncelleme bildirimi adımları güncel arayüz davranışı sanılmamalı.

## İlk doğrulama — 15 Kasım 2026

## Otomatik kontroller

18 test: gece yarısını aşan vardiya; pazar yeni vardiya olmaması; pazartesi hafta başlangıcı; tek gerçekleşme tamamlama, atlama ve uzak tarihe taşıma; seri güncelleme ve istisna korunması; tamamlanmayan görevin sessizce taşınmaması; tam 00.00 bitişi; tamponlu çakışma; JSON turu; bozuk tarih/saat/kimlik/istisna/yedek reddi; kimlik ve tarih bazlı birleştirme; gerçek erteleme verisinden öneri; tarih aritmetiği; tüm uygulama kabuğunun önbelleği; çevrimdışı fallback; kullanıcı isteğiyle worker etkinleştirme; yalnız kendi eski önbelleğini temizleme; üçüncü taraf ve yazma isteklerini önbelleğe almama.

JavaScript sözdizimi kontrolü: app.js, core.js, sw.js.

## Masaüstü Chromium tarayıcı kontrolü

- Görev oluşturuldu, tamamlandı ve sayfa yenilendi; tamamlanmış durum korundu.
- Uzun Türkçe görev başlığı yerleşimi kontrol edildi.
- Öğrenme notu oluşturuldu; yeniden açılışta not korundu.
- JSON yedeği indirildi ve aynı dosyadan birleştirme ile geri yüklendi; yinelenen kayıt oluşmadı.
- Bozuk JSON şeması dosya seçici ile içe alındı; açık hata ile reddedildi ve mevcut kayıtlar korundu.
- PWA kabuğunun on dosyası Cache Storage’da ve service worker activated durumunda görüldü.
- Sürüm yükseltmesi sırasında girilen not taslağı kapatılıp güncelleme seçildi. Yeni sürümde taslak geri açıldı ve içeriği korundu.
- Önizleme sunucusu DURDURULDU. Sayfa tekrar açıldı; not ve görev eklendi, görev tamamlandı. Sunucu hâlâ kapalıyken yeniden açılışta kayıtlar ve durumlar korundu. Bu, gerçek sunucu erişim kaybı ile uygulama kabuğu ve yerel veri kontrolüdür; telefonun uçak modu testi değildir.
- Sunucu sonrasında yeniden başlatıldı.
- Klavyeyle Enter kullanılarak yeni görev formu açıldı; Tab odağı başlıktan tür alanına geçti ve Escape formu kapatıp taslağı korudu.

## Ekran kontrolü

390 ve 320 piksel genişlikte iframe viewport ile mobil yerleşim kontrolü: Bugün ve Hafta ekranlarında yatay taşma yok; alt gezinme görünüyor. Haftada mobil günlük liste ve masaüstünde hafta özeti var. Sistem yazı tipleri kullanılıyor. Native dialog, etiketli formlar, odak stilleri, minimum dokunma hedefleri, safe-area ve reduced-motion stilleri kaynakta uygulanmıştır.

## Gerçek cihaz sınırları

Bu ortamda fiziksel Android veya iPhone yok. Android Chrome yerel yükleme penceresi, iOS Safari Paylaş → Ana Ekrana Ekle, ana ekranından standalone açılış, gerçek ekran klavyesi ve işletim sisteminin depolama tahliyesi fiziksel cihazda doğrulanmadı. iOS WebKit çalıştırılmadı. Manifest/ikonlar ve yönergeler sağlandı; tarayıcıdaki başarı gerçek cihaz testinin yerine geçmez.

Son kullanıcı için kalan cihaz kontrolü: çevrimiçi ilk açılış ve kurulum; standalone açılış; uçak modunda görev/not ekleme ve yeniden açılış; JSON indirme/dosya seçimi; yeni sürüm bildiriminden taslak koruyarak güncelleme.


## 2.0 arayüz yenilemesi — 15 Kasım 2026

- 18 mevcut core / service worker kontrolü yeniden çalıştırıldı, hepsi geçti. app.js, controls.js ve sw.js sözdizimi kontrolünden geçti.
- Masaüstü Chromium’da Bugün, Hafta ve Gelişim görsel olarak incelendi. Notlar ve Ayarlar hem mobilde hem gezinti kontrollerinde açıldı.
- 320 px iframe (305 px kullanılabilir iç genişlik) içinde beş ekranın her birinde documentElement.scrollWidth === clientWidth doğrulandı. 390 px iframe içinde Bugün ve Notlar da taşma olmadan incelendi.
- Hızlı görev ekleme sonucunun günlük listede göründüğü doğrulandı. Hızlı not mobilde eklendi ve Notlar ekranında açıldı.
- Özel seçim menüsünden tür değiştirildi, özel takvimden ertesi gün seçildi, 09:30–10:00 saatli etkinlik kaydedildi ve sonraki haftada görüldü.
- Tekrarlayan vardiyada seri / tek gün seçimi ve tek gün seçildiğinde tekrar alanlarının kilitlenmesi doğrulandı. Escape ile seçim menüsü kapatıldı.
- 320 px form ve özel takvim görsel kontrolü: formda yatay taşma yok; takvim ekrana sığıyor. Seçim menüleri popover üst katmanında açılır; dialog sınırında kesilmez.
- Kapatılmış modaldeki not taslağı sürüm değişikliği sonrasında geri açıldı, aynı içerik korundu ve kaydedildi.
- Hızlı ekleme alanına yazılıp sayfa yenilendi; aynı metin geri geldi.
- Önizleme sunucusu durduruldu; kök URL yeniden açıldı. Hızlı görev kaydedildi, sayfa yeniden açıldı ve kayıt korundu. Aynı sırada özel seçim menüsü de çevrimdışı açıldı. Sunucu ardından yeniden başlatıldı.
- Yeni controls.js modülü de uygulama kabuğunun precache listesinde. Kullanıcı veri şeması ve IndexedDB adı / sürümü değiştirilmedi.
- Son temada küçük metinlerin kontrastı ve seçili takvim / birincil buton renkleri görsel inceleme sonrasında güçlendirildi.
- Geçici iframe test sayfaları yayına dahil edilmedi. Görüntü `docs/ui-v2.jpg` altında; görüntüdeki kayıtlar yerel tarayıcı test kayıtlarıdır.

Bu kontroller masaüstü Chromium ve iframe viewport kontrolleridir. Fiziksel Android, iPhone, iOS WebKit, gerçek ekran klavyesi, ana ekrana kurulum ve standalone başlatma bu turda da doğrulanmadı. Tasarım bu platformların safe-area, sayısal saat klavyesi ve mobil form düzenini içerir; gerçek cihaz doğrulaması iddia edilmez.


## 2.1 Türkçe sesle yazma — 16 Kasım 2026

27 test geçti: 18 mevcut kontrol ve DictationSession / metin ekleme için 9 yeni kontrol. Yeni kontroller sentetik bir recognition nesnesi kullanır: tr-TR, geçici ve kesin sonuçların birleştirilmesi, aynı final sonuç listesinin iki kez eklenmemesi, Durdur sonrası gelen sonucun korunması, devam oturumu, hata ve zaman aşımı, sekme gizlenmesi, eski callback’ler, kaynak metnin ve Türkçe Unicode karakterlerin korunması, karakter sınırı, desteklenmeyen motor ve iki dakikalık durdurma. Ses dosyası veya gerçek konuşma ile doğruluk testi yapılmadı.

Tarayıcı / UI kontrolleri:

- Hızlı ekleme, tam görev formu ve tam not formunda mikrofon düğmeleri açıldı.
- Önizleme alanına elle girilen test metni hızlı alana eklendi; önceki yazı korundu.
- Aynı arayüz akışı görev başlığına ve not gövdesine uygulandı; notta önceki içerikten sonra satır sonuyla eklendi. Görev ve not normal Kaydet adımıyla kaydedildi.
- Ses paneline elle girilen metin kapatma / yeniden açmada aynı taslaktan geri geldi; Türkçe ı / İ / ş / ğ / ç / ö / ü karakterleri korundu.
- Gerçek SpeechRecognition başlatma düğmesine basıldı. Bu bulut tarayıcısı `not-allowed` döndürdü; uygulamanın mikrofon izni verilmedi açıklaması ve yeniden deneme akışı görüldü. Mikrofon izni verilmedi, canlı konuşma tanınmadı.
- 320 ve 390 px iframe viewport’ta ses paneli açıldı. Panelin scrollWidth ve clientWidth eşit; yatay taşma yok. Düğmeler ve metin düzenleme alanı görünür.
- Önizleme sunucusu durduruldu. Uygulama tekrar açıldı; panel ve yeni modüller önbellekten çalıştı. Elle girilmiş ses-metni taslağı sayfa yenilemesinden sonra geri geldi ve mevcut hızlı metne eklendi. **Bu, çevrimdışı konuşma tanıma testi değildir.**
- `voice.js` ve `dictation-core.js` uygulama kabuğunun önbellek listesinde. Kullanıcı veri şeması, IndexedDB adı ve sürümü korunuyor.
- Geçici mobil test sayfası yayımlama öncesinde kaldırıldı.

Gerçek mikrofonla Türkçe tanıma doğruluğu, fiziksel Android Chrome, iOS Safari ve standalone PWA’daki mikrofon izinleri bu ortamda doğrulanamadı. Tarayıcı / işletim sistemi ses hizmeti ve internet erişimi bağımlılığı kullanıcı arayüzünde belirtilir. ChatGPT’nin transkripsiyon modeli bağlı değildir.


## 3.0 sade planlayıcı ve panelsiz dikte — 16 Kasım 2026

- 36 otomatik test geçti: önceki 27 kontrol ve hatırlatma/ICS için 9 yeni kontrol. Kesin varsayılan zamanlar, özel/genel/kapalı süreler, uzak tarihteki tek gerçekleşme istisnası, durum filtresi, eski uyarıların atlanması, eski yedeklerle uyum, gece yarısını aşan ICS süresi, VALARM, metin kaçışı ve UTF-8 satır katlama kapsanıyor.
- Varsayılan açılışta yedi günlük plan gösterildi. Liste yedi gün grubu, Ay 42 hücre üretti; sonraki ay doğru tarih aralığını gösterdi.
- Hızlı görev, saatli etkinlik ve hızlı not Ekle ile kaydedildi. Not Notlar ekranında görüldü. Ayrıntılar’a taşınan başlık tam formda korundu; kayıt sonrasında hızlı taslak temizlendi.
- Saatli planın 1 gün/1 saat varsayılanları görüldü. Özel 2 saat ve 30 dakika kaydedildi, yeniden açıldığında korundu. Genel ayar varsayılanları 1 gün ve 1 saat olarak kaldı.
- Gerçek mikrofon tıklaması yeni dialog açmadı; ortamın `not-allowed` hatası alanın altında gösterildi. Gerçek ses tanınmadı.
- `tests/inline-voice-browser.html` ile gerçek voice.js üzerinde sentetik tr-TR geçici/kesin sonuçlar denendi. Aynı geçici sonucun tekrarı çoğalmadı; Ekle son kesin kelimeleri bekledi. İlk sonuç öncesinde alan boşken Ekle de aynı kaydı tamamladı. Dikteyi başlatmadan ilk yazılı kayıt başarılıydı. Elle düzeltme tanımayı iptal etti ve düzeltme korundu. Tümünde dialog sayısı sıfırdı. Bu akustik doğruluk testi değildir.
- 390 ve 320 px iframe içinde haftalık görünümde yatay taşma yoktu. Notlar (390) ve Ayarlar (320) için de scrollWidth/clientWidth eşitliği görüldü. Bunlar fiziksel telefon veya ekran klavyesi testleri değildir.
- `.ics` dosyası UI’dan indirildi; uygulama 79 saatli test gerçekleşmesi bildirdi. İçe aktarma/telefon takvimi alarm teslimi test edilmedi.
- Bulut tarayıcısı sistem bildirim iznini reddetti. İzin reddi davranışı görüldü; gerçek OS teslimi ve bildirim tıklaması çalışırken doğrulanamadı. Bildirim tıklaması handler’ı kaynakta mevcut.
- Sayfa açıkken 30 saniyelik kontrol + showNotification uygulanır. Kapalı PWA’ya push aboneliği/sunucu/zamanlayıcı kurulmadı. Uygulama ve README bunu açıkça belirtir. Platformun saatlik otomasyon aralığı bu işin hassas teslimini sağlamadığından yanıltıcı bir otomasyon oluşturulmadı.
- Yeni iki hatırlatma modülü PWA kabuğuna eklendi. Mevcut kullanıcı veri şeması/IndexedDB sürümü değişmedi. Sürüm güncellemesinde daha önceki yerel test kayıtları korundu.
- `docs/ui-v3.jpg` son masaüstü haftalık görünümü gösterir; içerik yerel QA verisidir. Geçici `_qa` sayfaları yayın çıktısından kaldırıldı.

Fiziksel Android/iPhone, iOS WebKit, ana ekran kurulumu, gerçek mikrofon doğruluğu, arka planda işletim sistemi davranışı ve takvim uygulamasında alarm teslimi doğrulanmadı. Kapalı uygulama push desteği tamamlanmış değildir.

## 3.1 hızlı erişim, pano yedeği ve otomatik güncelleme — 16 Kasım 2026

- 48 otomatik kontrol geçti. Yeni kontroller tam veri ve taslak JSON turu, eski yedekler, bozuk pano verisi, depolama kotası hatasında geri alma, eksik kabuk yüklemesinin etkinleşmemesi, otomatik güncellemenin yazma/konuşma/form/son etkileşim sırasında beklemesi, ilk kurulum ve aynı anda gelen controller olaylarını kapsıyor.
- Tüm yayın JavaScript dosyaları sözdizimi kontrolünden geçti. IndexedDB adı ve şema sürümü korunuyor.
- Masaüstü Chromium'da Liste seçilip yeniden açıldı; aynı görünüm geri geldi. Ay görünümü mobilde de kullanıldı.
- Mobil 390 ve 320 px iframe kontrollerinde içerik yatay taşmadı. Alt gezinmede Notlar ve Gelişim arasında artı var; ay görünümündeki ekleme alanına kaydırdı. Ayarlar'daki sesle başla tercihi kaydedildi.
- Sentetik Türkçe motoruyla artı doğrudan aynı alanda dinlemeyi başlattı, geçici metin alanda göründü ve Ekle sonrası son kesin kelimelerle tek görev kaydedildi; dialog açılmadı. Gerçek akustik doğruluk testi değildir.
- Pano kopyası ad, planlar, notlar, hedefler ve üç kullanıcı taslağı anahtarını içerdi. Ad değiştirilip aynı JSON yapıştırıldı; eski ad döndü. Geri al, geri yükleme öncesindeki kaydı geri getirdi. Geçersiz JSON mevcut kayıtları değiştirmedi. Başka sekme değişikliği algılanınca çakışan yazma reddedildi.
- Yeni worker sürümleri yüklenirken kayıtlar korundu; plan formundaki “Güncellemede korunan plan taslağı” yeniden açılabildi. Otomatik bekleme koşulları ayrıca kontrollü saat ve service worker nesneleriyle test edildi.
- Uygulama dosyaları tam ve sürümlü kabuk olarak önbelleğe alındıktan sonra worker etkinleşir. Sayfa, düzenleme sırasında yenilemeyi erteler; elle geçişte metin ve form taslakları ile ekran bağlamı saklanır. Kayıt veritabanı temizlenmez.
- `docs/ui-v3.1.jpg` 390 px iframe üzerinden alınan mobil görünüm; içerik yerel QA kayıtlarıdır. Geçici QA sayfaları yayın çıktısından çıkarıldı.

Fiziksel Android/iPhone, iOS WebKit, standalone PWA'nın işletim sistemi tarafından askıya alınması, gerçek pano izin pencereleri ve gerçek mikrofonla Türkçe doğruluk bu ortamda doğrulanmadı. Uygulama tamamen kapalıyken anlık güncelleme veya arka plan bildirim teslimi garanti edilmez.

Önceki sürümden ilk geçişte eski ekran kalırsa uygulamayı kapatıp yeniden açmak gerekebilir; kaldırıp yeniden kurmak gerekmez.

## 3.1.5 yeniden açılış ve sessiz güncelleme düzeltmesi — 16 Kasım 2026

- Önceki service worker, yönlendirilmiş bir HTML yanıtını önbelleğe aldığı biçimde navigation isteğine verebiliyordu. Eski kaynak aynı fixture'da redirected=true, düzeltilen kaynak redirected=false döndürdü. Bu yanıt geçmişi tarayıcının manuel yönlendirmeli navigation isteğini ağ hatasına düşürebilir. Yeni sürüm sayfa yanıtını güvenli bir Response olarak yeniden oluşturur; HTML için /index.html yönlendirmesine bağımlı olmadan kök adresi indirir.
- Önbellek kayıp veya kullanılamazsa ağdan açılış ve onarım; ağ kapalıysa bir önceki uygulama kabuğuna geri dönüş vardır. Hiçbir kaynak yoksa tarayıcı hata sayfası yerine uygulama içinde yeniden deneme sayfası döner. Yeni sürüm eksiksiz indirilmeden etkinleşmez. Kullanıcı IndexedDB/localStorage kayıtları temizlenmez.
- Açılıştaki Yeni sürüm hazır / Şimdi güncelle bileşeni ve otomatik bildirim çağrıları kaldırıldı. Güncelleme arka planda kalır; düzenleme ve dikte sırasında bekleme sürer. Otomatik yenileme çevrimdışıyken ertelenir.
- Eski kurulumdaki bozuk kök sayfayı aşmak için /reopen.html ayrı bir giriş sağlar. Yalnızca düzeltilmiş worker'ın sürüm yanıtını aldıktan sonra / adresine gider. Tarayıcı verilerini, uygulama kurulumunu veya kayıtları silmez. Ağ yokken eski worker etkinse, bozuk köke dönmek yerine yeniden deneme seçeneği sunar.
- Chromium önizlemesinde /reopen.html eski kayıtlar ve taslaklar korunarak normal plana geçti. Yeni görev eklendi; ikinci yüklemede kayıt durdu. Önizleme SUNUCUSU DURDURULDU, kök sayfa yeniden yüklendi; ajanda ve test görevi önbellekten açıldı. Güncelleme bildirimi görünmedi. Bu, gerçek sunucu erişim kaybıdır; fiziksel telefon uçak modu testi değildir.
- Otomatik kontroller: yönlendirilmiş önbellekle ardışık açılış; eski yönlendirilmiş kayıtların güvenli sunulması; kayıp/erişilemeyen önbellek; önceki kabuğa dönüş; tamamen çevrimdışı hata sayfası; eksik/yanlış MIME içeren sürümün reddi; sessiz güncelleme; eski worker'dan onarım girişi. Fiziksel Android/iOS ve standalone açılış bu ortamda doğrulanmadı.


## 4.0.2 Telegram servisi ve gerçek mikrofon durumu — 16 Kasım 2026

- 81 otomatik kontrol geçti: önceki 58 + 16 Telegram + 6 mikrofon/simge + 1 yerel gecikme telafisi. Telegram ağ yanıtları sahtedir; gerçek Bot API çağrısı yapılmaz. Kontrollü sunucu saati, kalıcı alarm deposu ve webhook isteği üzerinden 10 dakika öncesi, uygulamadan bağımsız 1 dakikalık test, iptal/duraklatma, tek gerçekleşme tamamlama, tekrarlı istek, kesin 429 yeniden deneme ve belirsiz ağ sonucunu çoğaltmama doğrulandı.
- Webhook sırrı ve özel sohbet/kullanıcı ID’si birlikte zorunlu. Başka bot webhook’u ezilmiyor; yeniden bağlama eski cihaz anahtarını iptal ediyor. Token durum yanıtına/JSON yedeğine girmiyor. Tarayıcı, kullanıcı tarafından girilen HTTPS workers.dev köküne bağlanıyor.
- Gün doğumu gibi tahminli doğal dil yok; desteklenen Türkçe komutlar deterministik. Telegram kaynaklı görev ve not önce cihazda kaydediliyor, ardından imleç ilerliyor; bekleyen sunucu değişiklikleri yerel takvim kopyasıyla ezilmiyor.
- Chromium’daki `tests/voice-telegram-browser.html` kontrol sayfası geçici olarak yayın köküne kopyalandı. Sahte API bağlandı, görev Planım’da ve not Notlar’da görüldü; toplu notlar dışarı gönderilmedi. Test bağlantısı kesildi ve yeniden açılışta Henüz bağlı değil görüldü. Gerçek mesaj gönderilmedi. Geçici `_qa4.html` yayın paketinden kaldırıldı.
- Aynı UI’da + → hazırlık → izin penceresi nedeniyle gizlenme/görünme → servis başlangıcı → audio-start → geçici Türkçe metin → Ekle → final metin akışı tek görev kaydetti. Servis başlangıcında kayıt açık gösterilmedi; yalnız audio-start ile kayıt durumu değişti. Gerçek ses tanınmadı.
- Gerçek bulut mikrofon izni reddedilmiş durumda okundu. Açık izin kontrolü akışı görüldü. İznin cihazda kalıcılığı, fiziksel mikrofon, Android/iOS/standalone SpeechRecognition ve Türkçe akustik doğruluk test edilmedi; bunlar tarayıcı/işletim sistemi bağımlılığıdır.
- 320 ve 390 px iframe kontrollerinde yatay taşma yoktu (320 çerçevede 305/305 px). Otomatik yürüyüş/öğrenme/iş simgeleri görüldü; Simge → Spor seçimi kaydedildi ve satır SVG’si değişti.
- Telegram kurulum rehberi ve servis ZIP indirme kontrolü tarayıcıdan yapıldı. ZIP kendi Worker kaynağı, bağımlılık bildirimi, migrations ve kurulum komutunu içerir. Gerçek Cloudflare dağıtımı, gerçek Telegram alarmı ve Mi Band testi için kullanıcı hesabı/token/ID gereklidir; bu ortamda yapılmadı.
- IndexedDB adı, şema sürümü ve önceki plan/not kayıtları korunuyor. PWA bildiriminin uygulama kapalıyken çalıştığı iddia edilmiyor; kapalı uygulama için Telegram servisi ayrı olarak etkinleştirilmelidir.

`docs/ui-v4.jpg` simgeli masaüstü plan görünümünü gösterir; kayıtlar yerel test verileridir.


## 4.1.1 iki alanlı Telegram bağlantısı — 16 Kasım 2026

- 85 test geçti. Önceki alarm/tekrar/pano/mikrofon kontrollerine bot başına alan izolasyonu ve ID bulma güvenlik kontrolleri eklendi. Sahte Bot API kullanıldı; gerçek token veya mesaj gönderimi yoktur.
- Wrangler 4.163.0 `deploy --dry-run` Worker’ı derledi; ReminderHub ve SETUP_LIMITER bağları doğrulandı. Gerçek dağıtım yapılmadı: `wrangler whoami` authenticated olmadığını, Cloudflare dashboard giriş ekranı açık oturum olmadığını gösterdi. Servis yapılandırması boş bırakıldı.
- Chromium 390 px iframe’de formun yalnız iki input’u olduğu görüldü: password botToken ve sayısal userId. URL/kurulum anahtarı/terminal alanı yok. Boş servis adresinde doğru bekleme açıklaması ve pasif Bağla düğmesi görüldü.
- Geçici test sayfasında sahte sunucu yapılandırması yüklendi. ID’mi bul, sahte Başlat mesajı sahibinin ad/ID’sini gösterdi ve alanı doldurdu. Telegram’ı bağla yalnız bu iki alanla çalıştı; bot kimliğiyle ayrılmış API yoluna geçti. Test bağlantısı kesildi. Gerçek sunucu etkin değilmiş gibi normal ekrana geri dönüldü.
- 320 px iframe’de clientWidth/scrollWidth 305/305 px; yatay taşma yok. Yerel test kaydı ve sahte bağlantı kullanıcı verisi değildir. `_qa5.html` yayın paketinden çıkarıldı.
- `docs/ui-v4.1.jpg`, iki alanlı gerçek bekleme ekranını gösterir. Telefonda hazır sunucu veya gerçek alarm teslimi iddia edilmez. Hesap girişi, Worker’ın gerçek dağıtımı ve gerçek Telegram/PWA kapalı testi halen bekliyor.
