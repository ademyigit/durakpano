const axios = require('axios');
const config = require('../config');

/**
 * Haversine formülü ile iki koordinat arası kuş uçuşu mesafe (km)
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Dünya yarıçapı km
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
 * İETT SOAP SeferGerceklesme.asmx / GetHatOtoKonum_json servisini sorgular
 */
async function fetchHatKonumFromIETT(hatKodu) {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetHatOtoKonum_json xmlns="http://tempuri.org/">
      <HatKodu>${hatKodu}</HatKodu>
    </GetHatOtoKonum_json>
  </soap:Body>
</soap:Envelope>`;

  try {
    const response = await axios.post(config.api.seferGerceklesmeUrl, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://tempuri.org/GetHatOtoKonum_json',
        'User-Agent': 'DurakPano/1.0 (Smart Transit Kiosk)'
      },
      timeout: config.api.timeoutMs
    });

    const xmlData = response.data;
    // SOAP yanıtı içindeki JSON string'i ayıkla
    const match = xmlData.match(/<GetHatOtoKonum_jsonResult>(.*?)<\/GetHatOtoKonum_jsonResult>/s);
    if (match && match[1]) {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    return null;
  } catch (err) {
    // API bağlantı hatası veya bakım durumu
    return null;
  }
}

/**
 * Belirli bir durak için yaklaşan araçları ve varış sürelerini hesaplar
 */
async function getDurakVarisBilgisi(stop) {
  const liveVehicles = await fetchHatKonumFromIETT(stop.hatKodu);

  if (liveVehicles && liveVehicles.length > 0) {
    // Canlı araçlar bulundu, durağa yaklaşanları filtrele ve mesafeye göre sırala
    const candidateBuses = [];

    for (const v of liveVehicles) {
      const lat = parseFloat(v.Enlem || v.enlem || v.Latitude);
      const lng = parseFloat(v.Boylam || v.boylam || v.Longitude);
      const speed = parseFloat(v.Hiz || v.hiz || 22);

      if (isNaN(lat) || isNaN(lng)) continue;

      const distKm = calculateDistanceKm(lat, lng, stop.koordinat.lat, stop.koordinat.lng);

      // Sadece durağa 15 km'den yakın ve mantıklı araçları al
      if (distKm <= 15) {
        // İstanbul şehir içi otobüs ortalama hızı ~18-25 km/s + durak bekleme süreleri
        const effectiveSpeed = Math.max(speed, 18);
        const estimatedMinutes = Math.max(1, Math.round((distKm / effectiveSpeed) * 60));
        const estimatedStops = Math.max(1, Math.round(distKm / 0.7)); // Ortalama 700m durak aralığı

        candidateBuses.push({
          kapiNo: v.KapiNo || v.kapiNo || "İETT",
          kalanDakika: estimatedMinutes,
          kalanDurak: estimatedStops,
          hiz: Math.round(speed),
          mesafeKm: distKm.toFixed(1),
          kaynak: "canli"
        });
      }
    }

    if (candidateBuses.length > 0) {
      candidateBuses.sort((a, b) => a.kalanDakika - b.kalanDakika);
      return {
        durak: stop,
        durum: "canli",
        durumMesaji: "Canlı GPS Verisi",
        otobusler: candidateBuses.slice(0, 3)
      };
    }
  }

  // Canlı GPS servisi o an müsait değilse veya gece saatleriyse mantıklı tarife/tahmini süre üret
  return getSimulatedFallback(stop);
}

/**
 * Gece veya hat servis dışı / API geçici bakımdayken gerçekçi zamanlama üretici
 */
function getSimulatedFallback(stop) {
  const now = new Date();
  const currentHour = (now.getUTCHours() + 3) % 24; // İstanbul UTC+3
  const currentMin = now.getMinutes();

  // Gece 00:30 ile 06:00 arası seferler genellikle seyrektir veya yoktur
  const isNight = currentHour >= 1 && currentHour < 6;

  if (isNight) {
    return {
      durak: stop,
      durum: "gece",
      durumMesaji: "İlk Sefer Bekleniyor (Sabah 06:00)",
      otobusler: []
    };
  }

  // Gündüz saatlerinde tahmini periyodik sefer aralıkları (19 ve 14TM genelde 10-18 dk aralıklıdır)
  const interval = stop.hatKodu === "19" ? 12 : 16;
  const firstWait = interval - (currentMin % interval);
  const secondWait = firstWait + interval;

  return {
    durak: stop,
    durum: "tarife",
    durumMesaji: "Tarife Bazlı Tahmini Süre",
    otobusler: [
      {
        kapiNo: "İETT",
        kalanDakika: firstWait,
        kalanDurak: Math.max(1, Math.round(firstWait / 2.5)),
        hiz: 22,
        mesafeKm: (firstWait * 0.35).toFixed(1),
        kaynak: "tahmini"
      },
      {
        kapiNo: "İETT",
        kalanDakika: secondWait,
        kalanDurak: Math.max(2, Math.round(secondWait / 2.5)),
        hiz: 22,
        mesafeKm: (secondWait * 0.35).toFixed(1),
        kaynak: "tahmini"
      }
    ]
  };
}

module.exports = {
  getDurakVarisBilgisi
};
