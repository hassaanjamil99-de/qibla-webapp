navigator.geolocation.getCurrentPosition(function(position) {
    let latitude = position.coords.latitude;
    let longitude = position.coords.longitude;
    console.log(`Latitude: ${latitude}, Longitude: ${longitude}`);

    // Kaaba coordinates (Mecca)
    const kaabaLat = 21.4225;
    const kaabaLon = 39.8262;

    const qiblaDirection = calculateQibla(latitude, longitude, kaabaLat, kaabaLon);
    document.getElementById('headingText').textContent = `Heading: ${qiblaDirection}°`;

    document.getElementById('enableSensor').addEventListener('click', function() {
        alert('Sensor enabled. Move phone in a figure-8 to calibrate.');
    });
});

function calculateQibla(lat, lon, kaabaLat, kaabaLon) {
    const deltaLon = toRadians(kaabaLon - lon);
    const lat1 = toRadians(lat);
    const lat2 = toRadians(kaabaLat);

    const qiblaDirection = Math.atan2(Math.sin(deltaLon), Math.cos(lat1) * Math.tan(lat2) - Math.sin(lat1) * Math.cos(deltaLon));

    return (toDegrees(qiblaDirection) + 360) % 360;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function toDegrees(radians) {
    return radians * (180 / Math.PI);
}
