import { BILL_TYPES } from './bills.js';

// Plan başlığından ikon/kategori tahmini. Hem uygulama (ikon) hem bot (emoji) kullanır.
// "=" ile başlayan sözcük tam eşleşir ("ara" ≠ "araba"); diğerleri kök olarak ek alabilir.
export const CATS = {
  birthday: { label: 'Kutlama', color: '#ff375f', emoji: '🎂', glyph: 'cake', words: ['doğum günü', 'doğumgünü', 'yıldönümü', 'kutla', 'nişan', 'düğün'] },
  call: { label: 'Arama', color: '#34c759', emoji: '📞', glyph: 'phone', words: ['=ara', 'arama', 'arayaca', 'telefon', 'görüntülü', 'whatsapp'] },
  meet: { label: 'Toplantı', color: '#0a84ff', emoji: '👥', glyph: 'users', words: ['toplantı', 'görüşme', 'buluş', 'sunum', 'mülakat', 'meeting', 'zoom'] },
  sport: { label: 'Spor', color: '#ff9500', emoji: '🏃', glyph: 'run', words: ['spor', '=koşu', 'koşuya', 'koşma', '=koş', 'yürüyüş', 'antrenman', 'gym', 'fitness', 'yoga', 'pilates', 'bisiklet', 'yüzme', 'futbol', 'basketbol', 'halı saha', 'esneme'] },
  health: { label: 'İlaç', color: '#ff3b30', emoji: '💊', glyph: 'pill', words: ['ilaç', 'ilac', 'vitamin', '=hap', 'şurup', 'iğne', 'insülin'] },
  doctor: { label: 'Sağlık', color: '#ff2d55', emoji: '🩺', glyph: 'heart', words: ['doktor', 'dişçi', '=diş', 'randevu', 'hastane', 'muayene', 'tahlil', 'eczane', 'fizyoterapi'] },
  study: { label: 'Ders', color: '#af52de', emoji: '📚', glyph: 'book', words: ['kitap', '=oku', 'okuma', 'ders', 'çalış', 'sınav', 'ödev', 'kurs', 'ingilizce', 'kelime', 'eğitim'] },
  pay: { label: 'Ödeme', color: '#5856d6', emoji: '💳', glyph: 'card', words: ['fatura', '=kira', 'kirayı', '=öde', 'ödeme', 'aidat', 'kredi', 'banka', 'vergi', 'borç', 'taksit'] },
  shop: { label: 'Alışveriş', color: '#30b0c7', emoji: '🛒', glyph: 'cart', words: ['market', 'alışveriş', 'bakkal', 'manav', 'sipariş', 'migros', 'getir'] },
  food: { label: 'Yemek', color: '#ff9f0a', emoji: '🍽️', glyph: 'food', words: ['yemek', 'kahvaltı', 'pişir', 'mutfak', 'restoran', 'öğle yemeği'] },
  water: { label: 'Su', color: '#32ade6', emoji: '💧', glyph: 'drop', words: ['su iç', '=su'] },
  sleep: { label: 'Uyku', color: '#5e5ce6', emoji: '🌙', glyph: 'moon', words: ['uyu', 'uyku', '=yat', 'yatma', 'kalk', 'uyan'] },
  travel: { label: 'Yolculuk', color: '#0a84ff', emoji: '✈️', glyph: 'plane', words: ['uçak', 'uçuş', 'havalimanı', 'otel', 'tatil', 'bilet', 'yolculuk', 'valiz', 'pasaport', 'vize'] },
  car: { label: 'Araç', color: '#8e8e93', emoji: '🚗', glyph: 'car', words: ['araba', 'araç', 'servis', 'benzin', 'yakıt', 'lastik', 'otobüs', 'metro', 'taksi'] },
  work: { label: 'İş', color: '#64748b', emoji: '💼', glyph: 'work', words: ['=iş', 'işe', 'işten', 'vardiya', 'depo', 'mesai', 'ofis', 'proje', 'rapor', 'müşteri'] },
  mail: { label: 'Mesaj', color: '#007aff', emoji: '✉️', glyph: 'mail', words: ['mail', 'e-posta', 'eposta', 'mesaj', 'dilekçe'] },
  clean: { label: 'Ev işi', color: '#00c7be', emoji: '🧹', glyph: 'sparkle', words: ['temizlik', 'temizle', 'çamaşır', 'bulaşık', 'süpür', 'ütü', '=çöp', 'çöpü', 'toz al'] },
  fun: { label: 'Eğlence', color: '#bf5af2', emoji: '🎬', glyph: 'film', words: ['film', 'dizi', 'sinema', 'tiyatro', 'konser', 'maç'] },
  pet: { label: 'Evcil', color: '#a2845e', emoji: '🐾', glyph: 'paw', words: ['köpek', 'kedi', 'mama', 'veteriner', 'balık', 'akvaryum'] },
  plant: { label: 'Bitki', color: '#30d158', emoji: '🌱', glyph: 'leaf', words: ['çiçek', 'bitki', 'sula', 'fide', 'bahçe'] },
  power: { label: 'Elektrik', color: '#f5a300', emoji: '💡', glyph: 'bolt', words: [] },
  flame: { label: 'Isınma', color: '#ff6b35', emoji: '🔥', glyph: 'flame', words: [] },
  wifi: { label: 'İnternet', color: '#0a84ff', emoji: '🌐', glyph: 'wifi', words: [] },
  mobile: { label: 'Hat', color: '#34c759', emoji: '📱', glyph: 'mobile', words: [] },
  home: { label: 'Ev', color: '#a2845e', emoji: '🏠', glyph: 'home', words: [] },
  sub: { label: 'Abonelik', color: '#8e5cf7', emoji: '🔄', glyph: 'sub', words: [] },
  ai: { label: 'Yapay zekâ', color: '#10a37f', emoji: '🤖', glyph: 'sparkle', words: [] },
  tv: { label: 'Dizi, film', color: '#ff3b30', emoji: '📺', glyph: 'tv', words: [] },
  music: { label: 'Müzik', color: '#1db954', emoji: '🎵', glyph: 'music', words: [] },
  cloud: { label: 'Depolama', color: '#0a84ff', emoji: '☁️', glyph: 'cloud', words: [] },
  game: { label: 'Oyun', color: '#5e5ce6', emoji: '🎮', glyph: 'game', words: [] },
  shield: { label: 'Sigorta', color: '#30b0c7', emoji: '🛡️', glyph: 'shield', words: [] },
  gift: { label: 'Hediye', color: '#ff2d55', emoji: '🎁', glyph: 'gift', words: ['hediye'] },
};
const B = '(?<![\\p{L}])';
const compiled = Object.entries(CATS).filter(([, c]) => c.words.length).map(([key, c]) => [key, new RegExp(B + '(?:' + c.words.map(w => (w.startsWith('=') ? w.slice(1) + '(?![\\p{L}])' : w)).join('|') + ')', 'iu')]);
const SHOP_TAIL = /(?<![\p{L}])al(?![\p{L}])\s*$/u; // "ekmek al", "süt al"

export function detectCat(title = '') {
  const s = String(title).toLocaleLowerCase('tr');
  for (const [key, re] of compiled) if (re.test(s)) return key;
  if (SHOP_TAIL.test(s)) return 'shop';
  return '';
}
export const catOf = item => (item?.icon && CATS[item.icon] ? item.icon : item?.bill ? BILL_TYPES[item.bill.type]?.cat || 'pay' : detectCat(item?.title));
export const emojiOf = item => CATS[catOf(item)]?.emoji || (item?.time ? '⏰' : '•');
