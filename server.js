const express = require('express');
const config = require('./config');
const { getDurakVarisBilgisi } = require('./services/iettService');
const { renderDashboard } = require('./views/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Statik dosyalar (varsa)
app.use(express.static('public'));

// Yardımcı tarih & saat biçimlendirici (Türkçe)
function getFormattedDateTime() {
  const now = new Date();
  // İstanbul yerel saati UTC+3
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

// Ana Dashboard Sayfası
app.get('/', async (req, res) => {
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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(html);
  } catch (error) {
    console.error('Dashboard oluşturulurken hata:', error);
    res.status(500).send('DurakPano yüklenirken geçici bir hata oluştu.');
  }
});

// JSON API Endpoint (Akıllı Ev veya Home Assistant için)
app.get('/api/status', async (req, res) => {
  try {
    const stopsData = await Promise.all(
      config.stops.map(stop => getDurakVarisBilgisi(stop))
    );
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      stops: stopsData
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sağlık Kontrolü (Render & Docker için)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Yerel sunucu başlatma
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚍 DurakPano Servisi Çalışıyor!`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🚏 Takip Edilen Duraklar: ${config.stops.map(s => s.durakKodu + ' (' + s.hatKodu + ')').join(', ')}`);
    console.log(`======================================================\n`);
  });
}

// Vercel serverless export
module.exports = app;
