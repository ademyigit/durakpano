const http = require('http');
const { URL } = require('url');
const config = require('./config');
const { getDurakVarisBilgisi, startBackgroundPoller } = require('./services/iettService');
const { getAtasehirWeather } = require('./services/weatherService');
const {
  updateFrame,
  setCameraActive,
  getCameraStatus,
  getLastFrame,
  validatePin,
  addSubscriber
} = require('./services/cameraService');
const { renderDashboard } = require('./views/dashboard');
const { renderCameraPage } = require('./views/cameraView');

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

  // 1. Ana Dashboard Arayüzü
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const [stopsData, weather] = await Promise.all([
        Promise.all(config.stops.map(s => getDurakVarisBilgisi(s))),
        getAtasehirWeather()
      ]);

      const { currentTime, currentDate } = getFormattedDateTime();
      const cameraStatus = getCameraStatus();

      const html = renderDashboard({
        title: config.siteTitle,
        refreshSeconds: config.refreshIntervalSeconds,
        currentTime,
        currentDate,
        stopsData,
        weather,
        cameraStatus
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

  // 2. Uzaktan Ev Kamerası İzleme Web Sayfası (/camera)
  if (pathname === '/camera') {
    const pin = parsedUrl.searchParams.get('pin') || '';
    const isAuthenticated = validatePin(pin);
    const error = pin && !isAuthenticated ? 'Hatalı PIN kodu girdiniz!' : null;

    const html = renderCameraPage({
      isAuthenticated,
      error,
      pin: isAuthenticated ? pin : ''
    });

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(html);
    return;
  }

  // 3. Tabletten Kamera Karesi Yükleme (POST /api/camera/upload)
  if (pathname === '/api/camera/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(buffer.toString('utf-8'));
          if (json.data && json.data.startsWith('data:image/')) {
            const base64Data = json.data.split(',')[1];
            updateFrame(Buffer.from(base64Data, 'base64'), 'image/jpeg');
          }
        } catch (e) {}
      } else {
        updateFrame(buffer, 'image/jpeg');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // 4. Tablet Kamera Durdurma Bildirimi (POST /api/camera/stop)
  if (pathname === '/api/camera/stop' && req.method === 'POST') {
    setCameraActive(false);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 5. Uzaktan Canlı MJPEG Akışı (GET /api/camera/stream)
  if (pathname === '/api/camera/stream') {
    const pin = parsedUrl.searchParams.get('pin');
    if (!validatePin(pin)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Geçersiz veya eksik PIN');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'close',
      'Pragma': 'no-cache'
    });

    addSubscriber(res);

    // Eğer zaten hazır bir son kare varsa hemen gönder
    const last = getLastFrame();
    if (last.buffer) {
      try {
        res.write('--myboundary\r\nContent-Type: image/jpeg\r\nContent-Length: ' + last.buffer.length + '\r\n\r\n');
        res.write(last.buffer);
        res.write('\r\n');
      } catch (e) {}
    }
    return;
  }

  // 6. Tekil JPEG Kare Alma (GET /api/camera/frame)
  if (pathname === '/api/camera/frame') {
    const pin = parsedUrl.searchParams.get('pin');
    if (!validatePin(pin)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Geçersiz PIN');
      return;
    }

    const last = getLastFrame();
    if (!last.buffer) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Henüz kamera karesi yok');
      return;
    }

    res.writeHead(200, {
      'Content-Type': last.mimeType || 'image/jpeg',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Length': last.buffer.length
    });
    res.end(last.buffer);
    return;
  }

  // 7. Kamera Durum API'si (GET /api/camera/status)
  if (pathname === '/api/camera/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(getCameraStatus()));
    return;
  }

  // 8. Hava Durumu API'si (GET /api/weather)
  if (pathname === '/api/weather') {
    try {
      const weather = await getAtasehirWeather();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: true, weather }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 9. Genel JSON Durum API Endpoint'i (GET /api/status)
  if (pathname === '/api/status') {
    try {
      const [stopsData, weather] = await Promise.all([
        Promise.all(config.stops.map(s => getDurakVarisBilgisi(s))),
        getAtasehirWeather()
      ]);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        weather,
        camera: getCameraStatus(),
        stops: stopsData
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 10. Sağlık Kontrolü
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Sayfa bulunamadı');
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startBackgroundPoller();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚍 DurakPano Canlı Ulaşım & Ev Ekranı Başlatıldı!`);
    console.log(`📡 Yerel Adres: http://localhost:${PORT}`);
    console.log(`🌤️ Hava Durumu: Ataşehir (Open-Meteo)`);
    console.log(`📷 Ev Kamerası İzleme: http://localhost:${PORT}/camera (PIN: ${config.camera.pin})`);
    console.log(`🚏 Takip: 205671 (Hat 19) & 213801 (Hat 14TM)`);
    console.log(`======================================================\n`);
  });
}

module.exports = server;
