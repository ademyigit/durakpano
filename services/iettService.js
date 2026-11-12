const https = require('https');
const { URL } = require('url');
const config = require('../config');

// Bellek içi önbellek (Durak sırası ve tarife saatleri sık değişmediği için 6 saat saklanır)
const routeStopsCache = new Map();
const scheduleCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Haversine formülü ile iki koordinat arası mesafe (km)
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Sıfır bağımlılıklı standart SOAP/HTTPS POST isteği
 */
function soapCall(urlStr, soapAction, bodyXml, timeoutMs = config.api.timeoutMs) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(urlStr);
      const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    ${bodyXml}
  </soap:Body>
</soap:Envelope>`;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': soapAction,
          'User-Agent': 'Mozilla/5.0 (SmartTransitKiosk DurakPano/1.1)'
        },
        timeout: timeoutMs,
        rejectUnauthorized: false
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, data: body }));
      });

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('İstek zaman aşımına uğradı'));
      });

      req.write(envelope);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Hattın tüm durak dizilimini (SIRANO, YON, DURAKKODU, DURAKADI, Koordinat) çeker ve önbelleğe alır
 */
async function getHatStopSequence(hatKodu) {
  const cached = routeStopsCache.get(hatKodu);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.stops;
  }

  try {
    const res = await soapCall(
      config.api.ibbUrl,
      'http://tempuri.org/DurakDetay_GYY',
      `<DurakDetay_GYY xmlns="http://tempuri.org/"><hat_kodu>${hatKodu}</hat_kodu></DurakDetay_GYY>`
    );

    const stops = [...res.data.matchAll(/<Table>(.*?)<\/Table>/gs)].map(m => {
      const getTag = (t) => (m[1].match(new RegExp(`<${t}>(.*?)</${t}>`)) || [])[1];
      return {
        hat: getTag('HATKODU'),
        yon: getTag('YON'),
        sira: parseInt(getTag('SIRANO'), 10),
        durakKodu: String(getTag('DURAKKODU') || '').trim(),
        durakAdi: getTag('DURAKADI') || '',
        lng: parseFloat(getTag('XKOORDINATI')),
        lat: parseFloat(getTag('YKOORDINATI'))
      };
    });

    if (stops.length > 0) {
      routeStopsCache.set(hatKodu, { timestamp: Date.now(), stops });
      return stops;
    }
  } catch (err) {
    console.error(`DurakDetay_GYY (${hatKodu}) hatası:`, err.message);
  }
  return cached ? cached.stops : [];
}

/**
 * Hattın resmi planlanan sefer kalkış saatlerini çeker ve önbelleğe alır
 */
async function getPlannedSchedule(hatKodu) {
  const cached = scheduleCache.get(hatKodu);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.schedule;
  }

  try {
    const res = await soapCall(
      config.api.planlananSeferUrl,
      'http://tempuri.org/GetPlanlananSeferSaati_json',
      `<GetPlanlananSeferSaati_json xmlns="http://tempuri.org/"><HatKodu>${hatKodu}</HatKodu></GetPlanlananSeferSaati_json>`
    );

    const match = res.data.match(/<GetPlanlananSeferSaati_jsonResult>(.*?)<\/GetPlanlananSeferSaati_jsonResult>/s);
    if (match && match[1]) {
      const schedule = JSON.parse(match[1]);
      if (Array.isArray(schedule)) {
        scheduleCache.set(hatKodu, { timestamp: Date.now(), schedule });
        return schedule;
      }
    }
  } catch (err) {
    console.error(`PlanlananSeferSaati (${hatKodu}) hatası:`, err.message);
  }
  return cached ? cached.schedule : [];
}

/**
 * Hattın anlık aktif otobüs konumlarını (GetHatOtoKonum_json) çeker
 */
async function fetchLiveBuses(hatKodu) {
  try {
    const res = await soapCall(
      config.api.seferGerceklesmeUrl,
      'http://tempuri.org/GetHatOtoKonum_json',
      `<GetHatOtoKonum_json xmlns="http://tempuri.org/"><HatKodu>${hatKodu}</HatKodu></GetHatOtoKonum_json>`
    );

    const match = res.data.match(/<GetHatOtoKonum_jsonResult>(.*?)<\/GetHatOtoKonum_jsonResult>/s);
    if (match && match[1]) {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        return { ok: true, vehicles: parsed };
      }
    }
    return { ok: true, vehicles: [] };
  } catch (err) {
    console.error(`GetHatOtoKonum_json (${hatKodu}) hatası:`, err.message);
    return { ok: false, vehicles: [] };
  }
}

/**
 * Belirli bir durak için gerçek zamanlı yaklaşan araçları ve resmi kalkış saatlerini hesaplar
 */
async function getDurakVarisBilgisi(stop) {
  const [allStops, schedule, liveResult] = await Promise.all([
    getHatStopSequence(stop.hatKodu),
    getPlannedSchedule(stop.hatKodu),
    fetchLiveBuses(stop.hatKodu)
  ]);

  // 1. Hedef durağın hat üzerindeki yönünü (G / D) ve sıra numarasını bul
  const targetStopMeta = allStops.find(s => s.durakKodu === String(stop.durakKodu));
  const targetYon = targetStopMeta ? targetStopMeta.yon : 'G';
  const targetSira = targetStopMeta ? targetStopMeta.sira : null;

  // Aynı yöndeki sıralı durak listesi
  const routeStops = allStops
    .filter(s => s.yon === targetYon)
    .sort((a, b) => a.sira - b.sira);

  const firstStop = routeStops.length > 0 ? routeStops[0] : null;

  // Araçtan hedef durağa kadar güzergah üzerindeki gerçek yol mesafesini (km) hesaplar
  function calculateRouteDistance(busSira, busLat, busLng) {
    if (!targetStopMeta || routeStops.length === 0) {
      return calculateDistanceKm(busLat, busLng, stop.koordinat.lat, stop.koordinat.lng);
    }
    const startIdx = routeStops.findIndex(s => s.sira === busSira);
    const targetIdx = routeStops.findIndex(s => s.sira === targetSira);
    if (startIdx === -1 || targetIdx === -1 || startIdx >= targetIdx) return 0;

    let totalKm = calculateDistanceKm(busLat, busLng, routeStops[startIdx + 1].lat, routeStops[startIdx + 1].lng);
    for (let i = startIdx + 1; i < targetIdx; i++) {
      totalKm += calculateDistanceKm(routeStops[i].lat, routeStops[i].lng, routeStops[i + 1].lat, routeStops[i + 1].lng);
    }
    return totalKm;
  }

  // 2. Bugünün resmi kalkış saatlerini filtrele
  const istanbulNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const dayOfWeek = istanbulNow.getDay();
  const gunTipi = dayOfWeek === 0 ? 'P' : (dayOfWeek === 6 ? 'C' : 'I');
  const nowHHMM = String(istanbulNow.getHours()).padStart(2, '0') + ':' + String(istanbulNow.getMinutes()).padStart(2, '0');

  const upcomingDepartures = schedule
    .filter(x => x.SYON === targetYon && x.SGUNTIPI === gunTipi && x.DT >= nowHHMM)
    .map(x => x.DT)
    .filter((v, i, a) => a.indexOf(v) === i) // Tekrarları kaldır
    .slice(0, 4);

  // 3. Canlı araçları filtrele (Sadece doğru yönde olan ve durağı henüz geçmemiş araçlar!)
  const approachingBuses = [];
  const waitingAtTerminalBuses = [];

  if (liveResult.ok && liveResult.vehicles.length > 0 && routeStops.length > 0 && targetStopMeta) {
    for (const v of liveResult.vehicles) {
      const guzergah = String(v.guzergahkodu || '');
      // Yön kontrolü (_G_ veya _D_)
      if (guzergah && !guzergah.includes(`_${targetYon}_`)) {
        continue;
      }

      const yakinKod = String(v.yakinDurakKodu || '').trim();
      const currentStop = routeStops.find(s => s.durakKodu === yakinKod);
      if (!currentStop) continue;

      // Durağı geçmiş olan araçları kesinlikle dahil etme
      if (currentStop.sira > targetSira) {
        continue;
      }

      const lat = parseFloat(v.enlem || v.Enlem);
      const lng = parseFloat(v.boylam || v.Boylam);
      const kalanDurak = targetSira - currentStop.sira;
      const mesafeKm = calculateRouteDistance(currentStop.sira, lat, lng);

      // İstanbul içi ortalama 22 km/s (~2.5 dk/km) + durak başı ~0.4 dk bekleme/ışık süresi
      const rawMinutes = (mesafeKm * 2.4) + (kalanDurak * 0.45);
      const kalanDakika = kalanDurak === 0 ? 0 : Math.max(1, Math.round(rawMinutes));

      const busData = {
        kapiNo: v.kapino || v.KapiNo || 'İETT',
        kalanDakika,
        kalanDurak,
        bulunduguDurak: currentStop.durakAdi,
        bulunduguSira: currentStop.sira,
        hedefYon: v.yon || stop.hedefYon,
        mesafeKm: mesafeKm.toFixed(1),
        sonKonumZamani: (v.son_konum_zamani || '').split(' ')[1] || ''
      };

      if (currentStop.sira === 1) {
        waitingAtTerminalBuses.push(busData);
      } else {
        approachingBuses.push(busData);
      }
    }
  }

  // Durağa en yakın olan araca göre sırala
  approachingBuses.sort((a, b) => a.kalanDurak - b.kalanDurak);

  return {
    durak: {
      ...stop,
      siraNo: targetSira,
      ilkDurakAdi: firstStop ? firstStop.durakAdi : 'İlk Durak'
    },
    baglantiDurumu: liveResult.ok ? 'aktif' : 'hata',
    otobusler: approachingBuses.slice(0, 3),
    ilkDuraktaBekleyenSayisi: waitingAtTerminalBuses.length,
    siradakiKalkislar: upcomingDepartures
  };
}

module.exports = {
  getDurakVarisBilgisi
};
