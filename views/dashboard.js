function renderDashboard(data) {
  const {
    title,
    refreshSeconds,
    currentTime,
    currentDate,
    stopsData,
    weather,
    cameraStatus
  } = data;

  const isCamActive = Boolean(cameraStatus && cameraStatus.active);

  const cardsHtml = stopsData.map(item => {
    const {
      durak,
      otobusler,
      ilkDuraktaBekleyenAraclar,
      ilkDuraktaBekleyenSayisi,
      siradakiKalkislar
    } = item;

    const hasLiveBus = otobusler && otobusler.length > 0;
    let statusBadgeClass = "badge-standby";
    let statusText = "● SEFER BEKLENİYOR";

    const formatWaitingBus = (w) => (typeof w === 'object' && w && w.kapiNo)
      ? `${w.kapiNo} (${w.sonDurak || 'İlk Durak'})`
      : String(w);

    const waitingBusesStr = (ilkDuraktaBekleyenAraclar || []).map(formatWaitingBus).join(', ');

    if (hasLiveBus) {
      statusBadgeClass = "badge-live";
      statusText = "● CANLI GPS AKTİF";
    } else if (ilkDuraktaBekleyenSayisi > 0) {
      statusBadgeClass = "badge-ready";
      statusText = `● İLK DURAKTA HAZIR (${waitingBusesStr})`;
    }

    let busListHtml = "";

    if (!hasLiveBus) {
      const nextTime = siradakiKalkislar && siradakiKalkislar.length > 0 ? siradakiKalkislar[0] : null;
      const waitingInfo = ilkDuraktaBekleyenSayisi > 0
        ? `<div class="empty-sub">🚍 <strong>${waitingBusesStr}</strong> araç şu an <strong>${durak.ilkDurakAdi}</strong> ilk durağında kalkış için bekliyor.${nextTime ? ` (Kalkış: <strong>${nextTime}</strong>)` : ''}</div>`
        : (nextTime
          ? `<div class="empty-sub">İlk duraktan (<strong>${durak.ilkDurakAdi}</strong>) sıradaki planlı kalkış saati: <strong>${nextTime}</strong></div>`
          : `<div class="empty-sub">Bugün için bu yönde planlı başka sefer bulunmuyor.</div>`);

      busListHtml = `
        <div class="empty-state">
          <div class="empty-title">Şu an <strong>${durak.hatKodu}</strong> hattında durağa yaklaşan aktif araç yok</div>
          ${waitingInfo}
        </div>
      `;
    } else {
      const firstBus = otobusler[0];
      const otherBuses = otobusler.slice(1);
      const isAtStop = firstBus.kalanDakika === 0;
      const sonDurakHtml = firstBus.sonDurak
        ? `<span class="dest-badge">➔ ${firstBus.sonDurak}</span>`
        : '';

      busListHtml = `
        <div class="primary-bus ${isAtStop ? 'bus-imminent' : ''}">
          <div class="arrival-box ${isAtStop ? 'box-imminent' : ''}">
            <span class="arrival-val">${isAtStop ? 'ŞİMDİ' : firstBus.kalanDakika}</span>
            <span class="arrival-unit">${isAtStop ? 'DURAKTA' : 'dakika'}</span>
          </div>
          <div class="arrival-detail">
            <div class="detail-line">
              🚍 Kapı: <strong>${firstBus.kapiNo}</strong> ${sonDurakHtml} • <strong>${firstBus.kalanDurak} durak kaldı</strong> (${firstBus.mesafeKm} km)
            </div>
            <div class="detail-location">
              📍 Konum: <strong>${firstBus.bulunduguDurak}</strong>
            </div>
          </div>
        </div>
      `;

      if (otherBuses.length > 0) {
        busListHtml += `
          <div class="secondary-buses">
            <span class="sec-label">Sonraki ${durak.hatKodu}:</span>
            <div class="sec-pills">
              ${otherBuses.map(b => `
                <span class="sec-pill">
                  <strong>${b.kalanDakika} dk</strong> (${b.kapiNo}${b.sonDurak ? ` ➔ ${b.sonDurak}` : ''} • ${b.bulunduguDurak}, ${b.kalanDurak} durak)
                </span>
              `).join('')}
            </div>
          </div>
        `;
      } else if (ilkDuraktaBekleyenSayisi > 0) {
        const nextDep = siradakiKalkislar && siradakiKalkislar.length > 0 ? `${siradakiKalkislar[0]} kalkışlı` : 'kalkış bekliyor';
        busListHtml += `
          <div class="secondary-buses">
            <span class="sec-label">İlk Durakta Hazır:</span>
            <div class="sec-pills">
              <span class="sec-pill">
                <strong>${waitingBusesStr}</strong> (${durak.ilkDurakAdi} • ${nextDep})
              </span>
            </div>
          </div>
        `;
      }
    }

    // İlk duraktan planlı kalkış saatleri satırı
    let scheduleHtml = "";
    if (siradakiKalkislar && siradakiKalkislar.length > 0) {
      scheduleHtml = `
        <div class="schedule-bar">
          <span class="sched-label">🕒 İlk Durak (${durak.ilkDurakAdi}) Kalkış:</span>
          <div class="sched-times">
            ${siradakiKalkislar.map((t, i) => `
              <span class="sched-time ${i === 0 ? 'sched-next' : ''}">${t}</span>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      scheduleHtml = `
        <div class="schedule-bar">
          <span class="sched-label">🕒 Bugün için planlı başka sefer kalmadı</span>
        </div>
      `;
    }

    return `
      <div class="card">
        <div class="card-header">
          <div class="stop-info">
            <div class="stop-name">🚏 ${durak.durakAdi}</div>
            <div class="stop-code">Durak Kodu: ${durak.durakKodu} ${durak.siraNo ? `• ${durak.siraNo}. Durak` : ''} • ${durak.ilce}</div>
          </div>
          <span class="status-badge ${statusBadgeClass}">
            ${statusText}
          </span>
        </div>

        <div class="line-banner">
          <span class="line-badge">${durak.hatKodu}</span>
          <div class="line-dest">
            <span class="line-target">${durak.hedefYon}</span>
            <span class="line-desc">${durak.hatAdi}</span>
          </div>
        </div>

        <div class="card-body">
          ${busListHtml}
        </div>

        ${scheduleHtml}
      </div>
    `;
  }).join('');

  // Hava Durumu HTML Bloğu
  const weatherHtml = weather ? `
    <div class="weather-widget">
      <div class="weather-main">
        <span class="weather-icon">${weather.icon || '☀️'}</span>
        <span class="weather-temp">${weather.temp}°C</span>
        <span class="weather-condition">${weather.condition}</span>
        <span class="weather-feels">(Hissedilen: ${weather.feelsLike}°C)</span>
      </div>
      <div class="weather-summary">
        📍 <strong>${weather.location}</strong> • ${weather.summary}
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="refresh" content="${refreshSeconds}">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    body {
      background-color: #080c14;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
    }
    header {
      background: #0f172a;
      border-bottom: 2px solid #1e293b;
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 18px;
      flex-shrink: 0;
      gap: 16px;
    }
    .logo-area {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .logo-icon {
      font-size: 22px;
    }
    .logo-text {
      font-size: 19px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #38bdf8;
    }
    .logo-sub {
      font-size: 11px;
      color: #64748b;
      margin-left: 4px;
      text-transform: uppercase;
    }
    .weather-widget {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #172033;
      border: 1px solid #1e293b;
      border-radius: 9px;
      padding: 4px 12px;
      min-width: 0;
    }
    .weather-main {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      white-space: nowrap;
    }
    .weather-icon {
      font-size: 16px;
    }
    .weather-temp {
      font-size: 15px;
      font-weight: 900;
      color: #fbbf24;
    }
    .weather-feels {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
    }
    .weather-summary {
      font-size: 11px;
      color: #93c5fd;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .cam-btn {
      height: 38px;
      padding: 0 12px;
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .cam-btn.active {
      background: rgba(239, 68, 68, 0.2);
      border-color: #ef4444;
      color: #fca5a5;
    }
    .cam-btn-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #64748b;
    }
    .cam-btn.active .cam-btn-dot {
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .clock-area {
      text-align: right;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .clock-time {
      font-size: 26px;
      font-weight: 800;
      color: #f8fafc;
      font-variant-numeric: tabular-nums;
      letter-spacing: 1px;
    }
    .clock-date {
      font-size: 11px;
      color: #94a3b8;
    }
    main {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      padding: 10px 14px;
      background: #080c14;
      align-items: stretch;
      overflow: hidden;
    }
    .card {
      background: #111827;
      border: 1px solid #1f293d;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      padding: 12px 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      overflow: hidden;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #1f2937;
    }
    .stop-name {
      font-size: 17px;
      font-weight: 700;
      color: #f9fafb;
    }
    .stop-code {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 2px;
    }
    .status-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 999px;
      letter-spacing: 0.4px;
      white-space: nowrap;
    }
    .badge-live {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .badge-ready {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
    }
    .badge-standby {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }
    .line-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #1e293b;
      padding: 8px 11px;
      border-radius: 9px;
      margin-bottom: 10px;
    }
    .line-badge {
      background: #f59e0b;
      color: #090d16;
      font-size: 20px;
      font-weight: 900;
      padding: 4px 10px;
      border-radius: 7px;
      min-width: 58px;
      text-align: center;
      letter-spacing: 0.5px;
    }
    .line-dest {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .line-target {
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .line-desc {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
    }
    .primary-bus {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #0b1322;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .bus-imminent {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.45);
    }
    .arrival-box {
      background: #0284c7;
      color: #ffffff;
      border-radius: 9px;
      min-width: 78px;
      height: 68px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4px 8px;
      flex-shrink: 0;
    }
    .box-imminent {
      background: #059669;
    }
    .arrival-val {
      font-size: 28px;
      font-weight: 900;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .arrival-unit {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 3px;
      opacity: 0.9;
    }
    .arrival-detail {
      display: flex;
      flex-direction: column;
      gap: 5px;
      overflow: hidden;
    }
    .detail-line {
      font-size: 13px;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }
    .dest-badge {
      display: inline-flex;
      align-items: center;
      background: #f59e0b;
      color: #0b0f19;
      font-weight: 800;
      font-size: 11px;
      padding: 1px 7px;
      border-radius: 5px;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    .detail-location {
      font-size: 12px;
      color: #38bdf8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .secondary-buses {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #172033;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
    }
    .sec-label {
      color: #94a3b8;
      font-weight: 600;
      flex-shrink: 0;
      margin-right: 6px;
    }
    .sec-pills {
      display: flex;
      gap: 6px;
      overflow: hidden;
    }
    .sec-pill {
      background: #0f172a;
      color: #cbd5e1;
      padding: 3px 7px;
      border-radius: 6px;
      border: 1px solid #334155;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sec-pill strong {
      color: #38bdf8;
    }
    .empty-state {
      background: #0b1322;
      border: 1px dashed #334155;
      border-radius: 10px;
      padding: 14px 12px;
      text-align: center;
    }
    .empty-title {
      font-size: 13px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 5px;
    }
    .empty-sub {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.4;
    }
    .schedule-bar {
      margin-top: 8px;
      padding-top: 7px;
      border-top: 1px solid #1f2937;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
    }
    .sched-label {
      color: #94a3b8;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sched-times {
      display: flex;
      gap: 5px;
      flex-shrink: 0;
    }
    .sched-time {
      background: #1e293b;
      color: #cbd5e1;
      padding: 2px 6px;
      border-radius: 5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .sched-next {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    footer {
      height: 24px;
      background: #0b111e;
      border-top: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      font-size: 10px;
      color: #64748b;
      flex-shrink: 0;
    }
    .cam-preview-box {
      position: fixed;
      bottom: 30px;
      right: 18px;
      width: 170px;
      height: 125px;
      background: #000;
      border: 2px solid #ef4444;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.7);
      overflow: hidden;
      z-index: 1000;
      display: none;
    }
    .cam-preview-box.show {
      display: block;
    }
    .cam-preview-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
    }
    .cam-preview-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      background: rgba(239, 68, 68, 0.85);
      color: #fff;
      font-size: 9px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
    }
    @media (max-width: 650px) {
      body { overflow-y: auto; height: auto; }
      main { grid-template-columns: 1fr; }
      header { flex-wrap: wrap; height: auto; padding: 10px 14px; }
      .weather-widget { order: 3; width: 100%; margin-top: 6px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo-area">
      <span class="logo-icon">🚍</span>
      <div>
        <span class="logo-text">DURAKPANO</span>
        <span class="logo-sub">Canlı Ulaşım & Ev Ekranı</span>
      </div>
    </div>

    ${weatherHtml}

    <div class="header-right">
      <button id="camToggleBtn" class="cam-btn ${isCamActive ? 'active' : ''}" onclick="toggleCamera()">
        <span class="cam-btn-dot"></span>
        <span id="camBtnText">${isCamActive ? 'Kamera: CANLI' : '📷 Ev Kamerası'}</span>
      </button>

      <div class="clock-area">
        <span class="clock-date">${currentDate}</span>
        <span class="clock-time">${currentTime}</span>
      </div>
    </div>
  </header>

  <main>
    ${cardsHtml}
  </main>

  <div id="camPreviewBox" class="cam-preview-box ${isCamActive ? 'show' : ''}">
    <span class="cam-preview-badge">🔴 EVİ İZLEME AKTİF</span>
    <video id="camLocalVideo" class="cam-preview-video" autoplay playsinline muted></video>
    <canvas id="camCaptureCanvas" width="480" height="360" style="display: none;"></canvas>
  </div>

  <footer>
    <span>Otomatik Yenileme: ${refreshSeconds} sn • İBB Canlı Filo & Open-Meteo Ataşehir Servisi</span>
    <span>Dışarıdan İzle: <strong>/camera</strong> (PIN: 1923)</span>
  </footer>

  <script>
    let camStream = null;
    let captureInterval = null;
    const camBtn = document.getElementById('camToggleBtn');
    const camBtnText = document.getElementById('camBtnText');
    const camPreviewBox = document.getElementById('camPreviewBox');
    const camLocalVideo = document.getElementById('camLocalVideo');
    const camCanvas = document.getElementById('camCaptureCanvas');
    const ctx = camCanvas ? camCanvas.getContext('2d') : null;

    // Sayfa açıldığında localStorage'da aktif kamera tercihi varsa otomatik devam et
    window.addEventListener('DOMContentLoaded', () => {
      if (localStorage.getItem('durakpano_cam_enabled') === 'true') {
        startCameraStream();
      }
    });

    function toggleCamera() {
      if (camStream) {
        stopCameraStream();
      } else {
        startCameraStream();
      }
    }

    async function startCameraStream() {
      try {
        const constraints = {
          video: {
            width: { ideal: 480 },
            height: { ideal: 360 },
            facingMode: 'user'
          },
          audio: false
        };

        const getUserMedia = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
          ? (c) => navigator.mediaDevices.getUserMedia(c)
          : (c) => new Promise((resolve, reject) => {
              const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
              if (!legacy) return reject(new Error('Kamera desteklenmiyor'));
              legacy.call(navigator, c, resolve, reject);
            });

        camStream = await getUserMedia(constraints);
        camLocalVideo.srcObject = camStream;
        camLocalVideo.play();

        camBtn.classList.add('active');
        camBtnText.textContent = 'Kamera: CANLI';
        camPreviewBox.classList.add('show');
        localStorage.setItem('durakpano_cam_enabled', 'true');

        // Her 800 ms'de 1 kare yakalayıp sunucuya gönder
        if (captureInterval) clearInterval(captureInterval);
        captureInterval = setInterval(sendFrameToServer, 850);

        // İlk kareyi hemen gönder
        setTimeout(sendFrameToServer, 400);
      } catch (err) {
        console.error('Kamera başlatılamadı:', err);
        alert('Kamera açılamadı: ' + err.message + '\\nLütfen tarayıcınızdan kamera izni verin.');
        stopCameraStream();
      }
    }

    function stopCameraStream() {
      if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
      }
      if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
      }
      if (camLocalVideo) {
        camLocalVideo.srcObject = null;
      }

      camBtn.classList.remove('active');
      camBtnText.textContent = '📷 Ev Kamerası';
      camPreviewBox.classList.remove('show');
      localStorage.setItem('durakpano_cam_enabled', 'false');

      // Sunucuya kameranın kapatıldığını bildir
      try {
        fetch('/api/camera/stop', { method: 'POST' }).catch(() => {});
      } catch (e) {}
    }

    function sendFrameToServer() {
      if (!camStream || !camLocalVideo || !camCanvas || !ctx) return;
      if (camLocalVideo.readyState < 2) return;

      try {
        ctx.drawImage(camLocalVideo, 0, 0, camCanvas.width, camCanvas.height);
        if (camCanvas.toBlob) {
          camCanvas.toBlob((blob) => {
            if (!blob) return;
            fetch('/api/camera/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'image/jpeg' },
              body: blob
            }).catch(() => {});
          }, 'image/jpeg', 0.55);
        } else {
          // Eski WebView desteği
          const dataUrl = camCanvas.toDataURL('image/jpeg', 0.55);
          fetch('/api/camera/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataUrl })
          }).catch(() => {});
        }
      } catch (e) {
        // Frame yakalama hatasını yut
      }
    }
  </script>
</body>
</html>`;
}

module.exports = { renderDashboard };
