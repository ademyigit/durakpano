const http = require('http');
const { URL } = require('url');
const config = require('./config');
const { getDurakVarisBilgisi } = require('./services/iettService');
const { renderDashboard } = require('./views/dashboard');

const PORT = process.env.PORT || 3000;

// Tarih ve Saat biçimlendirici (İstanbul UTC+3)
function getFormattedDateTime() {
  const now = new Date();
  const istanbulTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));

  const hours = String(istanbulTime.getHours()).padStart(2, '0');
  const minutes = String(istanbulTime.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  const months = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
  ];
  const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

  const dayName = days[istanbulTime.getDay()];
  const monthName = months[istanbulTime.getMonth()];
  const dayNum = istanbulTime.getDate();
  const currentDate = `${dayNum} ${monthName} ${dayName}`;

  return { currentTime, currentDate };
}

// Ana HTTP Sunucusu (Sıfır harici paket, Node.js yerleşik)
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Ana Dashboard Arayüzü
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const stopsData = await Promise.all(
        config.stops.map(stop => getDurakVarisBilgisi(stop))
      );

      const { currentTime, currentDate } = getFormattedDateTime();

      const html = renderDashboard({
        title: config.siteTitle,
        refreshSeconds: config.refreshIntervalSeconds,
        currentTime,
        currentDate,
        stopsData
      });

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(html);
    } catch (error) {
      console.error('Hata:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('DurakPano yüklenirken hata oluştu.');
    }
    return;
  }

  // 2. JSON API Endpoint (Home Assistant / Geliştiriciler)
  if (pathname === '/api/status') {
    try {
      const stopsData = await Promise.all(
        config.stops.map(stop => getDurakVarisBilgisi(stop))
      );
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        stops: stopsData
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 3. Sağlık Kontrolü (Render/Docker)
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Sayfa bulunamadı');
});

// Yerel sunucu başlatma
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚍 DurakPano Servisi Başlatıldı!`);
    console.log(`📡 Yerel Adres: http://localhost:${PORT}`);
    console.log(`📱 Ağdaki Cihazlar İçin Adres: http://YEREL_IP_ADRESINIZ:${PORT}`);
    console.log(`🚏 Takip: 205671 (Hat 19) & 213801 (Hat 14TM)`);
    console.log(`======================================================\n`);
  });
}

// Vercel serverless export
module.exports = server;
