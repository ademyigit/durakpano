function renderCameraPage(data) {
  const { isAuthenticated, error, pin } = data;

  if (!isAuthenticated) {
    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Güvenli Ev Kamerası - DurakPano</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #080c14;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .login-box {
      background: #111827;
      border: 1px solid #1f293d;
      border-radius: 16px;
      padding: 32px 24px;
      width: 100%;
      max-width: 360px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .cam-icon {
      font-size: 44px;
      margin-bottom: 12px;
      display: inline-block;
    }
    h1 {
      font-size: 20px;
      font-weight: 800;
      color: #38bdf8;
      margin-bottom: 6px;
    }
    p {
      font-size: 13px;
      color: #94a3b8;
      margin-bottom: 24px;
    }
    .error-msg {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #f87171;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    input[type="password"], input[type="text"] {
      width: 100%;
      height: 48px;
      background: #0f172a;
      border: 2px solid #334155;
      border-radius: 10px;
      color: #fff;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 8px;
      text-align: center;
      outline: none;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: #38bdf8;
    }
    button {
      width: 100%;
      height: 46px;
      background: #0284c7;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: #0369a1;
    }
    .back-link {
      display: inline-block;
      margin-top: 20px;
      font-size: 12px;
      color: #64748b;
      text-decoration: none;
    }
    .back-link:hover { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="login-box">
    <span class="cam-icon">🔒</span>
    <h1>Ev Kamerası Girişi</h1>
    <p>Evin içini uzaktan canlı izlemek için PIN kodunu girin:</p>

    ${error ? `<div class="error-msg">${error}</div>` : ''}

    <form method="GET" action="/camera">
      <input type="password" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="••••" autofocus required autocomplete="off">
      <button type="submit">GİRİŞ YAP</button>
    </form>

    <a href="/" class="back-link">← DurakPano Ana Ekrana Dön</a>
  </div>
</body>
</html>`;
  }

  // Kimlik Doğrulanmış Canlı İzleme Sayfası
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Canlı Ev Kamerası - DurakPano</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #000;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
      z-index: 10;
    }
    .left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .rec-dot {
      width: 12px;
      height: 12px;
      background: #ef4444;
      border-radius: 50%;
      box-shadow: 0 0 10px #ef4444;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .sub {
      font-size: 11px;
      color: #94a3b8;
    }
    .exit-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 12px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
    }
    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      background: #080c14;
    }
    .stream-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      background: #000;
    }
    .waiting-box {
      position: absolute;
      text-align: center;
      padding: 24px;
      background: rgba(17, 24, 39, 0.85);
      border: 1px solid #334155;
      border-radius: 12px;
      max-width: 320px;
      display: none;
    }
    .waiting-box.show { display: block; }
    .status-bar {
      height: 32px;
      background: #0f172a;
      border-top: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      font-size: 11px;
      color: #64748b;
      flex-shrink: 0;
    }
    #fpsCounter { color: #38bdf8; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <div class="left">
      <div class="rec-dot"></div>
      <div>
        <div class="title">CANLI EV KAMERASI</div>
        <div class="sub">DurakPano Güvenlik Akışı</div>
      </div>
    </div>
    <a href="/" class="exit-btn">Panoya Dön</a>
  </header>

  <main>
    <img id="camStream" class="stream-img" src="/api/camera/stream?pin=${encodeURIComponent(pin)}" alt="Canlı Akış" onerror="onStreamError()">

    <div id="waitingNotice" class="waiting-box">
      <div style="font-size: 32px; margin-bottom: 8px;">📷</div>
      <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">Tablet Kamerası Bekleniyor</div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">
        Evdeki tablette kamera butonu kapalı olabilir. Tabletten <strong>Ev Kamerası</strong> butonuna basıldığında görüntü anında gelecektir.
      </div>
    </div>
  </main>

  <div class="status-bar">
    <span>Durum: <strong id="streamStatus" style="color: #34d399;">Bağlı (Canlı)</strong></span>
    <span>Akış: <span id="fpsCounter">1-2 FPS</span></span>
  </div>

  <script>
    const streamImg = document.getElementById('camStream');
    const waitingNotice = document.getElementById('waitingNotice');
    const statusText = document.getElementById('streamStatus');
    const pin = "${encodeURIComponent(pin)}";

    // Eğer MJPEG bağlantısı koparsa snapshot polling fallback'ine geç
    function onStreamError() {
      waitingNotice.classList.add('show');
      statusText.textContent = 'Yayın Bekleniyor...';
      statusText.style.color = '#f59e0b';
      setTimeout(tryPollSnapshot, 2000);
    }

    function tryPollSnapshot() {
      const testImg = new Image();
      testImg.onload = function() {
        waitingNotice.classList.remove('show');
        statusText.textContent = 'Bağlı (Snapshot)';
        statusText.style.color = '#34d399';
        streamImg.src = testImg.src;
        setTimeout(tryPollSnapshot, 1000);
      };
      testImg.onerror = function() {
        setTimeout(tryPollSnapshot, 2500);
      };
      testImg.src = '/api/camera/frame?pin=' + pin + '&t=' + Date.now();
    }
  </script>
</body>
</html>`;
}

module.exports = {
  renderCameraPage
};
