const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const CACHE_FILE = path.join(__dirname, '..', '.iett_cache.json');
const CACHE_TTL_MS = (config.weather.cacheTtlMinutes || 15) * 60 * 1000;

let memoryCache = {
  timestamp: 0,
  data: null
};

// WMO Hava Durumu Kodları Tablosu
const WMO_CODES = {
  0: { label: 'Açık / Güneşli', icon: '☀️' },
  1: { label: 'Çoğunlukla Açık', icon: '🌤️' },
  2: { label: 'Parçalı Bulutlu', icon: '⛅' },
  3: { label: 'Bulutlu', icon: '☁️' },
  45: { label: 'Sisli', icon: '🌫️' },
  48: { label: 'Kırağılı Sis', icon: '🌫️' },
  51: { label: 'Hafif Çisenti', icon: '🌦️' },
  53: { label: 'Çisenti', icon: '🌦️' },
  55: { label: 'Yoğun Çisenti', icon: '🌧️' },
  61: { label: 'Hafif Yağmurlu', icon: '🌧️' },
  63: { label: 'Yağmurlu', icon: '🌧️' },
  65: { label: 'Kuvvetli Yağmurlu', icon: '🌧️' },
  71: { label: 'Hafif Kar Yağışlı', icon: '🌨️' },
  73: { label: 'Kar Yağışlı', icon: '🌨️' },
  75: { label: 'Yoğun Kar Yağışlı', icon: '❄️' },
  77: { label: 'Dolu / Kar Greni', icon: '🌨️' },
  80: { label: 'Hafif Sağanak', icon: '🌦️' },
  81: { label: 'Sağanak Yağışlı', icon: '🌧️' },
  82: { label: 'Kuvvetli Sağanak', icon: '⛈️' },
  85: { label: 'Kar Sağanağı', icon: '🌨️' },
  86: { label: 'Yoğun Kar Sağanağı', icon: '❄️' },
  95: { label: 'Gök Gürültülü Fırtına', icon: '⛈️' },
  96: { label: 'Dolu ve Gök Gürültüsü', icon: '⛈️' },
  99: { label: 'Kuvvetli Fırtına', icon: '⛈️' }
};

function getWmoInfo(code) {
  return WMO_CODES[code] || { label: 'Bulutlu', icon: '⛅' };
}

function loadDiskCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.weather && parsed.weather.timestamp) {
        memoryCache = parsed.weather;
      }
    }
  } catch (e) {
    // Disk hatasını yut
  }
}

function saveDiskCache() {
  try {
    let base = {};
    if (fs.existsSync(CACHE_FILE)) {
      base = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8') || '{}');
    }
    base.weather = memoryCache;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(base), 'utf-8');
  } catch (e) {
    // Disk yazma hatasını yut
  }
}

loadDiskCache();

function fetchOpenMeteo(lat, lng) {
  return new Promise((resolve, reject) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FIstanbul&forecast_days=1`;

    const req = https.get(url, { timeout: 7000 }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`Hava durumu API hata kodu: ${res.statusCode}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', err => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Hava durumu servisi zaman aşımı'));
    });
  });
}

function buildForecastSummary(raw) {
  if (!raw || !raw.current) return null;

  const current = raw.current;
  const daily = raw.daily || {};
  const hourly = raw.hourly || {};

  const currentWmo = getWmoInfo(current.weather_code);
  const temp = Math.round(current.temperature_2m);
  const feelsLike = Math.round(current.apparent_temperature);
  const humidity = current.relative_humidity_2m;
  const wind = Math.round(current.wind_speed_10m);

  const maxTemp = daily.temperature_2m_max && daily.temperature_2m_max[0] != null ? Math.round(daily.temperature_2m_max[0]) : temp;
  const minTemp = daily.temperature_2m_min && daily.temperature_2m_min[0] != null ? Math.round(daily.temperature_2m_min[0]) : temp;
  const maxRainProb = daily.precipitation_probability_max && daily.precipitation_probability_max[0] != null ? daily.precipitation_probability_max[0] : 0;

  // Günün ilerisi (Önümüzdeki saatlerin tahmini)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const currentHour = now.getHours();

  let futureDesc = '';
  if (currentHour < 15) {
    futureDesc = `Öğleden sonra ${maxTemp}°C civarı, `;
  } else if (currentHour < 19) {
    futureDesc = `Akşam saatlerinde serinleme (${minTemp + 2}°C), `;
  } else {
    futureDesc = `Gece en düşük ${minTemp}°C, `;
  }

  if (maxRainProb > 40) {
    futureDesc += `yağış ihtimali %${maxRainProb}.`;
  } else if (maxRainProb > 15) {
    futureDesc += `hafif yağmur ihtimali var (%${maxRainProb}).`;
  } else {
    futureDesc += 'yağış beklenmiyor.';
  }

  return {
    location: config.weather.locationName || 'Ataşehir',
    temp,
    feelsLike,
    humidity,
    wind,
    condition: currentWmo.label,
    icon: currentWmo.icon,
    maxTemp,
    minTemp,
    maxRainProb,
    summary: futureDesc,
    updatedAt: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  };
}

async function getAtasehirWeather() {
  const now = Date.now();

  if (memoryCache.data && (now - memoryCache.timestamp < CACHE_TTL_MS)) {
    return memoryCache.data;
  }

  try {
    const lat = config.weather.lat || 40.976097;
    const lng = config.weather.lng || 29.139142;
    const raw = await fetchOpenMeteo(lat, lng);
    const summary = buildForecastSummary(raw);

    if (summary) {
      memoryCache = {
        timestamp: now,
        data: summary
      };
      saveDiskCache();
      return summary;
    }
  } catch (err) {
    // Ağ hatası durumunda eski geçerli önbelleği dön
    if (memoryCache.data) {
      return memoryCache.data;
    }
  }

  // Önbellek yoksa güvenli varsayılan değer
  return {
    location: config.weather.locationName || 'Ataşehir',
    temp: 20,
    feelsLike: 18,
    humidity: 60,
    wind: 12,
    condition: 'Açık',
    icon: '☀️',
    maxTemp: 21,
    minTemp: 13,
    maxRainProb: 10,
    summary: 'Gün içinde hava sakin, yağış beklenmiyor.',
    updatedAt: '--:--'
  };
}

module.exports = {
  getAtasehirWeather
};
