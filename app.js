// ===============================
// Qibla Direction Web App (FINAL)
// ===============================

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

// UI
const compassEl = document.getElementById("compass");
const enableBtn = document.getElementById("enableSensor");
const headingTextEl = document.getElementById("headingText");
const accuracyTextEl = document.getElementById("accuracyText");
const qiblaToastEl = document.getElementById("qiblaToast");
const tickSoundEl = document.getElementById("tickSound");

// Add center dot (nice look)
(function ensureDot(){
  if (!compassEl.querySelector(".dot")) {
    const dot = document.createElement("div");
    dot.className = "dot";
    compassEl.appendChild(dot);
  }
})();

// State
let qiblaBearing = null;
let lastRotation = 0;
let started = false;

// Alignment state
let wasAligned = false;
let lastAlignedAt = 0;
const ALIGN_TOLERANCE_DEG = 5;   // 3 = stricter, 7 = easier
const ALIGN_COOLDOWN_MS = 4000;  // prevent spam

// Map state
let map, kaabaMarker, userMarker, qiblaLine;

// ---------------- Helpers ----------------
function toRadians(deg) { return deg * Math.PI / 180; }
function toDegrees(rad) { return rad * 180 / Math.PI; }

function normalize360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

function shortestAngleDiff(target, current) {
  return (target - current + 540) % 360 - 180;
}

function smoothRotation(current, target, factor = 0.18) {
  const diff = shortestAngleDiff(target, current);
  return normalize360(current + diff * factor);
}

function calculateQiblaBearing(userLat, userLon) {
  const lat1 = toRadians(userLat);
  const lat2 = toRadians(KAABA_LAT);
  const deltaLon = toRadians(KAABA_LON - userLon);

  const angle = Math.atan2(
    Math.sin(deltaLon),
    Math.cos(lat1) * Math.tan(lat2) - Math.sin(lat1) * Math.cos(deltaLon)
  );

  return normalize360(toDegrees(angle));
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function playTick() {
  if (!tickSoundEl) return;
  tickSoundEl.currentTime = 0;
  tickSoundEl.play().catch(() => {});
}

// ---------------- Orientation ----------------
function getDeviceHeading(event) {
  // iOS Safari true compass heading:
  if (typeof event.webkitCompassHeading === "number") {
    return {
      heading: normalize360(event.webkitCompassHeading),
      accuracy: (typeof event.webkitCompassAccuracy === "number")
        ? `${event.webkitCompassAccuracy.toFixed(0)}°`
        : "iOS"
    };
  }

  // Android/others (relative)
  if (typeof event.alpha === "number") {
    return {
      heading: normalize360(360 - event.alpha),
      accuracy: "relative"
    };
  }

  return null;
}

// ---------------- UI update ----------------
function updateCompass(deviceHeading) {
  if (qiblaBearing === null) return;

  const targetRotation = normalize360(qiblaBearing - deviceHeading);
  lastRotation = smoothRotation(lastRotation, targetRotation, 0.18);
  compassEl.style.transform = `rotate(${lastRotation}deg)`;
}

function setText(deviceHeading, accuracyLabel, distanceKm) {
  if (qiblaBearing === null) return;

  const turn = shortestAngleDiff(qiblaBearing, deviceHeading);
  const turnAbs = Math.abs(turn);

  const turnText =
    turnAbs < 0.5 ? "0°" :
    turn > 0 ? `${turnAbs.toFixed(0)}° right` :
               `${turnAbs.toFixed(0)}° left`;

  headingTextEl.textContent =
    `Qibla: ${qiblaBearing.toFixed(0)}° | Heading: ${deviceHeading.toFixed(0)}° | Turn: ${turnText}`;

  if (distanceKm != null) {
    accuracyTextEl.textContent =
      `Distance to Kaaba: ${distanceKm.toFixed(0)} km | Accuracy: ${accuracyLabel ?? "--"}`;
  } else {
    accuracyTextEl.textContent = `Accuracy: ${accuracyLabel ?? "--"}`;
  }

  // ✅ Alignment detection (ring + toast + tick)
  const now = Date.now();
  const aligned = turnAbs <= ALIGN_TOLERANCE_DEG;

  if (aligned) {
    compassEl.classList.add("aligned");
    qiblaToastEl?.classList.add("show");

    if (!wasAligned && (now - lastAlignedAt) > ALIGN_COOLDOWN_MS) {
      lastAlignedAt = now;

      if (navigator.vibrate) navigator.vibrate(80);
      playTick();
    }
  } else {
    compassEl.classList.remove("aligned");
    qiblaToastEl?.classList.remove("show");
  }

  wasAligned = aligned;
}

// ---------------- Permissions + Location ----------------
async function requestIOSPermissionIfNeeded() {
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const res = await DeviceOrientationEvent.requestPermission();
    if (res !== "granted") throw new Error("Permission denied");
  }
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// ---------------- Map ----------------
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([KAABA_LAT, KAABA_LON], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  kaabaMarker = L.marker([KAABA_LAT, KAABA_LON]).addTo(map);
  kaabaMarker.bindPopup("<b>Kaaba 🕋</b>");
}

function updateMap(userLat, userLon) {
  if (!map) return;

  if (userMarker) userMarker.remove();
  userMarker = L.marker([userLat, userLon]).addTo(map);
  userMarker.bindPopup("<b>Your Location</b>");

  if (qiblaLine) qiblaLine.remove();
  qiblaLine = L.polyline(
    [[userLat, userLon], [KAABA_LAT, KAABA_LON]],
    { color: "#ff3b3b", weight: 3 }
  ).addTo(map);

  const bounds = L.latLngBounds([userLat, userLon], [KAABA_LAT, KAABA_LON]);
  map.fitBounds(bounds, { padding: [30, 30] });
}

// ---------------- Start ----------------
initMap();

function startListeningToOrientation(distanceKm) {
  const handler = (e) => {
    const data = getDeviceHeading(e);
    if (!data) return;

    updateCompass(data.heading);
    setText(data.heading, data.accuracy, distanceKm);
  };

  window.addEventListener("deviceorientationabsolute", handler, true);
  window.addEventListener("deviceorientation", handler, true);
}

enableBtn.addEventListener("click", async () => {
  if (started) return;
  started = true;

  headingTextEl.textContent = "Getting location…";
  accuracyTextEl.textContent = "Waiting for permissions…";

  try {
    await requestIOSPermissionIfNeeded();

    const pos = await getLocation();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    qiblaBearing = calculateQiblaBearing(lat, lon);
    const distanceKm = haversineDistance(lat, lon, KAABA_LAT, KAABA_LON);

    updateMap(lat, lon);

    headingTextEl.textContent =
      `Location OK. Qibla bearing: ${qiblaBearing.toFixed(0)}°. Move phone in a figure-8 to calibrate.`;

    accuracyTextEl.textContent =
      `Distance to Kaaba: ${distanceKm.toFixed(0)} km | Accuracy: --`;

    startListeningToOrientation(distanceKm);

  } catch (err) {
    started = false;

    const msg = String(err?.message || "").toLowerCase();

    if (msg.includes("permission")) {
      headingTextEl.textContent =
        "Permission denied. Please allow Motion/Orientation and Location in Safari.";
    } else if (err && err.code === 1) {
      headingTextEl.textContent =
        "Location denied. Please allow Location access in browser settings.";
    } else {
      headingTextEl.textContent =
        "Could not start. Ensure HTTPS + allow Location and Motion/Orientation.";
    }

    accuracyTextEl.textContent = "--";
  }
});
