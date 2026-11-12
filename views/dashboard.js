function renderDashboard(data) {
  const { title, refreshSeconds, currentTime, currentDate, stopsData } = data;

  const cardsHtml = stopsData.map(item => {
    const { durak, durum, durumMesaji, otobusler } = item;
    const isLive = durum === "canli";
    const statusBadgeClass = isLive ? "badge-live" : "badge-tarife";
    const statusIcon = isLive ? "●" : "⏱";

    let busListHtml = "";
    if (!otobusler || otobusler.length === 0) {
      busListHtml = `
        <div class="empty-state">
          <div class="empty-icon">🌙</div>
          <div class="empty-text">${durumMesaji || "Şu an aktif sefer bulunmuyor"}</div>
        </div>
      `;
    } else {
      const firstBus = otobusler[0];
      const otherBuses = otobusler.slice(1);

      busListHtml = `
        <div class="primary-bus">
          <div class="arrival-box">
            <span class="arrival-val">${firstBus.kalanDakika}</span>
            <span class="arrival-unit">dakika</span>
          </div>
          <div class="arrival-detail">
            <div class="detail-line">📍 <strong>${firstBus.kalanDurak} durak</strong> geride</div>
            <div class="detail-sub">Mesafe: ~${firstBus.mesafeKm} km ${firstBus.hiz ? `• Hız: ${firstBus.hiz} km/s` : ""}</div>
          </div>
        </div>
      `;

      if (otherBuses.length > 0) {
        busListHtml += `
          <div class="secondary-buses">
            <span class="sec-label">Sonraki Araçlar:</span>
            <div class="sec-pills">
              ${otherBuses.map(b => `
                <span class="sec-pill"><strong>+${b.kalanDakika} dk</strong> (${b.kalanDurak} durak)</span>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    return `
      <div class="card">
        <div class="card-header">
          <div class="stop-info">
            <div class="stop-name">🚏 ${durak.durakAdi}</div>
            <div class="stop-code">Durak: ${durak.durakKodu} • ${durak.ilce}</div>
          </div>
          <span class="status-badge ${statusBadgeClass}">
            ${statusIcon} ${isLive ? "CANLI GPS" : "TARİFE"}
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
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <!-- 30 Saniyede Bir Otomatik Tazeleyici (Eski tabletler için sıfır JS yükü) -->
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
      height: 54px;
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
    .clock-area {
      text-align: right;
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .clock-time {
      font-size: 26px;
      font-weight: 800;
      color: #f8fafc;
      font-variant-numeric: tabular-nums;
      letter-spacing: 1px;
    }
    .clock-date {
      font-size: 13px;
      color: #94a3b8;
    }
    main {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      padding: 12px 14px;
      background: #080c14;
      align-items: stretch;
    }
    .card {
      background: #111827;
      border: 1px solid #1f293d;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      padding: 14px 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #1f2937;
    }
    .stop-name {
      font-size: 18px;
      font-weight: 700;
      color: #f9fafb;
    }
    .stop-code {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 2px;
    }
    .status-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-live {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid #059669;
    }
    .badge-tarife {
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid #d97706;
    }
    .line-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #1f2937;
      padding: 8px 12px;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .line-badge {
      background: #f59e0b;
      color: #000;
      font-size: 22px;
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
      font-size: 14px;
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
    }
    .primary-bus {
      display: flex;
      align-items: center;
      gap: 16px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid #334155;
      padding: 12px 16px;
      border-radius: 10px;
    }
    .arrival-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #0284c7;
      color: #fff;
      padding: 6px 14px;
      border-radius: 8px;
      min-width: 90px;
    }
    .arrival-val {
      font-size: 38px;
      font-weight: 900;
      line-height: 1;
    }
    .arrival-unit {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 2px;
    }
    .arrival-detail {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .detail-line {
      font-size: 16px;
      color: #f8fafc;
    }
    .detail-line strong {
      color: #38bdf8;
    }
    .detail-sub {
      font-size: 12px;
      color: #94a3b8;
    }
    .secondary-buses {
      margin-top: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .sec-label {
      color: #64748b;
      font-size: 11px;
      text-transform: uppercase;
    }
    .sec-pills {
      display: flex;
      gap: 6px;
    }
    .sec-pill {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
    }
    .sec-pill strong {
      color: #38bdf8;
    }
    .empty-state {
      text-align: center;
      padding: 20px 10px;
      color: #94a3b8;
    }
    .empty-icon {
      font-size: 32px;
      margin-bottom: 6px;
    }
    .empty-text {
      font-size: 14px;
    }
    footer {
      height: 32px;
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
      <span class="logo-sub">Canlı Transit Ekranı</span>
    </div>
    <div class="clock-area">
      <span class="clock-date">${currentDate}</span>
      <span class="clock-time" id="clock">${currentTime}</span>
    </div>
  </header>

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
    // Tam ekran geçiş fonksiyonu (Kiosk modu için)
    function toggleFullScreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    }

    // Ekranın uyumasını engelleyen modern WakeLock API (Destekleyen tarayıcılarda)
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').catch(() => {});
    }

    // İstemci tarafı saniye akışı
    setInterval(function() {
      var d = new Date();
      var h = String(d.getHours()).padStart(2, '0');
      var m = String(d.getMinutes()).padStart(2, '0');
      var s = String(d.getSeconds()).padStart(2, '0');
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
