const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const config = require('../config');

const CACHE_FILE = path.join(__dirname, '..', '.iett_cache.json');

// Önbellek Süreleri (Broadcom Layer7 Rate-Limit Korumalı)
const STATIC_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // Durak sırası ve tarife: 12 saat
const LIVE_GPS_TTL_ACTIVE_MS = 75 * 1000;        // Aktif sefer saatlerinde GPS yenileme: 75 saniye
const LIVE_GPS_TTL_IDLE_MS = 300 * 1000;         // Sefer saati dışında GPS yenileme: 5 dakika
const STALE_GPS_MAX_AGE_MS = 8 * 60 * 1000;      // Geçici ağ hatasında son konumu koruma süresi: 8 dakika

let cacheStore = {
  routeStops: {}, // { [hatKodu]: { timestamp, stops } }
  schedules: {},  // { [hatKodu]: { timestamp, schedule } }
  liveBuses: {}   // { [hatKodu]: { timestamp, vehicles, rateLimitedUntil } }
};

const inflightLiveRequests = new Map();
let lastSoapCallTime = 0;

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        cacheStore.routeStops = parsed.routeStops || {};
        cacheStore.schedules = parsed.schedules || {};
        cacheStore.liveBuses = parsed.liveBuses || {};
      }
    }
  } catch (e) {
    // Disk önbelleği okunamazsa bellek içi devam et
  }
}

function saveCacheToDisk() {
  try {
    const toSave = {
      routeStops: cacheStore.routeStops,
      schedules: cacheStore.schedules,
      liveBuses: cacheStore.liveBuses
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(toSave), 'utf-8');
  } catch (e) {
    // Salt okunur ortamda sessizce geç
  }
}

loadCacheFromDisk();

/**
 * İki GPS koordinatı arasındaki Haversine mesafesini (km) hesaplar
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
 * Son durak / hedef yön bilgisini sade ve anlaşılır formata dönüştürür (Örn: Bostancı, Uzunçayır)
 */
function formatSonDurak(rawYon, defaultYon) {
  const str = String(rawYon || defaultYon || '').trim();
  const upper = str.toUpperCase('tr-TR');

  if (upper.includes('BOSTANCI')) return 'Bostancı';
  if (upper.includes('UZUNÇAYIR')) return 'Uzunçayır';
  if (upper.includes('KADIKÖY')) return 'Kadıköy';
  if (upper.includes('CEVİZLİ')) return 'Cevizli Peronlar';
  if (upper.includes('MALTEPE')) return 'Maltepe Metro';
  if (upper.includes('TEPEÜSTÜ')) return 'Tepeüstü';
  if (upper.includes('YEDİTEPE')) return 'Yeditepe Üni.';
  if (upper.includes('FERHATPAŞA')) return 'Ferhatpaşa';

  return str.replace(/PERONLAR/gi, '').replace(/METROBÜS/gi, '').trim() || str;
}

/**
 * İstanbul yerel zamanını döndürür
 */
function getIstanbulNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
}

/**
 * "YYYY-MM-DD HH:mm:ss" formatındaki İETT son_konum_zamani değerini İstanbul saatine göre çözer
 */
function parseGpsTimestampMinutesAgo(sonKonumZamani, istanbulNow) {
  if (!sonKonumZamani) return 0;
  try {
    const m = String(sonKonumZamani).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return 0;
    const gpsDate = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6])
    );
    const diffMin = (istanbulNow.getTime() - gpsDate.getTime()) / 60000;
    return Math.max(0, Math.min(5, diffMin));
  } catch (e) {
    return 0;
  }
}

/**
 * Standart İBB SOAP isteği
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

      const req = https.request({
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
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, data: body }));
      });

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('SOAP zaman aşımı'));
      });

      req.write(envelope);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Hattın tüm durak sırasını ve koordinatlarını çeker (DurakDetay_GYY)
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
    // Sessiz geç
  }
  return cached && cached.stops ? cached.stops : [];
}

/**
 * Hattın resmi planlanan sefer saatlerini çeker (GetPlanlananSeferSaati_json)
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
    // Sessiz geç
  }
  return cached && cached.schedule ? cached.schedule : [];
}

/**
 * Hattın şu an aktif bir sefer penceresinde olup olmadığını kontrol eder (Rate-Limit tasarrufu)
 */
function isLineInActiveWindow(schedule, targetYon, istanbulNow) {
  if (!schedule || schedule.length === 0) return true;
  const dayOfWeek = istanbulNow.getDay();
  const gunTipi = dayOfWeek === 0 ? 'P' : (dayOfWeek === 6 ? 'C' : 'I');
  const nowMinutes = istanbulNow.getHours() * 60 + istanbulNow.getMinutes();

  const times = schedule
    .filter(x => x.SYON === targetYon && x.SGUNTIPI === gunTipi)
    .map(x => {
      const [h, m] = String(x.DT || '00:00').split(':').map(Number);
      return h * 60 + m;
    });

  if (times.length === 0) return false;

  // Son 85 dakika içinde kalkmış veya önümüzdeki 15 dakika içinde kalkacak bir sefer varsa aktif penceredir
  return times.some(depMin => (nowMinutes >= depMin - 15) && (nowMinutes <= depMin + 85));
}

/**
 * İBB SeferGerceklesme.asmx üzerinden canlı otobüs GPS konumlarını çeker
 */
async function fetchLiveBusesSOAP(hatKodu, isActiveWindow = true) {
  const now = Date.now();
  const cached = cacheStore.liveBuses[hatKodu];
  const ttl = isActiveWindow ? LIVE_GPS_TTL_ACTIVE_MS : LIVE_GPS_TTL_IDLE_MS;

  // 1. Önbellek süresi dolmadıysa doğrudan önbellekten dön (Sıfır ağ isteği)
  if (cached && Array.isArray(cached.vehicles) && (now - cached.timestamp < ttl)) {
    return { ok: true, vehicles: cached.vehicles, timestamp: cached.timestamp };
  }

  // 2. Geçici Rate-Limit bekleme süresi varsa son bilinen geçerli araçları koruyarak dön
  if (cached && cached.rateLimitedUntil && now < cached.rateLimitedUntil) {
    const hasRecentStale = Array.isArray(cached.vehicles) && (now - cached.timestamp < STALE_GPS_MAX_AGE_MS);
    return { ok: hasRecentStale, vehicles: cached.vehicles || [], timestamp: cached.timestamp };
  }

  // 3. Aynı hat için devam eden bir istek varsa onu bekle
  if (inflightLiveRequests.has(hatKodu)) {
    return inflightLiveRequests.get(hatKodu);
  }

  const reqPromise = (async () => {
    try {
      // İki SOAP isteği arasında en az 2.5 saniye boşluk bırak (Layer7 burst koruması)
      const sinceLast = Date.now() - lastSoapCallTime;
      if (sinceLast < 2500) {
        await new Promise(r => setTimeout(r, 2500 - sinceLast));
      }
      lastSoapCallTime = Date.now();

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
          return { ok: true, vehicles: parsed, timestamp: Date.now() };
        }
      }

      // Hata veya Rate-Limit durumunda önceki araç verisini SİLME, 90 saniye dinlen
      cacheStore.liveBuses[hatKodu] = {
        timestamp: cached ? cached.timestamp : 0,
        vehicles: cached && cached.vehicles ? cached.vehicles : [],
        rateLimitedUntil: Date.now() + 90 * 1000
      };
      saveCacheToDisk();
      const hasStale = cached && Array.isArray(cached.vehicles) && (Date.now() - cached.timestamp < STALE_GPS_MAX_AGE_MS);
      return { ok: Boolean(hasStale), vehicles: cached && cached.vehicles ? cached.vehicles : [], timestamp: cached ? cached.timestamp : 0 };
    } catch (e) {
      const hasStale = cached && Array.isArray(cached.vehicles) && (Date.now() - cached.timestamp < STALE_GPS_MAX_AGE_MS);
      return { ok: Boolean(hasStale), vehicles: cached && cached.vehicles ? cached.vehicles : [], timestamp: cached ? cached.timestamp : 0 };
    } finally {
      inflightLiveRequests.delete(hatKodu);
    }
  })();

  inflightLiveRequests.set(hatKodu, reqPromise);
  return reqPromise;
}

/**
 * Durağa yaklaşan otobüsleri, gerçek güzergâh mesafesini ve varış dakikalarını hesaplar
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
  const targetIdx = routeStops.findIndex(s => s.durakKodu === String(stop.durakKodu));

  // Duraklar arası kümülatif güzergâh mesafesi dizisi (km)
  const cumRouteKm = [0];
  for (let i = 1; i < routeStops.length; i++) {
    const segKm = calculateDistanceKm(
      routeStops[i - 1].lat,
      routeStops[i - 1].lng,
      routeStops[i].lat,
      routeStops[i].lng
    );
    cumRouteKm[i] = cumRouteKm[i - 1] + segKm;
  }

  // Resmi tarife saatleri
  const istanbulNow = getIstanbulNow();
  const dayOfWeek = istanbulNow.getDay();
  const gunTipi = dayOfWeek === 0 ? 'P' : (dayOfWeek === 6 ? 'C' : 'I');
  const nowHHMM = String(istanbulNow.getHours()).padStart(2, '0') + ':' + String(istanbulNow.getMinutes()).padStart(2, '0');

  const upcomingDepartures = schedule
    .filter(x => x.SYON === targetYon && x.SGUNTIPI === gunTipi && x.DT >= nowHHMM)
    .map(x => x.DT)
    .sort()
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);

  const activeWindow = isLineInActiveWindow(schedule, targetYon, istanbulNow);
  const soapGps = await fetchLiveBusesSOAP(stop.hatKodu, activeWindow);

  const approachingBuses = [];
  const waitingAtFirstStopBuses = [];

  if (soapGps.vehicles && soapGps.vehicles.length > 0 && routeStops.length > 0 && targetIdx >= 0) {
    for (const v of soapGps.vehicles) {
      const guzergah = String(v.guzergahkodu || '');
      if (guzergah && !guzergah.includes(`_${targetYon}_`)) continue;

      const lat = parseFloat(v.enlem || v.Enlem);
      const lng = parseFloat(v.boylam || v.Boylam);
      const yakinKod = String(v.yakinDurakKodu || '').trim();

      let curIdx = routeStops.findIndex(s => s.durakKodu === yakinKod);

      // Eğer yakinDurakKodu alt varyant nedeniyle bulunamadıysa GPS koordinatına en yakın (<=250m) durağı bul
      if (curIdx === -1 && !isNaN(lat) && !isNaN(lng)) {
        let bestDist = 0.25;
        for (let i = 0; i <= targetIdx; i++) {
          const d = calculateDistanceKm(lat, lng, routeStops[i].lat, routeStops[i].lng);
          if (d < bestDist) {
            bestDist = d;
            curIdx = i;
          }
        }
      }

      if (curIdx === -1 || curIdx > targetIdx) continue;

      const currentStop = routeStops[curIdx];
      const doorNo = String(v.kapino || v.KapiNo || 'İETT').trim();
      const sonKonum = v.son_konum_zamani || '';
      const elapsedMin = parseGpsTimestampMinutesAgo(sonKonum, istanbulNow);

      // İlk durakta (Sıra 1) bekleyen araç kontrolü
      const sonDurakAdi = formatSonDurak(v.yon, stop.hedefYon);

      if (curIdx === 0) {
        const distFromStart = (!isNaN(lat) && !isNaN(lng))
          ? calculateDistanceKm(lat, lng, routeStops[0].lat, routeStops[0].lng)
          : 0;
        // Eğer ilk duraktan 140 metreden fazla uzaklaşmadıysa henüz kalkış saatini bekliyordur
        if (distFromStart < 0.14) {
          waitingAtFirstStopBuses.push({
            kapiNo: doorNo,
            sonDurak: sonDurakAdi,
            hedefYon: v.yon || stop.hedefYon
          });
          continue;
        }
      }

      const kalanDurak = targetSira - currentStop.sira;

      // Gerçek güzergâh (yol) mesafesi: aracın bulunduğu noktadan bir sonraki durağa + kalan duraklar arası yol
      let routeKm = 0;
      if (curIdx === targetIdx) {
        routeKm = (!isNaN(lat) && !isNaN(lng))
          ? calculateDistanceKm(lat, lng, routeStops[targetIdx].lat, routeStops[targetIdx].lng)
          : 0;
      } else {
        const nextStop = routeStops[curIdx + 1];
        const distToNext = (!isNaN(lat) && !isNaN(lng))
          ? calculateDistanceKm(lat, lng, nextStop.lat, nextStop.lng)
          : (cumRouteKm[curIdx + 1] - cumRouteKm[curIdx]);
        const remainingSegmentsKm = cumRouteKm[targetIdx] - cumRouteKm[curIdx + 1];
        routeKm = Math.max(0.05, distToNext + remainingSegmentsKm);
      }

      // İstanbul şehir içi otobüs hızı (~20-21 km/s = 2.85 dk/km) + durak başı bekleme (0.35 dk) - son GPS pinginden beri geçen süre
      let kalanDakika = 0;
      if (kalanDurak === 0 && routeKm <= 0.15) {
        kalanDakika = 0;
      } else {
        const rawTravelMinutes = (routeKm * 2.85) + (kalanDurak * 0.35);
        kalanDakika = Math.max(1, Math.round(rawTravelMinutes - (elapsedMin * 0.85)));
      }

      const saatParca = sonKonum.split(' ')[1] ? sonKonum.split(' ')[1].slice(0, 5) : null;

      approachingBuses.push({
        hatKodu: stop.hatKodu,
        kapiNo: doorNo,
        sonDurak: sonDurakAdi,
        kalanDakika,
        kalanDurak,
        bulunduguDurak: currentStop.durakAdi,
        bulunduguSira: currentStop.sira,
        mesafeKm: routeKm.toFixed(1),
        sonGpsSaati: saatParca,
        hedefYon: v.yon || stop.hedefYon,
        kaynak: 'gps-canli'
      });
    }
  }

  approachingBuses.sort((a, b) => a.kalanDakika - b.kalanDakika);

  return {
    durak: {
      ...stop,
      siraNo: targetSira,
      ilkDurakAdi: firstStop ? firstStop.durakAdi : 'İlk Durak'
    },
    baglantiDurumu: soapGps.ok ? 'canli' : 'beklemede',
    otobusler: approachingBuses.slice(0, 3),
    ilkDuraktaBekleyenAraclar: waitingAtFirstStopBuses,
    ilkDuraktaBekleyenSayisi: waitingAtFirstStopBuses.length,
    siradakiKalkislar: upcomingDepartures
  };
}

/**
 * Sunucu arka planında düzenli ve güvenli (Rate-Limit dostu) GPS güncelleyici
 */
function startBackgroundPoller() {
  const poll = async () => {
    for (const stop of config.stops) {
      try {
        await getDurakVarisBilgisi(stop);
      } catch (e) {
        // Arka plan hatasını yut
      }
    }
  };

  // İlk açılışta çalıştır ve her 60 saniyede bir kontrol et
  poll();
  const timer = setInterval(poll, 60 * 1000);
  if (timer.unref) timer.unref();
}

module.exports = {
  getDurakVarisBilgisi,
  startBackgroundPoller
};
