function renderDashboard(data) {
  const { title, refreshSeconds, currentTime, currentDate, stopsData, captchaState } = data;
  const isCaptchaOpen = Boolean(captchaState && captchaState.required && captchaState.imageBase64);

  // Captcha doğrulama çubuğu (Sadece durak.iett.gov.tr oturumu ilk açıldığında veya süresi dolduğunda görünür)
  const captchaBannerHtml = isCaptchaOpen ? `
    <div class="captcha-banner">
      <div class="cap-left">
        <span class="cap-badge">🔒 İETT CANLI VERİ DOĞRULAMASI</span>
        <span class="cap-desc">Resmi <strong>durak.iett.gov.tr</strong> dakikalarını çekmek için görseldeki 6 haneli kodu girin:</span>
        ${captchaState.lastError ? `<span class="cap-err">⚠️ ${captchaState.lastError}</span>` : ''}
      </div>
      <form class="cap-form" method="GET" action="/api/verify-captcha">
        <img class="cap-img" src="data:image/jpeg;base64,${captchaState.imageBase64}" alt="Doğrulama Kodu" />
        <input class="cap-input" type="text" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Kodu girin" autocomplete="off" autofocus required />
        <button class="cap-btn" type="submit">DOĞRULA</button>
        <a class="cap-refresh" href="/api/refresh-captcha" title="Yeni Kod Al">🔄</a>
      </form>
    </div>
  ` : '';

  const cardsHtml = stopsData.map(item => {
    const {
      durak,
      baglantiDurumu,
      otobusler,
      digerHatlar,
      siradakiKalkislar
    } = item;

    const hasLiveBus = otobusler && otobusler.length > 0;
    let statusBadgeClass = "badge-standby";
    let statusText = "● AKTİF ARAÇ YOK";

    if (baglantiDurumu === "dogrulama-gerekli") {
      statusBadgeClass = "badge-warn";
      statusText = "🔒 DOĞRULAMA BEKLENİYOR";
    } else if (hasLiveBus) {
      statusBadgeClass = "badge-live";
      statusText = "● RESMİ CANLI VERİ";
    } else if (baglantiDurumu === "resmi-canli") {
      statusBadgeClass = "badge-standby";
      statusText = "● YAKLAŞAN ARAÇ YOK";
    }

    let busListHtml = "";

    if (!hasLiveBus) {
      const msg = baglantiDurumu === "dogrulama-gerekli"
        ? "Canlı varış sürelerini görmek için üstteki doğrulama kodunu girin."
        : `Şu an <strong>${durak.hatKodu}</strong> hattında bu durağa yaklaşan araç bulunmuyor.`;

      busListHtml = `
        <div class="empty-state">
          <div class="empty-title">${msg}</div>
        </div>
      `;
    } else {
      const firstBus = otobusler[0];
      const otherBuses = otobusler.slice(1);
      const isAtStop = firstBus.kalanDakika === 0;

      const locationLine = firstBus.bulunduguDurak
        ? `<div class="detail-location">📍 Durak: <strong>${firstBus.bulunduguDurak}</strong> ${firstBus.kalanDurak != null ? `(${firstBus.kalanDurak} durak kaldı)` : ''}</div>`
        : `<div class="detail-location">🛣️ Güzergâh: <strong>${firstBus.hedefYon}</strong></div>`;

      const featuresLine = firstBus.ozellikler && firstBus.ozellikler.length > 0
        ? `<span class="feat-tags">${firstBus.ozellikler.join(' • ')}</span>`
        : '';

      busListHtml = `
        <div class="primary-bus ${isAtStop ? 'bus-imminent' : ''}">
          <div class="arrival-box ${isAtStop ? 'box-imminent' : ''}">
            <span class="arrival-val">${isAtStop ? 'ŞİMDİ' : firstBus.kalanDakika}</span>
            <span class="arrival-unit">${isAtStop ? 'DURAKTA' : 'dakika'}</span>
          </div>
          <div class="arrival-detail">
            <div class="detail-line">
              🚍 Kapı No: <strong>${firstBus.kapiNo}</strong> ${featuresLine}
            </div>
            ${locationLine}
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
                  <strong>${b.kalanDakika} dk</strong> (Kapı: ${b.kapiNo}${b.kalanDurak != null ? `, ${b.kalanDurak} durak` : ''})
                </span>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    // Aynı durağa yaklaşan diğer hatlar (varsa)
    let otherLinesHtml = "";
    if (digerHatlar && digerHatlar.length > 0) {
      otherLinesHtml = `
        <div class="other-lines-bar">
          <span class="other-label">Durağa Gelen Diğer Hatlar:</span>
          <div class="other-pills">
            ${digerHatlar.map(o => `
              <span class="other-pill"><b>${o.hatKodu}</b>: ${o.kalanDakika} dk</span>
            `).join('')}
          </div>
        </div>
      `;
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
          ${otherLinesHtml}
        </div>

        ${scheduleHtml}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  ${!isCaptchaOpen ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : ''}
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
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
    }
    .logo-area {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo-icon {
      font-size: 20px;
    }
    .logo-text {
      font-size: 18px;
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
    .clock-area {
      text-align: right;
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .clock-time {
      font-size: 24px;
      font-weight: 800;
      color: #f8fafc;
      font-variant-numeric: tabular-nums;
      letter-spacing: 1px;
    }
    .clock-date {
      font-size: 12px;
      color: #94a3b8;
    }
    .captcha-banner {
      background: #1e1b4b;
      border-bottom: 2px solid #4f46e5;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
    }
    .cap-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cap-badge {
      font-size: 11px;
      font-weight: 800;
      color: #fbbf24;
      letter-spacing: 0.5px;
    }
    .cap-desc {
      font-size: 12px;
      color: #e0e7ff;
    }
    .cap-err {
      font-size: 11px;
      color: #f87171;
      font-weight: 700;
    }
    .cap-form {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cap-img {
      height: 38px;
      border-radius: 6px;
      border: 2px solid #fff;
      background: #fff;
    }
    .cap-input {
      width: 115px;
      height: 38px;
      border-radius: 6px;
      border: 1px solid #6366f1;
      background: #0f172a;
      color: #fff;
      font-size: 16px;
      font-weight: 800;
      text-align: center;
      letter-spacing: 2px;
      outline: none;
    }
    .cap-btn {
      height: 38px;
      padding: 0 14px;
      border-radius: 6px;
      border: none;
      background: #10b981;
      color: #052e16;
      font-size: 12px;
      font-weight: 900;
      cursor: pointer;
    }
    .cap-refresh {
      height: 38px;
      width: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #312e81;
      border-radius: 6px;
      text-decoration: none;
      font-size: 15px;
    }
    main {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
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
      padding: 11px 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      overflow: hidden;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 7px;
      padding-bottom: 7px;
      border-bottom: 1px solid #1f2937;
    }
    .stop-name {
      font-size: 16px;
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
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      white-space: nowrap;
    }
    .badge-live {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid #059669;
    }
    .badge-warn {
      background: rgba(245, 158, 11, 0.18);
      color: #fbbf24;
      border: 1px solid #d97706;
    }
    .badge-standby {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
      border: 1px solid #334155;
    }
    .line-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #1f2937;
      padding: 6px 10px;
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .line-badge {
      background: #f59e0b;
      color: #000;
      font-size: 20px;
      font-weight: 900;
      padding: 2px 10px;
      border-radius: 6px;
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
      color: #f3f4f6;
    }
    .line-desc {
      font-size: 11px;
      color: #9ca3af;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 6px;
    }
    .primary-bus {
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid #334155;
      padding: 9px 12px;
      border-radius: 10px;
    }
    .bus-imminent {
      border-color: #10b981;
      background: rgba(6, 78, 59, 0.25);
    }
    .arrival-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0284c7;
      color: #fff;
      padding: 6px 12px;
      border-radius: 8px;
      min-width: 82px;
    }
    .box-imminent {
      background: #059669;
    }
    .arrival-val {
      font-size: 32px;
      font-weight: 900;
      line-height: 1;
    }
    .arrival-unit {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-top: 2px;
    }
    .arrival-detail {
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
    }
    .detail-line {
      font-size: 14px;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .detail-line strong {
      color: #38bdf8;
    }
    .feat-tags {
      font-size: 11px;
      color: #94a3b8;
      background: #1e293b;
      padding: 1px 6px;
      border-radius: 4px;
    }
    .detail-location {
      font-size: 12px;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .detail-location strong {
      color: #fbbf24;
    }
    .secondary-buses {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      flex-wrap: wrap;
    }
    .sec-label {
      color: #64748b;
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
    }
    .sec-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .sec-pill {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 11px;
    }
    .sec-pill strong {
      color: #38bdf8;
    }
    .other-lines-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      padding-top: 4px;
    }
    .other-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
    }
    .other-pills {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }
    .other-pill {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid #1e293b;
      color: #94a3b8;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
    }
    .other-pill b {
      color: #e2e8f0;
    }
    .empty-state {
      text-align: center;
      padding: 12px 10px;
      background: rgba(15, 23, 42, 0.5);
      border: 1px dashed #334155;
      border-radius: 10px;
    }
    .empty-title {
      font-size: 13px;
      color: #94a3b8;
    }
    .empty-title strong {
      color: #f8fafc;
    }
    .schedule-bar {
      margin-top: 8px;
      padding-top: 7px;
      border-top: 1px solid #1f2937;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      gap: 6px;
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
      height: 28px;
      background: #0b1120;
      border-top: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      font-size: 11px;
      color: #64748b;
      flex-shrink: 0;
    }
    .footer-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pulse-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
    }
    .btn-fs {
      background: #1e293b;
      border: 1px solid #334155;
      color: #94a3b8;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo-area">
      <span class="logo-icon">🚍</span>
      <span class="logo-text">DurakPano</span>
      <span class="logo-sub">Resmi durak.iett.gov.tr Canlı Verisi</span>
    </div>
    <div class="clock-area">
      <span class="clock-date">${currentDate}</span>
      <span class="clock-time" id="clock">${currentTime}</span>
    </div>
  </header>

  ${captchaBannerHtml}

  <main>
    ${cardsHtml}
  </main>

  <footer>
    <div class="footer-left">
      <span class="pulse-dot"></span>
      <span>Her ${refreshSeconds} saniyede otomatik yenilenir • Son Güncelleme: ${currentTime}</span>
    </div>
    <div>
      <button class="btn-fs" onclick="toggleFullScreen()">Tam Ekran ⛶</button>
    </div>
  </footer>

  <script>
    function toggleFullScreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    }

    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').catch(() => {});
    }

    setInterval(function() {
      var d = new Date();
      var h = String(d.getHours()).padStart(2, '0');
      var m = String(d.getMinutes()).padStart(2, '0');
      var el = document.getElementById('clock');
      if (el) el.innerText = h + ':' + m;
    }, 1000);
  </script>
</body>
</html>`;
}

module.exports = {
  renderDashboard
};
