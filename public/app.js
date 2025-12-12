// Global State
let map;
let marker;
let polyline;
let planeIcon;
let currentPlaneId = null;
let flightData = [];
let isPlaying = false;
let playbackSpeed = 1;
let currentIndex = 0;
let animationFrameId;

// HTML Elements
const els = {
    planeList: document.getElementById('plane-list'),
    valAlt: document.getElementById('val-alt'),
    valSpeed: document.getElementById('val-speed'),
    valHeading: document.getElementById('val-heading'),
    valBatt: document.getElementById('val-batt'),
    valLatLon: document.getElementById('val-latlon'),
    valTime: document.getElementById('val-time'),
    timeline: document.getElementById('timeline'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    frameIdx: document.getElementById('frame-idx'),
    frameTotal: document.getElementById('frame-total'),
    activeLabel: document.getElementById('active-plane-label'),
    chkFullPath: document.getElementById('chk-full-path')
};

const TRAIL_LENGTH = 50; // Number of points to keep in tail

// Initialize Map
function initMap() {
    // Default to approximate location from logs until data loads
    map = L.map('map').setView([40.20, 25.88], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.instagram.com/metehanysv/">metereis</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Custom Icon (Red Plane)
    planeIcon = L.divIcon({
        html: '<i class="ph ph-airplane-tilt" style="font-size: 24px; color: #ff0000; transform: rotate(0deg); display:block; filter: drop-shadow(0 0 5px rgba(255,0,0,0.5));"></i>',
        className: 'plane-marker-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

// Fetch ID List
async function fetchIds() {
    try {
        const res = await fetch('/api/ids');
        const ids = await res.json();
        renderIdList(ids);
    } catch (err) {
        console.error("Failed to fetch IDs:", err);
    }
}

function renderIdList(ids) {
    els.planeList.innerHTML = '';
    ids.forEach(id => {
        const item = document.createElement('div');
        item.className = 'id-item';
        item.innerHTML = `
            <span>Plane #${id}</span>
            <i class="ph ph-airplane-tilt plane-icon"></i>
        `;
        item.onclick = () => {
            if (isCompareMode) {
                loadSecondaryPlane(id, item);
            } else {
                loadPlaneData(id, item);
            }
        };
        els.planeList.appendChild(item);
    });
}

// Load Data for selected Plane
async function loadPlaneData(id, domItem) {
    if (currentPlaneId === id) return;

    // UI Updates
    document.querySelectorAll('.id-item').forEach(el => el.classList.remove('active'));
    domItem.classList.add('active');

    els.activeLabel.innerText = `PLANE #${id}`;

    currentPlaneId = id;
    pause();

    try {
        const res = await fetch(`/api/data/${id}`);
        const data = await res.json();

        // Pre-process timestamps?
        // Data format: { lat, lon, alt, heading, ... timestamp: "YYYY-MM-DD HH:MM:SS,ms" }
        // We will just use index-based playback for simplicity and robustness first

        flightData = data;
        currentIndex = 0;

        // Reset Timeline
        els.timeline.max = flightData.length - 1;
        els.timeline.value = 0;
        els.frameTotal.innerText = flightData.length;

        // Init Map Visuals
        if (polyline) map.removeLayer(polyline);
        if (marker) map.removeLayer(marker);

        // Create path layer (initialized empty/full handled in updateFrame)
        polyline = L.polyline([], { // Start empty
            color: '#00f2ff', // Cyan/Blue path
            weight: 3,
            opacity: 0.8
        }).addTo(map);

        // Fit bounds
        const allPoints = flightData.map(d => [d.lat, d.lon]);
        if (allPoints.length > 0) {
            map.fitBounds(L.polyline(allPoints).getBounds());
            // Create Marker
            marker = L.marker(allPoints[0], { icon: planeIcon }).addTo(map);
        }

        // Render first frame
        updateFrame(0);

    } catch (err) {
        console.error("Failed to load plane data:", err);
    }
}

// State to track rendering optimization
let isFullPathRendered = false;

// Update UI and Map for a specific frame index
function updateFrame(index) {
    if (!flightData[index]) return;

    const d = flightData[index];
    const latlng = [d.lat, d.lon];

    // Update Marker
    marker.setLatLng(latlng);

    // Update Marker
    marker.setLatLng(latlng);

    // Update Trail/Path
    if (els.chkFullPath.checked) {
        // Optimization: Only render full path once if not already rendered
        if (!isFullPathRendered) {
            const fullPath = flightData.map(d => [d.lat, d.lon]);
            polyline.setLatLngs(fullPath);
            isFullPathRendered = true;
        }
    } else {
        // Show Trail (Last N points)
        isFullPathRendered = false; // Reset optimization flag
        const start = Math.max(0, index - TRAIL_LENGTH);
        const trailData = flightData.slice(start, index + 1);
        const trailLatLngs = trailData.map(d => [d.lat, d.lon]);
        polyline.setLatLngs(trailLatLngs);
    }

    // Rotate Icon (Need to manipulate the HTML inside the divIcon)
    // Note: This is a hacky way to rotate divIcons. Better to use a library or CSS rotate.
    // We'll update the innerHTML with new rotation
    const rotation = d.heading - 45; // -45 because the icon itself might be tilted. Adjust as needed.
    // Actually standard plane icon is usually 45deg or 0deg. 
    // Let's assume icon points UP (0deg) by default? Phosphor airplane-tilt points NE (45deg).
    // So if heading is 90 (East), we need to rotate 45 deg.
    // Heading 0 (North) -> Rotate -45 deg.
    const cssRotation = d.heading - 45;

    const iconEl = marker.getElement();
    if (iconEl) {
        const iTag = iconEl.querySelector('i');
        if (iTag) {
            iTag.style.transform = `rotate(${cssRotation}deg)`;
        }
    }

    // Update HUD
    els.valAlt.innerText = d.alt != null ? d.alt.toFixed(1) : '--';
    els.valSpeed.innerText = d.speed != null ? d.speed.toFixed(1) : '--';
    els.valHeading.innerText = d.heading != null ? d.heading.toFixed(0) : '--';
    els.valBatt.innerText = d.battery != null ? d.battery : '--';
    els.valLatLon.innerText = `${d.lat.toFixed(5)} / ${d.lon.toFixed(5)}`;
    els.valTime.innerText = d.timestamp.split(' ')[1];

    els.frameIdx.innerText = index;
    els.timeline.value = index;

    // --- SECONDARY PLANE SYNC ---
    if (secondaryPlaneId && flightDataSec.length > 0) {
        // Simple approximate sync by formatted string match is crude but works if samplings align
        // Better: Parse and find closest.
        // Optimization: Assume sorted. Find closest index.
        // For now, let's just find exact match or closest.
        const targetTime = d.timestamp;

        // Find closest point in flightDataSec
        const secIndex = flightDataSec.findIndex(s => s.timestamp === targetTime);
        const bestSec = flightDataSec[secIndex];

        // If exact match not found, what to do?
        // Maybe log files are different rate?
        // Let's update HUD if found

        if (bestSec) {
            const secLL = [bestSec.lat, bestSec.lon];
            markerSec.setLatLng(secLL);

            // Update Sec HUD
            document.getElementById('sec-alt').innerText = bestSec.alt.toFixed(1);
            document.getElementById('sec-speed').innerText = bestSec.speed.toFixed(1);

            // Calc Distance
            const dist = map.distance(latlng, secLL);
            document.getElementById('sec-dist').innerText = dist.toFixed(0) + ' m';

            // Update Sec Path (Trail)
            if (polylineSec && document.getElementById('chk-sec-path').checked) {
                const start = Math.max(0, secIndex - TRAIL_LENGTH);
                const trailData = flightDataSec.slice(start, secIndex + 1);
                const trailLatLngs = trailData.map(d => [d.lat, d.lon]);
                polylineSec.setLatLngs(trailLatLngs);
            }

            // Rotate Sec Icon
            const rotSec = bestSec.heading - 45;
            const iconElSec = markerSec.getElement();
            if (iconElSec) {
                const iTag = iconElSec.querySelector('i');
                if (iTag) iTag.style.transform = `rotate(${rotSec}deg)`;
            }
        } else {
            document.getElementById('sec-alt').innerText = '--';
            document.getElementById('sec-speed').innerText = '--';
        }
    }
}

// Playback Logic
function play() {
    if (isPlaying) return;
    isPlaying = true;
    els.iconPlay.classList.add('hidden');
    els.iconPause.classList.remove('hidden');

    lastTime = performance.now();
    accumTime = 0;

    // Use a wrapper to ensure timestamp is valid
    animationFrameId = requestAnimationFrame((ts) => loop(ts));
}

function pause() {
    isPlaying = false;
    els.iconPlay.classList.remove('hidden');
    els.iconPause.classList.add('hidden');
    cancelAnimationFrame(animationFrameId);
}

function togglePlay() {
    if (isPlaying) pause();
    else play();
}

let lastTime = 0;
let accumTime = 0;

function loop(timestamp) {
    if (!isPlaying) return;

    // Throttling to simulate speed
    // Assumption: Data is roughly 10-50Hz. 
    // Let's just advance X frames per animation frame based on speed

    // Simple approach: 1 frame per tick * speed
    // If speed is 1x, we update 1 data point per requestAnimationFrame?
    // 60fps * 1 = 60 data points per second.
    // Real log seems to be ~4 points per second (250ms gap). 
    // So 1x speed should be much slower than 60fps.
    // We need a timer.

    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    // Target: 10 data points per second (approx) for 1x?
    // Let's trust the timestamp diffs normally, but here we ignore real timestamps for simplicity unless requested.
    // Let's say 1x = 10 samples/sec.
    const samplesPerSecond = 10 * playbackSpeed;
    const msPerSample = 1000 / samplesPerSecond;

    accumTime += dt;

    if (accumTime > msPerSample) {
        // Advance frame
        const framesToAdvance = Math.floor(accumTime / msPerSample);
        accumTime -= framesToAdvance * msPerSample;

        currentIndex += framesToAdvance;

        if (currentIndex >= flightData.length) {
            currentIndex = 0; // Loop or stop? Let's loop
            // or pause
            // pause();
            // currentIndex = flightData.length - 1;
        }

        updateFrame(currentIndex);
    }

    // Auto follow?
    // map.panTo(marker.getLatLng()); // Can get dizzying. Maybe optional.

    animationFrameId = requestAnimationFrame(loop);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchIds();

    els.btnPlayPause.addEventListener('click', togglePlay);

    els.timeline.addEventListener('input', (e) => {
        pause(); // Pause while scrubbing
        currentIndex = parseInt(e.target.value);
        updateFrame(currentIndex);
    });

    document.querySelectorAll('.btn-icon[data-speed]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-icon').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            playbackSpeed = parseFloat(btn.dataset.speed);
        });
    });

    // Search Filter
    document.getElementById('id-filter').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.id-item').forEach(item => {
            const text = item.innerText.toLowerCase();
            item.style.display = text.includes(term) ? 'flex' : 'none';
        });
    });

    // Checkbox Listener
    if (els.chkFullPath) {
        els.chkFullPath.addEventListener('change', () => {
            // Force update regardless of play state
            isFullPathRendered = false; // Force re-render logic
            if (flightData && flightData.length > 0) {
                updateFrame(currentIndex);
            }
        });
    }

    // Compare Mode Toggle
    const btnCompare = document.getElementById('btn-compare-mode');
    if (btnCompare) {
        btnCompare.addEventListener('click', () => {
            isCompareMode = !isCompareMode;
            btnCompare.classList.toggle('active', isCompareMode);

            if (!isCompareMode) {
                // Disable mode: clear secondary
                secondaryPlaneId = null;
                clearSecondaryVisuals();
                document.getElementById('hud-secondary').classList.add('hidden');
            }
        });
    }

    initSecondaryVisuals();

    // Sec Path Checkbox
    const chkSecPath = document.getElementById('chk-sec-path');
    if (chkSecPath) {
        chkSecPath.addEventListener('change', () => {
            if (polylineSec) {
                if (chkSecPath.checked) {
                    polylineSec.addTo(map);
                } else {
                    polylineSec.remove();
                }
            }
        });
    }
});

/* Compare Mode Logic */
let isCompareMode = false;
let secondaryPlaneId = null;
let flightDataSec = [];
let polylineSec;
let markerSec;
let planeIconSec;

function initSecondaryVisuals() {
    // Custom Icon (Navy Plane)
    planeIconSec = L.divIcon({
        html: '<i class="ph ph-airplane-tilt" style="font-size: 24px; color: #000080; transform: rotate(0deg); display:block; filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.8));"></i>',
        className: 'plane-marker-icon-sec',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

function clearSecondaryVisuals() {
    if (polylineSec) map.removeLayer(polylineSec);
    if (markerSec) map.removeLayer(markerSec);
    flightDataSec = [];
    document.querySelectorAll('.id-item').forEach(el => el.classList.remove('active-sec'));
}

async function loadSecondaryPlane(id, domItem) {
    if (secondaryPlaneId === id) return; // Already selected
    secondaryPlaneId = id;

    // UI Updates
    document.querySelectorAll('.id-item').forEach(el => el.classList.remove('active-sec'));
    domItem.classList.add('active-sec');
    document.getElementById('hud-secondary').classList.remove('hidden');
    document.getElementById('sec-plane-label').innerText = `PLANE #${id}`;

    try {
        const res = await fetch(`/api/data/${id}`);
        const data = await res.json();
        flightDataSec = data;

        // Visuals
        if (polylineSec) map.removeLayer(polylineSec);
        if (markerSec) map.removeLayer(markerSec);

        // Path (Green) - Initialize empty for trail
        polylineSec = L.polyline([], {
            color: '#00ff00',
            weight: 3,
            opacity: 0.8,
            dashArray: '5, 10' // Dashed for secondary
        });

        // Only add if checked
        if (document.getElementById('chk-sec-path') && document.getElementById('chk-sec-path').checked) {
            polylineSec.addTo(map);
        }

        if (flightDataSec.length > 0) {
            const startPt = [flightDataSec[0].lat, flightDataSec[0].lon];
            markerSec = L.marker(startPt, { icon: planeIconSec }).addTo(map);

            // Zoom to include both? Optional.
        }

        // Immediate update to sync with current primary time
        updateFrame(currentIndex);

    } catch (err) {
        console.error("Failed to load secondary:", err);
    }
}
