// ===============================
// Qibla Direction Web App (app.js)
// ===============================

// 🕋 Kaaba coordinates (fixed)
const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

// UI elements (must exist in index.html)
const compassEl = document.getElementById("compass");
const enableBtn = document.getElementById("enableSensor");
const headingTextEl = document.getElementById("headingText");
const accuracyTextEl = document.getElementById("accuracyText");

// State
let qiblaBearing = null;        // 0..360 (degrees from North)
let lastRotation = 0;           // for smoothing
let started = false;

// ---------- Helpers ----------
function toRadians(deg) {
  return deg * Math.PI / 180;
}

function toDegrees(rad) {
  return rad * 180 / Math.PI;
}

function normalize360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

// Returns shortest signed difference between angles (deg): [-180, 180]
function shortestAngleDiff(target, current) {
  let diff = (target - current + 540) % 360 - 180;
  return diff;
}

// Simple smoothing for rotation (avoids jitter)
function smoothRotation(current, target, factor = 0.15) {
  // Move current toward target by factor, along shortest path
  const diff = shortestAngleDiff(target, current);
  return normalize360(current + diff * factor);
}

// ---------- Qibla formula ----------
// Output: bearing angle in degrees (0..360), where 0 = North
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

// ---------- Orientation reading ----------
function getDeviceHeading(event) {
  // iOS Safari provides true compass heading:
  if (typeof event.webkitCompassHeading === "number") {
    return {
      heading: normalize360(event.webkitCompassHeading),
      accuracy: (typeof event.webkitCompassAccuracy === "number")
        ? `${event.webkitCompassAccuracy.toFixed(0)}°`
        : "iOS"
    };
  }

  // Android/others: alpha is rotation around Z axis (often relative)
  if (typeof event.alpha === "number") {
    return {
      heading: normalize360(360 - event.alpha),
      accuracy: "relative"
    };
  }

  return null;
}

// ---------- Main update ----------
function updateUI(deviceHeading, accuracyLabel) {
  if (qiblaBearing === null) return;

  // Rotation needed so that the "needle" points to Qibla.
  // If your needle is drawn pointing NORTH by default,
  // the angle to rotate = (qiblaBearing - deviceHeading).
  const targetRotation = normalize360(qiblaBearing - deviceHeading);

  // Smooth it a bit
  lastRotation = smoothRotation(lastRotation, targetRotation, 0.18);

  // Rotate the whole compass element
  compassEl.style.transform = `rotate(${lastRotation}deg)`;

  // Display info
  const turn = shortestAngleDiff(qiblaBearing, deviceHeading); // [-180,180]
  const turnText =
    turn === 0 ? "0°" :
    turn > 0 ? `${Math.abs(turn).toFixed(0)}° right` :
               `${Math.abs(turn).toFixed(0)}° left`;

  headingTextEl.textContent =
    `Qibla: ${qiblaBearing.toFixed(0)}° | Heading: ${deviceHeading.toFixed(0)}° | Turn: ${turnText}`;

  accuracyTextEl.textContent = accuracyLabel ?? "--";
}

// ---------- Start flow ----------
async function requestIOSPermissionIfNeeded() {
  // iOS 13+ requires explicit permission request in a user gesture
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const res = await DeviceOrientationEvent.requestPermission();
    if (res !== "granted") {
      throw new Error("Permission denied");
    }
  }
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function startListeningToOrientation() {
  const handler = (e) => {
    const data = getDeviceHeading(e);
    if (!data) return;

    updateUI(data.heading, data.accuracy);
  };

  // Some browsers fire only one of these; safe to listen to both.
  window.addEventListener("deviceorientationabsolute", handler, true);
  window.addEventListener("deviceorientation", handler, true);
}

enableBtn.addEventListener("click", async () => {
  if (started) return; // prevent duplicate listeners
  started = true;

  headingTextEl.textContent = "Getting location…";
  accuracyTextEl.textContent = "--";

  try {
    // iOS permission (must be triggered by button click)
    await requestIOSPermissionIfNeeded();

    // Get user location
    const pos = await getLocation();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    // Calculate Qibla bearing
    qiblaBearing = calculateQiblaBearing(lat, lon);

    headingTextEl.textContent =
      `Location OK. Qibla bearing: ${qiblaBearing.toFixed(0)}°. Move phone in a figure-8 to calibrate.`;

    // Start sensor listening
    startListeningToOrientation();
  } catch (err) {
    started = false;

    if (String(err?.message).toLowerCase().includes("permission")) {
      headingTextEl.textContent =
        "Permission denied. Open this site on HTTPS in Safari/Chrome and allow motion/orientation + location.";
    } else if (err && err.code === 1) {
      headingTextEl.textContent =
        "Location denied. Please allow Location access in browser settings.";
    } else {
      headingTextEl.textContent =
        "Could not start sensors. Ensure HTTPS + allow Location and Motion/Orientation.";
    }

    accuracyTextEl.textContent = "--";
  }
});
