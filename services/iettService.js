const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const config = require('../config');

// Kalıcı önbellek dosyası
const CACHE_FILE = path.join(__dirname, '..', '.iett_cache.json');

// Önbellek ve Sorgulama Süreleri
const STATIC_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // Durak sırası ve tarife: 12 saat
const LIVE_POLL_INTERVAL_MS = 180 * 1000;        // Canlı GPS sorgusu: 3 dakika (İBB Layer7 Rate Limit koruması)
const STALE_LIVE_MAX_AGE_MS = 15 * 60 * 1000;    // Canlı GPS verisini 15 dk boyunca güzergah üzerinde ilerleterek kullan

let cacheStore = {
  routeStops: {}, // { [hatKodu]: { timestamp, stops } }
  schedules: {},  // { [hatKodu]: { timestamp, schedule } }
  liveBuses: {}   // { [hatKodu]: { timestamp, vehicles, rateLimitedUntil } }
};

const inflightLiveRequests = new Map();

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        cacheStore = {
          routeStops: parsed.routeStops || {},
          schedules: parsed.schedules || {},
          liveBuses: parsed.liveBuses || {}
        };
      }
    }
  } catch (e) {
    // Disk önbelleği okunamazsa bellek içi devam et
  }
}

function saveCacheToDisk() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheStore), 'utf-8');
  } catch (e) {
    // Salt okunur ortamda sessizce geç
  }
}

loadCacheFromDisk();

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
          'User-Agent': 'Mozilla/5.0'
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
 * Hattın tüm durak dizilimini çeker ve 12 saat önbellekte tutar
 */
async function getHatStopSequence(hatKodu) {
  const cached = cacheStore.routeStops[hatKodu];
  if (cached && cached.stops && cached.stops.length > 0 && (Date.now() - cached.timestamp < STATIC_CACHE_TTL_MS)) {
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
      cacheStore.routeStops[hatKodu] = { timestamp: Date.now(), stops };
      saveCacheToDisk();
      return stops;
    }
  } catch (err) {
    console.error(`DurakDetay_GYY (${hatKodu}) hatası:`, err.message);
  }
  return cached && cached.stops ? cached.stops : [];
}

/**
 * Hattın resmi planlanan sefer kalkış saatlerini çeker ve 12 saat önbellekte tutar
 */
async function getPlannedSchedule(hatKodu) {
  const cached = cacheStore.schedules[hatKodu];
  if (cached && cached.schedule && cached.schedule.length > 0 && (Date.now() - cached.timestamp < STATIC_CACHE_TTL_MS)) {
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
      if (Array.isArray(schedule) && schedule.length > 0) {
        cacheStore.schedules[hatKodu] = { timestamp: Date.now(), schedule };
        saveCacheToDisk();
        return schedule;
      }
    }
  } catch (err) {
    console.error(`PlanlananSeferSaati (${hatKodu}) hatası:`, err.message);
  }
  return cached && cached.schedule ? cached.schedule : [];
}

/**
 * Hattın şu anki saat diliminde aktif bir seferi olup olmadığını kontrol eder
 */
function isLinePotentiallyActiveNow(schedule, targetYon, nowMinutesOfDay, gunTipi) {
  if (!schedule || schedule.length === 0) return true;
  const todaysDepartures = schedule
    .filter(x => x.SYON === targetYon && x.SGUNTIPI === gunTipi)
    .map(x => {
      const parts = String(x.DT || '').split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    })
    .filter(m => !isNaN(m));

  if (todaysDepartures.length === 0) return true;
  return todaysDepartures.some(depMin => nowMinutesOfDay >= (depMin - 5) && nowMinutesOfDay <= (depMin + 85));
}

/**
 * Hattın anlık aktif otobüs konumlarını (GetHatOtoKonum_json) Rate-Limit korumalı çeker
 */
async function fetchLiveBuses(hatKodu, forceSkipRemote = false) {
  const now = Date.now();
  const cached = cacheStore.liveBuses[hatKodu];

  if (forceSkipRemote) {
    return { ok: true, fromCache: true, ageSeconds: 0, vehicles: [] };
  }

  // 1. Önbellek taze ise (son 3 dakika içinde çekildiyse) doğrudan önbellekten dön (0 API isteği!)
  if (cached && cached.vehicles && cached.vehicles.length > 0 && (now - cached.timestamp < LIVE_POLL_INTERVAL_MS)) {
    return {
      ok: true,
      fromCache: true,
      ageSeconds: Math.round((now - cached.timestamp) / 1000),
      vehicles: cached.vehicles
    };
  }

  // Eğer İBB Rate Limit bekleme süresindeysek uzak sunucuyu yorma
  if (cached && cached.rateLimitedUntil && now < cached.rateLimitedUntil) {
    if (cached.vehicles && cached.vehicles.length > 0 && (now - cached.timestamp < STALE_LIVE_MAX_AGE_MS)) {
      return {
        ok: true,
        fromCache: true,
        rateLimited: true,
        ageSeconds: Math.round((now - cached.timestamp) / 1000),
        vehicles: cached.vehicles
      };
    }
    return { ok: false, rateLimited: true, vehicles: [] };
  }

  if (inflightLiveRequests.has(hatKodu)) {
    return inflightLiveRequests.get(hatKodu);
  }

  const requestPromise = (async () => {
    try {
      const res = await soapCall(
        config.api.seferGerceklesmeUrl,
        'http://tempuri.org/GetHatOtoKonum_json',
        `<GetHatOtoKonum_json xmlns="http://tempuri.org/"><HatKodu>${hatKodu}</HatKodu></GetHatOtoKonum_json>`
      );

      const match = res.data.match(/<GetHatOtoKonum_jsonResult>(.*?)<\/GetHatOtoKonum_jsonResult>/s);
      if (res.status === 200 && match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          cacheStore.liveBuses[hatKodu] = {
            timestamp: Date.now(),
            vehicles: parsed,
            rateLimitedUntil: 0
          };
          saveCacheToDisk();
          return {
            ok: true,
            fromCache: false,
            ageSeconds: 0,
            vehicles: parsed
          };
        }
      }

      // İBB Layer7 Rate Limit döndüyse 5 dakika boyunca tekrar sorma, kotanın sıfırlanmasına izin ver
      cacheStore.liveBuses[hatKodu] = {
        timestamp: cached ? cached.timestamp : 0,
        vehicles: cached && cached.vehicles ? cached.vehicles : [],
        rateLimitedUntil: Date.now() + 5 * 60 * 1000
      };
      saveCacheToDisk();

      if (cached && cached.vehicles && cached.vehicles.length > 0 && (now - cached.timestamp < STALE_LIVE_MAX_AGE_MS)) {
        return {
          ok: true,
          fromCache: true,
          rateLimited: true,
          ageSeconds: Math.round((now - cached.timestamp) / 1000),
          vehicles: cached.vehicles
        };
      }

      return { ok: false, rateLimited: true, vehicles: [] };
    } catch (err) {
      if (cached && cached.vehicles && cached.vehicles.length > 0 && (now - cached.timestamp < STALE_LIVE_MAX_AGE_MS)) {
        return {
          ok: true,
          fromCache: true,
          ageSeconds: Math.round((now - cached.timestamp) / 1000),
          vehicles: cached.vehicles
        };
      }
      return { ok: false, vehicles: [] };
    } finally {
      inflightLiveRequests.delete(hatKodu);
    }
  })();

  inflightLiveRequests.set(hatKodu, requestPromise);
  return requestPromise;
}

/**
 * Canlı GPS servisi İBB tarafından geçici Rate-Limit'e alındığında,
 * İETT'nin resmi bugünkü kalkış tarifesi (PlanlananSeferSaati) + gerçek durak koordinatları (DurakDetay_GYY)
 * üzerinden şu an yolda olan gerçek seferlerin hangi durakta olduğunu ve kalan dakikasını hesaplar.
 */
function computeScheduleTrackedBuses(schedule, routeStops, targetStopMeta, stop, nowMinutesOfDay, nowSeconds, gunTipi, calculateRouteDistance) {
  if (!schedule || !routeStops || routeStops.length === 0 || !targetStopMeta) return [];

  const targetYon = targetStopMeta.yon;
  const targetSira = targetStopMeta.sira;
  const totalStopsToTarget = targetSira - 1;
  if (totalStopsToTarget <= 0) return [];

  // İlk duraktan hedef durağa toplam gerçek yol mesafesi (km) ve toplam varış süresi (dk)
  const totalRouteKm = calculateRouteDistance(1, routeStops[0].lat, routeStops[0].lng);
  const totalTravelMin = (totalRouteKm * 2.4) + (totalStopsToTarget * 0.45);

  const todaysDepartures = schedule
    .filter(x => x.SYON === targetYon && x.SGUNTIPI === gunTipi)
    .map(x => {
      const parts = String(x.DT || '').split(':');
      return {
        dt: x.DT,
        depMin: parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
      };
    })
    .filter(x => !isNaN(x.depMin));

  const trackedBuses = [];
  const exactNowMin = nowMinutesOfDay + (nowSeconds / 60);

  for (const dep of todaysDepartures) {
    const elapsedMin = exactNowMin - dep.depMin;
    // Sefer ilk duraktan kalkmış ve henüz hedef durağı geçmemişse:
    if (elapsedMin >= 0 && elapsedMin <= totalTravelMin) {
      const progressRatio = Math.min(1, elapsedMin / totalTravelMin);
      const currentSira = Math.max(2, Math.min(targetSira, 1 + Math.round(progressRatio * totalStopsToTarget)));
      const currentStopObj = routeStops.find(s => s.sira === currentSira) || routeStops[0];

      const kalanDurak = targetSira - currentSira;
      const kalanMesafeKm = calculateRouteDistance(currentSira, currentStopObj.lat, currentStopObj.lng);
      const kalanDakika = kalanDurak === 0 ? 0 : Math.max(1, Math.round(totalTravelMin - elapsedMin));

      trackedBuses.push({
        kapiNo: `${dep.dt} Seferi`,
        kalanDakika,
        kalanDurak,
        bulunduguDurak: currentStopObj.durakAdi,
        bulunduguSira: currentSira,
        hedefYon: stop.hedefYon,
        mesafeKm: kalanMesafeKm.toFixed(1),
        kaynak: 'tarife-takip'
      });
    }
  }

  trackedBuses.sort((a, b) => a.kalanDakika - b.kalanDakika);
  return trackedBuses.slice(0, 3);
}

/**
 * Belirli bir durak için gerçek zamanlı yaklaşan araçları ve resmi kalkış saatlerini hesaplar
 */
async function getDurakVarisBilgisi(stop) {
  const [allStops, schedule] = await Promise.all([
    getHatStopSequence(stop.hatKodu),
    getPlannedSchedule(stop.hatKodu)
  ]);

  const targetStopMeta = allStops.find(s => s.durakKodu === String(stop.durakKodu));
  const targetYon = targetStopMeta ? targetStopMeta.yon : 'G';
  const targetSira = targetStopMeta ? targetStopMeta.sira : null;

  const routeStops = allStops
    .filter(s => s.yon === targetYon)
    .sort((a, b) => a.sira - b.sira);

  const firstStop = routeStops.length > 0 ? routeStops[0] : null;

  const istanbulNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const dayOfWeek = istanbulNow.getDay();
  const gunTipi = dayOfWeek === 0 ? 'P' : (dayOfWeek === 6 ? 'C' : 'I');
  const nowHours = istanbulNow.getHours();
  const nowMinutes = istanbulNow.getMinutes();
  const nowSeconds = istanbulNow.getSeconds();
  const nowMinutesOfDay = nowHours * 60 + nowMinutes;
  const nowHHMM = String(nowHours).padStart(2, '0') + ':' + String(nowMinutes).padStart(2, '0');

  const upcomingDepartures = schedule
    .filter(x => x.SYON === targetYon && x.SGUNTIPI === gunTipi && x.DT >= nowHHMM)
    .map(x => x.DT)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);

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

  const isPotentiallyActive = isLinePotentiallyActiveNow(schedule, targetYon, nowMinutesOfDay, gunTipi);
  const liveResult = await fetchLiveBuses(stop.hatKodu, !isPotentiallyActive);

  let approachingBuses = [];
  let waitingAtTerminalBuses = [];
  let veriKaynagi = 'canli';

  if (liveResult.ok && liveResult.vehicles.length > 0 && routeStops.length > 0 && targetStopMeta) {
    for (const v of liveResult.vehicles) {
      const guzergah = String(v.guzergahkodu || '');
      if (guzergah && !guzergah.includes(`_${targetYon}_`)) {
        continue;
      }

      const lat = parseFloat(v.enlem || v.Enlem);
      const lng = parseFloat(v.boylam || v.Boylam);
      const yakinKod = String(v.yakinDurakKodu || '').trim();

      let currentStop = routeStops.find(s => s.durakKodu === yakinKod);

      if (!currentStop && !isNaN(lat) && !isNaN(lng)) {
        let bestStop = null;
        let minDist = 0.6;
        for (const rs of routeStops) {
          const d = calculateDistanceKm(lat, lng, rs.lat, rs.lng);
          if (d < minDist) {
            minDist = d;
            bestStop = rs;
          }
        }
        currentStop = bestStop;
      }

      if (!currentStop) continue;

      // Önbellek yaşına göre aracın ilerlemesini hesaba kat
      const ageMin = (liveResult.ageSeconds || 0) / 60;
      const progressedStops = currentStop.sira > 1 ? Math.floor(ageMin / 1.15) : 0;
      const effectiveSira = currentStop.sira + progressedStops;

      if (effectiveSira > targetSira) {
        continue;
      }

      const effectiveStopObj = routeStops.find(s => s.sira === effectiveSira) || currentStop;
      const kalanDurak = targetSira - effectiveSira;
      const mesafeKm = calculateRouteDistance(effectiveSira, effectiveStopObj.lat, effectiveStopObj.lng);

      const rawMinutes = (mesafeKm * 2.4) + (kalanDurak * 0.45);
      const kalanDakika = kalanDurak === 0 ? 0 : Math.max(1, Math.round(rawMinutes));

      const busData = {
        kapiNo: v.kapino || v.KapiNo || 'İETT',
        kalanDakika,
        kalanDurak,
        bulunduguDurak: effectiveStopObj.durakAdi,
        bulunduguSira: effectiveSira,
        hedefYon: v.yon || stop.hedefYon,
        mesafeKm: mesafeKm.toFixed(1),
        kaynak: 'canli'
      };

      if (effectiveSira === 1) {
        waitingAtTerminalBuses.push(busData);
      } else {
        approachingBuses.push(busData);
      }
    }
    approachingBuses.sort((a, b) => a.kalanDurak - b.kalanDurak);
  } else if (!liveResult.ok && isPotentiallyActive) {
    // Canlı GPS servisi İBB Layer7 Rate-Limit beklemesindeyse,
    // Resmi kalkış saatlerinden (PlanlananSeferSaati) o an yolda olan gerçek seferi takip et!
    approachingBuses = computeScheduleTrackedBuses(
      schedule,
      routeStops,
      targetStopMeta,
      stop,
      nowMinutesOfDay,
      nowSeconds,
      gunTipi,
      calculateRouteDistance
    );
    veriKaynagi = 'tarife-takip';
  }

  return {
    durak: {
      ...stop,
      siraNo: targetSira,
      ilkDurakAdi: firstStop ? firstStop.durakAdi : 'İlk Durak'
    },
    baglantiDurumu: 'aktif',
    veriKaynagi,
    otobusler: approachingBuses.slice(0, 3),
    ilkDuraktaBekleyenSayisi: waitingAtTerminalBuses.length,
    siradakiKalkislar: upcomingDepartures
  };
}

module.exports = {
  getDurakVarisBilgisi
};
