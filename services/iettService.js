const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const config = require('../config');

const CACHE_FILE = path.join(__dirname, '..', '.iett_cache.json');

// Önbellek Süreleri
const STATIC_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // Durak sırası ve tarife: 12 saat
const DURAK_PASSING_TTL_MS = 35 * 1000;          // durak.iett.gov.tr canlı varış süresi: 35 saniye
const LIVE_GPS_TTL_MS = 120 * 1000;              // İBB SOAP GPS konumu: 120 saniye

let cacheStore = {
  routeStops: {},     // { [hatKodu]: { timestamp, stops } }
  schedules: {},      // { [hatKodu]: { timestamp, schedule } }
  liveBuses: {},      // { [hatKodu]: { timestamp, vehicles, rateLimitedUntil } }
  passingDetails: {}, // { [durakKodu]: { timestamp, data } }
  durakCookies: {},   // { [cookieName]: cookieVal }
  captchaState: {
    required: false,
    imageBase64: null,
    timestamp: 0,
    lastError: null
  }
};

const inflightPassingRequests = new Map();
const inflightLiveRequests = new Map();

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        cacheStore.routeStops = parsed.routeStops || {};
        cacheStore.schedules = parsed.schedules || {};
        cacheStore.liveBuses = parsed.liveBuses || {};
        cacheStore.passingDetails = parsed.passingDetails || {};
        cacheStore.durakCookies = parsed.durakCookies || {};
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
      liveBuses: cacheStore.liveBuses,
      passingDetails: cacheStore.passingDetails,
      durakCookies: cacheStore.durakCookies
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(toSave), 'utf-8');
  } catch (e) {
    // Salt okunur ortamda sessizce geç
  }
}

loadCacheFromDisk();

/**
 * Çerezleri (Set-Cookie) saklar ve Cookie başlığı üretir
 */
function updateDurakCookies(setCookieArray) {
  if (!Array.isArray(setCookieArray)) return;
  for (const raw of setCookieArray) {
    const kv = String(raw).split(';')[0];
    const eqIdx = kv.indexOf('=');
    if (eqIdx > 0) {
      const name = kv.slice(0, eqIdx).trim();
      const val = kv.slice(eqIdx + 1).trim();
      cacheStore.durakCookies[name] = val;
    }
  }
  saveCacheToDisk();
}

function getDurakCookieHeader() {
  return Object.entries(cacheStore.durakCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * durak.iett.gov.tr için HTTPS istek yardımcısı
 */
function durakRequest(reqPath, method = 'POST', payloadObj = null, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const bodyStr = payloadObj ? JSON.stringify(payloadObj) : '';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': 'https://durak.iett.gov.tr',
      'Referer': 'https://durak.iett.gov.tr/',
      'X-Requested-With': 'XMLHttpRequest'
    };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json; charset=UTF-8';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const cookieHdr = getDurakCookieHeader();
    if (cookieHdr) {
      headers['Cookie'] = cookieHdr;
    }

    const req = https.request({
      hostname: 'durak.iett.gov.tr',
      port: 443,
      path: reqPath,
      method,
      headers,
      timeout: timeoutMs,
      rejectUnauthorized: false
    }, (res) => {
      if (res.headers['set-cookie']) {
        updateDurakCookies(res.headers['set-cookie']);
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data: body }));
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('durak.iett.gov.tr zaman aşımı'));
    });

    if (method === 'POST' && bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * durak.iett.gov.tr üzerinden yeni doğrulama kodu (Captcha) alır
 */
async function generateDurakCaptcha(forceRefresh = false) {
  const now = Date.now();
  // Son 40 saniye içinde alınmış geçerli bir captcha varsa tekrar çekme (Captcha ömrü 60 sn)
  if (!forceRefresh && cacheStore.captchaState.imageBase64 && (now - cacheStore.captchaState.timestamp < 40000)) {
    return cacheStore.captchaState;
  }

  try {
    // Çerez yoksa önce ana sayfayı ziyaret et
    if (Object.keys(cacheStore.durakCookies).length === 0) {
      await durakRequest('/?durakKodu=205671', 'GET');
    }

    const res = await durakRequest('/Home/Captcha', 'POST', null);
    if (res.status === 200 && res.data) {
      const parsed = JSON.parse(res.data);
      if (parsed && parsed.isSuccess && parsed.captchaImage) {
        cacheStore.captchaState = {
          required: true,
          imageBase64: parsed.captchaImage,
          timestamp: Date.now(),
          lastError: cacheStore.captchaState.lastError
        };
        return cacheStore.captchaState;
      }
    }
  } catch (err) {
    console.error('Captcha alınırken hata:', err.message);
  }
  return cacheStore.captchaState;
}

/**
 * Kullanıcının girdiği 6 haneli doğrulama kodunu durak.iett.gov.tr'ye gönderir
 */
async function submitDurakCaptcha(captchaText, stationCode = '205671') {
  try {
    const cleanText = String(captchaText || '').trim();
    if (!cleanText) {
      return { isSuccess: false, message: 'Lütfen doğrulama kodunu girin.' };
    }

    const res = await durakRequest('/Home/Control', 'POST', {
      StationCode: String(stationCode),
      CaptchaText: cleanText
    });

    const parsed = JSON.parse(res.data);
    if (parsed && (parsed.isSuccess || parsed.IsSuccess)) {
      cacheStore.captchaState = {
        required: false,
        imageBase64: null,
        timestamp: 0,
        lastError: null
      };
      // Doğrulama başarılı olunca durak önbelleğini sıfırla ki anında taze veri çekilsin
      cacheStore.passingDetails = {};
      saveCacheToDisk();
      return { isSuccess: true };
    }

    const msg = (parsed && parsed.message) || 'Hatalı kod veya süre doldu, yeni kod üretildi.';
    cacheStore.captchaState.lastError = msg;
    await generateDurakCaptcha(true);
    return {
      isSuccess: false,
      message: msg,
      captchaImage: cacheStore.captchaState.imageBase64
    };
  } catch (err) {
    return { isSuccess: false, message: 'Doğrulama sırasında ağ hatası: ' + err.message };
  }
}

/**
 * durak.iett.gov.tr /Home/GetPassingDetail servisinden resmi varış dakikalarını çeker
 */
async function fetchOfficialPassingDetail(durakKodu) {
  const now = Date.now();
  const cached = cacheStore.passingDetails[durakKodu];

  if (cached && cached.data && (now - cached.timestamp < DURAK_PASSING_TTL_MS)) {
    return { ok: true, data: cached.data, fromCache: true };
  }

  if (inflightPassingRequests.has(durakKodu)) {
    return inflightPassingRequests.get(durakKodu);
  }

  const reqPromise = (async () => {
    try {
      const res = await durakRequest('/Home/GetPassingDetail', 'POST', {
        StationCode: String(durakKodu)
      });

      if (res.status === 200 && res.data) {
        const parsed = JSON.parse(res.data);
        const isExpired = parsed.isTokenExpired ?? parsed.IsTokenExpired;
        const isSuccess = parsed.isSuccess ?? parsed.IsSuccess;
        const data = parsed.data ?? parsed.Data;

        if (isExpired) {
          await generateDurakCaptcha(false);
          return { ok: false, tokenExpired: true };
        }

        if (isSuccess && data) {
          cacheStore.captchaState.required = false;
          cacheStore.captchaState.lastError = null;
          cacheStore.passingDetails[durakKodu] = {
            timestamp: Date.now(),
            data
          };
          saveCacheToDisk();
          return { ok: true, data, fromCache: false };
        }
      }
      return { ok: false };
    } catch (err) {
      if (cached && cached.data && (now - cached.timestamp < 5 * 60 * 1000)) {
        return { ok: true, data: cached.data, fromCache: true };
      }
      return { ok: false };
    } finally {
      inflightPassingRequests.delete(durakKodu);
    }
  })();

  inflightPassingRequests.set(durakKodu, reqPromise);
  return reqPromise;
}

/**
 * Haversine mesafe hesabı (km)
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
 * Standart SOAP isteği (DurakDetay_GYY, PlanlananSeferSaati ve SeferGerceklesme için)
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

async function fetchLiveBusesSOAP(hatKodu) {
  const now = Date.now();
  const cached = cacheStore.liveBuses[hatKodu];

  if (cached && cached.vehicles && cached.vehicles.length > 0 && (now - cached.timestamp < LIVE_GPS_TTL_MS)) {
    return { ok: true, vehicles: cached.vehicles };
  }

  if (cached && cached.rateLimitedUntil && now < cached.rateLimitedUntil) {
    return { ok: false, vehicles: cached.vehicles || [] };
  }

  if (inflightLiveRequests.has(hatKodu)) {
    return inflightLiveRequests.get(hatKodu);
  }

  const reqPromise = (async () => {
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
          cacheStore.liveBuses[hatKodu] = { timestamp: Date.now(), vehicles: parsed, rateLimitedUntil: 0 };
          saveCacheToDisk();
          return { ok: true, vehicles: parsed };
        }
      }

      cacheStore.liveBuses[hatKodu] = {
        timestamp: cached ? cached.timestamp : 0,
        vehicles: cached && cached.vehicles ? cached.vehicles : [],
        rateLimitedUntil: Date.now() + 3 * 60 * 1000
      };
      return { ok: false, vehicles: [] };
    } catch (e) {
      return { ok: false, vehicles: [] };
    } finally {
      inflightLiveRequests.delete(hatKodu);
    }
  })();

  inflightLiveRequests.set(hatKodu, reqPromise);
  return reqPromise;
}

/**
 * Ana Veri Birleştirici:
 * 1. Öncelik: durak.iett.gov.tr (/Home/GetPassingDetail) -> %100 Resmi İETT Dakikası, Kapı No, Klima/USB/WiFi
 * 2. Zenginleştirme / Yedek: SeferGerceklesme.asmx + DurakDetay_GYY -> Aracın şu an hangi durakta olduğu ve kalan durak sayısı
 */
async function getDurakVarisBilgisi(stop) {
  const [allStops, schedule, officialPassing] = await Promise.all([
    getHatStopSequence(stop.hatKodu),
    getPlannedSchedule(stop.hatKodu),
    fetchOfficialPassingDetail(stop.durakKodu)
  ]);

  const targetStopMeta = allStops.find(s => s.durakKodu === String(stop.durakKodu));
  const targetYon = targetStopMeta ? targetStopMeta.yon : 'G';
  const targetSira = targetStopMeta ? targetStopMeta.sira : null;

  const routeStops = allStops
    .filter(s => s.yon === targetYon)
    .sort((a, b) => a.sira - b.sira);

  const firstStop = routeStops.length > 0 ? routeStops[0] : null;

  // Resmi tarife saatleri
  const istanbulNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const dayOfWeek = istanbulNow.getDay();
  const gunTipi = dayOfWeek === 0 ? 'P' : (dayOfWeek === 6 ? 'C' : 'I');
  const nowHHMM = String(istanbulNow.getHours()).padStart(2, '0') + ':' + String(istanbulNow.getMinutes()).padStart(2, '0');

  const upcomingDepartures = schedule
    .filter(x => x.SYON === targetYon && x.SGUNTIPI === gunTipi && x.DT >= nowHHMM)
    .map(x => x.DT)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);

  // SOAP GPS verisi varsa kapı numarasına göre hangi durakta olduğunu eşleştirmek için çek
  const soapGps = await fetchLiveBusesSOAP(stop.hatKodu);
  const gpsByDoor = {};
  if (soapGps.vehicles && soapGps.vehicles.length > 0 && routeStops.length > 0) {
    for (const v of soapGps.vehicles) {
      const door = String(v.kapino || v.KapiNo || '').trim();
      const yakinKod = String(v.yakinDurakKodu || '').trim();
      const stObj = routeStops.find(s => s.durakKodu === yakinKod);
      if (door && stObj && targetSira && stObj.sira <= targetSira) {
        gpsByDoor[door] = {
          bulunduguDurak: stObj.durakAdi,
          kalanDurak: targetSira - stObj.sira
        };
      }
    }
  }

  // 1. Resmi durak.iett.gov.tr verisi geldiyse:
  if (officialPassing.ok && officialPassing.data) {
    const rawArrivals = officialPassing.data.stopArrivals || officialPassing.data.StopArrivals || [];
    const targetHatUpper = String(stop.hatKodu).trim().toUpperCase();

    // Hedef hatta ait yaklaşan otobüsler
    const matchingLineBuses = [];
    // Aynı durağa yaklaşan diğer hatlar (bilgi zenginliği için)
    const otherLinesAtStop = [];

    for (const item of rawArrivals) {
      const lineCode = String(item.lineCode || item.LineCode || '').trim().toUpperCase();
      const routeText = String(item.lineType || item.LineType || '');
      const doorNum = String(item.doorNumber || item.DoorNumber || '-').trim();
      const minute = parseInt(item.minute ?? item.Minute ?? 0, 10);

      const features = [];
      if ((item.haveAir || item.HaveAir) === 1) features.push('❄️ Klima');
      if ((item.haveUsb || item.HaveUsb) === 1) features.push('🔌 USB');
      if ((item.haveWifi || item.HaveWifi) === 1) features.push('📶 WiFi');
      if ((item.haveAccessibility || item.HaveAccessibility) === 1) features.push('♿ Engelli Uygun');

      const gpsExtra = gpsByDoor[doorNum];

      const busEntry = {
        hatKodu: lineCode,
        kapiNo: doorNum,
        kalanDakika: minute,
        kalanDurak: gpsExtra ? gpsExtra.kalanDurak : null,
        bulunduguDurak: gpsExtra ? gpsExtra.bulunduguDurak : null,
        hedefYon: routeText || stop.hedefYon,
        ozellikler: features,
        kaynak: 'resmi-canli'
      };

      // Tam hat kodu eşleşmesi veya aynı hattın alt varyantı (örn. 19)
      if (lineCode === targetHatUpper || routeText.toUpperCase().startsWith(targetHatUpper + ' ')) {
        matchingLineBuses.push(busEntry);
      } else {
        otherLinesAtStop.push(busEntry);
      }
    }

    matchingLineBuses.sort((a, b) => a.kalanDakika - b.kalanDakika);
    otherLinesAtStop.sort((a, b) => a.kalanDakika - b.kalanDakika);

    return {
      durak: {
        ...stop,
        siraNo: targetSira,
        ilkDurakAdi: firstStop ? firstStop.durakAdi : 'İlk Durak'
      },
      baglantiDurumu: 'resmi-canli',
      otobusler: matchingLineBuses.slice(0, 3),
      digerHatlar: otherLinesAtStop.slice(0, 3),
      ilkDuraktaBekleyenSayisi: 0,
      siradakiKalkislar: upcomingDepartures
    };
  }

  // 2. Eğer durak.iett.gov.tr henüz doğrulanmadıysa ve SOAP GPS aktifse:
  if (soapGps.ok && soapGps.vehicles.length > 0 && routeStops.length > 0 && targetStopMeta) {
    const approachingBuses = [];
    for (const v of soapGps.vehicles) {
      const guzergah = String(v.guzergahkodu || '');
      if (guzergah && !guzergah.includes(`_${targetYon}_`)) continue;

      const yakinKod = String(v.yakinDurakKodu || '').trim();
      const currentStop = routeStops.find(s => s.durakKodu === yakinKod);
      if (!currentStop || currentStop.sira <= 1 || currentStop.sira > targetSira) continue;

      const kalanDurak = targetSira - currentStop.sira;
      const lat = parseFloat(v.enlem || v.Enlem);
      const lng = parseFloat(v.boylam || v.Boylam);
      const distKm = calculateDistanceKm(lat, lng, stop.koordinat.lat, stop.koordinat.lng);
      const kalanDakika = kalanDurak === 0 ? 0 : Math.max(1, Math.round((distKm * 2.5) + (kalanDurak * 0.45)));

      approachingBuses.push({
        hatKodu: stop.hatKodu,
        kapiNo: v.kapino || v.KapiNo || 'İETT',
        kalanDakika,
        kalanDurak,
        bulunduguDurak: currentStop.durakAdi,
        hedefYon: v.yon || stop.hedefYon,
        ozellikler: [],
        kaynak: 'gps-canli'
      });
    }

    approachingBuses.sort((a, b) => a.kalanDakika - b.kalanDakika);

    return {
      durak: {
        ...stop,
        siraNo: targetSira,
        ilkDurakAdi: firstStop ? firstStop.durakAdi : 'İlk Durak'
      },
      baglantiDurumu: 'gps-canli',
      otobusler: approachingBuses.slice(0, 3),
      digerHatlar: [],
      ilkDuraktaBekleyenSayisi: 0,
      siradakiKalkislar: upcomingDepartures
    };
  }

  // 3. Doğrulama bekleniyor durumu
  return {
    durak: {
      ...stop,
      siraNo: targetSira,
      ilkDurakAdi: firstStop ? firstStop.durakAdi : 'İlk Durak'
    },
    baglantiDurumu: cacheStore.captchaState.required ? 'dogrulama-gerekli' : 'beklemede',
    otobusler: [],
    digerHatlar: [],
    ilkDuraktaBekleyenSayisi: 0,
    siradakiKalkislar: upcomingDepartures
  };
}

function getCaptchaState() {
  return cacheStore.captchaState;
}

module.exports = {
  getDurakVarisBilgisi,
  getCaptchaState,
  generateDurakCaptcha,
  submitDurakCaptcha
};
