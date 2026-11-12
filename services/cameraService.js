const config = require('../config');

// Bellek içi canlı kamera oturumu
let cameraState = {
  active: false,
  lastFrameBuffer: null,
  lastFrameMime: 'image/jpeg',
  lastFrameTimestamp: 0,
  subscribers: new Set() // MJPEG stream aboneleri
};

/**
 * Tabletten gelen yeni video karesini kabul eder
 */
function updateFrame(buffer, mimeType = 'image/jpeg') {
  if (!buffer || buffer.length === 0) return false;

  cameraState.lastFrameBuffer = buffer;
  cameraState.lastFrameMime = mimeType;
  cameraState.lastFrameTimestamp = Date.now();
  cameraState.active = true;

  // Aktif MJPEG abonelerine bu kareyi ilet
  notifySubscribers(buffer);
  return true;
}

/**
 * Kameranın durumunu günceller (Tablet açtı veya kapattı)
 */
function setCameraActive(isActive) {
  cameraState.active = Boolean(isActive);
  if (!isActive) {
    cameraState.lastFrameBuffer = null;
    cameraState.lastFrameTimestamp = 0;
  }
}

function getCameraStatus() {
  const isFresh = cameraState.active && (Date.now() - cameraState.lastFrameTimestamp < 15000);
  return {
    enabled: config.camera.enabled !== false,
    active: isFresh,
    lastSeenSecondsAgo: cameraState.lastFrameTimestamp ? Math.round((Date.now() - cameraState.lastFrameTimestamp) / 1000) : null
  };
}

function getLastFrame() {
  return {
    buffer: cameraState.lastFrameBuffer,
    mimeType: cameraState.lastFrameMime,
    timestamp: cameraState.lastFrameTimestamp
  };
}

function validatePin(pin) {
  const configured = String(config.camera.pin || '1923').trim();
  return String(pin || '').trim() === configured;
}

/**
 * MJPEG HTTP Canlı Akışı için Abone Yönetimi
 */
function addSubscriber(res) {
  cameraState.subscribers.add(res);
  res.on('close', () => {
    cameraState.subscribers.delete(res);
  });
}

function notifySubscribers(frameBuffer) {
  if (cameraState.subscribers.size === 0) return;

  const boundary = '--myboundary\r\n';
  const header = `Content-Type: image/jpeg\r\nContent-Length: ${frameBuffer.length}\r\n\r\n`;

  for (const res of cameraState.subscribers) {
    try {
      res.write(boundary + header);
      res.write(frameBuffer);
      res.write('\r\n');
    } catch (e) {
      cameraState.subscribers.delete(res);
    }
  }
}

module.exports = {
  updateFrame,
  setCameraActive,
  getCameraStatus,
  getLastFrame,
  validatePin,
  addSubscriber
};
