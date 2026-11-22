// Ana ekrana ekleme sayfası. /api/ altında: Safari'de kalmış eski service worker bu yola karışmaz,
// iOS da açılış görselini eski önbellekteki sayfadan değil buradan kopyalar. Simge "/" adresini açar (manifest).
const SIZES = [[375, 667, '750x1334'], [320, 568, '640x1136']];

export function installPage({ dark = false } = {}) {
  const bg = dark ? '#0d0f14' : '#faf8ff', fg = dark ? '#eceef5' : '#131b2e', card = dark ? '#171a21' : '#ffffff', sub = dark ? '#b4b9c8' : '#3c4a42';
  const images = SIZES.map(([w, h, px]) => `<link rel="apple-touch-startup-image" href="/icons/splash-${dark ? 'koyu-' : ''}${px}.png" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)">`).join('\n');
  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="${bg}">
<meta name="color-scheme" content="${dark ? 'dark' : 'light'}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Gün Payı">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${images}
<title>Gün Payı</title>
<style>
  html, body { margin: 0; min-height: 100%; background: ${bg}; color: ${fg}; font: 500 16px/1.45 -apple-system, system-ui, sans-serif; }
  main { padding: 44px 24px 120px; max-width: 420px; margin: auto; }
  img { border-radius: 20px; }
  h1 { margin: 18px 0 6px; font-size: 28px; line-height: 1.15; }
  p { margin: 0 0 18px; color: ${sub}; }
  ol { margin: 0; padding: 0; list-style: none; counter-reset: n; }
  li { counter-increment: n; display: flex; gap: 12px; margin-bottom: 8px; padding: 14px; border-radius: 16px; background: ${card}; }
  li::before { content: counter(n); flex: none; font-weight: 800; color: #10b981; }
</style>
</head>
<body>
<main>
<img src="/icons/apple-touch-icon.png" width="72" height="72" alt="">
<h1>Gün Payı’yı ana ekrana ekle</h1>
<p>Verilerin kopyalandı. Bitene kadar başka bir şey kopyalama.</p>
<ol>
<li><span>Safari’de <b>Paylaş</b> düğmesine dokun (kare içinde yukarı ok).</span></li>
<li><span><b>Ana Ekrana Ekle</b>, sonra <b>Ekle</b>.</span></li>
<li><span>Yeni simgeyi aç, <b>Eski simgeden taşı</b>’ya dokun.</span></li>
<li><span>Planların gelince eski simgeyi sil. Açınca <b>Bu, eski simge</b> yazan eskisidir.</span></li>
</ol>
</main>
</body>
</html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
