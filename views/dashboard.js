function renderDashboard(data) {
  const { title, refreshSeconds, currentTime, currentDate, stopsData } = data;

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
      padding: 0 18px;
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
      font-size: 12px;
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
    @media (max-width: 650px) {
      body { overflow-y: auto; height: auto; }
      main { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo-area">
      <span class="logo-icon">🚍</span>
      <span class="logo-text">DURAKPANO</span>
      <span class="logo-sub">Canlı İETT Durak Ekranı</span>
    </div>
    <div class="clock-area">
      <span class="clock-date">${currentDate}</span>
      <span class="clock-time">${currentTime}</span>
    </div>
  </header>

  <main>
    ${cardsHtml}
  </main>

  <footer>
    <span>Otomatik Yenileme: ${refreshSeconds} sn • Doğrudan İBB Canlı Filo GPS & Güzergâh Sistemi</span>
    <span>Durak: 205671 (19) & 213801 (14TM)</span>
  </footer>
</body>
</html>`;
}

module.exports = { renderDashboard };
