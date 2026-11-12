function renderDashboard(data) {
  const { title, refreshSeconds, currentTime, currentDate, stopsData } = data;

  const cardsHtml = stopsData.map(item => {
    const {
      durak,
      baglantiDurumu,
      otobusler,
      ilkDuraktaBekleyenSayisi,
      siradakiKalkislar
    } = item;

    const hasLiveBus = otobusler && otobusler.length > 0;
    const statusBadgeClass = hasLiveBus ? "badge-live" : "badge-standby";
    const statusText = hasLiveBus
      ? "● YOLDA ARAÇ VAR"
      : (baglantiDurumu === "aktif" ? "● AKTİF SEFER YOK" : "⚠ BAĞLANTI HATASI");

    let busListHtml = "";

    if (!hasLiveBus) {
      const waitingInfo = ilkDuraktaBekleyenSayisi > 0
        ? `<div class="waiting-note">🚌 İlk durakta (${durak.ilkDurakAdi}) kalkış bekleyen <strong>${ilkDuraktaBekleyenSayisi} araç</strong> var.</div>`
        : "";

      busListHtml = `
        <div class="empty-state">
          <div class="empty-title">Şu an durağa yaklaşan aktif araç bulunmuyor</div>
          ${waitingInfo}
        </div>
      `;
    } else {
      const firstBus = otobusler[0];
      const otherBuses = otobusler.slice(1);
      const isAtStop = firstBus.kalanDurak === 0 || firstBus.kalanDakika === 0;

      busListHtml = `
        <div class="primary-bus ${isAtStop ? 'bus-imminent' : ''}">
          <div class="arrival-box ${isAtStop ? 'box-imminent' : ''}">
            <span class="arrival-val">${isAtStop ? 'ŞİMDİ' : firstBus.kalanDakika}</span>
            <span class="arrival-unit">${isAtStop ? 'DURAKTA' : 'dakika'}</span>
          </div>
          <div class="arrival-detail">
            <div class="detail-line">
              ${isAtStop
                ? '🟢 <strong>Araç şu an durakta!</strong>'
                : `🚏 <strong>${firstBus.kalanDurak} durak</strong> kaldı <span class="dist-tag">(~${firstBus.mesafeKm} km)</span>`
              }
            </div>
            <div class="detail-location">
              📍 Bulunduğu Durak: <strong>${firstBus.bulunduguDurak}</strong>
            </div>
            <div class="detail-sub">
              Kapı No: <strong>${firstBus.kapiNo}</strong> • Yön: ${firstBus.hedefYon}
            </div>
          </div>
        </div>
      `;

      if (otherBuses.length > 0) {
        busListHtml += `
          <div class="secondary-buses">
            <span class="sec-label">Arkadan Gelen:</span>
            <div class="sec-pills">
              ${otherBuses.map(b => `
                <span class="sec-pill">
                  <strong>~${b.kalanDakika} dk</strong> • ${b.kalanDurak} durak (${b.bulunduguDurak})
                </span>
              `).join('')}
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
          <span class="sched-label">🕒 İlk Durak Planlı Kalkış:</span>
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
      height: 52px;
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
      padding: 12px 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
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
      padding: 7px 10px;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    .line-badge {
      background: #f59e0b;
      color: #000;
      font-size: 21px;
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
    }
    .primary-bus {
      display: flex;
      align-items: center;
      gap: 14px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid #334155;
      padding: 10px 14px;
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
      padding: 8px 12px;
      border-radius: 8px;
      min-width: 84px;
    }
    .box-imminent {
      background: #059669;
    }
    .arrival-val {
      font-size: 34px;
      font-weight: 900;
      line-height: 1;
    }
    .arrival-unit {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-top: 3px;
    }
    .arrival-detail {
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: hidden;
    }
    .detail-line {
      font-size: 15px;
      color: #f8fafc;
    }
    .detail-line strong {
      color: #38bdf8;
    }
    .dist-tag {
      font-size: 12px;
      color: #94a3b8;
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
    .detail-sub {
      font-size: 11px;
      color: #94a3b8;
    }
    .secondary-buses {
      margin-top: 8px;
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
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
    }
    .sec-pill strong {
      color: #38bdf8;
    }
    .empty-state {
      text-align: center;
      padding: 14px 10px;
      background: rgba(15, 23, 42, 0.5);
      border: 1px dashed #334155;
      border-radius: 10px;
    }
    .empty-title {
      font-size: 14px;
      font-weight: 600;
      color: #94a3b8;
    }
    .waiting-note {
      margin-top: 6px;
      font-size: 12px;
      color: #cbd5e1;
    }
    .waiting-note strong {
      color: #fbbf24;
    }
    .schedule-bar {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #1f2937;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
    }
    .sched-label {
      color: #94a3b8;
      font-weight: 600;
    }
    .sched-times {
      display: flex;
      gap: 6px;
    }
    .sched-time {
      background: #1e293b;
      color: #cbd5e1;
      padding: 2px 7px;
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
      height: 30px;
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
      <span class="logo-sub">İETT Canlı Durak Takibi</span>
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
