const http = require('http');
const { URL } = require('url');
const config = require('./config');
const {
  getDurakVarisBilgisi,
  getCaptchaState,
  generateDurakCaptcha,
  submitDurakCaptcha
} = require('./services/iettService');
const { renderDashboard } = require('./views/dashboard');

const PORT = process.env.PORT || 3000;

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

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. İETT Resmi Canlı Veri (durak.iett.gov.tr) Doğrulama Kodu Gönderimi
  if (pathname === '/api/verify-captcha') {
    const code = parsedUrl.searchParams.get('code') || '';
    await submitDurakCaptcha(code, config.stops[0].durakKodu);
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  // 2. Yeni Doğrulama Kodu İsteği
  if (pathname === '/api/refresh-captcha') {
    await generateDurakCaptcha(true);
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  // 3. Ana Dashboard Arayüzü
  if (pathname === '/' || pathname === '/index.html') {
    try {
      // Sıralı sorgula (Aynı anda çerez çakışmasını önlemek için)
      const stopsData = [];
      for (const stop of config.stops) {
        const info = await getDurakVarisBilgisi(stop);
        stopsData.push(info);
      }

      const { currentTime, currentDate } = getFormattedDateTime();
      const captchaState = getCaptchaState();

      const html = renderDashboard({
        title: config.siteTitle,
        refreshSeconds: config.refreshIntervalSeconds,
        currentTime,
        currentDate,
        stopsData,
        captchaState
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

  // 4. JSON API Endpoint
  if (pathname === '/api/status') {
    try {
      const stopsData = [];
      for (const stop of config.stops) {
        stopsData.push(await getDurakVarisBilgisi(stop));
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        captchaRequired: getCaptchaState().required,
        stops: stopsData
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 5. Sağlık Kontrolü
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Sayfa bulunamadı');
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚍 DurakPano Servisi Başlatıldı! (Resmi durak.iett.gov.tr Entegrasyonu)`);
    console.log(`📡 Yerel Adres: http://localhost:${PORT}`);
    console.log(`🚏 Takip: 205671 (Hat 19) & 213801 (Hat 14TM)`);
    console.log(`======================================================\n`);
  });
}

module.exports = server;
